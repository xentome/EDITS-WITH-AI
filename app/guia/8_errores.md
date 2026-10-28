# 8 · Problems and ways out

| You see | What it means | What to do |
|---|---|---|
| «MAX EDITOR does not answer at http://127.0.0.1:8300» | the app is not running | ask the creative to run `app/arrancar.sh` |
| estado: ComfyUI ✗ | ComfyUI is closed (the app never starts it: it is theirs) | ask them to open ComfyUI; then `app/arrancar.sh` |
| estado: SDK proxy ✗ | comfy-api-proxy stopped | `app/arrancar.sh` starts it again |
| estado: local LLM ✗ | optional; only «Escribir tomas» and «Describir» need it | nothing; you write the shots yourself |
| estado: «GPU free now: NO» | ComfyUI or the app queue is working (maybe the creative's job) | queue anyway (it waits its turn) or wait; never cancel their jobs |
| a job stays «en_cola» | the queue waits while the LLM works or ComfyUI has anything queued, or the queue is paused («Cola» › Reanudar) | ver_cola; tell the creative; do not cancel others' jobs |
| a job ends in «error» with «value_not_in_list» | a model file is missing or has another name in ComfyUI | tell the creative which loader (the message names it); see app/plantillas/LEEME.md |
| error naming a node type that does not exist | a custom node is missing. **On the cloud pod the Retocar nodes are missing** | tell the creative; Generar may still work there |
| «out of memory» / CUDA OOM | too many frames × megapixels for the GPU | lower the resolution or the length (12 GB: 5 s at 1 MP max; 8 s at 0.4 MP), close the LLM, retry |
| «interrumpido» | the app restarted while it ran and the job was not found in ComfyUI | reintentar(id) |
| generar refuses: «cannot generate yet» | revisar_proyecto errors (no song, invalid length, a cited reference missing) | fix them, then generar again |
| generar refuses: «about N min of GPU» | a long or heavy job | ask the creative; then generar(confirmado=true) |
| «you already have N jobs waiting» | the limit of jobs you can have pending | wait for them, or cancel yours |
| «<Picture N> is not a reference of this project» | tags shifted after adding/removing a reference, or a typo | ver_proyecto; use the current tags |
| «the project keeps changing in the page» | the creative is editing the same project right now | wait a moment, ver_proyecto, continue |
| the page shows «The agent changed this project while you were editing» | both of you saved | the creative chooses; afterwards re-read with ver_proyecto |
| «ejemplo is read-only» | the example project is never written | crear_proyecto(nombre=…, copiar_de="ejemplo") |
| ⚠ «edited BY HAND (a_mano)» in ver_proyecto | the creative edited the final prompt by hand: shot fields no longer reach H3 | tell them; only they can turn it off in «Prompt final» |
| page gaps «no place / no light / no action» | the page lists empty fields per shot («action» there = «Gesto») | informative; fill «Gesto» when the shot has a body action; place and light are optional |
| the song segment moved | the segment must fit inside the song | tell the creative the real start |
| ver_video: «has no videos yet» | the job is not finished | ver_cola until «hecho» |
| extender: «the video has N frames: fewer than the overlap» | the video is shorter than solape | use solape=22 (or a longer video) |
| extender error naming MpiLoadLatent / MpiSaveLatent / NKDAVLatentExtend | ComfyUi-MpiNodes or NKD Basic Tools missing (likely on the pod) | tell the creative; nothing to retry until they are installed |
| ver_extension says «from the mp4» but the video is the app's | older than 28 Oct, another quality, the latent was deleted, or a retouch changed the end | fine: it works, with a little colour loss; «original» quality uses the latent when there is one |
| the extension is redder / more contrasted at its end | H3 colour drift, it grows with each chained extension | add the project's references (logo, character), then another seed (guia://extender) |
| the extension does not move | the original's end was already frozen | tell the creative: continuing a freeze continues it |
| ver_mascara takes minutes | it runs SAM on the GPU | wait; if > 7 min it returns the job id |
| unexpected error (…) | a bug in the app or the MCP | tell the creative the exact message; the logs are app/servidor.log and app/salidas/mcp.log |
