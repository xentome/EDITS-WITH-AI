"""MAX EDITOR: la app. Un servidor local (aiohttp) que enseña la ventana del nodo «Prompt del edit» a pantalla completa, sin
el lienzo de ComfyUI, y genera el video con el SDK de Comfy (generar.py). Plano: ../planos/fases/6 La app MAX EDITOR.md.
  /                          la app (web/index.html: cabecera, Generar, proyectos)
  /edit_prompt_llm/web/*     los archivos de ../web (la ventana del nodo, tal cual, sin copiarlos)
  /edit_prompt_llm/<acción>  rutas.ACCIONES, en el trabajador (trabajador.py, con el Python de ComfyUI)
  /view, /upload/image, /minimax_h3/*, /max_editor/preview   reenviados a ComfyUI (el preview: vista_previa.py del nodo)
  /app/*                     plantilla, proyectos, generar, trabajo, salidas, videos, salud
  /app/cola, /app/cola/<id>/<acción>, /app/cola/limpiar, /app/cola/pausar   la cola de trabajos (cola.py)
  /app/retocar, /app/retocar_mascara, /app/video_info, /app/video   Retocar (retocar.py): un tramo con la zona tapada, rehecha por H3
  /app/edicion/<proyecto>, /app/edicion_audios, /app/edicion_de_fuera, /app/edicion_subir, /app/edicion_exportar   Edición (edicion.py): juntar clips
Arranque: app/arrancar.sh (o app/.venv/bin/python app/servidor.py)  →  http://127.0.0.1:8300
Configuración: config.json, encima config.local.json (no va a git) y encima las variables MAX_EDITOR_<CLAVE>."""
import asyncio
import importlib
import itertools
import json
import os
import re
import subprocess
import sys
import time
import types
import urllib.parse

from aiohttp import ClientSession, ClientTimeout, web

APP = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(APP)
WEB_NODO = os.path.join(REPO, "web")
WEB_APP = os.path.join(APP, "web")
PROYECTOS = os.path.join(APP, "proyectos")
SALIDAS = os.path.join(APP, "salidas")
PLANTILLA = os.path.join(APP, "plantillas", "edit_h3.api.json")

DEFECTO = {"comfyui_dir": "~/comfy/ComfyUI", "comfyui_url": "http://127.0.0.1:8188", "proxy_url": "http://127.0.0.1:8199",
           "puerto": 8300, "host": "127.0.0.1", "llm_url": "http://127.0.0.1:8080", "python_comfyui": "", "liberar_gpu": True,
           "mcp_puerto": 8301}


def leer_config():
    c = dict(DEFECTO)
    for nombre in ("config.json", "config.local.json"):
        try:
            with open(os.path.join(APP, nombre), encoding="utf-8") as fh:
                c.update(json.load(fh) or {})
        except (OSError, ValueError):
            pass
    for k in DEFECTO:
        v = os.environ.get("MAX_EDITOR_" + k.upper())
        if v is not None:
            c[k] = type(DEFECTO[k])(v) if not isinstance(DEFECTO[k], bool) else v.lower() not in ("0", "false", "no", "")
    c["comfyui_dir"] = os.path.abspath(os.path.expanduser(c["comfyui_dir"]))
    for k in ("comfyui_url", "proxy_url", "llm_url"):
        c[k] = c[k].rstrip("/")
    return c


CONFIG = leer_config()

# los textos (i18n.py del nodo, solo usa la biblioteca estándar), sin ejecutar el __init__.py del nodo
_paquete = types.ModuleType(os.path.basename(REPO))
_paquete.__path__ = [REPO]
sys.modules.setdefault(_paquete.__name__, _paquete)
i18n = importlib.import_module(_paquete.__name__ + ".i18n")
sys.path.insert(0, APP)
import cola  # noqa: E402  (la cola de trabajos; su hilo arranca en al_empezar)


def t(clave, peticion, **datos):
    return i18n.t(clave, i18n.idioma_de(peticion.query.get("idioma") or "es"), **datos)


def error(clave, peticion, estado=400, **datos):
    return web.json_response({"error": t(clave, peticion, **datos), "clave": clave}, status=estado)


# ------------------------------------------------------------------ el trabajador (las acciones del editor)
def python_comfyui():
    """El Python con el que corre ComfyUI (tiene numpy, Pillow y librosa). Si config no lo dice, se busca."""
    candidatos = [CONFIG["python_comfyui"]] if CONFIG["python_comfyui"] else []
    d = CONFIG["comfyui_dir"]
    candidatos += [os.path.join(d, x, "bin", "python") for x in (".venv", "venv")]
    # Windows: un venv (Scripts\python.exe) o el ComfyUI portable (python_embeded junto a la carpeta ComfyUI)
    candidatos += [os.path.join(d, x, "Scripts", "python.exe") for x in (".venv", "venv")]
    candidatos += [os.path.join(os.path.dirname(d), "python_embeded", "python.exe")]
    candidatos += [os.path.expanduser("~/ComfyUI-CLI/.venv/bin/python"), os.path.join(os.path.dirname(d), ".venv", "bin", "python")]
    for p in candidatos:
        p = os.path.expanduser(p)
        if os.path.isfile(p):
            return p
    return sys.executable


class Trabajador:
    """Un proceso aparte, siempre vivo, que hace las acciones; si se cae, se vuelve a arrancar en la siguiente llamada."""

    def __init__(self):
        self.proc, self.esperando, self.ids, self.listo = None, {}, itertools.count(1), None
        self.cerrojo = asyncio.Lock()

    async def arrancar(self):
        async with self.cerrojo:
            if self.proc and self.proc.returncode is None:
                return
            env = {**os.environ, "MAX_EDITOR_COMFYUI_DIR": CONFIG["comfyui_dir"], "MAX_EDITOR_COMFYUI_URL": CONFIG["comfyui_url"],
                   "MAX_EDITOR_LLM_URL": CONFIG["llm_url"], "MAX_EDITOR_LIBERAR_GPU": "1" if CONFIG["liberar_gpu"] else "0",
                   "PYTHONUNBUFFERED": "1"}
            self.proc = await asyncio.create_subprocess_exec(
                python_comfyui(), os.path.join(APP, "trabajador.py"), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=None, env=env, limit=64 * 2 ** 20)          # el tramo en WAV (base64) puede pesar varios MB
            self.listo = asyncio.get_running_loop().create_future()
            asyncio.create_task(self.leer(self.proc))
        await asyncio.wait_for(asyncio.shield(self.listo), 120)

    async def leer(self, proc):
        while True:
            linea = await proc.stdout.readline()
            if not linea:
                break
            r = json.loads(linea)
            if r.get("id") == 0:
                print(f"[MAX EDITOR] trabajador listo (Python {r['ok']['python']})", flush=True)
                if not self.listo.done():
                    self.listo.set_result(True)
                continue
            f = self.esperando.pop(r.get("id"), None)
            if f and not f.done():
                f.set_result(r)
        await proc.wait()
        print(f"[MAX EDITOR] el trabajador terminó (código {proc.returncode})", flush=True)
        for f in self.esperando.values():
            if not f.done():
                f.set_result({"error": "worker", "clave": "app.error.trabajador"})
        self.esperando.clear()
        if not self.listo.done():
            self.listo.set_result(False)

    async def pedir(self, accion, datos, idioma):
        await self.arrancar()
        i = next(self.ids)
        f = asyncio.get_running_loop().create_future()
        self.esperando[i] = f
        self.proc.stdin.write((json.dumps({"id": i, "accion": accion, "datos": datos, "idioma": idioma}, ensure_ascii=False) + "\n").encode())
        await self.proc.stdin.drain()
        return await f


