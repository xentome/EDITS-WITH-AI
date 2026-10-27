# Borradores de borrar (inpainting) y mejorar detalle

> 4 min de lectura · 26 oct 2026 · Anexo de `planos/fases/7 Inpainting y detalle (analisis).md`. **Son borradores:** se comprobaron con `/object_info` (clases, entradas, combos y tipos de los enlaces), pero no se ha lanzado ningún render.

**En resumen**
- `borrador_mascara_sam.api.json`: hace la máscara con SAM 3.1, a partir de un texto o de clics.
- `borrador_inpaint.api.json`: borra o rellena lo que tapa la máscara y pega el resultado sobre el original.
- `borrador_detalle.api.json`: escala el video ×2 y le da una pasada suave por mosaicos.
- Los tres se lanzan igual que `edit_h3.api.json`, con el SDK (`app/generar.py`).

## Qué rellena la app en cada plantilla

**borrador_mascara_sam** (nodo 2, `MiniMaxH3FantasticObjectMask`):
- `video`: el clip, con su carpeta entre corchetes, por ejemplo `max_editor/edit_00012_.mp4 [output]`.
- `text`: qué buscar, por ejemplo «phone». O `points`, un JSON así: `{"frames":[{"time":1.2,"positive":[{"x":0.4,"y":0.6}],"negative":[]}]}` (x e y de 0 a 1).
- `start` y `end`: el tramo en segundos (`end` 0 = hasta el final).
- `mode` (`replace`, `add` o `subtract`) y `base` (la máscara anterior), para sumar o quitar.
- **Lo que devuelve:** en la salida del nodo 2, `ui.mmh3_mask[0].file`, por ejemplo `minimax_h3/masks/<x>.safetensors [input]`.
- **Máscara a mano, sin workflow:** `POST /minimax_h3/mask_compose` con `{"clip", "layers", "start", "end"}`.
  - Capa de pincel: `{"kind":"brush","strokes":[{"time":s,"r":0.03,"points":[{"x","y"}],"reach":"all"|"forward"|null,"erase":false}]}`.
  - Capa de forma: `ellipse`, `rect` o `poly`, con `keys` en el tiempo.
  - Hay que mandar antes la cabecera de token: se pide con `GET /minimax_h3/token`.
  - Formato del archivo: safetensors con `mask` en bits empaquetados (`format: packed1`). Ver `object_mask.py` de Fantastic.

**borrador_inpaint**:
- Nodo 10, `media_state`: una lista JSON con un único video. Hay que poner `file` (el edit) y `mask` (el archivo de arriba). Ajustes:
  - `mask_grow` 16 y `mask_feather` 12;
  - `mask_crop` true y `mask_context` 1,75 (recorte con zoom, el «detail»);
  - `mask_invert`;
  - `keep_audio` true;
  - `mask_ref_strength` 1,0 (bajarlo si el clip vuelve sin cambios);
  - `mask_hide` `off` (o `blur`, `invert` o `blur_invert`, para cambiar a una persona entera);
  - `audio_mode` `none`, para que su sonido no se cite también como `<Audio 1>`.
- Nodo 9: `prompt`, más `width` × `height`, que son el **tope de píxeles** (640×640 ≈ 0,41 MP). El largo y la forma salen del clip.
- Nodo 33: la semilla. Nodo 32: los pasos (20).
- **El prompt:** describir cómo queda la escena. Si se borra algo, describir lo que hay en su lugar sin nombrarlo. Se puede citar el clip: `<Video 1> is the source video for the target video edit.` o `[video editing] The target video is an edited version of <Video 1>.`
- Fotos de referencia: añadir items `{"kind":"picture","file":…}` al mismo `media_state` (salen como `<Picture 1>`…).

**borrador_detalle**:
- Nodo 40: `file`, un video de `input/`. `LoadVideo` solo lista `input/`, así que la app lo sube antes con `/upload/image`.
- Nodos 44, 48 y 53: el tamaño final (ancho y alto ×2, múltiplos de 32). 48 y 53 solo lo usan como dato.
- Nodo 48: `length` (17n+5) y el prompt de nitidez.
- Nodo 51: los pasos y el denoise (4 y 0,25, sin calibrar).
- Nodo 52: el tamaño de cada trozo de tiempo (85, con 17 de solape).

## Por qué no sirve `edit_h3` tal cual

- `MiniMaxH3SPEEDSampler` lanza `ValueError("MiniMax-H3 SPEED does not support noise masks")` (`ComfyUI-MiniMax-H3-SPEED/speed_scripts/h3_runtime.py`, `run_speed_pipeline`). También exige un latente vacío.
- `MiniMaxH3AddGuide` (la canción como guía) no hace falta al borrar: el audio se queda fijo. Con el recorte activo, además, la guía caería sobre la caja y no sobre el fotograma entero (lo avisa el propio Text Encode).
- `ApplyVDNH3` (8 pasos) no se sabe si respeta la máscara. El borrador usa los 20 pasos probados por el usuario. ❓ Probar VDN con `SamplerCustomAdvanced`.

## Valores del workflow del usuario (`user/default/workflows/MiniMax H3 Inpainting .json`, 14 oct)

