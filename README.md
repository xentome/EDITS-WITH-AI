# MAX EDITOR

**AI music edits with MiniMax H3, on your own PC.** · Versión en español: [app/LEEME.md](app/LEEME.md)

- MAX EDITOR makes vertical music edits with **MiniMax H3**, fully local, with no paid services.
- You write an idea and pick your references and the part of the song. A **local LLM** writes the story and the shots, and code places the timing on the beats.
- You press **Generate**: the app sends the workflow to your ComfyUI through the **official Comfy SDK** and shows you the video.

## Requirements

- **Linux** with an **NVIDIA GPU** (tested on an RTX 3060 12 GB). About 75 GB free for the models.
- **ComfyUI** with MiniMax H3 support, plus the custom nodes and models listed in [app/plantillas/LEEME.md](app/plantillas/LEEME.md):
  - custom nodes: ComfyUI-Fantastic-MiniMaxH3-PromptBuilder, ComfyUI-KJNodes, ComfyUI-VDN-H3 and ComfyUI-MiniMax-H3-SPEED;
  - models: H3 Singularity int8, its Qwen3-VL text encoder, the video and audio VAEs, taeh3 and VDN (sizes and sources in [MODELOS.md](MODELOS.md));
  - optional, for «cover with SAM 3.1» (Tapar): `sam3.1_multiplex_fp16.safetensors` in `models/checkpoints/` (the SAM3 node ships with ComfyUI).
- **llama.cpp** (`llama-server`) with **Qwen3.8 27B** and its `mmproj` (vision) at `http://127.0.0.1:8080`. The app uses the OpenAI-style API (`/v1/chat/completions`, model `qwen3.8-27b`). This is how we run it:
  ```
  llama-server -m Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf --mmproj mmproj-Qwen3.8-27B-BF16.gguf \
    --alias qwen3.8-27b --host 127.0.0.1 --port 8080 --jinja -ngl 99 -fa on -c 16384 --parallel 1
  ```
- **Python 3.10+** (or `uv`), plus `ffmpeg` and `ffprobe`.
- In your ComfyUI's Python: `numpy`, `Pillow` and `librosa` ([app/requirements-comfyui.txt](app/requirements-comfyui.txt)).

## Install from scratch

1. Install ComfyUI, the custom nodes and the models above. Check that ComfyUI opens at `http://127.0.0.1:8188`.
2. Get this repo. It can live inside `ComfyUI/custom_nodes/` (then you also get the ComfyUI node) or anywhere else:
   ```
   git clone https://github.com/xentome/EDITS-WITH-AI.git
   cd EDITS-WITH-AI
   ```
3. Install the app. It creates `app/.venv` and does not touch ComfyUI's Python:
   ```
   app/instalar.sh --comfyui /path/to/ComfyUI
   ```
   - `--comfyui` is needed if ComfyUI is not in `~/comfy/ComfyUI`. It is saved in `app/config.local.json`.
   - If it says ComfyUI's Python lacks librosa, run the command it prints.
   - `--escritorio` adds «MAX EDITOR» to your applications menu.
4. Start ComfyUI and `llama-server`.
5. Start the app:
   ```
   app/arrancar.sh
   ```
   It checks ComfyUI and the LLM, starts the SDK proxy and the app server if they are not running, and opens `http://127.0.0.1:8300/`. Safe to run again: nothing is started twice.
6. To stop it: `app/parar.sh`. It stops the app server and the proxy; ComfyUI and the LLM are left alone.

After updating the code: `app/arrancar.sh --reiniciar`. The scripts speak Spanish if your system is in Spanish, English otherwise.

## How to use it

1. **Open the example.** It opens by itself the first time. The example in the repo never changes: choosing it makes your own copy («my example») and opens that.
   - The example's photos and RefMods are not in the repo. On another PC the cards will be empty: add your own references with **+ Add** or **⬆ Upload photo or video**.
2. **The story:** write the idea and the style, then press **Write story**, then **Write shots**.
3. **The shots:** click a shot on the timeline to see and change its prompt. Drag the border between shots to move the cut. The lock keeps your text: the LLM won't change it.
4. **The song:** in the audio window, **Change song** and drag the waveform to the part you want. You choose the part; the app does not.
5. **Generate:** press **▶ Generate**. You see live progress and, at the end, the video under **🎬 Videos**.
6. **Another seed:** press **🎲 another seed** and **Generate** again for another take of the same edit.

