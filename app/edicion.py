"""El apartado 3 «Edición» de MAX EDITOR (29 oct, variante P1 de app/web/prototipo_edicion.html, elegida por Jonathan):
juntar trozos de los videos de la biblioteca (y audios) en una línea de tiempo con varias pistas, como en DaVinci Resolve, y
exportarla a un mp4 nuevo con ffmpeg. Sin GPU: corta, escala, pone cada pista de video encima de la de abajo y mezcla.

  audios() -> list                    los audios que se pueden usar: ComfyUI/input y input/max_editor/audios (subidos, con carpeta)
  de_fuera() -> list                  los videos traídos de fuera (input/max_editor/de_fuera): solo para Edición
  destino_subida(nombre, tipo, carpeta) dónde se guarda un audio o un video subido desde la página
  proxy(fuente) -> ruta               la copia ligera de un video para el visor (app/salidas/proxies)
  exportar(edicion, proyecto, nombre) -> (archivo, fila)   el mp4 en app/salidas (montaje_<sello>.mp4) y su fila (con la edición)

`edicion` = {lienzo: {ancho, alto} | None, rango: {desde, hasta} | None, pistas: [{id, tipo: video|audio, ver, oir, clips: [{fuente, ini, fin, en}]}]}
  - rango: solo se exporta de «desde» a «hasta» (s de la línea de tiempo; sin él, todo);
  - las pistas van de arriba a abajo (como se ven): la de video de más arriba tapa a las de abajo;
  - fuente: «edit_….mp4» (app/salidas) o «x [input]» (ComfyUI/input), como en retocar.ruta_video;
  - ini/fin: el trozo del original que se usa (s); en: dónde empieza en la línea de tiempo (s). Todo a 24 fps."""
from __future__ import annotations

import os
import re
import subprocess
import time
from datetime import datetime

import generar
import retocar
from generar import ErrorGenerar

