# MAX EDITOR

> 4 min de lectura · actualizado el 26 oct 2026 · English: [README.md](../README.md)

**En resumen**
- MAX EDITOR hace edits musicales verticales con **MiniMax H3**, en tu PC y sin servicios de pago.
- Escribes una idea y eliges tus referencias y el trozo de la canción. Un **LLM local** escribe la historia y las tomas, y el código pone los tiempos en los beats.
- Pulsas **Generar**: la app manda el workflow a tu ComfyUI con el **SDK oficial de Comfy** y te enseña el video.

## Qué necesitas

- **Linux** con una **GPU NVIDIA** (probado con una RTX 3060 de 12 GB). Unos 75 GB libres para los modelos.
- **ComfyUI** con soporte de MiniMax H3, más los custom nodes y los modelos de [plantillas/LEEME.md](plantillas/LEEME.md):
  - custom nodes: ComfyUI-Fantastic-MiniMaxH3-PromptBuilder, ComfyUI-KJNodes, ComfyUI-VDN-H3 y ComfyUI-MiniMax-H3-SPEED;
  - modelos: H3 Singularity int8, su codificador Qwen3-VL, los VAE de video y audio, taeh3 y VDN (lista en [MODELOS.md](../MODELOS.md));
  - opcional, para «Tapar»: `sam3.1_multiplex_fp16.safetensors` en `models/checkpoints/` (el nodo SAM3 ya viene con ComfyUI).
- **llama.cpp** (`llama-server`) con **Qwen3.8 27B** y su `mmproj` (visión), en `http://127.0.0.1:8080`. La app lo llama por la API de OpenAI (`/v1/chat/completions`, modelo `qwen3.8-27b`). Así lo arrancamos nosotros:
  ```
  llama-server -m Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf --mmproj mmproj-Qwen3.8-27B-BF16.gguf \
    --alias qwen3.8-27b --host 127.0.0.1 --port 8080 --jinja -ngl 99 -fa on -c 16384 --parallel 1
  ```
- **Python 3.10 o más nuevo** (o `uv`), y `ffmpeg` y `ffprobe`.
- En el Python de tu ComfyUI: `numpy`, `Pillow` y `librosa` ([requirements-comfyui.txt](requirements-comfyui.txt)).

## Instalar desde cero

1. Instala ComfyUI, los custom nodes y los modelos de arriba. Comprueba que ComfyUI abre en `http://127.0.0.1:8188`.
2. Baja este repo. Puede ir dentro de `ComfyUI/custom_nodes/` (así también tienes el nodo) o en cualquier carpeta:
   ```
   git clone https://github.com/xentome/EDITS-WITH-AI.git
   cd EDITS-WITH-AI
   ```
3. Instala la app. Crea `app/.venv` y no toca el Python de ComfyUI:
   ```
   app/instalar.sh --comfyui /ruta/a/ComfyUI
   ```
   - `--comfyui` hace falta si ComfyUI no está en `~/comfy/ComfyUI`. Se guarda en `app/config.local.json`.
   - Si te dice que al Python de ComfyUI le falta librosa, copia la orden que te enseña.
   - `--escritorio` añade «MAX EDITOR» al menú de aplicaciones.
4. Arranca ComfyUI y `llama-server`.
5. Arranca la app:
   ```
   app/arrancar.sh
   ```
   Mira ComfyUI y el LLM, arranca el proxy y el servidor si no corren, y abre `http://127.0.0.1:8300/`. Puedes ejecutarlo varias veces: no duplica nada.
6. Para pararla: `app/parar.sh`. Para el servidor y el proxy; ComfyUI y el LLM siguen como estaban.

Después de actualizar el código: `app/arrancar.sh --reiniciar`.

## Usarla

1. **Abre el ejemplo.** La primera vez se abre solo. El ejemplo del repo no cambia nunca: al elegirlo, la app hace una copia tuya («mi ejemplo») y abre esa.
   - Las fotos y los RefMods del ejemplo no van en el repo. En otro PC verás las tarjetas vacías: pon tus referencias con **+ Añadir** o **⬆ Subir foto o video**.
2. **La historia:** escribe la idea y el estilo, y pulsa **Escribir historia**. Luego **Escribir tomas**.
3. **Las tomas:** toca una toma en la línea de tiempo para ver y cambiar su prompt. Arrastra el borde entre tomas para mover el corte. El candado guarda lo tuyo: el LLM no lo cambia.
4. **La canción:** en la ventana de audio, **Cambiar canción** y arrastra la onda hasta el trozo que quieres. Tú eliges el trozo; la app no lo decide.
5. **Generar:** pulsa **▶ Generar**. Verás el avance y, al terminar, el video en **🎬 Videos**.
6. **Otra semilla:** pulsa **🎲 otra semilla** y **Generar** otra vez para otra versión del mismo edit.

