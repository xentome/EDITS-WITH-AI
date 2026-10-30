#!/usr/bin/env bash
# MAX EDITOR: instala todo lo que la app necesita, con una sola orden. Se puede repetir: lo que ya está se salta.
#   1. el entorno de la app en app/.venv (Python 3.10+, con uv si lo tienes; si no, python3 -m venv);
#   2. en tu ComfyUI (app/instalacion/instalar.py, que lee app/instalacion/comfy-build.yaml): los packs de nodos en su
#      commit, sus dependencias con torch y numpy congelados y los modelos de HuggingFace con su sha256.
# Nunca parchea ComfyUI ni pisa un pack que ya tengas: solo añade.
# Opciones: --comfyui DIR     dónde está tu ComfyUI (se guarda en app/config.local.json)
#           --retocar         también Retocar y Extender video (7 packs más + SAM 3.1, 1,7 GB)
#           --modelos DIR     una carpeta models/ donde ya tienes los modelos: se enlazan en vez de bajarlos (repetible)
#           --dry-run         enseña lo que haría sin cambiar nada (solo crea app/.venv si falta)
#           --comprobar       el doctor: dice qué falta y cómo arreglarlo, sin cambiar nada
#           --solo-modelos / --sin-modelos   solo los modelos / todo menos bajar modelos
#           --forzar          cambia al commit probado los packs que estén en otro
#           --verificar       comprueba el sha256 completo de los modelos que ya tienes
#           --bajar-modelos   baja los modelos que falten sin preguntar (sin esto, pregunta; también se bajan en la app › 🧩 Modelos)
#           --sin-preguntas   contesta sí a todo menos a bajar modelos (para un pod o un script)
#           --escritorio      crea un acceso directo «MAX EDITOR» en el menú de aplicaciones (Linux)
set -euo pipefail
APP="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
REPO="$(dirname "$APP")"
VENV="${MAX_EDITOR_VENV:-$APP/.venv}"
case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in es*) ES=1 ;; *) ES=0 ;; esac
decir() { if [ "$ES" = 1 ]; then echo "$1"; else echo "$2"; fi; }

COMFYUI=""; ESCRITORIO=0; RETOCAR=0; SIN_PREGUNTAS=0; SOLO_MIRAR=0; PASAR=()
while [ $# -gt 0 ]; do
  case "$1" in
    --comfyui) COMFYUI="${2:?}"; shift 2 ;;
    --escritorio) ESCRITORIO=1; shift ;;
    --modelos) PASAR+=("--modelos" "${2:?}"); shift 2 ;;
    --retocar) RETOCAR=1; shift ;;
    --sin-preguntas|-y) SIN_PREGUNTAS=1; PASAR+=("--sin-preguntas"); shift ;;
    --dry-run|--comprobar) SOLO_MIRAR=1; PASAR+=("$1"); shift ;;
    --solo-modelos|--sin-modelos|--bajar-modelos|--forzar|--verificar|--pip) PASAR+=("$1"); shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) decir "Opción desconocida: $1 (mira app/instalar.sh --help)" "Unknown option: $1 (see app/instalar.sh --help)"; exit 2 ;;
  esac
done

# 1. el entorno de la app
if [ -x "$VENV/bin/python" ]; then
  decir "· El entorno ya existe: $VENV" "· The environment already exists: $VENV"
elif command -v uv >/dev/null 2>&1; then
  decir "… creando el entorno con uv (Python 3.12)" "… creating the environment with uv (Python 3.12)"
  uv venv --python 3.12 "$VENV"
else
  PY="${PYTHON:-python3}"
  "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || {
    decir "✗ Hace falta Python 3.10 o más nuevo (o uv). Prueba: PYTHON=python3.12 app/instalar.sh" \
          "✗ Python 3.10 or newer is required (or uv). Try: PYTHON=python3.12 app/instalar.sh"
    exit 1
  }
  decir "… creando el entorno con $("$PY" --version)" "… creating the environment with $("$PY" --version)"
  "$PY" -m venv "$VENV"
fi
decir "… instalando app/requirements.txt" "… installing app/requirements.txt"
if command -v uv >/dev/null 2>&1; then
  uv pip install --python "$VENV/bin/python" -r "$APP/requirements.txt"
else
  "$VENV/bin/python" -m pip install --upgrade pip >/dev/null
  "$VENV/bin/python" -m pip install -r "$APP/requirements.txt"
