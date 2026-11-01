"""Retocar un video de MAX EDITOR: se elige un tramo, se tapa una zona (por texto con SAM 3.1 o con un rectángulo), se dan
sus imágenes de referencia y un prompt, y H3 rehace solo esa zona (inpainting). Al terminar se arma la versión completa:
el video original con ese tramo sustituido y el audio original intacto. Plano: ../planos/fases/7 (secciones 9 y 10).

Mismo contrato que generar.py, y comparte con él el trabajo (lanzar por el SDK, avance, estado y cancelar):
  info(video) -> dict                 {ancho, alto, fps, fotogramas, duracion, audio}
  preparar(datos) -> (grafo, meta)    el grafo listo y lo que hace falta para armar el video completo (corta el tramo)
  iniciar(datos) -> str               lanza en un hilo; el avance y el final se leen con generar.estado(id)
  validar(grafo) -> list[str]         los problemas del grafo según /object_info de ComfyUI (vacío = bien)

`datos` = {video, inicio, fin, mascara: {modo: "texto", texto} | {modo: "rectangulo", x, y, w, h},
           referencias: [{refmod: nombre} | {imagen: "ruta [input]"}] (0 a 4), prompt, semilla, proyecto, megapixeles,
           modo: "cambiar" (por defecto; `fuerza` 0,40–1) | "detallar" (`denoise` 0,10–0,80, `lienzo` 384–1024) |
                 "quitar" (LanPaint; `vueltas` 1–4)}
`megapixeles` (27 oct): la resolución a la que H3 rehace el tramo. La decide el recorte alrededor de la máscara
(MVEx_SubjectCrop, nodo 19): su upscale_megapixels lleva el recorte a ese tamaño (en negativo: sube o baja), en la rejilla de
32 (divisible_by); el NKDAVLatent saca el latente de esos fotogramas. El NKDTimeline y el CR Aspect Ratio no lo cambian.
Vista de la máscara (27 oct): iniciar_mascara(datos) calcula solo la máscara del tramo, con la misma rama, la misma limpieza
y el mismo recorte que el retoque, y devuelve el tramo con la zona que se rehará en rosa (sin H3).
`video`: un archivo de app/salidas («edit_….mp4») o de ComfyUI con su carpeta («x.mp4 [input]», «x.mp4 [output]»).
Fotogramas (27 oct): el usuario elige cualquier selección, de 1 fotograma al clip entero (`f0` y `n`, o `inicio` y `fin`).
H3 pide 17n+5, así que por dentro se GENERA el tramo válido más pequeño que la contiene (`tramo_generado`), ampliado por el
lado que tenga sitio y centrado si se puede; si el video es más corto, se rellena repitiendo el último fotograma. Al pegar,
solo se sustituyen los fotogramas elegidos: los de relleno se quedan como en el original."""
from __future__ import annotations

import copy
import json
import os
import random
import re
import shutil
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime

import generar
from generar import ErrorGenerar

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA_PLANTILLA = os.path.join(AQUI, "plantillas", "retocar.api.json")
SALIDAS = generar.SALIDAS
CARPETA_TRAMOS = "max_editor/retocar"          # dentro de ComfyUI/input: el tramo cortado que lee el LoadVideo
MAX_REFERENCIAS = 4
# la resolución del retoque, en megapíxeles del recorte (1 MP = 1024 × 1024): la de siempre (0,18) y sus límites
MEGAPIXELES, MP_MIN, MP_MAX = 0.18, 0.05, 1.0
N_RECORTE, N_TAMANO, N_OPS, N_OPS_FINAL, N_VAE = "19", "20", "23", "24", "9"

# los nodos de la plantilla (sus números; la plantilla dice cuáles son las ramas de la máscara en «_max_editor»)
N_VIDEO, N_LINEA, N_LIMPIEZA, N_CONDICION, N_PROMPT, N_RUIDO, N_GUARDAR = "11", "12", "18", "25", "89", "28", "105"
N_SAM_TEXTO, N_SAM_SALIDA = "14", "17"
N_FONDO, N_RECT, N_PONER, N_REPETIR, N_RECT_SALIDA = "201", "202", "203", "205", "206"
N_REF_MODELO = "112"


def comfyui_dir() -> str:
    """La carpeta de ComfyUI, con el mismo orden que servidor.py (config.json, config.local.json y la variable)."""
    c = {}
    for nombre in ("config.json", "config.local.json"):
        try:
            with open(os.path.join(AQUI, nombre), encoding="utf-8") as f:
                c.update(json.load(f) or {})
        except (OSError, ValueError):
            pass
    d = os.environ.get("MAX_EDITOR_COMFYUI_DIR") or c.get("comfyui_dir") or "~/comfy/ComfyUI"
    return os.path.abspath(os.path.expanduser(d))


def _plantilla() -> tuple[dict, dict]:
    with open(RUTA_PLANTILLA, encoding="utf-8") as f:
        g = json.load(f)
    meta = g.pop("_max_editor", {})
    return g, meta


# ---------------------------------------------------------------- archivos y ffmpeg

def _dentro(base: str, rel: str) -> str | None:
    ruta = os.path.abspath(os.path.join(base, rel))
    return ruta if ruta.startswith(os.path.abspath(base) + os.sep) else None


def ruta_video(video: str) -> str:
    """«edit_….mp4» → app/salidas; «x [input]» / «x [output]» → esa carpeta de ComfyUI. Nada fuera de ellas."""
    video = (video or "").strip()
    if not video:
        raise ErrorGenerar("falta el video: elige uno en la línea de tiempo de Retocar")
    for marca, carpeta in ((" [input]", "input"), (" [output]", "output")):
        if video.endswith(marca):
            ruta = _dentro(os.path.join(comfyui_dir(), carpeta), video[:-len(marca)])
            break
    else:
        ruta = _dentro(SALIDAS, video)
    if not ruta or not os.path.isfile(ruta):
        raise ErrorGenerar(f"no encuentro el video «{video}»")
    return ruta


