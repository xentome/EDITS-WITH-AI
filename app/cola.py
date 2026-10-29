"""La cola de trabajos de MAX EDITOR (planos/fases/10 Cola de trabajos.md): Generar y Retocar se encolan y el servidor los
hace de uno en uno (una sola GPU), aunque nadie tenga la página abierta.

- Cada trabajo guarda al encolarse una FOTO FIJA de todo lo que necesita: para Generar, los valores de todos los nodos del
  proyecto (prompt, referencias, canción, resolución, audio de salida…) y la semilla; para Retocar, sus datos (video, tramo,
  máscara, referencias, prompt, semilla, resolución). Seguir editando o cambiar de semilla no toca lo ya encolado.
- La cola vive en disco (app/salidas/cola.json, fuera de git). Al arrancar, lo que estaba «corriendo» se busca en el
  historial de ComfyUI por su prompt_id: si terminó, se recoge su video; si sigue en la cola de ComfyUI, se espera y se
  recoge; si no, queda «interrumpido» y se puede reintentar.
- Extender (28 oct, planos/fases/12) va igual que Retocar: su foto fija son sus datos (video, solape, nuevos, calidad,
  audio, prompt, referencias, semilla).
- Mejorar (29 oct, mejorar.py) también: su foto fija es el video y los efectos RTX (Super Resolution, HDR).
- Un hilo procesa la cola: empieza el siguiente solo si no hay otro corriendo, la cola no está en pausa, el LLM local no
  está trabajando (llm_ocupado) y la cola de ComfyUI está vacía (así nunca van dos a la vez contra el mismo ComfyUI).
  Si un trabajo falla, sigue con el siguiente.

Estados: en_cola · corriendo · hecho · error · cancelado · interrumpido (y recuperando, mientras se espera a ComfyUI).
El hilo lanza con las mismas funciones de siempre (generar.iniciar y retocar.iniciar) y sigue su avance con generar.estado.
"""
from __future__ import annotations

import copy
import json
import os
import random
import shutil
import threading
import time
import urllib.request
import uuid
from datetime import datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA = os.environ.get("MAX_EDITOR_COLA") or os.path.join(AQUI, "salidas", "cola.json")   # otra ruta, para probar
TIPOS = ("generar", "retocar", "extender", "mejorar")
TERMINADOS = ("hecho", "error", "cancelado", "interrumpido")
# (29 oct) los valores con que se hizo cada video de Generar, para «Retomar este prompt» en Videos: uno por video, en
# app/salidas/valores/<video>.json, aparte de la cola (que se puede limpiar)
VALORES = os.path.join(os.path.dirname(RUTA), "valores")

_cerrojo = threading.RLock()
_despertar = threading.Event()
_estado = {"pausada": False, "trabajos": []}
_api: dict = {}          # las funciones del servidor: generar(), retocar(), llm_ocupado(), comfyui_url, comfyui_dir
_hilo: threading.Thread | None = None


# ---------------------------------------------------------------- disco
def _guardar() -> None:
    with _cerrojo:
        os.makedirs(os.path.dirname(RUTA), exist_ok=True)
        tmp = RUTA + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_estado, f, ensure_ascii=False)
        os.replace(tmp, RUTA)


def _cargar() -> None:
    try:
        with open(RUTA, encoding="utf-8") as f:
            d = json.load(f) or {}
    except (OSError, ValueError):
        d = {}
    with _cerrojo:
        _estado["pausada"] = bool(d.get("pausada"))
        _estado["trabajos"] = [t for t in d.get("trabajos") or [] if isinstance(t, dict) and t.get("tipo") in TIPOS]
        for t in _estado["trabajos"]:
            if t.get("estado") == "corriendo":      # el servidor se paró con él en marcha: se busca en ComfyUI
                t.update(estado="recuperando", mensaje="buscando en ComfyUI…")
        _guardar()


def _ahora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _publico(t: dict) -> dict:
    """Lo que ve la página: todo menos la foto fija (pesa: son los valores de todo el proyecto)."""
    return {k: v for k, v in t.items() if k != "foto"}


