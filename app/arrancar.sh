#!/usr/bin/env bash
# MAX EDITOR: arranca la app con un clic. Se puede ejecutar las veces que quieras: lo que ya corre no se duplica.
#   1. mira ComfyUI (no lo arranca: es tuyo) y el LLM local;
#   2. arranca comfy-api-proxy si no responde (el puente del SDK de Comfy hacia tu ComfyUI);
#   3. arranca el servidor de la app si no responde;
#   4. arranca el servidor MCP (para que un agente maneje la app: planos/fases/11 MCP.md) si no responde;
#   5. abre el navegador.
# Opciones: --reiniciar (vuelve a arrancar el servidor de la app, por ejemplo tras actualizar el código)
#           --sin-navegador (no abre el navegador)
#           --comprobar [--retocar] (el doctor: dice qué falta y cómo arreglarlo, sin arrancar nada; es app/instalar.sh --comprobar)
# Para pararla: app/parar.sh
set -u
. "$(dirname "$(readlink -f "$0")")/_comun.sh"

REINICIAR=0; NAVEGADOR=1
if [ "${1:-}" = "--comprobar" ]; then shift; exec "$APP/instalar.sh" --comprobar "$@"; fi
for a in "$@"; do
  case "$a" in
    --reiniciar) REINICIAR=1 ;;
    --sin-navegador) NAVEGADOR=0 ;;
    *) decir "Opción desconocida: $a (usa --reiniciar, --sin-navegador o --comprobar)" "Unknown option: $a (use --reiniciar, --sin-navegador or --comprobar)"; exit 2 ;;
  esac
done

# 1. ComfyUI y el LLM: solo se miran
if responde "$COMFYUI_URL/system_stats"; then
  decir "✓ ComfyUI responde en $COMFYUI_URL" "✓ ComfyUI is running at $COMFYUI_URL"
else
  decir "✗ ComfyUI no responde en $COMFYUI_URL. Ábrelo tú (la app no lo arranca) y vuelve a ejecutar esto." \
        "✗ ComfyUI is not responding at $COMFYUI_URL. Start it yourself (the app does not) and run this again."
  decir "  Si está en otra dirección, ponla en app/config.local.json: {\"comfyui_url\": \"http://…\"}" \
        "  If it runs elsewhere, set it in app/config.local.json: {\"comfyui_url\": \"http://…\"}"
fi
if responde "$LLM_URL/health"; then
  decir "✓ LLM local responde en $LLM_URL" "✓ Local LLM is running at $LLM_URL"
else
  decir "! El LLM local no responde en $LLM_URL: la app abre, pero «Escribir historia», «Escribir tomas» y «Describir» no irán." \
        "! The local LLM is not responding at $LLM_URL: the app opens, but «Write story», «Write shots» and «Describe» won't work."
fi

# 2. el proxy del SDK (comfy-api-proxy)
if responde "$PROXY_URL/api/v2/health"; then
  decir "✓ Proxy del SDK en $PROXY_URL" "✓ SDK proxy at $PROXY_URL"
elif [ "$PROXY_HOST" != "127.0.0.1" ] && [ "$PROXY_HOST" != "localhost" ]; then
  decir "✗ El proxy no responde en $PROXY_URL (no es local: arráncalo en esa máquina)." \
        "✗ The proxy is not responding at $PROXY_URL (not local: start it on that machine)."
else
  decir "… arrancando comfy-api-proxy en el puerto $PROXY_PUERTO" "… starting comfy-api-proxy on port $PROXY_PUERTO"
  "$VENV/bin/comfy-api-proxy" start --comfyui "$COMFYUI_URL" --host "$PROXY_HOST" --port "$PROXY_PUERTO" \
    --comfyui-base-dir "$COMFYUI_DIR" || true
  for _ in $(seq 1 20); do responde "$PROXY_URL/api/v2/health" && break; sleep 0.5; done
  if responde "$PROXY_URL/api/v2/health"; then
    decir "✓ Proxy del SDK en $PROXY_URL" "✓ SDK proxy at $PROXY_URL"
  else
    decir "✗ El proxy no arrancó. Mira ~/.local/state/comfy-api-proxy/proxy.log" \
          "✗ The proxy did not start. See ~/.local/state/comfy-api-proxy/proxy.log"
  fi
