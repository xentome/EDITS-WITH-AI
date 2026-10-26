# Mapa del código

Lectura: 3 min

**En resumen:** casi todo vive en `nucleo.py`, que no depende de ComfyUI. El nodo, las rutas y la ventana solo conectan con él.

## Archivos

| Archivo | Qué tiene |
|---|---|
| `nucleo.py` | Todo el trabajo. Arriba, lo fijo de la casa (`DEFINICION_EDIT`, `AUDIO`, `GENERALES`…). Secciones, en orden: plan, referencias y personajes · reloj · audio (tramo de la canción) · LLM y registro · revisiones · historia · tomas · montaje · visión · tapar · acciones. |
| `frases.json` | Todas las frases de unión de la carta: lo único que el código escribe entre los campos (plano 1, «El código pega»). Cambiarlas aquí cambia el valor por defecto para todos; el usuario las cambia para su edit en la ventana. |
| `rutas.py` | Lo que hace cada ruta del editor. Llama a `nucleo`. |
| `__init__.py` | El nodo, el registro de las rutas y la liberación de la GPU. Es delgado: no decide nada. |
| `web/editor.js` | El botón «Abrir editor…» del nodo. |
| `web/editor_core.js` | La ventana: solo junta las piezas de `web/editor/`, guarda en el nodo y pinta. Se vuelve a cargar cada vez que se abre, con todas sus piezas. |
| `web/editor/util.js` | Ayudas comunes: crear elementos, leer campos del nodo, seguir enlaces, llamar al servidor, direcciones de las fotos. |
| `web/editor/plan.js` | Partes 1 y 2: historia general (idea, estilo, estilo de las palabras) y prompt de la toma elegida (campos con candado, efecto y su frase, rehacer esta toma) y los botones del LLM. |
| `web/editor/referencias.js` | Parte 3: leer las referencias del workflow, las dos mitades, la ficha de cada referencia (papel, nombre, pronombre y atuendo del personaje, ficha, visión, activa, fuerza, quitar), los efectos de texto, el Stack, la biblioteca y el resaltado. |
| `web/editor/cajitas.js` | Abrir una cajita (sus fotos) y crear una nueva. |
| `web/editor/tapar.js` | «Tapar con SAM 3.1» en la ficha: interruptor, chips de qué tapar, forma, vista previa y el cambio de tarjeta entre original y tapado (`ctx.cambiarTarjeta`). |
| `web/editor/linea.js` | Parte 4: la línea de tiempo, elegir toma, añadir y quitar tomas. |
| `web/editor/textos.js` | Parte 4, entre las tomas y la onda: la fila de texto (palabras en pantalla), su arrastre al beat y su tarjetita (texto, encima / al lado, letra, frase). |
| `web/editor/audio.js` | Parte 4, debajo de las tomas: la ventana de audio (el tramo, ▶/⏸, arrastre), la línea de la canción entera y «Cambiar canción» (elegir o subir); al guardar, el recorte. |
| `web/editor/duracion.js` | La duración manda en todo el workflow: fotogramas válidos de H3 y `aplicarDuracion` (length del Text Encode, Prompt Builder…), al guardar y al cambiar `duracion_s` en el nodo. |
| `web/editor/subir.js` | «⬆ Subir foto o video»: la ventanita, con el recorte y el tramo de un video y el modo (comprimido / completo). |
| `web/editor/resolucion.js` | El ancho, el alto y los MP del video, arriba en el centro; los pone en el Text Encode. |
| `web/editor/final.js` | Parte 5: el prompt final pintado por quién escribió cada trozo (o editado a mano), el panel «Frases del código», Escribir historia, Escribir tomas y Guardar. |
| `web/editor/estilos.js` | El CSS de la ventana. |
| `web/editor/i18n.js` | Dos idiomas en la ventana: carga `web/i18n/*.json`, elige el idioma (`idiomaElegido`) y da `t`, `num` y `lista` (`traductor`). |
| `web/i18n/es.json`, `en.json` | Todos los textos que ve el usuario, `{"clave": "texto con {marcadores}"}`. |
| `i18n.py` | Lo mismo en Python: `t(clave, idioma, **datos)`, `num`, `ErrorUsuario` y el generador de `locales/`. |
| `locales/{es,en}/` | Los textos del lienzo de ComfyUI (nombre del nodo y de sus entradas, ajuste del idioma). Se generan con `python i18n.py`. |
| `maqueta/` | El pizarrón donde se diseña la interfaz nueva: `servidor.py`, `index.html` (pizarra), `interfaz.html` (maqueta) y `documentacion/`. |
| `pruebas.py` y `pruebas/` | Las comprobaciones rápidas y su plan de referencia. |
| corridas | `~/Escritorio/experimentos_edit/edit_prompt_llm/<fecha>_<paso>/`: cada llamada al LLM con su prompt, su respuesta y `registro.json`. |

