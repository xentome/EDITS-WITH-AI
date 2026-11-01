"""MAX EDITOR · el servidor MCP: cualquier agente (Claude Code, Claude Desktop, Cursor, Codex…) hace un edit de principio a fin
en la app, con todo a la vista en la interfaz. Plano: ../planos/fases/11 MCP.md.
  - Es una capa fina: todo lo hace por las rutas HTTP de la app (servidor.py, 127.0.0.1:8300), igual que la página. La lógica
    del proyecto (etiquetas, duración, tomas, marcas «✎ agente») está en agente.py.
  - Lo que sabe el agente va DENTRO: las `instructions` (al conectarse), la GUÍA en recursos guia://… (app/guia/*.md) y los
    prompts de flujo (crear_edit, retocar_video, revisar_resultado).
  - Transporte: Streamable HTTP en http://127.0.0.1:8301/mcp (lo levanta arrancar.sh) o stdio (--stdio).
Arranque: app/.venv/bin/python app/mcp_servidor.py [--stdio]. Configuración: la de la app (config.json, config.local.json,
MAX_EDITOR_*), más `mcp_puerto` (8301) y MAX_EDITOR_URL (dónde está la app, por defecto http://127.0.0.1:<puerto>)."""
from __future__ import annotations

import asyncio
import functools
import inspect
import json
import os
import subprocess
import sys
import time
import urllib.parse

import logging

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.utilities.types import Image

APP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, APP)
import agente  # noqa: E402
from agente import ErrorAgente, Proyecto  # noqa: E402
from servidor import leer_config  # noqa: E402  (la misma configuración que la app)

CONFIG = leer_config()
logging.getLogger("httpx").setLevel(logging.WARNING)
URL_APP = (os.environ.get("MAX_EDITOR_URL") or f"http://127.0.0.1:{CONFIG['puerto']}").rstrip("/")
GUIA = os.path.join(APP, "guia")
MAX_POR_LLAMADA, MAX_PENDIENTES = 4, 6        # trabajos que el agente puede encolar de una vez / pendientes suyos a la vez
ACTIVOS = ("en_cola", "corriendo", "recuperando")

# los documentos de la guía: guia://<tema> → app/guia/<n>_<tema>.md (el orden es el de lectura)
# (31 oct: guía corta con las guías oficiales; los temas viejos siguen valiendo y llevan al capítulo nuevo que los recoge)
TEMAS = {"h3": "1_h3.md", "proyecto": "2_proyecto.md", "trampas": "3_trampas.md", "retocar": "4_retocar.md"}
TEMAS_VIEJOS = {"mapa": "proyecto", "organizar": "proyecto", "prompts": "h3", "revisar": "h3", "creativo": "proyecto",
                "recetas": "proyecto", "errores": "trampas", "extender": "retocar"}


def leer_doc(nombre: str) -> str:
    with open(os.path.join(GUIA, nombre), encoding="utf-8") as fh:
        return fh.read()


mcp = MCPServer(name="max-editor", title="MAX EDITOR", version="1.0",
                instructions=leer_doc("0_instrucciones.md"),
                description="Make AI music edits with MiniMax H3 in MAX EDITOR (local app on ComfyUI), visible to the creative.")


@mcp.custom_route("/salud", methods=["GET"])
async def salud(peticion):
    """Para arrancar.sh: ¿está vivo el MCP?"""
    from starlette.responses import JSONResponse
    return JSONResponse({"mcp": True, "app": URL_APP})


def herramienta(fn):
    """Las herramientas devuelven texto (y a veces imágenes) sin esquema de salida. Un fallo inesperado también llega al
    agente con su texto (el SDK lo escondería), para que pueda contarlo."""
    @functools.wraps(fn)
    async def envuelta(*a, **k):
        try:
            return await fn(*a, **k)
        except ErrorAgente:
            raise
        except Exception as exc:
            raise ErrorAgente(f"unexpected error ({exc.__class__.__name__}: {exc}). Tell the creative the exact message; logs: app/servidor.log, app/salidas/mcp.log") from exc
    return mcp.tool(structured_output=False)(envuelta)


# ------------------------------------------------------------------ hablar con la app
# lo que el agente puede hacer ante los errores de la app que más salen (31 oct: nunca la clave interna ni texto en español)
QUE_HACER = {"errores.cola.": "ComfyUI is busy: wait until its queue is empty (status), then try again.",
             "errores.refmod_existe": "That RefMod name is taken: choose another name.",
             "errores.sin_foto": "The photo of that reference is not in ComfyUI/input: upload it with upload_photo."}


def error_de_app(d) -> str:
    """El error de una ruta de la app, en inglés y con qué hacer."""
    if not isinstance(d, dict):
        return f"the app refused the request: {d}"
    clave, texto = d.get("clave") or "", (d.get("error") or "").strip()
    que = next((v for k, v in QUE_HACER.items() if clave.startswith(k)), "")
    return " ".join(x for x in (texto or "the app refused the request.", que) if x)


class App:
    def __init__(self):
        self.plantilla = None
        self.actual = ""                    # el proyecto de esta sesión (el último abierto o creado)

    async def pedir(self, metodo: str, ruta: str, cuerpo=None, espera: float = 60, ok=(200,)):
        try:
            async with httpx.AsyncClient(timeout=espera) as c:     # idioma=en: los errores de la app llegan en inglés
                # se añade a la ruta (con params=, httpx tiraba la consulta que ya traía: ?video=, ?proyecto=…)
                r = await c.request(metodo, URL_APP + ruta + ("&" if "?" in ruta else "?") + "idioma=en", json=cuerpo)
        except httpx.HTTPError as exc:
            raise ErrorAgente(f"MAX EDITOR does not answer at {URL_APP} ({exc.__class__.__name__}). Start it with app/arrancar.sh") from exc
        try:
            d = r.json()
        except ValueError:
            d = {"error": r.text[:300]}
        if r.status_code not in ok:
            raise ErrorAgente(error_de_app(d))
        return d

    async def plantilla_(self) -> dict:
        if self.plantilla is None:
            self.plantilla = await self.pedir("GET", "/app/plantilla")
        return self.plantilla

    def nombre(self, proyecto: str | None) -> str:
        n = (proyecto or self.actual or "").strip()
        if not n:
            raise ErrorAgente("no project is open: call abrir_proyecto or crear_proyecto first")
        return n

    async def proyecto(self, nombre: str) -> Proyecto:
        d = await self.pedir("GET", "/app/proyecto/" + urllib.parse.quote(nombre), ok=(200, 404))
        if "error" in d:
            raise ErrorAgente(f"there is no project «{nombre}» (see listar_proyectos)")
        return Proyecto(d, await self.plantilla_())

    async def montar(self, p: Proyecto) -> None:
        r = await self.pedir("POST", "/edit_prompt_llm/montar", {**p.cuerpo_montar(), "idioma": "en"}, espera=120)
        p.aplicar_montaje(r)

    async def cambiar(self, proyecto: str | None, cambio) -> tuple[Proyecto, object]:
        """Lee el proyecto, aplica `cambio(p)`, vuelve a montar el prompt y lo guarda con base_rev; si la página guardó entre
        medias (409), lo repite sobre lo nuevo una vez. Devuelve (proyecto guardado, lo que devolvió `cambio`)."""
        nombre = self.nombre(proyecto)
        if nombre == agente.EJEMPLO:
            raise ErrorAgente("«ejemplo» is read-only: create your own project with crear_proyecto(copiar_de='ejemplo')")
        for intento in range(3):
            p = await self.proyecto(nombre)
            res = cambio(p)
            if asyncio.iscoroutine(res):
                res = await res
            await self.montar(p)
            r = await self.pedir("POST", "/app/proyecto/" + urllib.parse.quote(nombre),
                                 {"valores": p.datos["valores"], "autor": "agente", "base_rev": int(p.datos.get("rev") or 0),
                                  "agente": p.datos.get("agente") or {"marcas": []}}, ok=(200, 409))
            if "error" not in r:
                p.datos.update(rev=r["rev"], guardado=r["guardado"], autor="agente")
                self.actual = nombre
                return p, res
        raise ErrorAgente("the project keeps changing in the page (the creative is editing it): try again in a moment")


APPC = App()


def resumen(p: Proyecto) -> str:
    """Una línea del proyecto (31 oct: crear y abrir ya no devuelven el proyecto entero; para eso está ver_proyecto)."""
    tam = p.tamano()
    tags = ", ".join(p.etiquetas()) or "none"
    return (f"«{p.nombre}» · {f'{tam[0]}×{tam[1]}' if tam else 'no size'} · {p.duracion:.3f} s · {p.n_tomas} shots · "
            f"references: {tags} · seed {p.semilla()}.")


def visto(p: Proyecto) -> str:
    """El final de cada cambio (31 oct, reglas de respuesta): dónde quedó guardado y, en líneas «Check:», lo que es válido
    pero seguramente está mal (citas a referencias quitadas, tomas con el lugar en manos del LLM y sin texto)."""
    checks = list(getattr(p, "checks", None) or [])
    for k, t in enumerate(p.plan.get("tomas") or [], 1):
        if t.get("entorno") == "auto" and not (t.get("lugar") or "").strip() and (t.get("momento") or "").strip():
            checks.append(f"Check: shot {k} has environment auto and an empty place: only the local LLM fills it (write "
                          "place, or environment none)")
    return "\n".join([f"Saved in «{p.nombre}» (rev {p.datos.get('rev')})."] + checks)


# ------------------------------------------------------------------ estado y guía
@herramienta
async def estado() -> str:
    """Health of everything MAX EDITOR needs, and whether the GPU is free right now. Call it first, and again before generar.
    Reports: the app, ComfyUI, the SDK proxy, the local LLM, ComfyUI's own queue, the app's job queue (Cola) and free VRAM."""
    s = await APPC.pedir("GET", "/app/salud")
    cola = await APPC.pedir("GET", "/app/cola")
    lin = [f"App: {URL_APP} ✓ · ComfyUI {'✓' if s.get('comfyui') else '✗'} · SDK proxy {'✓' if s.get('proxy') else '✗'} · "
           f"local LLM {'✓' if s.get('llm') else '✗ (optional: only «Escribir tomas» / «Describir» need it)'}"]
    ocupado = []
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            q = (await c.get(s["comfyui_url"] + "/queue")).json()
            st = (await c.get(s["comfyui_url"] + "/system_stats")).json()
        corriendo, pendiente = len(q.get("queue_running") or []), len(q.get("queue_pending") or [])
        lin.append(f"ComfyUI queue: {corriendo} running, {pendiente} waiting")
        if corriendo or pendiente:
            ocupado.append("ComfyUI is busy (maybe the creative's own work)")
        for d in st.get("devices") or []:
            libre, total = d.get("vram_free", 0) / 2 ** 30, d.get("vram_total", 0) / 2 ** 30
            lin.append(f"GPU {d.get('name', '?')}: {libre:.1f} of {total:.1f} GB free")
            lin.append("Limits and times for this GPU: " + _clase(total)[2])
    except Exception:
        lin.append("ComfyUI queue: could not read it")
    activos = [x for x in cola["trabajos"] if x["estado"] in ACTIVOS]
    lin.append(f"App queue (Cola): {len(activos)} active{' · PAUSED' if cola.get('pausada') else ''}"
               + "".join(f"\n  - {x['id']} {x['tipo']} «{x['proyecto']}» {x['estado']} {round((x.get('avance') or 0) * 100)}%"
                         f"{' · by the agent' if x.get('origen') == 'agente' else ''}" for x in activos))
    if activos:
        ocupado.append("the app queue is working")
    lin.append("GPU free now: " + ("NO — " + "; ".join(ocupado) + ". New jobs wait their turn." if ocupado else "yes"))
    if s.get("version_nueva"):
        lin.append("The app's code changed since it started: the header shows «Versión nueva · Reiniciar». Restarting is the "
                   "creative's call (it also restarts this MCP: you will have to reconnect), and only with the queue empty.")
    if APPC.actual:
        lin.append(f"Open project in this session: «{APPC.actual}»")
    return "\n".join(lin)


