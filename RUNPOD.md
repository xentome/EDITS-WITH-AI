# MAX EDITOR on RunPod (no install)

> For judges and anyone without a 12 GB NVIDIA GPU. One click creates a cloud GPU with ComfyUI, the node packs, the models, the local LLM and MAX EDITOR, all set up by this repo's own installer. You only open the app in your browser.
> You pay RunPod for the GPU with your own account, by the second, while the pod exists.

## Steps

| # | Step | Time | How to check it |
|---|---|---|---|
| 1 | Open the template: **link coming soon** → **Deploy** | 1 min | RunPod shows the GPU list |
| 2 | Pick a GPU with **≥ 24 GB VRAM** (RTX A6000, A40, RTX A5000, RTX 4090, RTX 3090). In the filters, set **CUDA Versions = 13.0** | 1 min | the price shows ~$0.25–0.50/h |
| 3 | **Deploy On-Demand**. Keep the template's 100 GB container disk | — | the pod appears in *Pods* |
| 4 | Wait while it installs. Click the pod → **Logs**: every line starts with `[h3]` | **~11 min** (tested 29 Oct on an RTX 4090) | the last line is `[h3] [...s] LISTO` |
| 5 | **Connect → HTTP Service 8300 (MAX EDITOR)** | — | the app opens with the example project |
| 6 | **Generate** a short video (5 s at 960×544) | **~2.5 min** on an RTX 4090 | a short video appears under **Mis videos** |
| 7 | Retocar: pick that video → **Inpainting** (mask by text with SAM 3.1) or **Extender** (continues the video) | **~1.5 min** each | a new video appears |
| 8 | Download what you want from **Mis videos**, then **Terminate** the pod (stopping it still bills the disk) | 1 min | the pod is gone from *Pods* |

What the log says while it installs: `COMFY OK` (ComfyUI runs on the GPU with all 54 node types the app uses), `MODELOS OK` (≈81 GB, every file checked by sha256), `PRUEBA OK` (video and audio VAE on the GPU), `LLM OK`, `APP OK … mcp: true`, `LISTO`.

## What runs in the pod

- `runpod/bootstrap.sh` (the template's start script) clones this repo and runs `runpod/arranque.sh`.
- `runpod/arranque.sh`: ComfyUI **v0.39.0** with torch 2.13 + CUDA 13 (the same versions the app was built on), `app/instalar.sh --comfyui … --retocar --sin-preguntas` (11 node packs at a fixed commit), the models from Hugging Face (all public; no HF token needed) checked with `app/instalar.sh --verificar`, the local LLM (Qwen3.8-27B in llama.cpp, for «Escribir historia») and the app.
- Ports: **8300** MAX EDITOR · **8301** its MCP (`claude mcp add max-editor --transport http https://<pod-id>-8301.proxy.runpod.net/mcp`) · 8188 ComfyUI.

## Good to know

- **Cost:** $0.16–0.34/h (RTX A5000 / 3090 / A6000 / 4090, Community Cloud, 29 Oct prices). The install takes ~11 min (≈ $0.06); install plus Generate, Retocar and Extender once is about **$0.15**.
- **Privacy:** the app has no password. Its address (`https://<pod-id>-8300.proxy.runpod.net`) is only known to you; anyone with it can use your pod while it exists.
- **If the log says** `ERROR GPU` (driver older than CUDA 13) or `ERROR UVM` (a broken host): terminate the pod and deploy another one. Nothing is lost but a few minutes.
- **RAM:** the two big models are 61 GB; hosts with ≥ 60 GB of RAM work best (RunPod shows the RAM next to each GPU).
