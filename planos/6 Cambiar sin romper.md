# Cambiar sin romper

Lectura: 2 min

**En resumen:** cambia el código, corre `pruebas.py`, prueba con el LLM solo si cambió lo que se le pide y haz un render solo si cambió el prompt final. La mayoría de los cambios no obligan a reiniciar ComfyUI.

## El procedimiento

1. **Cambia** el archivo que toque (plano 2, «Dónde cambiar cada cosa»).
2. **Comprueba en segundos:**
   `~/ComfyUI-CLI/.venv/bin/python ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm/pruebas.py`
   Si sale TODO BIEN, sigue (39 comprobaciones; las 9 de audio usan audios sintéticos en una carpeta temporal y ffmpeg, y las 6 de tapar, máscaras sintéticas, sin GPU). Si cambiaste el montaje **a propósito**, revisa la diferencia y fija la nueva referencia con `pruebas.py --nueva-referencia`.
3. **Si cambiaste lo que se le pide al LLM:** prueba en la terminal (unos 2 min) y mira la carpeta de la corrida, con cada prompt y su respuesta:
   `~/ComfyUI-CLI/.venv/bin/python nucleo.py --receta "Teto city pop" --idea "…" --tomas 6 --palabras "TO YOU @1" --audio ~/comfy/ComfyUI/input/stay_0_5s.wav`
   Antes, libera la GPU de ComfyUI (`/free`), porque desde la terminal no se libera sola.
4. **Si cambió el prompt final:** haz un render de prueba a 480p (unos 9 min) antes de darlo por bueno.
5. **Anota** en el plano 7 lo que mediste y, si apareció un fallo nuevo, su regla en el plano 5.

## Qué obliga a reiniciar

| Cambié… | Qué hacer |
|---|---|
| `nucleo.py`, `rutas.py` o `recetas.json`, incluida una acción nueva en `rutas.ACCIONES` | nada: el editor los recarga en cada llamada (el nodo, al ejecutarse, usa la versión que cargó el editor la última vez, o la del arranque) |
| `web/editor_core.js` o `web/editor/*.js` | nada: se recargan al abrir la ventana |
| un archivo nuevo en `web/editor/` | nada, si lo cargas desde `editor_core.js` (función `pieza`); solo debe exportar funciones |
| `web/editor.js` | recargar la pestaña de ComfyUI |
| `__init__.py` (campos del nodo, rutas nuevas) | reiniciar ComfyUI y recargar la pestaña |

Antes de reiniciar, mira que la cola esté vacía y que Krita no esté usando ComfyUI. Antes de recargar la pestaña, guarda los workflows con cambios.

## La despensa

El nodo, sin editor, guarda cada prompt en disco. Si coinciden las entradas, la receta, la semilla y el propio `nucleo.py`, lo reutiliza sin llamar al LLM. Si cambias `nucleo.py`, se invalida sola. Para obtener otra versión, cambia la semilla.

## Git

La carpeta guarda su historial con git y tiene una copia en GitHub, en el repositorio privado **xentome/EDITS-WITH-AI**. Desde la carpeta:
- **Ver qué cambió:** `git status` (archivos) y `git diff` (líneas).
- **Guardar un cambio:** `git add -A && git commit -m "qué cambié"`.
- **Ver el historial:** `git log --oneline`.
- **Deshacer lo que no guardaste en un archivo:** `git restore <archivo>`. Para volver a una versión anterior entera: `git revert <hash>` (crea un cambio nuevo que la deshace; no borra nada).
- **Subir a GitHub lo guardado:** `git push`. Lo que no es nuestro o pesa mucho (imágenes de Teto y Vera, RefMods, videos) está en `.gitignore` y no se sube.
