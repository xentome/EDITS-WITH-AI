#!/usr/bin/env bash
# MAX EDITOR: instala el entorno de la app en app/.venv (Python 3.10+, con uv si lo tienes; si no, python3 -m venv).
# No toca el Python de ComfyUI: solo comprueba que tenga lo que necesita el trabajador y, si falta, te dice la orden.
# Opciones: --comfyui DIR   dónde está tu ComfyUI (se guarda en app/config.local.json)
#           --escritorio    crea un acceso directo «MAX EDITOR» en el menú de aplicaciones (Linux)
set -euo pipefail
APP="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
REPO="$(dirname "$APP")"
VENV="${MAX_EDITOR_VENV:-$APP/.venv}"
case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in es*) ES=1 ;; *) ES=0 ;; esac
decir() { if [ "$ES" = 1 ]; then echo "$1"; else echo "$2"; fi; }

COMFYUI=""; ESCRITORIO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --comfyui) COMFYUI="${2:?}"; shift 2 ;;
    --escritorio) ESCRITORIO=1; shift ;;
    *) decir "Opción desconocida: $1" "Unknown option: $1"; exit 2 ;;
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
if [ -n "$COMFYUI" ]; then
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
fi

# 3. el Python de ComfyUI (el trabajador lo usa para el audio y las fotos): solo se comprueba
if "$PYC" -c 'import numpy, PIL, librosa' 2>/dev/null; then
  decir "✓ El Python de ComfyUI tiene numpy, Pillow y librosa ($PYC)" "✓ ComfyUI's Python has numpy, Pillow and librosa ($PYC)"
else
  decir "✗ Al Python de ComfyUI ($PYC) le falta numpy, Pillow o librosa. Instálalos tú con:" \
        "✗ ComfyUI's Python ($PYC) lacks numpy, Pillow or librosa. Install them yourself with:"
  echo "    \"$PYC\" -m pip install -r \"$APP/requirements-comfyui.txt\""
  decir "  (si no es ese Python, pon el bueno en app/config.local.json: {\"python_comfyui\": \"/ruta/python\"})" \
        "  (if that is not the right Python, set it in app/config.local.json: {\"python_comfyui\": \"/path/python\"})"
fi
for prog in ffmpeg ffprobe; do
  command -v "$prog" >/dev/null 2>&1 || decir "✗ Falta $prog (la app lo usa para la canción y los videos subidos)." \
                                              "✗ $prog is missing (the app uses it for the song and uploaded videos)."
done

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
decir "Listo. Arranca la app con: app/arrancar.sh" "Done. Start the app with: app/arrancar.sh"