@herramienta
async def leer_guia(tema: str = "indice") -> str:
    """Read a chapter of the MAX EDITOR agent guide. tema: indice (list) · mapa (the app, its steps and which tool touches
    which zone) · h3 (what MiniMax H3 does and does not do) · organizar (shots, fields, references, text, song) · prompts
    (writing for H3, before/after) · revisar (judging a result, what to change first) · creativo (working with the creative)
    · recetas (step-by-step flows with tool calls) · errores (problems and ways out) · extender (make a video longer, same
    shot). Same text as the guia:// resources."""
    tema = (tema or "indice").strip().lower()
    tema = TEMAS_VIEJOS.get(tema, tema)
    if tema in TEMAS:
        return leer_doc(TEMAS[tema])
    return ("MAX EDITOR agent guide. Chapters:\n- h3 (guia://h3): what we measured about the model; read it before writing "
            "shots\n- proyecto (guia://proyecto): how fields become the prompt, what each reference role does\n- trampas "
            "(guia://trampas): known traps and the way out\n- retocar (guia://retocar): retouch, extend, enhance, join")


def _recurso(tema: str, archivo: str):
    @mcp.resource(f"guia://{tema}", name=tema, title=f"Guide · {tema}", mime_type="text/markdown",
                  description=f"MAX EDITOR agent guide, chapter «{tema}»")
    def _leer() -> str:
        return leer_doc(archivo)
    return _leer


for _tema, _archivo in TEMAS.items():
    _recurso(_tema, _archivo)
for _tema, _nuevo in TEMAS_VIEJOS.items():       # los recursos viejos (guia://mapa…) dan el capítulo nuevo
    _recurso(_tema, TEMAS[_nuevo])


# ------------------------------------------------------------------ proyectos
@herramienta
async def listar_proyectos() -> str:
    """The projects in the app (header › «Proyecto» list), newest first. «ejemplo», if there is one, is read-only: copy it with crear_proyecto."""
    ps = await APPC.pedir("GET", "/app/proyectos")

    def resumen(r: dict) -> str:
        if not r:
            return ""
        refs = ", ".join(x.get("nombre") or x.get("refmod") or "?" for x in r.get("refs") or [])
        return (f" · {r.get('tomas') or 0} shots · {r.get('n_refs') or 0} refs{' (' + refs + ')' if refs else ''}"
                f" · {'song' if r.get('cancion') else 'no song'}" + (f" · idea: {r['idea']}" if r.get("idea") else ""))
    return "\n".join(f"- {p['nombre']} · saved {p.get('guardado') or '?'} · rev {p.get('rev', 0)}"
                     f"{' · last change by the agent' if p.get('autor') == 'agente' else ''}{resumen(p.get('resumen') or {})}"
                     for p in ps) or "(no projects)"


@herramienta
async def abrir_proyecto(nombre: str) -> str:
    """Make a project the current one for this session and describe it as the page shows it. It does not change the page:
    the creative opens it there from the header (or it is already open)."""
    p = await APPC.proyecto(nombre)
    APPC.actual = p.nombre or nombre
    await APPC.montar(p)
    return f"Current project: {resumen(p)} Ask the creative to open it in the page (header › «Proyecto»). view_project shows " \
           "everything."


@herramienta
async def crear_proyecto(nombre: str, copiar_de: str = "") -> str:
    """Create a NEW project (empty, or a copy of another one with copiar_de). It never overwrites: if the name exists, it fails.
    The creative sees it in the header › «Proyecto» list. It becomes the current project of this session."""
    nombre = nombre.strip()
    if copiar_de:
        valores = (await APPC.proyecto(copiar_de)).datos["valores"]
    else:
        valores = {}
    r = await APPC.pedir("POST", "/app/proyecto/" + urllib.parse.quote(nombre),
                         {"valores": valores, "nuevo": True, "autor": "agente", "agente": {"marcas": []}}, ok=(200, 400, 409))
    if "error" in r:
        raise ErrorAgente(f"could not create «{nombre}»: {r['error']} (it is never overwritten: choose another name)")
    APPC.actual = nombre
    p, _ = await APPC.cambiar(nombre, lambda p: None)
    return f"Created{' as a copy of «' + copiar_de + '»' if copiar_de else ''}: {resumen(p)} It is now the current project. " \
           "Ask the creative to open it in the page (header › «Proyecto»)."


@herramienta
async def ver_proyecto(proyecto: str = "", con_prompt: bool = False) -> str:
    """The project told zone by zone as the page shows it: header (resolution, seed), step 1 References (Principal /
    Secundarias, tags <Picture N>), step 2 Timeline (shots with times, text track, song), every shot panel, the sound, the
    gaps the page reports and, with con_prompt, the final prompt H3 receives. Read it before changing anything."""
    p = await APPC.proyecto(APPC.nombre(proyecto))
    await APPC.montar(p)
    return agente.describir(p, con_prompt)


# ------------------------------------------------------------------ referencias y canción
@herramienta
async def listar_refmods(buscar: str = "") -> str:
    """The RefMods library (what the «+» of the References shelf opens): name, kind (image/video), concept and description.
    buscar filters by text. Add one to the project with poner_referencia(refmod=<name>)."""
    lib = await APPC.pedir("GET", "/minimax_h3/refmods")
    b = buscar.lower().strip()
    lin = []
    for it in lib.get("items") or []:
        texto = f"{it['name']} {it.get('label', '')} {it.get('concept', '')} {it.get('desc', '')} {it.get('appearance', '')}".lower()
        if b and b not in texto:
            continue
        vis = it.get("visual") or {}
        lin.append(f"- {it['name']} · {vis.get('kind', '?')}{' (box of ' + str(vis.get('t')) + ' photos)' if vis.get('source') == 'stack' else ''}"
                   f" · concept {it.get('concept') or '—'}" + (f" · {agente._corto(it.get('appearance') or it.get('desc'), 120)}"
                                                               if it.get("appearance") or it.get("desc") else ""))
    return "\n".join(lin[:150]) or "(nothing matches)"


@herramienta
async def poner_referencia(refmod: str, papel: str = "", nombre: str | None = None, ficha: str | None = None,
                           pronombre: str | None = None, principal: bool | None = None, atuendo: str | None = None,
                           proyecto: str = "") -> str:
    """Add a RefMod to the project (step 1 «Referencias»), or change one already there. It gets its tag (<Picture N> or
    <Video N>) by its place in the Stack: tags of later cards can shift; shots are re-mapped for you.
    papel (role): personaje (who it is, the character) · objeto (a product that does not change) · lugar (a fixed place) ·
    ropa (only the clothes) · pose · fondo (only the background) · estilo · efecto (an effect or a whole reference clip) ·
    letra (the font of a word in the text track).
    nombre: short name in English that goes into the prompt («Nora», «red racing jacket»); for personaje, references with the
    same name are the same character. ficha: one English sentence of what the image shows (H3 reads it; for an effect clip,
    describe its MOTION step by step). pronombre: they/she/he (personaje). principal: true = goes in every shot (the
    character starts there), false = only in the shots that cite it. atuendo: for a personaje photo that is also an outfit."""
    lib = await APPC.pedir("GET", "/minimax_h3/refmods")
    item = next((it for it in lib.get("items") or [] if it["name"] == refmod), None)

    def cambio(p: Proyecto):
        nonlocal item
        if item is None:
            en = next((x for x in p.picks() if x and x.get("name") == refmod), None)
            if not en:
                raise ErrorAgente(f"there is no RefMod «{refmod}» (see listar_refmods)")
            item = {"name": refmod, "label": en.get("label")}
        return p.poner_referencia(item, papel, nombre, ficha, pronombre, principal, atuendo)
    p, tag = await APPC.cambiar(proyecto, cambio)
    r = next(x for x in p.referencias() if x["clave"] == refmod)
    return (f"{refmod} is {tag} · role {r['papel']} · {'Principal (every shot)' if r['en_todas'] else 'Secundaria (cite it in shots)'}."
            f" Page: step 1, Principal / Secundario. Current tags: {', '.join(t for t in p.etiquetas())}.\n" + visto(p))


@herramienta
async def quitar_referencia(ref: str, proyecto: str = "") -> str:
    """Take a reference out of the project (by its tag <Picture N> or its RefMod name). The RefMod stays in the library. The
    shots that cited it lose that citation; the other tags may shift (they are re-mapped)."""
    p, clave = await APPC.cambiar(proyecto, lambda p: p.quitar_referencia(ref))
    return f"Removed «{clave}» from step 1 «Referencias». Tags now: {', '.join(p.etiquetas()) or 'none'}.\n" + visto(p)


@herramienta
async def poner_efecto_texto(frase: str, nombre: str = "", proyecto: str = "") -> str:
    """A text-only effect (E1, E2…), with no image: its English sentence goes into a shot right after the framing. Use it
    for drawing changes that need no example (e.g. «face redrawn as clean line art with a flat fill»). Cite it in a shot
    with escribir_toma(conectar=['E1'])."""
    p, eid = await APPC.cambiar(proyecto, lambda p: p.poner_efecto_texto(nombre, frase))
    return f"Text effect {eid} created (step 1, after the references). Connect it to a shot with escribir_toma(conectar=['{eid}']).\n" + visto(p)


@herramienta
async def listar_canciones() -> str:
    """The songs the app can use (audio files in ComfyUI's input/ folder), newest first, with their length."""
    r = await APPC.pedir("POST", "/edit_prompt_llm/audios", {})
    return "\n".join(f"- {a['nombre']} · {a['mb']} MB · {a['fecha']}" for a in r.get("audios") or []) or "(no songs in ComfyUI/input/)"


@herramienta
async def poner_cancion(archivo: str, inicio_s: float = 0.0, proyecto: str = "") -> str:
    """Put the song under the timeline and choose the segment that starts at inicio_s seconds (it lasts as long as the edit).
    THE CREATIVE CHOOSES THE SEGMENT: ask them where it starts; do not pick «the best moment» yourself. The app writes the
    cut and H3 hears only that part. Visible in step 2, the waveform under the shots."""
    info = await APPC.pedir("POST", "/edit_prompt_llm/audio_info", {"audio": archivo}, espera=120, ok=(200, 400, 404))
    if "error" in info:
        raise ErrorAgente(f"cannot read the song «{archivo}»: {info['error']} (see listar_canciones)")
    total = float(info.get("duracion") or 0)

    async def cambio(p: Proyecto):
        dur = p.duracion
        ini = min(max(0.0, round(float(inicio_s) * agente.FPS) / agente.FPS), max(0.0, int((total - dur) * agente.FPS) / agente.FPS))
        r = await APPC.pedir("POST", "/edit_prompt_llm/audio_recortar", {"audio": archivo, "inicio": ini, "dur": dur}, espera=120)
        p.poner_audio(archivo, ini, r["nombre"])
        return ini
    p, ini = await APPC.cambiar(proyecto, cambio)
    aviso = "" if abs(ini - float(inicio_s)) < 0.05 else f" (moved to {ini} s so the segment fits in the song)"
    return f"Song «{archivo}» ({total:.1f} s) from {ini} s for {p.duracion} s{aviso}. Page: step 1, under the shots.\n" + visto(p)


async def _recortar_de_nuevo(p: Proyecto) -> None:
    """Si la duración cambió y la canción tenía tramo, se vuelve a escribir el recorte (audio.js, al guardar)."""
    a = p.audio()
    if a and a["tocado"]:
        r = await APPC.pedir("POST", "/edit_prompt_llm/audio_recortar", {"audio": a["original"], "inicio": a["inicio_s"], "dur": p.duracion},
                             espera=120)
        p.poner_audio(a["original"], a["inicio_s"], r["nombre"])


# ------------------------------------------------------------------ línea de tiempo y tomas
@herramienta
async def poner_duracion(segundos: float, proyecto: str = "") -> str:
    """Total length of the edit. H3 only makes 17·k+5 frames at 24 fps (22, 39, 56 … 124 = 5.167 s … 243 = 10.125 s): it is
    snapped to the nearest valid length. Hand-placed cuts stretch in proportion. Visible in step 2 (the timeline title)."""
    async def cambio(p: Proyecto):
        r = p.poner_duracion(segundos)
        p.marcar("duracion")
        await _recortar_de_nuevo(p)
        return r
    p, r = await APPC.cambiar(proyecto, cambio)
    return f"Edit length: {r['segundos']} s = {r['fotogramas']} frames.\n" + visto(p)


