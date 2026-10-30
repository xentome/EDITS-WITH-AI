"""Generar el video de MAX EDITOR: copia los valores de la ventana en la plantilla H3, quita nuestro nodo y lo
manda a ComfyUI con el SDK oficial de Comfy (comfy_sdk) a través del comfy-api-proxy.

Contrato (planos/fases/6 La app MAX EDITOR.md):
  plantilla() -> dict                         la plantilla en formato API (una copia)
  preparar(valores, opciones) -> dict         el grafo listo para ComfyUI, sin lanzar nada (sirve para probar)
  iniciar(valores, opciones) -> str           lanza en un hilo y devuelve el id del trabajo
  estado(id) -> dict                          {"estado", "avance", "paso", "pasos", "nodo", "mensaje", "video", "segundos"}
  cancelar(id) -> dict                        pide al proxy que cancele ese trabajo (solo ese, no interrumpe otros)
  historial() -> list                         lo de app/salidas/historial.jsonl, lo más nuevo al final
  salud() -> dict                             {"comfyui": bool, "proxy": bool}

Usa hilos (threading) y el cliente síncrono `Comfy`: el SDK síncrono es el que ya probamos (prueba_sdk.py) y así
el servidor aiohttp solo llama funciones rápidas; nada de esto bloquea su bucle salvo `iniciar`, que tarda lo que
una petición corta de salud (2 s como mucho).

`iniciar` nunca lanza excepciones: si algo falla (no hay prompt, ComfyUI no responde…) el trabajo nace en
«error» con el mensaje, y `estado(id)` lo cuenta. Así el servidor siempre recibe un id.
"""
from __future__ import annotations

import copy
import json
import math
import os
import threading
import time
import urllib.request
import uuid
from datetime import datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA_PLANTILLA = os.path.join(AQUI, "plantillas", "edit_h3.api.json")
SALIDAS = os.path.join(AQUI, "salidas")
HISTORIAL = os.path.join(SALIDAS, "historial.jsonl")
RUTA_CONFIG = os.path.join(AQUI, "config.json")

# los nodos que buscamos por su tipo, no por número, para que la plantilla pueda cambiar
NODO_PROMPT_DEL_EDIT = "PromptDelEdit"
NODO_BUILDER = "MiniMaxH3PromptBuilder"
NODO_RUIDO = "RandomNoise"
NODO_GUARDAR = "SaveVideo"
NODO_AUDIO = "LoadAudio"
QUITAR = {NODO_PROMPT_DEL_EDIT, "PreviewAny"}  # ComfyUI no necesita nuestro nodo ni las vistas previas para generar


class ErrorGenerar(Exception):
    """Un error con un texto que se puede enseñar tal cual a quien usa la app."""


# ---------------------------------------------------------------- configuración

def config() -> dict:
    """Las direcciones, en el mismo orden que servidor.py: app/config.json, encima config.local.json y encima las
    variables MAX_EDITOR_PROXY_URL / MAX_EDITOR_COMFYUI_URL. Sin nada de eso, COMFY_BASE_URL o las de siempre."""
    c = {}
    for ruta in (RUTA_CONFIG, os.path.join(AQUI, "config.local.json")):
        try:
            with open(ruta, encoding="utf-8") as f:
                c.update(json.load(f) or {})
        except (OSError, ValueError):
            pass
    proxy = os.environ.get("MAX_EDITOR_PROXY_URL") or c.get("proxy_url") or os.environ.get("COMFY_BASE_URL")
    comfyui = os.environ.get("MAX_EDITOR_COMFYUI_URL") or c.get("comfyui_url")
    return {"proxy_url": (proxy or "http://127.0.0.1:8199").rstrip("/"),
            "comfyui_url": (comfyui or "http://127.0.0.1:8188").rstrip("/")}


def _responde(url: str, espera: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=espera) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


def salud() -> dict:
    c = config()
    return {"comfyui": _responde(c["comfyui_url"] + "/system_stats"), "proxy": _responde(c["proxy_url"] + "/api/v2/health")}


# ---------------------------------------------------------------- plantilla y grafo

_plantilla_cache: dict | None = None


def plantilla() -> dict:
    global _plantilla_cache
    if _plantilla_cache is None:
        with open(RUTA_PLANTILLA, encoding="utf-8") as f:
            _plantilla_cache = json.load(f)
    return copy.deepcopy(_plantilla_cache)


