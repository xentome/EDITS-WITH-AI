# Fases: sin recetas y mejoras del editor

Actualizado: 25 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Quitar las recetas y los efectos G/U: personaje con nombre y ficha desde sus referencias, campo «Estilo», efectos como referencias | ✅ hecha (commit «Sin recetas: …», ver `git log`) |
| 2 | Línea de tiempo: ✕ para quitar tomas y arrastrar el borde entre tomas (cortes fijos en el plan) | 🔄 en curso |
| 3 | La duración manda en todo el workflow (length del Text Encode de H3 y duración del Prompt Builder) | ⬜ pendiente |
| 4 | «Cambiar canción» desde la ventana del audio (elegir de input/ o subir) | ⬜ pendiente |
| 5 | «Subir foto» en «+ Añadir»: crear RefMods nuevos desde el PC | ⬜ pendiente |

## Fase en curso: 2

Fase 1 hecha (ver su commit en la tabla). Prueba: `pruebas.py` TODO BIEN (52); workflow aparte «Prueba sin recetas» (copia de «Prueba tapar con SAM»): abre con los avisos de receta y efectos G/U; historia 89 s y tomas 12 s desde la ventana; render 480p 3 s en 422 s (`~/Escritorio/experimentos_edit/edit_prompt_llm/interfaz_nueva/mejoras_sin_recetas/`).

Fase 2, falta todo: `plan.cortes` fijos (validados en `nucleo.contexto`), `montar` devuelve los beats, en `web/editor/linea.js` la ✕ de cada toma con confirmación y los bordes que se arrastran (mínimo 0,4 s, al fotograma, segundos a la vista, «pegar a los beats» ±0,15 s), comprobaciones en `pruebas.py`, plano 4.

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la lista «Falta» de la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. Si al volver de una suspensión falla una llamada (LLM, ComfyUI o render), repítela antes de dar la fase por fallida.
4. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`.
