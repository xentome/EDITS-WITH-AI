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


# acción → (función, usa el LLM). Una acción nueva se añade aquí: no hace falta reiniciar ComfyUI.
ACCIONES = {
    "recetas": (recetas, False),
    "montar": (montar, False),
    "historia": (historia, True),
    "tomas": (tomas, True),
    "describir": (describir, True),
}