@herramienta
async def poner_tomas(n: int, duraciones: list[float] | None = None, proyecto: str = "") -> str:
    """Number of shots on the timeline and, optionally, how long each one lasts in seconds (then the edit length becomes their
    sum, snapped to 17·k+5 frames, and the cuts are fixed «by hand»). Without duraciones the cuts fall on the song's beats.
    Each shot ≥ 0.4 s; 0.4–0.5 s shots tend to get lost; about 10 shots per 10 s work. Shots beyond n are removed from the
    end (use quitar_toma to remove one in the middle). Visible in step 2, the coloured boxes."""
    async def cambio(p: Proyecto):
        p.poner_tomas(n, duraciones)
        p.marcar("duracion")
        for k in range(1, p.n_tomas + 1):
            p.marcar("toma", k)
        await _recortar_de_nuevo(p)
    p, _ = await APPC.cambiar(proyecto, cambio)
    lin = [f"{p.n_tomas} shots in {p.duracion} s ({p.fotogramas()} frames):"]
    lin += [f"- Shot {k}: {a:.3f}–{b:.3f} s ({b - a:.3f} s)" for k, (a, b) in enumerate(p.duraciones(), 1)]
    return "\n".join(lin) + "\n" + visto(p)


@herramienta
async def quitar_toma(k: int, proyecto: str = "") -> str:
    """Remove shot k (1…n) from the timeline; the others share its time (like the ✕ of a shot box)."""
    p, _ = await APPC.cambiar(proyecto, lambda p: p.quitar_toma(k))
    return f"Shot {k} removed: {p.n_tomas} shots now.\n" + visto(p)


@herramienta
async def escribir_toma(k: int, momento: str | None = None, gesto: str | None = None, lugar: str | None = None,
                        entorno: str | None = None, encuadre: str | None = None, camara: str | None = None,
                        luz: str | None = None, estilo: str | None = None, efecto_frase: str | None = None,
                        fondo_ref: str | None = None, conectar: list[str] | None = None, desconectar: list[str] | None = None,
                        proyecto: str = "") -> str:
    """Write the fields of shot k's panel (panel de la toma), in ENGLISH (they go to H3 as is). Only the fields you pass
    change; "" empties one. Every field you write is locked (candado) so the local LLM will not rewrite it.
    momento = «Action / movement» (Acción / movimiento), THE MAIN FIELD: what happens, one clear action.
    gesto = gesture of <Subject 1>. lugar = the place, described by what is seen (shapes, colours, light) — writing it sets
    entorno «manual». entorno: auto (the LLM picks the place) · manual · ninguno (no place: for effect-only or reel shots).
    encuadre (framing): extreme close-up · close-up · medium shot · full shot, or your own. camara: what follows «the camera …»
    (e.g. «slowly pushes in on her face»); framing and camera must ask for the same thing. luz: light (optional).
    estilo: style of this shot (empty = the style of the references). efecto_frase: overrides the effect's card in this shot.
    fondo_ref: a reference with role fondo for this shot's background. conectar / desconectar: tags (<Picture N>, <Video N>,
    E1) to add to / remove from this shot — a fondo/lugar/ropa/pose/objeto goes to its own field, the rest to the shot's
    references. Cite references inside text as <Picture N>; the character is <Subject 1>."""
    campos = {"momento": momento, "gesto": gesto, "lugar": lugar, "entorno": entorno, "encuadre": encuadre, "camara": camara,
              "luz": luz, "estilo": estilo, "efecto_frase": efecto_frase, "fondo_ref": fondo_ref}
    p, hechos = await APPC.cambiar(proyecto, lambda p: p.escribir_toma(k, campos, conectar, desconectar))
    linea = next((ln for ln in (p.estado().get("prompt") or "").splitlines() if ln.startswith(f"[Shot {int(k)}]")), "")
    return (f"Shot {k}: {', '.join(hechos) or 'nothing changed'}. Page: step 1, shot {k}.\n"
            f"Its line in the final prompt:\n{linea}\n" + visto(p))


@herramienta
async def poner_texto(textos: list[dict], proyecto: str = "") -> str:
    """Replace the whole text track (fila de texto, above the shots): words on screen. Each item: {texto, t (start s),
    fin (end s, or null = end of its shot), sitio: «encima» (over the image) | «al_lado» (beside the face), letra: tag of a
    reference with role letra (optional), frase: how it looks/moves, in English (e.g. «slams in letter by letter as huge
    glowing letters»)}. [] empties it. Few, big words work; the typography is a protagonist."""
    p, _ = await APPC.cambiar(proyecto, lambda p: p.poner_textos(textos))
    return f"Text track: {len(textos)} item(s). Page: step 1, the text row.\n" + visto(p)


@herramienta
async def poner_resolucion(ancho: int = 0, alto: int = 0, megapixeles: float = 0, orientacion: str = "vertical",
                           proyecto: str = "") -> str:
    """Video size (header › «Resolución»), in multiples of 32. Give ancho+alto, or megapixeles (0.1–2) with orientacion
    vertical|horizontal. Any aspect ratio works: keep the one the creative chose. Quality vs VRAM: 1 MP (768×1344) keeps identity best; on a 12 GB
    GPU, 5 s at 1 MP takes ~16 min; quick tests: 960×544 / 544×960 (0.52 MP) at 22 frames take ~2–3 min."""
    def cambio(p: Proyecto):
        if megapixeles:
            a, b = agente.medidas(megapixeles, 9 / 16 if orientacion != "horizontal" else 16 / 9)
        elif ancho and alto:
            a, b = ancho, alto
        else:
            raise ErrorAgente("give ancho and alto, or megapixeles")
        return p.poner_tamano(a, b)
    p, (a, b) = await APPC.cambiar(proyecto, cambio)
    return f"Resolution {a}×{b} ({agente.megapixeles(a, b)} MP). Page: header.\n" + visto(p)


@herramienta
async def poner_semilla(semilla: int | None = None, proyecto: str = "") -> str:
    """The video seed (header, next to «Generar»). Without a number, a new random one («otra semilla»). The seed weighs a lot:
    before blaming the prompt, try another seed. Changing the resolution also changes the draw."""
    import random
    s = int(semilla) if semilla is not None else random.randrange(2 ** 32)
    p, _ = await APPC.cambiar(proyecto, lambda p: p.poner_semilla(s))
    return f"Seed {s}. Page: header.\n" + visto(p)


@herramienta
async def poner_sonido(descripcion: str | None = None, audio_salida: str | None = None, proyecto: str = "") -> str:
    """The sound line at the bottom of step 2 («Sonido», under the waveform), in English; empty = just the music (safest:
    asking for whooshes/hits put bangs into the song). audio_salida: «cancion» = the video keeps the song as is (default,
    recommended) · «modelo» = the audio H3 generates."""
    def cambio(p: Proyecto):
        e = p.estado()
        if descripcion is not None:
            e["sonido"] = descripcion.strip()
        if audio_salida is not None:
            if audio_salida not in agente.AUDIOS_SALIDA:
                raise ErrorAgente("audio_salida must be «cancion» or «modelo»")
            e["audio_salida"] = audio_salida
        p.marcar("sonido")
    p, _ = await APPC.cambiar(proyecto, cambio)
    e = p.estado()
    return f"Sound: {e['sonido'] or '(just the music)'} · video audio: {e['audio_salida']}.\n" + visto(p)


# ------------------------------------------------------------------ revisar y generar
@herramienta
async def revisar_proyecto(proyecto: str = "") -> str:
    """Check the project before generating: ERRORS block Generate (invalid length, cited references that do not
    exist…) and WARNINGS are lessons from real tests (empty main field, negations in the camera, too-short shots, two
    identical shots, heavy for 12 GB…). Also says if the GPU is busy. Fix errors; tell the creative the
    warnings that matter."""
    p = await APPC.proyecto(APPC.nombre(proyecto))
    await APPC.montar(p)
    errores, avisos = agente.revisar(p)
    lin = [f"Project «{p.nombre}»: {p.n_tomas} shots, {p.duracion} s ({p.fotogramas()} f), {'×'.join(map(str, p.tamano() or ()))}"]
    lin += ["ERRORS (Generate will fail):"] + [f"- {x}" for x in errores] if errores else ["No errors."]
    lin += ["Warnings:"] + [f"- {x}" for x in avisos] if avisos else ["No warnings."]
    lin.append("\n" + await estado())
    return "\n".join(lin)


# lo medido por tamaño de GPU (31 oct: los tiempos ya no van escritos para la 3060; los da la GPU de verdad)
GPUS = [(20, 0.55, "24 GB class (measured on RTX 3090 / A5000): 5 s at 1 MP ≈ 9 min · 6.6 s at 1.5 MP fits (≈ 13 min) · "
                   "12 s at 1 MP fits · 12 s at 1.2 MP does not"),
        (10, 1.0, "12 GB class (measured on RTX 3060): 22 f at 0.52 MP ≈ 3 min · 5 s at 0.52 MP ≈ 9 min · 5 s at 1 MP ≈ "
                  "13–18 min · 8 s at 1 MP does not fit"),
        (0, 1.4, "under 10 GB: untested — keep to short tests at 0.5 MP")]


async def _gpu() -> tuple[str, float]:
    """(nombre, GB) de la GPU de ComfyUI; ('', 12) si no se puede leer."""
    try:
        s = await APPC.pedir("GET", "/app/salud")
        async with httpx.AsyncClient(timeout=5) as c:
            d = ((await c.get(s["comfyui_url"] + "/system_stats")).json().get("devices") or [{}])[0]
        return d.get("name", ""), d.get("vram_total", 0) / 2 ** 30
    except Exception:
        return "", 12.0


def _clase(gb: float):
    return next(x for x in GPUS if gb >= x[0])


def _minutos(p: Proyecto, gb: float = 12.0) -> float:
    """Una idea del tiempo (medido en la 3060: 22 f a 0,52 MP ≈ 2,3 min; 124 f a 1 MP ≈ 16 min), escalada por la GPU."""
    tam = p.tamano() or (544, 960)
    return round((1.5 + 14.5 * agente.megapixeles(*tam) * p.fotogramas() / 128) * _clase(gb)[1], 1)


@herramienta
async def generar(n: int = 1, semilla: int | None = None, confirmado: bool = False, proyecto: str = "") -> str:
    """Queue the edit (header › «Generar» / «Encolar ×N»). Each job takes a frozen copy of the project: later edits do not
    change it. n = 1 uses the project's seed (or `semilla`); n > 1 uses n random seeds (to compare draws). At most 4 per call
    and 6 of yours waiting. Long or heavy jobs need confirmado=true after the creative agrees. The page shows it in «Cola»
    marked «✎ agente»; follow it with ver_cola, then look at it with ver_video."""
    nombre = APPC.nombre(proyecto)
    if not 1 <= int(n) <= MAX_POR_LLAMADA:
        raise ErrorAgente(f"n must be 1–{MAX_POR_LLAMADA} per call (ask the creative before queueing many)")
    cola = await APPC.pedir("GET", "/app/cola")
    mios = [x for x in cola["trabajos"] if x.get("origen") == "agente" and x["estado"] in ACTIVOS]
    if len(mios) + int(n) > MAX_PENDIENTES:
        raise ErrorAgente(f"you already have {len(mios)} jobs waiting (limit {MAX_PENDIENTES}): wait, or cancel some")

    def cambio(p: Proyecto):
        if semilla is not None:
            p.poner_semilla(int(semilla))
    p, _ = await APPC.cambiar(nombre, cambio)
    errores, avisos = agente.revisar(p)
    if errores:
        raise ErrorAgente("cannot generate yet:\n- " + "\n- ".join(errores))
    gpu, gb = await _gpu()
    minutos = round(_minutos(p, gb) * int(n), 1)
    if minutos > 12 and not confirmado:
        raise ErrorAgente(f"this is about {minutos} min of GPU on this {gpu or 'GPU'} ({p.fotogramas()} frames at "
                          f"{agente.megapixeles(*(p.tamano() or (544, 960)))} MP × {n}). Ask the creative, then call again with "
                          "confirmado=true. For a quick test: poner_duracion(0.917) (22 frames) and a low resolution.")
    r = await APPC.pedir("POST", "/app/cola", {"tipo": "generar", "valores": p.datos["valores"], "semilla": p.semilla(),
                                               "proyecto": nombre, "n": int(n), "origen": "agente"})
    delante = len([x for x in cola["trabajos"] if x["estado"] in ACTIVOS])
    return (f"Queued {len(r['ids'])} job(s): {', '.join(r['ids'])} (seed {p.semilla() if int(n) == 1 else 'random'}). "
            f"{delante} job(s) ahead. Rough time: ~{_minutos(p, gb)} min each on this GPU. Page: «Cola». Wait for it with "
            "esperar(id), then ver_video." + (f"\n{len(avisos)} warning(s): see revisar_proyecto." if avisos else ""))


