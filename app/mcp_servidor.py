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
TEMAS = {"mapa": "1_mapa.md", "h3": "2_h3.md", "organizar": "3_organizar.md", "prompts": "4_prompts.md", "revisar": "5_revisar.md",
         "creativo": "6_creativo.md", "recetas": "7_recetas.md", "errores": "8_errores.md"}


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
            raise ErrorAgente(f"unexpected error ({exc.__class__.__name__}: {exc}). Tell the creative; see guia://errores") from exc
    return mcp.tool(structured_output=False)(envuelta)


# ------------------------------------------------------------------ hablar con la app
class App:
    def __init__(self):
        self.plantilla = None
        self.actual = ""                    # el proyecto de esta sesión (el último abierto o creado)

    async def pedir(self, metodo: str, ruta: str, cuerpo=None, espera: float = 60, ok=(200,)):
        try:
            async with httpx.AsyncClient(timeout=espera) as c:
                r = await c.request(metodo, URL_APP + ruta, json=cuerpo)
        except httpx.HTTPError as exc:
            raise ErrorAgente(f"MAX EDITOR does not answer at {URL_APP} ({exc.__class__.__name__}). Start it with app/arrancar.sh") from exc
        try:
            d = r.json()
        except ValueError:
            d = {"error": r.text[:300]}
        if r.status_code not in ok:
            raise ErrorAgente(f"the app answered {r.status_code}: {d.get('error') if isinstance(d, dict) else d}")
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


def visto(p: Proyecto) -> str:
    return (f"Saved in project «{p.nombre}» (rev {p.datos.get('rev')}). The page reloads it by itself and marks what you changed "
            "with «✎ agente».")


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
    except Exception:
        lin.append("ComfyUI queue: could not read it")
    activos = [x for x in cola["trabajos"] if x["estado"] in ACTIVOS]
    lin.append(f"App queue (Cola): {len(activos)} active{' · PAUSED' if cola.get('pausada') else ''}"
               + "".join(f"\n  - {x['id']} {x['tipo']} «{x['proyecto']}» {x['estado']} {round((x.get('avance') or 0) * 100)}%"
                         f"{' · by the agent' if x.get('origen') == 'agente' else ''}" for x in activos))
    if activos:
        ocupado.append("the app queue is working")
    lin.append("GPU free now: " + ("NO — " + "; ".join(ocupado) + ". New jobs wait their turn." if ocupado else "yes"))
    if APPC.actual:
        lin.append(f"Open project in this session: «{APPC.actual}»")
    return "\n".join(lin)


@herramienta
async def leer_guia(tema: str = "indice") -> str:
    """Read a chapter of the MAX EDITOR agent guide. tema: indice (list) · mapa (the app, its steps and which tool touches
    which zone) · h3 (what MiniMax H3 does and does not do) · organizar (shots, fields, references, text, song) · prompts
    (writing for H3, before/after) · revisar (judging a result, what to change first) · creativo (working with the creative)
    · recetas (step-by-step flows with tool calls) · errores (problems and ways out). Same text as the guia:// resources."""
    tema = (tema or "indice").strip().lower()
    if tema in TEMAS:
        return leer_doc(TEMAS[tema])
    return ("MAX EDITOR agent guide. Read «mapa» and «h3» before your first edit; «organizar» and «prompts» before writing shots;"
            " «revisar» after each video. Chapters:\n" + "\n".join(f"- {k} (guia://{k})" for k in TEMAS))


def _recurso(tema: str, archivo: str):
    @mcp.resource(f"guia://{tema}", name=tema, title=f"Guide · {tema}", mime_type="text/markdown",
                  description=f"MAX EDITOR agent guide, chapter «{tema}»")
    def _leer() -> str:
        return leer_doc(archivo)
    return _leer


for _tema, _archivo in TEMAS.items():
    _recurso(_tema, _archivo)


# ------------------------------------------------------------------ proyectos
@herramienta
async def listar_proyectos() -> str:
    """The projects in the app (header › «Proyecto» list), newest first. «ejemplo» is read-only: copy it with crear_proyecto."""
    ps = await APPC.pedir("GET", "/app/proyectos")
    return "\n".join(f"- {p['nombre']} · saved {p.get('guardado') or '?'} · rev {p.get('rev', 0)}"
                     f"{' · last change by the agent' if p.get('autor') == 'agente' else ''}" for p in ps) or "(no projects)"