def es_enlace(v) -> bool:
    """En formato API un enlace es [id_origen, salida]."""
    return isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and isinstance(v[1], (int, float))


def _por_tipo(grafo: dict, tipo: str) -> list[str]:
    return [nid for nid, n in grafo.items() if n.get("class_type") == tipo]


def _copiar_valores(grafo: dict, valores: dict) -> None:
    """Solo entradas que ya existen y no son enlaces. Los botones (valor None en la plantilla) no se tocan."""
    for nid, campos in (valores or {}).items():
        nodo = grafo.get(str(nid))
        if not nodo or not isinstance(campos, dict):
            continue
        entradas = nodo.setdefault("inputs", {})
        for nombre, valor in campos.items():
            if nombre not in entradas:
                continue
            actual = entradas[nombre]
            if actual is None or es_enlace(actual) or es_enlace(valor):
                continue
            entradas[nombre] = valor


def _estado(grafo: dict) -> dict:
    """El estado que guarda la ventana en el nodo PromptDelEdit (vacío si no hay o está dañado)."""
    for nid in _por_tipo(grafo, NODO_PROMPT_DEL_EDIT):
        bruto = grafo[nid].get("inputs", {}).get("estado") or "{}"
        try:
            return json.loads(bruto) if isinstance(bruto, str) else dict(bruto)
        except ValueError:
            return {}
    return {}


# el audio del video (27 oct): «cancion» (por defecto: la del LoadAudio, la que eligió el usuario; H3 solo la usa de guía)
# o «modelo» (lo que genera H3, decodificado por el VAEDecodeAudio). Un proyecto viejo, sin el campo, va con la canción.
AUDIOS_SALIDA = ("cancion", "modelo")
NODO_VIDEO, NODO_DECODIFICAR_AUDIO = "CreateVideo", "VAEDecodeAudio"


def audio_salida(grafo: dict) -> str:
    a = _estado(grafo).get("audio_salida")
    return a if a in AUDIOS_SALIDA else "cancion"


def _poner_audio(grafo: dict, cual: str) -> None:
    """Con «modelo», el CreateVideo toma el audio del VAEDecodeAudio (el de H3); con «cancion», se queda como en la plantilla."""
    if cual != "modelo":
        return
    deco = _por_tipo(grafo, NODO_DECODIFICAR_AUDIO)
    if not deco:
        raise ErrorGenerar(f"la plantilla no tiene {NODO_DECODIFICAR_AUDIO}: no puedo usar el audio de H3")
    for nid in _por_tipo(grafo, NODO_VIDEO):
        grafo[nid]["inputs"]["audio"] = [deco[0], 0]


# sin canción (28 oct): se puede generar solo con el prompt; el sonido lo inventa H3 a partir del de la línea «Sonido»
NODO_GUIA = "MiniMaxH3AddGuide"


def _sin_cancion(grafo: dict) -> bool:
    audios = _por_tipo(grafo, NODO_AUDIO)
    return bool(audios) and all(not str(grafo[nid]["inputs"].get("audio") or "").strip() for nid in audios)


def _quitar_cancion(grafo: dict) -> None:
    """Quita el LoadAudio vacío. El AddGuide que solo anclaba la canción se salta (quien lo usaba recibe su `positive`);
    las demás entradas que apuntaban al LoadAudio (audio_1 del Builder…) las borra _quitar_nodos."""
    audios = set(_por_tipo(grafo, NODO_AUDIO))
    for nid in _por_tipo(grafo, NODO_GUIA):
        entradas = grafo[nid]["inputs"]
        if not (es_enlace(entradas.get("audio")) and entradas["audio"][0] in audios) or es_enlace(entradas.get("image")):
            continue
        for nodo in grafo.values():
            for k, v in nodo.get("inputs", {}).items():
                if es_enlace(v) and v[0] == nid:
                    nodo["inputs"][k] = entradas["positive"]
        grafo.pop(nid)
    for nid in audios:
        grafo.pop(nid)


def _leer_prompt(grafo: dict) -> str:
    for nid in _por_tipo(grafo, NODO_PROMPT_DEL_EDIT):
        bruto = grafo[nid].get("inputs", {}).get("estado") or "{}"
        try:
            estado = json.loads(bruto) if isinstance(bruto, str) else dict(bruto)
        except ValueError:
            raise ErrorGenerar("el estado de la ventana está dañado: no se puede leer el prompt")
        prompt = (estado.get("prompt") or "").strip()
        if prompt:
            return prompt
    raise ErrorGenerar("no hay prompt: escribe el plan en la ventana primero")