TRABAJADOR = Trabajador()


# las acciones que usan el LLM local (rutas.ACCIONES con usa_llm): mientras corren, la cola no empieza otro trabajo
CON_LLM = {"historia", "tomas", "describir", "traducir"}
_llm_en_marcha = [0]


async def accion(peticion):
    """/edit_prompt_llm/<acción>: igual que la ruta del nodo (__init__.py): GET o POST, ?idioma=, errores en ese idioma."""
    idioma = peticion.query.get("idioma", "es")
    try:
        datos = await peticion.json() if peticion.method == "POST" else {}
    except ValueError:
        datos = {}
    llm = peticion.match_info["accion"] in CON_LLM
    _llm_en_marcha[0] += llm
    try:
        r = await TRABAJADOR.pedir(peticion.match_info["accion"], datos, i18n.idioma_de(datos.get("idioma") or idioma))
    finally:
        _llm_en_marcha[0] -= llm
    if "ok" in r:
        return web.json_response(r["ok"])
    if r.get("clave") == "app.error.trabajador":
        r["error"] = i18n.t("app.error.trabajador", i18n.idioma_de(datos.get("idioma") or idioma))
    return web.json_response({k: v for k, v in r.items() if k in ("error", "clave")}, status=r.get("estado", 400))


# ------------------------------------------------------------------ archivos
def archivo_dentro(base, rel):
    ruta = os.path.abspath(os.path.join(base, rel))
    return ruta if ruta.startswith(os.path.abspath(base) + os.sep) and os.path.isfile(ruta) else None


def servir(base):
    async def manejar(peticion):
        ruta = archivo_dentro(base, peticion.match_info["ruta"])
        if not ruta:
            raise web.HTTPNotFound()
        # sin caché: la ventana se recarga entera al abrirla (como en ComfyUI) y un cambio se ve al momento
        return web.FileResponse(ruta, headers={"Cache-Control": "no-store"})
    return manejar


async def inicio(peticion):
    return web.FileResponse(os.path.join(WEB_APP, "index.html"), headers={"Cache-Control": "no-store"})


# ------------------------------------------------------------------ reenviar a ComfyUI
async def reenviar(peticion):
    url = CONFIG["comfyui_url"] + peticion.rel_url.path_qs
    cabeceras = {k: v for k, v in peticion.headers.items() if k.lower() in ("content-type", "range", "accept")}
    cuerpo = await peticion.read() if peticion.can_read_body else None
    try:
        async with peticion.app["http"].request(peticion.method, url, data=cuerpo, headers=cabeceras) as r:
            resp = web.StreamResponse(status=r.status, headers={k: v for k, v in r.headers.items()
                                                                if k.lower() in ("content-type", "content-length", "content-range",
                                                                                 "accept-ranges", "content-disposition")})
            await resp.prepare(peticion)
            async for trozo in r.content.iter_chunked(256 * 1024):
                await resp.write(trozo)
            await resp.write_eof()
            return resp
    except OSError:
        return error("app.error.comfyui", peticion, 502, url=CONFIG["comfyui_url"])


# ------------------------------------------------------------------ generar.py (el otro ayudante) y la plantilla
def generar():
    """generar.py se carga la primera vez que se usa (no se recarga: guarda los trabajos en marcha); la app arranca aunque aún
    no exista."""
    if os.environ.get("MAX_EDITOR_GENERAR") == "simulado":
        sys.path.insert(0, os.path.join(APP, "pruebas"))
        return importlib.import_module("generar_simulado")
    return importlib.import_module("generar")


def plantilla():
    try:
        return generar().plantilla()
    except ImportError:
        with open(PLANTILLA, encoding="utf-8") as fh:
            return json.load(fh)


async def ver_plantilla(peticion):
    return web.json_response(plantilla())


# ------------------------------------------------------------------ proyectos: app/proyectos/<nombre>.json
NOMBRE = re.compile(r"^[\w][\w .-]{0,79}$")
EJEMPLO = "ejemplo"        # si existe, es de solo lectura; la app lo abre como plantilla de un proyecto nuevo (app.js)


def ruta_proyecto(nombre):
    nombre = (nombre or "").strip()
    if not NOMBRE.match(nombre) or nombre.endswith("."):
        return None
    return os.path.join(PROYECTOS, nombre + ".json")


def resumen_proyecto(valores: dict) -> dict:
    """De qué está hecho un proyecto, para su tarjeta en la ventana «Proyectos» (29 oct): la idea, cuántas tomas, sus
    referencias (las 4 primeras, con su RefMod para la carita), si lleva canción y la duración. Solo lo que el proyecto
    cambió respecto a la plantilla: lo que falta es lo de la plantilla (sin idea, sin canción)."""
    def leer(nodo, campo):
        try:
            return json.loads((valores.get(nodo) or {}).get(campo) or "{}") or {}
        except (TypeError, ValueError):
            return {}
    estado, pila = leer("74", "estado"), leer("7", "stack_state")
    plan = estado.get("plan") if isinstance(estado.get("plan"), dict) else {}
    refs = [x for x in pila.get("picks") or [] if isinstance(x, dict) and x.get("on", True)]
    return {"idea": str((valores.get("74") or {}).get("idea") or "")[:140],
            "tomas": len(plan.get("tomas") or []),
            # el nombre que le puso el usuario en su ficha («the girl»), si no el del archivo
            "refs": [{"nombre": ((estado.get("refs") or {}).get(x.get("name")) or {}).get("nombre") or x.get("label") or x.get("name") or "",
                      "refmod": x.get("preview") or x.get("name") or ""} for x in refs[:4]],
            "n_refs": len(refs),
            "cancion": bool((valores.get("72") or {}).get("audio")),
            "duracion": (valores.get("74") or {}).get("duracion_s")}


