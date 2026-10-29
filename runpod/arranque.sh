#!/usr/bin/env bash
# MAX EDITOR en un pod de RunPod: ComfyUI v0.39.0 + torch 2.13 cu130 (lo mismo que el PC donde se hizo la app),
# los nodos y los modelos con el instalador del repo (app/instalar.sh --retocar), el LLM y la app (:8300) con su MCP (:8301).
# Lo lanza runpod/bootstrap.sh con el repo ya en /opt/max-editor. Si el contenedor se reinicia, solo vuelve a arrancar.
# Las líneas «COMFY OK», «APP OK», «LISTO» y «ERROR …» son las que mira h3pod (y quien lea los logs del pod).
set -euo pipefail
R=/opt/max-editor
C=/opt/ComfyUI
V=/opt/venv
M=$C/models
LOG=/opt/logs
mkdir -p $LOG
export PATH=/root/.local/bin:$PATH HF_XET_HIGH_PERFORMANCE=1 UV_LINK_MODE=copy UV_HTTP_TIMEOUT=300 UV_HTTP_RETRIES=8
t0=$(date +%s)
paso(){ echo "[$(( $(date +%s) - t0 ))s] $*"; }
reintentar(){ local i; for i in 1 2 3 4; do "$@" && return 0; paso "reintento $i: $1"; sleep 15; done; return 1; }

# ---------------------------------------------------------------- la GPU sirve (driver >= 580 para CUDA 13)
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader || echo "AVISO GPU: nvidia-smi falla"
drv=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
[ "${drv%%.*}" -ge 580 ] 2>/dev/null ||
  { echo "ERROR GPU: driver $drv; hace falta CUDA 13 (driver >= 580). Al crear el pod, filtra «CUDA Versions» por 13.0"; exit 1; }
# /dev/nvidia-uvm con EIO = módulo nvidia_uvm del host roto: CUDA no puede funcionar y no se arregla desde el pod
u=$(python3 -c "import os;os.close(os.open('/dev/nvidia-uvm',os.O_RDWR));print('ok')" 2>&1 | tail -1)
[ "$u" = ok ] || { echo "ERROR UVM: /dev/nvidia-uvm no abre ($u); este host está roto, borra el pod y crea otro"; exit 1; }
echo "repo: $(git -C $R log -1 --format='%h %s' | cut -c1-90)"

LL=/opt/llama LLV=b11966 LLC=13.4
arrancar_comfy(){  # lanza ComfyUI y espera /system_stats hasta 4 min; falla si el proceso muere antes
  ( cd $C && exec nohup $V/bin/python main.py --listen 0.0.0.0 --port 8188 --enable-dynamic-vram --reserve-vram 0.5 \
      --use-ck-attention --preview-method latent2rgb ) >> $LOG/comfy.log 2>&1 &
  CPID=$!
  local i; for i in $(seq 120); do
    curl -sf localhost:8188/system_stats >/dev/null && return 0
    kill -0 $CPID 2>/dev/null || return 1; sleep 2
  done; return 1
}
fallo_comfy(){ echo "ERROR COMFY: $1"; tail -40 $LOG/comfy.log | sed 's/^/comfy.log: /'; exit 1; }
arrancar_llm(){  # «Escribir historia», «Escribir tomas» y «Describir»; no es imprescindible: sin él, Generar va igual
  ( cd $M/llm && LD_LIBRARY_PATH=$LL exec nohup $LL/llama-server -m Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf \
      --alias qwen3.8-27b --host 127.0.0.1 --port 8080 --jinja --load-mode none -fa on -ngl 99 --parallel 1 -ctk q4_0 -ctv q4_0 \
      --spec-draft-type-k q4_0 --spec-draft-type-v q4_0 -b 256 -ub 128 -c 16384 --spec-type draft-mtp --spec-draft-n-max 2 \
      --mmproj mmproj-Qwen3.8-27B-BF16.gguf --no-mmproj-offload --chat-template-kwargs '{"reasoning_effort":"medium"}' \
      --sleep-idle-seconds 5 ) >> $LOG/llama.log 2>&1 &
  local i; for i in $(seq 90); do curl -sf localhost:8080/health >/dev/null && break; sleep 2; done
  curl -sf localhost:8080/health >/dev/null && echo "LLM OK: qwen3.8-27b en 127.0.0.1:8080" ||
    { echo "AVISO LLM: llama-server no responde"; tail -8 $LOG/llama.log | sed 's/^/  llama: /'; }
}
arrancar_app(){
  local s mcp
  if bash $R/app/arrancar.sh --sin-navegador >> $LOG/app.log 2>&1 && s=$(curl -sf localhost:8300/app/salud); then
    mcp=$(curl -s -o /dev/null -w '%{http_code}' localhost:8301/mcp || true)
    echo "APP OK: MAX EDITOR en el puerto 8300 $(echo "$s" | $V/bin/python -c 'import json,sys;d=json.load(sys.stdin);print(" ".join(f"{k}: {str(d[k]).lower()}" for k in ("comfyui","proxy","generar","llm")))') mcp: $([ "${mcp:-000}" != 000 ] && echo true || echo false)"
  else echo "ERROR APP: MAX EDITOR no arrancó"; tail -12 $LOG/app.log | sed 's/^/  app: /'; exit 1; fi
}

