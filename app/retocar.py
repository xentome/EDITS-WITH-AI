"""Retocar un video de MAX EDITOR: se elige un tramo, se tapa una zona (por texto con SAM 3.1 o con un rectángulo), se dan
sus imágenes de referencia y un prompt, y H3 rehace solo esa zona (inpainting). Al terminar se arma la versión completa:
el video original con ese tramo sustituido y el audio original intacto. Plano: ../planos/fases/7 (secciones 9 y 10).

Mismo contrato que generar.py, y comparte con él el trabajo (lanzar por el SDK, avance, estado y cancelar):
  info(video) -> dict                 {ancho, alto, fps, fotogramas, duracion, audio}
  preparar(datos) -> (grafo, meta)    el grafo listo y lo que hace falta para armar el video completo (corta el tramo)
  iniciar(datos) -> str               lanza en un hilo; el avance y el final se leen con generar.estado(id)
  validar(grafo) -> list[str]         los problemas del grafo según /object_info de ComfyUI (vacío = bien)

`datos` = {video, inicio, fin, mascara: {modo: "texto", texto} | {modo: "rectangulo", x, y, w, h},
           referencias: [{refmod: nombre} | {imagen: "ruta [input]"}] (0 a 4), prompt, semilla, proyecto}
`video`: un archivo de app/salidas («edit_….mp4») o de ComfyUI con su carpeta («x.mp4 [input]», «x.mp4 [output]»).
Fotogramas: H3 pide 17n+5; el tramo se ajusta al número válido más cercano (39 = 1,6 s a 24 fps)."""
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


def ajustar_tramo(inicio: float, fin: float, fps: float, total: int) -> tuple[int, int]:
    """(primer fotograma, número de fotogramas 17n+5) del tramo pedido, dentro del video."""
    f0 = max(0, int(round(float(inicio) * fps)))
    n = fotogramas_validos(max(1, int(round(float(fin) * fps)) - f0))
    while n > 22 and n > total:
        n -= 17
    if n > total:
        raise ErrorGenerar(f"el video es muy corto para retocar: tiene {total} fotogramas y hacen falta 22")
    return min(f0, total - n), n


def cortar(ruta: str, f0: int, n: int, fps: float, con_audio: bool) -> str:
    """Corta n fotogramas exactos desde f0 a ComfyUI/input/max_editor/retocar/ y devuelve el nombre para el LoadVideo.
    Sin audio, pone silencio: el NKDAVLatent del grafo espera una pista de audio («keep»)."""
    base = re.sub(r"[^\w-]+", "_", os.path.splitext(os.path.basename(ruta))[0])[:60]
    nombre = f"{CARPETA_TRAMOS}/{base}_f{f0}_{n}.mp4"
    destino = os.path.join(comfyui_dir(), "input", nombre)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    t0, dur = f0 / fps, n / fps
    video = f"select='between(n\\,{f0}\\,{f0 + n - 1})',setpts=PTS-STARTPTS"
    if con_audio:
        _ffmpeg("-i", ruta, "-vf", video, "-af", f"atrim=start={t0:.6f}:duration={dur:.6f},asetpts=PTS-STARTPTS",
                "-frames:v", str(n), "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", destino)
    else:
        _ffmpeg("-i", ruta, "-f", "lavfi", "-t", f"{dur:.6f}", "-i", "anullsrc=r=44100:cl=stereo", "-vf", video,
                "-frames:v", str(n), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", destino)
    return nombre


def sustituir(original: str, tramo: str, f0: int, n: int, vi: dict, destino: str) -> None:
    """El video original con los fotogramas [f0, f0+n) cambiados por el tramo retocado; el audio original se copia tal cual."""
    w, h, fps, total = vi["ancho"], vi["alto"], vi["fps"], vi["fotogramas"]
    norm = f"scale={w}:{h},setsar=1,format=yuv420p"
    partes, filtros = [], []
    if f0 > 0:
        filtros.append(f"[0:v]trim=end_frame={f0},setpts=PTS-STARTPTS,{norm}[a]")
        partes.append("[a]")
    # el tramo, a los fps y al tamaño del original y con n fotogramas exactos (si H3 devolviera uno menos, se repite el último)
    filtros.append(f"[1:v]fps={fps},{norm},tpad=stop_mode=clone:stop={n},trim=end_frame={n},setpts=PTS-STARTPTS[b]")
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


# ---------------------------------------------------------------- el grafo

def preparar(datos: dict) -> tuple[dict, dict]:
    datos = datos or {}
    prompt = (datos.get("prompt") or "").strip()
    if not prompt:
        raise ErrorGenerar("falta el prompt: describe cómo debe quedar la zona tapada y cita las referencias")
    refs = list(datos.get("referencias") or [])
    if len(refs) > MAX_REFERENCIAS:
        raise ErrorGenerar(f"como mucho {MAX_REFERENCIAS} referencias")
    mascara = datos.get("mascara") or {}
    vi = info(datos.get("video"))
    w, h, fps = vi["ancho"], vi["alto"], vi["fps"]
    try:
        inicio, fin = float(datos.get("inicio", 0)), float(datos.get("fin", 0))
    except (TypeError, ValueError):
        raise ErrorGenerar("el tramo no es válido")
    f0, n = ajustar_tramo(inicio, fin, fps, vi["fotogramas"])

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

    # el tramo cortado y la línea de tiempo a su tamaño y sus fotogramas
    tramo = cortar(ruta_video(datos["video"]), f0, n, fps, vi["audio"])
    g[N_VIDEO]["inputs"]["file"] = tramo
    linea = g[N_LINEA]["inputs"]
    tl = json.loads(linea["timeline"])
    for clip in tl.get("clips", []):
        clip.update(start=0, trimIn=0, length=n)
    linea.update(timeline=json.dumps(tl), width=w, height=h, megapixels=max(0.05, round(w * h / 1e6, 2)), fps=fps,
                 start_frame=0, frame_count=n, clip_markers=True)

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
    vi_tramo = {"f0": f0, "n": n, "inicio": round(f0 / fps, 3), "fin": round((f0 + n) / fps, 3)}
    return g, {"video": datos["video"], "info": vi, "tramo": vi_tramo, "tramo_archivo": tramo, "mascara": mascara,
               "referencias": refs, "sello": sello, "proyecto": datos.get("proyecto")}


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
              os.path.join(SALIDAS, archivo))
    generar._poner(tid, tramo_video=archivo_tramo)
    return archivo, {"tipo": "retoque", "semilla": semilla, "proyecto": meta.get("proyecto"), "de": meta["video"],
                     "tramo": tr, "tramo_video": archivo_tramo, "mascara": meta["mascara"],
                     "referencias": meta["referencias"], "prompt": grafo[N_PROMPT]["inputs"]["prompt"]}


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