def _ffmpeg(*args) -> None:
    if not shutil.which("ffmpeg"):
        raise ErrorGenerar("falta ffmpeg: instálalo (sudo pacman -S ffmpeg / apt install ffmpeg)")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise ErrorGenerar("ffmpeg falló: " + (r.stderr.strip().splitlines() or ["?"])[-1])


def info(video: str) -> dict:
    """Ancho, alto, fps, fotogramas, duración y si tiene audio (ffprobe)."""
    ruta = ruta_video(video)
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames,duration:format=duration",
                        "-of", "json", ruta], capture_output=True, text=True)
    if r.returncode != 0:
        raise ErrorGenerar(f"no puedo leer el video «{video}»: {r.stderr.strip()}")
    d = json.loads(r.stdout)
    v = next((s for s in d.get("streams", []) if s.get("codec_type") == "video"), None)
    if not v:
        raise ErrorGenerar(f"«{video}» no tiene imagen")
    a, b = (v.get("r_frame_rate") or "24/1").split("/")
    fps = float(a) / float(b or 1) if float(b or 1) else 24.0
    duracion = float(v.get("duration") or d.get("format", {}).get("duration") or 0)
    fotogramas = int(v.get("nb_frames") or 0) or int(round(duracion * fps))
    return {"video": video, "ancho": int(v["width"]), "alto": int(v["height"]), "fps": round(fps, 3), "fotogramas": fotogramas,
            "duracion": round(fotogramas / fps if fps else duracion, 3),
            "audio": any(s.get("codec_type") == "audio" for s in d.get("streams", []))}


def fotogramas_validos(n: int) -> int:
    """El 17k+5 más cercano a n (k ≥ 1: 22, 39, 56, 73…)."""
    k = max(1, round((n - 5) / 17))
    return 17 * k + 5


def valido_que_contiene(n: int) -> int:
    """El 17k+5 más pequeño que es al menos n (k ≥ 1: 22, 39, 56…)."""
    return 17 * max(1, -(-(max(1, n) - 5) // 17)) + 5


def seleccion(datos: dict, fps: float, total: int) -> tuple[int, int]:
    """(primer fotograma, número de fotogramas) que eligió el usuario, dentro del video: `f0` y `n` o, si no, `inicio`/`fin`."""
    try:
        if datos.get("f0") is not None and datos.get("n") is not None:
            f0, n = int(datos["f0"]), int(datos["n"])
        else:
            f0 = int(round(float(datos.get("inicio", 0)) * fps))
            n = int(round(float(datos.get("fin", 0)) * fps)) - f0
    except (TypeError, ValueError):
        raise ErrorGenerar("el tramo no es válido")
    if total < 1:
        raise ErrorGenerar("el video no tiene fotogramas")
    f0 = min(max(0, f0), total - 1)
    return f0, min(max(1, n), total - f0)


def tramo_generado(f0: int, n: int, total: int) -> tuple[int, int]:
    """(primer fotograma, fotogramas 17n+5) del tramo que genera H3 para la selección [f0, f0+n): el válido más pequeño que
    la contiene, centrado en ella si cabe y, si no, ampliado por el lado que tenga sitio. Si el video es más corto que ese
    valor, empieza en 0 y el corte rellena el final repitiendo el último fotograma."""
    m = valido_que_contiene(n)
    if m >= total:
        return 0, m
    g0 = f0 - (m - n) // 2
    return min(max(0, g0), total - m), m


# (1 nov, Jonathan: «seleccioné solo hasta el final de la toma 2») para llegar a 17n+5, el tramo se alargaba con fotogramas
# vecinos, y si la selección acababa justo en un corte entraba la toma siguiente (un primer plano extremo que rompió el recorte
# de «Detallar cara»). Ahora se buscan los cortes junto a la selección y el relleno nunca los cruza: si no hay sitio a ningún
# lado, se repite el primer o el último fotograma de la toma.
UMBRAL_CORTE = 28.0           # diferencia media (0–255) entre dos fotogramas seguidos, en gris a 64 × 36, para contar un corte


def cortes_cerca(ruta: str, a: int, b: int) -> list[int]:
    """Los fotogramas c de (a, b] donde empieza otra toma (c es muy distinto de c−1). Lee solo esos fotogramas, pequeños."""
    if b <= a:
        return []
    try:
        import numpy as np
        r = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", ruta, "-vf",
                            f"select='between(n\\,{a}\\,{b})',scale=64:36,format=gray", "-fps_mode", "passthrough", "-f", "rawvideo", "-"],
                           capture_output=True, timeout=60)
        f = np.frombuffer(r.stdout, np.uint8)
        k = len(f) // (64 * 36)
        if k < 2:
            return []
        f = f[:k * 64 * 36].reshape(k, 36, 64).astype(np.int16)
        d = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
        umbral = max(UMBRAL_CORTE, 4 * float(np.median(d)))
        return [a + i + 1 for i, x in enumerate(d) if x > umbral]
    except Exception:
        return []                          # sin numpy o sin poder leer: como antes, sin buscar cortes


def ventana(ruta: str, s0: int, sn: int, total: int) -> tuple[int, int, int, int]:
    """(g0, m, lo, hi): lo que genera H3 para la selección [s0, s0+sn) (m = 17n+5 fotogramas desde g0, que puede ser < 0) y
    los fotogramas reales que puede usar, [lo, hi): los de la misma toma que la selección. Lo de fuera se rellena repitiendo
    el primero o el último. Sin cortes cerca es lo mismo que tramo_generado."""
    m = valido_que_contiene(sn)
    falta = m - sn
    lo, hi = 0, total
    if falta and ruta:
        cortes = cortes_cerca(ruta, max(0, s0 - falta - 1), s0) + cortes_cerca(ruta, s0 + sn - 1, min(total - 1, s0 + sn - 1 + falta))
        lo = max([c for c in cortes if c <= s0], default=0)
        hi = min([c for c in cortes if c >= s0 + sn], default=total)
    if lo == 0 and hi == total:             # sin cortes cerca: igual que siempre
        return (*tramo_generado(s0, sn, total), 0, total)
    centro = s0 - falta // 2
    if hi - lo >= m:
        g0 = min(max(centro, lo), hi - m)
    else:                                   # no cabe con fotogramas reales: todos los de la toma y el resto repetido
        g0 = lo - (m - (hi - lo)) // 2
    return g0, m, lo, hi


