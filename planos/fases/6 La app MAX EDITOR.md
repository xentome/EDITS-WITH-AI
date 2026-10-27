# Fase 6 · La app MAX EDITOR (mudanza del nodo a una app independiente)

Lectura: 6 min · Empezada el 26 oct 2026 · Para los ayudantes y para retomar si se corta.

**En resumen**
- El concurso pide «una app independiente, no un workflow de ComfyUI; algo que otra persona pueda abrir y usar». Informe: `~/Escritorio/DOCUMENTACION PARA EL CONCURSO/1 EL CONCURSO/3 Que es una app para Comfy.md`.
- El usuario eligió la **opción C**: una app aparte (Python + página web local) que lanza los videos en ComfyUI con el **SDK oficial de Comfy** (`comfy-sdk`) a través del `comfy-api-proxy`. Nombre: **MAX EDITOR**. Va en este mismo repo, en la carpeta `app/`.
- **Se pasa todo lo que hay, menos los LoRAs.** La ventana del nodo (`web/editor_core.js` y `web/editor/*.js`) se reutiliza **tal cual**. La app le da un «grafo de mentira» con los mismos nodos y campos que hoy lee del lienzo de ComfyUI.
- El nodo de ComfyUI **tiene que seguir funcionando** como hoy. `pruebas.py` debe seguir en TODO BIEN.
- Meta: la app lista hoy, 26 oct. Cierre del concurso: viernes 30 oct, 10:00 (Ciudad de México).

## Lo que ya está comprobado (26 oct) ✅

- `~/comfy/max_editor_app/.venv` (Python 3.12) tiene `comfy-sdk==0.5.0` y `comfy-api-proxy==0.1.6`. Es un entorno aparte: el ComfyUI del usuario no se tocó.
- El proxy corre así: `~/comfy/max_editor_app/.venv/bin/comfy-api-proxy run --comfyui http://127.0.0.1:8188 --port 8199 --comfyui-base-dir /home/jonathan/comfy/ComfyUI`. Log en `~/comfy/max_editor_app/proxy.log`. Ya está arrancado en segundo plano.
- `~/comfy/max_editor_app/pruebas/prueba_sdk.py` mandó el workflow H3 del edit (formato API, `pruebas/wf_h3_api.json`) por el SDK con `COMFY_BASE_URL=http://127.0.0.1:8199`. Recibió los eventos de avance y bajó el video: 960×544, 22 fotogramas, con audio, en 268 s. Los custom nodes y la canción del `input/` funcionaron sin cambios.
- La ventana solo depende de ComfyUI en estos puntos (todo lo demás es JS propio):
  - `abrir(node, app)` de `web/editor_core.js`: recibe el nodo «Prompt del edit» y `app`, y de ahí usa solo `app.graph` y, opcionalmente, `app.extensionManager` (ajuste del idioma y seguimiento de cambios; todo con `?.`).
  - El grafo: `graph._nodes` (cada nodo con `id`, `type`, `widgets` [{name, value, callback?}], `inputs` [{name, link, widget?}], `outputs` [{links}]), `graph.links` y `graph.getNodeById`. Ver `web/editor/util.js` (`W`, `enlace`, `origen`, `destinos`), `referencias.js` (`referenciasDelWorkflow`, `cambiarStack`), `duracion.js`, `resolucion.js` y `audio.js`.
  - Peticiones HTTP: `/edit_prompt_llm/<acción>` (nuestro `rutas.ACCIONES`), `/view?...` (vista previa de archivos), `/upload/image` (subir foto, video o audio) y `/minimax_h3/refmods` (lista de RefMods, ruta de Fantastic).
  - `rutas.py` usa `folder_paths` de ComfyUI (input, temp, models/refmods) y manda grafos a ComfyUI por `/prompt` (crear RefMods, SAM) con `_comfy()` y `_ejecutar()`.

## Cómo queda (arquitectura)

```
navegador ── http://127.0.0.1:8300 ── app/servidor.py (aiohttp, Python)
                                       ├─ /                      → app/web/index.html (la app: cabecera, Generar, avance, video, proyectos)
                                       ├─ /edit_prompt_llm/web/* → los archivos de web/ del nodo, sin copiarlos
                                       ├─ /edit_prompt_llm/<acción> → rutas.ACCIONES (con un folder_paths de la app)
                                       ├─ /view, /upload/image, /minimax_h3/refmods → reenviados a ComfyUI (8188)
                                       ├─ /app/plantilla, /app/proyectos…, /app/generar, /app/trabajo/<id>, /app/salidas/<archivo>
                                       └─ app/generar.py ── comfy_sdk ── comfy-api-proxy (8199) ── ComfyUI (8188) ── MiniMax H3
LLM local: llama.cpp en :8080 (nucleo.py ya lo usa, no cambia)
```