# ---------------------------------------------------------------- lo que pide la página
def anadir(tipo: str, foto: dict, semillas: list | None = None) -> list[str]:
    """Encola uno o varios trabajos (uno por semilla) con una copia de `foto`. Devuelve sus ids."""
    if tipo not in TIPOS:
        raise ValueError(f"tipo de trabajo desconocido: {tipo}")
    semillas = semillas or [foto.get("semilla")]
    ids = []
    with _cerrojo:
        for s in semillas:
            f = copy.deepcopy(foto)
            f["semilla"] = s
            tid = uuid.uuid4().hex[:10]
            tramo = None
            if tipo == "retocar":
                tramo = {k: f.get(k) for k in ("f0", "n")} if f.get("n") is not None else {"inicio": f.get("inicio"), "fin": f.get("fin")}
            # Extender: lo que la página enseña del trabajo (la pestaña carga lo que encoló el agente) sin la foto entera
            extension = {k: f.get(k) for k in ("video", "solape", "nuevos", "calidad", "audio_salida", "prompt")} if tipo == "extender" else None
            mejora = {k: f.get(k) for k in ("video", "superres", "hdr")} if tipo == "mejorar" else None
            _estado["trabajos"].append({"id": tid, "tipo": tipo, "proyecto": f.get("proyecto") or "", "semilla": s, "tramo": tramo,
                                        "extension": extension, "mejora": mejora,
                                        "origen": f.get("origen") or "",
                                        "estado": "en_cola", "avance": 0.0, "mensaje": "", "video": None, "creado": _ahora(),
                                        "empezado": None, "terminado": None, "segundos": 0.0, "job": None, "foto": f})
            ids.append(tid)
        _guardar()
    _despertar.set()
    return ids


def lista() -> dict:
    with _cerrojo:
        return {"pausada": _estado["pausada"], "trabajos": [_publico(t) for t in _estado["trabajos"]]}


def uno(tid: str) -> dict | None:
    with _cerrojo:
        t = _buscar(tid)
        return _publico(t) if t else None


def _buscar(tid: str) -> dict | None:
    return next((t for t in _estado["trabajos"] if t["id"] == tid), None)


def accion(tid: str, que: str) -> dict:
    """cancelar · subir · bajar · reintentar · quitar."""
    with _cerrojo:
        t = _buscar(tid)
        if not t:
            raise KeyError(tid)
        ts = _estado["trabajos"]
        if que == "cancelar":
            if t["estado"] == "en_cola":
                t.update(estado="cancelado", terminado=_ahora(), mensaje="cancelado")
            elif t["estado"] == "corriendo":
                t["_cancelar"] = True
                t["mensaje"] = "cancelando…"
                if t.get("tid"):
                    try:
                        _api["generar"]().cancelar(t["tid"])
                    except Exception:
                        pass
        elif que in ("subir", "bajar") and t["estado"] == "en_cola":
            pendientes = [x for x in ts if x["estado"] == "en_cola"]
            i = pendientes.index(t)
            j = i - 1 if que == "subir" else i + 1
            if 0 <= j < len(pendientes):
                a, b = ts.index(t), ts.index(pendientes[j])
                ts[a], ts[b] = ts[b], ts[a]
        elif que == "reintentar" and t["estado"] in TERMINADOS and t["estado"] != "hecho":
            t.update(estado="en_cola", avance=0.0, mensaje="", video=None, empezado=None, terminado=None, segundos=0.0, job=None)
            t.pop("_cancelar", None)
            ts.remove(t)
            ts.append(t)                       # vuelve al final de la cola
        elif que == "quitar" and t["estado"] in TERMINADOS:
            ts.remove(t)
        _guardar()
    _despertar.set()
    return uno(tid) or {"id": tid, "quitado": True}


def limpiar() -> dict:
    """Quita los terminados (hechos, con error, cancelados e interrumpidos)."""
    with _cerrojo:
        _estado["trabajos"] = [t for t in _estado["trabajos"] if t["estado"] not in TERMINADOS]
        _guardar()
    return lista()


def pausar(si: bool) -> dict:
    with _cerrojo:
        _estado["pausada"] = bool(si)
        _guardar()
    _despertar.set()
    return lista()


