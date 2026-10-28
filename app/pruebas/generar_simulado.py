"""generar.py de mentira para probar la app sin GPU (MAX_EDITOR_GENERAR=simulado, servidor.py): «genera» en unos segundos
copiando un video de muestra a app/salidas y lo anota en el historial, con el mismo contrato que generar.py (iniciar, estado,
cancelar, historial, plantilla, salud…). La duración: MAX_EDITOR_SIMULADO_S (por defecto 8 s)."""
import os
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import generar as _g  # noqa: E402
from generar import *  # noqa: E402,F401,F403
from generar import _anotar, _cerrojo, _nuevo, _poner, _trabajos  # noqa: E402,F401

SEGUNDOS = float(os.environ.get("MAX_EDITOR_SIMULADO_S") or 8)


def _muestra() -> str:
    ruta = os.path.join(_g.SALIDAS, ".simulado_muestra.mp4")
    if not os.path.isfile(ruta):
        os.makedirs(_g.SALIDAS, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=24:duration=0.92",
                        "-pix_fmt", "yuv420p", ruta], check=True)
    return ruta


def iniciar(valores, opciones=None):
    opciones = dict(opciones or {})
    tid = _nuevo()
    semilla = opciones.get("semilla")
    _poner(tid, semilla=semilla, job=f"simulado-{tid}")

    def correr():
        t0 = time.time()
        while time.time() - t0 < SEGUNDOS:
            with _cerrojo:
                cancelar = _trabajos[tid].get("_cancelar")
            if cancelar:                 # (_poner toma el cerrojo: fuera de él)
                _poner(tid, estado="error", mensaje="cancelado", cancelado=True)
                return
            _poner(tid, estado="generando", avance=min(0.99, (time.time() - t0) / SEGUNDOS), mensaje="generando (simulado)")
            time.sleep(0.5)
        archivo = f"edit_{datetime.now():%Y%m%d_%H%M%S}_{semilla}_sim.mp4"
        shutil.copyfile(_muestra(), os.path.join(_g.SALIDAS, archivo))
        segundos = round(time.time() - t0, 1)
        _poner(tid, estado="listo", avance=1.0, mensaje="listo", video=archivo, segundos=segundos)
        _anotar({"id": tid, "fecha": datetime.now().isoformat(timespec="seconds"), "segundos": segundos, "archivo": archivo,
                 "job": f"simulado-{tid}", "semilla": semilla, "proyecto": opciones.get("proyecto"), "simulado": True})

    threading.Thread(target=correr, daemon=True).start()
    return tid
