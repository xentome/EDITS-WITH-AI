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
    return web.json_response(list(reversed(filas)))


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


EDICIONES = os.path.join(PROYECTOS, "ediciones")         # la línea de tiempo de cada proyecto (no es un proyecto: subcarpeta)


async def leer_edicion(peticion):
    """GET /app/edicion/<proyecto> → la línea de tiempo guardada ({} si aún no hay)."""
    if not ruta_proyecto(peticion.match_info["nombre"]):
        return error("app.error.nombre", peticion)
    ruta = os.path.join(EDICIONES, peticion.match_info["nombre"].strip() + ".json")
    try:
        with open(ruta, encoding="utf-8") as fh:
            return web.json_response(json.load(fh))
    except (OSError, ValueError):
        return web.json_response({})


async def guardar_edicion(peticion):
    """POST /app/edicion/<proyecto> {pistas, lienzo}: se guarda tal cual (la comprueba exportar)."""
    if not ruta_proyecto(peticion.match_info["nombre"]):
        return error("app.error.nombre", peticion)
    datos = await peticion.json()
    if not isinstance(datos, dict) or not isinstance(datos.get("pistas"), list):
        return error("app.error.sin_valores", peticion)
    os.makedirs(EDICIONES, exist_ok=True)
    ruta = os.path.join(EDICIONES, peticion.match_info["nombre"].strip() + ".json")
    with open(ruta + ".tmp", "w", encoding="utf-8") as fh:
        json.dump({"pistas": datos["pistas"], "lienzo": datos.get("lienzo"), "zoom": datos.get("zoom"),
                   "guardado": time.strftime("%Y-%m-%dT%H:%M:%S")}, fh, ensure_ascii=False)
    os.replace(ruta + ".tmp", ruta)
    return web.json_response({"ok": True})


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


async def edicion_exportar(peticion):
    """POST /app/edicion_exportar {proyecto, edicion} → {archivo}: el mp4 nuevo en app/salidas (y en la biblioteca)."""
    m = edicion_mod()
    datos = await peticion.json()
    try:
        archivo, fila = await asyncio.get_running_loop().run_in_executor(None, m.exportar, datos.get("edicion") or {}, datos.get("proyecto"))
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
    app.router.add_post("/app/reiniciar", reiniciar)
    app.router.add_get("/app/edicion/{nombre}", leer_edicion)
    app.router.add_post("/app/edicion/{nombre}", guardar_edicion)
    app.router.add_get("/app/edicion_audios", edicion_audios)
    app.router.add_get("/app/edicion_de_fuera", edicion_de_fuera)
    app.router.add_post("/app/edicion_subir", edicion_subir)
    app.router.add_post("/app/edicion_exportar", edicion_exportar)
    return app


if __name__ == "__main__":
    if "--config" in sys.argv:                                # para arrancar.sh y parar.sh: la misma configuración, en JSON
        print(json.dumps({**CONFIG, "python_trabajador": python_comfyui()}))
        sys.exit(0)
    print(f"[MAX EDITOR] http://127.0.0.1:{CONFIG['puerto']}  ·  ComfyUI {CONFIG['comfyui_url']}  ·  "
          f"proxy {CONFIG['proxy_url']}  ·  LLM {CONFIG['llm_url']}  ·  trabajador {python_comfyui()}", flush=True)
    web.run_app(crear_app(), host=CONFIG.get("host") or "127.0.0.1", port=int(CONFIG["puerto"]), print=None)  # «0.0.0.0» en un pod