async def lista_proyectos(peticion):
    out = []
    os.makedirs(PROYECTOS, exist_ok=True)
    for a in os.listdir(PROYECTOS):
        if a.endswith(".json"):
            try:
                with open(os.path.join(PROYECTOS, a), encoding="utf-8") as fh:
                    p = json.load(fh) or {}
            except (OSError, ValueError):
                continue
            out.append({"nombre": a[:-5], "guardado": p.get("guardado", ""), "rev": int(p.get("rev") or 0), "autor": p.get("autor") or "",
                        "resumen": resumen_proyecto(p.get("valores") or {})})
    return web.json_response(sorted(out, key=lambda p: p["guardado"] or "", reverse=True))


async def ver_proyecto(peticion):
    ruta = ruta_proyecto(peticion.match_info["nombre"])
    if not ruta:
        return error("app.error.nombre", peticion)
    if not os.path.isfile(ruta):
        return error("app.error.no_existe", peticion, 404, nombre=peticion.match_info["nombre"])
    with open(ruta, encoding="utf-8") as fh:
        return web.json_response(json.load(fh))


async def guardar_proyecto(peticion):
    nombre = peticion.match_info["nombre"].strip()
    ruta = ruta_proyecto(nombre)
    if not ruta:
        return error("app.error.nombre", peticion)
    if nombre == EJEMPLO:                                      # que abrirlo o tocarlo nunca cambie el archivo del repo
        return error("app.error.solo_lectura", peticion, 403, nombre=nombre)
    datos = await peticion.json()
    if not isinstance(datos.get("valores"), dict):
        return error("app.error.sin_valores", peticion)
    if datos.get("nuevo") and os.path.exists(ruta):          # «nuevo» y «guardar como» no pisan otro proyecto
        return error("app.error.ya_existe", peticion, 409, nombre=nombre)
    # rev sube en cada guardado; quien guarda con «base_rev» (la página, el MCP) no pisa lo que otro escribió después
    # (planos/fases/11 MCP.md). «agente» guarda las marcas «✎ agente»: se conservan si el que guarda no las manda.
    antes = {}
    if os.path.isfile(ruta) and not datos.get("nuevo"):
        try:
            with open(ruta, encoding="utf-8") as fh:
                antes = json.load(fh) or {}
        except (OSError, ValueError):
            antes = {}
    rev = int(antes.get("rev") or 0)
    if datos.get("base_rev") is not None and int(datos["base_rev"]) != rev:
        return web.json_response({"error": t("app.error.conflicto", peticion, nombre=nombre), "clave": "app.error.conflicto",
                                  "rev": rev, "autor": antes.get("autor") or ""}, status=409)
    autor = "agente" if datos.get("autor") == "agente" else "pagina"
    proyecto = {"nombre": nombre, "guardado": time.strftime("%Y-%m-%dT%H:%M:%S"), "rev": rev + 1, "autor": autor,
                "valores": datos["valores"]}
    if datos.get("pestana"):                                  # qué pestaña lo guardó: esa no se recarga a sí misma
        proyecto["pestana"] = str(datos["pestana"])[:40]
    agente = datos["agente"] if isinstance(datos.get("agente"), dict) else antes.get("agente")
    if agente:
        proyecto["agente"] = agente
    os.makedirs(PROYECTOS, exist_ok=True)
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as fh:
        json.dump(proyecto, fh, ensure_ascii=False, indent=1)
    os.replace(temporal, ruta)                                 # nunca un proyecto a medio escribir
    return web.json_response({"nombre": nombre, "guardado": proyecto["guardado"], "rev": proyecto["rev"], "autor": autor})


async def rev_proyecto(peticion):
    """GET /app/proyecto_rev/<nombre> → {rev, autor, guardado, marcas}: lo poco que la página mira cada 2 s para saber si
    el agente (u otra pestaña) cambió el proyecto."""
    ruta = ruta_proyecto(peticion.match_info["nombre"])
    if not ruta or not os.path.isfile(ruta):
        return error("app.error.no_existe", peticion, 404, nombre=peticion.match_info["nombre"])
    with open(ruta, encoding="utf-8") as fh:
        p = json.load(fh) or {}
    return web.json_response({"rev": int(p.get("rev") or 0), "autor": p.get("autor") or "", "guardado": p.get("guardado") or "",
                              "pestana": p.get("pestana") or "",
                              "marcas": len(((p.get("agente") or {}).get("marcas")) or [])})


# ------------------------------------------------------------------ generar, avance y videos
async def lanzar(peticion):
    datos = await peticion.json()
    if not isinstance(datos.get("valores"), dict):
        return error("app.error.sin_valores", peticion)
    try:
        g = generar()
    except ImportError:
        return error("app.error.sin_generar", peticion, 503)
    opciones = {"semilla": datos.get("semilla"), "proyecto": datos.get("proyecto"),
                "prefijo": "max_editor/" + re.sub(r"[^\w-]+", "_", datos.get("proyecto") or "edit")}
    tid = await asyncio.get_running_loop().run_in_executor(None, lambda: g.iniciar(datos["valores"], opciones))
    return web.json_response({"id": tid})


async def trabajo(peticion):
    try:
        return web.json_response(generar().estado(peticion.match_info["id"]))
    except ImportError:
        return error("app.error.sin_generar", peticion, 503)


async def cancelar(peticion):
    try:
        return web.json_response(generar().cancelar(peticion.match_info["id"]))
    except ImportError:
        return error("app.error.sin_generar", peticion, 503)


async def videos(peticion):
    """Los videos de un proyecto (historial de generar.py), lo más nuevo primero; solo los que siguen en app/salidas."""
    proyecto = peticion.query.get("proyecto")
    try:
        filas = generar().historial()
    except (ImportError, AttributeError):
        filas = []
    todas = {f.get("archivo"): f for f in filas if f.get("archivo")}
    filas = [f for f in filas if (not proyecto or f.get("proyecto") == proyecto) and f.get("archivo") and f.get("tipo") != "mascara"
             and os.path.isfile(os.path.join(SALIDAS, f["archivo"]))]
    # «Retomar este prompt» (29 oct): de qué Generar salió cada video (un retoque, una extensión o una mejora, del suyo)
    filas = [{**f, "prompt_de": origen_prompt(f["archivo"], todas)} for f in filas]
    # un video, una vez (29 oct: dos servidores con la misma cola anotaron la misma extensión dos veces); se queda la última
    vistos, unicas = set(), []
    for f in reversed(filas):
        if f["archivo"] not in vistos:
            vistos.add(f["archivo"])
            unicas.append(f)
    return web.json_response(unicas)


def origen_prompt(archivo: str, todas: dict) -> str | None:
    """El video de Generar del que sale `archivo` y que guardó sus valores (cola.valores_de), siguiendo «de» hacia atrás."""
    for _ in range(20):
        if cola.valores_de(archivo):
            return archivo
        archivo = (todas.get(archivo) or {}).get("de")
        if not archivo:
            return None
    return None


