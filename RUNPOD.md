# MAX EDITOR on RunPod (no install)

> For judges and anyone without a 12 GB NVIDIA GPU. One click creates a cloud GPU with ComfyUI, the node packs, the models, the local LLM and MAX EDITOR, all set up by this repo's own installer. You only open the app in your browser.
> You pay RunPod for the GPU with your own account, by the second, while the pod exists.

> 💡 **Tip on cost:** the app runs well on an **RTX 3090 or RTX A5000** (24 GB, about $0.16–0.30/h). Faster cards like the RTX 4090, A6000 or H100 cost 2–10× more per hour; they are a good choice if you want the extra speed and the budget allows it. If no 3090/A5000 is free, waiting a few minutes or trying Community Cloud often finds one.

## Steps

| # | Step | Time | How to check it |
|---|---|---|---|
| 1 | Open the template: **[MAX EDITOR on RunPod](https://console.runpod.io/deploy?template=srac7gh4wi)** → **Deploy** | 1 min | RunPod shows the GPU list |
| 2 | **Recommended: RTX A5000 on Secure Cloud** (~$0.27/h; fast hosts with good internet, so the install stays near 11 min). An **RTX 3090** (Community, ~$0.16–0.22/h) is just as good for the app. Any GPU with **≥ 24 GB VRAM** works; bigger cards (RTX 4090, A6000, H100…) are faster but cost more; Community Cloud hosts vary and some download slowly. In the filters, set **CUDA Versions = 13.0** | 1 min | the price shows ~$0.25–0.50/h |
| 3 | **Deploy On-Demand**. Keep the template's 100 GB container disk | — | the pod appears in *Pods* |
| 4 | Wait while it installs. Click the pod → **Logs**: every line starts with `[h3]` | **3–11 min** (30 Oct: 3 min on an RTX A5000 Secure; 11 min on an RTX 4090; up to ~25 min on a slow Community host) | the last line is `[h3] [...s] LISTO` |
| 5 | **Connect → HTTP Service 8300 (MAX EDITOR)** | — | the MAX EDITOR page opens |
| 6 | **Generate** a short video (5 s at 960×544) | **~3.5 min** on an RTX 4090 | a short video appears under **Mis videos** |
| 7 | Retocar: pick that video → **Inpainting** (mask by text with SAM 3.1) or **Extender** (continues the video) | **~1.5 min** each | a new video appears |
| 8 | Download what you want from **Mis videos**, then **Terminate** the pod (stopping it still bills the disk) | 1 min | the pod is gone from *Pods* |

What the log says while it installs: `COMFY OK` (ComfyUI runs on the GPU with every node type the app uses), `MODELOS OK` (≈80 GB, every file checked by sha256), `PRUEBA OK` (video and audio VAE on the GPU), `LLM OK`, `APP OK … mcp: true`, `LISTO`.

## What runs in the pod

- `runpod/bootstrap.sh` (the template's start script) clones this repo and runs `runpod/arranque.sh`.
- `runpod/arranque.sh`: ComfyUI **v0.39.0** with torch 2.13 + CUDA 13 (the same versions the app was built on), `app/instalar.sh --comfyui … --retocar --sin-preguntas` (10 node packs at a fixed commit), the models from Hugging Face (all public; no HF token needed) checked with `app/instalar.sh --verificar`, the local LLM (Qwen3.8-27B in llama.cpp, for «Escribir historia») and the app.
- Ports: **8300** MAX EDITOR · **8301** its MCP (`claude mcp add max-editor --transport http https://<pod-id>-8301.proxy.runpod.net/mcp`) · 8188 ComfyUI.

## Good to know

- **Cost:** $0.16–0.34/h (RTX A5000 / 3090 / A6000 / 4090, Community Cloud, 29 Oct prices). The install takes ~11 min (≈ $0.06); install plus Generate, Retocar and Extender once is about **$0.15**.
- **Privacy:** the app has no password. Its address (`https://<pod-id>-8300.proxy.runpod.net`) is only known to you; anyone with it can use your pod while it exists.
- **If the log says** `ERROR GPU` (driver older than CUDA 13) or `ERROR UVM` (a broken host): terminate the pod and deploy another one. Nothing is lost but a few minutes.
- **RAM:** the two big models are 61 GB; hosts with ≥ 60 GB of RAM work best (RunPod shows the RAM next to each GPU).

## Make your own template

The link above uses the author's public template. To build the same one in your own RunPod account (*Templates → New Template*):

| Field | Value |
|---|---|
| Type | Pod |
| Container image | `runpod/base:1.4.0-cuda1300-ubuntu2404` |
| Container disk | **100 GB** (no volume needed) |
| HTTP ports | `8300` (MAX EDITOR), `8301` (MCP), `8188` (ComfyUI) |
| TCP ports | `22` (SSH, optional) |
| Container start command | `bash -c 'printenv H3_BOOT \| base64 -d > /post_start.sh && exec /start.sh'` |
| Environment variable `H3_BOOT` | the output of `base64 -w0 runpod/bootstrap.sh` (run it in this repo) |
| Environment variable `NVIDIA_DISABLE_REQUIRE` | `1` (the script checks the GPU and CUDA itself and prints `ERROR GPU` if they don't fit) |
| Optional: `MAX_EDITOR_REPO`, `MAX_EDITOR_REF` | clone your fork or another branch instead of `xentome/EDITS-WITH-AI` › `master` |

How it works: the base image's `/start.sh` runs `/post_start.sh`, which is `runpod/bootstrap.sh`. That script only clones this repo and runs `runpod/arranque.sh`, so the template never needs to change when the repo changes. No secrets go in the template: every model comes from public Hugging Face repos.
