"""MAX EDITOR · la cara en inglés del servidor MCP (31 oct 2026, con las guías oficiales: «Server Instructions» del blog de
MCP y «Writing effective tools for agents» de Anthropic). Plano: app/guia_borrador/ (HERRAMIENTAS_NUEVAS, NOMBRES_EN,
RESPUESTAS, ERRORES).
  - Cada herramienta de mcp_servidor.py (nombres en español) se publica con su nombre, sus parámetros y sus valores en
    inglés y una descripción nueva. Los nombres viejos siguen funcionando como alias, pero list_tools ya no los enseña.
  - Lo que devuelven se pasa por `limpiar`: los nombres viejos de herramientas y parámetros dentro del texto pasan al inglés.
Se engancha al final de mcp_servidor.py con registrar(mcp, globals())."""
from __future__ import annotations

import functools
import inspect
import re
import typing

# ------------------------------------------------------------------ nombres
HERRAMIENTAS = {
    "estado": "status", "leer_guia": "read_guide", "listar_proyectos": "list_projects", "abrir_proyecto": "open_project",
    "crear_proyecto": "create_project", "ver_proyecto": "view_project", "revisar_proyecto": "check_project",
    "retomar_prompt": "restore_from_video", "listar_refmods": "list_refmods", "poner_referencia": "set_reference",
    "quitar_referencia": "remove_reference", "poner_efecto_texto": "add_text_effect", "poner_duracion": "set_length",
    "poner_tomas": "set_shots", "quitar_toma": "remove_shot", "escribir_toma": "write_shot", "poner_texto": "set_text_track",
    "listar_canciones": "list_songs", "poner_cancion": "set_song", "poner_sonido": "set_sound",
    "poner_resolucion": "set_resolution", "poner_semilla": "set_seed", "generar": "generate", "ver_cola": "view_queue",
    "esperar": "wait_for_job", "cancelar": "cancel_job", "reintentar": "retry_job", "listar_videos": "list_videos",
    "ver_video": "view_video", "ver_mascara": "preview_mask", "retocar": "retouch", "ver_extension": "plan_extension",
    "extender": "extend", "mejorar": "enhance", "listar_medios": "list_media", "ver_edicion": "view_timeline",
    "editar_edicion": "replace_timeline", "poner_clip": "place_clip", "quitar_clip": "remove_clip",
    "subir_medio": "upload_media", "exportar_edicion": "export_timeline",
}

PARAMETROS = {
    "proyecto": "project", "semilla": "seed", "n": "count", "confirmado": "confirmed", "nombre": "name",
    "copiar_de": "copy_from", "con_prompt": "with_prompt", "buscar": "search", "papel": "role", "ficha": "card",
    "pronombre": "pronoun", "principal": "main", "atuendo": "outfit", "frase": "sentence", "archivo": "file",
    "inicio_s": "start_s", "segundos": "seconds", "duraciones": "durations", "k": "shot", "momento": "action",
    "gesto": "gesture", "lugar": "place", "entorno": "environment", "encuadre": "framing", "camara": "camera", "luz": "light",
    "estilo": "style", "efecto_frase": "effect_sentence", "fondo_ref": "background_ref", "conectar": "connect",
    "desconectar": "disconnect", "textos": "texts", "ancho": "width", "alto": "height", "megapixeles": "megapixels",
    "orientacion": "orientation", "descripcion": "description", "audio_salida": "audio_output", "max_segundos": "max_seconds",
    "todos": "all_projects", "fotogramas": "frames", "desde": "from_s", "hasta": "to_s", "mascara_texto": "mask_text",
    "rectangulo": "rectangle", "inicio": "start", "fin": "end", "todo": "whole_video", "referencias": "references",
    "nuevos": "new_frames", "solape": "overlap", "calidad": "quality", "escala": "scale", "donde": "where",
    "nombre_copia": "copy_name", "pistas": "tracks", "lienzo": "canvas", "fuente": "source", "en": "timeline_at",
    "pista": "track", "ini": "source_start", "cerrar_hueco": "close_gap", "ruta": "path", "tipo": "kind", "carpeta": "folder",
    "tema": "topic",
}
POR_HERRAMIENTA = {"poner_clip": {"fin": "source_end"}}     # el mismo nombre viejo con otro sentido