MINIATURAS = os.path.join(SALIDAS, "miniaturas")


def hacer_miniatura(origen: str, destino: str, ancho: int = 480) -> bool:
    """Un fotograma (al segundo 1, o el primero si dura menos o es una foto) a `ancho` px, en JPG. Devuelve si salió."""
    os.makedirs(MINIATURAS, exist_ok=True)
    temporal = destino + ".tmp.jpg"
    for t in ("1", "0"):
        try:
            subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-ss", t, "-i", origen, "-frames:v", "1", "-vf", f"scale={ancho}:-2",
                            "-q:v", "4", temporal], timeout=30, check=True, capture_output=True)
        except (OSError, subprocess.SubprocessError):
            continue
        if os.path.isfile(temporal) and os.path.getsize(temporal) > 0:
            os.replace(temporal, destino)
            return True
    return False


async def miniatura(peticion):
    """GET /app/miniatura?video=<archivo de app/salidas> | ?refmod=<RefMod> → JPG (29 oct, ventana «Proyectos»: cada tarjeta
    con su último video y las caritas de sus referencias). Se hace una vez con ffmpeg y se guarda en app/salidas/miniaturas/;
    así la ventana no abre decenas de videos ni fotos grandes a la vez."""
    q = peticion.query
    if q.get("refmod"):
        try:
            origen = retocar().ruta_foto_referencia({"refmod": q["refmod"]})
        except Exception:
            raise web.HTTPNotFound()
        nombre, ancho = "ref_" + re.sub(r"[^\w-]+", "_", q["refmod"])[:120], 160
    elif q.get("fuente"):                                    # un video de ComfyUI/input («… [input]»: traído de fuera)
        try:
            origen = retocar().ruta_video(q["fuente"])
        except Exception:
            raise web.HTTPNotFound()
        nombre, ancho = "in_" + re.sub(r"[^\w-]+", "_", q["fuente"])[:120], 480
    else:
        origen = archivo_dentro(SALIDAS, os.path.basename(q.get("video", "")))
        nombre, ancho = os.path.basename(origen or ""), 480
    if not origen:
        raise web.HTTPNotFound()
    destino = os.path.join(MINIATURAS, nombre + ".jpg")
    if not os.path.isfile(destino) or os.path.getmtime(destino) < os.path.getmtime(origen):
        if not await asyncio.get_running_loop().run_in_executor(None, hacer_miniatura, origen, destino, ancho):
            raise web.HTTPNotFound()
    return web.FileResponse(destino, headers={"Cache-Control": "max-age=86400"})


async def valores_video(peticion):
    """GET /app/valores_video?video= → {valores, semilla, proyecto, fecha, video}: con qué se generó (o su origen)."""
    try:
        filas = generar().historial()
    except (ImportError, AttributeError):
        filas = []
    origen = origen_prompt(peticion.query.get("video", ""), {f.get("archivo"): f for f in filas if f.get("archivo")})
    d = cola.valores_de(origen) if origen else None
    if not d:
        return error("app.error.sin_valores_video", peticion, 404)
    return web.json_response({**d, "video": origen})


# ------------------------------------------------------------------ retocar (retocar.py, comparte los trabajos de generar.py)
def retocar():
    return importlib.import_module("retocar")


async def lanzar_retoque(peticion):
    """POST /app/retocar {video, inicio, fin, mascara, referencias, prompt, semilla, proyecto} → {id}; el avance, en /app/trabajo/<id>."""
    datos = await peticion.json()
    if not isinstance(datos, dict):
        return error("app.error.sin_valores", peticion)
    tid = await asyncio.get_running_loop().run_in_executor(None, lambda: retocar().iniciar(datos))   # corta con ffmpeg: 1–2 s
    return web.json_response({"id": tid})


async def lanzar_mascara(peticion):
    """POST /app/retocar_mascara {video, inicio, fin, mascara, megapixeles, proyecto} → {id}: la vista de la máscara del tramo
    (sin H3); el avance y el video, en /app/trabajo/<id>."""
    datos = await peticion.json()
    if not isinstance(datos, dict):
        return error("app.error.sin_valores", peticion)
    tid = await asyncio.get_running_loop().run_in_executor(None, lambda: retocar().iniciar_mascara(datos))
    return web.json_response({"id": tid})


class GpuOcupada(Exception):
    """ComfyUI está trabajando: el LLM no cabe ahora (la ruta responde app.error.gpu_ocupada)."""


async def soltar_gpu(peticion):
    """Antes del LLM (como trabajador._soltar_gpu): con ComfyUI sin trabajo, que suelte sus modelos y esperar a que quede
    sitio. Si no, el LLM (unos 9,6 GB) no cabe, su servicio se cae al cargar y vuelve a empezar sin parar (29 oct)."""
    base = CONFIG["comfyui_url"].rstrip("/")
    http = peticion.app["http"]
    try:
        async with http.get(base + "/queue", timeout=ClientTimeout(total=5)) as q:
            cola_c = await q.json()
    except Exception:
        return                                               # sin ComfyUI no hay nada que soltar
    if cola_c.get("queue_running") or cola_c.get("queue_pending"):
        raise GpuOcupada()
    if not CONFIG.get("liberar_gpu", True):
        return
    try:
        async with http.post(base + "/free", json={"unload_models": True, "free_memory": True}, timeout=ClientTimeout(total=10)):
            pass
        for _ in range(30):                                  # hasta ~15 s: que haya unos 9 GB libres
            async with http.get(base + "/system_stats", timeout=ClientTimeout(total=5)) as st:
                d = await st.json()
            libre = min((x.get("vram_free") or 0) for x in d.get("devices") or [{}]) / 2 ** 30
            if libre >= 9:
                return
            await asyncio.sleep(0.5)
    except Exception:
        return


async def retocar_prompt(peticion):
    """POST /app/retocar_prompt {video, segundo, zona, con_referencia} → {prompt}: la frase del retoque escrita por el LLM
    mirando ese fotograma (retocar.prompt_llm). No con un trabajo corriendo: H3 y el LLM no caben juntos en la GPU."""
    datos = await peticion.json()
    if not isinstance(datos, dict) or not datos.get("video"):
        return error("app.error.sin_valores", peticion)
    if any(x.get("estado") in ("corriendo", "recuperando") for x in cola.lista()["trabajos"]):
        return error("app.error.gpu_ocupada", peticion, 409)
    r = retocar()
    _llm_en_marcha[0] += 1                                   # mientras escribe, la cola no empieza otro trabajo
    try:
        await soltar_gpu(peticion)
    except GpuOcupada:
        _llm_en_marcha[0] -= 1
        return error("app.error.gpu_ocupada", peticion, 409)
    try:
        texto = await asyncio.get_running_loop().run_in_executor(None, lambda: r.prompt_llm(
            datos["video"], float(datos.get("segundo") or 0), str(datos.get("zona") or ""), bool(datos.get("con_referencia", True)), CONFIG["llm_url"]))
    except r.ErrorGenerar as exc:
        return web.json_response({"error": str(exc)}, status=400)
    finally:
        _llm_en_marcha[0] -= 1
    return web.json_response({"prompt": texto})


