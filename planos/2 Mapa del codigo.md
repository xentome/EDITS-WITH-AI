# Mapa del código

Lectura: 3 min

**En resumen:** casi todo vive en `nucleo.py`, que no depende de ComfyUI. El nodo, las rutas y la ventana solo conectan con él.

## Archivos

| Archivo | Qué tiene |
|---|---|
| `nucleo.py` | Todo el trabajo. Secciones, en orden: plan y referencias · reloj · LLM y registro · revisiones · historia · tomas · montaje · acciones. |
| `rutas.py` | Lo que hace cada ruta del editor. Llama a `nucleo`. |
| `__init__.py` | El nodo, el registro de las rutas y la liberación de la GPU. Es delgado: no decide nada. |
| `web/editor.js` | El botón «Abrir editor…» del nodo. |
| `web/editor_core.js` | La ventana: solo junta las piezas de `web/editor/`, guarda en el nodo y pinta. Se vuelve a cargar cada vez que se abre, con todas sus piezas. |
| `web/editor/util.js` | Ayudas comunes: crear elementos, leer campos del nodo, seguir enlaces, llamar al servidor. |
| `web/editor/referencias.js` | Columna 1: leer las referencias del workflow, papel y ficha, cambiar el Stack, biblioteca, «describir con visión» y el resaltado. |
| `web/editor/plan.js` | Columna 2: el plan, los campos con candado, la frase del efecto y los botones del LLM. |
| `web/editor/final.js` | Columna 3: el prompt final, resaltado o editado a mano. |
| `web/editor/estilos.js` | El CSS de la ventana. |
| `recetas.json` | Lo fijo de cada personaje (plano 3). |
| `pruebas.py` y `pruebas/` | Las comprobaciones rápidas y su plan de referencia. |
| corridas | `~/Escritorio/experimentos_edit/edit_prompt_llm/<fecha>_<paso>/`: cada llamada al LLM con su prompt, su respuesta y `registro.json`. |

Las piezas de `web/editor/` comparten un objeto `ctx` (estado, referencias y funciones). No se importan entre sí: `editor_core.js` las carga todas. ComfyUI importa también cada `.js` de `web/` al abrir la página, así que una pieza solo puede exportar funciones; nada se ejecuta al importarla.

## Las funciones de entrada

- `escribir_historia(receta, entradas, plan, beats, semilla)` → plan con la historia escrita.
- `escribir_tomas(receta, entradas, plan, beats, semilla, solo=None)` → plan con la dirección escrita. Con `solo=k` regenera solo la toma k.
- `montar_plan(receta, entradas, plan, beats)` → prompt final, avisos (campos vacíos) y cortes.
- `planear(...)` → el recorrido completo sin editor. Lo usa el nodo y guarda el resultado en disco para no repetirlo.

`entradas` contiene `{idea, tomas, duracion, palabras, refs}`:
- `refs` es `{"<Picture N>": {papel, nombre, ficha}}`; con `None` se usan las referencias de la receta.
- `palabras` va como `TO YOU @1; PEAK @ultima`.

## Las rutas del editor

Hay una sola ruta, `/edit_prompt_llm/<acción>`. Las acciones están en `rutas.ACCIONES`:

| Acción | Para qué | ¿LLM? |
|---|---|---|
| `recetas` | efectos y referencias por defecto de cada receta | no |
| `montar` | plan → prompt final | no |
| `historia` | escribe la historia | sí |
| `tomas` | escribe las tomas, o solo una con `solo` | sí |
| `describir` | propone la ficha y los riesgos de una referencia, con visión | sí |

Para añadir una acción basta con escribir su función en `rutas.py` y ponerla en `ACCIONES`: no hace falta reiniciar ComfyUI. Antes de usar el LLM, el servidor comprueba que ComfyUI no esté renderizando y le pide que suelte la GPU, igual que hace `/free`.

## Dónde cambiar cada cosa

| Quiero cambiar… | Dónde |
|---|---|
| lo que se le pide al LLM en la historia | `nucleo.prompt_historia` |
| lo que se le pide en cada toma | `nucleo.prompt_toma` |
| una regla de revisión | `nucleo.revisar_historia`, `revisar_toma` o la lista `GENERALES` |
| cómo se escribe una línea `[Shot n]` | `nucleo.montar` |
| un personaje, su definición o sus efectos | `recetas.json` |
| dónde caen los cortes | `nucleo.cortes` |
| la columna de referencias, la biblioteca o el resaltado | `web/editor/referencias.js` |
| los campos del plan, los candados o los botones del LLM | `web/editor/plan.js` |
| la columna del prompt final | `web/editor/final.js` |
| colores y tamaños de la ventana | `web/editor/estilos.js` |
| qué se guarda en el nodo o los botones de arriba | `web/editor_core.js` |
| los campos del nodo | `__init__.PromptDelEdit.INPUT_TYPES` |

## Qué guarda el nodo

- **Campos visibles:** receta, idea, tomas, duración, palabras y semilla.
- **`texto_bloqueado`:** si tiene texto, sale tal cual.
- **`estado` (oculto):** JSON con lo que guarda el editor: `refs`, `plan`, `prompt` y `a_mano`.

Al ejecutar, el nodo decide así:
1. si hay `texto_bloqueado`, sale ese texto;
2. si no, y el editor dejó un prompt, sale ese prompt;
3. si no hay ninguno de los dos, hace el recorrido completo con el LLM.