def _quitar_nodos(grafo: dict) -> None:
    """Quita PromptDelEdit y PreviewAny y borra toda entrada que apunte a ellos (o a un nodo que no existe).
    No se usa Workflow.remove_node del SDK: «redirige» los enlaces a la única entrada del nodo quitado, y como
    el audio del PromptDelEdit viene del LoadAudio, el prompt_text del Builder acabaría recibiendo el audio."""
    for nid in [n for n, d in grafo.items() if d.get("class_type") in QUITAR]:
        grafo.pop(nid)
    for nodo in grafo.values():
        entradas = nodo.get("inputs", {})
        for nombre in [k for k, v in entradas.items() if es_enlace(v) and v[0] not in grafo]:
            del entradas[nombre]


def _reponer_tramo(grafo: dict) -> None:
    """(30 oct) El LoadAudio apunta al tramo cortado (edit_tramo_<hash>.wav), que vive en ComfyUI/input del PC donde se hizo.
    En otro PC o en un pod no está y ComfyUI dice «Invalid audio file»: se vuelve a cortar de la canción original
    (estado.audio.original) desde el mismo inicio y con la duración del edit, con el mismo nombre."""
    import retocar
    base = os.path.join(retocar.comfyui_dir(), "input")
    a = _estado(grafo).get("audio") or {}
    for nid in _por_tipo(grafo, NODO_AUDIO):
        nombre = str(grafo[nid]["inputs"].get("audio") or "").strip()
        destino = retocar._dentro(base, nombre)
        if not nombre.startswith("edit_tramo_") or not destino or os.path.isfile(destino):
            continue
        original = retocar._dentro(base, str(a.get("original") or ""))
        if not original or not os.path.isfile(original):
            raise ErrorGenerar(f"falta el tramo de audio {nombre} y su canción original ({a.get('original') or '?'}) "
                               "no está en ComfyUI/input: súbela o elige otra canción")
        dur = next((float(grafo[p]["inputs"].get("duracion_s") or 0) for p in _por_tipo(grafo, NODO_PROMPT_DEL_EDIT)), 0.0)
        if dur <= 0:
            raise ErrorGenerar(f"falta el tramo de audio {nombre} y no sé cuánto dura el edit para volver a cortarlo")
        try:
            retocar._ffmpeg("-ss", f"{float(a.get('inicio_s') or 0):.4f}", "-t", f"{dur:.4f}", "-i", original, "-vn",
                            "-c:a", "pcm_s16le", "-ac", "2", "-f", "wav", destino + ".tmp")
        except retocar.ErrorGenerar as exc:
            raise ErrorGenerar(f"no pude volver a cortar el tramo de audio {nombre}: {exc}")
        os.replace(destino + ".tmp", destino)


MAX_LORAS = 8


def poner_loras(grafo: dict, loras) -> list:
    """(30 oct) Los LoRAs del proyecto [{nombre, fuerza}] sobre el modelo de H3, como en los workflows del usuario: una
    cadena de LoraLoaderModelOnly justo detrás del UNETLoader, y todo lo que leía el modelo pasa a leer el último LoRA.
    Sirve para Generar, Retocar y Extender (los tres llevan el UNETLoader de H3). Devuelve los que se pusieron."""
    puestos = []
    for x in (loras or [])[:MAX_LORAS]:
        nombre = str((x or {}).get("nombre") or "").strip()
        try:
            fuerza = max(-2.0, min(2.0, float((x or {}).get("fuerza", 1))))
        except (TypeError, ValueError):
            fuerza = 1.0
        if nombre and fuerza:
            puestos.append({"nombre": nombre, "fuerza": round(fuerza, 3)})
    if not puestos:
        return []
    for unet in _por_tipo(grafo, "UNETLoader"):
        ultimo = [unet, 0]
        for i, x in enumerate(puestos):
            nid = f"{unet}_lora{i + 1}"
            grafo[nid] = {"class_type": "LoraLoaderModelOnly", "_meta": {"title": f"LoRA {i + 1}"},
                          "inputs": {"model": ultimo, "lora_name": x["nombre"], "strength_model": x["fuerza"]}}
            ultimo = [nid, 0]
        for nid, nodo in grafo.items():
            if nid.startswith(f"{unet}_lora"):
                continue
            for k, v in (nodo.get("inputs") or {}).items():
                if es_enlace(v) and v[0] == unet and v[1] == 0:
                    nodo["inputs"][k] = list(ultimo)
    return puestos