if [ -f $C/.max-editor-listo ]; then  # reinicio del contenedor con todo ya instalado
  paso "ya instalado: arrancando ComfyUI, el LLM y la app"
  arrancar_comfy || fallo_comfy "ComfyUI no arrancó"
  arrancar_llm; arrancar_app; paso "LISTO"; exit 0
fi

# ---------------------------------------------------------------- 1. ComfyUI y los modelos (en paralelo)
paso "apt + uv"
apt-get update -qq && apt-get install -y -qq git ffmpeg iproute2 >/dev/null
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null

paso "ComfyUI v0.39.0 + runpod/comfy-core.patch"
[ -d $M ] && { rm -rf /opt/models_prev; mv $M /opt/models_prev; }  # reintento en el mismo disco: se conservan los modelos
rm -rf $C
git clone -q --depth 1 --branch v0.39.0 https://github.com/comfyanonymous/ComfyUI $C
[ -d /opt/models_prev ] && { rm -rf $M; mv /opt/models_prev $M; }
# el VAE de LTX y el audio de H3 en la GPU (nan y tensores que se quedan en cuda); el mismo arreglo que el PC de la app
git -C $C apply $R/runpod/comfy-core.patch

paso "descargando modelos (~70 GB + LLM 11 GB, en segundo plano)"
( reintentar uv run -q --no-project --python 3.12 --with pyyaml --with 'huggingface_hub[hf_xet]' \
    python -I $R/runpod/bajar_modelos.py $R/app/instalacion/comfy-build.yaml $M edit retocar &&
  reintentar uvx -q --from 'huggingface_hub[hf_xet]' hf download ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF \
    Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf mmproj-Qwen3.8-27B-BF16.gguf --local-dir $M/llm >/dev/null &&
  find $M -name .cache -type d -prune -exec rm -rf {} + && echo OK ) > $LOG/modelos.log 2>&1 &
DL=$!
( while kill -0 $DL 2>/dev/null; do sleep 60; kill -0 $DL 2>/dev/null && paso "modelos: $(du -sh $M | cut -f1) de ~81G"; done ) &
( mkdir -p $LL && for p in llama cudart-llama; do
    curl -fsSL https://github.com/ggml-org/llama.cpp/releases/download/$LLV/$p-$LLV-bin-ubuntu-cuda-$LLC-x64.tar.gz |
      tar -xz -C $LL --strip-components=1 || exit 1; done; echo OK ) > $LOG/llama-bin.log 2>&1 &
LLB=$!

paso "Python 3.14 + torch 2.13.0+cu130"
rm -rf $V; uv venv -q --python 3.14 $V
TORCHI="--index-url https://download.pytorch.org/whl/cu130"
reintentar uv pip install -q --python $V/bin/python torch==2.13.0 torchvision==0.28.0 torchaudio==2.11.0 triton==3.7.1 $TORCHI
grep -vE '^(torch|torchvision|torchaudio)$' $C/requirements.txt > /opt/req.txt
reintentar uv pip install -q --python $V/bin/python -r /opt/req.txt
l=$($V/bin/python -c "import torch;torch.cuda.init();print('torch ve la GPU:',torch.cuda.get_device_name(0))" 2>&1 | tail -1) || true
case $l in "torch ve la GPU"*) echo "$l" ;; *) echo "AVISO GPU: torch: $l (se sigue; ComfyUI decide)" ;; esac