def cortar(ruta: str, f0: int, n: int, fps: float, con_audio: bool, total: int | None = None,
           lo: int | None = None, hi: int | None = None) -> str:
    """Corta n fotogramas exactos desde f0 a ComfyUI/input/max_editor/retocar/ y devuelve el nombre para el LoadVideo.
    Sin audio, pone silencio: el NKDAVLatent del grafo espera una pista de audio («keep»). Si el video acaba antes de
    f0+n (`total`), el final se rellena repitiendo el último fotograma (y el audio, con silencio)."""
    base = re.sub(r"[^\w-]+", "_", os.path.splitext(os.path.basename(ruta))[0])[:60]
    lo = max(0, lo if lo is not None else 0)
    hi = min(hi if hi is not None else (total or f0 + n), total or 10 ** 9)
    a, b = max(f0, lo), min(f0 + n, hi)               # los fotogramas reales; antes y después, repetidos
    antes, falta = a - f0, f0 + n - b
    nombre = f"{CARPETA_TRAMOS}/{base}_f{f0}_{n}" + (f"_r{a}-{b}" if antes or falta else "") + ".mp4"
    destino = os.path.join(comfyui_dir(), "input", nombre)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    t0, dur = max(0, f0) / fps, n / fps
    relleno = ":".join(x for x in (f"start_mode=clone:start={antes}" if antes else "", f"stop_mode=clone:stop={falta}" if falta else "") if x)
    video = f"select='between(n\\,{a}\\,{b - 1})',setpts=PTS-STARTPTS" + (f",tpad={relleno},setpts=N/({fps}*TB)" if relleno else "")
    if con_audio:
        _ffmpeg("-i", ruta, "-vf", video, "-af", f"atrim=start={t0:.6f}:duration={dur:.6f},asetpts=PTS-STARTPTS,apad=whole_dur={dur:.6f}",
                "-frames:v", str(n), "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", destino)
    else:
        _ffmpeg("-i", ruta, "-f", "lavfi", "-t", f"{dur:.6f}", "-i", "anullsrc=r=44100:cl=stereo", "-vf", video,
                "-frames:v", str(n), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", destino)
    return nombre


def sustituir(original: str, tramo: str, f0: int, n: int, vi: dict, destino: str, desde: int = 0) -> None:
    """El video original con los fotogramas [f0, f0+n) cambiados por los del tramo retocado desde su fotograma `desde` (el
    tramo generado puede empezar antes de la selección); el audio original se copia tal cual."""
    w, h, fps, total = vi["ancho"], vi["alto"], vi["fps"], vi["fotogramas"]
    norm = f"scale={w}:{h},setsar=1,format=yuv420p"
    partes, filtros = [], []
    if f0 > 0:
        filtros.append(f"[0:v]trim=end_frame={f0},setpts=PTS-STARTPTS,{norm}[a]")
        partes.append("[a]")
    # el tramo, a los fps y al tamaño del original y con n fotogramas exactos (si H3 devolviera uno menos, se repite el último)
    filtros.append(f"[1:v]fps={fps},{norm},tpad=stop_mode=clone:stop={n},trim=start_frame={desde}:end_frame={desde + n},setpts=PTS-STARTPTS[b]")
    partes.append("[b]")
    if f0 + n < total:
        filtros.append(f"[0:v]trim=start_frame={f0 + n},setpts=PTS-STARTPTS,{norm}[c]")
        partes.append("[c]")
    filtros.append("".join(partes) + f"concat=n={len(partes)}:v=1:a=0[v]")
    _ffmpeg("-i", original, "-i", tramo, "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "0:a?",
            "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy",
            "-movflags", "+faststart", destino)


# ---------------------------------------------------------------- referencias

def _imagen_de_referencia(ref: dict) -> str:
    """El valor para un LoadImage: la foto original de un RefMod (models/refmods/<nombre>.fuente.json → file) o una imagen."""
    if ref.get("refmod"):
        nombre = str(ref["refmod"])
        ruta = _dentro(os.path.join(comfyui_dir(), "models", "refmods"), nombre + ".fuente.json")
        try:
            with open(ruta, encoding="utf-8") as f:
                archivo = (json.load(f) or {}).get("file") or ""
        except (OSError, ValueError, TypeError):
            raise ErrorGenerar(f"el RefMod «{nombre}» no tiene foto original (falta {nombre}.fuente.json)")
    else:
        archivo = str(ref.get("imagen") or "")
    if not archivo:
        raise ErrorGenerar("una referencia está vacía")
    if archivo.lower().endswith((".mp4", ".webm", ".mov", ".mkv")):
        raise ErrorGenerar(f"«{archivo}» es un video: en Retocar las referencias son fotos")
    # LoadImage lista input/ sin marca; lo de output/ o temp/ se deja con su marca (ComfyUI la entiende)
    return archivo[:-len(" [input]")] if archivo.endswith(" [input]") else archivo


def ruta_foto_referencia(ref: dict) -> str:
    """La ruta en disco de la foto de una referencia (para recortarla en la ventana): la original de un RefMod o la imagen."""
    archivo = _imagen_de_referencia(ref)
    for marca, carpeta in ((" [output]", "output"), (" [temp]", "temp")):
        if archivo.endswith(marca):
            ruta = _dentro(os.path.join(comfyui_dir(), carpeta), archivo[:-len(marca)])
            break
    else:
        ruta = _dentro(os.path.join(comfyui_dir(), "input"), archivo)
    if not ruta or not os.path.isfile(ruta):
        raise ErrorGenerar(f"no encuentro la foto «{archivo}»")
    return ruta


# ---------------------------------------------------------------- el prompt escrito por el LLM (29 oct)
SISTEMA_PROMPT = (
    "You write prompts for a video inpainting model (MiniMax H3). Only one area is regenerated: {zona}. The motion comes from "
    "the video. Write ONE short English sentence (max 30 words) describing how that area should look when finished: more "
    "detailed and sharp, the same person or thing. {inicio}Describe what IS there in this frame (for a face: skin, eyes, "
    "eyelashes, eyebrows, lips, expression) and the actual light of THIS frame (direction, color). Never use negations (no, "
    "not, without). Never mention camera, framing, pose or movement. Output only the sentence.")


def prompt_llm(video: str, segundo: float, zona: str, con_referencia: bool, llm_url: str) -> str:
    """La frase del retoque escrita por el LLM local (Qwen con visión) mirando el fotograma que eligió el usuario (el del
    cabezal), con las reglas de app/guia/4_prompts.md: lo que SÍ hay, la luz de ese fotograma, sin cámara ni pose."""
    import base64
    import tempfile
    import urllib.request
    ruta = ruta_video(video)
    with tempfile.TemporaryDirectory() as d:
        foto = os.path.join(d, "fotograma.jpg")
        _ffmpeg("-ss", f"{max(0.0, float(segundo)):.3f}", "-i", ruta, "-frames:v", "1", "-vf", "scale='min(768,iw)':-2", foto)
        with open(foto, "rb") as f:
            imagen = base64.b64encode(f.read()).decode()
    escrita = (zona or "").strip()
    zona = escrita or "the area inside the rectangle"
    inicio = ((f"Start with 'the detailed {escrita} of <Picture 1>,'. " if escrita else "Cite <Picture 1> for the person or object. ")
              if con_referencia else "")
    cuerpo = {"model": "local", "temperature": 0.3, "max_tokens": 1500, "messages": [
        {"role": "system", "content": SISTEMA_PROMPT.format(zona=zona, inicio=inicio)},
        {"role": "user", "content": [{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + imagen}},
                                     {"type": "text", "text": "Write the sentence for this frame."}]}]}
    pedido = urllib.request.Request(llm_url.rstrip("/") + "/v1/chat/completions", json.dumps(cuerpo).encode(), {"Content-Type": "application/json"})
    import time
    hasta, ultimo = time.time() + 90, None
    while True:                       # el servicio se duerme sin uso: al despertar dice «Loading model» (503) unos segundos
        try:
            with urllib.request.urlopen(pedido, timeout=600) as r:
                texto = (json.load(r)["choices"][0]["message"]["content"] or "").strip()
            break
        except Exception as exc:
            ultimo = exc
            if time.time() > hasta:
                raise ErrorGenerar(f"el LLM local no respondió ({ultimo})")
            time.sleep(3)
    texto = texto.split("</think>")[-1].strip().strip('"').strip()
    if not texto:
        raise ErrorGenerar("el LLM no escribió nada: prueba otra vez")
    return texto


