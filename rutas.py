"""Lo que hacen las rutas del editor (/edit_prompt_llm/*). __init__.py las registra una vez y recarga este archivo y nucleo.py
en cada llamada: un cambio en la lógica se prueba sin reiniciar ComfyUI. planos/4 El editor.md."""
import time

from . import nucleo


def recetas(d=None):
    """Lo que el editor necesita de cada receta: efectos (código → nombre), referencias por defecto y pronombre."""
    return {nombre: {"efectos": {c: e[0] for c, e in r["efectos"].items()},
                     "frases": {c: e[1] for c, e in r["efectos"].items()}, "referencias": r.get("referencias", {}),
                     "pronombre": r["pronombre"], "nombre": r["nombre"]}
            for nombre, r in nucleo.cargar_recetas().items()}


def beats(audio):
    """Beats del archivo de audio que usa el workflow (nombre de LoadAudio); sin audio, cortes parejos."""
    if not audio:
        return None
    import folder_paths
    return nucleo.beats_de_archivo(folder_paths.get_annotated_filepath(audio))


def montar(d):
    prompt, avisos, ini = nucleo.montar_plan(d["receta"], d["entradas"], d["plan"], beats(d.get("audio")))
    return {"prompt": prompt, "avisos": avisos, "cortes": ini}


def historia(d):
    t = time.time()
    plan, intentos = nucleo.escribir_historia(d["receta"], d["entradas"], d["plan"], beats(d.get("audio")),
                                              int(d.get("semilla", 0)))
    return {"plan": plan, "intentos": intentos, "segundos": round(time.time() - t, 1)}


def describir(d):
    """Ficha de una referencia con visión: toma la miniatura del RefMod (la sirve Fantastic) y se la enseña a Qwen."""
    import base64
    import io
    import urllib.parse
    import urllib.request
    from comfy.cli_args import args
    from PIL import Image
    url = f"http://127.0.0.1:{args.port}/minimax_h3/refmods/preview?name=" + urllib.parse.quote(d["preview"])
    img = Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=30).read())).convert("RGB")
    img.thumbnail((768, 768))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return nucleo.describir_imagen(base64.b64encode(buf.getvalue()).decode(), d.get("papel", "pose"))


def tomas(d):
    t = time.time()
    solo = int(d["solo"]) if d.get("solo") else None
    plan, intentos = nucleo.escribir_tomas(d["receta"], d["entradas"], d["plan"], beats(d.get("audio")),
                                           int(d.get("semilla", 0)), solo=solo)
    return {"plan": plan, "intentos": intentos, "segundos": round(time.time() - t, 1)}


# ------------------------------------------------------------------ cajitas: un RefMod hecho con varias fotos
# Fantastic junta varias fotos en un solo RefMod (un fotograma cada una) y H3 lo recibe como <Video N>. Las fotos de cada
# cajita se apuntan al lado del RefMod, en <nombre>.cajita.json, para que el editor pueda enseñarlas (el RefMod solo
# guarda la primera como vista previa). planos/4 El editor.md.
VAE_H3 = "minimax_h3_video_vae_int8_convrot kj.safetensors"
IMAGENES = (".png", ".jpg", ".jpeg", ".webp")


def _raiz_refmods():
    import os
    import folder_paths
    try:
        raices = list(folder_paths.get_folder_paths("refmods"))
    except Exception:
        raices = []
    return raices[0] if raices else os.path.join(folder_paths.models_dir, "refmods")


