"""El trabajador de la app: hace las acciones del editor (rutas.ACCIONES) fuera de ComfyUI.
Corre con el Python de ComfyUI (tiene numpy, Pillow y librosa, que nucleo.py necesita para el audio y las fotos); el
servidor de la app (servidor.py) lo arranca una vez y le habla por stdin/stdout, una línea JSON por petición:
  entra  {id, accion, datos, idioma}            (una acción de rutas.ACCIONES con lo que manda la ventana)
  sale   {id, ok: respuesta}  o  {id, error, clave}  (el error ya traducido, como lo devuelve la ruta del nodo)
Hace lo mismo que la ruta del nodo en __init__.py (_registrar_rutas): recarga rutas/nucleo/i18n si cambiaron, suelta la GPU
antes del LLM y traduce los errores. Cada petición va en su hilo: un «Escribir historia» no frena un «montar».
Sin ComfyUI cargado, rutas.py encuentra aquí lo poco que le pide: folder_paths (carpetas.py) y comfy.cli_args.args.port."""
import importlib
import json
import os
import sys
import threading
import time
import types
import urllib.parse
import urllib.request

APP = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(APP)
PAQUETE = os.path.basename(REPO)                      # «edit_prompt_llm»: rutas.py usa imports relativos (from . import)
COMFYUI_URL = os.environ.get("MAX_EDITOR_COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
LLM_URL = os.environ.get("MAX_EDITOR_LLM_URL", "").rstrip("/")
LIBERAR_GPU = os.environ.get("MAX_EDITOR_LIBERAR_GPU", "1") not in ("0", "false", "no")

# lo que se escribe para el servidor va por la salida de verdad; los print() de nucleo/rutas, al log (stderr)
_salida = os.fdopen(os.dup(sys.stdout.fileno()), "w", buffering=1, encoding="utf-8")
sys.stdout = sys.stderr
_escribir = threading.Lock()


def _preparar():
    """folder_paths, comfy.cli_args y el paquete del nodo sin su __init__.py (ese registra el nodo en ComfyUI)."""
    sys.path.insert(0, APP)
    import carpetas
    sys.modules["folder_paths"] = carpetas
    comfy, cli_args = types.ModuleType("comfy"), types.ModuleType("comfy.cli_args")
    cli_args.args = types.SimpleNamespace(port=urllib.parse.urlparse(COMFYUI_URL).port or 8188)
    comfy.cli_args = cli_args
    sys.modules.setdefault("comfy", comfy)
    sys.modules.setdefault("comfy.cli_args", cli_args)
    paquete = types.ModuleType(PAQUETE)
    paquete.__path__ = [REPO]
    sys.modules[PAQUETE] = paquete


_preparar()
_mods, _fechas, _recargar = {}, {}, threading.Lock()


def _modulos():
    """i18n, nucleo y rutas; se vuelven a cargar si su archivo cambió (como hace el nodo en cada llamada)."""
    with _recargar:
        for nombre in ("i18n", "nucleo", "rutas"):
            ruta = os.path.join(REPO, nombre + ".py")
            fecha = os.path.getmtime(ruta)
            if nombre not in _mods:
                _mods[nombre] = importlib.import_module(f"{PAQUETE}.{nombre}")
            elif _fechas.get(nombre) != fecha:
                _mods[nombre] = importlib.reload(_mods[nombre])
            _fechas[nombre] = fecha
        if LLM_URL:
            _mods["nucleo"].URL = LLM_URL + "/v1/chat/completions"
        _mods["rutas"]._vram_libre = _vram_libre          # sin torch: la VRAM libre la dice ComfyUI
        return _mods["i18n"], _mods["nucleo"], _mods["rutas"]


def _comfy(ruta, cuerpo=None, timeout=10):
    pet = urllib.request.Request(COMFYUI_URL + ruta, json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                 {"Content-Type": "application/json"})
    datos = urllib.request.urlopen(pet, timeout=timeout).read()
    return json.loads(datos) if datos.strip() else {}


def _vram_gb():
    try:
        return _comfy("/system_stats")["devices"][0]["vram_free"] / 2 ** 30
    except Exception:
        return None


def _vram_libre(gb=3.0, max_s=20):
    """Lo mismo que rutas._vram_libre (SAM espera a que llama suelte la VRAM), preguntando a ComfyUI en vez de a torch:
    así el trabajador no reserva memoria de la GPU para sí."""
    t = time.time()
    while time.time() - t < max_s:
        libre = _vram_gb()
        if libre is None or libre >= gb:
            return
        time.sleep(0.5)


def _soltar_gpu(i18n):
    """Antes del LLM, como soltar_gpu del nodo: nada renderizando y ComfyUI suelta sus modelos (lo mismo que /free)."""
    try:
        cola = _comfy("/queue")
    except Exception:
        return                                            # sin ComfyUI no hay nada que soltar
    if cola.get("queue_running") or cola.get("queue_pending"):
        raise i18n.ErrorUsuario("errores.cola_llm")
    if not LIBERAR_GPU:
        return
    _comfy("/free", {"unload_models": True, "free_memory": True})
    for _ in range(30):
        libre = _vram_gb()
        if libre is None or libre >= 9:
            return
        time.sleep(0.5)


def _responder(res):
    with _escribir:
        _salida.write(json.dumps(res, ensure_ascii=False) + "\n")
        _salida.flush()


def _atender(pet):
    idioma = pet.get("idioma") or "es"
    i18n = None
    try:
        i18n, _, rutas = _modulos()
        datos = pet.get("datos") or {}
        idioma = i18n.idioma_de(datos.get("idioma") or idioma)
        accion = rutas.ACCIONES.get(pet.get("accion"))
        if not accion:
            return _responder({"id": pet["id"], "estado": 404,
                               "error": i18n.t("errores.accion_desconocida", idioma, accion=pet.get("accion"))})
        funcion, usa_llm = accion
        if usa_llm:
            _soltar_gpu(i18n)
        _responder({"id": pet["id"], "ok": funcion(datos)})
    except Exception as exc:
        if i18n and isinstance(exc, i18n.ErrorUsuario):
            return _responder({"id": pet["id"], "error": exc.texto(idioma), "clave": exc.clave})
        texto = i18n.t("errores.inesperado", idioma, tipo=type(exc).__name__, error=str(exc)) if i18n else f"{type(exc).__name__}: {exc}"
        print(f"[MAX EDITOR] {pet.get('accion')}: {type(exc).__name__}: {exc}", flush=True)
        _responder({"id": pet["id"], "error": texto})


def main():
    _modulos()                                            # cargar ya: el primer «montar» no espera a librosa
    _responder({"id": 0, "ok": {"listo": True, "python": sys.version.split()[0]}})
    hilos = []
    for linea in sys.stdin:
        if linea.strip():
            hilos.append(threading.Thread(target=_atender, args=(json.loads(linea),), daemon=True))
            hilos[-1].start()
    for h in hilos:                                       # sin más peticiones (el servidor se fue): terminar lo empezado
        h.join(timeout=60)


if __name__ == "__main__":
    main()