FPS = 24
CARPETA_AUDIOS = "max_editor/audios"          # dentro de ComfyUI/input: los audios subidos desde la página (y sus carpetas)
CARPETA_FUERA = "max_editor/de_fuera"          # los videos traídos de fuera: se usan en Edición, no son de la biblioteca
EXT_AUDIO = (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus")
EXT_VIDEO = (".mp4", ".mov", ".webm", ".mkv", ".m4v")
MAX_CLIPS = 200
MAX_DURACION = 15 * 60                         # s: una edición de más de 15 min no es lo que hace esta app


def _limpio(texto: str, largo: int = 80) -> str:
    return re.sub(r"[^\w.-]+", "_", texto or "").strip("._")[:largo]


def _archivos(carpeta: str, extensiones: tuple, hondo: bool) -> list[tuple[str, str]]:
    """(ruta relativa a ComfyUI/input, subcarpeta) de los archivos con esas extensiones en input/<carpeta> (y sus subcarpetas)."""
    base = os.path.join(retocar.comfyui_dir(), "input")
    out = []
    for raiz, dirs, nombres in os.walk(os.path.join(base, carpeta)):
        sub = os.path.relpath(raiz, os.path.join(base, carpeta))
        if not hondo:
            dirs[:] = []
        for n in nombres:
            if n.lower().endswith(extensiones):
                out.append((os.path.relpath(os.path.join(raiz, n), base), "" if sub == "." else sub))
    return out


def audios() -> list[dict]:
    """Los audios de ComfyUI/input (arriba del todo) y los subidos aquí, con su carpeta («» = sueltos), lo más nuevo primero."""
    base = os.path.join(retocar.comfyui_dir(), "input")
    filas = [(r, "") for r, _ in _archivos("", EXT_AUDIO, False)] + _archivos(CARPETA_AUDIOS, EXT_AUDIO, True)
    out = [{"fuente": f"{r} [input]", "nombre": os.path.basename(r), "carpeta": sub, "fecha": os.path.getmtime(os.path.join(base, r))}
           for r, sub in filas]
    return sorted(out, key=lambda x: -x["fecha"])


def de_fuera() -> list[dict]:
    """Los videos traídos de fuera (input/max_editor/de_fuera), lo más nuevo primero."""
    base = os.path.join(retocar.comfyui_dir(), "input")
    out = [{"fuente": f"{r} [input]", "nombre": os.path.basename(r), "fecha": os.path.getmtime(os.path.join(base, r))}
           for r, _ in _archivos(CARPETA_FUERA, EXT_VIDEO, False)]
    return sorted(out, key=lambda x: -x["fecha"])


def destino_subida(nombre: str, tipo: str, carpeta: str = "") -> tuple[str, str]:
    """Dónde se guarda un archivo subido: (ruta en disco, fuente «… [input]»). Sin pisar otro con el mismo nombre.
    tipo «audio» va a input/max_editor/audios[/<carpeta>]; «video», a input/max_editor/de_fuera."""
    base_n, ext = os.path.splitext(os.path.basename(nombre or tipo))
    exts = EXT_AUDIO if tipo == "audio" else EXT_VIDEO
    if ext.lower() not in exts:
        raise ErrorGenerar(f"«{nombre}» no es un {'audio' if tipo == 'audio' else 'video'} ({', '.join(exts)})")
    rel = CARPETA_AUDIOS if tipo == "audio" else CARPETA_FUERA
    if tipo == "audio" and _limpio(carpeta, 60):
        rel += "/" + _limpio(carpeta, 60)
    d = os.path.join(retocar.comfyui_dir(), "input", rel)
    os.makedirs(d, exist_ok=True)
    limpio = _limpio(base_n) or tipo
    archivo, n = f"{limpio}{ext.lower()}", 2
    while os.path.exists(os.path.join(d, archivo)):
        archivo, n = f"{limpio}_{n}{ext.lower()}", n + 1
    return os.path.join(d, archivo), f"{rel}/{archivo} [input]"


# ---------------------------------------------------------------- proxies para el visor (como el «optimized media» de DaVinci)
PROXIES = os.path.join(generar.SALIDAS, "proxies")
ALTO_PROXY = 540
_cerrojos: dict = {}


def proxy(fuente: str) -> str:
    """La copia ligera de un video para reproducirlo en el visor: 540 p, un fotograma clave cada 12 (medio segundo) y el
    índice al principio. Los de H3 traen 2 o 3 en todo el video: saltar a un punto obligaba al navegador a decodificar hasta
    5 s, y el visor se trababa. Se hace una vez (se rehace si el original cambia). Exportar sigue usando el original."""
    import threading
    ruta = retocar.ruta_video(fuente)
    destino = os.path.join(PROXIES, re.sub(r"[^\w-]+", "_", fuente)[:150] + ".mp4")
    if os.path.isfile(destino) and os.path.getmtime(destino) >= os.path.getmtime(ruta):
        return destino
    cerrojo = _cerrojos.setdefault(destino, threading.Lock())
    with cerrojo:                                        # dos peticiones del mismo video: lo hace una, la otra espera
        if os.path.isfile(destino) and os.path.getmtime(destino) >= os.path.getmtime(ruta):
            return destino
        os.makedirs(PROXIES, exist_ok=True)
        temporal = destino + ".tmp.mp4"
        audio = ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] if _tiene_audio(ruta) else ["-an"]
        retocar._ffmpeg("-i", ruta, "-vf", f"scale=-2:'min({ALTO_PROXY},ih)':flags=bilinear", "-c:v", "libx264", "-preset", "veryfast",
                        "-crf", "24", "-g", "12", "-keyint_min", "12", "-sc_threshold", "0", "-pix_fmt", "yuv420p", *audio,
                        "-movflags", "+faststart", temporal)
        os.replace(temporal, destino)
    return destino


def _tiene_audio(ruta: str) -> bool:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", ruta],
                       capture_output=True, text=True)
    return bool(r.stdout.strip())