fi

# 2. dónde está ComfyUI
if [ -n "$COMFYUI" ] && [ "$SOLO_MIRAR" = 1 ]; then
  export MAX_EDITOR_COMFYUI_DIR; MAX_EDITOR_COMFYUI_DIR="$(readlink -f "$COMFYUI")"   # mirar no guarda nada
elif [ -n "$COMFYUI" ]; then
  "$VENV/bin/python" - "$APP/config.local.json" "$(readlink -f "$COMFYUI")" <<'PY'
import json, sys
ruta, carpeta = sys.argv[1], sys.argv[2]
try:
    c = json.load(open(ruta, encoding="utf-8"))
except (OSError, ValueError):
    c = {}
c["comfyui_dir"] = carpeta
json.dump(c, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
PY
  decir "✓ app/config.local.json: comfyui_dir = $COMFYUI" "✓ app/config.local.json: comfyui_dir = $COMFYUI"
fi
CONFIG_JSON="$(cd "$REPO" && "$VENV/bin/python" "$APP/servidor.py" --config)"
leer() { "$VENV/bin/python" -c 'import json, sys; print(json.loads(sys.argv[1])[sys.argv[2]])' "$CONFIG_JSON" "$1"; }
DIR="$(leer comfyui_dir)"; PYC="$(leer python_trabajador)"
if [ -f "$DIR/main.py" ]; then
  decir "✓ ComfyUI en $DIR" "✓ ComfyUI at $DIR"
else
  decir "✗ No encuentro ComfyUI en $DIR. Vuelve a ejecutar: app/instalar.sh --comfyui /ruta/a/ComfyUI" \
        "✗ ComfyUI not found at $DIR. Run again: app/instalar.sh --comfyui /path/to/ComfyUI"
  decir "  ¿No tienes ComfyUI? Instálalo (https://docs.comfy.org/installation) o usa la plantilla de RunPod del README." \
        "  No ComfyUI? Install it (https://docs.comfy.org/installation) or use the RunPod template in the README."
  exit 1
fi

# 3. tu ComfyUI: packs de nodos, dependencias y modelos (lo hace instalar.py; no se para si algo falta)
if [ "$RETOCAR" = 0 ] && [ "$SIN_PREGUNTAS" = 0 ] && [ "$SOLO_MIRAR" = 0 ] && [ -t 0 ]; then
  if [ "$ES" = 1 ]; then read -r -p "  ? ¿Instalo también Retocar y Extender video (7 packs más + SAM 3.1, 1,7 GB)? [S/n] " r
  else read -r -p "  ? Also install Retouch and Extend video (7 more packs + SAM 3.1, 1.7 GB)? [Y/n] " r; fi
  case "${r,,}" in ""|s|si|sí|y|yes) RETOCAR=1 ;; esac
fi
[ "$RETOCAR" = 1 ] && PASAR+=("--retocar")
CODIGO=0
"$VENV/bin/python" "$APP/instalacion/instalar.py" --comfyui-dir "$DIR" --python-comfyui "$PYC" \
  --comfyui-url "$(leer comfyui_url)" ${PASAR[@]+"${PASAR[@]}"} || CODIGO=$?
[ "$SOLO_MIRAR" = 1 ] && exit "$CODIGO"

# 4. acceso directo (opcional)
if [ "$ESCRITORIO" = 1 ]; then
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/max-editor.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=MAX EDITOR
Comment=AI music edits with MiniMax H3 on your own ComfyUI
Exec="$APP/arrancar.sh"
Terminal=false
Categories=AudioVideo;Video;
EOF
  decir "✓ Acceso directo: ~/.local/share/applications/max-editor.desktop" "✓ Shortcut: ~/.local/share/applications/max-editor.desktop"
fi

chmod +x "$APP/arrancar.sh" "$APP/parar.sh"
if [ "$CODIGO" = 0 ]; then
  decir "Listo. Arranca ComfyUI (o reinícialo si ya estaba abierto) y luego la app: app/arrancar.sh" \
        "Done. Start ComfyUI (or restart it if it was open), then the app: app/arrancar.sh"
else
  decir "Casi: arregla lo de arriba y vuelve a ejecutar app/instalar.sh (lo hecho se salta)." \
        "Almost: fix the items above and run app/instalar.sh again (what is done is skipped)."
fi
exit "$CODIGO"