# ---------------------------------------------------------------- el grafo

def megapixeles(datos: dict) -> float:
    try:
        mp = float(datos.get("megapixeles") or MEGAPIXELES)
    except (TypeError, ValueError):
        raise ErrorGenerar("la resolución del retoque no es válida")
    return round(min(MP_MAX, max(MP_MIN, mp)), 3)


def _base(datos: dict) -> tuple[dict, dict, dict]:
    """Lo común del retoque y de la vista de la máscara: el tramo cortado, la rama de la máscara, la línea de tiempo y la
    resolución del recorte. Devuelve (grafo, meta de la plantilla, datos del tramo)."""
    mascara = datos.get("mascara") or {}
    vi = info(datos.get("video"))
    w, h, fps = vi["ancho"], vi["alto"], vi["fps"]
    s0, sn = seleccion(datos, fps, vi["fotogramas"])           # lo que eligió el usuario
    f0, n, lo, hi = ventana(ruta_video(datos["video"]), s0, sn, vi["fotogramas"])   # lo que genera H3 (17n+5), sin cruzar cortes

    g, meta = _plantilla()
    # la máscara: se queda una rama y la otra se quita
    if mascara.get("modo") == "texto":
        texto = (mascara.get("texto") or "").strip()
        if not texto:
            raise ErrorGenerar("falta qué buscar en la máscara por texto (por ejemplo «face»)")
        g[N_SAM_TEXTO]["inputs"]["text"] = texto
        g[N_LIMPIEZA]["inputs"]["masks"] = [N_SAM_SALIDA, 0]
        quitar = meta.get("rama_rectangulo", [])
    elif mascara.get("modo") == "rectangulo":
        try:
            x, y, rw, rh = (int(round(float(mascara.get(k, 0)))) for k in ("x", "y", "w", "h"))
        except (TypeError, ValueError):
            raise ErrorGenerar("el rectángulo de la máscara no es válido")
        x, y = min(max(0, x), w - 1), min(max(0, y), h - 1)
        rw, rh = min(max(1, rw), w - x), min(max(1, rh), h - y)
        if rw < 16 or rh < 16:
            raise ErrorGenerar("el rectángulo es demasiado pequeño: dibuja una zona de al menos 16 × 16 píxeles")
        g[N_FONDO]["inputs"].update(width=w, height=h)
        g[N_RECT]["inputs"].update(width=rw, height=rh)
        g[N_PONER]["inputs"].update(x=x, y=y)
        g[N_REPETIR]["inputs"]["amount"] = n
        g[N_LIMPIEZA]["inputs"]["masks"] = [N_RECT_SALIDA, 0]
        mascara = {"modo": "rectangulo", "x": x, "y": y, "w": rw, "h": rh}
        quitar = meta.get("rama_texto", [])
    else:
        raise ErrorGenerar("elige la máscara: por texto o con un rectángulo")
    for nid in quitar:
        g.pop(nid, None)
    g[N_RECORTE]["inputs"]["upscale_megapixels"] = -megapixeles(datos)    # negativo: el recorte sube o baja a ese tamaño

    # el tramo cortado y la línea de tiempo a su tamaño y sus fotogramas
    tramo = cortar(ruta_video(datos["video"]), f0, n, fps, vi["audio"], vi["fotogramas"], lo, hi)
    g[N_VIDEO]["inputs"]["file"] = tramo
    linea = g[N_LINEA]["inputs"]
    tl = json.loads(linea["timeline"])
    for clip in tl.get("clips", []):
        clip.update(start=0, trimIn=0, length=n)
    linea.update(timeline=json.dumps(tl), width=w, height=h, megapixels=max(0.05, round(w * h / 1e6, 2)), fps=fps,
                 start_frame=0, frame_count=n, clip_markers=True)
    return g, meta, {"vi": vi, "f0": f0, "n": n, "s0": s0, "sn": sn, "fps": fps, "mascara": mascara, "tramo": tramo}