@herramienta
async def ver_cola(id: str = "") -> str:
    """The app's job queue (header › «Cola»): what runs, what waits, what finished, with progress and the video of each done
    job. With id, only that job. Poll every 30–60 s while one runs; do not hammer it."""
    if id:
        x = await APPC.pedir("GET", "/app/cola/" + urllib.parse.quote(id), ok=(200, 404))
        if "error" in x:
            raise ErrorAgente(f"there is no job {id}")
        ts = [x]
    else:
        c = await APPC.pedir("GET", "/app/cola")
        ts = c["trabajos"][-15:]
    lin = []
    for x in ts:
        lin.append(f"- {x['id']} · {x['tipo']} «{x['proyecto']}» · {x['estado']} {round((x.get('avance') or 0) * 100)}% · seed "
                   f"{x.get('semilla')} · {round(x.get('segundos') or 0)} s{' · by the agent' if x.get('origen') == 'agente' else ''}"
                   + (f" · video {x['video']}" if x.get("video") else "") + (f" · {x['mensaje']}" if x.get("mensaje") and x['estado'] != 'hecho' else ""))
    return "\n".join(lin) or "(the queue is empty)"


@herramienta
async def esperar(id: str, max_segundos: int = 240) -> str:
    """Wait until a queued job ends (hecho / error / cancelado / interrumpido) or max_segundos pass (at most 240: some clients
    cut a silent tool at 300 s), checking
    every 10 s on the server, then report it like ver_cola. Use it instead of polling when you cannot schedule a wake-up;
    call it again if the job is still running. A 22-frame test takes ~3 min, plus the jobs ahead of it."""
    t0, limite = time.time(), max(10, min(240, int(max_segundos)))
    while True:
        x = await APPC.pedir("GET", "/app/cola/" + urllib.parse.quote(id), ok=(200, 404))
        if "error" in x:
            raise ErrorAgente(f"there is no job {id}")
        if x["estado"] not in ACTIVOS or time.time() - t0 > limite:
            break
        await asyncio.sleep(10)
    fin = "" if x["estado"] not in ACTIVOS else f" — still {x['estado']} after {round(time.time() - t0)} s: call esperar again"
    return await ver_cola(id) + fin + ("\nNext: ver_video(video=…) to look at it." if x["estado"] == "hecho" else "")


@herramienta
async def cancelar(id: str) -> str:
    """Cancel a queued or running job (only jobs you or the creative asked for; never cancel the creative's jobs without asking)."""
    r = await APPC.pedir("POST", f"/app/cola/{urllib.parse.quote(id)}/cancelar", {}, ok=(200, 404))
    if "error" in r:
        raise ErrorAgente(f"there is no job {id}")
    return f"Job {id}: {r.get('estado', 'cancelled')}."


@herramienta
async def reintentar(id: str) -> str:
    """Queue again a job that ended in error, cancelled or interrupted (same frozen copy, same seed)."""
    r = await APPC.pedir("POST", f"/app/cola/{urllib.parse.quote(id)}/reintentar", {}, ok=(200, 400, 404))
    if "error" in r:
        raise ErrorAgente(f"cannot retry {id}: {r['error']}")
    return f"Job {id} queued again."


# ------------------------------------------------------------------ resultados
@herramienta
async def listar_videos(proyecto: str = "", todos: bool = False) -> str:
    """The videos of a project, newest first (header › «Videos»): generated edits, retouches, extensions, enhancements
    (mejora) and Editing exports (montaje), with seed and date. «prompt ✓» = retomar_prompt can load its values. todos=true:
    the whole library (every project, like the «Proyectos» window › «Biblioteca»); any of them can be retouched, extended,
    enhanced or put in Editing from the open project."""
    nombre = "" if todos else APPC.nombre(proyecto)
    vs = await APPC.pedir("GET", "/app/videos" + ("?proyecto=" + urllib.parse.quote(nombre) if nombre else ""))

    def extra(v: dict) -> str:
        t = v.get("tipo")
        if t == "retoque" and v.get("tramo"):
            return f" · retouch {v['tramo'].get('inicio')}–{v['tramo'].get('fin')} s"
        if t == "extension" and v.get("extension"):
            return f" · extension of {v.get('de')} (+{v['extension'].get('nuevos')} f from frame {v['extension'].get('desde')})"
        if t == "mejora":
            return (f" · enhancement of {v.get('de')}" + (f" · SR ×{v['superres'].get('escala')}" if v.get("superres") else "")
                    + (f" · HDR {v['hdr'].get('nits')} nits" if v.get("hdr") else ""))
        if t == "montaje" and v.get("montaje"):
            return f" · Editing export: {v['montaje'].get('clips')} clips, {v['montaje'].get('duracion')} s"
        return ""
    return "\n".join(f"- {v['archivo']} · {v.get('tipo') or 'edit'}" + (f" · «{v.get('proyecto') or '—'}»" if todos else "")
                     + f" · {v.get('fecha', '').replace('T', ' ')}" + (f" · seed {v['semilla']}" if v.get("semilla") is not None else "")
                     + extra(v) + (" · prompt ✓" if v.get("prompt_de") else "")
                     for v in vs) or (f"(no videos yet in «{nombre}»)" if nombre else "(the library is empty)")


async def _fotogramas(video: str, n: int, alto: int, desde: float = 0.0, hasta: float | None = None) -> tuple[list[bytes], list[float], dict]:
    info = await APPC.pedir("GET", "/app/video_info?video=" + urllib.parse.quote(video), ok=(200, 404))
    if "error" in info:
        raise ErrorAgente(f"cannot read the video «{video}»: {info['error']}")
    dur = float(info.get("duracion") or 0)
    hasta = min(dur, hasta if hasta is not None else dur)
    n = max(1, min(12, int(n)))
    tiempos = [round(desde + (hasta - desde) * (i + 0.5) / n, 3) for i in range(n)]
    url = URL_APP + "/app/video?video=" + urllib.parse.quote(video)

    def uno(t):
        r = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-ss", str(t), "-i", url, "-frames:v", "1", "-vf", f"scale=-2:{alto}",
                            "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "4", "-"], capture_output=True, timeout=60)
        if r.returncode or not r.stdout:
            raise ErrorAgente(f"ffmpeg could not read a frame at {t} s: {r.stderr.decode(errors='replace')[:200]}")
        return r.stdout
    imgs = await asyncio.gather(*(asyncio.to_thread(uno, t) for t in tiempos))
    return list(imgs), tiempos, info


@herramienta
async def ver_video(video: str = "", fotogramas: int = 6, desde: float = 0.0, hasta: float | None = None, proyecto: str = "") -> list:
    """LOOK at a result: returns 4–12 frames as images (evenly spread, or between desde and hasta seconds) plus its info
    (size, frames, length, seed). Without video, the newest video of the project. Judge it with guia://revisar: did each
    shot happen at its time, is the character the same, did the text appear, did the effect transform the image?"""
    nombre = APPC.nombre(proyecto)
    vs = await APPC.pedir("GET", "/app/videos?proyecto=" + urllib.parse.quote(nombre))
    if not video:
        if not vs:
            raise ErrorAgente(f"«{nombre}» has no videos yet (generar first, then ver_cola until it is done)")
        video = vs[0]["archivo"]
    fila = next((v for v in vs if v["archivo"] == video), {})
    imgs, tiempos, info = await _fotogramas(video, fotogramas, 384, desde, hasta)
    texto = (f"Video {video} · {info.get('ancho')}×{info.get('alto')} · {info.get('fotogramas')} frames · {info.get('duracion')} s · "
             f"{info.get('fps')} fps · audio {'yes' if info.get('audio') else 'no'}"
             + (f" · seed {fila.get('semilla')}" if fila.get("semilla") is not None else "")
             + f"\nFrames at: {', '.join(f'{t:.2f} s' for t in tiempos)} (in this order). The creative can play it in «Mis videos».")
    return [texto] + [Image(data=b, format="jpeg") for b in imgs]


# ------------------------------------------------------------------ retocar
def _datos_retoque(video, inicio, fin, todo, mascara_texto, rectangulo, prompt, referencias, semilla, megapixeles, proyecto):
    if mascara_texto and rectangulo:
        raise ErrorAgente("choose one mask: mascara_texto (SAM 3.1 finds it) OR rectangulo {x, y, w, h}")
    if mascara_texto:
        mascara = {"modo": "texto", "texto": mascara_texto.strip()}
    elif rectangulo:
        mascara = {"modo": "rectangulo", **{k: rectangulo.get(k) for k in ("x", "y", "w", "h")}}
    else:
        raise ErrorAgente("give the mask: mascara_texto (e.g. «logo», «face») or rectangulo {x, y, w, h} in video pixels")
    d = {"video": video, "mascara": mascara, "proyecto": proyecto, "megapixeles": megapixeles}
    if todo:
        d.update(inicio=0, fin=10 ** 6)
    else:
        if inicio is None or fin is None:
            raise ErrorAgente("give inicio and fin in seconds, or todo=true for the whole clip")
        d.update(inicio=float(inicio) + 0.001, fin=float(fin) + 0.001)
    refs = []
    for r in referencias or []:
        refs.append({"refmod": r} if not str(r).lower().endswith((".png", ".jpg", ".jpeg", ".webp")) else {"imagen": r})
    if len(refs) > 4:
        raise ErrorAgente("Retouch takes at most 4 references (<Picture 1>…<Picture 4>, in this order)")
    d["referencias"] = refs
    if prompt is not None:
        d["prompt"] = prompt.strip()
    d["semilla"] = int(semilla) if semilla is not None else None
    return d


@herramienta
async def ver_mascara(video: str, mascara_texto: str = "", rectangulo: dict | None = None, inicio: float | None = None,
                      fin: float | None = None, todo: bool = False, megapixeles: float = 0.18, proyecto: str = "") -> list:
    """Preview the Retouch mask before launching it (step «Retocar»): runs only the mask (SAM 3.1 for mascara_texto, or the
    rectangle) on the chosen segment and returns frames with the zone that will be redone painted PINK. Takes ~1–3 min on
    the GPU (it waits for it). Check that the pink covers exactly what must change, and nothing else."""
    nombre = APPC.nombre(proyecto)
    d = _datos_retoque(video, inicio, fin, todo, mascara_texto, rectangulo, None, [], None, megapixeles, nombre)
    r = await APPC.pedir("POST", "/app/retocar_mascara", d)
    t0 = time.time()
    while True:
        e = await APPC.pedir("GET", "/app/trabajo/" + r["id"])
        if e["estado"] in ("listo", "error"):
            break
        if time.time() - t0 > 420:
            raise ErrorAgente(f"the mask preview is still running after 7 min (job {r['id']}); try again later")
        await asyncio.sleep(3)
    if e["estado"] == "error":
        raise ErrorAgente(f"the mask preview failed: {e.get('mensaje')}")
    imgs, tiempos, _ = await _fotogramas(e["video"], 4, 384)
    return [f"Mask preview of «{video}» ({d['mascara']}): pink = the zone H3 will redo. Frames at "
            f"{', '.join(f'{t:.2f}' for t in tiempos)} s of the segment."] + [Image(data=b, format="jpeg") for b in imgs]


@herramienta
async def retocar(video: str, prompt: str, mascara_texto: str = "", rectangulo: dict | None = None, inicio: float | None = None,
                  fin: float | None = None, todo: bool = False, referencias: list[str] | None = None, semilla: int | None = None,
                  megapixeles: float = 0.18, n: int = 1, proyecto: str = "") -> str:
    """Retouch (step «Retocar»): H3 redoes ONLY the masked zone inside a segment of a video and the app pastes it back; the
    rest stays the same. video: a file from listar_videos. Segment: inicio–fin seconds or todo=true (internally rounded up to
    17·k+5 frames). Mask: mascara_texto (SAM 3.1 finds every object matching, e.g. «logo») or rectangulo {x, y, w, h} in
    video pixels. prompt: SHORT English sentence of how the zone must look, citing references as <Picture 1>… in the order
    of `referencias` (RefMod names or input images, max 4). Preview the mask first with ver_mascara. Retouch the ORIGINAL
    video again rather than chaining a retouch over a retouch. megapixeles: 0.12 fast · 0.18 normal · 0.35 high · 0.6 max.
    Visible in «Cola» (✎ agente) and then in «Mis videos» as a retouch."""
    nombre = APPC.nombre(proyecto)
    if not 1 <= int(n) <= MAX_POR_LLAMADA:
        raise ErrorAgente(f"n must be 1–{MAX_POR_LLAMADA}")
    if not prompt.strip():
        raise ErrorAgente("the retouch needs its prompt")
    d = _datos_retoque(video, inicio, fin, todo, mascara_texto, rectangulo, prompt, referencias, semilla, megapixeles, nombre)
    for m in __import__("re").finditer(r"<Picture (\d+)>", prompt):
        if int(m.group(1)) > len(d["referencias"]):
            raise ErrorAgente(f"the prompt cites <Picture {m.group(1)}> but only {len(d['referencias'])} reference(s) were given")
    if d["semilla"] is None:
        import random
        d["semilla"] = random.randrange(2 ** 32)
    r = await APPC.pedir("POST", "/app/cola", {"tipo": "retocar", "datos": d, "n": int(n), "origen": "agente"})
    return (f"Retouch queued: {', '.join(r['ids'])} (seed {d['semilla'] if int(n) == 1 else 'random'}). About 3–4 min per 39 "
            "frames at normal resolution. Visible in «Cola» (✎ agente); wait with esperar(id), then ver_video(video=<new file>).")