Las piezas de `web/editor/` comparten un objeto `ctx` (estado, referencias y funciones). No se importan entre sí: `editor_core.js` las carga todas. ComfyUI importa también cada `.js` de `web/` al abrir la página, así que una pieza solo puede exportar funciones; nada se ejecuta al importarla.

## Las funciones de entrada

- `escribir_historia(entradas, plan, beats, semilla)` → plan con la historia escrita.
- `escribir_tomas(entradas, plan, beats, semilla, solo=None)` → plan con la dirección escrita. Con `solo=k` regenera solo la toma k.
- `montar_plan(entradas, plan, beats, idioma, con_trozos=False)` → prompt final, avisos (campos vacíos) y cortes; con `con_trozos`, además `{trozos: [(texto, origen, frase)], referencias: {tag: {presentacion, copia}}}`. El montaje (`nucleo.montar`, `renglones_referencias`, `frase_texto`) usa solo `Carta.pegar(clave, **valores)`.
- `planear(idea, n, dur, …, extra=None)` → el recorrido completo sin editor. Lo usa el nodo (con `extra = entradas_de_estado(estado)`) y guarda el resultado en disco para no repetirlo.

`entradas` contiene `{idea, tomas, duracion, palabras, refs, estilo, estilo_palabras, sonido, frases}` (y, desde el nodo sin editor, `textos`). `frases` son las frases de unión que cambió el usuario:
- `refs` es `{"<Picture N>", "<Video N>" o "E1": {papel, nombre, ficha, pronombre, atuendo, presentacion, copia}}` (`pronombre` y `atuendo` solo en personaje; `E1`… son los efectos de texto). Papeles: `personaje`, `objeto`, `lugar` (no cambian) y `ropa`, `pose`, `fondo`, `estilo`, `efecto` (se prestan).
- `perfil_de(menu, entradas)` saca de ahí lo que antes daba la receta: los personajes, el pronombre del protagonista, el estilo y el de las palabras.
- `palabras` y `estilo_palabras` son el formato viejo (`TO YOU @1; PEAK @ultima`): si el plan no tiene `textos`, `textos_de` los convierte. Lo vigente es `plan.textos` (plano 1).
- Papel nuevo `letra` (la tipografía de una palabra), en la mitad azul.

## Las rutas del editor

Hay una sola ruta, `/edit_prompt_llm/<acción>`. Las acciones están en `rutas.ACCIONES`:

| Acción | Para qué | ¿LLM? |
|---|---|---|
| `montar` | plan → prompt final y sus trozos con origen, los renglones de cada referencia, las frases de `frases.json`, cortes, beats y la fila de texto (`textos`, convertida del formato viejo si hace falta) | no |
| `historia` | escribe la historia | sí |
| `tomas` | escribe las tomas, o solo una con `solo` | sí |
| `describir` | propone la ficha y los riesgos de una referencia, con visión | sí |
| `medios` | las fotos de `input/minimax_h3`, para elegirlas en una cajita | no |
| `cajitas` | las fotos de cada cajita (de los archivos `<RefMod>.cajita.json`) | no |
| `audios` | las canciones de la raíz de `input/` (las que ve el LoadAudio), para «Cambiar canción» | no |
| `audio_info` | duración y resumen de picos de la canción entera (caché en disco) | no |
| `audio_ventana` | picos finos alrededor del tramo y, con `wav`, el tramo en WAV para oírlo | no |
| `audio_recortar` | escribe el tramo en `input/edit_tramo_<hash>.wav`, sin tocar la original | no |
| `crear_cajita` | crea un RefMod con varias fotos: manda a ComfyUI el nodo `MiniMaxH3FantasticRefModCreate` (Full Reference, 512) con un VAELoader, por `/prompt`, y apunta sus fotos | no (usa ComfyUI unos 10 s) |
| `subir_refmods` | crea RefMods con fotos ya subidas a `input/minimax_h3` («⬆ Subir foto»): una por foto o todas en una cajita, con el concept_type del papel (`CONCEPTO_PAPEL`), en `subidas/` | no (RefMod unos 5 s) |
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
| cómo se escribe una línea `[Shot n]` | la frase `toma.linea` de `frases.json` (y `toma.*`) |
| cómo se define y se retiene un personaje | `nucleo.definiciones` (la frase «In each shot she wears…» solo va si hay atuendos o ropa) |
| lo fijo de la casa (qué es un edit, el audio, las palabras por defecto) | constantes de arriba de `nucleo.py` |
| cómo se cita un efecto | las frases `def.efecto`, `ret.efecto` y `toma.efecto` de `frases.json` |
| cómo se presenta o se cita cualquier referencia | `def.<papel>`, `ret.<papel>` y `toma.*` en `frases.json` |
| dónde caen los cortes | `nucleo.cortes` |
| las dos mitades, la ficha de una referencia, la biblioteca o el resaltado | `web/editor/referencias.js` |
| las cajitas | `web/editor/cajitas.js` y `rutas.crear_cajita` |
| «Subir foto» | `web/editor/referencias.js` (`ctx.abrirSubir`) y `rutas.subir_refmods` |
| tapar: los chips, la forma o el cambio de tarjeta | `web/editor/tapar.js` |
| tapar: de qué foto se parte | `rutas._fuentes_tapar` |
| tapar: cómo se tapa (radios, pixelado, color) o el grafo de SAM | `nucleo.py`, sección tapar (`tapar_imagen`, `grafo_sam`, `COSAS_TAPAR`) |
| la historia general, la toma elegida, los candados | `web/editor/plan.js` |
| la línea de tiempo (quitar tomas, arrastrar bordes, imán de beats) | `web/editor/linea.js` |
| qué nodos sigue la duración | `web/editor/duracion.js` (`LONGITUD`) |
| la ventana de audio (arrastre, aceleración, reproducir) | `web/editor/audio.js` (constantes `K` y `GANANCIA_MAX`) |
| el recorte, los picos o los beats del tramo | `nucleo.py`, sección audio (`decodificar`, `info_audio`, `beats_cancion`, `beats_de_tramo`) |
| el prompt final y sus botones | `web/editor/final.js` |
| la fila de texto (añadir, arrastrar, la tarjetita) | `web/editor/textos.js` |
| cómo se escribe una palabra en la carta, o la conversión de «TO YOU @1» | `nucleo.frase_texto` y `nucleo.textos_de` |
| el entorno de una toma (auto, manual, sin entorno) | `nucleo.con_entorno`, `sin_entorno`, `pide_luz`; en la ventana, `campoLugar` de `web/editor/plan.js` |
| el menú de encuadres | `nucleo.ENCUADRES` y `ENCUADRE_PROMPT`, y el mismo `ENCUADRES` en `web/editor/plan.js` (letreros `toma.encuadre_op.<i>`) |
| el sonido por defecto | `nucleo.SONIDO` |
| colores y tamaños de la ventana | `web/editor/estilos.js` |
| un texto que ve el usuario (en los dos idiomas) | `web/i18n/es.json` y `en.json` (ver «Dos idiomas») |
| qué se guarda en el nodo o los botones de arriba | `web/editor_core.js` |
| los campos del nodo | `__init__.PromptDelEdit.INPUT_TYPES` |

