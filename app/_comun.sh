# MAX EDITOR: lo que comparten arrancar.sh y parar.sh (se carga con «.», no se ejecuta solo).
# Da: APP, REPO, PY (el Python de la app), los mensajes en el idioma del sistema, responde URL y la configuración
# (la misma que usa servidor.py: config.json, encima config.local.json y encima las variables MAX_EDITOR_<CLAVE>).

APP="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
REPO="$(dirname "$APP")"
VENV="${MAX_EDITOR_VENV:-$APP/.venv}"
PY="$VENV/bin/python"

# mensajes: español si el sistema está en español; si no, inglés
case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in es*) ES=1 ;; *) ES=0 ;; esac
decir() { if [ "$ES" = 1 ]; then echo "$1"; else echo "$2"; fi; }

if [ ! -x "$PY" ]; then
  decir "✗ Falta el entorno de la app ($VENV). Ejecuta primero: app/instalar.sh" \
        "✗ The app environment is missing ($VENV). Run first: app/instalar.sh"
  exit 1
fi

# ¿responde esta URL con un 200? (con el Python de la app: no hace falta curl)
responde() {
  "$PY" -c 'import sys, urllib.request
try:
    sys.exit(0 if urllib.request.urlopen(sys.argv[1], timeout=2).status == 200 else 1)
except Exception:
    sys.exit(1)' "$1"
}

# la configuración, en variables del shell
CONFIG_JSON="$(cd "$REPO" && "$PY" "$APP/servidor.py" --config)" || {
  decir "✗ No pude leer la configuración (app/config.json)." "✗ Could not read the configuration (app/config.json)."
  exit 1
}
eval "$("$PY" -c 'import json, shlex, sys, urllib.parse
c = json.loads(sys.argv[1])
p = urllib.parse.urlparse(c["proxy_url"])
for k, v in {"PUERTO": c["puerto"], "COMFYUI_DIR": c["comfyui_dir"], "COMFYUI_URL": c["comfyui_url"],
             "PROXY_URL": c["proxy_url"], "PROXY_HOST": p.hostname or "127.0.0.1", "PROXY_PUERTO": p.port or 80,
             "LLM_URL": c["llm_url"], "PY_TRABAJADOR": c["python_trabajador"], "MCP_PUERTO": c.get("mcp_puerto") or 8301}.items():
    print(f"{k}={shlex.quote(str(v))}")' "$CONFIG_JSON")"
APP_URL="http://127.0.0.1:$PUERTO"
PID_SERVIDOR="$APP/.servidor_$PUERTO.pid"
MCP_URL="http://127.0.0.1:$MCP_PUERTO"                    # el servidor MCP (mcp_servidor.py): para que un agente maneje la app
PID_MCP="$APP/.servidor_mcp_$MCP_PUERTO.pid"

# el proceso que escucha en un puerto (solo los de este usuario), o nada
pid_del_puerto() {
  local pid=""
  if command -v ss >/dev/null 2>&1; then
    pid="$(ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
  elif command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1)"
  fi
  echo "$pid"
}

# ¿la línea de órdenes de ese proceso contiene este texto? (para no parar nunca un proceso ajeno)
es_proceso() { [ -n "$1" ] && tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null | grep -q -- "$2"; }