def preparar(valores: dict, opciones: dict | None = None) -> dict:
    """El grafo que se manda a ComfyUI. Lanza ErrorGenerar con un texto claro si falta algo."""
    opciones = opciones or {}
    grafo = plantilla()
    _copiar_valores(grafo, valores)
    _reponer_tramo(grafo)
    opciones["_loras"] = poner_loras(grafo, _estado(grafo).get("loras"))
    prompt = _leer_prompt(grafo)
    sin_cancion = _sin_cancion(grafo)
    opciones["_audio"] = None if sin_cancion else cancion_de(_estado(grafo))  # lo anota _despues_edit (la fila del historial)
    # antes de quitar el PromptDelEdit, que guarda la opción; sin canción, el video lleva el audio de H3 (el de tu prompt)
    _poner_audio(grafo, "modelo" if sin_cancion else audio_salida(grafo))
    if sin_cancion:
        _quitar_cancion(grafo)

    builders = _por_tipo(grafo, NODO_BUILDER)
    if not builders:
        raise ErrorGenerar(f"la plantilla no tiene ningún {NODO_BUILDER}")
    quitados = {nid for nid, d in grafo.items() if d.get("class_type") in QUITAR}
    for nid in builders:
        actual = grafo[nid]["inputs"].get("prompt_text")
        # el texto entra donde antes llegaba el enlace desde nuestro nodo (o si ya era texto)
        if not es_enlace(actual) or actual[0] in quitados:
            grafo[nid]["inputs"]["prompt_text"] = prompt
    _quitar_nodos(grafo)

    semilla = opciones.get("semilla")
    if semilla is not None:
        for nid in _por_tipo(grafo, NODO_RUIDO):
            grafo[nid]["inputs"]["noise_seed"] = int(semilla)
    prefijo = opciones.get("prefijo")
    if prefijo:
        for nid in _por_tipo(grafo, NODO_GUARDAR):
            grafo[nid]["inputs"]["filename_prefix"] = str(prefijo)
    _guardar_latente(grafo)
    return grafo


# el latente (28 oct, planos/fases/12): Extender lo usa para seguir el video sin volver a codificar el mp4 (pierde color).
# MpiSaveLatent (ComfyUi-MpiNodes) sabe guardar el latente AV de H3; el SaveLatent del núcleo no. Si no está, no se guarda.
NODO_GUARDAR_LATENTE = "MpiSaveLatent"
NODO_LATENTE_PARA = ("VAEDecode", NODO_DECODIFICAR_AUDIO)
_nodos_cache: dict[str, bool] = {}


def hay_nodo(tipo: str) -> bool:
    if tipo not in _nodos_cache:
        try:
            with urllib.request.urlopen(f"{config()['comfyui_url']}/object_info/{tipo}", timeout=3) as r:
                _nodos_cache[tipo] = bool((json.load(r) or {}).get(tipo))
        except Exception:
            return False                       # ComfyUI no responde: no se recuerda, se vuelve a mirar la próxima vez
    return _nodos_cache[tipo]


def _guardar_latente(grafo: dict) -> None:
    """Mete un MpiSaveLatent entre el sampler y los decodificadores (el mismo latente, con «continue»)."""
    decos = [nid for nid, n in grafo.items() if n.get("class_type") in NODO_LATENTE_PARA and es_enlace(n["inputs"].get("samples"))]
    if not decos or not hay_nodo(NODO_GUARDAR_LATENTE):
        return
    origen = grafo[decos[0]]["inputs"]["samples"]
    nid = "900"
    grafo[nid] = {"class_type": NODO_GUARDAR_LATENTE, "inputs": {
        "samples": origen, "filename": f"max_editor_{datetime.now():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:6]}", "boolean": True}}
    for d in decos:
        if grafo[d]["inputs"]["samples"] == origen:
            grafo[d]["inputs"]["samples"] = [nid, 0]


def latente_de(grafo: dict) -> str | None:
    for nid in _por_tipo(grafo, NODO_GUARDAR_LATENTE):
        return grafo[nid]["inputs"].get("filename")
    return None


