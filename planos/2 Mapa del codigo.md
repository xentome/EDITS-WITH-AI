# Mapa del código

Lectura: 3 min

**En resumen:** casi todo vive en `nucleo.py`, que no depende de ComfyUI. El nodo, las rutas y la ventana solo conectan con él.

## Archivos

| Archivo | Qué tiene |
|---|---|
| `nucleo.py` | Todo el trabajo. Secciones, en orden: plan y referencias · reloj · audio (tramo de la canción) · LLM y registro · revisiones · historia · tomas · montaje · visión · tapar · acciones. |
| `rutas.py` | Lo que hace cada ruta del editor. Llama a `nucleo`. |
| `__init__.py` | El nodo, el registro de las rutas y la liberación de la GPU. Es delgado: no decide nada. |
| `web/editor.js` | El botón «Abrir editor…» del nodo. |
| `web/editor_core.js` | La ventana: solo junta las piezas de `web/editor/`, guarda en el nodo y pinta. Se vuelve a cargar cada vez que se abre, con todas sus piezas. |
| `web/editor/util.js` | Ayudas comunes: crear elementos, leer campos del nodo, seguir enlaces, llamar al servidor, direcciones de las fotos. |
| `web/editor/plan.js` | Partes 1 y 2: historia general y prompt de la toma elegida (campos con candado, frase del efecto, rehacer esta toma) y los botones del LLM. |
| `web/editor/referencias.js` | Parte 3: leer las referencias del workflow, las dos mitades, la ficha de cada referencia (papel, nombre, ficha, visión, activa, fuerza, quitar), el Stack, la biblioteca y el resaltado. |
| `web/editor/cajitas.js` | Abrir una cajita (sus fotos) y crear una nueva. |
| `web/editor/tapar.js` | «Tapar con SAM 3.1» en la ficha: interruptor, chips de qué tapar, forma, vista previa y el cambio de tarjeta entre original y tapado (`ctx.cambiarTarjeta`). |
| `web/editor/linea.js` | Parte 4: la línea de tiempo, elegir toma, añadir y quitar tomas. |
| `web/editor/audio.js` | Parte 4, debajo de las tomas: la ventana de audio (el tramo, ▶/⏸, arrastre) y la línea de la canción entera; al guardar, el recorte. |
| `web/editor/final.js` | Parte 5: el prompt final, resaltado o editado a mano, con Escribir historia, Escribir tomas y Guardar. |
| `web/editor/estilos.js` | El CSS de la ventana. |
| `recetas.json` | Lo fijo de cada personaje (plano 3). |
| `maqueta/` | El pizarrón donde se diseña la interfaz nueva: `servidor.py`, `index.html` (pizarra), `interfaz.html` (maqueta) y `documentacion/`. |
| `pruebas.py` y `pruebas/` | Las comprobaciones rápidas y su plan de referencia. |
| corridas | `~/Escritorio/experimentos_edit/edit_prompt_llm/<fecha>_<paso>/`: cada llamada al LLM con su prompt, su respuesta y `registro.json`. |

Las piezas de `web/editor/` comparten un objeto `ctx` (estado, referencias y funciones). No se importan entre sí: `editor_core.js` las carga todas. ComfyUI importa también cada `.js` de `web/` al abrir la página, así que una pieza solo puede exportar funciones; nada se ejecuta al importarla.

## Las funciones de entrada

- `escribir_historia(receta, entradas, plan, beats, semilla)` → plan con la historia escrita.
- `escribir_tomas(receta, entradas, plan, beats, semilla, solo=None)` → plan con la dirección escrita. Con `solo=k` regenera solo la toma k.
- `montar_plan(receta, entradas, plan, beats)` → prompt final, avisos (campos vacíos) y cortes.
- `planear(...)` → el recorrido completo sin editor. Lo usa el nodo y guarda el resultado en disco para no repetirlo.