Todo se guarda solo en `app/proyectos/<nombre>.json`. Los videos quedan en `app/salidas/`.

## Cómo funciona por dentro

```
 tú: idea, referencias, canción
        │
        ▼
 navegador ── http://127.0.0.1:8300 ── app/servidor.py (aiohttp)
                                          │
        ┌─────────────────────────────────┤
        ▼                                 ▼
 prompt montado por código          app/generar.py
 + LLM local (llama.cpp, :8080)     copia los valores en el workflow MiniMax H3
 (nucleo.py en app/trabajador.py)   (app/plantillas/edit_h3.api.json)
                                          │  comfy-sdk
                                          ▼
                                    comfy-api-proxy (:8199)
                                          │
                                          ▼
                                    tu ComfyUI (:8188) ── MiniMax H3 ──► video mp4
```

- **El prompt:** el LLM local escribe la historia y las tomas. El código solo pega: pone el molde de H3, los tiempos en los beats y las frases de `frases.json`. No inventa texto.
- **El video:** `generar.py` coge el workflow guardado, le pone el prompt, las referencias, la canción, la duración y la semilla, y lo lanza con **comfy-sdk**. Recibe el avance en vivo y baja el mp4.
- **Por qué el SDK:** es la forma oficial de Comfy de usar un workflow desde una app. El mismo código puede ir contra tu ComfyUI, Comfy Cloud o la Comfy API. En local hace falta `comfy-api-proxy`, que traduce la API del SDK a la de tu ComfyUI.
- **Qué partes de ComfyUI usa:** el **Comfy SDK** (`comfy-sdk` + `comfy-api-proxy`) para generar, y la API local de ComfyUI para ver y subir archivos (`/view`, `/upload/image`) y para crear RefMods y máscaras SAM.
- **La ventana** es la misma del nodo «Prompt del edit» (`web/`). La app le da un grafo hecho con la plantilla, así que se ve y funciona igual que dentro de ComfyUI.
- Las acciones del editor (audio, fotos, LLM) corren en `app/trabajador.py` con el Python de ComfyUI, porque necesitan numpy, Pillow y librosa.

## Configuración

`app/config.json` trae los valores por defecto. Para cambiarlos, crea `app/config.local.json` (no va a git) con solo lo que cambia. También valen variables `MAX_EDITOR_<CLAVE>`, por ejemplo `MAX_EDITOR_PUERTO=8310`.

| Clave | Por defecto | Qué es |
|---|---|---|
| `comfyui_dir` | `~/comfy/ComfyUI` | carpeta de ComfyUI (input, output, models) |
| `comfyui_url` | `http://127.0.0.1:8188` | tu ComfyUI |
| `proxy_url` | `http://127.0.0.1:8199` | comfy-api-proxy |
| `puerto` | `8300` | la app |
| `llm_url` | `http://127.0.0.1:8080` | llama-server |
| `python_comfyui` | vacío (se busca solo) | el Python de ComfyUI para el trabajador |
| `liberar_gpu` | `true` | antes del LLM, pide a ComfyUI que suelte la VRAM, si no está generando |

## Si algo falla

- **El punto de ComfyUI, proxy o LLM está en rojo:** ese servicio no responde. Arráncalo y espera unos segundos.
- **`value_not_in_list` al generar:** falta un modelo o tiene otro nombre (ver [plantillas/LEEME.md](plantillas/LEEME.md)).
- **El LLM dice «Loading model»:** llama-server está cargando el modelo. Espera y repite.
- **Más detalle:** `app/servidor.log` y `~/.local/state/comfy-api-proxy/proxy.log`.

Prueba de instalación desde cero (26 oct 2026) ✅: clon limpio, `instalar.sh` con uv y también con `python3 -m venv` + pip, servidor en otro puerto, `/app/salud`, la página y el ejemplo abiertos en el navegador. Sin fallos que arreglar.

## Licencia y créditos

- El código es **Apache-2.0** ([LICENSE](../LICENSE)).
- **MiniMax H3 tiene su propia licencia: el uso comercial necesita una licencia aparte de MiniMax, y excluye algunas regiones.**
- Custom nodes: ComfyUI-Fantastic-MiniMaxH3-PromptBuilder (Adudeguyman), ComfyUI-KJNodes (kijai), ComfyUI-VDN-H3 (OpenVDN; fork VDN-H3-Plus de xmarre), ComfyUI-MiniMax-H3-SPEED (StanLukuvka).
- Herramientas: ComfyUI, comfy-sdk y comfy-api-proxy (Comfy Org), llama.cpp (ggml-org), librosa.
- Modelos: MiniMax H3 (MiniMax), Qwen3-VL y Qwen3.8 (Qwen), VDN para H3 (OpenVDN, int8 de drbaph).
- Lista completa con licencias: [CREDITOS.md](../CREDITOS.md) y [MODELOS.md](../MODELOS.md).
