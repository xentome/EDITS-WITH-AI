"""Extender un video de MAX EDITOR: H3 sigue la MISMA toma desde el final del video, sin corte, y la app pega lo nuevo
detrás del original. Plano: ../planos/fases/12 Extender video.md (el método salió de las notas de investigación del autor, fuera del repo).

Cómo: la cola del video (el «solape», 39 fotogramas por defecto) se planta al principio de un latente vacío y se marca
«no tocar» con una máscara de ruido (😺NKD AV Latent Extend: el workflow de drozbay/ablejones en un nodo). El núcleo de
ComfyUI (PR #15375) muestrea esas filas como contexto limpio, así que H3 sigue su movimiento y su sonido. Después se tira el
solape y se pega lo nuevo. Si el video tiene su latente guardado (MpiSaveLatent, en Generar y Extender) la cola sale de él;
si no, del mp4 (se vuelve a codificar con el VAE y pierde un poco de color).

Mismo contrato que retocar.py:
  plan(datos) -> dict                 lo que enseña la página antes de lanzar (fuente, audio, resolución, ventana)
  preparar(datos) -> (grafo, meta)    el grafo listo
  iniciar(datos) -> str               lanza en un hilo; el avance, con generar.estado(id)
  recuperar(datos, rutas, sello)      para la cola: un trabajo que ComfyUI terminó con el servidor parado

`datos` = {video, solape (22|39|56|73), nuevos (17·k), calidad (rapida|media|original), audio_salida (entrada|modelo),
           prompt, referencias: [{refmod}|{imagen}] (0–4), semilla, proyecto}
Longitudes: H3 genera ventanas de 17n+5 fotogramas; la ventana es solape + nuevos, así que con un solape 17j+5 lo nuevo va
de 17 en 17. El solape de 39 f es el único que cae exacto en la rejilla del audio (39 f = 65 pasos de 1/40 s)."""
from __future__ import annotations

import copy
import json
import os
import random
import re
import shutil
import subprocess
from datetime import datetime

import generar
import retocar
from generar import ErrorGenerar

SALIDAS = generar.SALIDAS
CARPETA = "max_editor/extender"            # dentro de ComfyUI/input: la cola cortada y el trozo de canción
SOLAPES = (22, 39, 56, 73)                 # 17j+5 con j = 1…4 (el NKD cuenta «chunks»: 22 = 2, 39 = 3…)
SOLAPE = 39
NUEVOS, NUEVOS_MAX = 68, 204               # de 17 en 17
FPS = 24.0
CALIDADES = {"rapida": 0.25, "media": 0.5, "original": None}   # megapíxeles de lo que genera H3 (None: los del video)
AUDIOS = ("entrada", "modelo")
MAX_REFERENCIAS = 4
MIN_POR_39 = (3, 4)                         # minutos por cada 39 f a la resolución de la app (como Retocar)

# los nodos del grafo (los de la plantilla de Retocar se copian con su número)
DE_RETOCAR = ("2", "3", "4", "7", "137", "104", "8", "9", "10", "28", "30", "31", "89", "112")
N_VAE, N_VAE_AUDIO, N_CLIP, N_MODELO, N_PROMPT, N_RUIDO, N_REF_MODELO = "9", "10", "8", "104", "89", "28", "112"
N_CARGAR_LATENTE, N_VIDEO, N_PARTES, N_CODIFICAR = "50", "51", "52", "53"
N_NUEVO, N_EXTENDER, N_CANCION, N_GUIA = "25", "60", "61", "62"
N_GUIADOR, N_SAMPLER, N_LIBERAR, N_GUARDAR_LATENTE = "29", "32", "33", "70"
N_DECO, N_DECO_AUDIO, N_CREAR, N_GUARDAR = "34", "35", "36", "37"


# ---------------------------------------------------------------- números
def solape(datos: dict) -> int:
    try:
        s = int(datos.get("solape") or SOLAPE)
    except (TypeError, ValueError):
        raise ErrorGenerar("el solape no es válido")
    if s not in SOLAPES:
        raise ErrorGenerar(f"el solape debe ser uno de {', '.join(map(str, SOLAPES))} fotogramas")
    return s


