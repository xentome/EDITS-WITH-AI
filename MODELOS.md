# Modelos que usa

> Actualizado el 28 oct 2026 · Los baja y comprueba `app/instalar.sh` (fuente: [app/instalacion/comfy-build.yaml](app/instalacion/comfy-build.yaml), con revisión y sha256). Licencias leídas en la ficha de HuggingFace ese día. ❓ = falta confirmar.

| Modelo | Archivo (en `ComfyUI/models/`) | Tamaño | De dónde | Licencia |
|---|---|---|---|---|
| MiniMax H3 Singularity v1.3 int8 | `diffusion_models/Minimax-h3_Singularity_ref2va_v1.3_int8.safetensors` | 34,0 GB | [WarmBloodAban/Minimax-h3_Singularity](https://huggingface.co/WarmBloodAban/Minimax-h3_Singularity) | apache-2.0 en su ficha; es un ajuste de MiniMax H3, que tiene [su propia licencia](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) |
| Codificador de texto Qwen3-VL 32B para H3 (int8) | `text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | 27,1 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3) | [MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) |
| VAE de video de H3 (int8) | `vae/minimax_h3_video_vae_int8_convrot.safetensors` | 2,8 GB | Comfy-Org/MiniMax-H3 | ídem |
| VAE de audio de H3 | `vae/minimax_h3_audio_vae_fp32.safetensors` | 0,6 GB | Comfy-Org/MiniMax-H3 | ídem |
| Vista previa de H3 (TAE) | `vae_approx/taeh3.safetensors` | 9,8 MB | [Kijai/MiniMax-H3-TAE](https://huggingface.co/Kijai/MiniMax-H3-TAE) | apache-2.0 |
| VDN para H3 (8 pasos, int8; carpeta con sus JSON) | `vdn/vdn-minimax-h3-int8-convrot-comfyui/` | 3,5 GB | [drbaph/vdn-minimax-h3-int8-convrot-comfyui](https://huggingface.co/drbaph/vdn-minimax-h3-int8-convrot-comfyui) (de OpenVDN/vdn-minimax-h3) | [MiniMax H3 Community](https://huggingface.co/OpenVDN/vdn-minimax-h3/blob/main/LICENSE) |
| Retocar: SAM 3.1 | `checkpoints/sam3.1_multiplex_fp16.safetensors` | 1,7 GB | [Comfy-Org/sam3.1](https://huggingface.co/Comfy-Org/sam3.1) | SAM License (en el repo) |
| Opcional, LLM local: Qwen3.8 27B (GGUF IQ3_XXS) | `Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` (llama.cpp) | 9,8 GB | ❓ | ❓ |
| Opcional, visión del LLM | `mmproj-Qwen3.8-27B-BF16.gguf` (llama.cpp) | 889 MB | ❓ | ❓ |

Total: **68 GB para el edit**, +1,7 GB para Retocar y +10,7 GB si usas el LLM local.

**LoRAs:** la app no baja ninguno. Los tuyos van en `ComfyUI/models/loras/` (o se suben con «Subir LoRA» en la app) y cada uno tiene su propia licencia: léela en su ficha.

**MiniMax H3:** el uso comercial necesita una licencia aparte de MiniMax y hay regiones excluidas. Lee su licencia antes de usarlo.
