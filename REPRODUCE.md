# Reproduce MAX EDITOR

> For judges and anyone who wants to check our results. Tested on 28 Oct 2026: a fresh clone against a clean ComfyUI v0.39.0 (no patches, no custom nodes), with `app/instalacion/prueba_en_limpio.sh`: **all PASS**.
> No 12 GB NVIDIA GPU or no ComfyUI? Use the RunPod template (see [README › Install](README.md#install)).

| # | Step | Time | How to check it |
|---|---|---|---|
| 0 | Have ComfyUI v0.39.0+ running once at `http://127.0.0.1:8188` ([official install](https://docs.comfy.org/installation)) | — | its page opens |
| 1 | `git clone https://github.com/xentome/EDITS-WITH-AI.git && cd EDITS-WITH-AI` | 10 s | the folder has `app/instalar.sh` |
| 2 | `app/instalar.sh --comfyui /path/to/ComfyUI --retocar --dry-run` | 30 s | it lists what it would install, and changes nothing |
| 3 | `app/instalar.sh --comfyui /path/to/ComfyUI --retocar` | ~1 min + models | it ends with `✓ All good.` |
| 3b | the models (70 GB from HuggingFace, resumable, sha256-checked) | 20 min – 1.5 h | each line says `(sha256 ✓)`; if it stops, run step 3 again and it resumes |
| 4 | Restart ComfyUI (new node packs load at start) | 1 min | no `IMPORT FAILED` in its log |
| 5 | `app/arrancar.sh --comprobar --retocar` | 20 s | `✓ ComfyUI loads all the nodes` and `✓ All good.` |
| 6 | `app/arrancar.sh` | 10 s | the browser opens `http://127.0.0.1:8300` with the example project |
| 7 | In the app: resolution **544×960**, length **22 frames**, then **Generate** | ~3 min on an RTX 3060 | a short video appears under **Mis videos** |
| 8 | Optional: 5 s at 768×1344 | ~16 min on an RTX 3060 | the full-quality edit |
| 9 | Optional: an agent drives the app: `claude mcp add max-editor --transport http http://127.0.0.1:8301/mcp` | 1 min | the agent's changes appear in the page with a pink «✎ agent» mark |

Already have the H3 models in another ComfyUI? Add `--modelos /that/ComfyUI/models` to step 3: they are linked, not downloaded.

## What the installer touches

- **Adds** folders in `ComfyUI/custom_nodes/` (packs at a fixed commit; existing packs are only reported, never changed unless you pass `--forzar`).
- **Adds** files (or links) in `ComfyUI/models/`.
- **Installs** the packs' dependencies into ComfyUI's Python with torch, torchvision, torchaudio and numpy frozen at the versions you have (step 2 shows the exact list first).
- **Creates** `app/.venv` for the app itself (comfy-sdk, comfy-api-proxy, mcp). Nothing else, and no ComfyUI file is ever patched.

## If something fails

| You see | It means | Fix |
|---|---|---|
| `value_not_in_list` when generating | a model is missing or has another name | `app/arrancar.sh --comprobar` names it; run `app/instalar.sh` again |
| `ComfyUI does not load these nodes: …` | ComfyUI was not restarted, or a pack failed to import | restart ComfyUI and look for `IMPORT FAILED` in its log |
| `sha256 mismatch` | a damaged download | delete the file it names (kept as `.malo`) and run `app/instalar.sh` again |
| `The dependencies clash with your ComfyUI` | a pack wants a different torch or numpy | the installer refuses to change them; tell us in an issue with the printed text |
| `Out of memory` / the PC freezes while loading | not enough RAM + swap for the 61 GB of models | add swap (zram), or see README › «Not enough RAM, VRAM or disk» |
| ComfyUI or the app on other ports | — | `app/config.local.json`: `{"comfyui_url": "http://127.0.0.1:8189", "puerto": 8310}` |

The parts list with every commit, URL, size and sha256: [app/instalacion/comfy-build.yaml](app/instalacion/comfy-build.yaml).
