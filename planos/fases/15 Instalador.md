# Fase 15 · Instalador

Lectura: 2 min · 28 oct 2026 · Sesión «INSTALADOR» (el handoff decía «14», pero ese número ya era «Traducir»).

**En resumen**
- `app/instalar.sh` instala todo con una orden. Lee `app/instalacion/comfy-build.yaml`, la única lista de piezas: 11 packs con su commit, 14 archivos de modelos con su repo de HF, revisión, tamaño y sha256.
- Tres caminos en el README: una orden, doble clic en `Instalar MAX EDITOR.desktop` y un prompt para un agente.
- Doctor: `app/arrancar.sh --comprobar [--retocar]`. Prueba en limpio: `app/instalacion/prueba_en_limpio.sh`, **todo PASS** el 28 oct.

## Cómo funciona
- `instalar.sh`: crea `app/.venv` → lee la config (`servidor.py --config`) → pregunta por Retocar → `instalacion/instalar.py`.
- `instalar.py`, en 5 pasos:
  1. el sistema: GPU, VRAM, RAM + swap, ComfyUI ≥ v0.39.0, su Python y torch, git y ffmpeg;
  2. los packs: busca cada uno por carpeta, por origen git o por nombre del Registry; si está en otro commit avisa y no lo toca (`--forzar` lo cambia si no tiene cambios locales). Los de git se clonan; los del Registry se bajan como zip de cdn.comfy.org con su sha256;
  3. las dependencias: `requirements-comfyui.txt` + los `requirements.txt` de los packs, con un constraint que congela torch, torchvision, torchaudio y numpy. Primero `--dry-run`, se enseña y luego se instala (uv si hay; si no, pip);
  4. los modelos: si está con el tamaño justo, ✓ (`--verificar` mira el sha256). Si no, busca un alias o lo busca en `--modelos DIR` y lo **enlaza**; si no, lo baja de `huggingface.co/<repo>/resolve/<revisión>/<ruta>` a `.part` con Range, comprueba el sha256 y le cambia el nombre. Antes mira el disco libre;
  5. con `--comprobar` y ComfyUI encendido: `/object_info` debe tener todos los nodos de `nodosNecesarios` y ver los modelos.
- Banderas: `--comfyui DIR`, `--retocar`, `--modelos DIR`, `--dry-run`, `--comprobar`, `--solo-modelos`, `--sin-modelos`, `--forzar`, `--verificar`, `--sin-preguntas` (`-y`), `--pip` y `--escritorio`.

## Hecho (con commit)
- ✅ El VAE con el nombre oficial (`minimax_h3_video_vae_int8_convrot.safetensors`) en las plantillas y en `rutas.py`. En el PC de Jonathan hay un enlace con ese nombre hacia el archivo « kj» (decidido por él).
- ✅ El YAML completo: el VDN como git (xmarre/ComfyUI-VDN-H3-Plus `b78e94d`) y los packs de Retocar y Extender. Hay dos que no salían en el informe: **NKD Preview Tools** (NKDTimeline) y **MpiNodes** (MpiSaveLatent). Faltaba también SAM 3.1.
- ✅ Un proxy en otro puerto guarda su estado en `app/.proxy_<puerto>/`. Antes, `parar.sh` de una segunda copia paraba el proxy de la primera.
- ✅ La prueba en limpio: un clon nuevo, ComfyUI v0.39.0 clonado sin parches en :8189, `--modelos` hacia los modelos de Jonathan y la app en :8310/8311/8312. Pasaron los 8 pasos. La instalación tardó 56 s.
- ✅ El parche de audio **no hace falta**: el 28 oct se generó un video de 22 f (sin canción, audio de H3) en el ComfyUI limpio sin el parche. Tardó 240 s y el audio salió sin NaN (media −22,8 dB). No se hizo el nodo propio. La prueba está en `GENERAR=1 app/instalacion/prueba_en_limpio.sh` (`instalacion/generar_prueba.py`).
- ✅ README (guía al principio), `app/LEEME.md`, `REPRODUCE.md` y `MODELOS.md` con enlaces, tamaños y licencias.

## Pendiente
- ❓ El modo demo sin GPU (`arrancar.sh --demo`): Jonathan elige el edit.
- ❓ La RAM: está probada con 46 GB + 92 GB de swap zram, pero falta medir el pico real.
- El enlace a la plantilla de RunPod (la hace la sesión RUNPOD).
- Las alternativas ligeras (H3 pruned int8 o w4a8, encoder nvfp4) están en el README pero sin probar. **No se cambian los modelos por defecto sin Jonathan.**

## Notas
- La prueba en limpio usa el Python de ComfyUI de Jonathan (`~/ComfyUI-CLI/.venv`). Las dependencias ya estaban, así que no cambió nada; un juez con otro Python sí las instalaría.
- `nkd-preview-tools` 3.12.0 sale como «Flagged» en el Registry de Comfy (el zip se baja igual y su sha256 está fijado). Solo usamos NKDTimeline en Retocar.