VALORES = {     # parámetro en inglés → {valor en inglés: valor de la app}
    "role": {"character": "personaje", "object": "objeto", "place": "lugar", "clothes": "ropa", "pose": "pose",
             "background": "fondo", "style": "estilo", "effect": "efecto", "font": "letra"},
    "environment": {"none": "ninguno"},
    "audio_output": {"song": "cancion", "model": "modelo"},
    "where": {"copy": "copia", "here": "aqui"},
}
VALORES_EXTENDER = {"quality": {"fast": "rapida", "medium": "media"}, "audio": {"input": "entrada", "model": "modelo"}}
TEXTO = {"text": "texto", "start": "t", "end": "fin", "position": "sitio", "font_ref": "letra", "look": "frase"}
SITIO = {"over": "encima", "beside": "al_lado"}
PISTA = {"kind": "tipo", "show": "ver", "hear": "oir"}
CLIP = {"source": "fuente", "timeline_at": "en", "source_start": "ini", "source_end": "fin"}
LIENZO = {"width": "ancho", "height": "alto"}


def _valor(param: str, v, tabla=VALORES):
    return tabla.get(param, {}).get(v, v) if isinstance(v, str) else v


def _dic(d, tabla):
    return {tabla.get(k, k): v for k, v in d.items()} if isinstance(d, dict) else d


def traducir(es: str, nuevos: dict) -> dict:
    """Los argumentos en inglés de la herramienta `es` → los de la función de la app (nombres y valores en español)."""
    inv = {v: k for k, v in {**PARAMETROS, **POR_HERRAMIENTA.get(es, {})}.items()}
    tabla = {**VALORES, **(VALORES_EXTENDER if es in ("extender", "ver_extension") else {})}
    out = {}
    for k, v in nuevos.items():
        v = _valor(k, v, tabla)
        if k == "texts" and isinstance(v, list):
            v = [{**_dic(x, TEXTO), **({"sitio": SITIO.get(x.get("position"), x.get("position"))} if isinstance(x, dict)
                                        and "position" in x else {})} for x in v]
        elif k == "tracks" and isinstance(v, list):
            v = [{**_dic(p, PISTA), "clips": [_dic(c, CLIP) for c in (p.get("clips") or [])]} if isinstance(p, dict) else p
                 for p in v]
        elif k == "canvas":
            v = _dic(v, LIENZO)
        out[inv.get(k, k)] = v
    return out


# ------------------------------------------------------------------ el texto de vuelta
_CAMBIOS = sorted(HERRAMIENTAS.items(), key=lambda x: -len(x[0]))
_PATRON_H = re.compile(r"\b(" + "|".join(re.escape(k) for k, _ in _CAMBIOS) + r")\b(?=\s*\(|[\s.,;:)»'\"]|$)")
_PATRON_P = re.compile(r"\b(" + "|".join(re.escape(k) for k in sorted(PARAMETROS, key=len, reverse=True)
                                         if len(k) > 2) + r")=")
_CAPITULOS = {"guia://mapa": "guia://proyecto", "guia://organizar": "guia://proyecto", "guia://prompts": "guia://h3",
              "guia://revisar": "guia://h3", "guia://creativo": "guia://proyecto", "guia://recetas": "guia://proyecto",
              "guia://errores": "guia://trampas", "guia://extender": "guia://retocar"}


_CAMPOS = ("efecto_frase", "fondo_ref", "momento", "gesto", "lugar", "entorno", "encuadre", "camara", "luz", "estilo")


def limpiar(texto: str) -> str:
    """Nombres viejos de herramientas, parámetros y capítulos → los nuevos, dentro de lo que contesta una herramienta."""
    if not isinstance(texto, str):
        return texto
    texto = _PATRON_H.sub(lambda m: HERRAMIENTAS[m.group(1)], texto)
    texto = _PATRON_P.sub(lambda m: PARAMETROS[m.group(1)] + "=", texto)
    for viejo, nuevo in _CAPITULOS.items():
        texto = texto.replace(viejo, nuevo)
    texto = re.sub(r"(?m)^(Shot \d+: )([^.\n]*)", lambda m: m.group(1) + re.sub(
        r"\b(" + "|".join(_CAMPOS) + r")\b", lambda x: PARAMETROS[x.group(1)], m.group(2)), texto)
    texto = re.sub(r"(shot \d+ |«)(" + "|".join(_CAMPOS) + r")\b", lambda m: m.group(1) + PARAMETROS[m.group(2)], texto)
    papeles = {v: k for k, v in VALORES["role"].items()}
    texto = re.sub(r"\brole (personaje|objeto|lugar|ropa|fondo|estilo|efecto|letra)\b", lambda m: "role " + papeles[m.group(1)], texto)
    return texto