# ---------------------------------------------------------------- el hilo
def arrancar(api: dict) -> None:
    """api: {generar: () -> módulo, retocar: () -> módulo, extender: () -> módulo, mejorar: () -> módulo, llm_ocupado: () -> bool, comfyui_url, comfyui_dir}."""
    global _hilo
    _api.update(api)
    _cargar()
    with _cerrojo:                       # los videos hechos antes del 29 oct que aún siguen en la cola
        for t in _estado["trabajos"]:
            _guardar_valores(t)
    if _hilo is None or not _hilo.is_alive():
        _hilo = threading.Thread(target=_bucle, name="cola", daemon=True)
        _hilo.start()


def _comfy(ruta: str):
    with urllib.request.urlopen(_api["comfyui_url"].rstrip("/") + ruta, timeout=10) as r:
        return json.load(r)


def _comfy_libre() -> bool:
    try:
        q = _comfy("/queue")
    except Exception:
        return True                     # sin ComfyUI el trabajo fallará con su mensaje claro; no se queda colgado
    return not q.get("queue_running") and not q.get("queue_pending")


def _bucle() -> None:
    while True:
        _despertar.wait(2.0)
        _despertar.clear()
        try:
            _recuperar_pendientes()
            with _cerrojo:
                if _estado["pausada"] or any(t["estado"] in ("corriendo", "recuperando") for t in _estado["trabajos"]):
                    continue
                siguiente = next((t for t in _estado["trabajos"] if t["estado"] == "en_cola"), None)
            if not siguiente or _api["llm_ocupado"]() or not _comfy_libre():
                continue
            _correr(siguiente)
        except Exception as exc:      # el hilo no se muere nunca
            print(f"[cola] {type(exc).__name__}: {exc}", flush=True)
            time.sleep(2)


def _correr(t: dict) -> None:
    g = _api["generar"]()
    with _cerrojo:
        t.update(estado="corriendo", empezado=_ahora(), mensaje="empezando", avance=0.0)
        foto = copy.deepcopy(t["foto"])
        _guardar()
    if t["tipo"] == "generar":
        opciones = {k: foto.get(k) for k in ("semilla", "proyecto", "prefijo")}
        tid = g.iniciar(foto["valores"], opciones)
    elif t["tipo"] in ("extender", "mejorar"):
        tid = _api[t["tipo"]]().iniciar(foto)
    else:
        tid = _api["retocar"]().iniciar(foto)
    with _cerrojo:
        t["tid"] = tid
        if t.get("_cancelar"):
            g.cancelar(tid)
        _guardar()
    t0, guardado = time.time(), 0.0
    while True:
        e = g.estado(tid)
        with _cerrojo:
            nuevo_job = e.get("job") and e.get("job") != t.get("job")
            t.update(avance=float(e.get("avance") or 0), mensaje=e.get("mensaje") or "", job=e.get("job") or t.get("job"),
                     segundos=round(time.time() - t0, 1), paso=e.get("paso"), pasos=e.get("pasos"))
            if nuevo_job or time.time() - guardado > 15:   # el prompt_id, enseguida al disco (para recogerlo si se para el servidor)
                _guardar()
                guardado = time.time()
            if e["estado"] in ("listo", "error"):
                if e["estado"] == "listo":
                    t.update(estado="hecho", video=e.get("video"), avance=1.0)
                    _guardar_valores(t)
                else:
                    t.update(estado="cancelado" if (e.get("cancelado") or t.get("_cancelar")) else "error")
                t["terminado"] = _ahora()
                t.pop("_cancelar", None)
                _guardar()
                break
        time.sleep(1.0)
    _despertar.set()


# ---------------------------------------------------------------- recuperar lo que corría al pararse el servidor
def _recuperar_pendientes() -> None:
    with _cerrojo:
        pendientes = [t for t in _estado["trabajos"] if t["estado"] == "recuperando"]
    for t in pendientes:
        _recuperar(t)


def _recuperar(t: dict) -> None:
    job = t.get("job")
    if not job:
        return _marcar(t, "interrumpido", "el servidor se paró antes de mandarlo a ComfyUI")
    try:
        h = (_comfy(f"/history/{job}") or {}).get(job)
        q = _comfy("/queue")
    except Exception:
        return                                  # ComfyUI no responde: se vuelve a mirar en el siguiente paso
    if not h:
        en_comfy = any(job in json.dumps(x) for x in (q.get("queue_running") or []) + (q.get("queue_pending") or []))
        if en_comfy:
            with _cerrojo:
                t["mensaje"] = "ComfyUI sigue con él: se recoge al terminar"
            return
        return _marcar(t, "interrumpido", "el servidor se paró y ComfyUI no lo terminó: reinténtalo")
    if (h.get("status") or {}).get("status_str") != "success":
        return _marcar(t, "interrumpido", "ComfyUI no lo terminó bien: reinténtalo")
    try:
        video = _recoger(t, h)
    except Exception as exc:
        return _marcar(t, "interrumpido", f"terminó en ComfyUI pero no pude recoger el video: {exc}")
    with _cerrojo:
        t.update(estado="hecho", video=video, avance=1.0, terminado=_ahora(), mensaje="recogido de ComfyUI")
        _guardar_valores(t)
        _guardar()