def _comfy(ruta, cuerpo=None, timeout=30):
    import json
    import urllib.request
    from comfy.cli_args import args
    pet = urllib.request.Request(f"http://127.0.0.1:{args.port}{ruta}", json.dumps(cuerpo).encode() if cuerpo else None,
                                 {"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(pet, timeout=timeout).read())


def _item_media(rel):
    """Archivo de input/ (ruta relativa) → item del Media Loader, como los escribe la biblioteca de Fantastic."""
    import os
    import folder_paths
    from PIL import Image
    ruta = os.path.join(folder_paths.get_input_directory(), rel)
    with Image.open(ruta) as im:
        ancho, alto = im.size
    return {"kind": "picture", "file": f"{rel} [input]", "name": os.path.basename(rel), "width": ancho, "height": alto}


def medios(d=None):
    """Las fotos de input/minimax_h3 (lo que ve el Media Loader), para elegir las de una cajita."""
    import os
    import folder_paths
    base = os.path.join(folder_paths.get_input_directory(), "minimax_h3")
    fotos = []
    for raiz, dirs, archivos in os.walk(base):
        dirs[:] = sorted(x for x in dirs if x != "cache" and not x.startswith("."))
        for a in sorted(archivos):
            if a.lower().endswith(IMAGENES):
                rel = os.path.relpath(os.path.join(raiz, a), folder_paths.get_input_directory()).replace(os.sep, "/")
                fotos.append({"file": f"{rel} [input]", "name": a, "carpeta": os.path.dirname(rel)})
    return {"fotos": fotos}


def cajitas(d=None):
    """{nombre del RefMod: [fotos]} de las cajitas que tienen sus fotos apuntadas."""
    import glob
    import json
    import os
    raiz, out = _raiz_refmods(), {}
    for f in glob.glob(os.path.join(raiz, "**", "*.cajita.json"), recursive=True):
        try:
            with open(f) as fh:
                out[os.path.relpath(f, raiz)[:-len(".cajita.json")].replace(os.sep, "/")] = json.load(fh).get("fotos", [])
        except Exception:
            pass
    return {"cajitas": out}


def _foto_de_refmod(nombre, raiz):
    """Un RefMod de una foto → su foto original en input/minimax_h3 (mismo nombre de archivo) o, si no está, una copia de su
    vista previa en input/minimax_h3/cajitas/. Una cajita → sus fotos."""
    import os
    import shutil
    import folder_paths
    ya = cajitas()["cajitas"].get(nombre)
    if ya:
        return [x["file"][:-len(" [input]")] for x in ya]
    tronco = os.path.basename(nombre)
    for x in medios()["fotos"]:
        if os.path.splitext(x["name"])[0] == tronco:
            return [x["file"][:-len(" [input]")]]
    previa = next((os.path.join(raiz, nombre + e) for e in (".png", ".jpg", ".webp") if os.path.isfile(os.path.join(raiz, nombre + e))), None)
    if not previa:
        raise ValueError(f"{nombre}: no encuentro su foto original ni su vista previa")
    rel = f"minimax_h3/cajitas/{tronco}{os.path.splitext(previa)[1]}"
    destino = os.path.join(folder_paths.get_input_directory(), rel)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    shutil.copyfile(previa, destino)
    return [rel]


def crear_cajita(d):
    """Crea un RefMod con varias fotos (nodo MiniMaxH3FantasticRefModCreate, por /prompt) y apunta sus fotos.
    d: nombre, carpeta, concepto (identity, clothing, background…), descripcion, sujeto, fotos: [{file} o {refmod}]."""
    import json
    import os
    import re
    t0 = time.time()
    nombre = re.sub(r"[^A-Za-z0-9._-]+", "_", (d.get("nombre") or "").strip()).strip("._")
    carpeta = re.sub(r"[^A-Za-z0-9._/-]+", "_", (d.get("carpeta") or "cajitas").strip()).strip("/.")
    if not nombre:
        raise ValueError("Ponle un nombre a la cajita.")
    raiz = _raiz_refmods()
    destino = f"{carpeta}/{nombre}" if carpeta else nombre
    if os.path.exists(os.path.join(raiz, destino + ".safetensors")):
        raise ValueError(f"Ya existe un RefMod «{destino}»: elige otro nombre.")
    rels = []
    for f in d.get("fotos") or []:
        if f.get("refmod"):
            rels += _foto_de_refmod(f["refmod"], raiz)
        elif f.get("file"):
            rels.append(f["file"].removesuffix(" [input]"))
    rels = list(dict.fromkeys(rels))
    if len(rels) < 2:
        raise ValueError("Una cajita necesita al menos 2 fotos.")
    items = [_item_media(r) for r in rels]
    cola = _comfy("/api/queue")
    if cola.get("queue_running") or cola.get("queue_pending"):
        raise RuntimeError("ComfyUI está trabajando: espera a que termine la cola para crear la cajita.")
    grafo = {
        "1": {"class_type": "VAELoader", "inputs": {"vae_name": VAE_H3}},
        "2": {"class_type": "MiniMaxH3FantasticRefModCreate", "inputs": {
            "name": nombre, "subfolder": carpeta, "mode": "Full Reference", "ref_resolution": 512, "grid": 16,
            "latent_frames": 22, "refinement_steps": 500, "max_tokens": 5120, "audio_max_seconds": 30.0,
            "concept_type": d.get("concepto") or "identity", "description": d.get("descripcion") or "",
            "write_preview": True, "source": json.dumps(items, ensure_ascii=False),
            "subject_name": d.get("sujeto") or "", "appearance": d.get("apariencia") or "", "vae": ["1", 0]}}}
    r = _comfy("/prompt", {"prompt": grafo, "client_id": "edit_prompt_llm_cajita"})
    if r.get("node_errors"):
        raise RuntimeError(f"ComfyUI no aceptó el grafo: {r['node_errors']}")
    pid = r["prompt_id"]
    for _ in range(600):
        time.sleep(1)
        h = _comfy(f"/history/{pid}").get(pid)
        if h and h.get("status", {}).get("completed") is not None:
            if h["status"].get("status_str") != "success":
                msgs = [m for m in h["status"].get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError("No se pudo crear la cajita: " + (msgs[0][1].get("exception_message", "") if msgs else "error"))
            break
    else:
        raise RuntimeError("La cajita tarda demasiado (10 min); mira la consola de ComfyUI.")
    with open(os.path.join(raiz, destino + ".cajita.json"), "w") as fh:
        json.dump({"fotos": items, "creada": time.strftime("%Y-%m-%d %H:%M:%S")}, fh, ensure_ascii=False, indent=1)
    return {"name": destino, "fotos": items, "segundos": round(time.time() - t0, 1)}


# acción → (función, usa el LLM). Una acción nueva se añade aquí: no hace falta reiniciar ComfyUI.
ACCIONES = {
    "recetas": (recetas, False),
    "montar": (montar, False),
    "historia": (historia, True),
    "tomas": (tomas, True),
    "describir": (describir, True),
    "medios": (medios, False),
    "cajitas": (cajitas, False),
    "crear_cajita": (crear_cajita, False),
}
