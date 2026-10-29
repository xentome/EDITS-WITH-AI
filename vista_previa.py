"""El preview en vivo de MAX EDITOR (28 oct, planos/fases/13 §7).

El nodo «Model Preview Override» (ModelPreviewOverrideKJ, de KJNodes; va en la plantilla de H3) manda en cada paso un
preview animado (mp4 o webp) por el websocket de ComfyUI, como el mensaje «kj_preview_override», solo al cliente que lanzó
el trabajo. La app lanza por el proxy del SDK, que no reenvía ese mensaje (y el nodo apaga el preview normal). Por eso aquí,
dentro de ComfyUI, se envuelve PromptServer.send_sync: cada «kj_preview_override» se guarda (el último) y sigue su camino
como siempre. La app lo lee con GET /max_editor/preview?desde=<n> (app/servidor.py lo reenvía a ComfyUI).
"""
import threading
import time

EVENTO = "kj_preview_override"
_cerrojo = threading.Lock()
_ultimo = {"n": 0}                # n sube con cada preview nuevo; la app pide «desde» el último que vio


def guardar(datos, prompt_id=None):
    """Guarda un mensaje del nodo. Los que traen imagen son un paso; el primero (sin imagen) solo trae los sigmas."""
    if not isinstance(datos, dict):
        return
    with _cerrojo:
        if datos.get("sigmas"):
            _ultimo["pasos_total"] = max(0, len(datos["sigmas"]) - 1)
        if not datos.get("image"):
            return
        _ultimo.update(n=_ultimo["n"] + 1, prompt_id=prompt_id, t=time.time(), mime=datos.get("mime") or "image/jpeg",
                       datos=datos["image"], w=datos.get("w"), h=datos.get("h"), paso=datos.get("step"),
                       total=datos.get("total") or _ultimo.get("pasos_total"), fps=datos.get("fps"),
                       ms_paso=datos.get("avg_step_ms"), cambio=datos.get("delta"))


def leer(desde=0):
    """Lo último: sin cambios desde `desde`, solo {n, igual} (sin los datos, que pesan)."""
    with _cerrojo:
        r = dict(_ultimo)
    r["edad_s"] = round(time.time() - r["t"], 1) if r.get("t") else None
    if r["n"] <= desde:
        r.pop("datos", None)
        r["igual"] = True
    return r


def instalar(srv):
    """Envuelve srv.send_sync una sola vez (al recargar el módulo no se vuelve a envolver)."""
    if getattr(srv.send_sync, "_max_editor", False):
        return
    original = srv.send_sync

    def send_sync(evento, datos, sid=None):
        if evento == EVENTO:
            try:
                guardar(datos, getattr(srv, "last_prompt_id", None))
            except Exception as exc:          # el preview nunca puede romper la generación
                print(f"[MAX EDITOR] preview no guardado: {exc}")
        return original(evento, datos, sid)

    send_sync._max_editor = True
    srv.send_sync = send_sync
