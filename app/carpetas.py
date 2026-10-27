"""El `folder_paths` de la app: las carpetas de ComfyUI sin cargar ComfyUI.
rutas.py y nucleo.py hacen `import folder_paths`; la app registra este archivo como `sys.modules["folder_paths"]` antes de
importarlos (trabajador.py). Solo tiene lo que usan: input, output, temp, models/refmods y los nombres «x.wav [input]».
La raíz sale de la variable MAX_EDITOR_COMFYUI_DIR (la pone el servidor con `comfyui_dir` de config.json)."""
import os

base_path = os.path.abspath(os.path.expanduser(os.environ.get("MAX_EDITOR_COMFYUI_DIR", "~/comfy/ComfyUI")))
models_dir = os.path.join(base_path, "models")


def get_input_directory():
    return os.path.join(base_path, "input")


def get_output_directory():
    return os.path.join(base_path, "output")


def get_temp_directory():
    return os.path.join(base_path, "temp")


def get_folder_paths(nombre):
    """Las carpetas de un tipo de modelo («refmods» → models/refmods). Sin extra_model_paths: la app usa las de siempre."""
    return [os.path.join(models_dir, nombre)]


def annotated_filepath(name):
    """«x.wav [input]» → (x.wav, carpeta de input); sin anotación → (name, None). Igual que el de ComfyUI."""
    for marca, carpeta in (("[output]", get_output_directory), ("[input]", get_input_directory), ("[temp]", get_temp_directory)):
        if name.endswith(marca):
            return name[:-len(marca) - 1], carpeta()
    return name, None


def get_annotated_filepath(name, default_dir=None):
    name, base = annotated_filepath(name)
    base = base or default_dir or get_input_directory()
    ruta = os.path.abspath(os.path.join(base, name))
    if os.path.commonpath([os.path.abspath(base), ruta]) != os.path.abspath(base):   # nada fuera de su carpeta
        raise ValueError("Invalid file path: {!r}".format(name))
    return ruta


def exists_annotated_filepath(name):
    try:
        return os.path.exists(get_annotated_filepath(name))
    except ValueError:
        return False
