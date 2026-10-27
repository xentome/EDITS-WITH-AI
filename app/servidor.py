"""MAX EDITOR: la app. Un servidor local (aiohttp) que enseña la ventana del nodo «Prompt del edit» a pantalla completa, sin
el lienzo de ComfyUI, y genera el video con el SDK de Comfy (generar.py). Plano: ../planos/fases/6 La app MAX EDITOR.md.
  /                          la app (web/index.html: cabecera, Generar, proyectos)
  /edit_prompt_llm/web/*     los archivos de ../web (la ventana del nodo, tal cual, sin copiarlos)
  /edit_prompt_llm/<acción>  rutas.ACCIONES, en el trabajador (trabajador.py, con el Python de ComfyUI)
  /view, /upload/image, /minimax_h3/*   reenviados a ComfyUI
  /app/*                     plantilla, proyectos, generar, trabajo, salidas, videos, salud
  /app/retocar, /app/video_info, /app/video   Retocar (retocar.py): un tramo con la zona tapada, rehecha por H3
Arranque: ~/comfy/max_editor_app/.venv/bin/python app/servidor.py  →  http://127.0.0.1:8300
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
           "puerto": 8300, "llm_url": "http://127.0.0.1:8080", "python_comfyui": "", "liberar_gpu": True}


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


async def accion(peticion):
    """/edit_prompt_llm/<acción>: igual que la ruta del nodo (__init__.py): GET o POST, ?idioma=, errores en ese idioma."""
    idioma = peticion.query.get("idioma", "es")
    try:
        datos = await peticion.json() if peticion.method == "POST" else {}
    except ValueError:
        datos = {}
    r = await TRABAJADOR.pedir(peticion.match_info["accion"], datos, i18n.idioma_de(datos.get("idioma") or idioma))
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
EJEMPLO = "ejemplo"        # va en git: es de solo lectura; la app lo abre como plantilla de un proyecto nuevo (app.js)


def ruta_proyecto(nombre):
    nombre = (nombre or "").strip()
    if not NOMBRE.match(nombre) or nombre.endswith("."):
        return None
    return os.path.join(PROYECTOS, nombre + ".json")


async def lista_proyectos(peticion):
    out = []
    os.makedirs(PROYECTOS, exist_ok=True)
    for a in os.listdir(PROYECTOS):
        if a.endswith(".json"):
            try:
                with open(os.path.join(PROYECTOS, a), encoding="utf-8") as fh:
                    guardado = (json.load(fh) or {}).get("guardado", "")
            except (OSError, ValueError):
                continue
            out.append({"nombre": a[:-5], "guardado": guardado})
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
    proyecto = {"nombre": nombre, "guardado": time.strftime("%Y-%m-%dT%H:%M:%S"), "valores": datos["valores"]}
    os.makedirs(PROYECTOS, exist_ok=True)
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as fh:
        json.dump(proyecto, fh, ensure_ascii=False, indent=1)
    os.replace(temporal, ruta)                                 # nunca un proyecto a medio escribir
    return web.json_response({"nombre": nombre, "guardado": proyecto["guardado"]})


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
    filas = [f for f in filas if (not proyecto or f.get("proyecto") == proyecto) and f.get("archivo")
             and os.path.isfile(os.path.join(SALIDAS, f["archivo"]))]
    return web.json_response(list(reversed(filas)))


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
                              "comfyui_url": CONFIG["comfyui_url"], "proxy_url": CONFIG["proxy_url"], "llm_url": CONFIG["llm_url"]})


# ------------------------------------------------------------------ la app
async def al_empezar(app):
    app["http"] = ClientSession(timeout=ClientTimeout(total=None, sock_connect=5))
    asyncio.create_task(TRABAJADOR.arrancar())               # que librosa esté cargado antes del primer «montar»


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
    for ruta in ("/view", "/upload/image", "/minimax_h3/{resto:.*}"):
        app.router.add_route("*", ruta, reenviar)
    app.router.add_get("/app/plantilla", ver_plantilla)
    app.router.add_get("/app/proyectos", lista_proyectos)
    app.router.add_get("/app/proyecto/{nombre}", ver_proyecto)
    app.router.add_post("/app/proyecto/{nombre}", guardar_proyecto)
    app.router.add_post("/app/generar", lanzar)
    app.router.add_get("/app/trabajo/{id}", trabajo)
    app.router.add_post("/app/cancelar/{id}", cancelar)
    app.router.add_get("/app/videos", videos)
    app.router.add_get("/app/salidas/{ruta:[^/]+}", servir(SALIDAS))
    app.router.add_post("/app/abrir_carpeta", abrir_carpeta)
    app.router.add_post("/app/retocar", lanzar_retoque)
    app.router.add_get("/app/video_info", video_info)
    app.router.add_get("/app/video", ver_video)
    app.router.add_get("/app/foto_referencia", foto_referencia)
    app.router.add_get("/app/salud", salud)
    return app


if __name__ == "__main__":
    if "--config" in sys.argv:                                # para arrancar.sh y parar.sh: la misma configuración, en JSON
        print(json.dumps({**CONFIG, "python_trabajador": python_comfyui()}))
        sys.exit(0)
    print(f"[MAX EDITOR] http://127.0.0.1:{CONFIG['puerto']}  ·  ComfyUI {CONFIG['comfyui_url']}  ·  "
          f"proxy {CONFIG['proxy_url']}  ·  LLM {CONFIG['llm_url']}  ·  trabajador {python_comfyui()}", flush=True)
    web.run_app(crear_app(), host="127.0.0.1", port=int(CONFIG["puerto"]), print=None)