# ------------------------------------------------------------------ extender (planos/fases/12)
def _datos_extension(video, nuevos, solape, calidad, audio, prompt, referencias, semilla, proyecto):
    if audio not in ("entrada", "modelo"):
        raise ErrorAgente("audio must be «entrada» (keep the input audio: the song carries on) or «modelo» (H3's sound for the new part)")
    if calidad not in ("rapida", "media", "original"):
        raise ErrorAgente("calidad must be rapida (~0.25 MP, quick draft) · media (~0.5 MP) · original (the video's size)")
    refs = [{"refmod": r} if not str(r).lower().endswith((".png", ".jpg", ".jpeg", ".webp")) else {"imagen": r} for r in referencias or []]
    if len(refs) > 4:
        raise ErrorAgente("Extend takes at most 4 references (<Picture 1>…<Picture 4>, in this order)")
    return {"video": video, "nuevos": int(nuevos), "solape": int(solape), "calidad": calidad, "audio_salida": audio,
            "prompt": (prompt or "").strip(), "referencias": refs, "semilla": int(semilla) if semilla is not None else None,
            "proyecto": proyecto}


def _texto_plan(p: dict) -> str:
    fuente = ("from its SAVED LATENT (lossless)" if p["fuente"] == "latente"
              else f"from the mp4, re-encoded (loses a little colour; why: {p['por_que']})")
    if p["audio_salida"] == "modelo":
        audio = "original audio kept; the new part sounds with H3's audio"
    elif p["usa_cancion"]:
        audio = (f"the song «{p['cancion']['original']}» carries on where it was and is laid on top untouched"
                 + (" (song taken from the project as it is NOW: the video had no song noted)" if p["cancion_de"] == "proyecto" else "")
                 + (f"; WARNING the song ends {-p['cancion_sobra_s']:.1f} s early (silence)" if (p.get("cancion_sobra_s") or 0) < 0 else ""))
    else:
        audio = "no known song: the original keeps its sound and H3 continues the sound of its last seconds"
    return (f"«{p['video']}»: {p['total']} f ({p['total'] / 24:.2f} s) + {p['nuevos']} new f ({p['nuevos'] / 24:.2f} s) = "
            f"{p['duracion_final']} s. H3 sees the last {p['solape']} f and renders {p['ventana']} f at {p['ancho']}×{p['alto']} "
            f"(quality {p['calidad']}), {fuente}. Audio: {audio}. About {p['minutos'][0]}–{p['minutos'][1]} min."
            + (" WARNING: long window at this size, it may not fit in 12 GB (try calidad=media or fewer frames)." if p["memoria"] else ""))


@herramienta
async def ver_extension(video: str, nuevos: int = 68, solape: int = 39, calidad: str = "original", audio: str = "entrada",
                        proyecto: str = "") -> str:
    """Plan an extension WITHOUT running it (no GPU): says where the tail comes from (saved latent or mp4), which audio will
    sound, the size H3 renders, the final length and the time. Use it before extender. Same arguments as extender."""
    d = _datos_extension(video, nuevos, solape, calidad, audio, "", [], None, APPC.nombre(proyecto))
    p = await APPC.pedir("POST", "/app/extender_plan", d, ok=(200, 400))
    if "error" in p:
        raise ErrorAgente(p["error"])
    return _texto_plan(p)


@herramienta
async def extender(video: str, nuevos: int = 68, solape: int = 39, calidad: str = "original", audio: str = "entrada",
                   prompt: str = "", referencias: list[str] | None = None, semilla: int | None = None, n: int = 1,
                   proyecto: str = "") -> str:
    """Extend a video (step «Retocar» › tab «Extender video»): H3 continues the SAME shot from its last frames, with no cut,
    and the app glues the new part after the original. video: a file from listar_videos (or «x.mp4 [input]»). nuevos: new
    frames, rounded to steps of 17 (17 = 0.71 s … 204 = 8.5 s). solape: how much of the end H3 sees: 22 · 39 (default, the
    only one exact on the audio grid) · 56 · 73. calidad: rapida (~0.25 MP draft) · media (~0.5 MP) · original (the video's
    size; the only one that uses the saved latent). audio: entrada (default: the song carries on and is laid on top
    untouched; without a known song the original keeps its sound) · modelo (H3's sound for the new part). prompt: OPTIONAL,
    short English, only what happens next with the same camera; empty = same action, same camera. referencias: RefMod
    names or input images (max 4) cited as <Picture N>: the project's character/logo helps colour and identity not drift.
    The app always adds the video's LAST FRAME as one more reference after yours (yours keep their numbers).
    Check first with ver_extension; read guia://extender. The result can be extended again. Visible in «Cola» (✎ agente)
    and loaded in the «Extender video» tab."""
    nombre = APPC.nombre(proyecto)
    if not 1 <= int(n) <= MAX_POR_LLAMADA:
        raise ErrorAgente(f"n must be 1–{MAX_POR_LLAMADA}")
    d = _datos_extension(video, nuevos, solape, calidad, audio, prompt, referencias, semilla, nombre)
    for m in __import__("re").finditer(r"<Picture (\d+)>", d["prompt"]):
        if int(m.group(1)) > len(d["referencias"]):
            raise ErrorAgente(f"the prompt cites <Picture {m.group(1)}> but only {len(d['referencias'])} reference(s) were given")
    p = await APPC.pedir("POST", "/app/extender_plan", d, ok=(200, 400))
    if "error" in p:
        raise ErrorAgente(p["error"])
    if d["semilla"] is None:
        import random
        d["semilla"] = random.randrange(2 ** 32)
    r = await APPC.pedir("POST", "/app/cola", {"tipo": "extender", "datos": d, "n": int(n), "origen": "agente"})
    return (f"Extension queued: {', '.join(r['ids'])} (seed {d['semilla'] if int(n) == 1 else 'random'}). {_texto_plan(p)}\n"
            f"Wait with esperar(id), then look at the JOIN with ver_video(video=<new file>, desde={max(0, p['total'] / 24 - 1):.2f}, "
            f"hasta={min(p['duracion_final'], p['total'] / 24 + 1.5):.2f}) and at the end (identity, colour, frozen?).")


# ------------------------------------------------------------------ mejorar (mejorar.py: Super Resolution y HDR de NVIDIA RTX)
@herramienta
async def mejorar(video: str, escala: float = 0, calidad: str = "ULTRA", hdr_nits: int = 0, proyecto: str = "") -> str:
    """Enhance a WHOLE video (step «Retocar» › «Inpainting / detalle» › sub-tab «Mejorar»): NVIDIA RTX nodes, no H3, seconds
    not minutes. escala: Super Resolution ×1.5 · ×2 · ×3 · ×4 (0 = off); calidad: LOW · MEDIUM · HIGH · ULTRA. hdr_nits: HDR
    (SDR → HLG 10-bit) with a peak of 400–2000 nits, 650 is the page's default (0 = off). At least one of the two. A size that
    does not fit (side over 8192 px, or too many pixels for the whole video in memory) ends in error with the reason. The
    result mejorado_….mp4 is a new video in «Videos»; the original stays. Do it LAST, on the approved video."""
    nombre = APPC.nombre(proyecto)
    if not escala and not hdr_nits:
        raise ErrorAgente("choose at least one: escala (Super Resolution ×1.5/×2/×3/×4) or hdr_nits (400–2000)")
    if escala and float(escala) not in (1.5, 2.0, 3.0, 4.0):
        raise ErrorAgente("escala must be 1.5, 2, 3 or 4")
    d = {"video": video, "proyecto": nombre,
         "superres": {"escala": float(escala), "calidad": str(calidad).upper()} if escala else None,
         "hdr": {"nits": int(hdr_nits)} if hdr_nits else None}
    r = await APPC.pedir("POST", "/app/cola", {"tipo": "mejorar", "datos": d, "origen": "agente"})
    que = " + ".join(x for x in (f"Super Resolution ×{float(escala):g} ({str(calidad).upper()})" if escala else "",
                                  f"HDR {int(hdr_nits)} nits" if hdr_nits else "") if x)
    return (f"Enhancement queued: {', '.join(r['ids'])} ({que} on «{video}»). Usually under a minute once it runs. Visible in "
            "«Cola» (✎ agente); wait with esperar(id), then ver_video(video=<new file>).")


# ------------------------------------------------------------------ retomar el prompt de un video (29 oct)
@herramienta
async def retomar_prompt(video: str, donde: str = "copia", nombre_copia: str = "", confirmado: bool = False) -> str:
    """Load the values a video was generated with (prompt, shots, references, song, seed) back into a project, like «Videos» ›
    «Retomar prompt». For a retouch, extension or enhancement it uses the Generar video it came from. donde: «copia»
    (default: a NEW project «<project> retomado», or nombre_copia) or «aqui» (REPLACES the current project: needs the
    creative's OK, then confirmado=true). Videos made before Oct 29 that are no longer in the queue cannot be resumed
    (listar_videos marks the ones that can with «prompt ✓»)."""
    d = await APPC.pedir("GET", "/app/valores_video?video=" + urllib.parse.quote(video), ok=(200, 404))
    if "error" in d:
        raise ErrorAgente(f"«{video}» has no saved values (made before Oct 29, or not from Generar): it cannot be resumed")
    semilla = d.get("semilla")

    def cambio(p: Proyecto):
        p.datos["valores"] = json.loads(json.dumps(d["valores"]))
        p._estado = None
        if semilla not in (None, ""):
            p.poner_semilla(int(semilla))
    origen = f"from «{d['video']}» ({(d.get('fecha') or '').replace('T', ' ')[:16]}, seed {semilla})"
    if donde == "aqui":
        nombre = APPC.nombre("")
        if not confirmado:
            raise ErrorAgente(f"this REPLACES everything in «{nombre}» with the values {origen}. Ask the creative, then call "
                              "again with confirmado=true — or use donde='copia'")
        p, _ = await APPC.cambiar(nombre, cambio)
        return f"Resumed {origen} into «{nombre}» (replaced).\n" + visto(p)
    if donde != "copia":
        raise ErrorAgente("donde must be «copia» (new project) or «aqui» (replace the current one)")
    base = (nombre_copia or f"{d.get('proyecto') or APPC.actual or 'edit'} retomado").strip()
    usados = {x["nombre"] for x in await APPC.pedir("GET", "/app/proyectos")}
    nombre, i = base, 2
    while nombre in usados and not nombre_copia:
        nombre, i = f"{base} {i}", i + 1
    r = await APPC.pedir("POST", "/app/proyecto/" + urllib.parse.quote(nombre),
                         {"valores": d["valores"], "nuevo": True, "autor": "agente", "agente": {"marcas": []}}, ok=(200, 400, 409))
    if "error" in r:
        raise ErrorAgente(f"could not create «{nombre}»: {r['error']} (it is never overwritten: choose another nombre_copia)")
    APPC.actual = nombre
    p, _ = await APPC.cambiar(nombre, cambio)
    return (f"Resumed {origen} into the NEW project «{nombre}» (now the current one of this session). Ask the creative to "
            "open it in the page (header › project button).\n\n" + agente.describir(p))


