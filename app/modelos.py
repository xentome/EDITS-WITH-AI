"""MAX EDITOR · los modelos (29 oct, Jonathan): qué piezas usa la app, cuáles ve ComfyUI, cuál eligió el usuario y bajar
las que falten con un clic. Solo se baja algo cuando el usuario lo pide: el instalador ya no los baja sin permiso.
  - La lista sale de app/instalacion/comfy-build.yaml, la misma del instalador (repo, revisión, tamaño y sha256).
  - Lo que hay lo dice ComfyUI (/object_info/<nodo que carga la pieza>); si está apagado, se mira su carpeta models/.
  - Lo elegido va en app/modelos.local.json (no va a git). generar.lanzar() lo aplica a todo grafo con aplicar(): en el
    nodo de cada pieza cambia el archivo de la plantilla por el elegido.
  - VDN y la vista previa (TAE) no se eligen (decisión de Jonathan): solo se bajan si faltan.
"""
import json
import os
import shutil
import sys
import threading
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
ELEGIDOS = os.path.join(AQUI, "modelos.local.json")
sys.path.insert(0, os.path.join(AQUI, "instalacion"))
import instalar  # noqa: E402  (bajar() reanudable, sha256() y el YAML)

# clave → (inicio de localPath en el YAML, nodo que la carga, su entrada, ¿se elige otra?)
PIEZAS = {
    "h3": ("diffusion_models/", "UNETLoader", "unet_name", True),
    "texto": ("text_encoders/", "CLIPLoader", "clip_name", True),
    "vae_video": ("vae/minimax_h3_video", "VAELoader", "vae_name", True),
    "vae_audio": ("vae/minimax_h3_audio", "VAELoader", "vae_name", True),
    "sam": ("checkpoints/", "CheckpointLoaderSimple", "ckpt_name", True),
    "vdn": ("vdn/", "ApplyVDNH3", "vdn_checkpoint", False),
    "vista_previa": ("vae_approx/", "ModelPreviewOverrideKJ", "tiny_vae", False),
}
EXTENSIONES = (".safetensors", ".sft", ".ckpt", ".pt", ".pth", ".bin", ".gguf")
_bajando: dict = {}          # clave → {"estado": bajando|comprobando|listo|error|parado, "hecho", "total", "vel", "error"}
_cerrojo = threading.Lock()


def _archivos(clave: str) -> list:
    """Las entradas del YAML de una pieza (VDN son 8 archivos: su carpeta)."""
    build = instalar.yaml.safe_load(open(instalar.BUILD, encoding="utf-8"))["definition"]
    return [m for m in build["models"] if m["localPath"].startswith(PIEZAS[clave][0])]


def _defecto(clave: str, archivos: list) -> str:
    """El nombre que pone la plantilla: el archivo dentro de su carpeta (para VDN, la carpeta)."""
    partes = archivos[0]["localPath"].split("/")
    return partes[1] if clave == "vdn" else "/".join(partes[1:])


def leer_elegidos() -> dict:
    try:
        with open(ELEGIDOS, encoding="utf-8") as fh:
            return {k: v for k, v in (json.load(fh) or {}).items() if k in PIEZAS and PIEZAS[k][3] and isinstance(v, str)}
    except (OSError, ValueError):
        return {}


def _opciones_comfyui(url: str, nodo: str, entrada: str):
    """La lista del desplegable de ese nodo en ComfyUI; None si no responde o no tiene el nodo."""
    try:
        info = json.load(urllib.request.urlopen(f"{url}/object_info/{nodo}", timeout=5))[nodo]["input"]
    except (OSError, ValueError, KeyError):
        return None
    spec = {**info.get("required", {}), **info.get("optional", {})}.get(entrada)
    if not spec:
        return None
    if isinstance(spec[0], list):
        return spec[0]
    return list(spec[1].get("options", [])) if len(spec) > 1 and isinstance(spec[1], dict) else None


def _opciones_disco(dir_models: str, carpeta: str, carpetas: bool) -> list:
    """Sin ComfyUI: los archivos (o, para VDN, las carpetas) de models/<carpeta>."""
    base = os.path.join(dir_models, carpeta)
    if carpetas:
        return sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))) if os.path.isdir(base) else []
    hay = []
    for raiz, _, nombres in os.walk(base, followlinks=True):
        hay += [os.path.relpath(os.path.join(raiz, n), base) for n in nombres if n.lower().endswith(EXTENSIONES)]
    return sorted(hay)


def estado(c: dict) -> dict:
    """GET /app/modelos: cada pieza con lo que hay, lo elegido y lo que falta por bajar."""
    dir_models = os.path.join(c["comfyui_dir"], "models")
    elegidos, piezas, comfy = leer_elegidos(), [], True
    cache: dict = {}
    for clave, (inicio, nodo, entrada, elegible) in PIEZAS.items():
        archivos = _archivos(clave)
        defecto = _defecto(clave, archivos)
        if (nodo, entrada) not in cache:
            cache[(nodo, entrada)] = _opciones_comfyui(c["comfyui_url"], nodo, entrada)
        opciones = cache[(nodo, entrada)]
        if opciones is None:
            comfy = False
            opciones = _opciones_disco(dir_models, inicio.split("/")[0], clave == "vdn")
        # bien bajado = cada archivo con su tamaño (ComfyUI también lista uno a medias o de otro tamaño)
        completos = all(os.path.isfile(os.path.join(dir_models, m["localPath"]))
                        and os.path.getsize(os.path.join(dir_models, m["localPath"])) == m["sizeBytes"] for m in archivos)
        faltan = [m for m in archivos if not (os.path.isfile(os.path.join(dir_models, m["localPath"]))
                                             and os.path.getsize(os.path.join(dir_models, m["localPath"])) == m["sizeBytes"])]
        a_medias = sum(os.path.getsize(os.path.join(dir_models, m["localPath"]) + ".part") for m in faltan
                       if os.path.isfile(os.path.join(dir_models, m["localPath"]) + ".part"))
        elegido = elegidos.get(clave, defecto)
        with _cerrojo:
            bajando = dict(_bajando[clave]) if clave in _bajando else None
        piezas.append({"clave": clave, "elegible": elegible, "grupo": archivos[0]["grupo"], "defecto": defecto,
                       "elegido": elegido, "opciones": opciones, "esta": elegido in opciones or (elegido == defecto and completos),
                       "defecto_completo": completos, "tam": sum(m["sizeBytes"] for m in archivos),
                       "por_bajar": sum(m["sizeBytes"] for m in faltan) - a_medias, "repo": archivos[0]["repo"], "bajando": bajando})
    libre = shutil.disk_usage(dir_models if os.path.isdir(dir_models) else c["comfyui_dir"]).free if os.path.isdir(c["comfyui_dir"]) else None
    return {"piezas": piezas, "comfyui": comfy, "libre": libre, "carpeta": dir_models}