# ------------------------------------------------------------------ extender (extender.py, planos/fases/12)
def extender():
    return importlib.import_module("extender")


async def extender_plan(peticion):
    """POST /app/extender_plan {video, solape, nuevos, calidad, audio_salida} → lo que se hará (fuente, audio, tamaños, ventana),
    para que la página lo enseñe antes de encolar. Sin GPU: solo ffprobe y el historial."""
    datos = await peticion.json()
    if not isinstance(datos, dict):
        return error("app.error.sin_valores", peticion)
    x = extender()
    try:
        return web.json_response(await asyncio.get_running_loop().run_in_executor(None, x.plan, datos))
    except x.ErrorGenerar as exc:
        return web.json_response({"error": str(exc)}, status=400)


# ------------------------------------------------------------------ mejorar (mejorar.py: Super Resolution y HDR de NVIDIA RTX)
# ------------------------------------------------------------------ edición (edicion.py, el apartado 3: juntar clips con ffmpeg)
def edicion_mod():
    return importlib.import_module("edicion")


# (29 oct, Jonathan: «ediciones propias») cada edición es algo aparte, con nombre, no atada a un proyecto: mezcla videos de
# todos. Antes había una por proyecto, guardada con el nombre del proyecto: esas siguen igual, ahora como ediciones con ese nombre.
EDICIONES = os.path.join(PROYECTOS, "ediciones")         # subcarpeta: no salen como proyectos


def ruta_edicion(nombre):
    nombre = (nombre or "").strip()
    if not NOMBRE.match(nombre) or nombre.endswith("."):
        return None
    return os.path.join(EDICIONES, nombre + ".json")


def _leer_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as fh:
            return json.load(fh) or {}
    except (OSError, ValueError):
        return None


async def lista_ediciones(peticion):
    """GET /app/ediciones → [{nombre, guardado, clips, duracion, portada}] lo más nuevo primero. portada: su último montaje."""
    try:
        filas = generar().historial()
    except (ImportError, AttributeError):
        filas = []
    portadas = {}
    for f in filas:                                       # el historial va de lo viejo a lo nuevo: se queda el último
        if f.get("tipo") == "montaje" and f.get("edicion") and os.path.isfile(os.path.join(SALIDAS, f.get("archivo") or "")):
            portadas[f["edicion"]] = f["archivo"]
    out = []
    os.makedirs(EDICIONES, exist_ok=True)
    for a in os.listdir(EDICIONES):
        d = _leer_json(os.path.join(EDICIONES, a)) if a.endswith(".json") else None
        if d is None:
            continue
        clips = [c for p in d.get("pistas") or [] for c in p.get("clips") or []]
        fin = max([float(c.get("en") or 0) + float(c.get("fin") or 0) - float(c.get("ini") or 0) for c in clips] or [0])
        nombre = a[:-5]
        out.append({"nombre": nombre, "guardado": d.get("guardado") or "", "clips": len(clips), "duracion": round(fin, 2),
                    "portada": portadas.get(nombre), "primer_video": next((c.get("fuente") for c in clips if c.get("tipo") == "video"), None)})
    return web.json_response(sorted(out, key=lambda x: x["guardado"], reverse=True))