## Qué guarda el nodo

- **Campos visibles:** idea, tomas, duración, palabras y semilla (ya no hay receta; plano 3).
- **`texto_bloqueado`:** si tiene texto, sale tal cual.
- **`estado` (oculto, `v: 4`):** JSON con lo que guarda el editor: `refs` (por nombre de RefMod), `etiquetas`, `efectos` (de texto), `estilo`, `estilo_palabras` (viejo), `sonido`, `plan` (con `textos` y el `entorno` de cada toma), `prompt`, `a_mano` y `audio` (`original`, `inicio_s`, `recorte`, `tocado`).

Al ejecutar, el nodo decide así:
1. si hay `texto_bloqueado`, sale ese texto;
2. si no, y el editor dejó un prompt, sale ese prompt;
3. si no hay ninguno de los dos, hace el recorrido completo con el LLM, con las referencias, efectos y estilo del estado si los hay.

## Dos idiomas

- **Regla:** ningún texto para el usuario va escrito en el código. En JS: `u.t("zona.cosa", { n })` (las piezas lo reciben en `ctx.u`; `editor.js` tiene su propio `t`). En Python: `i18n.t("zona.cosa", idioma, n=n)`, y los errores `raise ErrorUsuario("errores.cosa", n=n)`.
- **Zonas de las claves:** `comun`, `historia`, `toma`, `referencias`, `tapar`, `linea`, `audio`, `final`, `errores`, `nodo`, `ajuste`, `duracion`.
- **Números:** `u.num(x, decimales)` (coma en español, punto en inglés); listas con `u.lista([...])`. Los tiempos `m:ss.mmm` del audio son un código de tiempo y llevan punto en los dos.
- **Qué se queda en un idioma:** lo que va al LLM o a H3 (inglés), los problemas de revisión que se le devuelven al LLM (español), las descripciones guardadas en los RefMods y los `.tapado.json` (español, con su clave al lado para volver a enseñarlos).
- **El idioma:** ajuste de ComfyUI `EditPromptLLM.Idioma` (auto sigue a `Comfy.Locale`). La ventana manda `idioma` en cada llamada al servidor y lo guarda en `estado` para el informe del nodo. El nombre del nodo y de sus entradas los traduce ComfyUI con `locales/` y `Comfy.Locale`.

### Añadir un letrero nuevo

1. Escribe en el código `t("zona.nombre", { dato })` (o `i18n.t(...)` / `ErrorUsuario(...)` en Python).
2. Añade la clave a **los dos** archivos, `web/i18n/es.json` y `web/i18n/en.json`, con los mismos `{marcadores}`.
3. Si es del lienzo (nombre o ayuda de una entrada del nodo, el ajuste), corre `python i18n.py` y reinicia ComfyUI.
4. Corre `pruebas.py`: la sección 15 avisa si falta una clave, si sobra, si los marcadores no coinciden o si quedó un letrero escrito en el código.