def cancion_de(estado: dict) -> dict | None:
    """La canción con la que se hizo el video (para Extender): {original, inicio_s}, o None si no tenía canción.
    (29 oct, Jonathan) También con «Audio de H3»: la canción guió a H3 igual, y «Audio de entrada» de Extender la continúa
    desde donde acaba el video. Antes se anotaba None y Extender creía que no había canción."""
    a = estado.get("audio") or {}
    if not a.get("original"):
        return None
    try:
        return {"original": a["original"], "inicio_s": float(a.get("inicio_s") or 0)}
    except (TypeError, ValueError):
        return None


def _semilla_de(grafo: dict):
    for nid in _por_tipo(grafo, NODO_RUIDO):
        return grafo[nid]["inputs"].get("noise_seed")
    return None


# ---------------------------------------------------------------- errores legibles

def _texto_error(exc: Exception, c: dict) -> str:
    try:
        import httpx
        if isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout)):
            return f"el proxy de ComfyUI no responde en {c['proxy_url']}: arráncalo (app/arrancar.sh)"
    except ImportError:
        pass
    if isinstance(exc, ErrorGenerar):
        return str(exc)
    mensaje = getattr(exc, "message", None) or str(exc) or type(exc).__name__
    codigo = getattr(exc, "code", None)
    detalles = getattr(exc, "details", None) or {}
    partes = []
    for nid, err in ((detalles.get("node_errors") or {}) if isinstance(detalles, dict) else {}).items():
        tipo = err.get("class_type", "")
        for e in err.get("errors") or []:
            partes.append(f"nodo {nid} ({tipo}): {e.get('message', '')} {e.get('details', '')}".strip())
    texto = mensaje + ("\n" + "\n".join(partes) if partes else "")
    if codigo == "upstream_unreachable":
        texto = f"ComfyUI no responde en {c['comfyui_url']}: {texto}"
    if "value_not_in_list" in texto or "not in list" in texto:
        texto += "\n(¿falta un modelo o un archivo? mira app/plantillas/LEEME.md)"
    return texto


def _texto_fallo(error) -> str:
    """job.error del SDK: {code, message, node_id, class_type, traceback}."""
    if error is None:
        return "el trabajo falló sin explicación"
    nodo = f"nodo {error.node_id} ({error.class_type}): " if getattr(error, "node_id", None) else ""
    texto = f"{nodo}{error.message}"
    if "No such file" in texto or "not found" in texto.lower():
        texto += "\n(¿falta un modelo o un archivo? mira app/plantillas/LEEME.md)"
    return texto


# ---------------------------------------------------------------- trabajos

_trabajos: dict[str, dict] = {}
_jobs: dict[str, object] = {}  # id -> Job del SDK, para cancelar
_cerrojo = threading.Lock()
_cerrojo_cliente = threading.Lock()


def _nuevo(estado: str = "en_cola", mensaje: str = "") -> str:
    tid = uuid.uuid4().hex[:12]
    with _cerrojo:
        _trabajos[tid] = {"id": tid, "estado": estado, "avance": 0.0, "paso": None, "pasos": None, "nodo": None,
                          "mensaje": mensaje, "video": None, "segundos": 0.0, "semilla": None,
                          "_t0": time.time(), "_fin": None if estado != "error" else time.time()}
    return tid


def _poner(tid: str, **cambios) -> None:
    with _cerrojo:
        t = _trabajos.get(tid)
        if t is not None:
            t.update(cambios)
            if cambios.get("estado") in ("listo", "error"):
                t["_fin"] = time.time()


def _cliente(c: dict):
    # el SDK lee la dirección de COMFY_BASE_URL al crear el cliente; no acepta un base_url
    from comfy_sdk import Comfy
    with _cerrojo_cliente:
        os.environ["COMFY_BASE_URL"] = c["proxy_url"]
        return Comfy(timeout=60, client_info="max-editor")


def iniciar(valores: dict, opciones: dict | None = None) -> str:
    opciones = dict(opciones or {})
    c = config()
    try:
        grafo = preparar(valores, opciones)
        comprobar_servicios(c)
    except Exception as exc:
        return _nuevo("error", _texto_error(exc, c))
    return lanzar(grafo, opciones, c, despues=_despues_edit)