Everything is saved automatically in `app/proyectos/<name>.json`. Videos go to `app/salidas/`.

## Retouch / Retocar

At the very bottom of the window, after «Final prompt», **«Retouch the video»** is a second timeline just for retouching a segment with H3 (inpainting):
- the last generated video lands there automatically; any other one via «🎬 Videos» › «Send to Retouch»;
- drag the two handles to pick the segment (always 17n+5 frames; ~3–4 min per 39 frames);
- cover the area **by text** (SAM 3.1, e.g. `face`) or by drawing a **rectangle** on the video;
- add up to 4 **reference images** of everything that must appear in the covered area and cite them in the (English) prompt as `<Picture N>`;
- «Retouch» saves the retouched segment and the full video with that segment replaced (original audio untouched) in `app/salidas/`; the full one stays on the timeline so retouches can be chained.

Code: `app/retocar.py`, `app/plantillas/retocar.api.json`, `app/web/retocar.js`; routes `POST /app/retocar`, `GET /app/video_info`, `GET /app/video`.

## How it works

```
 you: idea, references, song
        │
        ▼
 browser ── http://127.0.0.1:8300 ── app/servidor.py (aiohttp)
                                        │
        ┌───────────────────────────────┤
        ▼                               ▼
 prompt assembled by code         app/generar.py
 + local LLM (llama.cpp, :8080)   fills the MiniMax H3 workflow
 (nucleo.py in app/trabajador.py) (app/plantillas/edit_h3.api.json)
                                        │  comfy-sdk
                                        ▼
                                  comfy-api-proxy (:8199)
                                        │
                                        ▼
                                  your ComfyUI (:8188) ── MiniMax H3 ──► mp4 video
```

- **The prompt:** the local LLM writes the story and the shots. The code only glues: the H3 template, the beat timing and the phrases in `frases.json`. It never makes up text.
- **The video:** `generar.py` takes the saved workflow, sets the prompt, references, song, length and seed, and runs it with **comfy-sdk**. It gets live progress events and downloads the mp4.
- **Why the SDK:** it is Comfy's official way to run a workflow from an app. The same code can target your own ComfyUI, Comfy Cloud or the Comfy API. Locally it needs `comfy-api-proxy`, which maps the SDK's API onto your ComfyUI.
- **ComfyUI parts used:** the **Comfy SDK** (`comfy-sdk` + `comfy-api-proxy`) to generate, and the local ComfyUI API to view and upload files (`/view`, `/upload/image`) and to build RefMods and SAM masks.
- **The editor window** is the same one as the «Prompt del edit» node (`web/`). The app gives it a graph built from the template, so it looks and works exactly as inside ComfyUI.
- Editor actions (audio, images, LLM) run in `app/trabajador.py` with ComfyUI's Python, because they need numpy, Pillow and librosa.

Settings: `app/config.json` (defaults), overridden by `app/config.local.json` and by `MAX_EDITOR_<KEY>` environment variables (for example `MAX_EDITOR_PUERTO=8310`). Details in [app/LEEME.md](app/LEEME.md#configuración).

## The ComfyUI node

The same repo is also a ComfyUI custom node, «Prompt del edit (LLM)», with the editor inside ComfyUI. Put the repo in `ComfyUI/custom_nodes/` and restart ComfyUI. Example workflow in `workflows/`. Developer notes (in Spanish) start at [PLANOS.md](PLANOS.md). Quick check after any change: `python pruebas.py` (with ComfyUI's Python).

## License and credits

- The code in this repository is **Apache-2.0** ([LICENSE](LICENSE)).
- **MiniMax H3 has its own license: commercial use needs a separate license from MiniMax, and some regions are excluded.**
- Custom nodes: ComfyUI-Fantastic-MiniMaxH3-PromptBuilder (Adudeguyman), ComfyUI-KJNodes (kijai), ComfyUI-VDN-H3 (OpenVDN; VDN-H3-Plus fork by xmarre), ComfyUI-MiniMax-H3-SPEED (StanLukuvka).
- Tools: ComfyUI, comfy-sdk and comfy-api-proxy (Comfy Org), llama.cpp (ggml-org), librosa.
- Models: MiniMax H3 (MiniMax), Qwen3-VL and Qwen3.8 (Qwen), VDN for H3 (OpenVDN, int8 by drbaph).
- Full list with licenses: [CREDITOS.md](CREDITOS.md) and [MODELOS.md](MODELOS.md).
