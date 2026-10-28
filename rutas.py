"""Lo que hacen las rutas del editor (/edit_prompt_llm/*). __init__.py las registra una vez y recarga este archivo y nucleo.py
en cada llamada: un cambio en la lógica se prueba sin reiniciar ComfyUI. planos/4 El editor.md.
Idioma: cada llamada trae `idioma` (es / en). Los errores para el usuario son ErrorUsuario(clave, **datos) y __init__.py los
traduce; lo que se devuelve para enseñar (huecos, de dónde sale un tapado, avisos) sale ya en ese idioma, y lo que se
guarda en disco (descripciones de RefMods, .tapado.json) queda en español, con su clave al lado cuando se vuelve a enseñar."""
import os
import time

from . import i18n, nucleo

ErrorUsuario = i18n.ErrorUsuario


def _ruta_audio(audio):
    import folder_paths
    ruta = folder_paths.get_annotated_filepath(audio)
    if not ruta or not os.path.isfile(ruta):
        raise ErrorUsuario("errores.audio_no_esta", audio=audio)
    return ruta


def beats(d):
    """Beats del audio que usa el workflow (nombre del LoadAudio); sin audio, cortes parejos. Si el editor eligió un tramo
    («audio_inicio»), son los beats de ese tramo de la canción original, contados desde su inicio (nucleo.beats_de_tramo)."""
    audio = d.get("audio")
    if not audio:
        return None
    if d.get("audio_inicio") is not None:
        return nucleo.beats_de_tramo(_ruta_audio(audio), float(d["audio_inicio"]), float(d["entradas"]["duracion"]))
    return nucleo.beats_de_archivo(_ruta_audio(audio))


def montar(d):
    b = beats(d)
    # con los trozos: la ventana pinta cada uno del color de quien lo escribió, y la ficha enseña los renglones de arriba
    prompt, avisos, ini, extra = nucleo.montar_plan(d["entradas"], d["plan"], b, d.get("idioma"), con_trozos=True)
    # los beats van a la línea de tiempo: al soltar un borde arrastrado, se pega al más cercano
    # las palabras de la fila de texto (convertidas del formato viejo «TO YOU @1» si el plan aún no las tiene)
    textos = nucleo.textos_de(d["entradas"], d["plan"] or {}, ini, float(d["entradas"]["duracion"]))
    return {"prompt": prompt, "avisos": avisos, "cortes": ini, "beats": b or [], "textos": textos, **extra,
            "frases": nucleo.FRASES, "fijos": nucleo.cortes_validos(
        (d["plan"] or {}).get("cortes"), int(d["entradas"]["tomas"]), float(d["entradas"]["duracion"]))}


# ------------------------------------------------------------------ ventana de audio (planos/4 El editor.md)
AUDIOS = (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus")


def audios(d=None):
    """Las canciones que puede cargar el LoadAudio: los audios de la raíz de input/ (no mira subcarpetas, como LoadAudio),
    sin los recortes edit_tramo_*.wav que escribe el editor. De la más nueva a la más vieja."""
    import folder_paths
    base, out = folder_paths.get_input_directory(), []
    for a in os.listdir(base):
        ruta = os.path.join(base, a)
        if a.lower().endswith(AUDIOS) and not a.startswith(("edit_tramo_", ".")) and os.path.isfile(ruta):
            st = os.stat(ruta)
            out.append({"nombre": a, "mb": round(st.st_size / 2 ** 20, 1), "fecha": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime)),
                        "t": st.st_mtime})
    return {"audios": sorted(out, key=lambda x: -x["t"])}


def audio_info(d):
    """Duración y resumen de picos de la canción entera (cacheado en disco)."""
    t = time.time()
    return {**nucleo.info_audio(_ruta_audio(d["audio"])), "segundos": round(time.time() - t, 3)}


def audio_ventana(d):
    """Picos finos alrededor del tramo; con «wav», también el tramo en WAV (base64) para oírlo en el navegador."""
    import base64
    ruta, ini, dur = _ruta_audio(d["audio"]), float(d["inicio"]), float(d["dur"])
    out = nucleo.ventana_audio(ruta, ini, dur, d.get("margen"))
    if d.get("wav"):
        datos, sr, can = nucleo.tramo_wav(ruta, ini, dur)
        out.update(wav=base64.b64encode(datos).decode(), sr=sr, canales=can)
    return out


def audio_recortar(d):
    """Escribe el tramo como WAV en input/ (edit_tramo_<hash>.wav), sin tocar el original."""
    import folder_paths
    return nucleo.recortar_audio(_ruta_audio(d["audio"]), float(d["inicio"]), float(d["dur"]), folder_paths.get_input_directory())


