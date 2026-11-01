# Known traps

> App behaviours and failures that are not obvious from the tools. Each one was seen in a real session.

## App
| What happens | Way out |
|---|---|
| Several character references with the same name merge into one subject with ONE card (the first one's) | give all of them the same card, describing every picture (e.g. «his face is the close-up one, his clothes the full-body one») |
| environment «auto» with the local LLM off leaves the place empty | write place yourself (environment becomes manual) |
| A reference with role place + a written place says the place twice | write in place only what is seen |
| background_ref takes the tag (<Picture 3>), not the reference's name | read the tags from set_reference or view_project |
| create_refmod, crop_reference, hide_in_reference fail while ComfyUI has anything queued | wait for the queue to empty (status), then call again |
| A project copied from another machine keeps a song cut file that does not exist there → generate fails with «LoadAudio invalid» | set the song again with set_song |
| The creative edited the final prompt by hand (view_project warns «a_mano») | shot fields no longer reach H3; only they can turn it off |
| retouch windows are 22 or 39 frames: a short shot may be only partly covered | say which part stays untouched; a second retouch on the original can cover the rest |

## Services and queue
| You see | Way out |
|---|---|
| app, ComfyUI or proxy down in status | ask the creative to run app/arrancar.sh (ComfyUI is theirs to open) |
| local LLM down | optional: only the creative's «Escribir tomas» / «Describir» buttons need it |
| job stuck «en_cola» | the queue waits for ComfyUI or the LLM, or is paused; tell the creative |
| «interrumpido» | the app restarted mid-job: retry_job(id) |
| CUDA out of memory | too many frames × megapixels for this GPU (status gives its limits); report it and let the creative choose what to lower |
| a model or node name missing | a file or custom node is not installed (often on a fresh pod); tell the creative which one |
| unexpected error | give the creative the exact message; logs: app/servidor.log, app/salidas/mcp.log |

## Model (details in guia://h3)
- Shots that vanish: too short, too many, or two alike.
- Another face slipping in: resolution too low or a reference full of scenery.
- Garbage text: small text asked for, or a reference with text or a big UI in it.
- A result failing once is often the seed, not the prompt.