def comprobar_servicios(c: dict) -> None:
    s = salud()
    if not s["comfyui"]:
        raise ErrorGenerar(f"ComfyUI no responde en {c['comfyui_url']}: ábrelo y vuelve a probar")
    if not s["proxy"]:
        raise ErrorGenerar(f"el proxy de ComfyUI no responde en {c['proxy_url']}: arráncalo (app/arrancar.sh)")


def lanzar(grafo: dict, opciones: dict, c: dict, despues, extra: dict | None = None) -> str:
    """Lo común de generar y retocar (retocar.py): un trabajo nuevo y un hilo que manda el grafo por el SDK.
    `despues(tid, grafo, job, opciones) -> (archivo, fila)` baja el video del job a app/salidas y dice qué se anota.
    Antes, los modelos que el usuario eligió en «🧩 Modelos» (modelos.py) sustituyen a los de la plantilla."""
    import modelos
    modelos.aplicar(grafo)
    tid = _nuevo()
    _poner(tid, semilla=_semilla_de(grafo), **(extra or {}))
    threading.Thread(target=_correr, args=(tid, grafo, opciones, c, despues), name=f"generar-{tid}", daemon=True).start()
    return tid


def videos_del_job(job, grafo: dict, tipos=(NODO_GUARDAR, "VHS_VideoCombine")) -> list:
    salidas = [o for tipo in tipos for nid in _por_tipo(grafo, tipo) for o in job.get_outputs(nid)]
    return [o for o in salidas if str(o.content_type).startswith("video") or o.name.lower().endswith((".mp4", ".webm", ".mov"))]


def _despues_edit(tid: str, grafo: dict, job, opciones: dict):
    videos = videos_del_job(job, grafo, (NODO_GUARDAR,))
    if not videos:
        raise ErrorGenerar("ComfyUI terminó pero no devolvió ningún video")
    os.makedirs(SALIDAS, exist_ok=True)
    o = videos[0]
    ext = os.path.splitext(o.name)[1] or ".mp4"
    semilla = _semilla_de(grafo)
    archivo = f"edit_{datetime.now():%Y%m%d_%H%M%S}_{semilla}{ext}"
    o.to_file(os.path.join(SALIDAS, archivo))
    fila = {"semilla": semilla, "proyecto": opciones.get("proyecto"), "audio": opciones.get("_audio")}
    if not opciones.get("_audio"):
        fila["sin_cancion"] = True             # de verdad sin canción (Extender no busca la del proyecto)
    if opciones.get("_loras"):
        fila["loras"] = opciones["_loras"]
    latente = latente_de(grafo)
    if latente:
        try:
            import retocar
            vi = retocar.info(archivo)
            fila.update(latente=latente, latente_wh=[vi["ancho"], vi["alto"]])
        except Exception:
            pass
    return archivo, fila


vistos_t0: dict[int, float] = {}            # cuándo empezó cada trabajo (por su conjunto de nodos vistos), para _avance


def _avance(grafo: dict, ev, vistos: set) -> float:
    """Avance aproximado de 0 a 1. El «value» del proxy no sirve para todo el grafo (marca 99 % a los 2 s: solo
    cuenta los nodos que ya empezaron), así que se estima por fases, medidas en el render de 22 fotogramas:
    cargar y codificar ≈ 35 % del tiempo, el sampler ≈ 60 % (por pasos) y decodificar y guardar el resto."""
    tipo = grafo.get(ev.current_node or "", {}).get("class_type", "")
    if "Sampler" in tipo and ev.steps:
        return 0.35 + 0.60 * min(ev.step or 0, ev.steps) / ev.steps
    # el MpiSaveLatent (el latente para Extender) pide su latente de forma perezosa: queda «en marcha» desde el principio y
    # el proxy lo da como nodo actual todo el rato, sin pasos ni nodos contados. Entonces se estima por el tiempo: sube
    # rápido al principio y se acerca al 90 % sin llegar (unos 3 min para el 63 %, lo que tarda un render corto)
    if tipo == NODO_GUARDAR_LATENTE:
        return 0.9 * (1 - math.exp(-(time.time() - vistos_t0.get(id(vistos), time.time())) / 180))
    if tipo in ("VAEDecode", "VAEDecodeAudio", "MiniMaxH3FantasticEditComposite", "CreateVideo", NODO_GUARDAR,
                "MVEx_SubjectUncrop", "VHS_VideoCombine"):
        return 0.96
    return min(0.34, 0.35 * len(vistos) / max(1, len(grafo)))


