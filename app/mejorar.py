"""Mejorar un video de MAX EDITOR con los nodos RTX de NVIDIA (paquete Nvidia_RTX_Nodes_ComfyUI 0.2.1, 29 oct): la
segunda pestaña de Retocar › Inpainting/detalle. Al video ENTERO se le puede dar
  - Super Resolution (RTXVideoSuperResolution): más grande y más nítido, ×1,5 a ×4;
  - HDR (RTXTrueHDR): de SDR a HDR BT.2020/HLG, guardado en 10 bits.
Frame Generation (RTXVideoFrameGeneration) no se ofrece: solo va en RTX 40 o más nuevas (en la 3060 falla al cargar).
Probado el 29 oct en la RTX 3060: 124 fotogramas de 1376 × 800 → ×2 en 16 s, HDR en 6 s, los dos en 24 s.

Mismo contrato que retocar.py, y comparte con generar.py el trabajo (lanzar por el SDK, avance, estado y cancelar):
  preparar(datos) -> (grafo, meta)    el grafo listo (copia el video a ComfyUI/input/max_editor/mejorar/)
  iniciar(datos) -> str               lanza en un hilo; el avance y el final se leen con generar.estado(id)
  recuperar(datos, rutas, sello)      para la cola: lo que ComfyUI terminó con el servidor parado

`datos` = {video, superres: {escala, calidad} | None, hdr: {nits} | None, proyecto}
`video`: como en retocar.py («edit_….mp4» de app/salidas, o «x.mp4 [input]» / «x.mp4 [output]»).
Todo el video pasa por la memoria del PC como IMAGE (float32): por eso el tamaño de salida tiene un límite (MAX_PIXELES)."""
from __future__ import annotations

import os
import re
import shutil
from datetime import datetime

import generar
import retocar
from generar import ErrorGenerar

CARPETA = "max_editor/mejorar"                 # dentro de ComfyUI/input: la copia que lee el LoadVideo
ESCALAS = (1.5, 2.0, 3.0, 4.0)
CALIDADES = ("LOW", "MEDIUM", "HIGH", "ULTRA")
NITS, NITS_MIN, NITS_MAX = 650, 400, 2000
LADO_MAX = 8192                                # lo más grande que da el nodo
# fotogramas × ancho × alto de salida: cada píxel son 12 bytes (RGB float32) y el video entero va de una vez; 1,4 G ≈ 17 GB
MAX_PIXELES = 1.4e9
N_VIDEO, N_PARTES, N_SR, N_HDR, N_CREAR, N_GUARDAR = "1", "2", "10", "11", "40", "41"


def tamano(ancho: int, alto: int, escala: float) -> tuple[int, int]:
    """El tamaño que devuelve Super Resolution: cada lado × escala, redondeado al múltiplo de 8 más cercano."""
    return max(8, int(round(ancho * escala / 8)) * 8), max(8, int(round(alto * escala / 8)) * 8)


def opciones(datos: dict, vi: dict) -> dict:
    """Lo que se hará, ya comprobado: {superres: {escala, calidad, ancho, alto} | None, hdr: {nits} | None}."""
    sr, hdr = datos.get("superres"), datos.get("hdr")
    if not sr and not hdr:
        raise ErrorGenerar("elige al menos un efecto: Super Resolution o HDR")
    r = {"superres": None, "hdr": None}
    if sr:
        try:
            escala = float(sr.get("escala") or 2)
        except (TypeError, ValueError):
            raise ErrorGenerar("la escala de Super Resolution no es válida")
        if escala not in ESCALAS:
            raise ErrorGenerar(f"la escala debe ser una de {', '.join(f'×{e:g}' for e in ESCALAS)}")
        calidad = str(sr.get("calidad") or "ULTRA").upper()
        if calidad not in CALIDADES:
            raise ErrorGenerar("la calidad de Super Resolution no es válida")
        w, h = tamano(vi["ancho"], vi["alto"], escala)
        if max(w, h) > LADO_MAX:
            raise ErrorGenerar(f"×{escala:g} daría {w} × {h}: el lado más grande puede ser {LADO_MAX} px. Elige una escala menor")
        if w * h * max(1, vi["fotogramas"]) > MAX_PIXELES:
            raise ErrorGenerar(f"×{escala:g} daría {w} × {h} en {vi['fotogramas']} fotogramas: no cabe en la memoria. "
                               "Elige una escala menor o un video más corto")
        r["superres"] = {"escala": escala, "calidad": calidad, "ancho": w, "alto": h}
    if hdr:
        try:
            nits = int(round(float(hdr.get("nits") or NITS)))
        except (TypeError, ValueError):
            raise ErrorGenerar("el brillo del HDR no es válido")
        r["hdr"] = {"nits": min(NITS_MAX, max(NITS_MIN, nits))}
    return r