- **El grafo de mentira** (`app/web/grafo_falso.js`): se construye con la plantilla en formato API (`app/plantillas/edit_h3.api.json`).
  - Cada nodo de la plantilla se vuelve `{id, type: class_type, widgets, inputs, outputs}`:
    - cada entrada que no es enlace es un widget `{name, value}`;
    - cada entrada que es enlace `[origen, salida]` es un `input` con su `link`, y el nodo origen tiene ese link en `outputs[salida].links`.
  - Los valores del proyecto abierto se ponen encima.
  - `app.graph` es ese grafo; el nodo `PromptDelEdit` de la plantilla es el `node` que recibe `abrir()`.
  - Así la ventana lee y escribe igual que en ComfyUI.
- **Generar:** la app manda a `/app/generar` los valores de todos los widgets del grafo de mentira, por id de nodo. `generar.py` los copia en la plantilla (solo las entradas que no son enlaces). Después:
  - coge `prompt` del `estado` del nodo PromptDelEdit;
  - lo pone como texto en la entrada `prompt_text` del `MiniMaxH3PromptBuilder`;
  - quita el nodo PromptDelEdit y los `PreviewAny`, para que ComfyUI no necesite nuestro nodo para generar;
  - pone la carpeta de salida y lo manda por el SDK.
- **Proyecto** = un JSON en `app/proyectos/<nombre>.json` con `{nombre, guardado, valores: {id_nodo: {campo: valor}}}`. El autoguardado de la ventana (`ctx.programarGuardado`, que escribe en los widgets del nodo) se completa con un guardado del proyecto en la app.
- **Rutas de ComfyUI:** la app corre en la misma máquina que ComfyUI. Se configura con `app/config.json` (o variables de entorno): `comfyui_dir` (por defecto `~/comfy/ComfyUI`), `comfyui_url` (`http://127.0.0.1:8188`), `proxy_url` (`http://127.0.0.1:8199`), `puerto` (8300) y `llm_url`.

## Contrato entre las piezas (no cambiarlo sin avisar)

- `app/generar.py`:
  - `plantilla() -> dict`: la plantilla API.
  - `iniciar(valores: dict, opciones: dict) -> str`: lanza en un hilo y devuelve el id del trabajo. `opciones`: `{"semilla": int|None, "prefijo": str|None}`.
  - `estado(id) -> dict`: `{"estado": "en_cola"|"generando"|"listo"|"error", "avance": 0..1, "paso": int|None, "pasos": int|None, "nodo": str|None, "mensaje": str, "video": "<archivo en app/salidas>"|None, "segundos": float}`.
  - `cancelar(id)`, si el SDK lo permite.
  - Errores con texto claro, por ejemplo: «no hay prompt: escribe el plan primero» o «ComfyUI no responde en …».
- `app/servidor.py`:
  - `GET /app/plantilla`
  - `GET /app/proyectos` → `[{nombre, guardado}]`
  - `GET /app/proyecto/<nombre>`
  - `POST /app/proyecto/<nombre>` `{valores}`
  - `POST /app/generar` `{valores, semilla?}` → `{id}`
  - `GET /app/trabajo/<id>` → `estado(id)`
  - `GET /app/salidas/<archivo>` (el video)
  - `GET /app/salud` → `{comfyui: bool, proxy: bool, llm: bool}`

## Fases (marcar ✅ al terminar, con commit y push)

1. ✅ **Plantilla y generar** (ayudante «generar»): `app/plantillas/edit_h3.api.json` y `app/generar.py`, más una prueba por línea de comandos `app/pruebas/prueba_generar.py`.
   - La plantilla sale de `~/comfy/max_editor_app/pruebas/wf_h3_api.json`, que es el workflow con el que salieron los edits buenos del 26 oct. Sin LoRAs, sin `PreviewAny`, sin nada del usuario dentro del `estado`: un estado vacío y sencillo.
   - Una prueba corta (22 fotogramas) que devuelva un video. Dejar el estado con lo mínimo.
2. ✅ **Servidor y grafo de mentira** (ayudante «app»): `app/servidor.py`, `app/carpetas.py` (el `folder_paths` de la app), `app/config.json`, `app/web/index.html`, `app/web/app.js` y `app/web/grafo_falso.js`.
   - La ventana del nodo se abre a pantalla completa dentro de la app, con un proyecto de ejemplo.
   - Todas las acciones funcionan: montar, describir, historia y tomas (LLM), audio, subir foto o video con su RefMod, recortar, tapar y cajitas.
3. ✅ **Generar en la app** (falta un render de verdad desde el botón, cuando lo pida el usuario):
   - el botón «Generar» y la «Semilla del video» con un botón «🎲 otra semilla» (planos/8, «Semilla»);
   - el avance en vivo y el video al terminar (reproductor y «abrir carpeta»);
   - una lista de los videos del proyecto.
