# Fase 7 · Inpainting y detalle (análisis)

Lectura: 5 min · 26 oct 2026 · Solo análisis y borradores. No se lanzó nada en ComfyUI. El detalle largo está en `app/plantillas/LEEME_inpaint.md`.

**En resumen**
- **La base es sencilla:** H3 recibe el video ya codificado y una máscara en el latente. Lo blanco se genera de nuevo y lo negro se queda como está. Al final se pega el original fuera de la máscara.
- **El workflow del usuario tiene 84 nodos, pero solo hacen falta unos 15.** Unos 45 son SetNode y GetNode (34), vistas previas, notas y nodos sueltos.
- **Fantastic ya trae todo el camino** (máscara con SAM o a mano, recorte, latente con máscara y pegado). Nuestra plantilla `edit_h3` ya usa su Edit Composite.
- **Cuidado:** el sampler SPEED de `edit_h3` rechaza las máscaras («SPEED does not support noise masks»). Borrar necesita una plantilla propia con `SamplerCustomAdvanced`.
- **El «detail» del workflow no es una segunda pasada:** es un recorte con zoom alrededor del objeto. Para mejorar el detalle de todo el video, el usuario tiene otro workflow aparte: escalar ×2 y una pasada suave por mosaicos.
- **Borradores escritos y comprobados con `/object_info`:** `app/plantillas/borrador_inpaint.api.json`, `borrador_mascara_sam.api.json` y `borrador_detalle.api.json`. Ninguno se ha probado con un render.

## 1. La base funcional

- **Entra:** el video del edit, una máscara (por fotograma o una sola para todo el clip), un prompt y, si se quiere, fotos de referencia.
- **Por dentro:**
  1. Se recorta una caja alrededor de la máscara y se amplía a un presupuesto de píxeles.
  2. Se codifica con el VAE de video. El audio se codifica y se deja fijo (máscara 0).
  3. La máscara se lleva a la rejilla del latente (celdas de 16 px y grupos de 4 fotogramas).
  4. H3 muestrea con denoise 1 sobre ese latente. Solo cambia lo que está bajo la máscara.
  5. Se decodifica, se devuelve la caja a su sitio y se mezcla con el original con un borde suave.
- **Sale:** el mismo video, con el área tapada regenerada, el resto con sus píxeles originales y el audio original.

## 2. El workflow por bloques (`MiniMax H3 Inpainting .json`)

| Bloque | Nodos (paquete) | Valor |
|---|---|---|
| Modelo y memoria | UNETLoader ref2va pruned int8, SigmaShift 12/3, ModelAttentionBackend, ChunkFeedForward, LowVRAMAttention (core, KJNodes), ModelPreviewOverrideKJ | Imprescindible (la vista previa es opcional) |
| Textos y VAE | CLIPLoader Qwen3-VL nvfp4, 2 VAELoader | Imprescindible |
| Carga | LoadVideo + NKDTimeline (nkd-preview-tools): 73 fotogramas, 24 fps | Imprescindible (NKDTimeline sobra si la app ya da un clip de 17n+5) |
| Máscara | SAM3.1 (core): CheckpointLoader, CLIPTextEncode «the blue logo», SAM3_VideoTrack, SAM3_TrackToMask, VRAM_Debug; MVEx_MaskCleanup (MaskVidExperiments) | Imprescindible si es por texto; la limpieza mejora la calidad |
| Recorte | MVEx_SubjectCrop «tracked», 1,6×, a 0,18 MP | Mejora mucho la calidad y la velocidad |
| Máscara al latente | NKDMaskOps (expand 6, en el tiempo 2, a la rejilla del VAE), NKDMaskOpsLean (borde 8) (NKD-Basic-Tools) | Imprescindible (lo hace un solo nodo) |
| Latente | NKDAVLatent: video + audio, audio «keep» | Imprescindible |
| Condición | MiniMaxH3ReferenceToVideo (solo prompt + 1 foto), PromptLint, TokenCounter | Imprescindible el primero; los otros son ruido |
| Muestreo | RandomNoise, BasicGuider, KSamplerSelect res_multistep, BasicScheduler simple 20 / 1,0, SamplerCustomAdvanced | Imprescindible |
| Pegado | VAEDecode, MVEx_SubjectUncrop (borde 16) | Imprescindible |
| «Opening repair» | ImageFromBatch, RepeatImageBatch, ImageBatchMulti: congela los 19 primeros fotogramas | Parche opcional (en un edit musical congela 0,8 s) |
| Ruido | 34 SetNode/GetNode, 2 notas, 6 nodos de vista previa, CR Aspect Ratio, un BasicScheduler suelto (30 pasos, sin conectar), 2 VHS_VideoCombine | Sobra |

