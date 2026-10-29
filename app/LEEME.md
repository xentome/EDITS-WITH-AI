# MAX EDITOR

> 4 min de lectura · actualizado el 28 oct 2026 · English: [README.md](../README.md)

**En resumen**
- MAX EDITOR hace edits musicales verticales con **MiniMax H3**, en tu PC y sin servicios de pago.
- Escribes una idea y eliges tus referencias y el trozo de la canción. Un **LLM local** escribe la historia y las tomas, y el código pone los tiempos en los beats.
- Pulsas **Generar**: la app manda el workflow a tu ComfyUI con el **SDK oficial de Comfy** y te enseña el video.

## Instalar

> **Necesitas:** Linux, una GPU NVIDIA de 12 GB, un [ComfyUI](https://docs.comfy.org/installation) v0.39.0 o más nuevo que ya funcione, unos 70 GB de disco y 64 GB de RAM + swap.
> **¿No lo tienes, o no conoces ComfyUI?** Usa la **plantilla de RunPod** (abajo): lo deja todo listo y tú solo usas la app.

Los tres caminos usan el mismo instalador, `app/instalar.sh`, que lee una sola lista de piezas ([instalacion/comfy-build.yaml](instalacion/comfy-build.yaml)):
- pone **11 packs de nodos** en `ComfyUI/custom_nodes/`, cada uno en el commit probado, sin pisar los que ya tienes;
- instala sus dependencias en el Python de ComfyUI con **torch, torchvision, torchaudio y numpy congelados**;
- baja los **modelos de HuggingFace** (se reanuda si se corta) y comprueba su **sha256**;
- nunca parchea ComfyUI y se puede repetir: lo que ya está se salta.

**1. Una orden (Linux)**
```
git clone https://github.com/xentome/EDITS-WITH-AI.git && cd EDITS-WITH-AI && app/instalar.sh --comfyui ~/ComfyUI --retocar
```
Luego arranca (o reinicia) ComfyUI y ejecuta `app/arrancar.sh`. Opciones: `--modelos DIR` (enlaza modelos que ya tienes), `--dry-run` (enseña lo que haría), `--comprobar` (el doctor), `--sin-preguntas` (para un pod), `--forzar`, `--verificar`, `--escritorio`. La tabla completa está en el [README](../README.md#install).

**2. Pocos clics:** baja el repo y haz doble clic en **`Instalar MAX EDITOR.desktop`**. Se abre una terminal, lo instala todo y añade **MAX EDITOR** al menú de aplicaciones.

**3. Con un agente de IA:** pega en Claude Code, Codex u otro el prompt de la sección «With an AI agent» del [README](../README.md#3-with-an-ai-agent). Instala, comprueba con el doctor y, al final, el agente se conecta al MCP de la app.

**Requisitos y tiempos (probado):** RTX 3060 de 12 GB, 46 GB de RAM + 92 GB de swap zram, ComfyUI v0.39.0. Instalar sin modelos: ~1 min. Bajar los modelos: ~1,5 h a 100 Mb/s. Un video de 22 fotogramas a 544×960: ~3 min; 5 s a 1 MP: ~16 min. Para jueces, paso a paso: [REPRODUCE.md](../REPRODUCE.md). Alternativas más ligeras (sin probar con la app): README › «Not enough RAM, VRAM or disk».

**Sin GPU o sin ComfyUI: RunPod.** Una plantilla con ComfyUI, los nodos, los modelos y MAX EDITOR ya instalados (usa este mismo instalador con `--sin-preguntas`). Eliges una GPU de 24 GB o más, esperas unos 11 min y abres la app en el navegador. Pasos, tiempos y coste: **[RUNPOD.md](../RUNPOD.md)** (en inglés).

**Opcional, el LLM local:** la app abre y genera sin él (tú escribes las tomas). Con él funcionan «Escribir tomas», «Describir» y «Traducir». Nosotros usamos **llama.cpp** con **Qwen3.8 27B** y su `mmproj` en `http://127.0.0.1:8080`:
```
llama-server -m Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf --mmproj mmproj-Qwen3.8-27B-BF16.gguf \
  --alias qwen3.8-27b --host 127.0.0.1 --port 8080 --jinja -ngl 99 -fa on -c 16384 --parallel 1
```

**Arrancar y parar:** `app/arrancar.sh` mira ComfyUI y el LLM, arranca el proxy, la app y el MCP si no corren y abre `http://127.0.0.1:8300/`. `app/parar.sh` los para; ComfyUI y el LLM siguen como estaban. Después de actualizar el código: `app/arrancar.sh --reiniciar`.

## Usarla

1. **Abre el ejemplo.** La primera vez se abre solo. El ejemplo del repo no cambia nunca: al elegirlo, la app hace una copia tuya («mi ejemplo») y abre esa.
   - Las fotos y los RefMods del ejemplo no van en el repo. En otro PC verás las tarjetas vacías: pon tus referencias con **+ Añadir** o **⬆ Subir foto o video**.
2. **La historia:** escribe la idea y el estilo, y pulsa **Escribir historia**. Luego **Escribir tomas**.
3. **Las tomas:** toca una toma en la línea de tiempo para ver y cambiar su prompt. Arrastra el borde entre tomas para mover el corte. El candado guarda lo tuyo: el LLM no lo cambia.
4. **La canción:** en la ventana de audio, **Cambiar canción** y arrastra la onda hasta el trozo que quieres. Tú eliges el trozo; la app no lo decide.
5. **Generar:** pulsa **▶ Generar**. Verás el avance y, al terminar, el video en **🎬 Videos**.
6. **Otra semilla:** pulsa **🎲 otra semilla** y **Generar** otra vez para otra versión del mismo edit.

Todo se guarda solo en `app/proyectos/<nombre>.json`. Los videos quedan en `app/salidas/`.

## Retocar (Retouch)

Abajo del todo de la ventana, después de «Prompt final», está **«Retocar el video»**: una segunda línea de tiempo solo para retocar un tramo con H3 (inpainting).
- ✅ Al acabar un ▶ Generar, el video nuevo se pone ahí solo. Para usar otro: «🎬 Videos» › «Poner en Retocar».
- ✅ Mueve el tramo con sus dos asas: siempre mide 17n+5 fotogramas (39 = 1,6 s; unos 3–4 min por cada 39).
- ✅ Marca qué tapar: **por texto** (SAM 3.1, por ejemplo `face`) o con un **rectángulo** dibujado sobre el video (para lo que SAM no encuentra, como letras estilizadas).
- ✅ Pon hasta 4 **referencias** (del Stack del proyecto, de las que se usa la foto original, o subidas) de todo lo que debe salir en la zona tapada, y cítalas en el prompt (inglés) con su `<Picture N>`.
- ✅ «Retocar» guarda en `app/salidas/` el tramo retocado (`retoque_…_tramo.mp4`) y la versión completa (`retoque_….mp4`: el original con ese tramo cambiado y el audio intacto), que queda en la línea de tiempo para encadenar otro retoque.
- Por dentro: `app/retocar.py` + `app/plantillas/retocar.api.json` (el workflow de inpainting del usuario con VDN a 8 pasos); rutas `POST /app/retocar`, `GET /app/video_info`, `GET /app/video`; el avance, en `GET /app/trabajo/<id>`. Línea de órdenes: `retocar.py datos.json [--seco]`.

## Extender video (Extend video)

En el paso Retocar hay dos pestañas: **«Inpainting / detalle»** (lo de arriba) y **«Extender video»**: alarga un video siguiendo la MISMA toma desde su final, sin corte.
- La línea de tiempo enseña el original entero, resaltado el trozo final que H3 vuelve a ver (el **solape**, 39 f por defecto) y, en rosa, lo nuevo con sus segundos. Las asas se arrastran (lo nuevo va de 17 en 17 fotogramas) o se mueven con ← →.
- **Calidad**: borrador rápido (~0,25 MP), media (~0,5 MP) u original. **Audio**: por defecto el de entrada (la canción del proyecto sigue donde iba y se pone intacta encima; un mp4 de fuera conserva su sonido y H3 continúa el de sus últimos segundos) o el del modelo. **Prompt** opcional («qué pasa después»; vacío = misma acción y misma cámara) con referencias `<Picture N>`.
- Encola como Generar y Retocar; el resultado (`extension_….mp4`) queda en la línea de tiempo para alargarlo otra vez. «🎬 Videos» › «Extender» abre cualquier video ahí.
- Generar y Extender guardan el **latente** del video (`ComfyUI/output/latents/max_editor_….latent`): con la calidad «original», la extensión sigue desde él sin pérdida; si no hay, desde el mp4 (pierde un poco de color).
- Por dentro: `app/extender.py` (😺NKD AV Latent Extend: la cola del video fijada con una máscara de ruido, el método de drozbay/ablejones; el SPEED no admite máscaras, así que va con Singularity + VDN a 8 pasos); `POST /app/extender_plan`; cola `tipo: extender`. Línea de órdenes: `extender.py datos.json [--seco]`. Plano: `planos/fases/12 Extender video.md`.

## Con un agente (MCP)

`app/arrancar.sh` también levanta un **servidor MCP** en `http://127.0.0.1:8301/mcp`: un agente (Claude Code, Claude Desktop, Cursor, Codex…) maneja la app entera y tú lo ves todo en la página, con un borde rosa **«✎ agente»** en lo que tocó (se quita al editarlo o con **Visto**).
- **Claude Code:** `claude mcp add max-editor --transport http http://127.0.0.1:8301/mcp`
- **Cursor** (`~/.cursor/mcp.json`): `{"mcpServers": {"max-editor": {"url": "http://127.0.0.1:8301/mcp"}}}`
- **Claude Desktop** (solo stdio, en `claude_desktop_config.json`): `{"mcpServers": {"max-editor": {"command": "/ruta/a/app/.venv/bin/python", "args": ["/ruta/a/app/mcp_servidor.py", "--stdio"]}}}` (la app tiene que estar abierta).

El agente recibe al conectarse lo esencial y lee la guía completa (`app/guia/`, recursos `guia://…`): cómo es la app, qué hace H3, cómo organizar las tomas y escribir para H3, cómo revisar un video y cómo trabajar contigo (tú decides lo creativo). Pide permiso antes de renders largos, nunca borra ni sobrescribe y encola como mucho 4 trabajos de una vez. Si cambias algo mientras el agente escribe, la página te deja elegir qué versión quedarte. Por dentro: `app/mcp_servidor.py` y `app/agente.py` (plano: `planos/fases/11 MCP.md`).

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
- Custom nodes: ComfyUI-Fantastic-MiniMaxH3-PromptBuilder (Adudeguyman), ComfyUI-KJNodes (kijai), ComfyUI-VDN-H3 (OpenVDN; fork VDN-H3-Plus de xmarre), ComfyUI-MiniMax-H3-SPEED (StanLukuvka), ComfyUI-NKD-Basic-Tools (Nekodificador: AV Latent Extend), ComfyUi-MpiNodes (MadPonyInteractive: guardar el latente de H3). El método de Extender es el workflow de extensión con máscaras de drozbay (ablejones), del PR #15375 de ComfyUI.
- Herramientas: ComfyUI, comfy-sdk y comfy-api-proxy (Comfy Org), llama.cpp (ggml-org), librosa.
- Modelos: MiniMax H3 (MiniMax), Qwen3-VL y Qwen3.8 (Qwen), VDN para H3 (OpenVDN, int8 de drbaph).
- Lista completa con licencias: [CREDITOS.md](../CREDITOS.md) y [MODELOS.md](../MODELOS.md).