def nuevos(datos: dict) -> int:
    """Lo que se alarga, redondeado a 17 (17, 34, 51…): la ventana solape + nuevos queda en 17n+5."""
    try:
        n = int(round(float(datos.get("nuevos") or NUEVOS)))
    except (TypeError, ValueError):
        raise ErrorGenerar("cuánto se alarga no es válido")
    return max(17, min(NUEVOS_MAX, 17 * max(1, round(n / 17))))


def calidad(datos: dict) -> str:
    c = datos.get("calidad") or "original"
    if c not in CALIDADES:
        raise ErrorGenerar(f"la calidad debe ser una de: {', '.join(CALIDADES)}")
    return c


def a32(x: float) -> int:
    return max(32, int(round(x / 32)) * 32)


def tamano(vi: dict, cal: str) -> tuple[int, int]:
    """El ancho y alto de lo que genera H3: los del video (en la rejilla de 32) o la misma forma con menos megapíxeles."""
    w, h = vi["ancho"], vi["alto"]
    mp = CALIDADES[cal]
    if mp is None or w * h <= mp * 1024 * 1024:
        return a32(w), a32(h)
    k = (mp * 1024 * 1024 / (w * h)) ** 0.5
    # el lado corto se redondea y el largo sale de la forma del video (redondear los dos por separado la deforma)
    if w <= h:
        nw = a32(w * k)
        return nw, a32(nw * h / w)
    nh = a32(h * k)
    return a32(nh * w / h), nh


# ---------------------------------------------------------------- de dónde sale el video
def _filas() -> dict:
    return {f["archivo"]: f for f in generar.historial() if f.get("archivo")}


def _ruta_latente(nombre: str) -> str:
    return os.path.join(retocar.comfyui_dir(), "output", "latents", os.path.basename(nombre) + ".latent")


def fuente_latente(video: str, vi: dict, w: int, h: int, s: int) -> tuple[str | None, str]:
    """(nombre del latente o None, por qué). Un retoque que no tocó los últimos `s` fotogramas sirve con el latente del video
    del que salió (su final es el mismo); el latente tiene que existir y ser del tamaño que se va a generar."""
    filas, fila = _filas(), None
    fila = filas.get(video)
    vistos = set()
    while fila and fila.get("tipo") == "retoque" and fila.get("de") not in vistos:
        tr = fila.get("tramo") or {}
        if int(tr.get("f0", 0)) + int(tr.get("n", 0)) > vi["fotogramas"] - s:
            return None, "retoque_final"
        vistos.add(fila.get("de"))
        fila = filas.get(fila.get("de"))
    if not fila or not fila.get("latente"):
        return None, "sin_latente"
    if not os.path.isfile(_ruta_latente(fila["latente"])):
        return None, "latente_borrado"
    if list(fila.get("latente_wh") or []) != [w, h]:
        return None, "otra_resolucion"
    return fila["latente"], "latente"


def _cancion_del_proyecto(proyecto: str | None) -> dict | None:
    """La canción del proyecto como está AHORA (para videos viejos, sin la canción anotada): {original, inicio_s}."""
    if not proyecto:
        return None
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "proyectos", re.sub(r"[/\\]", "_", proyecto) + ".json")
    try:
        with open(ruta, encoding="utf-8") as f:
            valores = (json.load(f) or {}).get("valores") or {}
        for campos in valores.values():
            e = (campos or {}).get("estado")
            if not isinstance(e, str) or '"audio"' not in e:
                continue
            e = json.loads(e)
            a = e.get("audio") or {}
            if a.get("original"):                     # con «Audio de H3» también: la canción guió el video
                return {"original": a["original"], "inicio_s": float(a.get("inicio_s") or 0)}
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return None