def preparar(datos: dict) -> tuple[dict, dict]:
    datos = datos or {}
    prompt = (datos.get("prompt") or "").strip()
    if not prompt:
        raise ErrorGenerar("falta el prompt: describe cómo debe quedar la zona tapada y cita las referencias")
    refs = list(datos.get("referencias") or [])
    if len(refs) > MAX_REFERENCIAS:
        raise ErrorGenerar(f"como mucho {MAX_REFERENCIAS} referencias")
    g, meta, b = _base(datos)
    vi, f0, n, fps, mascara, tramo = b["vi"], b["f0"], b["n"], b["fps"], b["mascara"], b["tramo"]

    # una LoadImage por referencia, en orden: la primera es <Picture 1>
    modelo = g.pop(N_REF_MODELO)
    cond = g[N_CONDICION]["inputs"]
    for k in [k for k in cond if k.startswith("ref_images.")]:
        del cond[k]
    for i, ref in enumerate(refs):
        nid = str(300 + i)
        nodo = copy.deepcopy(modelo)
        nodo["inputs"]["image"] = _imagen_de_referencia(ref)
        nodo["_meta"] = {"title": f"<Picture {i + 1}>"}
        g[nid] = nodo
        cond[f"ref_images.ref_image_{i}"] = [nid, 0]

    g[N_PROMPT]["inputs"].update(prompt=prompt, ref_images=len(refs), duration_seconds=round(n / fps, 3))
    semilla = datos.get("semilla")
    g[N_RUIDO]["inputs"]["noise_seed"] = int(semilla) if semilla not in (None, "") else random.randrange(2 ** 32)
    sello = f"{datetime.now():%Y%m%d_%H%M%S}"
    g[N_GUARDAR]["inputs"]["filename_prefix"] = f"max_editor/retoque_{sello}"
    s0, sn = b["s0"], b["sn"]
    # tramo: lo elegido (lo que se sustituye; inicio y fin, para la lista de Videos) y lo generado (g0, gn)
    vi_tramo = {"f0": s0, "n": sn, "g0": f0, "gn": n, "inicio": round(s0 / fps, 3), "fin": round((s0 + sn) / fps, 3)}
    generar.poner_loras(g, datos.get("loras"))      # los LoRAs del proyecto (30 oct), detrás del UNETLoader de H3
    modo = MODOS.get(datos.get("modo") or "cambiar")
    if modo is None:
        raise ErrorGenerar("el modo de retoque no es válido: cambiar, detallar o quitar")
    if modo == "detallar":
        extra = _modo_cara(g, datos)
    elif modo == "quitar":
        extra = _con_lanpaint(g, datos.get("vueltas"))
    else:
        extra = _con_fuerza(g, datos)
    return g, {"video": datos["video"], "info": vi, "tramo": vi_tramo, "tramo_archivo": tramo, "mascara": mascara,
               "referencias": refs, "sello": sello, "proyecto": datos.get("proyecto"), "modo": modo, **extra,
               **({} if modo == "detallar" else {"megapixeles": megapixeles(datos)})}


# ---------------------------------------------------------------- los tres modos de Retocar (31 oct, Jonathan)
# «cambiar»: la zona se pinta de nuevo (reemplaza o añade; con menos fuerza conserva más la forma de lo que había).
# «detallar»: video a video con denoise parcial (la cara con su preset, o cualquier zona con sus ajustes).
# «quitar»: LanPaint, que rellena mirando la escena de alrededor (borrar logos sin inventar nada).
# Los nombres viejos («zona», «cara») siguen valiendo.
MODOS = {"cambiar": "cambiar", "zona": "cambiar", "detallar": "detallar", "cara": "detallar", "quitar": "quitar"}
FUERZA_MIN, FUERZA_MAX = 0.40, 1.0


def _con_fuerza(g: dict, datos: dict) -> dict:
    """«Fuerza» del modo cambiar: el denoise del muestreo (1 = la zona se pinta de cero; menos = se parte de lo que había)."""
    v = datos.get("fuerza")
    try:
        f = float(v) if v not in (None, "") else 1.0
    except (TypeError, ValueError):
        raise ErrorGenerar("la fuerza no es válida")
    f = round(min(FUERZA_MAX, max(FUERZA_MIN, f)), 3)
    g[N_SCHEDULER]["inputs"]["denoise"] = f
    return {"fuerza": f} if f < 1 else {}


# ---------------------------------------------------------------- modo «quitar»: LanPaint (31 oct)
# scraed/LanPaint: el sampler «piensa» varias vueltas antes de cada paso para que lo que rellena encaje con lo que no se
# toca. Solo cambia el sampler (nodo 32); los ajustes son los de su autor y los del workflow de T8 para H3.
N_SAMPLER = "32"


