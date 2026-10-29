# Plantillas de MAX EDITOR

> 2 min de lectura · 26 oct 2026

**En resumen**
- `edit_h3.api.json` es el grafo de ComfyUI (formato API) con el que la app hace cada edit con MiniMax H3.
- Sale del workflow con el que salieron bien los edits del 26 oct, sin LoRAs, sin vistas previas y sin datos del usuario.
- La app pone encima los valores del proyecto. `app/generar.py` cambia el prompt, quita el nodo «Prompt del edit» y lo manda a ComfyUI.

## Qué es cada nodo

| Nodo | Tipo | Para qué |
|---|---|---|
| 2 | UNETLoader | Carga H3 Singularity int8. |
| 3 | MiniMaxH3SigmaShift | Desplaza los sigmas de video (12) y audio (3). |
| 29 | ModelAttentionBackend | Atención «comfy kitchen». |
| 28 | ModelPreviewOverrideKJ | Vista previa ligera con taeh3 mientras genera. |
| 37 | ApplyVDNH3 | VDN turbo: menos pasos con buena calidad. |
| 64 | MiniMaxChunkFeedForward | Parte el feed-forward en trozos para que quepa en 12 GB. |
| 4 | CLIPLoader | Codificador de texto Qwen3-VL de H3. |
| 5, 6 | VAELoader | VAE de video y VAE de audio. |
| 7 | MiniMaxH3RefModStack | Las referencias (RefMods). Vacío en la plantilla: lo llena la ventana. |
| 72 | LoadAudio | La canción (un archivo de `input/` de ComfyUI). Vacío en la plantilla. |
| 74 | PromptDelEdit | Nuestro nodo. Solo para la ventana («grafo de mentira»); `generar.py` lo quita antes de mandar. |
| 8 | MiniMaxH3PromptBuilder | Recibe el prompt como texto y reparte referencias y audio. |
| 9 | MiniMaxH3FantasticRefModTextEncode | Codifica prompt y referencias. Aquí van ancho, alto y `length` (fotogramas). |
| 73 | MiniMaxH3AddGuide | Mete la canción como guía del audio. |
| 33 | RandomNoise | La semilla del video. |
| 32, 35, 36, 361 | BasicScheduler, BasicGuider, SamplerCustomAdvanced, KSamplerSelect | El muestreo (8 pasos, euler), todo nodos de ComfyUI. |
| 18, 19 | VAEDecode, VAEDecodeAudio | Imagen y sonido. |
| 26 | MiniMaxH3FantasticEditComposite | Si se edita un clip con máscara (borrado), pega lo regenerado sobre el original; si no, deja pasar los fotogramas. |
| 20, 21 | CreateVideo, SaveVideo | Junta imagen y canción y guarda el mp4 (`max_editor/edit`). |

## Custom nodes que necesita

- **ComfyUI-Fantastic-MiniMaxH3-PromptBuilder** (github.com/Adudeguyman): PromptBuilder, RefModStack, RefModTextEncode y EditComposite.
- **ComfyUI-KJNodes** (github.com/kijai): ModelPreviewOverrideKJ y MiniMaxChunkFeedForward.
- **ComfyUI-VDN-H3** (en esta máquina, el fork github.com/xmarre/ComfyUI-VDN-H3-Plus): ApplyVDNH3.
- **edit_prompt_llm** (este repo): PromptDelEdit, solo para abrir la ventana dentro de ComfyUI. Para generar no hace falta.
- El resto viene con ComfyUI: SigmaShift, AddGuide, ModelAttentionBackend, los cargadores, el muestreo, CreateVideo y SaveVideo. Hace falta una versión de ComfyUI con soporte de MiniMax H3.

## Modelos (carpeta dentro de `ComfyUI/models/`)

| Archivo | Carpeta |
|---|---|
| `Minimax-h3_Singularity_ref2va_v1.3_int8.safetensors` | `diffusion_models/` |
| `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | `text_encoders/` |
| `minimax_h3_video_vae_int8_convrot.safetensors` | `vae/` |
| `minimax_h3_audio_vae_fp32.safetensors` | `vae/` |
| `taeh3.safetensors` | `vae_approx/` |
| `vdn-minimax-h3-int8-convrot-comfyui` (carpeta) | `vdn/` |

Si ComfyUI dice `value_not_in_list` en un cargador, falta ese archivo o tiene otro nombre.