def _correr(tid: str, grafo: dict, opciones: dict, c: dict, despues) -> None:
    from comfy_sdk.events import Progress, StatusChange
    nombres = {nid: n.get("class_type", "") for nid, n in grafo.items()}
    vistos: set[str] = set()
    vistos_t0[id(vistos)] = time.time()
    try:
        cliente = _cliente(c)
        try:
            job = cliente.submit(cliente.workflows.from_json(grafo))
            _poner(tid, job=job.id)          # el prompt_id de ComfyUI: la cola lo busca en su historial si el servidor se para
            with _cerrojo:
                _jobs[tid] = job
                cancelar_ya = _trabajos[tid].get("_cancelar")
            if cancelar_ya:
                job.cancel()
            for ev in job.events():
                if isinstance(ev, StatusChange):
                    if ev.status in ("queued", "pending"):
                        _poner(tid, estado="en_cola", mensaje=f"en cola (puesto {ev.queue_position})" if ev.queue_position else "en cola")
                    elif ev.status in ("running", "in_progress"):
                        _poner(tid, estado="generando", mensaje="generando")
                    elif ev.status == "canceling":
                        _poner(tid, mensaje="cancelando…")
                elif isinstance(ev, Progress):
                    cambios = {"estado": "generando", "paso": ev.step, "pasos": ev.steps}
                    if ev.current_node:
                        cambios["nodo"] = nombres.get(ev.current_node, ev.current_node)
                        vistos.add(ev.current_node)
                    with _cerrojo:
                        cambios["avance"] = max(_trabajos[tid]["avance"], _avance(grafo, ev, vistos))
                    _poner(tid, **cambios)
            job = job.wait()
            if job.status == "canceled":
                _poner(tid, estado="error", mensaje="cancelado", cancelado=True)
                return
            if job.status != "succeeded":
                _poner(tid, estado="error", mensaje=_texto_fallo(job.error))
                return
            archivo, fila = despues(tid, grafo, job, opciones)
        finally:
            cliente.close()
        with _cerrojo:
            segundos = round(time.time() - _trabajos[tid]["_t0"], 1)
        _poner(tid, estado="listo", avance=1.0, mensaje="listo", video=archivo, segundos=segundos)
        _anotar({"id": tid, "fecha": datetime.now().isoformat(timespec="seconds"), "segundos": segundos,
                 "archivo": archivo, "job": job.id, **fila})
    except Exception as exc:
        _poner(tid, estado="error", mensaje=_texto_error(exc, c))
    finally:
        vistos_t0.pop(id(vistos), None)
        with _cerrojo:
            _jobs.pop(tid, None)


def _anotar(fila: dict) -> None:
    os.makedirs(SALIDAS, exist_ok=True)
    with _cerrojo, open(HISTORIAL, "a", encoding="utf-8") as f:
        f.write(json.dumps(fila, ensure_ascii=False) + "\n")


def historial() -> list[dict]:
    filas = []
    try:
        with open(HISTORIAL, encoding="utf-8") as f:
            for linea in f:
                try:
                    filas.append(json.loads(linea))
                except ValueError:
                    pass
    except OSError:
        pass
    return filas


def estado(tid: str) -> dict:
    with _cerrojo:
        t = _trabajos.get(tid)
        if t is None:
            return {"estado": "error", "avance": 0.0, "paso": None, "pasos": None, "nodo": None,
                    "mensaje": f"no existe el trabajo {tid}", "video": None, "segundos": 0.0}
        fuera = {k: v for k, v in t.items() if not k.startswith("_")}
        fuera["segundos"] = round((t["_fin"] or time.time()) - t["_t0"], 1)
    return fuera


def cancelar(tid: str) -> dict:
    """Cancela solo ese trabajo (POST /api/v2/jobs/<id>/cancel del proxy). Si aún no se mandó, se cancela al mandarlo."""
    with _cerrojo:
        t = _trabajos.get(tid)
        job = _jobs.get(tid)
        if t is not None and t["estado"] in ("en_cola", "generando"):
            t["_cancelar"] = True
            t["mensaje"] = "cancelando…"
    if job is not None:
        try:
            job.cancel()
        except Exception as exc:
            _poner(tid, mensaje=f"no se pudo cancelar: {_texto_error(exc, config())}")
    return estado(tid)