4. ✅ **Proyectos:** nuevo, abrir, guardar como y autoguardado. Un proyecto de ejemplo con el edit «MAX EDITOR for MINIMAX H3» del usuario. Va en `app/proyectos/ejemplo.json`; solo las referencias, sin subir al repo las fotos ni los RefMods del usuario.
5. ✅ **Arranque con un clic y documentación:**
   - `app/arrancar.sh`, que arranca el proxy si no está y luego el servidor, y abre el navegador;
   - `app/LEEME.md` (instalar desde cero, usar y «Cómo funciona por dentro»), `README.md` del repo y la biblioteca del concurso;
   - una prueba de instalación desde cero en una carpeta limpia.

## Reglas para los ayudantes

- **El nodo no se rompe.** Si hay que tocar `web/` o `rutas.py` para que también funcionen en la app, que sea un cambio pequeño y compatible. Después, correr `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta que salga TODO BIEN.
- **Archivos de cada uno:** «generar» solo toca `app/generar.py`, `app/plantillas/` y `app/pruebas/prueba_generar.py`; «app» toca el resto de `app/` y los cambios mínimos en `web/` y `rutas.py`. Nadie toca lo del otro.
- **Git:** commit solo de tus archivos (`git add <rutas tuyas>`, nunca `git add -A`), con mensaje en español que termine en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, y `git push`. Si sale `index.lock`, espera unos segundos y repite.
  - El repo es **privado** y sigue privado. **No subas** fotos, videos ni RefMods del usuario o de terceros: solo código, plantillas y JSON sin medios. `app/proyectos/` y `app/salidas/` van en `.gitignore`, salvo `ejemplo.json`.
- **La GPU es una sola:**
  - solo «generar» lanza renders, de 22 fotogramas como mucho;
  - antes de lanzar, mira la cola de ComfyUI (`curl -s http://127.0.0.1:8188/queue`) y no lances si hay algo del usuario;
  - nunca uses `/interrupt` ni `/free` ni reinicies ComfyUI;
  - el LLM (:8080) también es compartido.
- **Pruebas de la interfaz:**
  - en una pestaña aparte del Chromium del usuario, por CDP en el puerto 9333: abrir con `curl -s -X PUT "http://127.0.0.1:9333/json/new?<url>"` y cerrar al terminar con `curl -s http://127.0.0.1:9333/json/close/<id>`;
  - `~/.claude/jobs/6e2b8c60/tmp/ui/cdp_tab.py` (con la variable `PESTANA=<id>`: `js '…'`, `jsfile f.js`, `shot f.png`) y `shot_alto.py` (captura alta);
  - nunca recargues ni cierres las pestañas del usuario.
- **Idioma:** todo texto visible pasa por `t()` y existe en `web/i18n/es.json` y `en.json` (la app usa el mismo sistema).
- **Estilo de código:** el de la casa. Nombres en español, comentarios cortos que dicen por qué, y nada de dependencias nuevas salvo `comfy-sdk`, `comfy-api-proxy` y `aiohttp` (que ya trae el proxy).
- **Nada hacia fuera:** no publicar, no abrir Discord, no hacer público el repo y no descargar nada más sin preguntar.

## Para entender el proyecto (leer según haga falta)

- `PLANOS.md` y `planos/1`–`8`: cómo funciona el nodo, el mapa del código, el editor, las reglas y lo que funciona con H3.
- La biblioteca del concurso, `~/Escritorio/DOCUMENTACION PARA EL CONCURSO/`: `0 EMPIEZA AQUI.md`, `4 NUESTRA IDEA/1 La idea.md`, `DECISIONES.md`, `1 EL CONCURSO/3 Que es una app para Comfy.md` y `6 ENTREGA/1 Lista de entrega.md`.
- El SDK: `~/comfy/max_editor_app/.venv/lib/python3.12/site-packages/comfy_sdk/` (README en `comfy_sdk-0.5.0.dist-info/METADATA`) y el proxy en `.../comfy_api_proxy/`.
- La skill de ComfyUI local (`~/.claude/skills/comfyui-local/SKILL.md`): rutas, API y logs.

## Registro

