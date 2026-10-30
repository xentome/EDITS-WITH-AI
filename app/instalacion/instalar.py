"""MAX EDITOR: instala en tu ComfyUI lo que necesita la app, leyendo app/instalacion/comfy-build.yaml.

Lo lanza app/instalar.sh (o, en Windows, instalar_windows.py), con el Python de app/.venv, que trae pyyaml. Hace, en este orden:
  1. mira el sistema (GPU, VRAM, RAM, disco, driver, ComfyUI y su Python) y dice si llega;
  2. pone los packs de nodos en ComfyUI/custom_nodes en su commit, sin pisar los que ya tienes (--forzar los cambia);
  3. instala las dependencias de esos packs en el Python de ComfyUI con torch, torchvision, torchaudio y numpy congelados;
  4. baja los modelos de HuggingFace (se reanuda si se corta) y comprueba su sha256; con --modelos DIR usa los que ya tienes.
Nunca parchea ComfyUI: solo añade carpetas en custom_nodes/ y archivos (o enlaces) en models/.
Con --comprobar no cambia nada: es el «doctor» (dice qué falta y cómo arreglarlo). Ver python instalar.py --help.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

import yaml

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(AQUI)
BUILD = os.path.join(AQUI, "comfy-build.yaml")
CONGELADOS = ("torch", "torchvision", "torchaudio", "numpy")      # nunca se cambian en el Python de ComfyUI
GB = 1024 ** 3

WINDOWS = sys.platform == "win32"
ES = os.environ.get("LC_ALL", os.environ.get("LC_MESSAGES", os.environ.get("LANG", ""))).startswith("es")
if WINDOWS and not os.environ.get("LANG"):          # Windows no tiene LANG: el idioma de su configuración regional
    import locale
    ES = (locale.getlocale()[0] or "").lower().startswith(("es", "spanish"))
if hasattr(sys.stdout, "reconfigure"):                # «✓» y «…» en la consola de Windows (cp1252)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
PROBLEMAS = []        # (texto, arreglo) de lo que falta, para el resumen final


def decir(es, en=None):
    print(es if ES or en is None else en, flush=True)


def problema(es, en, arreglo_es="", arreglo_en=""):
    decir("  ✗ " + es, "  ✗ " + en)
    if arreglo_es:
        decir("    → " + arreglo_es, "    → " + (arreglo_en or arreglo_es))
    PROBLEMAS.append((es, en, arreglo_es, arreglo_en))


def preguntar(es, en, opciones, si_por_defecto=True):
    """Sí/no. Con --sin-preguntas (o sin terminal) contesta lo de por defecto."""
    if opciones.sin_preguntas or not sys.stdin.isatty():
        return si_por_defecto
    r = input(("  ? " + es if ES else "  ? " + en) + (" [S/n] " if si_por_defecto else " [s/N] ")).strip().lower()
    return r in ("s", "si", "sí", "y", "yes") or (si_por_defecto and r == "")


def gb(n):
    return f"{n / GB:.1f} GB"


def correr(orden, **kw):
    return subprocess.run(orden, capture_output=True, text=True, **kw)


# ------------------------------------------------------------------ 1. el sistema
def leer_meminfo():
    if WINDOWS:                                       # RAM y archivo de paginación (lo que Windows usa como swap)
        import ctypes

        class Memoria(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong)] + \
                       [(n, ctypes.c_ulonglong) for n in ("total", "libre", "pagina", "pagina_libre", "virtual", "virtual_libre", "extendida")]
        m = Memoria()
        m.dwLength = ctypes.sizeof(Memoria)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
            return m.total, max(0, m.pagina - m.total)
        return 0, 0
    datos = {}
    try:
        for linea in open("/proc/meminfo"):
            k, v = linea.split(":")
            datos[k] = int(v.split()[0]) * 1024
    except OSError:
        pass
    return datos.get("MemTotal", 0), datos.get("SwapTotal", 0)


def version_comfyui(dir_comfy):
    try:
        texto = open(os.path.join(dir_comfy, "comfyui_version.py"), encoding="utf-8").read()
        return re.search(r"['\"]([0-9][0-9.]*)['\"]", texto).group(1)
    except (OSError, AttributeError):
        return None


def tupla(v):
    return tuple(int(x) for x in re.findall(r"\d+", v or "0")[:3])


def sistema(o, build):
    decir("\n1. El sistema", "\n1. The system")
    ok = True
    gpu = correr(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"]) \
        if shutil.which("nvidia-smi") else None
    vram = 0
    if gpu and gpu.returncode == 0 and gpu.stdout.strip():
        nombre, mem, driver = [x.strip() for x in gpu.stdout.strip().splitlines()[0].split(",")]
        vram = int(float(mem)) * 1024 ** 2
        decir(f"  ✓ GPU: {nombre}, {gb(vram)} de VRAM, driver {driver}", f"  ✓ GPU: {nombre}, {gb(vram)} VRAM, driver {driver}")
        if vram < 11.5 * GB:
            ok = False
            problema(f"{gb(vram)} de VRAM: lo probado es 12 GB (RTX 3060). Con menos no sabemos si cabe.",
                     f"{gb(vram)} VRAM: tested on 12 GB (RTX 3060). With less we don't know if it fits.",
                     "Usa la plantilla de RunPod (README › «Sin GPU suficiente») o mira las alternativas de abajo.",
                     "Use the RunPod template (README › «Not enough GPU») or see the alternatives below.")
    else:
        ok = False
        problema("No veo una GPU NVIDIA (nvidia-smi no responde).", "No NVIDIA GPU found (nvidia-smi does not answer).",
                 "MAX EDITOR necesita una NVIDIA de 12 GB. Sin ella: la plantilla de RunPod (README).",
                 "MAX EDITOR needs a 12 GB NVIDIA GPU. Without one: the RunPod template (README).")
    ram, swap = leer_meminfo()
    if ram:
        decir(f"  · RAM: {gb(ram)} + {gb(swap)} de swap", f"  · RAM: {gb(ram)} + {gb(swap)} swap")
        if ram + swap < 60 * GB:
            ok = False
            problema(f"RAM + swap = {gb(ram + swap)}. Los dos modelos grandes pesan 61 GB; lo probado es 46 GB de RAM + swap zram.",
                     f"RAM + swap = {gb(ram + swap)}. The two big models weigh 61 GB; tested with 46 GB RAM + zram swap.",
                     "Añade swap (mejor zram) hasta unos 64 GB en total, o usa los modelos ligeros del README.",
                     "Add swap (zram is best) up to about 64 GB in total, or use the lighter models in the README.")
    v = version_comfyui(o.comfyui_dir)
    if v is None:
        ok = False
        problema(f"No encuentro ComfyUI en {o.comfyui_dir}", f"ComfyUI not found at {o.comfyui_dir}",
                 "app/instalar.sh --comfyui /ruta/a/ComfyUI  (instálalo antes: https://docs.comfy.org/installation)",
                 "app/instalar.sh --comfyui /path/to/ComfyUI  (install it first: https://docs.comfy.org/installation)")
    else:
        base = build["baseComfyVersion"].lstrip("v")
        if tupla(v) < tupla(base):
            ok = False
            problema(f"ComfyUI {v}: hace falta {base} o más nuevo (soporte de MiniMax H3).",
                     f"ComfyUI {v}: {base} or newer is needed (MiniMax H3 support).",
                     f"cd {o.comfyui_dir} && git pull  (o actualízalo desde ComfyUI-Manager)",
                     f"cd {o.comfyui_dir} && git pull  (or update it from ComfyUI-Manager)")
        else:
            decir(f"  ✓ ComfyUI {v} en {o.comfyui_dir}", f"  ✓ ComfyUI {v} at {o.comfyui_dir}")
    pyv = correr([o.python_comfyui, "-c", "import sys, torch; print(sys.version.split()[0], torch.__version__)"]) \
        if os.path.isfile(o.python_comfyui) else None
    if pyv and pyv.returncode == 0:
        decir(f"  ✓ Python de ComfyUI: {o.python_comfyui} (Python y torch {pyv.stdout.split()[0]}, {pyv.stdout.split()[-1]})",
              f"  ✓ ComfyUI's Python: {o.python_comfyui} (Python and torch {pyv.stdout.split()[0]}, {pyv.stdout.split()[-1]})")
    else:
        ok = False
        problema(f"El Python de ComfyUI ({o.python_comfyui}) no arranca o no tiene torch.",
                 f"ComfyUI's Python ({o.python_comfyui}) does not run or lacks torch.",
                 "Pon el bueno en app/config.local.json: {\"python_comfyui\": \"/ruta/al/python\"}",
                 "Set the right one in app/config.local.json: {\"python_comfyui\": \"/path/to/python\"}")
    for prog in ("git", "ffmpeg", "ffprobe"):
        if not shutil.which(prog):
            ok = False
            paquete = {"git": "Git.Git", "ffmpeg": "Gyan.FFmpeg", "ffprobe": "Gyan.FFmpeg"}[prog] if WINDOWS else prog.replace("ffprobe", "ffmpeg")
            orden = f"winget install {paquete}  (luego cierra y abre otra vez la ventana)" if WINDOWS else f"sudo apt install {paquete}"
            problema(f"Falta {prog}.", f"{prog} is missing.", f"Instálalo con el gestor de paquetes (por ejemplo: {orden}).",
                     f"Install it with your package manager (for example: {orden.replace('luego cierra y abre otra vez la ventana', 'then close and reopen the window')}).")
    return ok


# ------------------------------------------------------------------ 2. los packs de nodos
def url_normal(u):
    u = (u or "").strip().lower().rstrip("/")
    u = re.sub(r"\.git$", "", u)
    return re.sub(r"^(git@github\.com:|https?://(www\.)?github\.com/)", "github.com/", u)


def buscar_pack(dir_nodos, pack):
    """La carpeta donde ya está este pack: la de su nombre o cualquiera con el mismo origen git (o el mismo nombre del Registry)."""
    propia = os.path.join(dir_nodos, pack["localPath"])
    if os.path.isdir(propia):
        return propia
    for nombre in sorted(os.listdir(dir_nodos)):
        d = os.path.join(dir_nodos, nombre)
        if not os.path.isdir(d) or nombre.endswith(".disabled"):
            continue
        if os.path.isdir(os.path.join(d, ".git")):
            r = correr(["git", "-C", d, "remote", "get-url", "origin"])
            if r.returncode == 0 and url_normal(r.stdout) == url_normal(pack["repository"]):
                return d
        if pack["source"] == "registry" and version_registry(d, pack["name"]):
            return d
    return None


def version_registry(d, nombre=None):
    try:
        texto = open(os.path.join(d, "pyproject.toml"), encoding="utf-8").read()
    except OSError:
        return None
    n = re.search(r'^name\s*=\s*"([^"]+)"', texto, re.M)
    v = re.search(r'^version\s*=\s*"([^"]+)"', texto, re.M)
    if nombre and (not n or n.group(1).lower() != nombre.lower()):
        return None
    return v.group(1) if v else None


def sha256(ruta, avance=False):
    h, hecho, total, t0 = hashlib.sha256(), 0, os.path.getsize(ruta), time.time()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(16 * 2 ** 20), b""):
            h.update(trozo)
            hecho += len(trozo)
            if avance and time.time() - t0 > 3:
                print(f"\r    sha256 {hecho * 100 // max(total, 1)} %", end="", flush=True)
    if avance and total > GB:
        print("\r" + " " * 30 + "\r", end="")
    return h.hexdigest()


def instalar_pack(o, pack, destino):
    if pack["source"] == "git":
        r = correr(["git", "clone", "--quiet", pack["repository"], destino])
        if r.returncode == 0:
            r = correr(["git", "-C", destino, "checkout", "--quiet", pack["gitRef"]])
        return r.returncode == 0, r.stderr.strip()
    with tempfile.TemporaryDirectory() as tmp:          # registry: el zip de cdn.comfy.org con su sha256
        zipruta = os.path.join(tmp, "node.zip")
        try:
            urllib.request.urlretrieve(pack["downloadUrl"], zipruta)
        except (urllib.error.URLError, OSError) as e:
            return False, str(e)
        if sha256(zipruta) != pack["zipSha256"]:
            return False, "sha256 del zip distinto / zip sha256 mismatch"
        with zipfile.ZipFile(zipruta) as z:
            for n in z.namelist():                      # nada fuera de la carpeta del pack
                if n.startswith("/") or ".." in n.split("/"):
                    return False, f"ruta rara en el zip: {n}"
            z.extractall(destino)
    return True, ""


def nodos(o, build, grupos):
    decir("\n2. Los packs de nodos (ComfyUI/custom_nodes)", "\n2. The node packs (ComfyUI/custom_nodes)")
    dir_nodos = os.path.join(o.comfyui_dir, "custom_nodes")
    if not os.path.isdir(dir_nodos):
        problema(f"No existe {dir_nodos}", f"{dir_nodos} does not exist")
        return []
    usados = []
    for pack in build["customNodes"]:
        if pack["grupo"] not in grupos:
            continue
        d = buscar_pack(dir_nodos, pack)
        quiere = pack.get("gitRef") or pack.get("version")
        if d is None:
            destino = os.path.join(dir_nodos, pack["localPath"])
            if o.comprobar:
                orden = "app/instalar.sh" + (" --retocar" if pack["grupo"] == "retocar" else "")
                problema(f"Falta el pack {pack['name']}.", f"The {pack['name']} pack is missing.", orden)
                continue
            if o.dry_run:
                decir(f"  · {pack['name']}: falta (se instalaría en {quiere[:7]})", f"  · {pack['name']}: missing (would install {quiere[:7]})")
                continue
            decir(f"  … {pack['name']}: instalando {quiere[:7]}", f"  … {pack['name']}: installing {quiere[:7]}")
            bien, err = instalar_pack(o, pack, destino)
            if not bien:
                shutil.rmtree(destino, ignore_errors=True)
                problema(f"{pack['name']}: no se pudo instalar ({err})", f"{pack['name']}: could not install ({err})",
                         f"Instálalo a mano desde {pack['repository']}")
                continue
            decir(f"  ✓ {pack['name']} instalado", f"  ✓ {pack['name']} installed")
            usados.append(destino)
            continue
        usados.append(d)
        if pack["source"] == "git" and os.path.isdir(os.path.join(d, ".git")):
            tiene = correr(["git", "-C", d, "rev-parse", "HEAD"]).stdout.strip()
        else:
            tiene = version_registry(d) or "?"
        if tiene == quiere:
            decir(f"  ✓ {pack['name']} ({quiere[:7]})", f"  ✓ {pack['name']} ({quiere[:7]})")
            continue
        texto_es = f"{pack['name']} está en {tiene[:7]} y lo probado es {quiere[:7]} ({os.path.basename(d)})"
        texto_en = f"{pack['name']} is at {tiene[:7]}, tested with {quiere[:7]} ({os.path.basename(d)})"
        if not o.forzar or o.dry_run or o.comprobar:
            decir("  ! " + texto_es + ". No lo toco (--forzar lo cambia).", "  ! " + texto_en + ". Left as is (--forzar changes it).")
            continue
        if pack["source"] != "git" or not os.path.isdir(os.path.join(d, ".git")):
            decir("  ! " + texto_es + ": no es git, cámbialo a mano.", "  ! " + texto_en + ": not git, change it by hand.")
            continue
        if correr(["git", "-C", d, "status", "--porcelain", "--untracked-files=no"]).stdout.strip():
            decir("  ! " + texto_es + ": tiene cambios locales, no lo toco.", "  ! " + texto_en + ": it has local changes, left as is.")
            continue
        correr(["git", "-C", d, "fetch", "--quiet", "origin"])
        r = correr(["git", "-C", d, "checkout", "--quiet", pack["gitRef"]])
        decir(f"  ✓ {pack['name']} → {quiere[:7]} (antes {tiene[:7]})" if r.returncode == 0 else f"  ✗ {pack['name']}: {r.stderr.strip()}",
              f"  ✓ {pack['name']} → {quiere[:7]} (was {tiene[:7]})" if r.returncode == 0 else f"  ✗ {pack['name']}: {r.stderr.strip()}")
    return usados


# ------------------------------------------------------------------ 3. las dependencias, en el Python de ComfyUI
def dependencias(o, carpetas):
    decir("\n3. Las dependencias (Python de ComfyUI, con torch y numpy congelados)",
          "\n3. The dependencies (ComfyUI's Python, torch and numpy frozen)")
    reqs = [os.path.join(APP, "requirements-comfyui.txt")]
    reqs += [os.path.join(c, "requirements.txt") for c in carpetas if os.path.isfile(os.path.join(c, "requirements.txt"))]
    r = correr([o.python_comfyui, "-c", "import json, importlib.metadata as m\nv={}\nfor n in %r:\n try: v[n]=m.version(n)\n except Exception: pass\nprint(json.dumps(v))" % (CONGELADOS,)])
    if r.returncode != 0:
        problema("No pude leer el Python de ComfyUI.", "Could not read ComfyUI's Python.")
        return
    congelar = json.loads(r.stdout)
    decir("  · congelados: " + ", ".join(f"{k}=={v}" for k, v in congelar.items()), "  · frozen: " + ", ".join(f"{k}=={v}" for k, v in congelar.items()))
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write("".join(f"{k}=={v}\n" for k, v in congelar.items()))
        restr = f.name
    usa_uv = shutil.which("uv") and not o.pip
    base = ["uv", "pip", "install", "--python", o.python_comfyui] if usa_uv else [o.python_comfyui, "-m", "pip", "install"]
    args = sum((["-r", x] for x in reqs), []) + ["-c", restr]
    try:
        prueba = correr(base + ["--dry-run"] + args)
        salida = (prueba.stdout + prueba.stderr).strip()
        if prueba.returncode != 0:
            problema("Las dependencias chocan con lo que tiene tu ComfyUI:", "The dependencies clash with your ComfyUI:",
                     salida[-800:])
            return
        cambios = [ln.strip() for ln in salida.splitlines() if re.match(r"^\s*(\+|-|Would install)", ln)]
        if not cambios:
            decir("  ✓ ya está todo", "  ✓ everything is already there")
            return
        decir("  · cambiaría:", "  · would change:")
        for ln in cambios:
            print("     " + ln)
        if o.dry_run or o.comprobar:
            if o.comprobar:
                problema("Faltan dependencias en el Python de ComfyUI.", "Dependencies missing in ComfyUI's Python.",
                         "app/instalar.sh  (las instala sin tocar torch ni numpy)", "app/instalar.sh  (installs them without touching torch or numpy)")
            return
        if not preguntar("¿Las instalo?", "Install them?", o):
            decir("  · saltado", "  · skipped")
            return
        r = subprocess.run(base + args)
        if r.returncode == 0:
            decir("  ✓ dependencias instaladas", "  ✓ dependencies installed")
        else:
            problema("pip falló (mira arriba).", "pip failed (see above).")
    finally:
        os.unlink(restr)


# ------------------------------------------------------------------ 4. los modelos
def bajar(url, destino, tam, avance=None, seguir=lambda: True):
    """Descarga reanudable a destino.part (Range); devuelve True si terminó con el tamaño justo.
    avance(hecho, tam, bytes_por_s) sustituye a la línea de avance (la app, modelos.py); si seguir() da False, para."""
    parte = destino + ".part"
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    cabeceras = {"User-Agent": "max-editor-instalador"}
    if os.environ.get("HF_TOKEN"):
        cabeceras["Authorization"] = "Bearer " + os.environ["HF_TOKEN"]
    for intento in range(8):
        if not seguir():
            break
        hecho = os.path.getsize(parte) if os.path.exists(parte) else 0
        if hecho >= tam:
            break
        pet = urllib.request.Request(url, headers={**cabeceras, "Range": f"bytes={hecho}-"})
        try:
            with urllib.request.urlopen(pet, timeout=60) as r, open(parte, "ab" if r.status == 206 else "wb") as f:
                if r.status != 206:
                    hecho = 0
                t0, desde = time.time(), hecho
                while True:
                    trozo = r.read(8 * 2 ** 20)
                    if not trozo or not seguir():
                        break
                    f.write(trozo)
                    hecho += len(trozo)
                    vel = (hecho - desde) / max(time.time() - t0, 0.1)
                    if avance:
                        avance(hecho, tam, vel)
                    else:
                        print(f"\r    {hecho * 100 // tam:3d} %  {gb(hecho)} / {gb(tam)}  {vel / 2 ** 20:.0f} MB/s  ", end="", flush=True)
            if not avance:
                print()
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            if not avance:
                print()
            decir(f"    ! cortado ({e}); reintento en 5 s", f"    ! interrupted ({e}); retrying in 5 s")
            time.sleep(5)
    if os.path.exists(parte) and os.path.getsize(parte) == tam:
        os.replace(parte, destino)
        return True
    return False


def buscar_modelo(dirs, m):
    """Un archivo igual (mismo tamaño) en las carpetas de --modelos: en su localPath, por su nombre o por un alias."""
    nombres = [m["localPath"]] + [os.path.join(os.path.dirname(m["localPath"]), a) for a in m.get("alias", [])]
    for d in dirs:
        for n in nombres + [os.path.basename(x) for x in nombres]:
            c = os.path.join(d, n)
            if os.path.isfile(c) and os.path.getsize(c) == m["sizeBytes"]:
                return os.path.realpath(c)
    return None


def modelos(o, build, grupos):
    decir("\n4. Los modelos (ComfyUI/models)", "\n4. The models (ComfyUI/models)")
    dir_modelos = os.path.join(o.comfyui_dir, "models")
    faltan, enlazar = [], []
    propios = [dir_modelos]                                # los alias dentro de la misma carpeta de ComfyUI
    for m in build["models"]:
        if m["grupo"] not in grupos:
            continue
        destino = os.path.join(dir_modelos, m["localPath"])
        nombre = m["localPath"]
        if os.path.isfile(destino) and os.path.getsize(destino) == m["sizeBytes"]:
            if o.verificar and sha256(destino, True) != m["sha256"]:
                problema(f"{nombre}: el sha256 no coincide (archivo dañado o distinto).", f"{nombre}: sha256 mismatch (damaged or different file).",
                         f"Bórralo y vuelve a ejecutar app/instalar.sh: {destino}", f"Delete it and run app/instalar.sh again: {destino}")
                continue
            decir(f"  ✓ {nombre}" + (" (sha256 ✓)" if o.verificar else ""))
            continue
        if os.path.lexists(destino) and not os.path.exists(destino):
            problema(f"{nombre}: es un enlace roto.", f"{nombre}: broken link.", f"Bórralo: rm \"{destino}\"", f"Delete it: rm \"{destino}\"")
            continue
        if os.path.isfile(destino):
            problema(f"{nombre}: tamaño distinto ({gb(os.path.getsize(destino))}, debería ser {gb(m['sizeBytes'])}).",
                     f"{nombre}: wrong size ({gb(os.path.getsize(destino))}, should be {gb(m['sizeBytes'])}).",
                     f"Bórralo y vuelve a ejecutar app/instalar.sh: {destino}", f"Delete it and run app/instalar.sh again: {destino}")
            continue
        origen = buscar_modelo(propios + o.modelos, m)
        if origen:
            enlazar.append((m, destino, origen))
        else:
            faltan.append((m, destino))
    for m, destino, origen in enlazar:
        if o.dry_run or o.comprobar:
            decir(f"  · {m['localPath']}: lo enlazaría a {origen}", f"  · {m['localPath']}: would link to {origen}")
            if o.comprobar:
                PROBLEMAS.append((f"{m['localPath']} sin enlazar", f"{m['localPath']} not linked", "app/instalar.sh", ""))
            continue
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        try:
            os.symlink(origen, destino)
        except OSError:                               # Windows sin «Modo de desarrollador»: un enlace duro (mismo disco)
            try:
                os.link(origen, destino)
            except OSError as e:
                problema(f"{m['localPath']}: no pude enlazarlo ({e}).", f"{m['localPath']}: could not link it ({e}).",
                         f"Cópialo a mano: {origen} → {destino}", f"Copy it by hand: {origen} → {destino}")
                continue
        decir(f"  ✓ {m['localPath']} → {origen} (enlace)", f"  ✓ {m['localPath']} → {origen} (link)")
    if not faltan:
        return
    total = sum(m["sizeBytes"] - (os.path.getsize(d + ".part") if os.path.exists(d + ".part") else 0) for m, d in faltan)
    libre = shutil.disk_usage(dir_modelos).free
    decir(f"  · faltan {len(faltan)} archivos, {gb(total)} por bajar (libres: {gb(libre)}):",
          f"  · {len(faltan)} files missing, {gb(total)} to download (free: {gb(libre)}):")
    for m, _ in faltan:
        print(f"     {m['localPath']}  ({gb(m['sizeBytes'])}, huggingface.co/{m['repo']})")
    decir(f"    a 100 Mb/s son unos {total * 8 / 1e8 / 60:.0f} min; a 500 Mb/s, unos {total * 8 / 5e8 / 60:.0f} min.",
          f"    at 100 Mb/s about {total * 8 / 1e8 / 60:.0f} min; at 500 Mb/s about {total * 8 / 5e8 / 60:.0f} min.")
    if o.comprobar:
        problema(f"Faltan {len(faltan)} modelos ({gb(total)}).", f"{len(faltan)} models missing ({gb(total)}).",
                 "app/instalar.sh  (o --modelos DIR si ya los tienes en otra carpeta)", "app/instalar.sh  (or --modelos DIR if you already have them elsewhere)")
        return
    if total > libre - 2 * GB:
        problema(f"No cabe: hacen falta {gb(total)} y hay {gb(libre)} libres.", f"Not enough disk: {gb(total)} needed, {gb(libre)} free.",
                 "Libera espacio, o usa --modelos DIR con una carpeta donde ya los tengas.", "Free some space, or use --modelos DIR with a folder that already has them.")
        return
    if o.dry_run or o.sin_modelos:
        return
    if not (o.bajar_modelos or preguntar(f"¿Bajo ahora {gb(total)} de HuggingFace?", f"Download {gb(total)} from HuggingFace now?", o, False)):
        decir("  · no bajo nada. Bájalos cuando quieras en la app › 🧩 Modelos (ahí también puedes elegir los tuyos),\n"
              "    con app/instalar.sh --bajar-modelos, o enlaza los que ya tengas con --modelos DIR.",
              "  · nothing downloaded. Get them whenever you want in the app › 🧩 Models (you can also pick your own there),\n"
              "    with app/instalar.sh --bajar-modelos, or link the ones you have with --modelos DIR.")
        return
    for m, destino in faltan:
        decir(f"  … {m['localPath']}", f"  … {m['localPath']}")
        url = f"https://huggingface.co/{m['repo']}/resolve/{m['revision']}/{m['path']}"
        if not bajar(url, destino, m["sizeBytes"]):
            problema(f"{m['localPath']}: la descarga no terminó. Vuelve a ejecutar: sigue donde se quedó.",
                     f"{m['localPath']}: download did not finish. Run again: it resumes.")
            continue
        if sha256(destino, True) != m["sha256"]:
            os.replace(destino, destino + ".malo")
            problema(f"{m['localPath']}: sha256 distinto; lo dejé como .malo.", f"{m['localPath']}: sha256 mismatch; kept as .malo.",
                     "Bórralo y vuelve a ejecutar app/instalar.sh.", "Delete it and run app/instalar.sh again.")
            continue
        decir(f"  ✓ {m['localPath']} (sha256 ✓)")


# ------------------------------------------------------------------ 5. comprobar con ComfyUI encendido
def comfyui_vivo(o, build, grupos):
    decir("\n5. ComfyUI encendido", "\n5. ComfyUI running")
    try:
        info = json.load(urllib.request.urlopen(o.comfyui_url + "/object_info", timeout=20))
    except (urllib.error.URLError, OSError, ValueError):
        decir(f"  · ComfyUI no responde en {o.comfyui_url}: arráncalo y repite con --comprobar para ver los nodos y modelos que carga.",
              f"  · ComfyUI is not answering at {o.comfyui_url}: start it and run --comprobar again to see the nodes and models it loads.")
        return
    faltan = [n for g in grupos for n in build["nodosNecesarios"][g] if n not in info]
    if faltan:
        problema("ComfyUI no carga estos nodos: " + ", ".join(faltan), "ComfyUI does not load these nodes: " + ", ".join(faltan),
                 "Reinicia ComfyUI (los packs nuevos se cargan al arrancar) y mira su log por errores de import.",
                 "Restart ComfyUI (new packs load at start) and check its log for import errors.")
    else:
        decir("  ✓ ComfyUI carga todos los nodos", "  ✓ ComfyUI loads all the nodes")
    listas = set()
    for n in ("UNETLoader", "CLIPLoader", "VAELoader", "CheckpointLoaderSimple"):
        for v in (info.get(n, {}).get("input", {}).get("required", {}) or {}).values():
            if isinstance(v, list) and v and isinstance(v[0], list):
                listas.update(v[0])
    for m in build["models"]:
        tipo = m["localPath"].split("/")[0]
        if m["grupo"] in grupos and tipo in ("diffusion_models", "text_encoders", "vae", "checkpoints") and m["filename"] not in listas:
            problema(f"ComfyUI no ve {m['filename']}", f"ComfyUI does not see {m['filename']}",
                     "Reinicia ComfyUI o pulsa «r» en su página para recargar la lista de modelos.",
                     "Restart ComfyUI or press «r» on its page to refresh the model list.")
    try:
        texto = open(os.path.join(o.comfyui_dir, "comfy_extras", "nodes_audio.py"), encoding="utf-8").read()
        if "nan_to_num" not in texto.split("def vae_decode_audio", 1)[-1][:1500]:
            decir("  · nodes_audio.py sin el arreglo de NaN (no hace falta salvo que el audio salga mudo; ver REPRODUCE.md).",
                  "  · nodes_audio.py without the NaN fix (only needed if audio comes out silent; see REPRODUCE.md).")
    except OSError:
        pass


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--comfyui-dir", required=True)
    p.add_argument("--python-comfyui", required=True)
    p.add_argument("--comfyui-url", default="http://127.0.0.1:8188")
    p.add_argument("--dry-run", action="store_true", help="enseña lo que haría, sin cambiar nada")
    p.add_argument("--comprobar", action="store_true", help="el doctor: dice qué falta y cómo arreglarlo, sin cambiar nada")
    p.add_argument("--solo-modelos", action="store_true", help="solo los modelos (ni nodos ni dependencias)")
    p.add_argument("--sin-modelos", action="store_true", help="todo menos bajar modelos (sí enlaza los de --modelos)")
    p.add_argument("--retocar", action="store_true", help="también Retocar y Extender video (7 packs + SAM 3.1, 1,7 GB)")
    p.add_argument("--modelos", action="append", default=[], metavar="DIR", help="carpeta models/ donde ya tienes modelos (se enlazan)")
    p.add_argument("--forzar", action="store_true", help="cambia al commit probado los packs que estén en otro")
    p.add_argument("--verificar", action="store_true", help="comprueba el sha256 completo de los modelos que ya están")
    p.add_argument("--bajar-modelos", action="store_true", help="baja los modelos que falten sin preguntar")
    p.add_argument("--sin-preguntas", action="store_true", help="contesta sí a todo menos a bajar modelos (para un pod o un script)")
    p.add_argument("--pip", action="store_true", help="usar pip aunque haya uv")
    o = p.parse_args()
    o.comfyui_dir = os.path.realpath(os.path.expanduser(o.comfyui_dir))
    o.modelos = [os.path.realpath(os.path.expanduser(d)) for d in o.modelos]
    build = yaml.safe_load(open(BUILD, encoding="utf-8"))["definition"]
    grupos = ["edit", "retocar"] if o.retocar else ["edit"]
    if o.dry_run:
        decir("(--dry-run: no cambio nada)", "(--dry-run: nothing is changed)")
    sistema(o, build)
    if version_comfyui(o.comfyui_dir) is None:
        return 1
    if not o.solo_modelos:
        carpetas = nodos(o, build, grupos)
        dependencias(o, carpetas)
    modelos(o, build, grupos)
    if o.comprobar:
        comfyui_vivo(o, build, grupos)
    print()
    if PROBLEMAS:
        decir(f"Quedan {len(PROBLEMAS)} cosas por arreglar (arriba, con «→» cómo):", f"{len(PROBLEMAS)} things left to fix (above, with «→» how):")
        for es, en, *_ in PROBLEMAS:
            decir("  - " + es, "  - " + en)
        return 1
    decir("✓ Todo en orden.", "✓ All good.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