| Pieza | Valor |
|---|---|
| Modelo | `minimax_h3_ref2va_pruned_int8_convrot`, shift 12/3, FF en 2 trozos (umbral 4096), atención por cabezas en 2 trozos |
| Texto y VAE | `qwen3vl_32b…nvfp4_awq`, VAE de video fp16, VAE de audio fp32 |
| Clip | 73 fotogramas (17·4+5) desde el 0, 24 fps |
| SAM | «the blue logo», umbral 0,35, 1 objeto, detección en cada fotograma |
| Limpieza | MaskCleanup: umbral 0,5, shrink_grow (encoger 8, mínimo 2 fotogramas), crecer 4 |
| Recorte | tracked, crop_scale 1,6, firm, stillness, múltiplo de 32, **−0,18 MP** (el negativo fija el tamaño, también hacia abajo) |
| Máscara al latente | NKDMaskOps: despeckle 2, rellenar huecos, close 2, temporal 2/2, expandir 6, a la rejilla del VAE y del modelo (por el VAE y el modelo conectados) |
| Máscara de pegado | NKDMaskOpsLean: rellenar, expandir 2, feather 8; Uncrop feather 16 |
| Condición | ReferenceToVideo con 1 foto (`comfy grande.png`), «match». Su ancho y alto (1024×1024 de CR Aspect Ratio) solo dan tamaño a la foto, porque el latente lo hace NKDAVLatent |
| Prompt | «a futurist logo, blue, with a white trail following it as it increases and decreases in size» (cambiar un logo, no borrarlo) |
| Muestreo | res_multistep, simple, 20 pasos, denoise 1,0, BasicGuider (sin CFG) |
| Salida | dos mp4 (con y sin la reparación del arranque), crf 19 |

- La versión de `~/Descargas/MiniMax H3 Prompt Inpainting .json` (31 ago) es la misma base, sin foto: «prompt only», y con el ancho y alto tomados del recorte.
- `~/Descargas/MiniMax H3 Inpainting .json` (18 sep, 134 KB) es otra copia de la misma familia.

## Equivalencias (workflow del usuario → Fantastic)

| Workflow del usuario | Fantastic |
|---|---|
| SAM3_VideoTrack + TrackToMask + MaskCleanup | `MiniMaxH3FantasticObjectMask` (los mismos nodos SAM de core por dentro, con clics, texto, sumar y restar) |
| SubjectCrop tracked | `mask_crop` + `mask_context`. Ojo: la caja de Fantastic es **fija**, la unión de todos los fotogramas; no sigue al objeto |
| NKDMaskOps + NKDAVLatent | `RefModTextEncode` → `bundle_edit` (crecer, rejilla 16 px, feather en celdas, audio fijo; se guarda en caché) |
| Uncrop + MaskOpsLean | `EditComposite` (pega solo las celdas regeneradas más el borde) |
| (no hay) | `MiniMaxH3FantasticVideoEditLatent`: el latente con máscara de una MASK cualquiera, sin recorte. Sirve sin Media Loader, pero entonces EditComposite no tiene clip y hay que componer con otro nodo |

## Tokens y tiempo (cuentas, sin medir)

- Tokens de video ≈ (ancho/32) × (alto/32) × T, con T = 2 + 5·(n−5)/17. Para 124 fotogramas, T = 37.
- Borrar a 640×640 y 5 s: unos 14 800 de la escena y otros tantos del clip citado (la caja), es decir, **≈ 30 000**. Fantastic avisa a partir de 30 000.
- Comparación: un edit normal a 1 MP y 5 s son ≈ 38 000 tokens y ~16 min con VDN (8 pasos). Con 20 pasos sin VDN, borrar podría tardar parecido o más. ❓ Medirlo.
- Detalle a 1088×1920 en 2×2: cada mosaico mide ~608×1024 → ≈ 13 400 tokens por trozo de 85 fotogramas. Con 2 trozos × 4 mosaicos × 4 pasos salen unas 32 pasadas. Más RealESRGAN sobre 124 fotogramas. ❓ Medirlo.

## Otros workflows mirados

- `~/Descargas/MMH3_UltimateUpscale_upscale_video_existente.json`: la base de `borrador_detalle`.
  - Usa el LoRA `minimax_h3_fl2v_turbo_4step_v1.1_768p`, que **no está instalado**; los instalados son `minimax_h3_ref2v_turbo_4step_v0.1`, `turbo_4step_ema_ckpt850`, `ckpt500`, `ckpt600_V4` y `taomate_3step`.
  - Usa sa_solver, 1 paso a 0,2 y SigmaShift desactivado.
- `~/Descargas/Ep30 MiniMax H3 Upscale Latent.json`: otra forma. Escala el latente con `MinimaxH3LatentUpscaler3D` (`minimax_h3_latent_upscaler_3d_fp16`, instalado) y hace una segunda pasada (er_sde, 4 pasos a denoise 0,4, LoRA turbo ref2v). Necesita el latente guardado del render, no el mp4.
- `wokflow maxima calidad MINIMAX H3 Fantastic.json`: es de generación; no tiene inpainting.