def cancion(video: str) -> tuple[dict | None, str]:
    """La canción que suena en el video: (dict {original, inicio_s} o None, de dónde): «anotada» en su fila del historial (o
    en la del video del que salió un retoque o una extensión), «proyecto» (la del proyecto ahora, para videos viejos) o
    «ninguna» (mp4 de fuera, o generado con el audio del modelo)."""
    filas, fila, vistos = _filas(), _filas().get(video), set()
    while fila and fila.get("tipo") in ("retoque", "extension") and "audio" not in fila and fila.get("de") not in vistos:
        vistos.add(fila.get("de"))
        fila = filas.get(fila.get("de"))
    if not fila:
        return None, "ninguna"
    if fila.get("audio"):
        return fila["audio"], "anotada"
    if fila.get("sin_cancion") or ("audio" in fila and fila.get("tipo") == "extension"):
        return None, "ninguna"
    # sin canción anotada: un video de antes del 29 oct (con «Audio de H3» se anotaba None) → la del proyecto ahora
    c = _cancion_del_proyecto(fila.get("proyecto"))
    return (c, "proyecto") if c else (None, "ninguna")


def _ruta_cancion(c: dict) -> str | None:
    ruta = retocar._dentro(os.path.join(retocar.comfyui_dir(), "input"), str(c.get("original") or ""))
    return ruta if ruta and os.path.isfile(ruta) else None