def _limpiar_todo(r):
    if isinstance(r, str):
        return limpiar(r)
    if isinstance(r, list):
        return [limpiar(x) if isinstance(x, str) else x for x in r]
    return r


# ------------------------------------------------------------------ descripciones (qué hace, qué devuelve, límites, fallos)
P = "`project`: the project name; empty = this session's current project."
DESCRIPCIONES = {
    "status": "Reports whether each service MAX EDITOR needs is up (app, ComfyUI, SDK proxy, optional local LLM), what ComfyUI "
              "and the app queue are running, free VRAM, the GPU with rough render times and limits for it, and this "
              "session's current project. Read-only. A service marked ✗ blocks generating; the local LLM is optional.",
    "read_guide": "Returns a chapter of the agent guide as markdown. topic: «index» lists the chapters (h3, proyecto, "
                  "trampas, retocar). The same text is available as guia://<topic> resources.",
    "list_projects": "Lists the projects, newest first. Read-only. «ejemplo» is read-only: copy it with "
                     "create_project(copy_from=\"ejemplo\").",
    "open_project": "Makes a project this session's current one and returns a short summary of it (view_project gives the "
                    "whole thing). It does not change what the creative has open in the page. Fails if the name does not "
                    "exist (see list_projects).",
    "create_project": "Creates a new empty project, or a copy of `copy_from`, and makes it the current one. Returns a short "
                      "summary. Never overwrites: fails if `name` already exists.",
    "view_project": "Returns the whole project: resolution, seed, references with their current tags and roles, timeline "
                    "(shots with start, end and fields), text track, song, sound, and the gaps the page flags. "
                    "with_prompt=true appends the final prompt H3 will receive. Read-only. " + P,
    "check_project": "Checks the project before generating. Returns ERRORS (they block generate: invalid length, cited tags "
                     "that do not exist…) and WARNINGS (empty main field, negations, very short or identical shots, heavy "
                     "for the GPU…), plus the GPU state. Read-only. " + P,
    "restore_from_video": "Loads the values a video was generated with (fields, references, song, seed) into a project. For "
                          "a retouch, extension or enhancement it uses the original generation. where: «copy» (default) "
                          "creates a new project, `copy_name` or «<project> retomado», and makes it current; «here» "
                          "replaces the current project and requires confirmed=true. Fails for videos without saved values "
                          "(list_videos marks the ones that have them with «prompt ✓»).",
    "list_refmods": "Lists the RefMod library: name, kind (image, video, or «pack of N photos»), concept and description. "
                    "`search` filters by text. Read-only. New RefMods: create_refmod.",
    "set_reference": "Adds a RefMod to the project, or updates it if it is already there. Returns the tag it got "
                     "(<Picture N> or <Video N>) and the current tags: adding a reference can renumber the tags after it "
                     "(fields that cite them are renumbered too).\n"
                     "- role: character · object · place · clothes · pose · background · style · effect · font "
                     "(guia://proyecto explains each).\n"
                     "- name: short English name used in the prompt. character references with the same name become ONE "
                     "subject with ONE card (the first one's).\n"
                     "- card: one English sentence of what the image shows; H3 reads it. For an effect clip, its motion "
                     "step by step.\n"
                     "- pronoun: they / she / he (character). main: true = in every shot; false = only in shots that "
                     "connect it.\n- outfit: for a character photo that also defines an outfit.\n" + P,
    "remove_reference": "Removes a reference (by tag or RefMod name) from the project; the RefMod stays in the library. "
                        "Returns the new tags. Tags after it are renumbered everywhere, free-text fields included; a field "
                        "that cited the removed one is reported on a «Check:» line. " + P,
    "add_text_effect": "Creates a text-only effect (E1, E2…): an English sentence with no image that goes into a shot right "
                       "after the framing. Returns its id; connect it with write_shot(connect=[\"E1\"]). " + P,
    "set_length": "Sets the total length, snapped to the nearest length H3 can make (17·k+5 frames at 24 fps). Returns the "
                  "real seconds and frames. Hand-placed cuts stretch in proportion. " + P,
    "set_shots": "Sets the number of shots and, optionally, each one's length in seconds. With `durations` the total becomes "
                 "their sum (snapped to 17·k+5 frames) and the cuts are fixed; without it the cuts follow the song's beats, "
                 "or are even with no song. Shots beyond `count` are removed from the end. Each shot must be ≥ 0.4 s. "
                 "Returns the shots with their times. " + P,
    "remove_shot": "Removes shot `shot` (1…n); its time is shared among the others. Returns the new number of shots. " + P,
    "write_shot": "Writes the fields of shot `shot`, in English. Only the fields passed change; \"\" empties one. Written "
                  "fields are locked so the local LLM will not rewrite them. Returns the shot's line exactly as it will "
                  "appear in H3's prompt, plus «Check:» lines for anything odd.\n"
                  "- action: the full sentence of what happens (the field H3 follows most).\n"
                  "- gesture: a verb phrase that continues «<Subject 1> …».\n"
                  "- framing; camera: continues «the camera …»; light; style: empty = the references' style.\n"
                  "- place: the place as seen; writing it sets environment «manual». environment: manual · auto (the "
                  "local LLM writes the place; with the LLM off it stays empty) · none (no place).\n"
                  "- background_ref: TAG of a background reference (e.g. «<Picture 3>», not its name). effect_sentence: "
                  "replaces the effect's card in this shot.\n"
                  "- connect / disconnect: tags to add to or remove from this shot. background, place, clothes, pose, "
                  "object and a second character each go to their own slot; effects go to the shot's effects.\n"
                  "- Cite references by their current tag; the main character is <Subject 1>.\n" + P,
    "set_text_track": "Replaces the whole text track. Each item: {text, start (s), end (s, or null = end of its shot), "
                      "position: «over» (over the image) | «beside» (beside the character), font_ref (optional tag of a "
                      "font reference), look (English: how it looks or moves)}. [] empties it. The template assumes the "
                      "character is in the shot. Returns the number of items. " + P,
    "list_songs": "Lists the audio files the app can use (ComfyUI/input), newest first, with size and date. Read-only.",
    "set_song": "Puts a song under the edit, using the segment that starts at `start_s` and lasts as long as the edit; the "
                "segment start is the creative's choice. Returns the song's length and the segment used; if the segment did "
                "not fit, it says the real start. A project copied from another machine may point to a missing segment "
                "file: calling this again rebuilds it. " + P,
    "set_sound": "Sets the «Sound» line (English) that guides the audio H3 makes, and which audio the video keeps: «song» "
                 "(the song, untouched; default) or «model» (H3's audio; the only option when there is no song). Empty "
                 "description = no guidance. " + P,
    "set_resolution": "Sets the video size in multiples of 32: give width + height, or megapixels (0.1–2) + orientation "
                      "(vertical | horizontal). Any aspect ratio. The format and the size are the creative's choice: ask "
                      "them (their reference images hint at it, they do not decide it). Returns the size and "
                      "megapixels. Size and length decide memory and time: status gives this GPU's limits. " + P,
    "set_seed": "Sets the video seed; without a number, a new random one. Returns the seed. " + P,
    "generate": "Queues the edit with a frozen copy of the project (later edits do not reach it). count = 1 uses the "
                "project's seed (or `seed`); count > 1 uses random seeds. Max 4 per call and 6 of yours waiting. Returns "
                "the job ids, the jobs ahead and an estimated time. Every job costs GPU minutes on the creative's machine: "
                "tell them the size, length and estimated time first and run it after their OK. Refuses if check_project "
                "has errors (fix them), and refuses long or heavy jobs unless confirmed=true. " + P,
    "view_queue": "Returns the app's queue: each job's type, project, state, progress, seed, who queued it and, when done, "
                  "its video. With id, only that job. Read-only.",
    "wait_for_job": "Blocks until the job ends (hecho / error / cancelado / interrumpido) or max_seconds pass (max 240), "
                    "then reports it like view_queue. If it is still running, call it again.",
    "cancel_job": "Cancels a waiting or running job. Returns its new state. Jobs queued by the creative are theirs: cancel "
                  "them only when they ask.",
    "retry_job": "Queues again a job that ended in error, cancelled or interrupted, with the same frozen copy and seed.",
    "list_videos": "Lists a project's videos, newest first: edits, retouches, extensions, enhancements and Editing exports, "
                   "with seed, date and «prompt ✓» when restore_from_video can load it. all_projects=true: every "
                   "project's videos. Read-only. " + P,
    "view_video": "Returns 4–12 frames of a video as images (evenly spread, or between from_s and to_s seconds) and its "
                  "size, frames, length and seed. Without `video`, the project's newest one. It cannot hear the audio. "
                  "Read-only. " + P,
    "preview_mask": "Previews a retouch mask without retouching: returns frames of the segment with the zone that would be "
                    "redone painted pink. mask_text runs SAM 3.1 (it marks every match); rectangle {x, y, w, h} is in video "
                    "pixels. Segment: start–end seconds or whole_video=true. Uses the GPU for about a minute or more; if it "
                    "takes too long it returns a job id to follow. " + P,
    "retouch": "Queues a retouch: H3 redoes only the masked zone inside a segment and the app pastes it back into a new "
               "video; the original stays.\n"
               "- Segment: start–end seconds, or whole_video=true. Rounded up to 17·k+5 frames internally (22 or 39 frames "
               "at least); only your range is replaced.\n"
               "- Mask: mask_text (SAM) or rectangle, as in preview_mask.\n"
               "- prompt: short English sentence of how the zone looks after; cite `references` as <Picture 1…> in the "
               "order given.\n- references: up to 4 RefMod names or input images. megapixels: 0.12 · 0.18 · 0.35 · 0.6 "
               "(up to 1.0).\n- No denoise or strength setting. Returns the job ids.\n- It costs GPU minutes: show the "
               "creative the mask (preview_mask) and get their OK first. " + P,
    "plan_extension": "Plans an extension without running it (no GPU): returns where the end comes from (saved latent or "
                      "mp4), which audio will sound, the size H3 renders, the final length and the estimated time. Same "
                      "arguments as extend. " + P,
    "extend": "Queues an extension: H3 continues the same shot from the video's last frames and the app glues the new part "
              "after the original into a new video.\n"
              "- new_frames: steps of 17 (17 = 0.71 s … 204 = 8.5 s).\n"
              "- overlap: frames of the end H3 sees: 22 · 39 (default; the only one exact on the audio grid) · 56 · 73.\n"
              "- quality: fast (~0.25 MP) · medium (~0.5 MP) · original (the video's size; only this one uses the saved "
              "latent).\n- audio: input (default: the song carries on; without a known song the original keeps its "
              "sound) · model (H3's sound).\n- prompt: optional English, only what happens next; empty = same action and "
              "camera.\n- references: up to 4, cited <Picture N>. The app always adds the video's last frame as one more "
              "reference after yours.\n- Fails if the video is shorter than `overlap`. Returns the job ids and the plan.\n"
              "- It costs GPU minutes: tell the creative plan_extension's plan (length, audio, source, time) and run it after "
              "their OK. " + P,
    "enhance": "Queues an enhancement of a whole video with NVIDIA RTX nodes (no H3, usually under a minute): Super "
               "Resolution (scale 1.5 · 2 · 3 · 4, 0 = off; quality LOW · MEDIUM · HIGH · ULTRA) and/or HDR (hdr_nits "
               "400–2000, 0 = off; SDR → HLG 10-bit). At least one. The result is a new video; the original stays. A size "
               "that does not fit ends in error with the reason. Returns the job ids. Tell the creative the output size "
               "and run it after their OK. " + P,
    "list_media": "Lists everything the Editing timeline can use: every project's videos, videos brought from outside "
                  "(Editing only) and audio files. The first column is the `source` that place_clip and replace_timeline "
                  "take. Read-only.",
    "view_timeline": "Returns the project's Editing timeline: tracks top to bottom (V2 covers V1; then A1, A2…), each clip "
                     "with its label («V1#2»), where it sits and which part of its original it uses. The creative edits it "
                     "too. Read-only. " + P,
    "replace_timeline": "Replaces the whole Editing timeline. tracks, top to bottom: [{id: \"V2\"|\"V1\"|\"A1\"…, kind: "
                        "video|audio, show?: true, hear?: true, clips: [{source, timeline_at, source_start?: 0, source_end?: "
                        "end}]}]. Times snap to frames (24 fps); clips of one track must not overlap; video tracks also "
                        "sound unless hear=false. canvas {width, height} = output size (default: the first video's). It "
                        "overwrites what the creative built: read view_timeline first. Returns the new timeline. " + P,
    "place_clip": "Read view_timeline first (the creative may have built part of it). Puts one clip at second `timeline_at` of `track` (default V1 for video, A1 for audio), using "
                  "source_start–source_end seconds of its original (default: all). Whatever was under it in that track is "
                  "trimmed or split. Returns the clip's place and the timeline. " + P,
    "remove_clip": "Removes one clip by its label from view_timeline. close_gap=true moves the later clips of that track "
                   "left. Returns the timeline. " + P,
    "upload_media": "Copies a file from this computer into Editing's library: kind «audio» (optional `folder` to group it) "
                    "or «video» (usable only in Editing). Never overwrites (a repeated name gets _2). Only files the "
                    "creative pointed to. Returns its `source`. Photos for references: upload_photo.",
    "export_timeline": "Joins the saved Editing timeline into a new mp4 with ffmpeg (no GPU, not through the queue; seconds "
                       "to a minute). Returns the file name, clips, length and size; it appears in list_videos. Look at "
                       "each join with view_video(from_s, to_s) before reporting. " + P,
}