def _duracion(ruta: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def _num(x, nombre: str) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        raise ErrorGenerar(f"«{nombre}» no es un número")
    if v != v or v < 0:
        raise ErrorGenerar(f"«{nombre}» no es válido")
    return v


def plan(edicion: dict) -> dict:
    """La edición comprobada: cada clip con su ruta, sus tiempos dentro del original y si tiene audio; el lienzo y la duración."""
    pistas = (edicion or {}).get("pistas") or []
    if not isinstance(pistas, list):
        raise ErrorGenerar("la edición no tiene pistas")
    cache, clips, lienzo = {}, [], None
    for orden, p in enumerate(pistas):
        tipo = p.get("tipo")
        if tipo not in ("video", "audio"):
            raise ErrorGenerar("cada pista es «video» o «audio»")
        for c in p.get("clips") or []:
            fuente = str(c.get("fuente") or "")
            if fuente not in cache:
                ruta = retocar.ruta_video(fuente)
                info = retocar.info(fuente) if tipo == "video" else None
                cache[fuente] = {"ruta": ruta, "info": info, "audio": _tiene_audio(ruta),
                                 "dur": info["duracion"] if info else _duracion(ruta)}
            f = cache[fuente]
            ini, fin, en = _num(c.get("ini"), "ini"), _num(c.get("fin"), "fin"), _num(c.get("en"), "en")
            fin = min(fin, f["dur"] or fin)
            if fin - ini < 1 / FPS:
                continue                              # un clip de menos de un fotograma no se ve
            if tipo == "video" and not lienzo:
                lienzo = (f["info"]["ancho"], f["info"]["alto"])
            clips.append({"tipo": tipo, "orden": orden, "ver": p.get("ver", True) is not False, "oir": p.get("oir", True) is not False,
                          "ruta": f["ruta"], "audio": f["audio"], "ini": ini, "fin": fin, "en": en, "fuente": fuente})
    # (29 oct) inicio y final de lo que se exporta (I y O en la página): cada clip se recorta a [desde, hasta) y todo se corre
    # para que «desde» sea el segundo 0
    rango = (edicion or {}).get("rango") or {}
    if rango.get("desde") is not None or rango.get("hasta") is not None:
        desde = _num(rango.get("desde") or 0, "desde")
        hasta = _num(rango["hasta"], "hasta") if rango.get("hasta") is not None else max(c["en"] + c["fin"] - c["ini"] for c in clips)
        if hasta - desde < 1 / FPS:
            raise ErrorGenerar("el final tiene que ir después del inicio")
        recortados = []
        for c in clips:
            a, b = max(c["en"], desde), min(c["en"] + c["fin"] - c["ini"], hasta)
            if b - a < 1 / FPS:
                continue
            recortados.append({**c, "ini": c["ini"] + (a - c["en"]), "fin": c["ini"] + (b - c["en"]), "en": a - desde})
        clips = recortados
        if not clips:
            raise ErrorGenerar("entre el inicio y el final no hay ningún clip")
    if not clips:
        raise ErrorGenerar("la línea de tiempo está vacía: arrastra algún video de la biblioteca")
    if len(clips) > MAX_CLIPS:
        raise ErrorGenerar(f"como mucho {MAX_CLIPS} clips")
    pedido = (edicion or {}).get("lienzo") or {}
    if pedido.get("ancho") and pedido.get("alto"):
        lienzo = (int(pedido["ancho"]), int(pedido["alto"]))
    w, h = lienzo or (1080, 1920)
    w, h = max(16, int(w) // 2 * 2), max(16, int(h) // 2 * 2)
    duracion = max(c["en"] + c["fin"] - c["ini"] for c in clips)
    if duracion > MAX_DURACION:
        raise ErrorGenerar(f"la edición dura {duracion:.0f} s: como mucho {MAX_DURACION // 60} min")
    return {"clips": clips, "ancho": w, "alto": h, "duracion": round(duracion, 3)}


def comando(p: dict, destino: str) -> list[str]:
    """La orden de ffmpeg: un fondo negro del tamaño del lienzo, cada clip de video encima (de la pista de abajo a la de arriba,
    a su tiempo) y todos los audios que se oyen mezclados sin bajar el volumen."""
    W, H, D = p["ancho"], p["alto"], p["duracion"]
    entradas, filtros, sonidos = [], [f"color=c=black:s={W}x{H}:r={FPS}:d={D:.3f}[base0]"], []
    videos = sorted([c for c in p["clips"] if c["tipo"] == "video" and c["ver"]], key=lambda c: (-c["orden"], c["en"]))
    k = 0
    for i, c in enumerate(p["clips"]):                # una entrada por clip, ya cortada (-ss/-t antes de -i: exacto al recodificar)
        c["_i"] = i
        entradas += ["-ss", f"{c['ini']:.3f}", "-t", f"{c['fin'] - c['ini']:.3f}", "-i", c["ruta"]]
    for c in videos:
        filtros.append(f"[{c['_i']}:v]fps={FPS},scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,"
                       f"setsar=1,setpts=PTS-STARTPTS+{c['en']:.3f}/TB[v{k}]")
        filtros.append(f"[base{k}][v{k}]overlay=eof_action=pass[base{k + 1}]")
        k += 1
    # cada sonido, de largo D: silencio hasta su sitio y luego el trozo (con adelay+amix, ffmpeg 9 corta la mezcla a 60 ms)
    fmt = "aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
    for c in p["clips"]:
        if not (c["oir"] and c["audio"]):
            continue
        n = len(sonidos)
        if c["en"] >= 0.001:
            filtros += [f"anullsrc=r=48000:cl=stereo,atrim=duration={c['en']:.3f},{fmt}[s{n}]",
                        f"[{c['_i']}:a]{fmt},asetpts=PTS-STARTPTS[c{n}]",
                        f"[s{n}][c{n}]concat=n=2:v=0:a=1,apad=whole_dur={D:.3f}[a{n}]"]
        else:
            filtros.append(f"[{c['_i']}:a]{fmt},asetpts=PTS-STARTPTS,apad=whole_dur={D:.3f}[a{n}]")
        sonidos.append(f"[a{n}]")
    if len(sonidos) > 1:
        filtros.append(f"{''.join(sonidos)}amix=inputs={len(sonidos)}:normalize=0:duration=longest,atrim=duration={D:.3f}[aout]")
    elif sonidos:
        filtros.append(f"{sonidos[0]}atrim=duration={D:.3f}[aout]")
    else:
        filtros.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={D:.3f}[aout]")
    filtros.append(f"[base{k}]format=yuv420p[vout]")
    return [*entradas, "-filter_complex", ";".join(filtros), "-map", "[vout]", "-map", "[aout]", "-r", str(FPS), "-t", f"{D:.3f}",
            "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", destino]


def exportar(edicion: dict, proyecto: str | None, nombre: str | None = None) -> tuple[str, dict]:
    t0 = time.time()
    p = plan(edicion)
    os.makedirs(generar.SALIDAS, exist_ok=True)
    sello = f"{datetime.now():%Y%m%d_%H%M%S}"
    archivo = f"montaje_{sello}.mp4"
    destino = os.path.join(generar.SALIDAS, archivo)
    temporal = destino + ".tmp.mp4"
    try:
        retocar._ffmpeg(*comando(p, temporal))
        os.replace(temporal, destino)
    finally:
        if os.path.exists(temporal):
            os.remove(temporal)
    fila = {"id": f"montaje_{sello}", "fecha": datetime.now().isoformat(timespec="seconds"), "segundos": round(time.time() - t0, 1),
            "archivo": archivo, "tipo": "montaje", "semilla": None, "proyecto": proyecto, "edicion": nombre, "sin_cancion": True,
            "montaje": {"clips": len(p["clips"]), "duracion": p["duracion"], "ancho": p["ancho"], "alto": p["alto"],
                        "fuentes": sorted({c["fuente"] for c in p["clips"]})}}
    generar._anotar(fila)
    return archivo, fila