fi

# 3. el servidor de la app
if [ "$REINICIAR" = 1 ] && responde "$APP_URL/app/salud"; then
  decir "… reiniciando el servidor de la app" "… restarting the app server"
  "$APP/parar.sh" --solo-app >/dev/null
fi
if responde "$APP_URL/app/salud"; then
  decir "✓ La app ya corre en $APP_URL" "✓ The app is already running at $APP_URL"
else
  ocupa="$(pid_del_puerto "$PUERTO")"
  if [ -n "$ocupa" ] && ! es_proceso "$ocupa" "servidor.py"; then
    decir "✗ El puerto $PUERTO lo usa otro programa (pid $ocupa). Cambia \"puerto\" en app/config.local.json." \
          "✗ Port $PUERTO is used by another program (pid $ocupa). Change \"puerto\" in app/config.local.json."
    exit 1
  fi
  decir "… arrancando la app (log: app/servidor.log)" "… starting the app (log: app/servidor.log)"
  cd "$REPO" || exit 1
  nohup "$PY" "$APP/servidor.py" >> "$APP/servidor.log" 2>&1 &
  echo $! > "$PID_SERVIDOR"                                  # el pid del propio servidor (para parar.sh)
  for _ in $(seq 1 40); do responde "$APP_URL/app/salud" && break; sleep 0.5; done
  if responde "$APP_URL/app/salud"; then
    decir "✓ La app corre en $APP_URL" "✓ The app is running at $APP_URL"
  else
    decir "✗ La app no arrancó. Últimas líneas de app/servidor.log:" "✗ The app did not start. Last lines of app/servidor.log:"
    tail -n 15 "$APP/servidor.log"
    exit 1
  fi
fi

# 4. el servidor MCP (con --reiniciar también se vuelve a arrancar, por si cambió su código)
if [ "$REINICIAR" = 1 ] && responde "$MCP_URL/salud"; then
  "$APP/parar.sh" --solo-mcp >/dev/null
fi
if responde "$MCP_URL/salud"; then
  decir "✓ MCP para agentes en $MCP_URL/mcp" "✓ MCP for agents at $MCP_URL/mcp"
elif ! "$PY" -c "import mcp" 2>/dev/null; then
  decir "! Falta el paquete mcp en el entorno: vuelve a ejecutar app/instalar.sh (la app funciona igual, sin agentes)." \
        "! The mcp package is missing: run app/instalar.sh again (the app works the same, without agents)."
else
  cd "$REPO" || exit 1
  mkdir -p "$APP/salidas"
  nohup "$PY" "$APP/mcp_servidor.py" >> "$APP/salidas/mcp.log" 2>&1 &
  echo $! > "$PID_MCP"
  for _ in $(seq 1 30); do responde "$MCP_URL/salud" && break; sleep 0.5; done
  if responde "$MCP_URL/salud"; then
    decir "✓ MCP para agentes en $MCP_URL/mcp  (Claude Code: claude mcp add max-editor --transport http $MCP_URL/mcp)" \
          "✓ MCP for agents at $MCP_URL/mcp  (Claude Code: claude mcp add max-editor --transport http $MCP_URL/mcp)"
  else
    decir "! El MCP no arrancó (la app funciona igual). Mira app/salidas/mcp.log" "! The MCP did not start (the app works the same). See app/salidas/mcp.log"
  fi
fi

# 5. el navegador
if [ "$NAVEGADOR" = 1 ]; then
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$APP_URL/" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then open "$APP_URL/"
  else decir "Abre en tu navegador: $APP_URL/" "Open in your browser: $APP_URL/"; fi
fi
