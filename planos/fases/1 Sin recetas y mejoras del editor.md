# Fases: sin recetas y mejoras del editor

Actualizado: 25 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Quitar las recetas y los efectos G/U: personaje con nombre y ficha desde sus referencias, campo «Estilo», efectos como referencias | ✅ hecha · `5589d62` |
| 2 | Línea de tiempo: ✕ para quitar tomas y arrastrar el borde entre tomas (cortes fijos en el plan) | ✅ hecha · `b002e9d` |
| 3 | La duración manda en todo el workflow (length del Text Encode de H3 y duración del Prompt Builder) | ✅ hecha (commit «Duración: …») |
| 4 | «Cambiar canción» desde la ventana del audio (elegir de input/ o subir) | 🔄 en curso |
| 5 | «Subir foto» en «+ Añadir»: crear RefMods nuevos desde el PC | ⬜ pendiente |

## Fase en curso: 4

Fase 3 hecha: `pruebas.py` TODO BIEN (59). Workflow aparte «Prueba duración»: en la ventana, 5,167 s → al guardar, `length` del Text Encode 73 → 124 y duración del Prompt Builder → 5,167, con aviso; desde `duracion_s` del nodo, 3,042 s → 73 y 3,042, con aviso abajo (pestaña nueva tras cambiar `web/editor.js`).

Fase 4, falta todo: acción `audios` (lista de input/), botón «Cambiar canción» en `web/editor/audio.js` (lista con buscador y «Subir desde el PC» con `/upload/image`), al elegir: LoadAudio apunta a ella, se recalculan resumen y beats, la ventana vuelve al inicio y se marca tocado (al guardar se escribe el recorte).

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la lista «Falta» de la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. Si al volver de una suspensión falla una llamada (LLM, ComfyUI o render), repítela antes de dar la fase por fallida.
4. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`.