## 3. El «detail»

- **En este workflow** es el recorte que sigue al objeto (`MVEx_SubjectCrop`). H3 trabaja solo la caja, a 0,18 MP. Es más rápido, y el área queda con más píxeles que en el fotograma entero. No hay una segunda pasada.
- **Fantastic hace lo mismo** con «crop to mask»: amplía la caja hasta 4× según el presupuesto. Cuesta lo mismo que generar a ese presupuesto.
- **«Mejorar detalle» de todo el video** (workflow `~/Descargas/MMH3_UltimateUpscale_upscale_video_existente.json`):
  - RealESRGAN ×2.
  - Pasada suave con `MMH3UltimateUpscale`: 1 paso a denoise 0,2 con un LoRA turbo, en trozos de 85 fotogramas y mosaicos de 2×2.
  - Coste: cada mosaico pasa por H3 en cada paso. Con pocos pasos, la memoria queda en un solo mosaico.

## 4. Lo que importa de verdad

- **Tamaño del recorte:** 0,18 MP en el workflow del usuario (rápido). Fantastic usa el ancho × alto del Text Encode como tope (borrador: 640×640).
- **Crecer y difuminar la máscara:** crecer 4 + 6 + 2 px; difuminado de 8 en la máscara y de 16 al pegar. Fantastic: grow 16, feather 12 y blend 8.
- **Fotogramas:** tienen que ser 17n+5 (73, 124…). El workflow usa 73 (3 s).
- **Pasos y denoise:** 20 pasos de res_multistep, denoise 1,0. La máscara decide qué cambia, no el denoise.
- **Audio:** siempre «keep».
- **El prompt:** según Fantastic, hay que describir cómo queda la escena; si se borra algo, describir lo que hay en su lugar y no nombrarlo.

## 5. El flujo mínimo propuesto

**A. Borrar o rellenar** (`borrador_inpaint.api.json`, 19 nodos, todos de Fantastic o core):
- Cargadores (`edit_h3`) → `MiniMaxH3MediaLoader` con un clip marcado `edit` y su máscara → `RefModTextEncode` (prompt, tope de píxeles; da la condición y el latente con la máscara) → `BasicGuider` + `BasicScheduler` 20 + `res_multistep` + `SamplerCustomAdvanced` → `VAEDecode` y `VAEDecodeAudio` → `EditComposite` → `CreateVideo` → `SaveVideo` (`max_editor/borrado`).
- **La app da:** el video del edit (`max_editor/edit_….mp4 [output]`), el archivo de la máscara, el prompt y, si quiere, grow, feather y recorte.
- **La máscara sale de:**
  - **Con texto o clics:** `borrador_mascara_sam.api.json` (SAM 3.1 + `MiniMaxH3FantasticObjectMask`). Con clics en un solo fotograma, SAM sigue el objeto por todo el clip. Devuelve `ui.mmh3_mask[0].file`.
  - **A mano:** `POST /minimax_h3/mask_compose` con una capa «brush» (pincel en ese fotograma, «desde aquí» o «todo el clip»). Pide antes el token en `GET /minimax_h3/token`.
- **Devuelve:** el mp4 con el área regenerada. El fotograma para usarlo como referencia se saca del mp4 sin ComfyUI.

**B. Mejorar detalle** (`borrador_detalle.api.json`, 25 nodos):
- `LoadVideo` → `GetVideoComponents` → RealESRGAN ×2 → `ImageScale` → `VAEEncode` + `VAEEncodeAudio` → `LTXVConcatAVLatent` → `MMH3UltimateUpscale` (trozos de 85/17, mosaicos de 2×2, 4 pasos a denoise 0,25) con la condición de `ReferenceToVideo` (prompt corto de nitidez) → `VAEDecode` → `CreateVideo` con el audio original → `SaveVideo` (`max_editor/detalle`).
- **La app da:** el video subido a `input/` y el tamaño final (×2, múltiplo de 32).

## 6. Riesgos y dudas ❓

