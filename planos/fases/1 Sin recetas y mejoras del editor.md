# Fases: sin recetas y mejoras del editor

Actualizado: 25 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Quitar las recetas y los efectos G/U: personaje con nombre y ficha desde sus referencias, campo «Estilo», efectos como referencias | ✅ hecha · `5589d62` |
| 2 | Línea de tiempo: ✕ para quitar tomas y arrastrar el borde entre tomas (cortes fijos en el plan) | ✅ hecha · `b002e9d` |
| 3 | La duración manda en todo el workflow (length del Text Encode de H3 y duración del Prompt Builder) | ✅ hecha · `adc3d07` |
| 4 | «Cambiar canción» desde la ventana del audio (elegir de input/ o subir) | ✅ hecha (commit «Canción: …») |
| 5 | «Subir foto» en «+ Añadir»: crear RefMods nuevos desde el PC | 🔄 en curso |

## Fase en curso: 5

Fase 4 hecha: `pruebas.py` TODO BIEN (60). En «Prueba duración»: «♫ Cambiar canción» lista 47 audios de input/; elegir `bluefairy_full.mp3` deja el LoadAudio en ella, el tramo en 0 y los beats nuevos; soltar un archivo (DataTransfer) lo sube a input/ y lo usa (el de prueba se borró). Capturas 10 y 11.

Fase 5, falta todo: en «+ Añadir» la opción «Subir foto» (papel, nombre corto, «tapar al subir», «juntar en una cajita»; input file y soltar), subir a `input/minimax_h3/` con `/upload/image`, acción nueva en `rutas.py` que cree el RefMod con `_crear_refmod` (concepto por papel), añadirlo al Stack; sacar `encender` de `tapar.js` a `ctx` para tapar al subir. Después, el render final (toma alargada a mano + canción cambiada desde el botón).

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la lista «Falta» de la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. Si al volver de una suspensión falla una llamada (LLM, ComfyUI o render), repítela antes de dar la fase por fallida.
4. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`.
