# Fases: sin recetas y mejoras del editor

Actualizado: 25 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Quitar las recetas y los efectos G/U: personaje con nombre y ficha desde sus referencias, campo «Estilo», efectos como referencias | ✅ hecha · `5589d62` |
| 2 | Línea de tiempo: ✕ para quitar tomas y arrastrar el borde entre tomas (cortes fijos en el plan) | ✅ hecha (commit «Línea de tiempo: …») |
| 3 | La duración manda en todo el workflow (length del Text Encode de H3 y duración del Prompt Builder) | 🔄 en curso |
| 4 | «Cambiar canción» desde la ventana del audio (elegir de input/ o subir) | ⬜ pendiente |
| 5 | «Subir foto» en «+ Añadir»: crear RefMods nuevos desde el PC | ⬜ pendiente |

## Fase en curso: 3

Fase 2 hecha: `pruebas.py` TODO BIEN (57); en la ventana real, arrastrar el borde 1 a 1,255 s lo pegó al beat de 1,300 s (el prompt dice `[Shot 2] At 00:01.300`), los segundos se ven mientras se arrastra y quitar la toma 2 con su ✕ (pide «¿quitar?») reparte su tiempo (corte en 1,583 s). Capturas 5–7 en `mejoras_sin_recetas/`.

Fase 3, falta todo: pieza nueva `web/editor/duracion.js` (fotogramas H3 = 17·round((f−5)/17)+5; `length` de los nodos MiniMaxH3 y `duration` del `builder_state` del Prompt Builder, buscados por tipo), llamada al guardar con aviso de qué nodos cambió; al cambiar `duracion_s` en el nodo, lo mismo (callback en `web/editor.js`, pide pestaña nueva). Probar en un workflow aparte.

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la lista «Falta» de la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. Si al volver de una suspensión falla una llamada (LLM, ComfyUI o render), repítela antes de dar la fase por fallida.
4. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`.