`entradas` contiene `{idea, tomas, duracion, palabras, refs}`:
- `refs` es `{"<Picture N>" o "<Video N>": {papel, nombre, ficha}}`; con `None` se usan las referencias de la receta. Papeles: `personaje`, `objeto`, `lugar` (no cambian) y `ropa`, `pose`, `fondo`, `estilo` (se prestan).
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
| `medios` | las fotos de `input/minimax_h3`, para elegirlas en una cajita | no |
| `cajitas` | las fotos de cada cajita (de los archivos `<RefMod>.cajita.json`) | no |
| `audio_info` | duración y resumen de picos de la canción entera (caché en disco) | no |
| `audio_ventana` | picos finos alrededor del tramo y, con `wav`, el tramo en WAV para oírlo | no |
| `audio_recortar` | escribe el tramo en `input/edit_tramo_<hash>.wav`, sin tocar la original | no |
| `crear_cajita` | crea un RefMod con varias fotos: manda a ComfyUI el nodo `MiniMaxH3FantasticRefModCreate` (Full Reference, 512) con un VAELoader, por `/prompt`, y apunta sus fotos | no (usa ComfyUI unos 10 s) |
| `tapados` | los RefMods tapados y de qué original salen (archivos `<RefMod>.tapado.json`) | no |
| `tapar_previa` | busca las fotos fuente, hace las máscaras con SAM 3.1 (o las saca de la caché) y guarda la foto tapada en `input/minimax_h3/tapado/`; no crea el RefMod. Si ese tapado ya existe, lo dice sin SAM | no (SAM: 2–8 s) |
| `tapar` | crea (o reutiliza) el RefMod tapado `<original>__tapado_<huella>`, con el mismo concepto que el original, y escribe su `.tapado.json` | no (RefMod unos 4 s) |

Para añadir una acción basta con escribir su función en `rutas.py` y ponerla en `ACCIONES`: no hace falta reiniciar ComfyUI. Antes de usar el LLM, el servidor comprueba que ComfyUI no esté renderizando y le pide que suelte la GPU, igual que hace `/free`. Crear una cajita y tapar también exigen la cola vacía; SAM, además, espera unos segundos a que llama suelte la VRAM (hasta 3 GB libres).

## Dónde cambiar cada cosa

| Quiero cambiar… | Dónde |
|---|---|
| lo que se le pide al LLM en la historia | `nucleo.prompt_historia` |
| lo que se le pide en cada toma | `nucleo.prompt_toma` |
| una regla de revisión | `nucleo.revisar_historia`, `revisar_toma` o la lista `GENERALES` |
| cómo se escribe una línea `[Shot n]` | `nucleo.montar` |
| un personaje, su definición o sus efectos | `recetas.json` (la frase «In each shot she wears…» es `sujeto_atuendo` y solo va si hay atuendos o ropa) |
| cómo se cita un objeto, un lugar o una ropa | `nucleo.montar` (marcado con 💡 lo no probado) |
| dónde caen los cortes | `nucleo.cortes` |
| las dos mitades, la ficha de una referencia, la biblioteca o el resaltado | `web/editor/referencias.js` |
| las cajitas | `web/editor/cajitas.js` y `rutas.crear_cajita` |
| tapar: los chips, la forma o el cambio de tarjeta | `web/editor/tapar.js` |
| tapar: de qué foto se parte | `rutas._fuentes_tapar` |
| tapar: cómo se tapa (radios, pixelado, color) o el grafo de SAM | `nucleo.py`, sección tapar (`tapar_imagen`, `grafo_sam`, `COSAS_TAPAR`) |
| la historia general, la toma elegida, los candados | `web/editor/plan.js` |
| la línea de tiempo | `web/editor/linea.js` |
| la ventana de audio (arrastre, aceleración, reproducir) | `web/editor/audio.js` (constantes `K` y `GANANCIA_MAX`) |
| el recorte, los picos o los beats del tramo | `nucleo.py`, sección audio (`decodificar`, `info_audio`, `beats_cancion`, `beats_de_tramo`) |
| el prompt final y sus botones | `web/editor/final.js` |
| colores y tamaños de la ventana | `web/editor/estilos.js` |
| qué se guarda en el nodo o los botones de arriba | `web/editor_core.js` |
| los campos del nodo | `__init__.PromptDelEdit.INPUT_TYPES` |

## Qué guarda el nodo

- **Campos visibles:** receta, idea, tomas, duración, palabras y semilla.
- **`texto_bloqueado`:** si tiene texto, sale tal cual.
- **`estado` (oculto):** JSON con lo que guarda el editor: `refs`, `plan`, `prompt`, `a_mano` y `audio` (`original`, `inicio_s`, `recorte`, `tocado`).

Al ejecutar, el nodo decide así:
1. si hay `texto_bloqueado`, sale ese texto;
2. si no, y el editor dejó un prompt, sale ese prompt;
3. si no hay ninguno de los dos, hace el recorrido completo con el LLM.
