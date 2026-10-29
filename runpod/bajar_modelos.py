# Baja de Hugging Face, en paralelo y con hf_xet, los modelos de app/instalacion/comfy-build.yaml directamente a su
# localPath dentro de ComfyUI/models. Después app/instalar.sh --verificar los encuentra y comprueba su sha256.
# En un datacenter es mucho más rápido que la descarga de una en una del instalador.
# Uso: bajar_modelos.py COMFY-BUILD.YAML COMFYUI/models GRUPO...
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import yaml
from huggingface_hub import hf_hub_download

build, models, grupos = sys.argv[1], sys.argv[2], sys.argv[3:]
lista = [m for m in yaml.safe_load(open(build))["definition"]["models"] if m["grupo"] in grupos]


def bajar(m):
    destino = os.path.join(models, m["localPath"])
    if os.path.isfile(destino) and os.path.getsize(destino) == m["sizeBytes"]:
        return
    # hf_hub_download deja el archivo en local_dir/path: local_dir es lo que el localPath añade delante
    base = os.path.join(models, m["localPath"][: -len(m["path"])])
    hf_hub_download(m["repo"], m["path"], revision=m["revision"], local_dir=base)
    print(f"bajado {m['localPath']}", flush=True)


for m in lista:
    if not m["localPath"].endswith(m["path"]):
        sys.exit(f"{m['localPath']} no termina en {m['path']}: no sé dónde ponerlo")
with ThreadPoolExecutor(6) as ex:
    list(ex.map(bajar, lista))