# ------------------------------------------------------------------ edición (edicion.py, el apartado 3 «Cara C»)
FPS = 24
EXT_AUDIO = (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus")


def _fot(s: float) -> float:
    return round(round(float(s) * FPS) / FPS, 4)


def _fin(c: dict) -> float:
    return c["en"] + c["fin"] - c["ini"]


async def _leer_edicion(nombre: str) -> dict:
    d = await APPC.pedir("GET", "/app/edicion/" + urllib.parse.quote(nombre), ok=(200, 400))
    if "error" in d:
        raise ErrorAgente(f"cannot read the Editing timeline of «{nombre}»: {d['error']}")
    return d


async def _guardar_edicion(nombre: str, d: dict) -> None:
    r = await APPC.pedir("POST", "/app/edicion/" + urllib.parse.quote(nombre),
                         {"pistas": d["pistas"], "lienzo": d.get("lienzo"), "zoom": d.get("zoom"), "autor": "agente"}, ok=(200, 400))
    if "error" in r:
        raise ErrorAgente(f"the app did not save the timeline: {r['error']}")


def _tipo_fuente(fuente: str) -> str:
    return "audio" if fuente.removesuffix(" [input]").lower().endswith(EXT_AUDIO) else "video"


async def _medir(fuente: str, tipo: str) -> dict:
    """{dur, ancho?, alto?} de un video de la biblioteca o traído de fuera, o de un audio («… [input]»)."""
    if tipo == "video":
        i = await APPC.pedir("GET", "/app/video_info?video=" + urllib.parse.quote(fuente), ok=(200, 404))
        if "error" in i:
            raise ErrorAgente(f"there is no video «{fuente}» (see listar_medios): {i['error']}")
        return {"dur": float(i.get("duracion") or 0), "ancho": i.get("ancho"), "alto": i.get("alto")}
    url = URL_APP + "/app/video?video=" + urllib.parse.quote(fuente)
    r = await asyncio.to_thread(subprocess.run, ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url],
                                capture_output=True, text=True, timeout=60)
    try:
        return {"dur": float(r.stdout.strip())}
    except ValueError:
        raise ErrorAgente(f"cannot read the audio «{fuente}» (see listar_medios: audio sources end in « [input]»)")


async def _clip(c: dict, tipo_pista: str, medidas: dict) -> dict:
    """Un clip comprobado, como lo guarda la página: {fuente, nombre, tipo, dur, ini, fin, en}, a fotograma."""
    fuente = str(c.get("fuente") or "").strip()
    if not fuente:
        raise ErrorAgente("each clip needs its «fuente» (from listar_medios)")
    tipo = _tipo_fuente(fuente)
    if tipo != tipo_pista:
        raise ErrorAgente(f"«{fuente}» is {tipo}: it goes in an {tipo} track (V… for video, A… for audio)")
    if fuente not in medidas:
        medidas[fuente] = await _medir(fuente, tipo)
    dur = medidas[fuente]["dur"]
    ini, en = _fot(c.get("ini") or 0), _fot(c.get("en") or 0)
    fin = _fot(dur if c.get("fin") in (None, "") else min(float(c["fin"]), dur))
    if ini < 0 or en < 0 or fin - ini < 1 / FPS:
        raise ErrorAgente(f"clip «{fuente}»: ini {ini} – fin {fin} is empty or outside its {dur:.3f} s (seconds, ≥ 0)")
    base = os.path.basename(fuente.removesuffix(" [input]"))
    return {"fuente": fuente, "nombre": base if tipo == "audio" else base.removesuffix(".mp4"), "tipo": tipo, "dur": dur,
            "ini": ini, "fin": fin, "en": en}


def _sobrescribir(clips: list, s: float, e: float) -> list:
    """Como la página al soltar un clip: lo que hay debajo de [s, e) en la pista se recorta o se parte."""
    out = []
    for c in clips:
        if _fin(c) <= s or c["en"] >= e:
            out.append(c)
            continue
        if c["en"] < s:
            out.append({**c, "fin": _fot(c["ini"] + (s - c["en"]))})
        if _fin(c) > e:
            out.append({**c, "ini": _fot(c["ini"] + (e - c["en"])), "en": e})
    return out


def _poner_lienzo(d: dict, medidas: dict) -> None:
    """Sin lienzo, manda el primer video (como en la página)."""
    if d.get("lienzo"):
        return
    for p in d["pistas"]:
        for c in p["clips"]:
            m = medidas.get(c["fuente"]) or {}
            if c["tipo"] == "video" and m.get("ancho"):
                d["lienzo"] = {"ancho": m["ancho"], "alto": m["alto"]}
                return


def _texto_edicion(nombre: str, d: dict) -> str:
    pistas = d.get("pistas") or []
    if not any(p.get("clips") for p in pistas):
        return (f"Editing timeline of «{nombre}» (step «Edición»): EMPTY. Fill it with poner_clip or editar_edicion "
                "(sources from listar_medios).")
    lz = d.get("lienzo") or {}
    lin = [f"Editing timeline of «{nombre}» (step «Edición»): "
           f"{max(_fin(c) for p in pistas for c in p.get('clips') or []):.3f} s · canvas "
           + (f"{lz.get('ancho')}×{lz.get('alto')}" if lz else "from the first video")
           + f" · saved {d.get('guardado') or 'now'}{' by the agent' if d.get('autor') == 'agente' else ''}. "
           "Tracks top to bottom (the higher video track covers the lower):"]
    for p in pistas:
        flags = ("" if p.get("ver", True) is not False else " · hidden") + ("" if p.get("oir", True) is not False else " · muted")
        lin.append(f"{p['id']} ({p['tipo']}{flags}):" + ("" if p.get("clips") else " (empty)"))
        for i, c in enumerate(sorted(p.get("clips") or [], key=lambda c: c["en"]), 1):
            lin.append(f"  {p['id']}#{i} {c['en']:.3f}–{_fin(c):.3f} s · «{c['fuente']}» uses {c['ini']:.3f}–{c['fin']:.3f} s of it")
    return "\n".join(lin)


def _pistas_vacias() -> list:
    return [{"id": i, "tipo": t, "ver": True, "oir": True, "clips": []}
            for i, t in (("V2", "video"), ("V1", "video"), ("A1", "audio"), ("A2", "audio"))]


@herramienta
async def listar_medios(buscar: str = "") -> str:
    """What can go into the Editing timeline (step «Edición», its library): every video of the library (ALL projects), the
    videos brought from outside («Traídos de fuera»: only for Editing) and the audio files (ComfyUI/input and the uploaded
    audio folders). buscar filters by name, project or folder. The first column is the «fuente» that poner_clip and
    editar_edicion take."""
    vs, fuera, auds = await asyncio.gather(APPC.pedir("GET", "/app/videos"), APPC.pedir("GET", "/app/edicion_de_fuera"),
                                           APPC.pedir("GET", "/app/edicion_audios"))
    b = buscar.lower().strip()
    vs = list({v["archivo"]: v for v in reversed(vs)}.values())[::-1]          # un archivo, una vez (el historial puede repetirlo)
    lin = ["VIDEOS (library, newest first · project · kind · date):"]
    lin += [f"- {v['archivo']} · «{v.get('proyecto') or '—'}» · {v.get('tipo') or 'edit'} · {(v.get('fecha') or '').replace('T', ' ')[:16]}"
            for v in vs if not b or b in v["archivo"].lower() or b in (v.get("proyecto") or "").lower()][:60] or ["(none)"]
    lin.append("VIDEOS FROM OUTSIDE (only usable in Editing):")
    lin += [f"- {v['fuente']}" for v in fuera if not b or b in v["fuente"].lower()][:30] or ["(none)"]
    lin.append("AUDIO (· folder):")
    lin += [f"- {a['fuente']}{' · ' + a['carpeta'] if a.get('carpeta') else ''}" for a in auds
            if not b or b in a["fuente"].lower() or b in (a.get("carpeta") or "").lower()][:60] or ["(none)"]
    return "\n".join(lin)


@herramienta
async def ver_edicion(proyecto: str = "") -> str:
    """The Editing timeline of a project (step «Cara C · 3 · Edición»), as the page shows it: tracks top to bottom (V2 over
    V1, then A1, A2…), each clip labelled like «V1#2» with where it sits and which part of its original it uses. Read it
    before changing it: the creative may have edited it by hand."""
    nombre = APPC.nombre(proyecto)
    return _texto_edicion(nombre, await _leer_edicion(nombre))


@herramienta
async def editar_edicion(pistas: list[dict], lienzo: dict | None = None, proyecto: str = "") -> str:
    """REPLACE the whole Editing timeline (step «Edición») of a project. pistas, top to bottom: [{id: "V2"|"V1"|"A1"…, tipo:
    video|audio, ver?: true, oir?: true, clips: [{fuente, en, ini?: 0, fin?: end of the original}]}]. en = second of the
    timeline where the clip starts; ini/fin = the part of the original used (seconds). Times snap to frames (24 fps). The
    higher video track covers the lower; video tracks ALSO sound unless oir=false. Clips of one track must not overlap.
    lienzo {ancho, alto} = output size (default: the first video's). This overwrites what the creative built by hand: read
    it with ver_edicion and ask before replacing a timeline that is not empty."""
    nombre = APPC.nombre(proyecto)
    if not isinstance(pistas, list) or not pistas:
        raise ErrorAgente("pistas must be a list of tracks (see the tool description)")
    medidas, nuevas, ids = {}, [], set()
    for p in pistas:
        tipo, pid = p.get("tipo"), str(p.get("id") or "").strip()
        if tipo not in ("video", "audio"):
            raise ErrorAgente("each track has tipo «video» or «audio»")
        if not pid or pid in ids:
            raise ErrorAgente("each track needs a unique id (V2, V1, A1, A2…)")
        ids.add(pid)
        clips = sorted([await _clip(c, tipo, medidas) for c in p.get("clips") or []], key=lambda c: c["en"])
        for a, b in zip(clips, clips[1:]):
            if _fin(a) > b["en"] + 1e-3:
                raise ErrorAgente(f"track {pid}: «{a['fuente']}» ends at {_fin(a):.3f} s, after «{b['fuente']}» starts "
                                  f"({b['en']:.3f} s): clips of one track must not overlap")
        nuevas.append({"id": pid, "tipo": tipo, "ver": p.get("ver", True) is not False, "oir": p.get("oir", True) is not False,
                       "clips": clips})
    viejo = await _leer_edicion(nombre)
    d = {"pistas": nuevas, "lienzo": lienzo if lienzo and lienzo.get("ancho") and lienzo.get("alto") else None,
         "zoom": viejo.get("zoom")}
    _poner_lienzo(d, medidas)
    await _guardar_edicion(nombre, d)
    return "Saved: the page (step «Edición») shows it marked «✎ agente».\n" + _texto_edicion(nombre, {**d, "autor": "agente"})


@herramienta
async def poner_clip(fuente: str, en: float, pista: str = "", ini: float = 0, fin: float | None = None, proyecto: str = "") -> str:
    """Put ONE clip on the Editing timeline, like dropping it from the library: at second `en` of track `pista` (default V1
    for a video, A1 for an audio), using ini–fin seconds of its original (default: all of it). What was under it in that
    track is trimmed or split (overwrite, as in the page). Sources: listar_medios."""
    nombre = APPC.nombre(proyecto)
    d = await _leer_edicion(nombre)
    d["pistas"] = d.get("pistas") or _pistas_vacias()
    pid = pista or ("V1" if _tipo_fuente(fuente) == "video" else "A1")
    p = next((x for x in d["pistas"] if x["id"] == pid), None)
    if not p:
        raise ErrorAgente(f"there is no track {pid}: the tracks are {', '.join(x['id'] for x in d['pistas'])} (editar_edicion can add more)")
    medidas = {}
    c = await _clip({"fuente": fuente, "en": en, "ini": ini, "fin": fin}, p["tipo"], medidas)
    p["clips"] = sorted(_sobrescribir(p.get("clips") or [], c["en"], _fin(c)) + [c], key=lambda x: x["en"])
    _poner_lienzo(d, medidas)
    await _guardar_edicion(nombre, d)
    return (f"Clip «{fuente}» on {pid} at {c['en']:.3f}–{_fin(c):.3f} s (marked «✎ agente» in «Edición»).\n"
            + _texto_edicion(nombre, {**d, "autor": "agente", "guardado": ""}))


@herramienta
async def quitar_clip(clip: str, cerrar_hueco: bool = False, proyecto: str = "") -> str:
    """Remove one clip from the Editing timeline by its label in ver_edicion (e.g. «V1#2»). cerrar_hueco=true moves the later
    clips of that track left to close the gap (Shift+Supr in the page)."""
    nombre = APPC.nombre(proyecto)
    d = await _leer_edicion(nombre)
    pid, _, num = clip.partition("#")
    p = next((x for x in d.get("pistas") or [] if x["id"] == pid.strip()), None)
    clips = sorted((p or {}).get("clips") or [], key=lambda c: c["en"])
    if not p or not num.strip().isdigit() or not 1 <= int(num) <= len(clips):
        raise ErrorAgente(f"there is no clip {clip}: see the labels in ver_edicion (like «V1#2»)")
    c = clips.pop(int(num) - 1)
    if cerrar_hueco:
        largo = c["fin"] - c["ini"]
        clips = [{**o, "en": _fot(o["en"] - largo)} if o["en"] >= _fin(c) - 1e-3 else o for o in clips]
    p["clips"] = clips
    await _guardar_edicion(nombre, d)
    return f"Removed {clip} («{c['fuente']}»).\n" + _texto_edicion(nombre, {**d, "autor": "agente", "guardado": ""})