def _con_lanpaint(g: dict, vueltas=None) -> dict:
    """`vueltas`: las de «pensar» por paso (su autor usa 5; cada una es una pasada más del modelo, lenta en 12 GB). Con 1 quedó
    una raya en el borde; con 2, limpio (124 fotogramas en 10 min en la RTX 3060). Por defecto 2, como mucho 4."""
    try:
        v = min(VUELTAS_MAX, max(1, int(vueltas))) if vueltas not in (None, "") else VUELTAS
    except (TypeError, ValueError):
        raise ErrorGenerar("las vueltas de LanPaint no son válidas")
    s = g[N_SAMPLER]
    s["class_type"] = "LanPaint_SamplerCustomAdvanced"
    s["inputs"].update(LanPaint_NumSteps=v, LanPaint_Lambda=5.0, LanPaint_StepSize=0.2, LanPaint_PromptMode="Image First",
                       LanPaint_Info="MAX EDITOR Retocar")
    # 1.ª prueba (1 vuelta): los logos se fueron, pero quedó un marco de rombos en el borde. 2.ª (la máscara del latente de
    # NKD, dura): igual. 3.ª: como el ejemplo del autor (LanPaint_AVEncode), el sampler recibe la máscara EN PÍXELES del
    # recorte (dura, solo 0 y 1) y LanPaint la lleva él mismo a la rejilla del latente; el borde suave queda para el pegado.
    g[N_MASCARA_DURA] = {"class_type": "ThresholdMask", "inputs": {"mask": [N_RECORTE, 1], "value": 0.5}}
    g[N_LATENTE]["inputs"]["latent_mask"] = [N_MASCARA_DURA, 0]
    # 3.ª prueba: el marco casi se fue; quedó una línea fina en el borde. 4.ª: el pegado de LanPaint (la mezcla de su
    # LanPaint_AVDecode, que es LanPaint_MaskBlend: agranda la máscara, la suaviza y mezcla original y repintado) en el
    # recorte; luego se pega el recorte entero (fuera de la máscara ya son los píxeles del original).
    g[N_MEZCLA_LP] = {"class_type": "LanPaint_MaskBlend", "inputs": {"image1": [N_RECORTE, 0], "image2": [N_DECODE, 0],
                                                                    "mask": [N_MASCARA_DURA, 0], "blend_overlap": 11}}
    g[N_PEGADO]["inputs"]["cropped_images"] = [N_MEZCLA_LP, 0]
    g[N_PEGADO]["inputs"].pop("cropped_masks", None)
    return {"lanpaint": v}


N_MASCARA_DURA, N_MEZCLA_LP = "430", "431"
VUELTAS, VUELTAS_MAX = 2, 4


# ---------------------------------------------------------------- modo «Detallar cara» (31 oct)
# El método de ComfyUI-H3-FaceRefine (Carasibana, MIT) con los nodos de la plantilla: la cara (máscara) se recorta con un
# margen ×2,5, cuadrada, a un lienzo de 768 × 768; H3 la rehace VIDEO A VIDEO (los fotogramas reales codificados en el
# latente, sin máscara de latente) con denoise parcial, así la expresión y la mirada vienen del video; el color del
# resultado se iguala al del recorte original (ColorMatch) y se pega de vuelta solo la cara con borde suave.
CARA_ESCALA, CARA_LIENZO, CARA_DENOISE, CARA_FEATHER = 2.5, 768, 0.30, 24     # denoise 0,30 elegido por Jonathan (31 oct, con VDN 8 pasos)
DENOISE_MIN, DENOISE_MAX = 0.10, 0.80
LIENZO_MIN, LIENZO_MAX = 384, 1024        # el lado del lienzo cuadrado, en la rejilla de 32
N_SCHEDULER, N_LATENTE, N_DECODE, N_PEGADO, N_COLOR = "31", "26", "34", "35", "36"


def denoise_cara(datos: dict) -> float:
    v = datos.get("denoise")
    try:
        d = float(v) if v not in (None, "") else CARA_DENOISE
    except (TypeError, ValueError):
        raise ErrorGenerar("el denoise no es válido")
    return round(min(DENOISE_MAX, max(DENOISE_MIN, d)), 3)


def lienzo_cara(datos: dict) -> int:
    """El lado del lienzo cuadrado de la cara en píxeles (768 por defecto; menos = más rápido), en la rejilla de 32."""
    v = datos.get("lienzo")
    try:
        lado = int(float(v)) if v not in (None, "") else CARA_LIENZO
    except (TypeError, ValueError):
        raise ErrorGenerar("el tamaño del lienzo no es válido")
    return min(LIENZO_MAX, max(LIENZO_MIN, round(lado / 32) * 32))


def _modo_cara(g: dict, datos: dict) -> dict:
    """Cambia el grafo del retoque al modo «Detallar cara». Devuelve lo que se guarda en el historial."""
    d, lado = denoise_cara(datos), lienzo_cara(datos)
    mp = round(lado * lado / (1024 * 1024), 6)               # el MVEx_SubjectCrop cuenta 1 MP = 1024 × 1024
    # (1 nov) margen «flexible»: con «firm» el recorte cuadrado debía guardar el 70 % del margen ×2,5 en cada fotograma, y una
    # cara de más de ~360 px (un primer plano en un video de 736 de alto) ya no cabía: «crop planner … infeasible». Ahora el
    # margen se da entero cuando cabe y cede cuando no; solo una cara más grande que el lado corto del video sigue sin caber
    g[N_RECORTE]["inputs"].update({"mode.crop_scale": CARA_ESCALA, "mode.aspect_ratio": 1.0, "mode.padding": "flexible",
                                   "upscale_megapixels": -mp})
    g[N_LATENTE]["inputs"].pop("latent_mask", None)          # video a video: se rehace todo el recorte, desde el video
    g[N_SCHEDULER]["inputs"]["denoise"] = d
    g[N_COLOR] = {"class_type": "ColorMatch", "_meta": {"title": "color igualado al recorte original"},
                  "inputs": {"image_ref": [N_RECORTE, 0], "image_target": [N_DECODE, 0], "method": "mkl", "strength": 1.0,
                             "multithread": True}}
    g[N_PEGADO]["inputs"].update(cropped_images=[N_COLOR, 0], feather=CARA_FEATHER)
    g[N_OPS_FINAL]["inputs"].update(expand=8, feather=CARA_FEATHER)      # solo la cara, con borde suave
    # (1 nov, beta) con "motor_rapido": "pika" en config.local.json, Detallar va con Pika en lugar de VDN
    motor = "pika" if generar.motor_rapido() == "pika" and generar.poner_pika(g, d) else "vdn"
    return {"denoise": d, "lienzo": lado, "megapixeles": mp, "motor": motor}