def historia(d):
    t = time.time()
    plan, intentos = nucleo.escribir_historia(d["entradas"], d["plan"], beats(d),
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


def traducir(d):
    """Un campo (o la selección de un campo, d.inicio–d.fin) al inglés, desde d.desde (el idioma de la cabecera)."""
    return nucleo.traducir(str(d.get("texto") or ""), d.get("desde") or "Spanish", d.get("inicio"), d.get("fin"),
                           campo=d.get("campo"), pronombre=d.get("pronombre"))


def tomas(d):
    t = time.time()
    solo = int(d["solo"]) if d.get("solo") else None
    plan, intentos = nucleo.escribir_tomas(d["entradas"], d["plan"], beats(d),
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


VIDEOS_SUBIDA = (".mp4", ".webm", ".mov", ".mkv", ".gif")


def _item_media(rel, tramo=None, recorte=None):
    """Archivo de input/ (ruta relativa) → item del Media Loader, como los escribe la biblioteca de Fantastic. Un video
    lleva su tramo (`trim`: start/end en segundos) y un recorte (`crop`: x, y, w, h de 0 a 1), si se eligieron."""
    import os
    import folder_paths
    ruta = os.path.join(folder_paths.get_input_directory(), rel)
    if rel.lower().endswith(VIDEOS_SUBIDA):
        info = _info_video(ruta)
        item = {"kind": "video", "file": f"{rel} [input]", "name": os.path.basename(rel), "width": info["ancho"],
                "height": info["alto"], "has_audio": False, "audio_mode": "off"}
        if tramo and (tramo.get("desde") or tramo.get("hasta")):
            item["trim"] = {"start": float(tramo.get("desde") or 0), "end": float(tramo.get("hasta") or info["duracion"])}
    else:
        from PIL import Image
        with Image.open(ruta) as im:
            ancho, alto = im.size
        item = {"kind": "picture", "file": f"{rel} [input]", "name": os.path.basename(rel), "width": ancho, "height": alto}
    if recorte and all(k in recorte for k in "xywh") and (float(recorte["w"]) < 0.999 or float(recorte["h"]) < 0.999):
        item["crop"] = {k: round(min(1.0, max(0.0, float(recorte[k]))), 4) for k in "xywh"}
    return item


def _info_video(ruta):
    """Duración (s), fotogramas por segundo y tamaño de un video, con ffprobe."""
    import json
    import subprocess
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate:format=duration", "-of", "json", ruta], capture_output=True, text=True)
    j = json.loads(r.stdout or "{}")
    st = (j.get("streams") or [{}])[0]
    num, _, den = (st.get("r_frame_rate") or "24/1").partition("/")
    return {"duracion": float((j.get("format") or {}).get("duration") or 0), "fps": float(num) / float(den or 1),
            "ancho": int(st.get("width") or 0), "alto": int(st.get("height") or 0)}


def video_info(d):
    """Lo que la ventanita de subir necesita de un video ya subido: duración, fps y tamaño."""
    import os
    import folder_paths
    rel = (d.get("file") or "").removesuffix(" [input]")
    return _info_video(os.path.join(folder_paths.get_input_directory(), rel))


def _fotogramas_clip(item):
    """Los fotogramas de un clip para el RefMod (a 24 fps, desde su tramo): 17·k + 5 hasta 641; una foto, 22."""
    if item.get("kind") != "video":
        return 22
    t = item.get("trim") or {}
    dur = (t.get("end") or 0) - (t.get("start") or 0) if t else 0
    if dur <= 0:
        import os
        import folder_paths
        dur = _info_video(os.path.join(folder_paths.get_input_directory(), item["file"].removesuffix(" [input]")))["duracion"]
    f = int(dur * 24)
    return max(5, min(641, f - ((f - 5) % 17))) if f >= 5 else max(1, f)


def _cola_libre(para):
    """`para`: la tarea (crear_cajita, crear_subidas, crear_tapada, buscar_sam) → el aviso errores.cola.<para>."""
    cola = _comfy("/api/queue")
    if cola.get("queue_running") or cola.get("queue_pending"):
        raise ErrorUsuario(f"errores.cola.{para}")


def _ejecutar(grafo, tarea, cliente="edit_prompt_llm", max_s=600):
    """Manda un grafo a ComfyUI por /prompt y espera a que termine. Devuelve sus salidas (history[...]["outputs"]).
    `tarea` (crear_cajita, crear_subidas, crear_tapada, mascaras) elige los avisos errores.no_se_pudo.* y errores.tarda.*."""
    r = _comfy("/prompt", {"prompt": grafo, "client_id": cliente})
    if r.get("node_errors"):
        raise ErrorUsuario("errores.grafo", errores=str(r["node_errors"]))
    pid = r["prompt_id"]
    for _ in range(max_s * 4):
        time.sleep(0.25)
        h = _comfy(f"/history/{pid}").get(pid)
        if h and h.get("status", {}).get("completed") is not None:
            if h["status"].get("status_str") != "success":
                msgs = [m for m in h["status"].get("messages", []) if m[0] == "execution_error"]
                raise ErrorUsuario(f"errores.no_se_pudo.{tarea}",
                                   detalle=(msgs[0][1].get("exception_message", "") if msgs else "") or "—")
            return h.get("outputs", {})
    raise ErrorUsuario(f"errores.tarda.{tarea}", min=max_s // 60)


# cómo se guarda una referencia: «completo» (Full Reference, guarda el detalle) o «comprimido» (Compressed Reference,
# copia el aspecto general y pesa mucho menos: el método del reel, planos/8). Medidas probadas el 25 oct.
MODOS = {"completo": {"mode": "Full Reference", "ref_resolution": 512, "grid": 16, "max_tokens": 12000},
         "comprimido": {"mode": "Compressed Reference", "ref_resolution": 384, "grid": 24, "max_tokens": 7100}}


def _crear_refmod(nombre, carpeta, items, concepto, descripcion="", sujeto="", apariencia="", tarea="crear_subidas",
                  cliente="edit_prompt_llm_RefMod", modo="completo", fotogramas=22):
    """RefMod con las fotos o el clip de `items` (nodo MiniMaxH3FantasticRefModCreate, VAE de H3), por /prompt. `modo`:
    completo o comprimido (MODOS); `fotogramas`: los de un clip, desde su inicio (tras su tramo). `cliente` es el
    client_id de ComfyUI: va aparte de los textos, que cambian con el idioma."""
    import json
    m = MODOS.get(modo, MODOS["completo"])
    grafo = {
        "1": {"class_type": "VAELoader", "inputs": {"vae_name": VAE_H3}},
        "2": {"class_type": "MiniMaxH3FantasticRefModCreate", "inputs": {
            "name": nombre, "subfolder": carpeta, "mode": m["mode"], "ref_resolution": m["ref_resolution"], "grid": m["grid"],
            "latent_frames": max(1, int(fotogramas)), "refinement_steps": 500, "max_tokens": m["max_tokens"], "audio_max_seconds": 30.0,
            "concept_type": concepto, "description": descripcion, "write_preview": True,
            "source": json.dumps(items, ensure_ascii=False), "subject_name": sujeto, "appearance": apariencia,
            "vae": ["1", 0]}}}
    _ejecutar(grafo, tarea, cliente)


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


VIDEOS = (".mp4", ".webm", ".mov", ".mkv", ".gif")


def video_de(d):
    """El video del que salió un RefMod de tipo clip, para verlo en movimiento en su ficha: el que apunta su
    `<nombre>.fuente.json` ({"file": "minimax_h3/x.mp4 [input]"}) o, si no lo tiene, un video de input/ con el mismo
    nombre de archivo. El RefMod solo guarda el latente, no de qué archivo salió. Devuelve {file, como} o {file: ""}."""
    import json
    import os
    import folder_paths
    nombre = (d or {}).get("nombre") or ""
    raiz, entrada = _raiz_refmods(), folder_paths.get_input_directory()
    fuente = os.path.join(raiz, nombre + ".fuente.json")
    if os.path.isfile(fuente):
        try:
            with open(fuente) as fh:
                f = json.load(fh).get("file", "")
            if f.lower().removesuffix(" [input]").endswith(VIDEOS) and os.path.isfile(os.path.join(entrada, f.removesuffix(" [input]"))):
                return {"file": f, "como": "fuente"}
        except Exception:
            pass
    tronco = os.path.basename(nombre)
    for carpeta, dirs, archivos in os.walk(entrada):
        dirs[:] = sorted(x for x in dirs if x != "cache" and not x.startswith("."))
        for a in sorted(archivos):
            if a.lower().endswith(VIDEOS) and os.path.splitext(a)[0] == tronco:
                rel = os.path.relpath(os.path.join(carpeta, a), entrada).replace(os.sep, "/")
                return {"file": f"{rel} [input]", "como": "nombre"}
    return {"file": ""}


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
        raise ErrorUsuario("errores.sin_foto", nombre=nombre)
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
        raise ErrorUsuario("errores.cajita_sin_nombre")
    raiz = _raiz_refmods()
    destino = f"{carpeta}/{nombre}" if carpeta else nombre
    if os.path.exists(os.path.join(raiz, destino + ".safetensors")):
        raise ErrorUsuario("errores.refmod_existe", nombre=destino)
    rels = []
    for f in d.get("fotos") or []:
        if f.get("refmod"):
            rels += _foto_de_refmod(f["refmod"], raiz)
        elif f.get("file"):
            rels.append(f["file"].removesuffix(" [input]"))
    rels = list(dict.fromkeys(rels))
    if len(rels) < 2:
        raise ErrorUsuario("errores.cajita_pocas_fotos")
    items = [_item_media(r) for r in rels]
    _cola_libre("crear_cajita")
    _crear_refmod(nombre, carpeta, items, d.get("concepto") or "identity", d.get("descripcion") or "",
                  d.get("sujeto") or "", d.get("apariencia") or "", "crear_cajita", "edit_prompt_llm_cajita")
    with open(os.path.join(raiz, destino + ".cajita.json"), "w") as fh:
        json.dump({"fotos": items, "creada": time.strftime("%Y-%m-%d %H:%M:%S")}, fh, ensure_ascii=False, indent=1)
    return {"name": destino, "fotos": items, "segundos": round(time.time() - t0, 1)}


# la descripción que se guarda en el RefMod (un dato en disco, en un solo idioma)
_DESC_SUBIDA = "Subida desde el editor del edit ({papel})"
_DESC_TAPADO = "tapado con SAM 3.1: {palabras} ({forma})"

# papel de la mitad → concept_type del RefMod (lo que Fantastic sabe hacer con él)
CONCEPTO_PAPEL = {"personaje": "identity", "ropa": "clothing", "pose": "pose_motion", "lugar": "background", "letra": "style",
                  "fondo": "background", "objeto": "generic", "estilo": "style", "efecto": "style"}


def _libre(raiz, base):
    """«subidas/teto» si no existe; si no, «subidas/teto_2», «_3»…"""
    import os
    nombre, k = base, 1
    while os.path.exists(os.path.join(raiz, nombre + ".safetensors")):
        k += 1
        nombre = f"{base}_{k}"
    return nombre


def subir_refmods(d):
    """Crea RefMods con fotos ya subidas a input/minimax_h3 (el editor las sube con /upload/image). d: nombre, papel,
    fotos: [ruta en input/], juntar (varias fotos en una sola cajita), carpeta (por defecto «subidas»). Igual que una
    cajita: MiniMaxH3FantasticRefModCreate, Full Reference, 512, VAE de H3; el concept_type sale del papel.
    Devuelve {creados: [nombres], segundos}."""
    import json
    import os
    import re
    t0 = time.time()
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", (d.get("nombre") or "").strip()).strip("._")
    carpeta = re.sub(r"[^A-Za-z0-9._/-]+", "_", (d.get("carpeta") or "subidas").strip()).strip("/.")
    if not base:
        raise ErrorUsuario("errores.subir_sin_nombre")
    rels = list(dict.fromkeys(f.removesuffix(" [input]") for f in d.get("fotos") or [] if f))
    if not rels:
        raise ErrorUsuario("errores.subir_sin_fotos")
    modo = d.get("modo") if d.get("modo") in MODOS else "completo"
    ajustes = d.get("ajustes") or {}       # {ruta: {tramo, recorte}}: lo elegido en la ventanita para cada archivo
    concepto = CONCEPTO_PAPEL.get(d.get("papel"), "generic")
    raiz = _raiz_refmods()
    grupos = [rels] if d.get("juntar") or len(rels) == 1 else [[r] for r in rels]
    _cola_libre("crear_subidas")
    creados = []
    for i, fotos in enumerate(grupos, 1):
        destino = _libre(raiz, f"{carpeta}/{base}" + ("" if len(grupos) == 1 else f"_{i}"))
        items = [_item_media(r, (ajustes.get(r) or {}).get("tramo"), (ajustes.get(r) or {}).get("recorte")) for r in fotos]
        if any(x["kind"] == "video" for x in items) and len(items) > 1:
            raise ErrorUsuario("errores.subir_video_solo")
        _crear_refmod(os.path.basename(destino), os.path.dirname(destino), items, concepto,
                      _DESC_SUBIDA.format(papel=d.get("papel") or "-"), "", "", "crear_subidas",
                      "edit_prompt_llm_referencia", modo, _fotogramas_clip(items[0]))
        _apuntar_fuente(raiz, destino, items, modo, concepto)
        if len(items) > 1:       # una cajita apunta sus fotos, como las de «+ Cajita»
            with open(os.path.join(raiz, destino + ".cajita.json"), "w") as fh:
                json.dump({"fotos": items, "creada": time.strftime("%Y-%m-%d %H:%M:%S")}, fh, ensure_ascii=False, indent=1)
        creados.append(destino)
    return {"creados": creados, "concepto": concepto, "modo": modo, "segundos": round(time.time() - t0, 1)}


def _apuntar_fuente(raiz, nombre, items, modo, concepto):
    """<nombre>.fuente.json: de qué archivo (y con qué tramo y recorte) salió el RefMod y en qué modo; lo usan la ficha
    (ver el clip en movimiento, rutas.video_de) y «cambiar a comprimido / completo» (rutas.cambiar_modo)."""
    import json
    import os
    with open(os.path.join(raiz, nombre + ".fuente.json"), "w") as fh:
        json.dump({"file": items[0]["file"], "items": items, "modo": modo, "concepto": concepto,
                   "creada": time.strftime("%Y-%m-%d %H:%M:%S")}, fh, ensure_ascii=False, indent=1)


def fuente(d):
    """El .fuente.json de un RefMod (modo, tramo, recorte), o {} si no tiene."""
    import json
    import os
    f = os.path.join(_raiz_refmods(), (d.get("nombre") or "") + ".fuente.json")
    try:
        with open(f) as fh:
            return json.load(fh)
    except Exception:
        return {}


def recortar(d):
    """Cambia el recorte de una referencia subida (con su .fuente.json): parte del archivo original, no del recortado, y
    rehace el RefMod con el mismo nombre, modo y tramo (Fantastic lo sobrescribe y su caché lo nota por la fecha). `recorte`:
    {x, y, w, h} de 0 a 1, o null para el cuadro entero."""
    import os
    nombre = d.get("nombre") or ""
    f = fuente({"nombre": nombre})
    if not f.get("items"):
        raise ErrorUsuario("errores.sin_fuente", nombre=nombre)
    items = [dict(x) for x in f["items"]]
    r = d.get("recorte")
    for x in items:
        x.pop("crop", None)
        if r and all(k in r for k in "xywh") and (float(r["w"]) < 0.999 or float(r["h"]) < 0.999):
            x["crop"] = {k: round(min(1.0, max(0.0, float(r[k]))), 4) for k in "xywh"}
    _cola_libre("crear_subidas")
    t0 = time.time()
    _crear_refmod(os.path.basename(nombre), os.path.dirname(nombre), items, f.get("concepto") or "style",
                  _DESC_SUBIDA.format(papel=f.get("modo") or "-"), "", "", "crear_subidas", "edit_prompt_llm_referencia",
                  f.get("modo") or "completo", _fotogramas_clip(items[0]))
    _apuntar_fuente(_raiz_refmods(), nombre, items, f.get("modo") or "completo", f.get("concepto") or "style")
    return {"nombre": nombre, "recorte": items[0].get("crop"), "segundos": round(time.time() - t0, 1)}


def cambiar_modo(d):
    """Rehace un RefMod en el otro modo (completo ↔ comprimido) con su misma fuente: crea «<nombre>__comprimido» o
    «<nombre>__completo» (o lo reutiliza si ya existe) y devuelve su nombre; el editor cambia la tarjeta del Stack."""
    import os
    import re
    nombre, modo = d.get("nombre") or "", d.get("modo")
    if modo not in MODOS:
        raise ErrorUsuario("errores.modo_no_vale")
    f = fuente({"nombre": nombre})
    if not f.get("items"):
        raise ErrorUsuario("errores.sin_fuente", nombre=nombre)
    raiz = _raiz_refmods()
    base = re.sub(r"__(comprimido|completo)$", "", nombre)
    destino = base if f.get("modo") == modo else f"{base}__{modo}"
    if f.get("modo") != modo and fuente({"nombre": base}).get("modo") == modo:
        destino = base                                   # el original ya estaba en ese modo
    if not os.path.exists(os.path.join(raiz, destino + ".safetensors")):
        _cola_libre("crear_subidas")
        _crear_refmod(os.path.basename(destino), os.path.dirname(destino), f["items"], f.get("concepto") or "style",
                      _DESC_SUBIDA.format(papel=modo), "", "", "crear_subidas", "edit_prompt_llm_referencia", modo,
                      _fotogramas_clip(f["items"][0]))
        _apuntar_fuente(raiz, destino, f["items"], modo, f.get("concepto") or "style")
    return {"nombre": destino, "modo": modo}


# ------------------------------------------------------------------ tapar: la referencia sin cara, pelo o texto (SAM 3.1)
# Encender «tapar» en la ficha de una referencia: SAM hace las máscaras (por /prompt), nucleo.tapar_imagen tapa la foto,
# se guarda en input/minimax_h3/tapado/ y se crea un RefMod hermano «<original>__tapado_<huella>» con su <nombre>.tapado.json
# (de qué original sale y con qué opciones). El editor cambia la tarjeta del Stack. Con las mismas opciones, el nombre es el
# mismo y se reutiliza sin SAM ni GPU. planos/4 El editor.md, «Tapar».
def _vram_libre(gb=3.0, max_s=20):
    """llama suelta la VRAM unos 5 s después de su última llamada: SAM espera a que quepa (como esperar_vram del nodo)."""
    try:
        import torch
        t = time.time()
        while time.time() - t < max_s:
            if torch.cuda.mem_get_info()[0] / 2 ** 30 >= gb:
                return
            time.sleep(0.5)
    except Exception:
        pass


def _info_tapado(nombre, raiz):
    import json
    import os
    try:
        with open(os.path.join(raiz, nombre + ".tapado.json")) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def tapados(d=None):
    """{RefMod tapado: su .tapado.json (original, cosas, palabras, forma, fuentes…)}: el editor sabe qué tarjeta es tapada."""
    import glob
    import json
    import os
    raiz, out = _raiz_refmods(), {}
    for f in glob.glob(os.path.join(raiz, "**", "*.tapado.json"), recursive=True):
        try:
            with open(f) as fh:
                out[os.path.relpath(f, raiz)[:-len(".tapado.json")].replace(os.sep, "/")] = json.load(fh)
        except Exception:
            pass
    return {"tapados": out}


def _fuentes_tapar(original, raiz, n_fotos=1):
    """Las fotos (en input/) de las que se hace el tapado de un RefMod, de dónde salen ((clave, datos)) y un aviso ((clave,
    datos) o None) si hay que usar su vista
    previa (512 px de alto). Orden: las fotos de su .cajita.json; la foto de input/minimax_h3 con el mismo nombre y la misma
    proporción que la vista previa; la vista previa .png junto al .safetensors (copiada a input/minimax_h3/tapado/fuentes/)."""
    import os
    import shutil
    import folder_paths
    from PIL import Image
    ya = cajitas()["cajitas"].get(original)
    if ya:
        return [x["file"][:-len(" [input]")] for x in ya], ("tapar.origen.cajita", {}), None
    if n_fotos > 1:
        raise ErrorUsuario("errores.tapar.cajita_sin_fotos", original=original, n=n_fotos)
    previa = next((os.path.join(raiz, original + e) for e in (".png", ".jpg", ".webp")
                   if os.path.isfile(os.path.join(raiz, original + e))), None)
    pw = ph = None
    if previa:
        with Image.open(previa) as im:
            pw, ph = im.size
    entrada, tronco = folder_paths.get_input_directory(), os.path.basename(original)
    for x in medios()["fotos"]:
        rel = x["file"][:-len(" [input]")]
        if os.path.splitext(x["name"])[0] != tronco or "/tapado" in "/" + x["carpeta"]:
            continue
        with Image.open(os.path.join(entrada, rel)) as im:
            w, h = im.size
        if not previa or abs(w / h - pw / ph) < 0.02:
            return [rel], ("tapar.origen.foto", {"ruta": rel, "w": w, "h": h}), None
    if not previa:
        raise ErrorUsuario("errores.sin_foto", nombre=original)
    rel = f"minimax_h3/tapado/fuentes/{original.replace('/', '__')}{os.path.splitext(previa)[1]}"
    destino = os.path.join(entrada, rel)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    shutil.copyfile(previa, destino)
    return [rel], ("tapar.origen.previa", {"w": pw, "h": ph}), ("tapar.aviso.previa", {"w": pw, "h": ph, "tronco": tronco})


def _preparar_tapado(d):
    """Lo común a la vista previa y al tapado: original, palabras, forma, fotos fuente, huella y nombre del tapado."""
    import os
    import folder_paths
    raiz = _raiz_refmods()
    original = d["refmod"]
    info = _info_tapado(original, raiz)
    if info:                                     # piden tapar un tapado: se parte siempre del original
        original = info["original"]
    palabras = nucleo.palabras_tapar(d.get("cosas"), d.get("libre"))
    if not palabras:
        raise ErrorUsuario("errores.tapar.elige")
    forma = d.get("forma") if d.get("forma") in nucleo.FORMAS_TAPAR else "difuminar"
    rels, origen, aviso = _fuentes_tapar(original, raiz, int(d.get("n_fotos") or 1))
    # para enseñar: en el idioma de la ventana; para guardar en .tapado.json: en español, con su clave (el editor la traduce)
    texto = lambda x, idioma: i18n.t(x[0], idioma, **x[1]) if x else ""
    a_mano = lambda x: {"clave": x[0], "datos": x[1]} if x else None
    entrada = folder_paths.get_input_directory()
    datos = {}
    for r in rels:
        with open(os.path.join(entrada, r), "rb") as fh:
            datos[r] = fh.read()
    nombre = nucleo.nombre_tapado(original, nucleo.huella_tapado(original, [datos[r] for r in rels], palabras, forma))
    return {"raiz": raiz, "original": original, "palabras": palabras, "forma": forma, "rels": rels, "datos": datos,
            "origen": texto(origen, d.get("idioma")), "aviso": texto(aviso, d.get("idioma")),
            "origen_i18n": a_mano(origen), "aviso_i18n": a_mano(aviso),
            "origen_es": texto(origen, "es"), "aviso_es": texto(aviso, "es"),
            "nombre": nombre, "existe": os.path.isfile(os.path.join(raiz, nombre + ".safetensors"))}


def _mascaras(p):
    """Las máscaras de SAM de cada (foto, palabra): de la caché si ya se hicieron; si no, todas en un solo /prompt."""
    import os
    import folder_paths
    from PIL import Image
    faltan = [(r, w) for r in p["rels"] for w in p["palabras"] if not os.path.isfile(nucleo.ruta_mascara(p["datos"][r], w))]
    t = time.time()
    if faltan:
        _cola_libre("buscar_sam")
        _vram_libre()
        grafo, salidas = nucleo.grafo_sam(faltan)
        out = _ejecutar(grafo, "mascaras", "edit_prompt_llm_sam", max_s=300)
        os.makedirs(nucleo.CACHE_TAPAR, exist_ok=True)
        for (r, w), nodo in salidas.items():
            im = out[nodo]["images"][0]
            src = os.path.join(folder_paths.get_temp_directory(), im.get("subfolder", ""), im["filename"])
            Image.open(src).convert("L").save(nucleo.ruta_mascara(p["datos"][r], w))
    mascaras = {(r, w): Image.open(nucleo.ruta_mascara(p["datos"][r], w)).convert("L") for r in p["rels"] for w in p["palabras"]}
    return mascaras, len(faltan), round(time.time() - t, 1)


def _imagenes_tapadas(p):
    """Tapa cada foto fuente y la guarda en input/minimax_h3/tapado/<tronco>__tapado_<huella>[_k].png (nombre estable)."""
    import io
    import os
    import folder_paths
    from PIL import Image
    mascaras, n_sam, s_sam = _mascaras(p)
    entrada, tronco = folder_paths.get_input_directory(), os.path.basename(p["nombre"])
    imagenes, encontrado = [], {}
    for k, r in enumerate(p["rels"]):
        img = Image.open(io.BytesIO(p["datos"][r])).convert("RGB")
        ms = [mascaras[(r, w)] for w in p["palabras"]]
        for w, m in zip(p["palabras"], ms):       # cuánto de la foto ocupa cada cosa (0 % = SAM no la encontró)
            pct = sum(m.point(lambda v: 1 if v > 127 else 0).getdata()) / (m.width * m.height) * 100
            encontrado[w] = round(max(encontrado.get(w, 0), pct), 1)
        rel = f"minimax_h3/tapado/{tronco}{'' if len(p['rels']) == 1 else f'_{k + 1}'}.png"
        os.makedirs(os.path.join(entrada, "minimax_h3", "tapado"), exist_ok=True)
        nucleo.tapar_imagen(img, nucleo.union_mascaras(ms), p["forma"]).save(os.path.join(entrada, rel))
        imagenes.append(rel)
    return imagenes, encontrado, n_sam, s_sam


def tapar_previa(d):
    """Vista previa del tapado (sin crear el RefMod). d: refmod, cosas, libre, forma, n_fotos. Si ese tapado ya existe,
    lo dice («existe») y enseña sus fotos, sin SAM."""
    t0 = time.time()
    p = _preparar_tapado(d)
    base = {"nombre": p["nombre"], "original": p["original"], "palabras": p["palabras"], "origen": p["origen"], "aviso": p["aviso"],
            "origen_i18n": p["origen_i18n"], "aviso_i18n": p["aviso_i18n"]}
    if p["existe"]:
        info = _info_tapado(p["nombre"], p["raiz"]) or {}
        return {**base, "existe": True, "imagenes": info.get("imagenes", []), "encontrado": info.get("encontrado", {}),
                "sam": 0, "segundos": round(time.time() - t0, 2)}
    imagenes, encontrado, n_sam, s_sam = _imagenes_tapadas(p)
    return {**base, "existe": False, "imagenes": imagenes, "encontrado": encontrado, "sam": n_sam, "segundos_sam": s_sam,
            "segundos": round(time.time() - t0, 1)}


def tapar(d):
    """Crea (o reutiliza) el RefMod tapado. d: refmod, cosas, libre, forma, n_fotos, concepto, descripcion, apariencia.
    Devuelve {name, original, reutilizado, segundos…}. El editor cambia después la tarjeta del Stack."""
    import json
    import os
    t0 = time.time()
    p = _preparar_tapado(d)
    if p["existe"]:
        return {"name": p["nombre"], "original": p["original"], "reutilizado": True, "segundos": round(time.time() - t0, 2),
                "aviso": p["aviso"], "aviso_i18n": p["aviso_i18n"],
                "encontrado": (_info_tapado(p["nombre"], p["raiz"]) or {}).get("encontrado", {})}
    imagenes, encontrado, n_sam, s_sam = _imagenes_tapadas(p)
    if p["palabras"] and all(encontrado.get(w, 0) == 0 for w in p["palabras"]):
        raise ErrorUsuario("errores.tapar.nada", palabras=p["palabras"])
    items = [_item_media(r) for r in imagenes]
    _cola_libre("crear_tapada")
    t1 = time.time()
    carpeta, tronco = os.path.dirname(p["nombre"]), os.path.basename(p["nombre"])
    desc = " · ".join(x for x in (d.get("descripcion") or "", _DESC_TAPADO.format(palabras=", ".join(p["palabras"]), forma=p["forma"])) if x)
    _crear_refmod(tronco, carpeta, items, d.get("concepto") or "clothing", desc, "", d.get("apariencia") or "",
                  "crear_tapada", "edit_prompt_llm_referencia")
    info = {"original": p["original"], "cosas": d.get("cosas") or [], "libre": d.get("libre") or "", "palabras": p["palabras"],
            "forma": p["forma"], "fuentes": p["rels"], "origen": p["origen_es"], "aviso": p["aviso_es"],
            "origen_i18n": p["origen_i18n"], "aviso_i18n": p["aviso_i18n"], "imagenes": imagenes,
            "encontrado": encontrado, "creada": time.strftime("%Y-%m-%d %H:%M:%S")}
    base = os.path.join(p["raiz"], p["nombre"])
    with open(base + ".tapado.json", "w") as fh:
        json.dump(info, fh, ensure_ascii=False, indent=1)
    if len(items) > 1:                            # una cajita tapada apunta sus fotos tapadas, como cualquier cajita
        with open(base + ".cajita.json", "w") as fh:
            json.dump({"fotos": items, "creada": info["creada"]}, fh, ensure_ascii=False, indent=1)
    return {"name": p["nombre"], "original": p["original"], "reutilizado": False, "encontrado": encontrado, "sam": n_sam,
            "segundos_sam": s_sam, "segundos_refmod": round(time.time() - t1, 1), "segundos": round(time.time() - t0, 1),
            "aviso": p["aviso"], "aviso_i18n": p["aviso_i18n"], "imagenes": imagenes}


# acción → (función, usa el LLM). Una acción nueva se añade aquí: no hace falta reiniciar ComfyUI.
ACCIONES = {
    "montar": (montar, False),
    "historia": (historia, True),
    "tomas": (tomas, True),
    "describir": (describir, True),
    "traducir": (traducir, True),
    "medios": (medios, False),
    "cajitas": (cajitas, False),
    "video_de": (video_de, False),
    "video_info": (video_info, False),
    "fuente": (fuente, False),
    "cambiar_modo": (cambiar_modo, False),
    "recortar": (recortar, False),
    "crear_cajita": (crear_cajita, False),
    "subir_refmods": (subir_refmods, False),
    "tapados": (tapados, False),
    "tapar_previa": (tapar_previa, False),
    "tapar": (tapar, False),
    "audios": (audios, False),
    "audio_info": (audio_info, False),
    "audio_ventana": (audio_ventana, False),
    "audio_recortar": (audio_recortar, False),
}
