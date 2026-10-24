"""Servidor del pizarrón de la interfaz. Solo se ve dentro de Tailscale.

- Sirve index.html (la pizarra) e interfaz.html (la pantalla que dibuja Claude).
- GET  /version → cambia cuando cambia interfaz.html: la pizarra la recarga sola.
- GET  /dibujo  → las formas dibujadas (dibujo.json).
- POST /dibujo  → guarda las formas (dibujo.json) y su imagen (dibujo.svg) para que Claude la vea.

Uso: python3 servidor.py   (abre http://100.66.189.56:8091 en el PC o en el celular)
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
HOST, PUERTO = "100.66.189.56", 8091


class Pizarra(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=AQUI, **k)

    def responder(self, cuerpo, tipo="application/json"):
        datos = cuerpo.encode() if isinstance(cuerpo, str) else cuerpo
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        if self.path.startswith("/version"):
            return self.responder(json.dumps({"v": os.path.getmtime(os.path.join(AQUI, "interfaz.html"))}))
        if self.path.startswith("/dibujo"):
            ruta = os.path.join(AQUI, "dibujo.json")
            return self.responder(open(ruta).read() if os.path.exists(ruta) else '{"formas": [], "v": 0}')
        return super().do_GET()

    def end_headers(self):
        if self.path.endswith(".html") or self.path == "/":
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if not self.path.startswith("/dibujo"):
            return self.send_error(404)
        d = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        with open(os.path.join(AQUI, "dibujo.json"), "w") as f:
            json.dump({"formas": d.get("formas", []), "v": d.get("v", 0)}, f, ensure_ascii=False)
        if d.get("svg"):
            with open(os.path.join(AQUI, "dibujo.svg"), "w") as f:
                f.write(d["svg"])
        self.responder('{"ok": true}')

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"Pizarrón en http://{HOST}:{PUERTO}", flush=True)
    ThreadingHTTPServer((HOST, PUERTO), Pizarra).serve_forever()