def recuperar(datos: dict, rutas: list[str], sello: str) -> tuple[str, dict]:
    """Para la cola (cola.py): un retoque que ComfyUI terminó mientras el servidor estaba parado. `rutas`: los videos que
    dejó en su salida. Arma el video completo igual que _despues (solo cambian los fotogramas elegidos)."""
    vi = info(datos.get("video"))
    s0, sn = seleccion(datos, vi["fps"], vi["fotogramas"])
    g0, _, _, _ = ventana(ruta_video(datos["video"]), s0, sn, vi["fotogramas"])
    con_audio = [r for r in rutas if "-audio" in os.path.basename(r)]
    semilla = datos.get("semilla")
    archivo_tramo, archivo = f"retoque_{sello}_{semilla}_tramo.mp4", f"retoque_{sello}_{semilla}.mp4"
    os.makedirs(SALIDAS, exist_ok=True)
    shutil.copyfile((con_audio or rutas)[-1], os.path.join(SALIDAS, archivo_tramo))
    sustituir(ruta_video(datos["video"]), os.path.join(SALIDAS, archivo_tramo), s0, sn, vi, os.path.join(SALIDAS, archivo), desde=s0 - g0)
    tramo = {"f0": s0, "n": sn, "inicio": round(s0 / vi["fps"], 3), "fin": round((s0 + sn) / vi["fps"], 3)}
    return archivo, {"tipo": "retoque", "semilla": semilla, "proyecto": datos.get("proyecto"), "de": datos["video"], "tramo": tramo,
                     "tramo_video": archivo_tramo, "mascara": datos.get("mascara"), "referencias": datos.get("referencias")}


# ---------------------------------------------------------------- vista de la máscara (sin H3)
ROSA = 0xFF3E8A          # el color con que se pinta la zona que se rehará
N_ROSA, N_MEZCLA, N_PEGAR, N_GUARDAR_MASCARA = "400", "401", "402", "403"


def preparar_mascara(datos: dict) -> tuple[dict, dict]:
    """El grafo mínimo de la vista: la misma rama de máscara, la misma limpieza (MaskCleanup) y el mismo recorte que el
    retoque, y la máscara final (NKDMaskOps + NKDMaskOpsLean) pegada de vuelta en rosa semitransparente sobre el tramo con
    el mismo MVEx_SubjectUncrop. Sin el modelo de H3: el NKDMaskOps lleva el VAE (la rejilla de latentes, igual que en el
    retoque) pero no el modelo, que solo alinea los bordes a los bloques de 2×2 latentes de H3 (cargar sus 34 GB no vale
    la pena para una vista); por eso el borde real puede crecer hasta un bloque más."""
    datos = datos or {}
    g, _, b = _base(datos)
    vi, f0, n, fps = b["vi"], b["f0"], b["n"], b["fps"]
    rama = [nid for nid in ("13", "14", "15", "16", "17", "201", "202", "203", "204", "205", "206") if nid in g]
    quedan = set(rama) | {N_VIDEO, N_LINEA, N_VAE, N_LIMPIEZA, N_RECORTE, N_TAMANO, N_OPS, N_OPS_FINAL}
    g = {nid: nodo for nid, nodo in g.items() if nid in quedan}
    g[N_OPS]["inputs"].pop("model", None)
    sello = f"{datetime.now():%Y%m%d_%H%M%S}"
    g[N_ROSA] = {"class_type": "EmptyImage", "inputs": {"width": [N_TAMANO, 1], "height": [N_TAMANO, 2],
                                                        "batch_size": [N_TAMANO, 3], "color": ROSA}}
    g[N_MEZCLA] = {"class_type": "ImageBlend", "inputs": {"image1": [N_RECORTE, 0], "image2": [N_ROSA, 0], "blend_factor": 0.55,
                                                          "blend_mode": "normal"}}
    g[N_PEGAR] = {"class_type": "MVEx_SubjectUncrop", "inputs": {"feather": 16, "cropped_images": [N_MEZCLA, 0],
                                                                 "original_images": [N_LINEA, 0], "bboxes": [N_RECORTE, 2],
                                                                 "cropped_masks": [N_OPS_FINAL, 0]}}
    g[N_GUARDAR_MASCARA] = {"class_type": "VHS_VideoCombine", "inputs": {
        "frame_rate": fps, "loop_count": 0, "filename_prefix": f"max_editor/mascara_{sello}", "format": "video/h264-mp4",
        "pix_fmt": "yuv420p", "crf": 19, "save_metadata": False, "trim_to_audio": False, "pingpong": False, "save_output": True,
        "images": [N_PEGAR, 0]}}
    tramo = {"f0": b["s0"], "n": b["sn"], "g0": f0, "gn": n, "inicio": round(b["s0"] / fps, 3), "fin": round((b["s0"] + b["sn"]) / fps, 3)}
    return g, {"video": datos.get("video"), "info": vi, "tramo": tramo, "mascara": b["mascara"], "sello": sello,
               "proyecto": datos.get("proyecto"), "megapixeles": megapixeles(datos)}


def iniciar_mascara(datos: dict) -> str:
    c = generar.config()
    try:
        grafo, meta = preparar_mascara(datos)
        generar.comprobar_servicios(c)
    except Exception as exc:
        return generar._nuevo("error", generar._texto_error(exc, c))
    return generar.lanzar(grafo, {"meta": meta, "proyecto": meta["proyecto"]}, c, despues=_despues_mascara,
                          extra={"tipo": "mascara", "tramo": meta["tramo"]})


def _despues_mascara(tid: str, grafo: dict, job, opciones: dict):
    meta = opciones["meta"]
    videos = generar.videos_del_job(job, grafo, ("VHS_VideoCombine",))
    if not videos:
        raise ErrorGenerar("ComfyUI terminó pero no devolvió la vista de la máscara")
    os.makedirs(SALIDAS, exist_ok=True)
    archivo = f"mascara_{meta['sello']}.mp4"
    videos[-1].to_file(os.path.join(SALIDAS, archivo))
    # «tipo: mascara»: va al historial (para saber de dónde salió) pero no a la lista de Videos
    return archivo, {"tipo": "mascara", "proyecto": meta.get("proyecto"), "de": meta["video"], "tramo": meta["tramo"],
                     "mascara": meta["mascara"], "megapixeles": meta["megapixeles"]}