# ---------------------------------------------------------------- 2. MAX EDITOR con su instalador (nodos y dependencias)
paso "app/instalar.sh --retocar (nodos y dependencias; los modelos siguen bajando)"
ln -sfn $R $C/custom_nodes/edit_prompt_llm
# host 0.0.0.0: la app y el MCP se abren por el proxy de RunPod; liberar_gpu: el LLM y H3 se turnan la VRAM
printf '{"host": "0.0.0.0", "python_comfyui": "%s", "liberar_gpu": true}\n' $V/bin/python > $R/app/config.local.json
bash $R/app/instalar.sh --comfyui $C --retocar --sin-preguntas --sin-modelos > $LOG/instalar.log 2>&1 ||
  { echo "AVISO: instalar.sh --sin-modelos terminó con avisos (normal mientras faltan modelos):"; grep -E '✗|!' $LOG/instalar.log | tail -8 | sed 's/^/  /'; }
mkdir -p $M/refmods $C/input
if [ -d /opt/recibido/extras ]; then  # solo en pruebas (h3pod): RefMods, audios y proyectos que no son públicos
  cp -r /opt/recibido/extras/refmods/. $M/refmods/ 2>/dev/null || true
  cp -r /opt/recibido/extras/input/. $C/input/ 2>/dev/null || true
  cp -r /opt/recibido/extras/proyectos/. $R/app/proyectos/ 2>/dev/null || true
fi

# ---------------------------------------------------------------- 3. ComfyUI arranca en la GPU con todos los nodos de la app
paso "prueba de ComfyUI sin modelos"
arrancar_comfy || fallo_comfy "ComfyUI no arrancó"
if res=$($V/bin/python - $R/app 2>&1 <<'PY'
import glob,json,os,re,sys,urllib.request as u
get=lambda p: json.load(u.urlopen('http://127.0.0.1:8188'+p, timeout=120))
app=sys.argv[1]; tipos=set()
for f in ('edit_h3.api.json','retocar.api.json'):   # Generar y Retocar; Extender arma su grafo en extender.py
    tipos|={n['class_type'] for n in json.load(open(os.path.join(app,'plantillas',f))).values() if isinstance(n,dict) and 'class_type' in n}
tipos|=set(re.findall(r'"class_type":\s*"([^"]+)"',open(os.path.join(app,'extender.py')).read()))
devs=get('/system_stats')['devices']; oi=get('/object_info')
faltan=sorted(t for t in tipos if t not in oi)
cuda=[d['name'] for d in devs if d['type']=='cuda']
print(f"{cuda[0] if cuda else 'SIN CUDA'} | nodos: {len(tipos)-len(faltan)}/{len(tipos)}"+(f" faltan {faltan}" if faltan else ''))
sys.exit(0 if cuda and not faltan else 1)
PY
); then echo "COMFY OK: $res"; else fallo_comfy "$res"; fi

# ---------------------------------------------------------------- 4. modelos completos y con su sha256
wait $DL || true
grep -q '^OK$' $LOG/modelos.log || { tail -20 $LOG/modelos.log; echo "ERROR MODELOS: la descarga falló"; exit 1; }
paso "app/instalar.sh --retocar --verificar (sha256 de cada modelo)"
bash $R/app/instalar.sh --comfyui $C --retocar --sin-preguntas --verificar > $LOG/verificar.log 2>&1 ||
  { grep -E '✗|!' $LOG/verificar.log | tail -12 | sed 's/^/  /'; echo "ERROR MODELOS: instalar.sh --verificar encontró problemas"; exit 1; }
echo "MODELOS OK: $(du -sh $M | cut -f1), sha256 comprobado por el instalador"

paso "reiniciando ComfyUI con los modelos"
kill $CPID 2>/dev/null || true; wait $CPID 2>/dev/null || true
arrancar_comfy || fallo_comfy "ComfyUI no arrancó tras bajar los modelos"
paso "prueba de humo: VAE de video y de audio en la GPU"
$V/bin/python -I $R/runpod/smoke.py > $LOG/smoke.log 2>&1 && echo "PRUEBA OK: $(tail -1 $LOG/smoke.log)" ||
  fallo_comfy "PRUEBA falló: $(tail -1 $LOG/smoke.log)"

paso "LLM: llama-server $LLV (CUDA $LLC)"
if wait $LLB && grep -q '^OK$' $LOG/llama-bin.log; then arrancar_llm
else echo "AVISO LLM: no se pudo bajar llama.cpp $LLV"; tail -3 $LOG/llama-bin.log; fi
paso "MAX EDITOR y su MCP"
arrancar_app
touch $C/.max-editor-listo
paso "LISTO"
