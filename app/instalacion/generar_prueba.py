"""MAX EDITOR: un video de prueba corto (22 f a 544×960, sin canción ni referencias) en un ComfyUI, para la prueba en limpio.
Usa la misma plantilla y el mismo generar.preparar() que la app, pero lo manda directo a ComfyUI (/prompt), sin el proxy.
Sin canción, el audio del video es el que decodifica H3 (VAEDecodeAudio): así se ve si hace falta el arreglo de NaN.
Uso: python generar_prueba.py http://127.0.0.1:8189 [semilla]   → imprime la ruta del mp4 y su volumen; sale 1 si falla.
"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import generar  # noqa: E402

URL = sys.argv[1].rstrip("/")
SEMILLA = int(sys.argv[2]) if len(sys.argv) > 2 else 2026102202
PROMPT = ("A red paper lantern sways gently in the night breeze above a quiet street, warm light flickering. "
          "Sound: soft wind and distant wind chimes.")


def pedir(ruta, datos=None):
    pet = urllib.request.Request(URL + ruta, data=json.dumps(datos).encode() if datos else None,
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(pet, timeout=30))


grafo = generar.preparar({"74": {"estado": json.dumps({"v": 4, "prompt": PROMPT, "audio_salida": "modelo"})},
                          "72": {"audio": ""},
                          "9": {"width": 544, "height": 960, "length": 22}},
                         {"semilla": SEMILLA, "prefijo": "max_editor/prueba_limpia"})
pid = pedir("/prompt", {"prompt": grafo})["prompt_id"]
print("prompt", pid, flush=True)
t0 = time.time()
while True:
    h = pedir(f"/history/{pid}").get(pid)
    if h and h.get("status", {}).get("completed") is not None or (h and h.get("outputs")):
        break
    if h and h.get("status", {}).get("status_str") == "error":
        break
    time.sleep(5)
estado = h.get("status", {})
print("estado", estado.get("status_str"), f"{time.time() - t0:.0f} s")
if estado.get("status_str") != "success":
    for m in estado.get("messages", []):
        if m[0] == "execution_error":
            print("ERROR", m[1].get("node_type"), m[1].get("exception_message"))
    sys.exit(1)
videos = [f for o in h["outputs"].values() for clave in ("images", "videos", "gifs") for f in o.get(clave, [])]
info = videos[0]
ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "video_prueba.mp4")   # se baja por /view: vale para cualquier ComfyUI
q = urllib.parse.urlencode({"filename": info["filename"], "subfolder": info.get("subfolder", ""), "type": info.get("type", "output")})
urllib.request.urlretrieve(f"{URL}/view?{q}", ruta)
print("video", ruta)
r = subprocess.run(["ffmpeg", "-hide_banner", "-i", ruta, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
vol = [ln.split("]")[-1].strip() for ln in r.stderr.splitlines() if "mean_volume" in ln or "max_volume" in ln]
print("audio", " · ".join(vol) or "sin pista de audio")
sys.exit(0 if vol and "-inf" not in vol[0] and "nan" not in " ".join(vol).lower() else 2)