@herramienta
async def abrir_proyecto(nombre: str) -> str:
    """Make a project the current one for this session and describe it as the page shows it. It does not change the page:
    the creative opens it there from the header (or it is already open)."""
    p = await APPC.proyecto(nombre)
    APPC.actual = p.nombre or nombre
    await APPC.montar(p)
    return agente.describir(p) + f"\n\nCurrent project for this session: «{APPC.actual}». Ask the creative to open it in the page " \
                                 "(header › «Proyecto») to watch your changes live."


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
    return f"Created «{nombre}»{' as a copy of «' + copiar_de + '»' if copiar_de else ''}. Ask the creative to open it in the " \
           "page (header › «Proyecto»).\n\n" + agente.describir(p)


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
    nombre: short name in English that goes into the prompt («Teto», «red racing jacket»); for personaje, references with the
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
            f" Visible in step 1 «Referencias». Current tags: {', '.join(t for t in p.etiquetas())}.\n" + visto(p))


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
    return f"Song «{archivo}» ({total:.1f} s) from {ini} s for {p.duracion} s{aviso}. Visible in step 2 under the shots.\n" + visto(p)


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
    return (f"Shot {k}: {', '.join(hechos) or 'nothing changed'}. Visible in step 2: click shot {k} to see its panel.\n"
            f"Its line in the final prompt:\n{linea}\n" + visto(p))


@herramienta
async def poner_texto(textos: list[dict], proyecto: str = "") -> str:
    """Replace the whole text track (fila de texto, above the shots): words on screen. Each item: {texto, t (start s),
    fin (end s, or null = end of its shot), sitio: «encima» (over the image) | «al_lado» (beside the face), letra: tag of a
    reference with role letra (optional), frase: how it looks/moves, in English (e.g. «slams in letter by letter as huge
    glowing letters»)}. [] empties it. Few, big words work; the typography is a protagonist."""
    p, _ = await APPC.cambiar(proyecto, lambda p: p.poner_textos(textos))
    return f"Text track: {len(textos)} item(s). Visible in step 2, the row above the shots.\n" + visto(p)