def _marcar(t: dict, estado: str, mensaje: str) -> None:
    with _cerrojo:
        t.update(estado=estado, mensaje=mensaje, terminado=_ahora())
        _guardar()


def _salidas_de(h: dict) -> list[str]:
    """Las rutas en disco de los videos que dejó un prompt en ComfyUI (output/ o temp/)."""
    rutas = []
    for salida in (h.get("outputs") or {}).values():
        for lista_ in salida.values():
            for x in lista_ if isinstance(lista_, list) else []:
                if isinstance(x, dict) and str(x.get("filename", "")).lower().endswith((".mp4", ".webm", ".mov")):
                    base = os.path.join(_api["comfyui_dir"], x.get("type") or "output", x.get("subfolder") or "")
                    rutas.append(os.path.join(base, x["filename"]))
    return [r for r in rutas if os.path.isfile(r)]


def _recoger(t: dict, h: dict) -> str:
    g = _api["generar"]()
    rutas = _salidas_de(h)
    if not rutas:
        raise RuntimeError("no hay video en su salida")
    foto, sello = t["foto"], f"{datetime.now():%Y%m%d_%H%M%S}"
    os.makedirs(g.SALIDAS, exist_ok=True)
    if t["tipo"] == "generar":
        archivo = f"edit_{sello}_{foto.get('semilla')}{os.path.splitext(rutas[0])[1] or '.mp4'}"
        shutil.copyfile(rutas[0], os.path.join(g.SALIDAS, archivo))
        fila = {"semilla": foto.get("semilla"), "proyecto": foto.get("proyecto")}
    elif t["tipo"] in ("extender", "mejorar"):
        archivo, fila = _api[t["tipo"]]().recuperar(foto, rutas, sello)
    else:
        archivo, fila = _api["retocar"]().recuperar(foto, rutas, sello)
    g._anotar({"id": t["id"], "fecha": _ahora(), "segundos": t.get("segundos") or 0, "archivo": archivo, "job": t.get("job"),
               "recogido": True, **fila})
    return archivo


def _ruta_valores(video: str) -> str | None:
    nombre = os.path.basename(str(video or ""))
    return os.path.join(VALORES, nombre + ".json") if nombre and nombre == video else None


def _guardar_valores(t: dict) -> None:
    """Los valores de un Generar hecho, junto a su video (si no estaban ya). Nunca rompe la cola."""
    if t.get("tipo") != "generar" or t.get("estado") != "hecho" or not (t.get("foto") or {}).get("valores"):
        return
    ruta = _ruta_valores(t.get("video"))
    if not ruta or os.path.isfile(ruta):
        return
    try:
        os.makedirs(VALORES, exist_ok=True)
        f = t["foto"]
        with open(ruta, "w", encoding="utf-8") as h:
            json.dump({"valores": f["valores"], "semilla": t.get("semilla"), "proyecto": t.get("proyecto"), "fecha": t.get("terminado")},
                      h, ensure_ascii=False)
    except OSError as exc:
        print(f"[cola] no guardé los valores de {t.get('video')}: {exc}", flush=True)


def valores_de(video: str) -> dict | None:
    """{valores, semilla, proyecto, fecha} con que se hizo un video de Generar, o None si no se guardaron."""
    ruta = _ruta_valores(video)
    if not ruta or not os.path.isfile(ruta):
        return None
    try:
        with open(ruta, encoding="utf-8") as h:
            d = json.load(h)
        return d if isinstance(d.get("valores"), dict) else None
    except (OSError, ValueError):
        return None


def semillas_nuevas(n: int) -> list[int]:
    return random.sample(range(2 ** 32), max(1, min(int(n), 50)))