def _duracion(ruta: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def plan(datos: dict) -> dict:
    """Todo lo que se decide antes de lanzar, para la página y para preparar: tamaños, ventana, fuente y audio."""
    datos = datos or {}
    vi = retocar.info(datos.get("video"))
    s, n, cal = solape(datos), nuevos(datos), calidad(datos)
    audio_salida = datos.get("audio_salida") or "entrada"
    if audio_salida not in AUDIOS:
        raise ErrorGenerar("el audio debe ser «entrada» o «modelo»")
    total = int(round(vi["duracion"] * FPS)) if abs(vi["fps"] - FPS) > 0.01 else vi["fotogramas"]
    if total < s:
        raise ErrorGenerar(f"el video tiene {total} fotogramas: menos que el solape ({s})")
    w, h = tamano(vi, cal)
    latente, por_que = fuente_latente(datos.get("video"), vi, w, h, s)
    c, de = cancion(datos.get("video"))
    ruta_c = _ruta_cancion(c) if c else None
    if c and not ruta_c:
        c, de = None, "cancion_borrada"
    usa_cancion = bool(c) and audio_salida == "entrada"
    sobra = None
    if usa_cancion:
        sobra = round(_duracion(ruta_c) - float(c.get("inicio_s") or 0) - (total + n) / FPS, 3)
    ventana = s + n
    escala = ventana / 39 * (w * h) / (960 * 544)
    lo = max(1, round(MIN_POR_39[0] * escala))
    return {"video": datos.get("video"), "info": vi, "total": total, "fps": FPS, "solape": s, "nuevos": n, "ventana": ventana,
            "calidad": cal, "ancho": w, "alto": h, "fuente": "latente" if latente else "mp4", "latente": latente,
            "por_que": por_que, "audio_salida": audio_salida, "cancion": c, "cancion_de": de, "usa_cancion": usa_cancion,
            "cancion_sobra_s": sobra, "minutos": [lo, max(lo + 1, round(MIN_POR_39[1] * escala))],
            "duracion_final": round((total + n) / FPS, 3), "memoria": ventana / FPS > 8 or (ventana / FPS > 5 and w * h > 0.45e6)}


# ---------------------------------------------------------------- ffmpeg
def _cortar_cola(ruta: str, p: dict, sello: str) -> str:
    """Los últimos `solape` fotogramas a 24 fps y al tamaño que se genera, con su audio (o silencio), para el LoadVideo."""
    s, total, w, h = p["solape"], p["total"], p["ancho"], p["alto"]
    nombre = f"{CARPETA}/cola_{sello}.mp4"
    destino = os.path.join(retocar.comfyui_dir(), "input", nombre)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    f0, dur = total - s, s / FPS
    vf = f"fps={FPS:g},select='gte(n\\,{f0})',setpts=PTS-STARTPTS,scale={w}:{h}:flags=lanczos,setsar=1"
    if p["info"]["audio"]:
        retocar._ffmpeg("-i", ruta, "-vf", vf, "-af", f"atrim=start={f0 / FPS:.6f},asetpts=PTS-STARTPTS,apad=whole_dur={dur:.6f}",
                        "-frames:v", str(s), "-c:v", "libx264", "-crf", "10", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                        "-t", f"{dur:.6f}", destino)
    else:
        retocar._ffmpeg("-i", ruta, "-f", "lavfi", "-t", f"{dur:.6f}", "-i", "anullsrc=r=44100:cl=stereo", "-vf", vf,
                        "-frames:v", str(s), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "10", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-shortest", destino)
    return nombre


def _ultimo_fotograma(ruta: str, p: dict, sello: str) -> str:
    """El último fotograma del video (a 24 fps) en un PNG del tamaño que se genera, para la referencia automática."""
    nombre = f"{CARPETA}/ultimo_{sello}.png"
    destino = os.path.join(retocar.comfyui_dir(), "input", nombre)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    retocar._ffmpeg("-i", ruta, "-vf", f"fps={FPS:g},select='gte(n\\,{p['total'] - 1})',scale={p['ancho']}:{p['alto']}:flags=lanczos",
                    "-frames:v", "1", destino)
    return nombre


def _cortar_cancion(p: dict, sello: str) -> str:
    """El trozo de canción que suena durante la ventana (desde donde empieza el solape), para la guía de audio de H3."""
    c = p["cancion"]
    t0 = float(c.get("inicio_s") or 0) + (p["total"] - p["solape"]) / FPS
    dur = p["ventana"] / FPS
    nombre = f"{CARPETA}/cancion_{sello}.wav"
    destino = os.path.join(retocar.comfyui_dir(), "input", nombre)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    retocar._ffmpeg("-i", _ruta_cancion(c), "-af", f"atrim=start={t0:.6f},asetpts=PTS-STARTPTS,apad=whole_dur={dur:.6f}",
                    "-t", f"{dur:.6f}", "-ar", "48000", "-ac", "2", destino)
    return nombre


def unir(original: str, ventana: str, p: dict, destino: str) -> None:
    """El original (a 24 fps) + lo nuevo de la ventana (sin el solape, al tamaño del original). Audio: el del original tal
    cual y, en lo nuevo, la canción justo desde el segundo en que acaba el original (si se usa) o lo que generó H3.
    (29 oct) Antes, con la canción, se ponía la canción entera encima y el original perdía su sonido si era el de H3."""
    vi, s, n, total = p["info"], p["solape"], p["nuevos"], p["total"]
    W, H = vi["ancho"], vi["alto"]
    norm = f"scale={W}:{H}:flags=lanczos,setsar=1,format=yuv420p"
    filtros = [f"[0:v]fps={FPS:g},trim=end_frame={total},setpts=PTS-STARTPTS,{norm}[a]",
               f"[1:v]tpad=stop_mode=clone:stop={n},trim=start_frame={s}:end_frame={s + n},setpts=PTS-STARTPTS,{norm}[b]",
               "[a][b]concat=n=2:v=1:a=0[v]"]
    entradas = ["-i", original, "-i", ventana]
    orig = (f"[0:a]aresample=48000,asetpts=PTS-STARTPTS,apad=whole_dur={total / FPS:.6f},atrim=duration={total / FPS:.6f}[oa]"
            if vi["audio"] else f"anullsrc=r=48000:cl=stereo,atrim=duration={total / FPS:.6f}[oa]")
    if p["usa_cancion"]:
        t0 = float(p["cancion"].get("inicio_s") or 0) + total / FPS      # donde acaba el original, en la canción
        entradas += ["-ss", f"{t0:.6f}", "-i", _ruta_cancion(p["cancion"])]
        nuevo = f"[2:a]aresample=48000,asetpts=PTS-STARTPTS,apad=whole_dur={n / FPS:.6f},atrim=duration={n / FPS:.6f}[na]"
    else:
        nuevo = (f"[1:a]aresample=48000,atrim=start={s / FPS:.6f}:duration={n / FPS:.6f},asetpts=PTS-STARTPTS,"
                 f"apad=whole_dur={n / FPS:.6f}[na]")
    # las dos partes con el mismo formato (una canción mono o a 44,1 kHz no se puede pegar tal cual a la de H3)
    fmt = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
    filtros += [orig.replace("[oa]", f",{fmt}[oa]"), nuevo.replace("[na]", f",{fmt}[na]"), "[oa][na]concat=n=2:v=0:a=1[au]"]
    retocar._ffmpeg(*entradas, "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "[au]", "-r", f"{FPS:g}",
                    "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                    "-movflags", "+faststart", destino)


# ---------------------------------------------------------------- el grafo
def _nodos_de_retocar() -> dict:
    g, _ = retocar._plantilla()
    return {nid: copy.deepcopy(g[nid]) for nid in DE_RETOCAR}


def preparar(datos: dict, sello: str | None = None) -> tuple[dict, dict]:
    datos = datos or {}
    refs = list(datos.get("referencias") or [])
    if len(refs) > MAX_REFERENCIAS:
        raise ErrorGenerar(f"como mucho {MAX_REFERENCIAS} referencias")
    p = plan(datos)
    sello = sello or f"{datetime.now():%Y%m%d_%H%M%S}"
    g = _nodos_de_retocar()
    w, h, L = p["ancho"], p["alto"], p["ventana"]

    # la cola: del latente guardado o del mp4 cortado y codificado otra vez (NKDAVLatent con el audio tal cual)
    if p["fuente"] == "latente":
        g[N_CARGAR_LATENTE] = {"class_type": "MpiLoadLatent", "inputs": {"filename": p["latente"]}}
        previo = [N_CARGAR_LATENTE, 0]
    else:
        g[N_VIDEO] = {"class_type": "LoadVideo", "inputs": {"file": _cortar_cola(retocar.ruta_video(datos["video"]), p, sello)}}
        g[N_PARTES] = {"class_type": "GetVideoComponents", "inputs": {"video": [N_VIDEO, 0]}}
        g[N_CODIFICAR] = {"class_type": "NKDAVLatent", "inputs": {
            "images": [N_PARTES, 0], "audio": [N_PARTES, 1], "video_vae": [N_VAE, 0], "audio_vae": [N_VAE_AUDIO, 0],
            "audio_mode": "keep", "fps": FPS, "ramp_ticks": 0, "ramp_out_ticks": 0, "ramp_shape": "cosine"}}
        previo = [N_CODIFICAR, 0]

    # lo nuevo: el latente vacío de la ventana con el prompt y las referencias (una LoadImage por referencia: <Picture N>).
    # El último fotograma del video va SIEMPRE como la última referencia: sin él, con el prompt vacío, H3 (Singularity) se
    # inventaba otra escena (prueba real del 28 oct con un mp4: el solape bien y lo nuevo, otra persona). Va al final para no
    # mover los <Picture N> que cita el usuario.
    refs = refs + [{"imagen": _ultimo_fotograma(retocar.ruta_video(datos["video"]), p, sello) + " [input]"}]
    k = len(refs)
    pedido = (datos.get("prompt") or "").strip()
    prompt = (f"<Picture {k}> is the last frame of the shot so far. The same shot continues without a cut: the same subject, "
              "with the same clothes, keeps doing the same action in the same place, with the same camera, framing, lighting "
              "and style.") + (f" {pedido}" if pedido else "")
    modelo = g.pop(N_REF_MODELO)
    g[N_NUEVO] = {"class_type": "MiniMaxH3ReferenceToVideo", "inputs": {
        "clip": [N_CLIP, 0], "prompt": [N_PROMPT, 0], "width": w, "height": h, "length": L, "ref_image_size": "match",
        "vae": [N_VAE, 0], "audio_vae": [N_VAE_AUDIO, 0]}}
    for i, ref in enumerate(refs):
        nid = str(300 + i)
        nodo = copy.deepcopy(modelo)
        nodo["inputs"]["image"] = retocar._imagen_de_referencia(ref)
        nodo["_meta"] = {"title": f"<Picture {i + 1}>"}
        g[nid] = nodo
        g[N_NUEVO]["inputs"][f"ref_images.ref_image_{i}"] = [nid, 0]
    g[N_PROMPT]["inputs"].update(prompt=prompt, ref_images=len(refs), duration_seconds=round(L / FPS, 3))
    g[N_EXTENDER] = {"class_type": "NKDAVLatentExtend", "inputs": {
        "previous": previo, "new_latent": [N_NUEVO, 1], "overlap_chunks": (p["solape"] - 5) // 17 + 1}}

    # la canción guía el audio de toda la ventana (como en Generar: MiniMaxH3AddGuide en el fotograma 0)
    condicion = [N_NUEVO, 0]
    if p["usa_cancion"]:
        g[N_CANCION] = {"class_type": "LoadAudio", "inputs": {"audio": _cortar_cancion(p, sello)}}
        g[N_GUIA] = {"class_type": "MiniMaxH3AddGuide", "inputs": {
            "positive": [N_NUEVO, 0], "latent": [N_EXTENDER, 0], "frame_idx": 0, "audio_vae": [N_VAE_AUDIO, 0], "audio": [N_CANCION, 0]}}
        condicion = [N_GUIA, 0]

    # el sampler de ComfyUI (admite máscaras): euler, 8 pasos con el adaptador turbo del VDN, como Retocar
    g[N_GUIADOR] = {"class_type": "BasicGuider", "inputs": {"model": [N_MODELO, 0], "conditioning": condicion}}
    g[N_SAMPLER] = {"class_type": "SamplerCustomAdvanced", "inputs": {
        "noise": [N_RUIDO, 0], "guider": [N_GUIADOR, 0], "sampler": ["30", 0], "sigmas": ["31", 0], "latent_image": [N_EXTENDER, 0]}}
    g[N_LIBERAR] = {"class_type": "VRAM_Debug", "inputs": {"empty_cache": True, "gc_collect": True, "unload_all_models": True,
                                                            "any_input": [N_SAMPLER, 0]}}
    # el latente de la ventana, para extender otra vez sin pasar por el mp4 (su final es el final del video nuevo)
    latente = f"max_editor_ext_{sello}_{random.randrange(16 ** 6):06x}"
    g[N_GUARDAR_LATENTE] = {"class_type": "MpiSaveLatent", "inputs": {"samples": [N_LIBERAR, 0], "filename": latente, "boolean": True}}
    g[N_DECO] = {"class_type": "VAEDecode", "inputs": {"samples": [N_GUARDAR_LATENTE, 0], "vae": [N_VAE, 0]}}
    g[N_DECO_AUDIO] = {"class_type": "VAEDecodeAudio", "inputs": {"samples": [N_GUARDAR_LATENTE, 0], "vae": [N_VAE_AUDIO, 0]}}
    g[N_CREAR] = {"class_type": "CreateVideo", "inputs": {"images": [N_DECO, 0], "fps": FPS, "audio": [N_DECO_AUDIO, 0]}}
    g[N_GUARDAR] = {"class_type": "SaveVideo", "inputs": {"video": [N_CREAR, 0], "filename_prefix": f"max_editor/extension_{sello}",
                                                         "format": "auto", "codec": "auto", "format.codec": "auto"}}
    semilla = datos.get("semilla")
    g[N_RUIDO]["inputs"]["noise_seed"] = int(semilla) if semilla not in (None, "") else random.randrange(2 ** 32)
    meta = {"plan": p, "sello": sello, "latente": latente, "referencias": refs[:-1], "prompt": (datos.get("prompt") or "").strip(),
            "proyecto": datos.get("proyecto"), "video": datos.get("video")}
    return g, meta


def validar(grafo: dict) -> list[str]:
    return retocar.validar(grafo)


# ---------------------------------------------------------------- lanzar y terminar
def iniciar(datos: dict) -> str:
    c = generar.config()
    try:
        grafo, meta = preparar(datos)
        generar.comprobar_servicios(c)
    except Exception as exc:
        return generar._nuevo("error", generar._texto_error(exc, c))
    p = meta["plan"]
    return generar.lanzar(grafo, {"meta": meta, "proyecto": meta["proyecto"]}, c, despues=_despues,
                          extra={"tipo": "extension", "extension": {"solape": p["solape"], "nuevos": p["nuevos"], "fuente": p["fuente"]}})


def _fila(meta: dict, semilla, ventana_archivo: str) -> dict:
    p = meta["plan"]
    return {"tipo": "extension", "semilla": semilla, "proyecto": meta.get("proyecto"), "de": meta["video"],
            "extension": {"solape": p["solape"], "nuevos": p["nuevos"], "calidad": p["calidad"], "fuente": p["fuente"],
                          "desde": p["total"], "ventana": p["ventana"], "ancho": p["ancho"], "alto": p["alto"]},
            "ventana_video": ventana_archivo, "latente": meta["latente"], "latente_wh": [p["ancho"], p["alto"]],
            # la canción sigue anotada (así otra extensión la continúa); None = sin canción conocida
            "audio": p["cancion"], "audio_salida": p["audio_salida"],
            "referencias": meta["referencias"], "prompt": meta["prompt"]}


def _despues(tid: str, grafo: dict, job, opciones: dict):
    meta = opciones["meta"]
    videos = generar.videos_del_job(job, grafo, ("SaveVideo",))
    if not videos:
        raise ErrorGenerar("ComfyUI terminó pero no devolvió la extensión")
    os.makedirs(SALIDAS, exist_ok=True)
    semilla = generar._semilla_de(grafo)
    ventana = f"extension_{meta['sello']}_{semilla}_ventana.mp4"
    videos[-1].to_file(os.path.join(SALIDAS, ventana))
    generar._poner(tid, mensaje="pegando lo nuevo detrás del original", avance=0.98)
    archivo = f"extension_{meta['sello']}_{semilla}.mp4"
    unir(retocar.ruta_video(meta["video"]), os.path.join(SALIDAS, ventana), meta["plan"], os.path.join(SALIDAS, archivo))
    return archivo, _fila(meta, semilla, ventana)


def recuperar(datos: dict, rutas: list[str], sello: str) -> tuple[str, dict]:
    """Para la cola: la ventana que ComfyUI dejó en su salida; se pega igual que en _despues. El latente se guardó con el
    nombre del grafo, que aquí no se sabe: la extensión recogida no lo anota (se extiende desde el mp4)."""
    p = plan(datos)
    semilla = datos.get("semilla")
    ventana, archivo = f"extension_{sello}_{semilla}_ventana.mp4", f"extension_{sello}_{semilla}.mp4"
    os.makedirs(SALIDAS, exist_ok=True)
    shutil.copyfile(rutas[-1], os.path.join(SALIDAS, ventana))
    unir(retocar.ruta_video(datos["video"]), os.path.join(SALIDAS, ventana), p, os.path.join(SALIDAS, archivo))
    meta = {"plan": p, "latente": None, "referencias": datos.get("referencias") or [], "prompt": datos.get("prompt") or "",
            "proyecto": datos.get("proyecto"), "video": datos["video"]}
    fila = _fila(meta, semilla, ventana)
    fila.pop("latente"), fila.pop("latente_wh")
    return archivo, fila


if __name__ == "__main__":
    # línea de órdenes: extender.py datos.json [--seco]   (--seco: el plan y el grafo validado, sin lanzar)
    import sys
    import time
    with open(sys.argv[1], encoding="utf-8") as f:
        pedido = json.load(f)
    if "--seco" in sys.argv:
        g, m = preparar(pedido)
        print(json.dumps(m["plan"], ensure_ascii=False, indent=1))
        print("\n".join(validar(g)) or "grafo válido según /object_info")
        sys.exit(0)
    tid = iniciar(pedido)
    while True:
        e = generar.estado(tid)
        print(f"{e['segundos']:6.0f} s  {e['estado']:10} {e['avance']:.2f}  {e.get('nodo') or ''} {e['mensaje']}", flush=True)
        if e["estado"] in ("listo", "error"):
            print(json.dumps(e, ensure_ascii=False, indent=1))
            break
        time.sleep(10)
