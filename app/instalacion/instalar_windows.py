"""MAX EDITOR: el instalador para Windows (lo lanza «Instalar MAX EDITOR.bat» con doble clic). Hace lo mismo que
app/instalar.sh, con solo la biblioteca estándar de Python (corre con el Python del sistema, antes de que exista app/.venv):
  1. crea el entorno de la app en app\\.venv (con uv si lo tienes; si no, python -m venv) e instala app/requirements.txt;
  2. busca tu ComfyUI (el portable, uno instalado con git, o la carpeta que le digas) y su Python, y los guarda en
     app/config.local.json;
  3. pregunta si quieres también Retocar y Extender video;
  4. lanza instalar.py (los packs de nodos, sus dependencias y, solo si dices que sí, los modelos).
Las mismas opciones que app/instalar.sh (--comfyui DIR, --retocar, --modelos DIR, --dry-run, --comprobar…).
ComfyUI Desktop (la app de escritorio) aún no: su código y sus carpetas van por separado. Usa el portable o RunPod.
Escrito el 29 oct 2026 sin un Windows a mano para probarlo: también corre en Linux, donde sí se probó (con --dry-run).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(AQUI)
REPO = os.path.dirname(APP)
WINDOWS = sys.platform == "win32"
VENV = os.environ.get("MAX_EDITOR_VENV") or os.path.join(APP, ".venv")
PY_APP = os.path.join(VENV, "Scripts", "python.exe") if WINDOWS else os.path.join(VENV, "bin", "python")
CONFIG_LOCAL = os.path.join(APP, "config.local.json")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def idioma_es():
    if os.environ.get("LANG"):
        return os.environ["LANG"].startswith("es")
    import locale
    return (locale.getlocale()[0] or "").lower().startswith(("es", "spanish"))


ES = idioma_es()


def decir(es, en):
    print(es if ES else en, flush=True)


def si_no(es, en, defecto=True):
    if not sys.stdin.isatty():
        return defecto
    r = input(("  ? " + (es if ES else en)) + (" [S/n] " if defecto else " [s/N] ")).strip().lower()
    return r in ("s", "si", "sí", "y", "yes") or (defecto and r == "")


def entorno():
    """1. app\\.venv con app/requirements.txt."""
    uv = shutil.which("uv")
    if os.path.isfile(PY_APP):
        decir(f"· El entorno ya existe: {VENV}", f"· The environment already exists: {VENV}")
    elif uv:
        decir("… creando el entorno con uv (Python 3.12)", "… creating the environment with uv (Python 3.12)")
        subprocess.run([uv, "venv", "--python", "3.12", VENV], check=True)
    else:
        if sys.version_info < (3, 10):
            decir("✗ Hace falta Python 3.10 o más nuevo. Instálalo: winget install Python.Python.3.12",
                  "✗ Python 3.10 or newer is required. Install it: winget install Python.Python.3.12")
            sys.exit(1)
        decir(f"… creando el entorno con Python {sys.version.split()[0]}", f"… creating the environment with Python {sys.version.split()[0]}")
        subprocess.run([sys.executable, "-m", "venv", VENV], check=True)
    decir("… instalando app/requirements.txt", "… installing app/requirements.txt")
    req = os.path.join(APP, "requirements.txt")
    if uv:
        subprocess.run([uv, "pip", "install", "--python", PY_APP, "-r", req], check=True)
    else:
        subprocess.run([PY_APP, "-m", "pip", "install", "--upgrade", "pip"], stdout=subprocess.DEVNULL)
        subprocess.run([PY_APP, "-m", "pip", "install", "-r", req], check=True)


def es_comfyui(d):
    return bool(d) and os.path.isfile(os.path.join(d, "main.py")) and os.path.isdir(os.path.join(d, "custom_nodes"))


def candidatos_comfyui():
    """Donde suele estar ComfyUI: este repo dentro de su custom_nodes, el portable en las carpetas de siempre, o ~/ComfyUI."""
    casa = os.path.expanduser("~")
    lista = [os.path.dirname(os.path.dirname(REPO))]                      # …/ComfyUI/custom_nodes/<este repo>
    raices = [os.path.dirname(REPO), casa] + [os.path.join(casa, x) for x in ("Desktop", "Escritorio", "Downloads", "Descargas", "Documents", "Documentos")]
    if WINDOWS:
        raices += [f"{u}:\\" for u in "CDEFG" if os.path.isdir(f"{u}:\\")]
    for r in raices:
        try:
            nombres = os.listdir(r)
        except OSError:
            continue
        for n in nombres:
            if n.lower().startswith("comfyui"):
                lista += [os.path.join(r, n), os.path.join(r, n, "ComfyUI")]
    return lista


def python_de(d):
    """El Python de ese ComfyUI: el del portable (python_embeded) o el de su venv."""
    for p in (os.path.join(os.path.dirname(d), "python_embeded", "python.exe"),
              *(os.path.join(d, v, "Scripts", "python.exe") for v in (".venv", "venv")),
              *(os.path.join(d, v, "bin", "python") for v in (".venv", "venv"))):
        if os.path.isfile(p):
            return p
    return ""


def config_actual():
    r = subprocess.run([PY_APP, os.path.join(APP, "servidor.py"), "--config"], cwd=REPO, capture_output=True, text=True, encoding="utf-8")
    return json.loads(r.stdout) if r.returncode == 0 else {}


def buscar_comfyui(o):
    """2. La carpeta de ComfyUI: la de --comfyui, la ya guardada o la que se encuentre; si no, se pregunta."""
    if o.comfyui:
        d = os.path.abspath(os.path.expanduser(o.comfyui))
        return d if es_comfyui(d) else d                              # si no vale, instalar.py lo dice con el arreglo
    guardada = config_actual().get("comfyui_dir")
    if es_comfyui(guardada):
        return guardada
    for d in candidatos_comfyui():
        if es_comfyui(d):
            decir(f"✓ Encontré ComfyUI en {d}", f"✓ Found ComfyUI at {d}")
            if o.sin_preguntas or si_no("¿Es ese?", "Is that the one?"):
                return os.path.abspath(d)
    if os.path.isdir(os.path.join(os.path.expanduser("~"), "Documents", "ComfyUI", ".venv")):
        decir("! Parece que tienes ComfyUI Desktop: MAX EDITOR aún no lo admite. Usa el ComfyUI portable o RunPod (README).",
              "! You seem to have ComfyUI Desktop: MAX EDITOR does not support it yet. Use the portable ComfyUI or RunPod (README).")
    if o.sin_preguntas or not sys.stdin.isatty():
        return ""
    d = input("  ? " + ("Pega la ruta de tu carpeta ComfyUI (la que tiene main.py): " if ES else
                        "Paste the path of your ComfyUI folder (the one with main.py): ")).strip().strip('"')
    return os.path.abspath(os.path.expanduser(d)) if d else ""


def guardar_config(cambios):
    try:
        c = json.load(open(CONFIG_LOCAL, encoding="utf-8"))
    except (OSError, ValueError):
        c = {}
    c.update(cambios)
    with open(CONFIG_LOCAL, "w", encoding="utf-8") as fh:
        json.dump(c, fh, ensure_ascii=False, indent=1)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--comfyui", metavar="DIR", help="dónde está tu ComfyUI (se guarda en app/config.local.json)")
    p.add_argument("--retocar", action="store_true", help="también Retocar y Extender video (7 packs más + SAM 3.1, 1,7 GB)")
    p.add_argument("--sin-preguntas", "-y", action="store_true", help="sí a todo menos a bajar modelos")
    o, pasar = p.parse_known_args()
    solo_mirar = "--dry-run" in pasar or "--comprobar" in pasar
    entorno()
    d = buscar_comfyui(o)
    if not es_comfyui(d):
        decir(f"✗ No encuentro ComfyUI{' en ' + d if d else ''}. Vuelve a ejecutarlo con: --comfyui C:\\ruta\\a\\ComfyUI",
              f"✗ ComfyUI not found{' at ' + d if d else ''}. Run it again with: --comfyui C:\\path\\to\\ComfyUI")
        decir("  ¿No tienes ComfyUI? Baja el portable (https://docs.comfy.org/installation) o usa la plantilla de RunPod del README.",
              "  No ComfyUI? Get the portable one (https://docs.comfy.org/installation) or use the RunPod template in the README.")
        return 1
    pyc = config_actual().get("python_comfyui") or python_de(d)
    if solo_mirar:
        os.environ["MAX_EDITOR_COMFYUI_DIR"] = d                       # mirar no guarda nada
        if pyc:
            os.environ["MAX_EDITOR_PYTHON_COMFYUI"] = pyc
    else:
        guardar_config({"comfyui_dir": d, **({"python_comfyui": pyc} if pyc else {})})
        decir(f"✓ app/config.local.json: comfyui_dir = {d}", f"✓ app/config.local.json: comfyui_dir = {d}")
    c = config_actual()
    retocar = o.retocar
    if not (retocar or o.sin_preguntas or solo_mirar):
        retocar = si_no("¿Instalo también Retocar y Extender video (7 packs más + SAM 3.1, 1,7 GB)?",
                        "Also install Retouch and Extend video (7 more packs + SAM 3.1, 1.7 GB)?")
    orden = [PY_APP, os.path.join(AQUI, "instalar.py"), "--comfyui-dir", c.get("comfyui_dir", d),
             "--python-comfyui", c.get("python_trabajador") or pyc, "--comfyui-url", c.get("comfyui_url", "http://127.0.0.1:8188")]
    orden += (["--retocar"] if retocar else []) + (["--sin-preguntas"] if o.sin_preguntas else []) + pasar
    codigo = subprocess.run(orden, cwd=REPO).returncode
    if solo_mirar:
        return codigo
    if codigo == 0:
        decir("Listo. Arranca ComfyUI (o reinícialo si ya estaba abierto) y luego doble clic en «Abrir MAX EDITOR».",
              "Done. Start ComfyUI (or restart it if it was open), then double-click «Abrir MAX EDITOR».")
    else:
        decir("Casi: arregla lo de arriba y vuelve a hacer doble clic en «Instalar MAX EDITOR» (lo hecho se salta).",
              "Almost: fix the items above and double-click «Instalar MAX EDITOR» again (what is done is skipped).")
    return codigo


if __name__ == "__main__":
    sys.exit(main())