def _copiar(ruta: str) -> str:
    """El video, copiado a ComfyUI/input/max_editor/mejorar/ (el LoadVideo solo lee de input). Devuelve su nombre."""
    base = re.sub(r"[^\w-]+", "_", os.path.splitext(os.path.basename(ruta))[0])[:80]
    nombre = f"{CARPETA}/{base}.mp4"
    destino = os.path.join(retocar.comfyui_dir(), "input", nombre)
    if os.path.abspath(destino) != os.path.abspath(ruta):
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        shutil.copyfile(ruta, destino)
    return nombre


def preparar(datos: dict) -> tuple[dict, dict]:
    datos = datos or {}
    vi = retocar.info(datos.get("video"))
    op = opciones(datos, vi)
    sello = f"{datetime.now():%Y%m%d_%H%M%S}"
    # lo que ya está en ComfyUI/input se lee de ahí; lo demás (app/salidas, output) se copia antes
    v = str(datos["video"])
    archivo = v[:-len(" [input]")] if v.endswith(" [input]") else _copiar(retocar.ruta_video(v))
    g = {N_VIDEO: {"class_type": "LoadVideo", "inputs": {"file": archivo}},
         N_PARTES: {"class_type": "GetVideoComponents", "inputs": {"video": [N_VIDEO, 0]}}}
    imagenes = [N_PARTES, 0]
    if op["superres"]:
        g[N_SR] = {"class_type": "RTXVideoSuperResolution", "inputs": {
            "images": imagenes, "resize_type": "scale by multiplier", "resize_type.scale": op["superres"]["escala"],
            "quality": op["superres"]["calidad"], "strength": 1.0, "image_encoding": "8-bit RGB"}}
        imagenes = [N_SR, 0]
    if op["hdr"]:
        g[N_HDR] = {"class_type": "RTXTrueHDR", "inputs": {
            "images": imagenes, "contrast": 100, "saturation": 100, "middle_gray": 50, "luminance": op["hdr"]["nits"],
            "debanding": True, "output_colorspace": "HDR"}}
        imagenes = [N_HDR, 0]
    # el HDR sale en BT.2020/HLG: CreateVideo lo marca así y lo guarda en 10 bits; si no, sRGB en 8 bits como siempre
    g[N_CREAR] = {"class_type": "CreateVideo", "inputs": {"images": imagenes, "fps": [N_PARTES, 2], "audio": [N_PARTES, 1],
                                                           "color_space": "HDR" if op["hdr"] else "sRGB", "bit_depth": "auto",
                                                           "codec": "none"}}
    g[N_GUARDAR] = {"class_type": "SaveVideo", "inputs": {"video": [N_CREAR, 0], "filename_prefix": f"max_editor/mejorado_{sello}",
                                                           "format": "auto", "format.codec": "auto"}}
    return g, {"video": datos["video"], "info": vi, "sello": sello, "proyecto": datos.get("proyecto"), **op}


def _fila(meta: dict) -> dict:
    return {"tipo": "mejora", "semilla": None, "proyecto": meta.get("proyecto"), "de": meta["video"],
            "superres": meta.get("superres"), "hdr": meta.get("hdr")}


def iniciar(datos: dict) -> str:
    c = generar.config()
    try:
        grafo, meta = preparar(datos)
        generar.comprobar_servicios(c)
    except Exception as exc:
        return generar._nuevo("error", generar._texto_error(exc, c))
    return generar.lanzar(grafo, {"meta": meta, "proyecto": meta["proyecto"]}, c, despues=_despues, extra={"tipo": "mejora"})


def _despues(tid: str, grafo: dict, job, opciones_: dict):
    meta = opciones_["meta"]
    videos = generar.videos_del_job(job, grafo, ("SaveVideo",))
    if not videos:
        raise ErrorGenerar("ComfyUI terminó pero no devolvió el video mejorado")
    os.makedirs(generar.SALIDAS, exist_ok=True)
    archivo = f"mejorado_{meta['sello']}.mp4"
    videos[-1].to_file(os.path.join(generar.SALIDAS, archivo))
    return archivo, _fila(meta)


def recuperar(datos: dict, rutas: list[str], sello: str) -> tuple[str, dict]:
    """Para la cola (cola.py): un video mejorado que ComfyUI terminó mientras el servidor estaba parado."""
    vi = retocar.info(datos.get("video"))
    archivo = f"mejorado_{sello}.mp4"
    os.makedirs(generar.SALIDAS, exist_ok=True)
    shutil.copyfile(rutas[-1], os.path.join(generar.SALIDAS, archivo))
    return archivo, _fila({"video": datos["video"], "proyecto": datos.get("proyecto"), **opciones(datos, vi)})
