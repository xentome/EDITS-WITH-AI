# Fases: sin recetas y mejoras del editor

Actualizado: 25 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Quitar las recetas y los efectos G/U: personaje con nombre y ficha desde sus referencias, campo «Estilo», efectos como referencias | ✅ hecha · `5589d62` |
| 2 | Línea de tiempo: ✕ para quitar tomas y arrastrar el borde entre tomas (cortes fijos en el plan) | ✅ hecha · `b002e9d` |
| 3 | La duración manda en todo el workflow (length del Text Encode de H3 y duración del Prompt Builder) | ✅ hecha · `adc3d07` |
| 4 | «Cambiar canción» desde la ventana del audio (elegir de input/ o subir) | ✅ hecha · `5134304` |
| 5 | «Subir foto» en «+ Añadir»: crear RefMods nuevos desde el PC | ✅ hecha · `ac67623` |

## Terminado (25 oct)

Las 5 fases y el render final están hechos. Render final: «Prueba final» (copia de «Prueba sin recetas»), Blue Fairy desde 1:30.500 con «♫ Cambiar canción», toma 2 alargada a mano (1,21 → 1,60 s, pegada al beat), «Escribir tomas» 21 s, 480p 3,042 s en 390 s (`mejoras_sin_recetas/14_*.mp4`, `15_hoja_fotogramas_final.jpg`).

Pendientes: H3 corta 3–4 fotogramas antes del beat; un objeto de una toma se cuela en la siguiente; efectos con imagen y varios personajes sin render (plano 7). Las pruebas dejaron RefMods en `models/refmods/subidas/` (vera_subida_epl, su tapado y nora_subida_epl) y fotos `*_epl.jpg` en `input/minimax_h3/`; se pueden borrar.

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la lista «Falta» de la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. Si al volver de una suspensión falla una llamada (LLM, ComfyUI o render), repítela antes de dar la fase por fallida.
4. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`.