- 26 oct: plano escrito; SDK y proxy comprobados con un render de 22 fotogramas.
- 26 oct (fase 1, «generar»): `app/plantillas/edit_h3.api.json` (sin PreviewAny, Stack y audio vacíos, estado `{"v":4}`, prefijo `max_editor/edit`) con su `LEEME.md` (nodos, custom nodes y modelos); `app/generar.py` (hilos + `Comfy` síncrono; `iniciar` nunca lanza: un fallo nace como trabajo en «error»); `app/pruebas/prueba_generar.py` (prueba seca + render). Render de 22 fotogramas por el SDK: 228 s, 960×544 con audio. Sorpresas del SDK: `Workflow.remove_node` redirige los enlaces a la única entrada del nodo quitado (el `prompt_text` habría recibido el audio), así que se quita a mano; el `value` de Progress no sirve como avance total (marca 99 % a los 2 s), así que `generar.py` lo estima por fases; el cliente no acepta `base_url`, solo `COMFY_BASE_URL`; `cancelar` usa el cancel del proxy (solo ese trabajo); `LoadAudio` solo acepta archivos de `input/`.
- 26 oct (fases 2–4, «app»): `app/servidor.py` (aiohttp en 127.0.0.1:8300) con las rutas del contrato, más `GET /app/videos?proyecto=`, `POST /app/cancelar/<id>` y `POST /app/abrir_carpeta`. Sorpresa: el Python de la app no tiene numpy, Pillow ni librosa (nucleo.py los necesita), así que las acciones del editor corren en `app/trabajador.py`, un proceso aparte con el **Python de ComfyUI** (`python_comfyui` en config; si está vacío se busca: `<ComfyUI>/.venv`, `venv`, `~/ComfyUI-CLI/.venv`). Habla por stdin/stdout en JSON, una petición por hilo; registra `app/carpetas.py` como `folder_paths`, un `comfy.cli_args` con el puerto y el paquete del nodo sin ejecutar su `__init__.py`; recarga rutas/nucleo/i18n si cambian; antes del LLM mira la cola y hace `/free` como el nodo (`liberar_gpu`), y la VRAM la pregunta a `/system_stats` (sin torch). `app/web/grafo_falso.js` (construir, valoresDe, ponerValores) y `app/web/index.html` + `app.js`: cabecera (proyecto nuevo/abrir/guardar como, salud, semilla con 🎲, ▶ Generar, 🎬 Videos, ES|EN) y la ventana del nodo pegada debajo sin «Cerrar»/✕. El proyecto guarda solo lo que difiere de la plantilla; el autoguardado envuelve `ctx.guardarYa`. `app/proyectos/ejemplo.json` sale de `wf_h3_api.json` (Stack de 4 RefMods, plan, textos y audio; refs del estado reducidas a esas 4). En el nodo: 56 claves `app.*` en `web/i18n/{es,en}.json` y `pruebas.py` mira también `app/web/*.js`, `app/servidor.py` y `app/trabajador.py` (TODO BIEN). Comprobado por CDP: ejemplo igual que en el nodo, toma con Acción, + referencias y cita @, corte, duración (175 f), girar resolución, cambiar canción (recorte nuevo), prompt final, guardar como y reabrir, nuevo proyecto, idioma, Generar con valores y avance simulados, panel de videos. «Escribir historia» falló porque llama-server estaba recargándose (Loading model, VRAM casi llena), no por la app.
- 26 oct (fase 5, «arranque y documentación»): `app/arrancar.sh` (mira ComfyUI y el LLM sin arrancarlos; arranca `comfy-api-proxy start` y el servidor con `nohup` solo si no responden; `--reiniciar`, `--sin-navegador`; abre con `xdg-open`), `app/parar.sh` (servidor y proxy, solo procesos cuya línea de órdenes es la nuestra; `--solo-app`) y `app/_comun.sh` (la configuración la da `servidor.py --config`, con el mismo orden y el Python del trabajador; mensajes en español o inglés según `LANG`). `app/instalar.sh` (uv con Python 3.12, o `python3 -m venv` + pip; `--comfyui DIR` escribe `config.local.json`; `--escritorio` hace el `.desktop`; solo comprueba el Python de ComfyUI y ffmpeg), `requirements.txt` (fijos) y `requirements-comfyui.txt` (mínimos). En este PC, `app/.venv` es un enlace a `~/comfy/max_editor_app/.venv`. **El ejemplo ya no ensucia git:** `servidor.py` responde 403 si se intenta guardar `ejemplo`, y `app.js` lo abre como plantilla: crea «mi ejemplo» (o «mi ejemplo 2»…) y abre esa copia; en la lista sale «ejemplo (abre una copia)». 4 claves nuevas en `web/i18n` y `pruebas.py` TODO BIEN. Documentación: `app/LEEME.md`, `README.md` (inglés), `PLANOS.md`, `planos/2` y la biblioteca del concurso. Instalación desde cero en un clon limpio: `instalar.sh` con uv y sin uv (pip, Python 3.14), servidor en 8310 con el mismo ComfyUI y proxy, `/app/salud`, `/` y el ejemplo abierto por CDP (se creó «mi ejemplo», el ejemplo siguió intacto en git); también con la carpeta llamada `EDITS-WITH-AI`. Sin fallos. Pendiente: en otro PC las fotos y RefMods del ejemplo no existen (se avisa en el LEEME); `nucleo.CORRIDAS` sigue en `~/Escritorio/experimentos_edit/`.