def _tipos(fn) -> dict:
    try:
        return typing.get_type_hints(fn)
    except Exception:
        return {}


def envolver(mcp, es: str, fn) -> None:
    """Publica `fn` (la herramienta en español) con su nombre, parámetros y descripción en inglés."""
    en = HERRAMIENTAS[es]
    mapa = {**PARAMETROS, **POR_HERRAMIENTA.get(es, {})}
    sig, tipos = inspect.signature(fn), _tipos(fn)
    params, anot = [], {}
    for p in sig.parameters.values():
        nombre = mapa.get(p.name, p.name)
        params.append(p.replace(name=nombre, annotation=tipos.get(p.name, p.annotation)))
        anot[nombre] = tipos.get(p.name, p.annotation)
    if "return" in tipos:
        anot["return"] = tipos["return"]

    async def en_ingles(**kw):
        try:
            r = await fn(**traducir(es, kw))
        except Exception as exc:                # el texto del error, con los nombres nuevos
            exc.args = tuple(limpiar(a) if isinstance(a, str) else a for a in exc.args)
            raise
        return _limpiar_todo(r)

    en_ingles.__name__ = en
    en_ingles.__signature__ = sig.replace(parameters=params)
    en_ingles.__annotations__ = anot
    mcp.tool(name=en, description=DESCRIPCIONES[en], structured_output=False)(en_ingles)


def registrar(mcp, g: dict, nuevas=None, ocultos_prompts=frozenset(), ocultos_recursos=frozenset()) -> None:
    """Publica la cara en inglés y esconde los alias: las listas solo enseñan los nombres nuevos (herramientas, prompts y
    capítulos de la guía); los viejos siguen respondiendo si alguien los llama."""
    for es in HERRAMIENTAS:
        envolver(mcp, es, g[es])
    visibles = set(HERRAMIENTAS.values()) | set(nuevas or ())
    herramientas, prompts, recursos = mcp.list_tools, mcp.list_prompts, mcp.list_resources

    async def solo_herramientas():
        return [t for t in await herramientas() if t.name in visibles]

    async def solo_prompts():
        return [x for x in await prompts() if x.name not in ocultos_prompts]

    async def solo_recursos():
        return [x for x in await recursos() if str(x.uri) not in ocultos_recursos]

    mcp.list_tools, mcp.list_prompts, mcp.list_resources = solo_herramientas, solo_prompts, solo_recursos
