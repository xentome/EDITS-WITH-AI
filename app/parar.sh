#!/usr/bin/env bash
# MAX EDITOR: para el servidor de la app y comfy-api-proxy. No toca ComfyUI ni el LLM local.
# Opción: --solo-app (deja el proxy en marcha; lo usa «arrancar.sh --reiniciar»)
# Solo para procesos que son de verdad los nuestros (mira su línea de órdenes), nunca otro programa en el mismo puerto.
set -u
. "$(dirname "$(readlink -f "$0")")/_comun.sh"

SOLO_APP=0
[ "${1:-}" = "--solo-app" ] && SOLO_APP=1

parar() {   # parar PID: SIGTERM y, si a los 10 s sigue, SIGKILL
  kill "$1" 2>/dev/null || return 0
  for _ in $(seq 1 20); do kill -0 "$1" 2>/dev/null || return 0; sleep 0.5; done
  kill -9 "$1" 2>/dev/null || true
}

# el servidor de la app: el pid que guardó arrancar.sh o, si se arrancó a mano, el que escucha en el puerto
pid="$(cat "$PID_SERVIDOR" 2>/dev/null || true)"
es_proceso "$pid" "servidor.py" || pid="$(pid_del_puerto "$PUERTO")"
if es_proceso "$pid" "servidor.py"; then
  parar "$pid"            # el servidor, al terminar, para también su trabajador
  decir "✓ App parada (pid $pid)" "✓ App stopped (pid $pid)"
else
  decir "· La app no estaba corriendo en el puerto $PUERTO" "· The app was not running on port $PUERTO"
fi
rm -f "$PID_SERVIDOR"

# el proxy: primero su propio «stop» (si se arrancó con start) y, si sigue, el que escucha en su puerto
if [ "$SOLO_APP" = 0 ]; then
  "$VENV/bin/comfy-api-proxy" stop >/dev/null 2>&1 || true
  pid="$(pid_del_puerto "$PROXY_PUERTO")"
  if es_proceso "$pid" "comfy.api.proxy"; then parar "$pid"; fi
  if responde "$PROXY_URL/api/v2/health"; then
    decir "✗ El proxy sigue respondiendo en $PROXY_URL (no es un proceso de esta app)." \
          "✗ The proxy is still responding at $PROXY_URL (not a process of this app)."
  else
    decir "✓ Proxy parado" "✓ Proxy stopped"
  fi
fi
decir "ComfyUI y el LLM siguen como estaban." "ComfyUI and the LLM are left as they were."