def elegir(clave: str, archivo, c: dict) -> None:
    """POST /app/modelos/elegir: otro archivo para una pieza (None o el de siempre = volver al nuestro)."""
    if clave not in PIEZAS or not PIEZAS[clave][3]:
        raise ValueError("app.modelos.error.pieza")
    elegidos = leer_elegidos()
    if archivo in (None, "", _defecto(clave, _archivos(clave))):
        elegidos.pop(clave, None)
    else:
        _, nodo, entrada, _ = PIEZAS[clave]
        opciones = _opciones_comfyui(c["comfyui_url"], nodo, entrada)
        if opciones is None:
            opciones = _opciones_disco(os.path.join(c["comfyui_dir"], "models"), PIEZAS[clave][0].split("/")[0], False)
        if archivo not in opciones:
            raise ValueError("app.modelos.error.no_esta")
        elegidos[clave] = archivo
    with open(ELEGIDOS + ".tmp", "w", encoding="utf-8") as fh:
        json.dump(elegidos, fh, ensure_ascii=False, indent=1)
    os.replace(ELEGIDOS + ".tmp", ELEGIDOS)


def aplicar(grafo: dict) -> dict:
    """Pone los archivos elegidos en el grafo (generar.lanzar: el edit, Retocar, Extender y Mejorar)."""
    elegidos = leer_elegidos()
    if not elegidos:
        return grafo
    cambios = {}
    for clave, archivo in elegidos.items():
        _, nodo, entrada, _ = PIEZAS[clave]
        cambios[(nodo, entrada, _defecto(clave, _archivos(clave)))] = archivo
    for n in grafo.values():
        if not isinstance(n, dict):
            continue
        for (nodo, entrada, defecto), archivo in cambios.items():
            if n.get("class_type") == nodo and n.get("inputs", {}).get(entrada) == defecto:
                n["inputs"][entrada] = archivo
    return grafo


def bajar(clave: str, c: dict) -> None:
    """POST /app/modelos/bajar: baja en un hilo los archivos que falten de esa pieza, con su sha256."""
    if clave not in PIEZAS:
        raise ValueError("app.modelos.error.pieza")
    dir_models = os.path.join(c["comfyui_dir"], "models")
    faltan = [m for m in _archivos(clave) if not (os.path.isfile(os.path.join(dir_models, m["localPath"]))
                                                 and os.path.getsize(os.path.join(dir_models, m["localPath"])) == m["sizeBytes"])]
    if not faltan:
        return
    total = sum(m["sizeBytes"] for m in faltan)
    os.makedirs(dir_models, exist_ok=True)
    if total > shutil.disk_usage(dir_models).free - 2 * 2 ** 30:
        raise ValueError("app.modelos.error.disco")
    with _cerrojo:
        if _bajando.get(clave, {}).get("estado") in ("bajando", "comprobando"):
            return
        _bajando[clave] = {"estado": "bajando", "hecho": 0, "total": total, "vel": 0, "error": None}
    threading.Thread(target=_bajar, args=(clave, faltan, dir_models, total), name=f"modelo-{clave}", daemon=True).start()


def parar(clave: str) -> None:
    """POST /app/modelos/parar: corta la descarga; lo bajado se queda en .part y sigue la próxima vez."""
    with _cerrojo:
        if _bajando.get(clave, {}).get("estado") == "bajando":
            _bajando[clave]["estado"] = "parado"


def _poner(clave: str, **datos) -> None:
    with _cerrojo:
        _bajando[clave].update(datos)


def _bajar(clave: str, faltan: list, dir_models: str, total: int) -> None:
    hechos = 0
    seguir = lambda: _bajando[clave]["estado"] == "bajando"            # noqa: E731
    for m in faltan:
        destino = os.path.join(dir_models, m["localPath"])
        url = f"https://huggingface.co/{m['repo']}/resolve/{m['revision']}/{m['path']}"
        ok = instalar.bajar(url, destino, m["sizeBytes"], avance=lambda h, _t, v: _poner(clave, hecho=hechos + h, vel=v), seguir=seguir)
        if not seguir():
            return
        if not ok:
            return _poner(clave, estado="error", error="corte")
        _poner(clave, estado="comprobando")
        if instalar.sha256(destino) != m["sha256"]:
            os.replace(destino, destino + ".malo")
            return _poner(clave, estado="error", error="sha256")
        hechos += m["sizeBytes"]
        _poner(clave, estado="bajando", hecho=hechos)
    _poner(clave, estado="listo", hecho=total)
