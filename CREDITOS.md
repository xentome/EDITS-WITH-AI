# Créditos

> Actualizado el 29 oct 2026 · Licencias leídas en el LICENSE o el `pyproject.toml` de cada proyecto, o en GitHub. ❓ = falta confirmar. Los modelos, con sus licencias, están en [MODELOS.md](MODELOS.md).

## Nodos de ComfyUI que instala `app/instalar.sh`

Todos son open source menos uno: ComfyUI_Comfyroll_CustomNodes no publica licencia (solo lo usa Retocar). (Hasta el 29 oct el edit usaba ComfyUI-MiniMax-H3-SPEED de StanLukuvka, que es PolyForm Noncommercial; se cambió por el muestreador de ComfyUI para que todo sea abierto.)

| Qué | Para qué | Autor | Licencia |
|---|---|---|---|
| ComfyUI-Fantastic-MiniMaxH3-PromptBuilder | RefMods, Stack, Prompt Builder y Text Encode de H3 | Adudeguyman | MIT |
| ComfyUI-VDN-H3 (fork VDN-H3-Plus) | muestreo en 8 pasos | OpenVDN · fork de xmarre | Apache-2.0 |
| ComfyUI-KJNodes | vista previa del modelo | kijai | GPL-3.0 |
| ComfyUI_Comfyroll_CustomNodes | Retocar: CR Aspect Ratio | Suzie1 | sin licencia publicada ❓ |
| ComfyUI-NKD-Basic-Tools | Extender: 😺NKD AV Latent Extend y AV Latent; máscaras | Nekodificador | MIT |
| ComfyUI-MiniMaxH3-Tools | Retocar: revisar el prompt (XPromptLint) | Rinne414 | MIT |
| ComfyUi-MpiNodes | Extender: guardar y cargar el latente AV de H3 (se usa como nodo, no va copiado) | MadPonyInteractive | AGPL-3.0 |
| ComfyUI-VideoHelperSuite | Retocar: juntar el video | Kosinkadink | GPL-3.0 |
| MaskVidExperiments | Retocar: recortar y devolver al sujeto | drozbay | GPL-3.0 |
| ComfyUI-NKD-Preview-Tools | Retocar: línea de tiempo | Nekodificador | MIT |

## Herramientas y métodos

| Qué | Para qué | Autor | Licencia |
|---|---|---|---|
| ComfyUI | motor de los workflows | comfyanonymous y colaboradores | GPL-3.0 |
| comfy-sdk y comfy-api-proxy | mandar el workflow a ComfyUI desde la app | Comfy Org | MIT |
| mcp (SDK de Python) | el servidor MCP de la app | Model Context Protocol | MIT |
| aiohttp | el servidor web de la app | aio-libs | Apache-2.0 |
| Extensión con máscaras (método) | Extender: la cola fijada con máscara de ruido, PR #15375 de ComfyUI | drozbay (ablejones) | GPL-3.0 (ComfyUI) |
| llama.cpp | servidor del LLM local | ggml-org | MIT |
| librosa | detectar los beats de la canción | librosa | ISC |

## Modelos

| Qué | Autor | Licencia |
|---|---|---|
| MiniMax H3 | MiniMax | MiniMax H3 Community License: el uso comercial necesita licencia aparte y hay regiones excluidas |
| Qwen3-VL (codificador de texto de H3) | Qwen | va con la licencia de H3 (ver MODELOS.md) |
| Qwen3.8 27B (LLM local, opcional) | Qwen | ❓ |
| SAM 3.1 (Retocar) | Meta | SAM License |

## Material del proyecto de ejemplo (`app/ejemplo/`)

| Qué | Autor | Licencia |
|---|---|---|
| Jane (RefMod y foto) | el autor de MAX EDITOR (xentome) | CC BY 4.0 |
| `velvet_rush.mp3` (la canción) | web de música libre de derechos | la suya (no CC BY): solo para probar la app; ver [app/ejemplo/README.md](app/ejemplo/README.md) |
