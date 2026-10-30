"""MAX EDITOR: arrancar y parar la app en Windows (lo lanzan «Abrir MAX EDITOR.bat» y «Parar MAX EDITOR.bat» con el
Python de app\\.venv). Hace lo mismo que app/arrancar.sh y app/parar.sh:
  1. mira ComfyUI (no lo arranca: es tuyo) y el LLM local;
  2. arranca comfy-api-proxy, el servidor de la app y el MCP si no responden, cada uno en segundo plano con su log
     (app/salidas/*.log) y su pid en app/.servidor_*.pid;
  3. abre el navegador.
Uso: python arrancar_windows.py [--sin-navegador] [--parar] [--comprobar …]
Escrito el 29 oct 2026 sin un Windows a mano: también corre en Linux, donde se probó en otros puertos.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(AQUI)
REPO = os.path.dirname(APP)
SALIDAS = os.path.join(APP, "salidas")
WINDOWS = sys.platform == "win32"
BIN = os.path.dirname(sys.executable)                 # app\.venv\Scripts (o bin): aquí está comfy-api-proxy
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, AQUI)
from instalar_windows import decir  # noqa: E402  (mismos mensajes ES/EN)


def responde(url):
    try:
        return urllib.request.urlopen(url, timeout=2).status == 200
    except Exception:
        return False


def esperar(url, s=20):
    for _ in range(int(s * 2)):
        if responde(url):
            return True
        time.sleep(0.5)
    return False


def en_segundo_plano(orden, log, pid):
    """Un proceso que sigue vivo al cerrar esta ventana; su salida va a log y su pid a pid."""
    os.makedirs(SALIDAS, exist_ok=True)
    extra = {"creationflags": 0x00000008 | 0x00000200 | 0x08000000} if WINDOWS else {"start_new_session": True}
    # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
    with open(log, "ab") as fh:
        p = subprocess.Popen(orden, cwd=REPO, stdout=fh, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, close_fds=True, **extra)
    with open(pid, "w") as fh:
        fh.write(str(p.pid))


def parar_pid(pid_archivo):
    try:
        pid = int(open(pid_archivo).read().strip())
    except (OSError, ValueError):
        return False
    if WINDOWS:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        try:
            os.kill(pid, 15)
        except OSError:
            pass
    os.remove(pid_archivo)
    return True


def main():
    args = sys.argv[1:]
    if args[:1] == ["--comprobar"]:
        return subprocess.run([sys.executable, os.path.join(AQUI, "instalar_windows.py"), *args]).returncode
    r = subprocess.run([sys.executable, os.path.join(APP, "servidor.py"), "--config"], cwd=REPO, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        decir("✗ No pude leer la configuración (app/config.json).", "✗ Could not read the configuration (app/config.json).")
        return 1
    c = json.loads(r.stdout)
    app_url, mcp_url = f"http://127.0.0.1:{c['puerto']}", f"http://127.0.0.1:{c.get('mcp_puerto') or 8301}"
    proxy_puerto = int(c["proxy_url"].rsplit(":", 1)[-1].strip("/")) if c["proxy_url"].count(":") == 2 else 80
    pids = {k: os.path.join(APP, f".servidor_{k}_{c['puerto']}.pid") for k in ("app", "mcp", "proxy")}

    if "--parar" in args:
        for k, nombre in (("mcp", "MCP"), ("app", "MAX EDITOR"), ("proxy", "comfy-api-proxy")):
            if parar_pid(pids[k]):
                decir(f"✓ {nombre} parado", f"✓ {nombre} stopped")
        decir("ComfyUI y el LLM siguen como estaban.", "ComfyUI and the LLM are left as they were.")
        return 0

    # 1. ComfyUI y el LLM: solo se miran
    if responde(c["comfyui_url"] + "/system_stats"):
        decir(f"✓ ComfyUI responde en {c['comfyui_url']}", f"✓ ComfyUI is running at {c['comfyui_url']}")
    else:
        decir(f"✗ ComfyUI no responde en {c['comfyui_url']}. Ábrelo tú (la app no lo arranca) y vuelve a abrir esto.",
              f"✗ ComfyUI is not responding at {c['comfyui_url']}. Start it yourself (the app does not) and open this again.")
    if not responde(c["llm_url"] + "/health"):
        decir(f"! El LLM local no responde en {c['llm_url']}: la app abre, pero «Escribir historia» y «Escribir tomas» no irán.",
              f"! The local LLM is not responding at {c['llm_url']}: the app opens, but «Write story» and «Write shots» won't work.")

    # 2. el proxy del SDK (comfy-api-proxy run, en segundo plano)
    if not responde(c["proxy_url"] + "/api/v2/health"):
        decir(f"… arrancando comfy-api-proxy en el puerto {proxy_puerto}", f"… starting comfy-api-proxy on port {proxy_puerto}")
        proxy = os.path.join(BIN, "comfy-api-proxy.exe" if WINDOWS else "comfy-api-proxy")
        en_segundo_plano([proxy, "run", "--comfyui", c["comfyui_url"], "--host", "127.0.0.1", "--port", str(proxy_puerto),
                          "--comfyui-base-dir", c["comfyui_dir"], "--state-dir", os.path.join(APP, f".proxy_{proxy_puerto}")],
                         os.path.join(SALIDAS, "proxy.log"), pids["proxy"])
    if esperar(c["proxy_url"] + "/api/v2/health", 10):
        decir(f"✓ Proxy del SDK en {c['proxy_url']}", f"✓ SDK proxy at {c['proxy_url']}")
    else:
        decir("✗ El proxy no arrancó. Mira app/salidas/proxy.log", "✗ The proxy did not start. See app/salidas/proxy.log")

    # 3. el servidor de la app
    if not responde(app_url + "/app/salud"):
        decir("… arrancando la app (log: app/servidor.log)", "… starting the app (log: app/servidor.log)")
        en_segundo_plano([sys.executable, os.path.join(APP, "servidor.py")], os.path.join(APP, "servidor.log"), pids["app"])
    if esperar(app_url + "/app/salud"):
        decir(f"✓ La app corre en {app_url}", f"✓ The app is running at {app_url}")
    else:
        decir("✗ La app no arrancó. Mira app/servidor.log", "✗ The app did not start. See app/servidor.log")
        return 1

    # 4. el MCP (para que un agente maneje la app)
    if not responde(mcp_url + "/salud"):
        en_segundo_plano([sys.executable, os.path.join(APP, "mcp_servidor.py")], os.path.join(SALIDAS, "mcp.log"), pids["mcp"])
    if esperar(mcp_url + "/salud", 15):
        decir(f"✓ MCP para agentes en {mcp_url}/mcp", f"✓ MCP for agents at {mcp_url}/mcp")
    else:
        decir("! El MCP no arrancó (la app funciona igual). Mira app/salidas/mcp.log", "! The MCP did not start (the app works the same). See app/salidas/mcp.log")

    # 5. el navegador
    if "--sin-navegador" not in args:
        webbrowser.open(app_url + "/")
    decir("Para pararla: doble clic en «Parar MAX EDITOR».", "To stop it: double-click «Parar MAX EDITOR».")
    return 0


if __name__ == "__main__":
    sys.exit(main())