@herramienta
async def poner_resolucion(ancho: int = 0, alto: int = 0, megapixeles: float = 0, orientacion: str = "vertical",
                           proyecto: str = "") -> str:
    """Video size (header › «Resolución»), in multiples of 32. Give ancho+alto, or megapixeles (0.1–2) with orientacion
    vertical|horizontal. The project format is VERTICAL. Quality vs VRAM: 1 MP (768×1344) keeps identity best; on a 12 GB
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
    return f"Resolution {a}×{b} ({agente.megapixeles(a, b)} MP). Visible in the header.\n" + visto(p)


@herramienta
async def poner_semilla(semilla: int | None = None, proyecto: str = "") -> str:
    """The video seed (header, next to «Generar»). Without a number, a new random one («otra semilla»). The seed weighs a lot:
    before blaming the prompt, try another seed. Changing the resolution also changes the draw."""
    import random
    s = int(semilla) if semilla is not None else random.randrange(2 ** 32)
    p, _ = await APPC.cambiar(proyecto, lambda p: p.poner_semilla(s))
    return f"Seed {s}. Visible in the header next to «Generar».\n" + visto(p)


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
    """Check the project before generating: ERRORS block Generate (no song, invalid length, cited references that do not
    exist…) and WARNINGS are lessons from real tests (empty main field, negations in the camera, too-short shots, two
    identical shots, heavy for 12 GB, not vertical…). Also says if the GPU is busy. Fix errors; tell the creative the
    warnings that matter."""
    p = await APPC.proyecto(APPC.nombre(proyecto))
    await APPC.montar(p)
    errores, avisos = agente.revisar(p)
    lin = [f"Project «{p.nombre}»: {p.n_tomas} shots, {p.duracion} s ({p.fotogramas()} f), {'×'.join(map(str, p.tamano() or ()))}"]
    lin += ["ERRORS (Generate will fail):"] + [f"- {x}" for x in errores] if errores else ["No errors."]
    lin += ["Warnings:"] + [f"- {x}" for x in avisos] if avisos else ["No warnings."]
    lin.append("\n" + await estado())
    return "\n".join(lin)


def _minutos(p: Proyecto) -> float:
    """Una idea del tiempo en una RTX 3060 (medido: 22 f a 0,52 MP ≈ 2,3 min; 124 f a 1 MP ≈ 16 min)."""
    tam = p.tamano() or (544, 960)
    return round(1.5 + 14.5 * agente.megapixeles(*tam) * p.fotogramas() / 128, 1)


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
    minutos = _minutos(p) * int(n)
    if minutos > 12 and not confirmado:
        raise ErrorAgente(f"this is about {minutos} min of GPU on a 12 GB card ({p.fotogramas()} frames at "
                          f"{agente.megapixeles(*(p.tamano() or (544, 960)))} MP × {n}). Ask the creative, then call again with "
                          "confirmado=true. For a quick test: poner_duracion(0.917) (22 frames) and a low resolution.")
    r = await APPC.pedir("POST", "/app/cola", {"tipo": "generar", "valores": p.datos["valores"], "semilla": p.semilla(),
                                               "proyecto": nombre, "n": int(n), "origen": "agente"})
    delante = len([x for x in cola["trabajos"] if x["estado"] in ACTIVOS])
    return (f"Queued {len(r['ids'])} job(s): {', '.join(r['ids'])} (seed {p.semilla() if int(n) == 1 else 'random'}). "
            f"{delante} job(s) ahead. Rough time: ~{_minutos(p)} min each on an RTX 3060. Visible in the header › «Cola» "
            "(marked «✎ agente»). Wait for it with esperar(id), then ver_video." + (f"\nWarnings: {'; '.join(avisos[:4])}" if avisos else ""))


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
async def listar_videos(proyecto: str = "") -> str:
    """The videos of a project, newest first (header › «Mis videos»): generated edits and retouches, with seed and date."""
    nombre = APPC.nombre(proyecto)
    vs = await APPC.pedir("GET", "/app/videos?proyecto=" + urllib.parse.quote(nombre))
    return "\n".join(f"- {v['archivo']} · {v.get('tipo') or 'edit'} · {v.get('fecha', '').replace('T', ' ')} · seed {v.get('semilla')}"
                     + (f" · retouch {v['tramo'].get('inicio')}–{v['tramo'].get('fin')} s" if v.get("tipo") == "retoque" and v.get("tramo") else "")
                     for v in vs) or f"(no videos yet in «{nombre}»)"


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


# ------------------------------------------------------------------ prompts de flujo
@mcp.prompt(name="crear_edit", title="Create an edit", description="From the creative's idea to a reviewed video, step by step")
def crear_edit(idea: str = "", proyecto: str = "") -> str:
    return (f"The creative wants an edit{': ' + idea if idea else ''}.{' Project: ' + proyecto + '.' if proyecto else ''}\n"
            "Follow guia://recetas («Edit with a character») and these rules:\n"
            "1. Call estado, then read guia://mapa, guia://h3 and guia://organizar (leer_guia) if you have not yet.\n"
            "2. Ask the creative what is still missing: the character/product (which RefMod), the song AND where its segment starts, "
            "the duration, the look. Offer options from the data; do not invent the story or the aesthetic.\n"
            "3. Work in a project of your own or the one they name (crear_proyecto(copiar_de=…) never overwrites).\n"
            "4. References → song → shots (poner_tomas) → each shot panel (escribir_toma, momento first) → text → revisar_proyecto.\n"
            "5. Tell them what you changed and where they see it. Before generating something long, say the time and ask.\n"
            "6. First a quick test (22 frames, low resolution) if they agree; then generar, ver_cola, ver_video; judge with guia://revisar.")


@mcp.prompt(name="retocar_video", title="Retouch a video", description="Erase or replace something in a part of a video")
def retocar_video(que: str = "", video: str = "") -> str:
    return (f"The creative wants to retouch{' «' + video + '»' if video else ' a video'}{': ' + que if que else ''}.\n"
            "Read guia://prompts (section Retouch) and guia://recetas («Retouch a logo with SAM»). Steps: listar_videos → ver_video "
            "to find the segment and the zone → ver_mascara (check the pink covers only that) → retocar with a SHORT prompt and "
            "the references as <Picture N> → ver_cola → ver_video of the new file. Retouch the original, not a retouch.")


@mcp.prompt(name="revisar_resultado", title="Review a result", description="Look at the newest video and say what to change first")
def revisar_resultado(video: str = "") -> str:
    return (f"Look at {('«' + video + '»') if video else 'the newest video'} with ver_video and judge it with guia://revisar: "
            "compare each frame with ver_proyecto (did each shot happen at its time? same character? text? effect?). Report "
            "facts first, then ONE change to try, in this order: another seed → the prompt of the shot that failed → the "
            "references → the durations. The creative decides.")


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
