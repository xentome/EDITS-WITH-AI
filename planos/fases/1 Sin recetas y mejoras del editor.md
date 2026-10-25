# Fases: sin recetas y mejoras del editor

Actualizado: 25 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Quitar las recetas y los efectos G/U: personaje con nombre y ficha desde sus referencias, campo «Estilo», efectos como referencias | ✅ hecha · `5589d62` |
| 2 | Línea de tiempo: ✕ para quitar tomas y arrastrar el borde entre tomas (cortes fijos en el plan) | ✅ hecha · `b002e9d` |
| 3 | La duración manda en todo el workflow (length del Text Encode de H3 y duración del Prompt Builder) | ✅ hecha · `adc3d07` |
| 4 | «Cambiar canción» desde la ventana del audio (elegir de input/ o subir) | ✅ hecha · `5134304` |
| 5 | «Subir foto» en «+ Añadir»: crear RefMods nuevos desde el PC | ✅ hecha (commit «Subir foto: …») |

## Fase en curso: render final

Fase 5 hecha: `pruebas.py` TODO BIEN (63). En «Prueba duración»: soltar `vera.jpg` (copia `vera_subida_epl.jpg`) en la mitad azul con papel ropa y «tapar al subir» → `subidas/vera_subida_epl` y su tapado en el Stack; dos fotos de Teto por el input de archivos, juntas → cajita `subidas/teto_subida_epl` (`<Video 2>`, personaje) en 4,5 s. Capturas 12 y 13.

Falta: el render final en un workflow aparte («Prueba final», copia de «Prueba sin recetas»): canción cambiada con «♫ Cambiar canción», una toma alargada arrastrando su borde, «Escribir tomas», guardar y render 480p; hoja de fotogramas; anotar en el plano 7 y aquí.

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la lista «Falta» de la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. Si al volver de una suspensión falla una llamada (LLM, ComfyUI o render), repítela antes de dar la fase por fallida.
4. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`.
