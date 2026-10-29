#!/usr/bin/env bash
# MAX EDITOR: prueba en limpio del instalador (como clean_clone_test.sh de Backlot). PASS/FAIL por paso.
#   1. clona este repo (lo que tiene commit) en una carpeta nueva;
#   2. clona ComfyUI limpio en la versión del YAML (sin parches ni custom nodes), desde tu ComfyUI y sin red;
#   3. ejecuta app/instalar.sh --retocar --sin-preguntas contra ese ComfyUI, con --modelos apuntando a tus modelos
#      (se enlazan: no se bajan 70 GB). Los packs de nodos sí se bajan de GitHub y del Registry (unos 100 MB);
#   4. arranca ese ComfyUI en otro puerto y pasa el doctor (--comprobar): nodos cargados y modelos visibles;
#   5. arranca la app en otros puertos (app, MCP y proxy) y mira que responda; luego lo para todo.
# Uso: app/instalacion/prueba_en_limpio.sh [CARPETA]   (por defecto ~/comfy/prueba_limpia; se borra al empezar)
# Variables: MODELOS (tus models/), COMFYUI_ORIGEN (de dónde clonar ComfyUI), PY_COMFY (Python para ese ComfyUI),
#            PUERTO_COMFY (8189), PUERTO_APP (8310), CONSERVAR=1 (no borra la carpeta al acabar).
set -u
REPO="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
DIR="${1:-$HOME/comfy/prueba_limpia}"
MODELOS="${MODELOS:-$HOME/comfy/ComfyUI/models}"
COMFYUI_ORIGEN="${COMFYUI_ORIGEN:-$HOME/comfy/ComfyUI}"
PY_COMFY="${PY_COMFY:-$HOME/ComfyUI-CLI/.venv/bin/python}"
PUERTO_COMFY="${PUERTO_COMFY:-8189}"; PUERTO_APP="${PUERTO_APP:-8310}"
VERSION="$(grep -m1 baseComfyVersion "$REPO/app/instalacion/comfy-build.yaml" | awk '{print $2}')"
FALLOS=0; PID_COMFY=""
paso() { if [ "$1" = 0 ]; then echo "PASS  $2"; else echo "FAIL  $2"; FALLOS=$((FALLOS + 1)); fi; }
limpiar() {
  [ -n "$PID_COMFY" ] && kill "$PID_COMFY" 2>/dev/null
  p="$(ss -ltnpH "sport = :$PUERTO_COMFY" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"   # el python de ComfyUI, no la subshell
  [ -n "$p" ] && [ "$(readlink -f "/proc/$p/cwd")" = "$DIR/ComfyUI" ] && kill "$p" 2>/dev/null   # solo si es el de la prueba
  [ -x "$DIR/repo/app/parar.sh" ] && (cd "$DIR/repo" && env "${ENTORNO[@]}" app/parar.sh >/dev/null 2>&1)
  [ "${CONSERVAR:-0}" = 1 ] || rm -rf "$DIR"
}
trap limpiar EXIT
case "$DIR" in "$HOME"/*/*) ;; *) echo "Carpeta poco segura para borrar: $DIR"; exit 2 ;; esac
rm -rf "$DIR"; mkdir -p "$DIR"; echo "Carpeta de prueba: $DIR"

git clone --quiet "$REPO" "$DIR/repo"; paso $? "1. clon del repo ($(git -C "$DIR/repo" log --oneline -1 | cut -c1-60))"
git clone --quiet --shared "$COMFYUI_ORIGEN" "$DIR/ComfyUI" && git -C "$DIR/ComfyUI" checkout --quiet "$VERSION" \
  && git -C "$DIR/ComfyUI" diff --quiet; paso $? "2. ComfyUI $VERSION limpio (sin parches)"
cat > "$DIR/repo/app/config.local.json" <<EOF
{"comfyui_url": "http://127.0.0.1:$PUERTO_COMFY", "proxy_url": "http://127.0.0.1:$((PUERTO_APP + 2))",
 "puerto": $PUERTO_APP, "mcp_puerto": $((PUERTO_APP + 1)), "python_comfyui": "$PY_COMFY"}
EOF
ENTORNO=(MAX_EDITOR_PUERTO="$PUERTO_APP")

T0=$(date +%s)
(cd "$DIR/repo" && app/instalar.sh --comfyui "$DIR/ComfyUI" --retocar --modelos "$MODELOS" --sin-preguntas) \
  > "$DIR/instalar.log" 2>&1
paso $? "3. app/instalar.sh --retocar --modelos (en $(( $(date +%s) - T0 )) s; log: $DIR/instalar.log)"
grep -E "✗|!" "$DIR/instalar.log" | head -20

(cd "$DIR/ComfyUI" && nohup "$PY_COMFY" main.py --listen 127.0.0.1 --port "$PUERTO_COMFY" --disable-auto-launch \
  > "$DIR/comfyui.log" 2>&1) & PID_COMFY=$!
for _ in $(seq 1 120); do curl -sf "http://127.0.0.1:$PUERTO_COMFY/system_stats" >/dev/null && break; sleep 1; done
curl -sf "http://127.0.0.1:$PUERTO_COMFY/system_stats" >/dev/null; paso $? "4a. ComfyUI limpio arranca en :$PUERTO_COMFY"
grep -E "IMPORT FAILED|Cannot import" "$DIR/comfyui.log" | head
(cd "$DIR/repo" && app/instalar.sh --comprobar --retocar) > "$DIR/comprobar.log" 2>&1
paso $? "4b. doctor (--comprobar --retocar): nodos y modelos visibles"
grep -E "✗|→" "$DIR/comprobar.log" | head -20

(cd "$DIR/repo" && app/arrancar.sh --sin-navegador) > "$DIR/arrancar.log" 2>&1
curl -sf "http://127.0.0.1:$PUERTO_APP/app/salud" >/dev/null; paso $? "5a. la app responde en :$PUERTO_APP"
curl -sf "http://127.0.0.1:$((PUERTO_APP + 1))/salud" >/dev/null; paso $? "5b. el MCP responde en :$((PUERTO_APP + 1))"
curl -sf "http://127.0.0.1:$((PUERTO_APP + 2))/api/v2/health" >/dev/null; paso $? "5c. el proxy del SDK responde"
if [ "${GENERAR:-0}" = 1 ]; then     # opcional: un video de 22 f de verdad en el ComfyUI limpio (GPU ~4 min; libera antes tu ComfyUI)
  (cd "$DIR/repo" && app/.venv/bin/python app/instalacion/generar_prueba.py "http://127.0.0.1:$PUERTO_COMFY") > "$DIR/generar.log" 2>&1
  paso $? "6. video de prueba en el ComfyUI limpio, con audio sin NaN (log: $DIR/generar.log)"
fi

echo
[ "$FALLOS" = 0 ] && echo "PRUEBA EN LIMPIO: TODO PASS" || echo "PRUEBA EN LIMPIO: $FALLOS FAIL (logs en $DIR, usa CONSERVAR=1 para verlos)"
[ "$FALLOS" = 0 ]