# entradas de archivo: su lista en /object_info no trae las subcarpetas (el nodo mira si existe), así que se mira el archivo
ARCHIVOS = {("LoadImage", "image"), ("LoadVideo", "file")}
# entradas que no están en /object_info y que el nodo sí acepta: los campos del formato de VHS y la vista previa de LoadVideo
DINAMICAS = {"VHS_VideoCombine": {"pix_fmt", "crf", "save_metadata", "trim_to_audio"}, "LoadVideo": {"video-preview"}}


def validar(grafo: dict, comfyui_url: str | None = None) -> list[str]:
    """Que cada nodo exista en este ComfyUI, que cada entrada exista y que los combos tengan un valor de su lista
    (los archivos de entrada, que existan en input/)."""
    url = (comfyui_url or generar.config()["comfyui_url"]).rstrip("/")
    problemas, cache = [], {}
    for nid, nodo in grafo.items():
        tipo = nodo.get("class_type")
        if tipo not in cache:
            try:
                with urllib.request.urlopen(f"{url}/object_info/{urllib.parse.quote(tipo)}", timeout=30) as r:
                    cache[tipo] = (json.load(r) or {}).get(tipo)
            except Exception as exc:
                return [f"no puedo leer /object_info de ComfyUI: {exc}"]
        oi = cache[tipo]
        if not oi:
            problemas.append(f"nodo {nid}: {tipo} no está instalado")
            continue
        specs = {**oi["input"].get("required", {}), **oi["input"].get("optional", {})}
        for nombre, valor in nodo.get("inputs", {}).items():
            spec = specs.get(nombre) or specs.get(nombre.split(".")[0])     # «ref_images.ref_image_0», «mode.crop_scale»
            if (tipo, nombre) in ARCHIVOS:
                rel, _, marca = str(valor).partition(" [")
                base = os.path.join(comfyui_dir(), (marca.rstrip("]") or "input"))
                if not (_dentro(base, rel) and os.path.isfile(_dentro(base, rel))):
                    problemas.append(f"nodo {nid} ({tipo}): no existe el archivo «{valor}»")
                continue
            if spec is None and nombre in DINAMICAS.get(tipo, ()):
                continue
            if spec is None:
                problemas.append(f"nodo {nid} ({tipo}): no tiene la entrada «{nombre}»")
                continue
            if generar.es_enlace(valor) or nombre != nombre.split(".")[0]:
                continue
            opciones = spec[0] if isinstance(spec[0], list) else (spec[1] or {}).get("options") if spec[0] == "COMBO" else None
            if opciones is not None and valor not in opciones and not str(valor).endswith(("[input]", "[output]", "[temp]")):
                problemas.append(f"nodo {nid} ({tipo}): «{valor}» no es una opción de «{nombre}»")
    return problemas


# ---------------------------------------------------------------- lanzar y terminar

def iniciar(datos: dict) -> str:
    c = generar.config()
    try:
        grafo, meta = preparar(datos)
        generar.comprobar_servicios(c)
    except Exception as exc:
        return generar._nuevo("error", generar._texto_error(exc, c))
    return generar.lanzar(grafo, {"meta": meta, "proyecto": meta["proyecto"]}, c, despues=_despues,
                          extra={"tipo": "retoque", "tramo": meta["tramo"]})


def _despues(tid: str, grafo: dict, job, opciones: dict):
    """Baja el tramo retocado y arma el video completo con ese tramo sustituido (los dos en app/salidas)."""
    meta = opciones["meta"]
    videos = generar.videos_del_job(job, grafo, ("VHS_VideoCombine",))
    if not videos:
        raise ErrorGenerar("ComfyUI terminó pero no devolvió el tramo retocado")
    con_audio = [o for o in videos if "-audio" in o.name]
    o = (con_audio or videos)[-1]
    os.makedirs(SALIDAS, exist_ok=True)
    semilla = generar._semilla_de(grafo)
    archivo_tramo = f"retoque_{meta['sello']}_{semilla}_tramo.mp4"
    o.to_file(os.path.join(SALIDAS, archivo_tramo))
    generar._poner(tid, mensaje="armando el video completo", avance=0.98)
    archivo = f"retoque_{meta['sello']}_{semilla}.mp4"
    tr = meta["tramo"]
    sustituir(ruta_video(meta["video"]), os.path.join(SALIDAS, archivo_tramo), tr["f0"], tr["n"], meta["info"],
              os.path.join(SALIDAS, archivo), desde=tr["f0"] - tr.get("g0", tr["f0"]))
    generar._poner(tid, tramo_video=archivo_tramo)
    return archivo, {"tipo": "retoque", "semilla": semilla, "proyecto": meta.get("proyecto"), "de": meta["video"],
                     "tramo": tr, "tramo_video": archivo_tramo, "mascara": meta["mascara"],
                     "referencias": meta["referencias"], "prompt": grafo[N_PROMPT]["inputs"]["prompt"],
                     "modo": meta.get("modo", "zona"), **{k: meta[k] for k in ("denoise", "lienzo", "fuerza", "lanpaint") if meta.get(k) is not None}}


if __name__ == "__main__":
    # línea de órdenes: retocar.py datos.json [--seco]   (--seco: prepara y valida, sin lanzar)
    import sys
    import time
    with open(sys.argv[1], encoding="utf-8") as f:
        pedido = json.load(f)
    if "--seco" in sys.argv:
        g, m = preparar(pedido)
        print(json.dumps(m, ensure_ascii=False, indent=1))
        print("\n".join(validar(g)) or "plantilla válida según /object_info")
        sys.exit(0)
    tid = iniciar(pedido)
    while True:
        e = generar.estado(tid)
        print(f"{e['segundos']:6.0f} s  {e['estado']:10} {e['avance']:.2f}  {e.get('nodo') or ''} {e['mensaje']}", flush=True)
        if e["estado"] in ("listo", "error"):
            print(json.dumps(e, ensure_ascii=False, indent=1))
            break
        time.sleep(10)