async def accion_edicion(peticion):
    """POST /app/ediciones/<nombre>/{nueva|duplicar|borrar} {a?}: crear una vacía, copiarla a «a» o quitarla (a ediciones/_borradas)."""
    nombre, accion = peticion.match_info["nombre"], peticion.match_info["accion"]
    ruta = ruta_edicion(nombre)
    if not ruta:
        return error("app.error.nombre", peticion)
    datos = await peticion.json() if peticion.can_read_body else {}
    os.makedirs(EDICIONES, exist_ok=True)
    if accion == "nueva":
        if os.path.exists(ruta):
            return error("app.error.edicion_ya_existe", peticion, 409, nombre=nombre)
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump({"pistas": [], "rev": 1, "autor": "pagina", "guardado": time.strftime("%Y-%m-%dT%H:%M:%S")}, fh, ensure_ascii=False)
        return web.json_response({"nombre": nombre})
    if not os.path.isfile(ruta):
        return error("app.error.edicion_no_existe", peticion, 404, nombre=nombre)
    if accion == "duplicar":
        destino = ruta_edicion(datos.get("a"))
        if not destino:
            return error("app.error.nombre", peticion)
        if os.path.exists(destino):
            return error("app.error.edicion_ya_existe", peticion, 409, nombre=datos.get("a"))
        d = _leer_json(ruta) or {}
        d.update(rev=1, autor="pagina", guardado=time.strftime("%Y-%m-%dT%H:%M:%S"))
        with open(destino, "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False)
        return web.json_response({"nombre": datos.get("a").strip()})
    if accion == "borrar":                                # no se pierde: va a ediciones/_borradas (se recupera moviéndola)
        papelera = os.path.join(EDICIONES, "_borradas")
        os.makedirs(papelera, exist_ok=True)
        os.replace(ruta, os.path.join(papelera, f"{nombre.strip()}_{time.strftime('%Y%m%d_%H%M%S')}.json"))
        return web.json_response({"ok": True})
    return error("app.error.sin_valores", peticion)


async def leer_edicion(peticion):
    """GET /app/edicion/<edición> → la línea de tiempo guardada, con su rev y su autor ({} si aún no hay)."""
    ruta = ruta_edicion(peticion.match_info["nombre"])
    if not ruta:
        return error("app.error.nombre", peticion)
    try:
        with open(ruta, encoding="utf-8") as fh:
            return web.json_response(json.load(fh))
    except (OSError, ValueError):
        return web.json_response({})


async def guardar_edicion(peticion):
    """POST /app/edicion/<edición> {pistas, lienzo, zoom, rango, autor?}: se guarda tal cual (la comprueba exportar). `rev` sube
    en cada guardado y `autor` es «agente» (el MCP) o «pagina»: así la página adopta lo que cambie el agente (edicion.js).
    Si no existe, se crea (como antes)."""
    if not ruta_edicion(peticion.match_info["nombre"]):
        return error("app.error.nombre", peticion)
    datos = await peticion.json()
    if not isinstance(datos, dict) or not isinstance(datos.get("pistas"), list):
        return error("app.error.sin_valores", peticion)
    os.makedirs(EDICIONES, exist_ok=True)
    ruta = ruta_edicion(peticion.match_info["nombre"])
    try:
        with open(ruta, encoding="utf-8") as fh:
            rev = int((json.load(fh) or {}).get("rev") or 0)
    except (OSError, ValueError, TypeError):
        rev = 0
    autor = "agente" if datos.get("autor") == "agente" else "pagina"
    with open(ruta + ".tmp", "w", encoding="utf-8") as fh:
        json.dump({"pistas": datos["pistas"], "lienzo": datos.get("lienzo"), "zoom": datos.get("zoom"), "rango": datos.get("rango"), "rev": rev + 1, "autor": autor,
                   "guardado": time.strftime("%Y-%m-%dT%H:%M:%S")}, fh, ensure_ascii=False)
    os.replace(ruta + ".tmp", ruta)
    return web.json_response({"ok": True, "rev": rev + 1, "autor": autor})


async def edicion_audios(peticion):
    return web.json_response(await asyncio.get_running_loop().run_in_executor(None, edicion_mod().audios))


async def edicion_de_fuera(peticion):
    return web.json_response(await asyncio.get_running_loop().run_in_executor(None, edicion_mod().de_fuera))


async def edicion_subir(peticion):
    """POST /app/edicion_subir (multipart: «tipo» audio|video, «carpeta» opcional y luego «archivo»): un audio (también los
    de una carpeta elegida, uno por petición con su carpeta) o un video traído de fuera. Se escribe por trozos (un video
    puede pesar mucho)."""
    m = edicion_mod()
    lector = await peticion.multipart()
    campos = {}
    while True:
        parte = await lector.next()
        if parte is None:
            return error("app.error.sin_valores", peticion)
        if parte.name != "archivo":
            campos[parte.name] = (await parte.text())[:200]
            continue
        try:
            ruta, fuente = m.destino_subida(parte.filename or "", campos.get("tipo", "audio"), campos.get("carpeta", ""))
        except m.ErrorGenerar as exc:
            return web.json_response({"error": str(exc)}, status=400)
        with open(ruta + ".tmp", "wb") as fh:
            while trozo := await parte.read_chunk(1 << 20):
                fh.write(trozo)
        os.replace(ruta + ".tmp", ruta)
        return web.json_response({"fuente": fuente, "nombre": os.path.basename(ruta)})


# ------------------------------------------------------------------ LoRAs (30 oct): los del proyecto, para Generar, Retocar y Extender
def _carpeta_loras() -> str:
    return os.path.join(retocar().comfyui_dir(), "models", "loras")


def _es_h3(nombre: str) -> bool:
    return bool(re.search(r"h3|minimax", nombre, re.I))


async def loras(peticion):
    """GET /app/loras → {loras: [{nombre, h3}], carpeta}: la lista de ComfyUI (/models/loras, la que acepta el
    LoraLoaderModelOnly); sin ComfyUI, lo que hay en su carpeta. Primero los de H3 (los otros son de otros modelos)."""
    nombres = None
    try:
        async with peticion.app["http"].get(CONFIG["comfyui_url"].rstrip("/") + "/models/loras", timeout=ClientTimeout(total=5)) as r:
            if r.status == 200:
                nombres = [str(x) for x in await r.json()]
    except Exception:
        pass
    if nombres is None:
        base, nombres = _carpeta_loras(), []
        for raiz, _, archivos in os.walk(base):
            nombres += [os.path.relpath(os.path.join(raiz, a), base).replace(os.sep, "/") for a in archivos
                        if a.lower().endswith((".safetensors", ".ckpt", ".pt"))]
    nombres = sorted(set(nombres), key=lambda n: (not _es_h3(n), n.lower()))
    return web.json_response({"loras": [{"nombre": n, "h3": _es_h3(n)} for n in nombres], "carpeta": "models/loras"})


async def loras_subir(peticion):
    """POST /app/loras_subir (multipart «archivo», un .safetensors) → {nombre}: se copia a ComfyUI/models/loras por trozos
    (pesan cientos de MB). No pisa uno que ya exista."""
    lector = await peticion.multipart()
    while True:
        parte = await lector.next()
        if parte is None:
            return error("app.error.sin_valores", peticion)
        if parte.name == "archivo":
            break
    nombre = os.path.basename((parte.filename or "").replace("\\", "/")).strip()
    if not nombre.lower().endswith(".safetensors") or nombre.startswith("."):
        return error("app.loras.error.tipo", peticion)
    base = _carpeta_loras()
    os.makedirs(base, exist_ok=True)
    ruta = os.path.join(base, nombre)
    if os.path.exists(ruta):
        return error("app.loras.error.existe", peticion, 409, nombre=nombre)
    try:
        with open(ruta + ".tmp", "wb") as fh:
            while trozo := await parte.read_chunk(1 << 20):
                fh.write(trozo)
        os.replace(ruta + ".tmp", ruta)
    except Exception:
        try:
            os.remove(ruta + ".tmp")
        except OSError:
            pass
        raise
    return web.json_response({"nombre": nombre})


async def edicion_proxy(peticion):
    """GET /app/edicion_proxy?fuente= → el video ligero para el visor de Edición (edicion.proxy), con caché del navegador."""
    m = edicion_mod()
    try:
        ruta = await asyncio.get_running_loop().run_in_executor(None, m.proxy, peticion.query.get("fuente", ""))
    except Exception:
        raise web.HTTPNotFound()
    return web.FileResponse(ruta, headers={"Cache-Control": "private, max-age=86400"})


async def edicion_descargar(peticion):
    """GET /app/edicion_descargar/<archivo>: lo exportado, como descarga (para llevarlo a otro sitio; también desde un pod)."""
    ruta = edicion_mod().ruta_exportado(peticion.match_info["archivo"])
    if not ruta:
        raise web.HTTPNotFound()
    return web.FileResponse(ruta, headers={"Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(os.path.basename(ruta))}",
                                           "Cache-Control": "no-store"})


async def edicion_exportar(peticion):
    """POST /app/edicion_exportar {proyecto, nombre (la edición), edicion, opciones: {formato, calidad, resolucion, audio,
    biblioteca, archivo}} → {archivo, fila}: el mp4 nuevo en app/salidas (y en la
    biblioteca, en la carpeta del proyecto abierto); la fila anota la edición, que lo usa de portada."""
    m = edicion_mod()
    datos = await peticion.json()
    try:
        archivo, fila = await asyncio.get_running_loop().run_in_executor(None, m.exportar, datos.get("edicion") or {}, datos.get("proyecto"),
                                                                           datos.get("nombre"), datos.get("opciones"))
    except m.ErrorGenerar as exc:
        return web.json_response({"error": str(exc)}, status=400)
    return web.json_response({"archivo": archivo, "fila": fila})


def mejorar():
    return importlib.import_module("mejorar")


# ------------------------------------------------------------------ la cola de trabajos (cola.py)
async def cola_anadir(peticion):
    """POST /app/cola {tipo: generar | retocar | extender | mejorar, valores (generar) | datos (los demás), semilla?, proyecto?, n?} → {ids}.
    Con n > 1 se encolan n trabajos con semillas aleatorias distintas. Cada uno lleva su foto fija."""
    d = await peticion.json()
    if not isinstance(d, dict) or d.get("tipo") not in cola.TIPOS:
        return error("app.error.sin_valores", peticion)
    n = max(1, min(50, int(d.get("n") or 1)))
    if d["tipo"] == "generar":
        if not isinstance(d.get("valores"), dict):
            return error("app.error.sin_valores", peticion)
        proyecto = d.get("proyecto") or ""
        foto = {"valores": d["valores"], "semilla": d.get("semilla"), "proyecto": proyecto,
                "prefijo": "max_editor/" + re.sub(r"[^\w-]+", "_", proyecto or "edit")}
    else:
        if not isinstance(d.get("datos"), dict):
            return error("app.error.sin_valores", peticion)
        foto = dict(d["datos"])
    if d.get("origen") == "agente":                           # lo encoló el agente (MCP): la cola lo enseña
        foto["origen"] = "agente"
    semillas = cola.semillas_nuevas(n) if n > 1 else [foto.get("semilla")]
    return web.json_response({"ids": cola.anadir(d["tipo"], foto, semillas)})


async def cola_lista(peticion):
    return web.json_response(cola.lista())


async def cola_uno(peticion):
    t = cola.uno(peticion.match_info["id"])
    return web.json_response(t) if t else error("app.error.no_existe_trabajo", peticion, 404)


async def cola_accion(peticion):
    try:
        return web.json_response(cola.accion(peticion.match_info["id"], peticion.match_info["accion"]))
    except KeyError:
        return error("app.error.no_existe_trabajo", peticion, 404)


async def cola_limpiar(peticion):
    return web.json_response(cola.limpiar())


async def cola_pausar(peticion):
    d = await peticion.json()
    return web.json_response(cola.pausar(bool((d or {}).get("pausada"))))


async def video_info(peticion):
    """GET /app/video_info?video= → {ancho, alto, fps, fotogramas, duracion, audio}."""
    r = retocar()
    try:
        return web.json_response(await asyncio.get_running_loop().run_in_executor(None, r.info, peticion.query.get("video", "")))
    except r.ErrorGenerar as exc:
        return web.json_response({"error": str(exc)}, status=404)


async def ver_video(peticion):
    """GET /app/video?video= : el archivo de app/salidas o de ComfyUI input/output (con Range, para el reproductor)."""
    r = retocar()
    try:
        ruta = r.ruta_video(peticion.query.get("video", ""))
    except r.ErrorGenerar:
        raise web.HTTPNotFound()
    return web.FileResponse(ruta, headers={"Cache-Control": "no-store"})


async def foto_referencia(peticion):
    """GET /app/foto_referencia?refmod= | ?imagen= : la foto original de una referencia de Retocar, para recortarla."""
    r = retocar()
    q = peticion.query
    try:
        ruta = r.ruta_foto_referencia({"refmod": q["refmod"]} if q.get("refmod") else {"imagen": q.get("imagen", "")})
    except r.ErrorGenerar:
        raise web.HTTPNotFound()
    return web.FileResponse(ruta, headers={"Cache-Control": "no-store"})


async def abrir_carpeta(peticion):
    """«Abrir carpeta»: el gestor de archivos en app/salidas (la app corre en el mismo PC que la mira)."""
    os.makedirs(SALIDAS, exist_ok=True)
    abrir = {"darwin": "open", "win32": "explorer"}.get(sys.platform, "xdg-open")
    try:
        subprocess.Popen([abrir, SALIDAS], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        return error("app.error.carpeta", peticion, carpeta=SALIDAS)
    return web.json_response({"carpeta": SALIDAS})


# ------------------------------------------------------------------ versión nueva y reiniciar (29 oct)
def firma_codigo() -> str:
    """Lo que el servidor cargó al arrancar: los .py de la app y del repo (el trabajador usa rutas/nucleo), las plantillas y
    la configuración. Si cambia (se actualizó la app), la página ofrece «Reiniciar» (lo demás, la web, basta con recargar)."""
    import glob
    import hashlib
    rutas = sorted(glob.glob(os.path.join(APP, "*.py")) + glob.glob(os.path.join(REPO, "*.py")) +
                   glob.glob(os.path.join(APP, "plantillas", "*.json")) + glob.glob(os.path.join(APP, "config*.json")))
    h = hashlib.sha1()
    for r in rutas:
        try:
            st = os.stat(r)
        except OSError:
            continue
        h.update(f"{r}:{st.st_size}:{st.st_mtime_ns};".encode())
    return h.hexdigest()


FIRMA_AL_ARRANCAR = firma_codigo()


async def reiniciar(peticion):
    """POST /app/reiniciar: vuelve a arrancar la app y su MCP con app/arrancar.sh --reiniciar (el mismo camino de siempre),
    en un proceso aparte que sobrevive al servidor. No se hace con trabajos en la cola: se cortarían."""
    activos = [x for x in cola.lista()["trabajos"] if x.get("estado") in ("en_cola", "corriendo", "recuperando")]
    if activos:
        return error("app.error.reiniciar_ocupado", peticion, 409, n=len(activos))
    script = os.path.join(APP, "arrancar.sh")
    if sys.platform == "win32" or not os.path.isfile(script):
        return error("app.error.reiniciar_no", peticion, 400)
    os.makedirs(SALIDAS, exist_ok=True)
    with open(os.path.join(SALIDAS, "reinicio.log"), "ab") as log:
        subprocess.Popen(["bash", script, "--reiniciar", "--sin-navegador"], stdout=log, stderr=subprocess.STDOUT,
                         stdin=subprocess.DEVNULL, start_new_session=True, cwd=REPO)
    return web.json_response({"ok": True})


async def salud(peticion):
    async def responde(url):
        try:
            async with peticion.app["http"].get(url, timeout=ClientTimeout(total=2)) as r:
                return r.status == 200
        except Exception:
            return False
    comfyui, proxy, llm = await asyncio.gather(responde(CONFIG["comfyui_url"] + "/system_stats"),
                                               responde(CONFIG["proxy_url"] + "/api/v2/health"),
                                               responde(CONFIG["llm_url"] + "/health"))
    try:
        generar()
        hay_generar = True
    except ImportError:
        hay_generar = False
    return web.json_response({"comfyui": comfyui, "proxy": proxy, "llm": llm, "generar": hay_generar,
                              "arranque": FIRMA_AL_ARRANCAR, "version_nueva": firma_codigo() != FIRMA_AL_ARRANCAR,
                              "comfyui_url": CONFIG["comfyui_url"], "proxy_url": CONFIG["proxy_url"], "llm_url": CONFIG["llm_url"]})


# ------------------------------------------------------------------ los modelos (modelos.py: qué hay, elegir otro y bajar con un clic)
ERRORES_MODELOS = ("app.modelos.error.pieza", "app.modelos.error.no_esta", "app.modelos.error.disco")   # los ValueError de modelos.py


def modelos_mod():
    return importlib.import_module("modelos")


async def modelos_estado(peticion):
    """GET /app/modelos → cada pieza (H3, texto, VAE, SAM, VDN, vista previa): qué hay, cuál se usa y qué falta."""
    return web.json_response(await asyncio.get_running_loop().run_in_executor(None, modelos_mod().estado, CONFIG))


async def modelos_accion(peticion):
    """POST /app/modelos/{elegir|bajar|parar} {clave, archivo?}: elegir otro archivo, bajar el que falta o parar la descarga."""
    datos = await peticion.json()
    m, accion = modelos_mod(), peticion.match_info["accion"]
    try:
        if accion == "elegir":
            await asyncio.get_running_loop().run_in_executor(None, m.elegir, str(datos.get("clave")), datos.get("archivo"), CONFIG)
        elif accion == "bajar":
            await asyncio.get_running_loop().run_in_executor(None, m.bajar, str(datos.get("clave")), CONFIG)
        elif accion == "parar":
            m.parar(str(datos.get("clave")))
        else:
            return error("app.modelos.error.pieza", peticion, 404)
    except ValueError as e:
        clave = str(e) if str(e) in ERRORES_MODELOS else "app.modelos.error.pieza"
        return error(clave, peticion)
    return web.json_response({"ok": True})


# ------------------------------------------------------------------ la app
async def al_empezar(app):
    app["http"] = ClientSession(timeout=ClientTimeout(total=None, sock_connect=5))
    asyncio.create_task(TRABAJADOR.arrancar())               # que librosa esté cargado antes del primer «montar»
    # la cola de trabajos: su hilo procesa lo pendiente aunque nadie tenga la página abierta
    cola.arrancar({"generar": generar, "retocar": retocar, "extender": extender, "mejorar": mejorar, "llm_ocupado": lambda: _llm_en_marcha[0] > 0,
                   "comfyui_url": CONFIG["comfyui_url"], "comfyui_dir": os.path.expanduser(CONFIG.get("comfyui_dir") or "~/comfy/ComfyUI")})


async def al_terminar(app):
    await app["http"].close()
    if TRABAJADOR.proc and TRABAJADOR.proc.returncode is None:
        TRABAJADOR.proc.terminate()


def crear_app():
    app = web.Application(client_max_size=2 * 2 ** 30)       # subir un video largo
    app.on_startup.append(al_empezar)
    app.on_cleanup.append(al_terminar)
    app.router.add_get("/", inicio)
    app.router.add_get("/app/web/{ruta:.+}", servir(WEB_APP))
    app.router.add_get("/edit_prompt_llm/web/{ruta:.+}", servir(WEB_NODO))
    app.router.add_route("*", "/edit_prompt_llm/{accion}", accion)
    for ruta in ("/view", "/upload/image", "/minimax_h3/{resto:.*}", "/max_editor/preview"):
        app.router.add_route("*", ruta, reenviar)
    app.router.add_get("/app/plantilla", ver_plantilla)
    app.router.add_get("/app/proyectos", lista_proyectos)
    app.router.add_get("/app/proyecto/{nombre}", ver_proyecto)
    app.router.add_post("/app/proyecto/{nombre}", guardar_proyecto)
    app.router.add_get("/app/proyecto_rev/{nombre}", rev_proyecto)
    app.router.add_post("/app/generar", lanzar)
    app.router.add_get("/app/trabajo/{id}", trabajo)
    app.router.add_post("/app/cancelar/{id}", cancelar)
    app.router.add_get("/app/videos", videos)
    app.router.add_get("/app/miniatura", miniatura)
    app.router.add_get("/app/valores_video", valores_video)
    app.router.add_get("/app/salidas/{ruta:[^/]+}", servir(SALIDAS))
    app.router.add_post("/app/abrir_carpeta", abrir_carpeta)
    app.router.add_post("/app/retocar", lanzar_retoque)
    app.router.add_post("/app/retocar_mascara", lanzar_mascara)
    app.router.add_post("/app/retocar_prompt", retocar_prompt)
    app.router.add_post("/app/extender_plan", extender_plan)
    app.router.add_get("/app/cola", cola_lista)
    app.router.add_post("/app/cola", cola_anadir)
    app.router.add_post("/app/cola/limpiar", cola_limpiar)
    app.router.add_post("/app/cola/pausar", cola_pausar)
    app.router.add_get("/app/cola/{id}", cola_uno)
    app.router.add_post("/app/cola/{id}/{accion}", cola_accion)
    app.router.add_get("/app/video_info", video_info)
    app.router.add_get("/app/video", ver_video)
    app.router.add_get("/app/foto_referencia", foto_referencia)
    app.router.add_get("/app/salud", salud)
    app.router.add_get("/app/modelos", modelos_estado)
    app.router.add_post("/app/modelos/{accion}", modelos_accion)
    app.router.add_post("/app/reiniciar", reiniciar)
    app.router.add_get("/app/ediciones", lista_ediciones)
    app.router.add_post("/app/ediciones/{nombre}/{accion}", accion_edicion)
    app.router.add_get("/app/edicion/{nombre}", leer_edicion)
    app.router.add_post("/app/edicion/{nombre}", guardar_edicion)
    app.router.add_get("/app/edicion_audios", edicion_audios)
    app.router.add_get("/app/edicion_de_fuera", edicion_de_fuera)
    app.router.add_get("/app/edicion_proxy", edicion_proxy)
    app.router.add_post("/app/edicion_subir", edicion_subir)
    app.router.add_get("/app/loras", loras)
    app.router.add_post("/app/loras_subir", loras_subir)
    app.router.add_post("/app/edicion_exportar", edicion_exportar)
    app.router.add_get("/app/edicion_descargar/{archivo}", edicion_descargar)
    return app


if __name__ == "__main__":
    if "--config" in sys.argv:                                # para arrancar.sh y parar.sh: la misma configuración, en JSON
        print(json.dumps({**CONFIG, "python_trabajador": python_comfyui()}))
        sys.exit(0)
    print(f"[MAX EDITOR] http://127.0.0.1:{CONFIG['puerto']}  ·  ComfyUI {CONFIG['comfyui_url']}  ·  "
          f"proxy {CONFIG['proxy_url']}  ·  LLM {CONFIG['llm_url']}  ·  trabajador {python_comfyui()}", flush=True)
    web.run_app(crear_app(), host=CONFIG.get("host") or "127.0.0.1", port=int(CONFIG["puerto"]), print=None)  # «0.0.0.0» en un pod