@herramienta
async def subir_medio(ruta: str, tipo: str = "audio", carpeta: str = "") -> str:
    """Bring a file from the computer where the app runs into Editing's library, like «Cargar audio» / «Carpeta de audios» /
    «Subir video»: tipo «audio» (optional carpeta = a folder name to group it) or «video» («Traídos de fuera»: usable only
    in Editing, not in Videos). It never overwrites (a repeated name gets _2). Only files the creative pointed you to."""
    ruta = os.path.expanduser(ruta)
    if tipo not in ("audio", "video"):
        raise ErrorAgente("tipo must be «audio» or «video»")
    if not os.path.isfile(ruta):
        raise ErrorAgente(f"there is no file {ruta} on this computer")
    with open(ruta, "rb") as fh:
        contenido = fh.read()
    try:
        async with httpx.AsyncClient(timeout=600) as c:       # los campos antes que el archivo: el servidor los lee en orden
            r = await c.post(URL_APP + "/app/edicion_subir", data={"tipo": tipo, "carpeta": carpeta},
                             files={"archivo": (os.path.basename(ruta), contenido)})
        d = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ErrorAgente(f"the upload failed ({exc.__class__.__name__})") from exc
    if r.status_code != 200 or "error" in d:
        raise ErrorAgente(f"the app refused the file: {d.get('error')}")
    return f"Uploaded as «{d['fuente']}» (Editing's library shows it the next time it reads it). Use it with poner_clip."


@herramienta
async def exportar_edicion(proyecto: str = "") -> str:
    """Join the saved Editing timeline into a new mp4 with ffmpeg («Exportar video»): no GPU, seconds to a minute, not through
    the queue. The result montaje_….mp4 appears in «Videos» and the library; look at it with ver_video."""
    nombre = APPC.nombre(proyecto)
    d = await _leer_edicion(nombre)
    r = await APPC.pedir("POST", "/app/edicion_exportar",
                         {"proyecto": nombre, "edicion": {"pistas": d.get("pistas") or [], "lienzo": d.get("lienzo")}},
                         espera=900, ok=(200, 400))
    if "error" in r:
        raise ErrorAgente(f"cannot export: {r['error']}")
    fila = r.get("fila") or {}
    m = fila.get("montaje") or {}
    return (f"Exported «{r['archivo']}»: {m.get('clips')} clips, {m.get('duracion')} s, {m.get('ancho')}×{m.get('alto')}, in "
            f"{fila.get('segundos')} s. It is in «Videos». Next: ver_video(video='{r['archivo']}').")


# ------------------------------------------------------------------ prompts de flujo
# ------------------------------------------------------------------ herramientas nuevas (31 oct; ya nacen en inglés)
NUEVAS = ["upload_photo", "create_refmod", "view_reference", "frame_to_photo", "crop_reference", "set_reference_mode",
          "hide_in_reference", "set_reference_strength", "reorder_references", "song_beats", "set_loras", "pause_queue",
          "insert_shot", "duplicate_shot", "move_shot"]
P_ = " `project`: the project name; empty = this session's current project."


async def _comfy_url() -> str:
    return (await APPC.pedir("GET", "/app/salud"))["comfyui_url"].rstrip("/")


async def _subir_a_input(contenido: bytes, nombre: str, carpeta: str) -> str:
    """Sube una imagen a ComfyUI/input/<carpeta>/ (sin sobrescribir: ComfyUI le cambia el nombre) → su ruta en input/."""
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.post(await _comfy_url() + "/upload/image", data={"type": "input", "subfolder": carpeta,
                                                                          "overwrite": "false"},
                             files={"image": (nombre, contenido)})
        d = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ErrorAgente(f"ComfyUI did not take the photo ({exc.__class__.__name__}): check status") from exc
    return "/".join(x for x in (d.get("subfolder"), d.get("name")) if x)


def _jpeg(url: str, alto: int = 512) -> bytes:
    r = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", url, "-frames:v", "1", "-vf", f"scale=-2:'min({alto},ih)'",
                        "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "4", "-"], capture_output=True, timeout=60)
    if r.returncode or not r.stdout:
        raise ErrorAgente(f"could not read the image: {r.stderr.decode(errors='replace')[:200]}")
    return r.stdout


@mcp.tool(name="upload_photo", structured_output=False, description=(
    "Copies a photo from this computer into ComfyUI/input/max_editor/fotos so it can become a reference (create_refmod) or "
    "be cited in retouch / extend. Never overwrites (a repeated name gets another). Only files the creative pointed to. "
    "Returns its path inside ComfyUI/input, the value create_refmod takes."))
async def upload_photo(path: str) -> str:
    ruta = os.path.expanduser(path)
    if not os.path.isfile(ruta):
        raise ErrorAgente(f"there is no file {ruta} on this computer: check the path with the creative")
    if not ruta.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise ErrorAgente("upload_photo takes png, jpg or webp photos; videos and audio go through upload_media")
    with open(ruta, "rb") as fh:
        rel = await _subir_a_input(fh.read(), os.path.basename(ruta), "max_editor/fotos")
    return f"Uploaded: «{rel}». Use it in create_refmod(photos=[\"{rel}\"])."


@mcp.tool(name="create_refmod", structured_output=False, description=(
    "Creates a RefMod in the library from photos already in ComfyUI/input (upload_photo returns their paths). One photo = one "
    "RefMod; several with pack=true = ONE RefMod holding them all (page: «grupo»), e.g. a character's full body + a face "
    "crop: it arrives in H3 as <Video N> and keeps identity better. role (character · object · place · clothes · pose · "
    "background · style · effect · font) sets what kind of concept it stores. mode: complete (default, full detail, 512) · "
    "compressed (general look, far fewer tokens: for whole reels used as style). Fails while ComfyUI has anything queued "
    "(it uses the GPU for a few seconds): wait and call again. Never overwrites: a taken name gets _2. Returns the RefMod "
    "names; add them to the project with set_reference."))
async def create_refmod(name: str, photos: list[str], role: str = "character", pack: bool = False, mode: str = "complete",
                        folder: str = "subidas") -> str:
    import mcp_en
    papel = mcp_en.VALORES["role"].get(role, role)
    modo = {"complete": "completo", "compressed": "comprimido"}.get(mode, mode)
    if pack and len(photos) < 2:
        raise ErrorAgente("a pack needs at least 2 photos")
    r = await APPC.pedir("POST", "/edit_prompt_llm/subir_refmods", {"nombre": name, "papel": papel, "fotos": photos,
                                                                     "juntar": bool(pack), "modo": modo, "carpeta": folder},
                         espera=900)
    return (f"Created {', '.join(r['creados'])} ({r.get('concepto')}, {r.get('modo')}, {r.get('segundos')} s). Next: "
            "set_reference(refmod=…, role=…, name=…, card=…).")


@mcp.tool(name="view_reference", structured_output=False, description=(
    "Shows what a RefMod looks like: its photo, or every photo of a pack (up to 6), as images. Read-only. Fails if the "
    "original photo is no longer in ComfyUI/input."))
async def view_reference(refmod: str) -> list:
    caj = (await APPC.pedir("GET", "/edit_prompt_llm/cajitas")).get("cajitas", {})
    if caj.get(refmod):
        base = await _comfy_url()
        urls = []
        for x in caj[refmod][:6]:
            rel = x["file"].removesuffix(" [input]")
            carpeta, _, nombre = rel.rpartition("/")
            urls.append(f"{base}/view?" + urllib.parse.urlencode({"filename": nombre, "subfolder": carpeta, "type": "input"}))
    else:
        urls = [URL_APP + "/app/foto_referencia?" + urllib.parse.urlencode({"refmod": refmod})]
    imgs = [await asyncio.to_thread(_jpeg, u) for u in urls]
    return [f"«{refmod}»: {len(imgs)} photo(s){' (pack)' if caj.get(refmod) else ''}."] + [Image(data=b, format="jpeg") for b in imgs]


@mcp.tool(name="frame_to_photo", structured_output=False, description=(
    "Takes the frame at `at_s` seconds of a video (list_videos) and saves it as a photo in ComfyUI/input/max_editor/fotos, "
    "full size, so it can become a reference (create_refmod) or be cited in retouch. Returns its path and the frame." + P_))