- ❓ **Tiempo:** 20 pasos sin VDN ni SPEED. Además, Fantastic cita el clip como `<Video 1>`, y eso casi duplica los tokens. A 640×640 y 5 s calculo unos 30 000 tokens: tarda como un clip de unos 0,8 MP, pero con 20 pasos. Hay que probar VDN con 8 pasos y comprobar que respeta la máscara.
- ❓ **Citar o no el clip:** el workflow del usuario funciona solo con prompt, sin citarlo. Si el clip citado se copia sin cambios, se baja `mask_ref_strength`.
- ❓ **El arranque anclado:** el usuario congela 19 fotogramas porque al principio vuelve el original. Falta ver si pasa también con Fantastic.
- ❓ **Memoria del detalle:** la salida ×2 (1088×1920) puede no caber en `VAEDecode` en 12 GB. Si falla, usar `VAEDecodeTiled`. Los pasos y el denoise están sin calibrar, y el LoRA turbo que usaba el usuario (`fl2v_turbo_4step_v1.1_768p`) no está instalado.
- ❓ **La máscara:** puede ser una sola para todo el clip o una por fotograma. Las dos valen. Un objeto que se mueve necesita SAM o formas con claves.
- Modelos: todos están instalados (SAM 3.1, RealESRGAN ×2, el upscaler 3D, H3 Singularity int8).

## 7. Cómo se vería en la app (datos para hablarlo con el usuario)

Controles mínimos que pide el flujo (el diseño lo decide el usuario):
- elegir el edit y el tramo (inicio y fin);
- marcar lo que se borra: clic o texto para SAM, o pincel en un fotograma;
- ver la máscara encima antes de lanzar;
- escribir qué queda en su lugar;
- un botón para borrar; y, aparte, otro para mejorar el detalle;
- opcional: grow, feather, recorte sí o no, y «usar este fotograma como referencia».

## 8. Pruebas reales (26–27 oct, en local, RTX 3060)

Todas sobre `prueba_camara_toma2_00002_.mp4` (la demo, 960×544, dos tomas), con el modelo de `edit_h3` + VDN turbo a **8 pasos** y `SamplerCustomAdvanced` (euler). SPEED no sirve: rechaza las máscaras en su código. Grafos y máscaras en `~/comfy/max_editor_app/pruebas/inpaint/`.

| Prueba | Qué | Tamaño | Tokens | Tiempo | Resultado |
|---|---|---|---|---|---|
| Máscara SAM 3.1 | «face», «hand», «text»… | — | — | 40–50 s | ✅ la cara y la mano sí; ❌ las letras estilizadas del título, no (ni «text», ni «white letters», ni «title») |
| Borrar 1 | título, clip entero, `mask_hide` off | 960×544, recorte 640² | 37 465 | 961 s | ❌ H3 vuelve a copiar las letras del clip citado |
| Borrar 2 | tramo 2,10–5,14 s + `mask_hide` blur | 960×544, recorte 640² | 22 534 | 575 s | ❌ ya no copia, pero inventa letras nuevas |
| Borrar 3 | + máscara grande + prompt «no text» | ref 640 px, recorte 448² | 10 666 | 327 s | ❌ copia el borrón de la referencia e inventa letras |
| **Detalle de cara** | 2.ª toma, 3,52–5,14 s (39 f), máscara SAM «face», `mask_hide` off, `mask_ref_strength` 1 | ref 640 px, recorte 384² | 2 497 | **182 s** | ✅ cara mucho más nítida: ojos azules con iris, pecas, labios; sigue siendo ella. También quitó las letras que tapaban la cara |

**Lecciones:**
- ✅ **El tramo corto y la baja resolución mandan en el tiempo.** El coste depende de los tokens: el clip citado como referencia + el recorte.
- ✅ **El «detail» con la lupa de Fantastic funciona**, y en 3 minutos: máscara de SAM por texto, recorte con zoom y referencia a fuerza completa para conservar la identidad.
- ✅ **Para borrar, H3 obedece demasiado a la referencia:** sin ocultar, copia; ocultando, copia el borrón o rellena con algo parecido. ❓ Falta probar `mask_ref_strength` 0,3–0,5.
- 💡 **En la app:** elegir el tramo en la línea de tiempo, la máscara por texto (SAM) o con pincel y rectángulo (para lo que SAM no encuentra), un interruptor «borrar / mejorar detalle» que ponga solos `mask_hide` y `mask_ref_strength`, y un aviso del tiempo según los tokens.
