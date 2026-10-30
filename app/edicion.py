"""El apartado 3 «Edición» de MAX EDITOR (29 oct, variante P1 de app/web/prototipo_edicion.html, elegida por Jonathan):
juntar trozos de los videos de la biblioteca (y audios) en una línea de tiempo con varias pistas, como en DaVinci Resolve, y
exportarla a un mp4 nuevo con ffmpeg. Sin GPU: corta, escala, pone cada pista de video encima de la de abajo y mezcla.

  audios() -> list                    los audios que se pueden usar: ComfyUI/input y input/max_editor/audios (los subidos)
  guardar_audio(nombre, datos) -> str  un audio subido desde el PC → «max_editor/audios/x.mp3 [input]»
  exportar(edicion, proyecto) -> (archivo, fila)   el mp4 en app/salidas (montaje_<sello>.mp4) y su fila del historial

`edicion` = {lienzo: {ancho, alto} | None, pistas: [{id, tipo: video|audio, ver, oir, clips: [{fuente, ini, fin, en}]}]}
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
CARPETA_AUDIOS = "max_editor/audios"          # dentro de ComfyUI/input: los audios subidos desde la página
EXT_AUDIO = (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus")
MAX_CLIPS = 200
MAX_DURACION = 15 * 60                         # s: una edición de más de 15 min no es lo que hace esta app


def audios() -> list[dict]:
    """Los audios de ComfyUI/input (arriba del todo y los subidos aquí), lo más nuevo primero."""
    base = os.path.join(retocar.comfyui_dir(), "input")
    out = []
    for carpeta in ("", CARPETA_AUDIOS):
        d = os.path.join(base, carpeta)
        try:
            nombres = os.listdir(d)
        except OSError:
            continue
        for n in nombres:
            ruta = os.path.join(d, n)
            if n.lower().endswith(EXT_AUDIO) and os.path.isfile(ruta):
                rel = f"{carpeta}/{n}" if carpeta else n
                out.append({"fuente": f"{rel} [input]", "nombre": n, "fecha": os.path.getmtime(ruta)})
    return sorted(out, key=lambda x: -x["fecha"])


def guardar_audio(nombre: str, datos: bytes) -> str:
    base, ext = os.path.splitext(os.path.basename(nombre or "audio"))
    if ext.lower() not in EXT_AUDIO:
        raise ErrorGenerar(f"«{nombre}» no es un audio ({', '.join(EXT_AUDIO)})")
    limpio = re.sub(r"[^\w.-]+", "_", base)[:80] or "audio"
    d = os.path.join(retocar.comfyui_dir(), "input", CARPETA_AUDIOS)
    os.makedirs(d, exist_ok=True)
    archivo, n = f"{limpio}{ext.lower()}", 2
    while os.path.exists(os.path.join(d, archivo)):
        archivo, n = f"{limpio}_{n}{ext.lower()}", n + 1
    with open(os.path.join(d, archivo), "wb") as f:
        f.write(datos)
    return f"{CARPETA_AUDIOS}/{archivo} [input]"


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


def exportar(edicion: dict, proyecto: str | None) -> tuple[str, dict]:
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
            "archivo": archivo, "tipo": "montaje", "semilla": None, "proyecto": proyecto, "sin_cancion": True,
            "montaje": {"clips": len(p["clips"]), "duracion": p["duracion"], "ancho": p["ancho"], "alto": p["alto"],
                        "fuentes": sorted({c["fuente"] for c in p["clips"]})}}
    generar._anotar(fila)
    return archivo, fila
