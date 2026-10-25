# Fases: sin recetas y mejoras del editor

Actualizado: 24 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Quitar las recetas y los efectos G/U: personaje con nombre y ficha desde sus referencias, campo «Estilo», efectos como referencias | 🔄 en curso |
| 2 | Línea de tiempo: ✕ para quitar tomas y arrastrar el borde entre tomas (cortes fijos en el plan) | ⬜ pendiente |
| 3 | La duración manda en todo el workflow (length del Text Encode de H3 y duración del Prompt Builder) | ⬜ pendiente |
| 4 | «Cambiar canción» desde la ventana del audio (elegir de input/ o subir) | ⬜ pendiente |
| 5 | «Subir foto» en «+ Añadir»: crear RefMods nuevos desde el PC | ⬜ pendiente |

## Fase en curso: 1

Hecho (sin commit todavía):
- `nucleo.py`: sin `recetas.json`. Nuevo `perfil_de` (personajes agrupados por nombre, pronombre she/he/they, estilo y estilo de las palabras), `personajes`, `definiciones`, `entradas_de_estado`. Papel nuevo `efecto` (referencia o efecto de texto `E1`, `E2`…). Firmas sin `nombre_receta`: `escribir_historia(entradas, plan, …)`, `escribir_tomas(entradas, plan, …)`, `montar_plan(entradas, plan, …)`, `planear(idea, n, dur, …, extra=None)`.

Falta:
- `rutas.py` (quitar `recetas`, firmas nuevas), visión del papel personaje y efecto.
- La ventana (`web/editor_core.js`, `plan.js`, `referencias.js`, `linea.js`, `cajitas.js`, `tapar.js`): campo Estilo y estilo de las palabras, ficha del personaje (nombre, pronombre, atuendo), efectos de texto en la mitad azul, migración de estados viejos (v < 4) con avisos.
- `pruebas.py` y `pruebas/plan_teto.json` / `prompt_teto.txt` nuevos.
- `__init__.py` (quitar el combo receta) y `web/editor.js` (desplazar los `widgets_values` viejos), al final, con la cola vacía; reiniciar ComfyUI.
- Borrar `recetas.json`; planos (el 3 pasa a «Personaje, estilo y efectos»).
- Prueba en el navegador y render corto (3 s, 480p).

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la lista «Falta» de la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. Si al volver de una suspensión falla una llamada (LLM, ComfyUI o render), repítela antes de dar la fase por fallida.
4. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`.