async def frame_to_photo(video: str, at_s: float, project: str = "") -> list:
    url = URL_APP + "/app/salidas/" + urllib.parse.quote(video)
    r = await asyncio.to_thread(subprocess.run, ["ffmpeg", "-v", "error", "-nostdin", "-ss", str(float(at_s)), "-i", url,
                                                 "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
                                capture_output=True, timeout=60)
    if r.returncode or not r.stdout:
        raise ErrorAgente(f"no frame at {at_s} s of «{video}»: check the name with list_videos and the length with view_video")
    rel = await _subir_a_input(r.stdout, f"{os.path.splitext(video)[0]}_{float(at_s):.2f}s.png", "max_editor/fotos")
    return [f"Saved the frame at {float(at_s):.2f} s as «{rel}». Use it in create_refmod(photos=[\"{rel}\"])."]


@mcp.tool(name="crop_reference", structured_output=False, description=(
    "Re-crops an uploaded RefMod from its original photo and rebuilds it with the same name, mode and segment. rectangle: "
    "{x, y, w, h} from 0 to 1 of the original photo, or null for the whole picture. Uses the GPU a few seconds (fails while "
    "ComfyUI is busy: wait). Projects that use it pick up the new version. Fails for RefMods without a recorded source."))
async def crop_reference(refmod: str, rectangle: dict | None = None) -> str:
    r = await APPC.pedir("POST", "/edit_prompt_llm/recortar", {"nombre": refmod, "recorte": rectangle}, espera=600)
    return f"Re-cropped «{refmod}». {r if isinstance(r, str) else ''}".strip()


@mcp.tool(name="set_reference_mode", structured_output=False, description=(
    "Makes a copy of a RefMod in the other mode: complete (full detail) or compressed (general look, far fewer tokens). The "
    "original stays. Returns the new RefMod name: swap it in the project with set_reference + remove_reference."))
async def set_reference_mode(refmod: str, mode: str) -> str:
    modo = {"complete": "completo", "compressed": "comprimido"}.get(mode, mode)
    r = await APPC.pedir("POST", "/edit_prompt_llm/cambiar_modo", {"nombre": refmod, "modo": modo}, espera=600)
    nuevo = r.get("nombre") if isinstance(r, dict) else r
    return f"«{refmod}» in {mode} mode: «{nuevo}»."


@mcp.tool(name="hide_in_reference", structured_output=False, description=(
    "Hides a face, hair, text or any named thing inside a reference's photo(s) (page: «Ocultar») so H3 does not copy it — "
    "e.g. borrow clothes or a pose from someone else's photo without their face, or drop a watermark. SAM 3.1 finds them. "
    "hide: any of face · hair · text; also: free English words («hat, logo»). look: blur (default) · pixelate · color. "
    "preview=true only reports what SAM found (percent of each thing); preview=false creates the hidden RefMod (or reuses "
    "it) and returns its name: swap it in with set_reference + remove_reference. Uses the GPU (fails while ComfyUI is busy)."))
async def hide_in_reference(refmod: str, hide: list[str] | None = None, also: str = "", look: str = "blur",
                            preview: bool = True) -> str:
    cosas = [{"face": "cara", "hair": "pelo", "text": "texto"}.get(x, x) for x in hide or []]
    forma = {"blur": "difuminar", "pixelate": "pixelar", "color": "color"}.get(look, look)
    d = {"refmod": refmod, "cosas": cosas, "libre": also, "forma": forma}
    if preview:
        r = await APPC.pedir("POST", "/edit_prompt_llm/tapar_previa", d, espera=900)
        hallado = ", ".join(f"{k} {v} %" for k, v in (r.get("encontrado") or {}).items()) or "nothing"
        return (f"Preview for «{refmod}»: found {hallado}{' (already exists: ' + r['nombre'] + ')' if r.get('existe') else ''}. "
                "Call again with preview=false to create it.")
    r = await APPC.pedir("POST", "/edit_prompt_llm/tapar", d, espera=900)
    return f"Hidden copy: «{r['name']}»{' (reused)' if r.get('reutilizado') else ''}; the original «{refmod}» stays."


@mcp.tool(name="set_reference_strength", structured_output=False, description=(
    "Sets how strongly H3 follows one reference of the project (0.05–2, 1 = normal). Measured: lowering it blurs the "
    "reference rather than weakening it; crop the photo to control what it shows instead. Returns the saved rev." + P_))
async def set_reference_strength(ref: str, strength: float, project: str = "") -> str:
    p, clave = await APPC.cambiar(project, lambda p: p.poner_fuerza(ref, strength))
    return f"«{clave}» strength {strength}.\n" + visto(p)


@mcp.tool(name="reorder_references", structured_output=False, description=(
    "Moves one reference to another position of the project's list (1 = first). Tags follow the order, so they are "
    "renumbered, everywhere they are cited. Returns the new tags." + P_))
async def reorder_references(ref: str, position: int, project: str = "") -> str:
    p, clave = await APPC.cambiar(project, lambda p: p.mover_referencia(ref, position))
    return f"«{clave}» is now number {position}. Tags: {', '.join(p.etiquetas())}.\n" + visto(p)


@mcp.tool(name="song_beats", structured_output=False, description=(
    "Returns the beat times (seconds from the segment start) of a song file (list_songs), for `seconds` from `start_s`, and "
    "the strongest hits. Use it to tell the creative where the hits are; the segment start stays their choice. Read-only."))
async def song_beats(file: str, start_s: float = 0.0, seconds: float = 10.0) -> str:
    r = await APPC.pedir("POST", "/edit_prompt_llm/beats", {"audio": file, "audio_inicio": float(start_s),
                                                             "entradas": {"duracion": float(seconds)}}, espera=120)
    tiempos = r if isinstance(r, list) else (r or {}).get("beats") or r
    return f"«{file}» from {start_s} s for {seconds} s: {tiempos}"


@mcp.tool(name="set_loras", structured_output=False, description=(
    "Replaces the project's LoRAs (used by generate, retouch and extend): loras = [{name, strength}] with names from "
    "ComfyUI/models/loras (strength −1…2, 1 = normal); [] removes them. LoRAs change H3's style: only on the creative's "
    "request. Fails on a name ComfyUI does not have." + P_))
async def set_loras(loras: list[dict], project: str = "") -> str:
    hay = {x["nombre"] for x in (await APPC.pedir("GET", "/app/loras")).get("loras") or []}
    falta = [x.get("name") for x in loras if x.get("name") not in hay]
    if falta:
        raise ErrorAgente(f"ComfyUI has no LoRA {', '.join(map(str, falta))}: available: {', '.join(sorted(hay)) or 'none'}")
    lista = [{"nombre": x["name"], "fuerza": float(x.get("strength", 1))} for x in loras]
    p, _ = await APPC.cambiar(project, lambda p: p.poner_loras(lista))
    return f"LoRAs: {', '.join(f'{x['nombre']} × {x['fuerza']}' for x in lista) or 'none'}.\n" + visto(p)


@mcp.tool(name="pause_queue", structured_output=False, description=(
    "Pauses (paused=true) or resumes the app's job queue: a paused queue starts nothing new; the running job finishes. "
    "The queue is shared with the creative: only on their request."))
async def pause_queue(paused: bool) -> str:
    r = await APPC.pedir("POST", "/app/cola/pausar", {"pausada": bool(paused)})
    return "Queue " + ("paused." if (r or {}).get("pausada", paused) else "running.")


@mcp.tool(name="insert_shot", structured_output=False, description=(
    "Splits shot `shot` in two halves and makes the second one a new EMPTY shot right after it (the others keep their "
    "times). Each half must stay ≥ 0.4 s. Returns the shots with their times." + P_))
async def insert_shot(shot: int, project: str = "") -> str:
    p, _ = await APPC.cambiar(project, lambda p: p.partir_toma(shot, False))
    return f"New empty shot {shot + 1}: {_tiempos(p)}\n" + visto(p)


@mcp.tool(name="duplicate_shot", structured_output=False, description=(
    "Splits shot `shot` in two halves with the SAME fields (a copy right after it), to vary one of them. Each half must stay "
    "≥ 0.4 s. Returns the shots with their times." + P_))
async def duplicate_shot(shot: int, project: str = "") -> str:
    p, _ = await APPC.cambiar(project, lambda p: p.partir_toma(shot, True))
    return f"Shot {shot} duplicated as shot {shot + 1}: {_tiempos(p)}\n" + visto(p)


@mcp.tool(name="move_shot", structured_output=False, description=(
    "Moves shot `shot` to position `to` (1…n). With hand-placed cuts, its length travels with it. Returns the shots with "
    "their times." + P_))
async def move_shot(shot: int, to: int, project: str = "") -> str:
    p, _ = await APPC.cambiar(project, lambda p: p.mover_toma(shot, to))
    return f"Shot {shot} is now shot {to}: {_tiempos(p)}\n" + visto(p)


def _tiempos(p: Proyecto) -> str:
    return " · ".join(f"{k} {a:.3f}–{b:.3f} s" for k, (a, b) in enumerate(p.duraciones(), 1))


# ------------------------------------------------------------------ prompts (los elige el creativo; 31 oct: cortos, con la
# herramienta de cada trabajo, sin pasos; «Good practices» las pondrá el creativo con su experiencia)
PROMPTS = {
    "create_edit": ("Create an edit", "From the creative's idea to a reviewed video", ("idea", "project"),
        "The creative wants an edit{idea}. Build it in {project} so they can watch it in the page. Ask for what only they "
        "decide: references, format and size, look, song and where its segment starts, length. Read guia://h3 and "
        "guia://proyecto first. After each video, report what came out against what was asked.\n"
        "Tools by job:\n- project: create_project · open_project · view_project · restore_from_video\n"
        "- references: upload_photo · create_refmod (pack for body + face) · view_reference · list_refmods · set_reference · "
        "remove_reference · reorder_references · add_text_effect\n- time and shots: set_length · set_shots · insert_shot · "
        "duplicate_shot · move_shot · remove_shot · write_shot\n- words, song, sound: set_text_track · list_songs · "
        "song_beats · set_song · set_sound\n- size and draw: set_resolution · set_seed\n- run and look: check_project · "
        "status · generate · wait_for_job · view_queue · view_video"),
    "retouch_video": ("Retouch a video", "Add, remove or refine something in part of a video", ("what", "video"),
        "The creative wants to change part of {video}{what}. Redo only that zone and keep the rest. Read guia://retocar "
        "first. Show them the mask before retouching.\nTools by job:\n- find it: list_videos · view_video (from_s / to_s)\n"
        "- mark the zone: preview_mask (mask_text for things SAM can name, rectangle for the rest)\n- remove something: "
        "retouch with a prompt of what is there instead\n- put something in: retouch with references (upload_photo, "
        "frame_to_photo) cited as <Picture N>\n- refine a face or detail: retouch with a crop of the character's face as "
        "reference\n- follow and check: wait_for_job · view_video of the new file"),
    "extend_video": ("Extend a video", "Make a video longer, continuing the same shot", ("video", "seconds"),
        "The creative wants {video} longer{seconds}, continuing the same shot. Read guia://retocar (Extend) first. Tell them "
        "where the end comes from, the audio and the time before running it.\nTools by job:\n- check the end: view_video "
        "(the last second)\n- plan: plan_extension\n- run and check: extend · wait_for_job · view_video around the join and "
        "at the end"),
    "review_result": ("Review a result", "Look at a video and say what to change first", ("video",),
        "Look at {video} and compare it, shot by shot, with what the project asked for. Report facts with times, then one "
        "change to try. Read guia://h3 if a failure is unclear. The creative decides.\nTools by job:\n- look: view_video "
        "(frames, from_s / to_s per shot)\n- compare: view_project (with_prompt=true for what H3 actually read)\n- change: "
        "set_seed · write_shot · set_reference · set_shots — or retouch for a local defect"),
    "prepare_references": ("Prepare references", "Turn photos into references H3 reads well", ("subject", "photos"),
        "The creative wants references for {subject}{photos}. Prepare RefMods that show it clearly and give each a role, a "
        "name and a card of what is seen. Read guia://h3 (References) first. Show the creative each result.\n"
        "Tools by job:\n- bring photos in: upload_photo · frame_to_photo\n- create: create_refmod (pack=true joins several "
        "photos, e.g. full body + face crop)\n- look at it: view_reference\n- crop or change mode: crop_reference · "
        "set_reference_mode\n- hide a face, hair or text inside it: hide_in_reference\n- use it: list_refmods · "
        "set_reference · set_reference_strength"),
    "enhance_video": ("Enhance a video", "Sharper or HDR, on the final video", ("video",),
        "The creative wants {video} sharper or in HDR. It is the last step, on the approved video; the original stays. Read "
        "guia://retocar (Enhance) first. Tell them the output size before running it.\nTools by job:\n- pick it: "
        "list_videos · view_video\n- run and check: enhance (scale / quality / hdr_nits) · wait_for_job · view_video"),
    "assemble_timeline": ("Join videos", "Join pieces of videos on the Editing timeline", ("idea",),
        "The creative wants to join pieces of videos{idea} on the Editing timeline. The timeline is theirs too: read it "
        "before changing it and ask before replacing a non-empty one. They choose the pieces and the order. Read "
        "guia://retocar (Editing) first.\nTools by job:\n- what exists: list_media · list_videos(all_projects=true) · "
        "upload_media (only files they point to)\n- the timeline: view_timeline · place_clip · remove_clip · "
        "replace_timeline (replaces everything)\n- result: export_timeline · view_video at each join"),
}
PROMPTS_VIEJOS = {"crear_edit": "create_edit", "retocar_video": "retouch_video", "extender_video": "extend_video",
                  "revisar_resultado": "review_result"}


VIEJOS_ARGS = {"proyecto": "project", "que": "what", "segundos": "seconds"}


def _prompt(nombre: str, args: tuple):
    titulo, desc, _, texto = PROMPTS[nombre]

    def hacer(**kw) -> str:
        kw = {VIEJOS_ARGS.get(k, k): w for k, w in kw.items()}
        v = {VIEJOS_ARGS.get(a, a): (kw.get(VIEJOS_ARGS.get(a, a)) or "").strip() for a in args}
        return texto.format(
            idea=f": «{v['idea']}»" if v.get("idea") else "", project=v.get("project") or "a new project",
            what=f": «{v['what']}»" if v.get("what") else "", video=f"«{v['video']}»" if v.get("video") else "a video",
            seconds=f" by about {v['seconds']} s" if v.get("seconds") else "",
            subject=f"«{v['subject']}»" if v.get("subject") else "a character or thing",
            photos=f" from {v['photos']}" if v.get("photos") else "")
    hacer.__signature__ = inspect.Signature([inspect.Parameter(a, inspect.Parameter.KEYWORD_ONLY, default="", annotation=str)
                                             for a in args])
    hacer.__annotations__ = {a: str for a in args} | {"return": str}
    return hacer, titulo, desc


for _n, (_t, _d, _a, _) in PROMPTS.items():
    _f, _t, _d = _prompt(_n, _a)
    mcp.prompt(name=_n, title=_t, description=_d)(_f)
ARGS_VIEJOS = {"crear_edit": ("idea", "proyecto"), "retocar_video": ("que", "video"), "extender_video": ("video", "segundos"),
               "revisar_resultado": ("video",)}
for _viejo, _n in PROMPTS_VIEJOS.items():         # los nombres viejos siguen valiendo (escondidos en la lista)
    _f, _t, _d = _prompt(_n, ARGS_VIEJOS[_viejo])
    mcp.prompt(name=_viejo, title=_t, description=_d)(_f)

import mcp_en  # noqa: E402  (la cara en inglés: nombres, parámetros y descripciones nuevas; los viejos como alias)
mcp_en.registrar(mcp, globals(), NUEVAS, ocultos_prompts=set(PROMPTS_VIEJOS),
                 ocultos_recursos={f"guia://{t}" for t in TEMAS_VIEJOS})


def main():
    if "--stdio" in sys.argv:
        mcp.run("stdio")
        return
    host = CONFIG.get("host") or "127.0.0.1"
    puerto = int(os.environ.get("MAX_EDITOR_MCP_PUERTO") or CONFIG.get("mcp_puerto") or 8301)
    print(f"[MAX EDITOR MCP] http://{host}:{puerto}/mcp  ·  app {URL_APP}", flush=True)
    mcp.run("streamable-http", host=host, port=puerto, streamable_http_path="/mcp")


if __name__ == "__main__":
    main()
