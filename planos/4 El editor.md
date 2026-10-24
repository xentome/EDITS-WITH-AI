# El editor

Lectura: 4 min

**En resumen:** con «Abrir editor…» (o doble clic en el nodo) se abre la **interfaz nueva**: una sola pantalla con 5 partes, de arriba abajo. Es la maqueta aprobada (`maqueta/interfaz.html`) hecha de verdad. Lo creativo lo escribes tú o se lo pides al LLM; lo que escribes queda fijo (🔒). «Guardar» lo deja todo en el nodo y, al ejecutar, el nodo saca ese prompt sin volver a llamar al LLM.

## Las 5 partes

### 1 · Historia general
- **Idea**, con tus palabras. Manda sobre todo lo demás.
- **Arco, luz y ambiente, y fondo general**, con candado.
- Arriba a la derecha, los campos del nodo: receta, tomas, duración, semilla y palabras (opcionales: `TO YOU @1`).

### 2 · Prompt de la toma
- Al principio dice «Selecciona una toma…». Cuando eliges una en la línea de tiempo, aparece:
  - su línea `[Shot n]`, tal como va al prompt final;
  - **qué pasa:** lugar, qué pasa, efecto y frase del efecto (↺ vuelve a la frase de la receta);
  - **referencias que usa:** atuendo, ropa, pose, objeto, lugar fijo y fondo. Solo salen los menús de los papeles que tienen referencias;
  - **dirección:** encuadre, cámara, luz y gesto.
- Todo con 🔒 / 🔓: lo que escribes o eliges queda fijo. Pulsa el candado para soltarlo.
- **🔄 rehacer esta toma** (unos 7 s): escribe de nuevo su dirección, mirando a sus dos vecinas. **✕ quitar toma** la saca del edit.

### 3 · Referencias, partidas en dos
- **Izquierda roja, lo que no cambia:** personaje, objeto y lugar.
- **Derecha azul, lo que se presta:** ropa, pose, fondo y estilo. Abajo, los **efectos** de la receta como fichas.
- **Cómo se ven:** grandes y enteras, sobre la misma foto desenfocada. Abajo, una franja con el número (`<Picture N>`, `<Video N>`), el papel y el nombre. Las columnas se eligen solas para que las fotos salgan lo más grandes posible.
- **Al elegir una toma** se iluminan en dorado las que usa, en las dos mitades y en los efectos, y las demás se apagan. La identidad (personaje sin nombre) y el estilo cuentan como usados en todas. Tocar un efecto lo pone o lo quita en la toma elegida.
- **Al tocar una referencia** se abre su **ficha**: la foto grande y sus controles:
  - **papel** (cambia de mitad al cambiarlo);
  - **nombre en el prompt** (personaje con atuendo, objeto, lugar, ropa). Un personaje **sin nombre** solo da la identidad;
  - **ficha** en inglés, lo que el LLM sabe de la imagen;
  - **👁 describir con visión** (14–21 s): propone nombre, ficha y riesgos; «usar» o «descartar»;
  - **activa, fuerza y ✕ quitar** del Stack;
  - **usada en** (definición, T1 · T3).
- **+ Añadir** abre la biblioteca de RefMods. Lo que añades toma el papel que toca en esa mitad (por ejemplo, un RefMod de fondo añadido a la izquierda es un lugar).
- **Cada referencia se reconoce por su nombre de RefMod, no por su número.** Si añades, quitas o apagas tarjetas, los números cambian, pero el papel, la ficha y las tomas siguen a su imagen.

### Las cajitas
- **Una cajita es un RefMod con varias fotos.** Fantastic las junta, una por fotograma, y H3 la recibe como `<Video N>`. Ocupa un solo lugar, enseña un mosaico y la insignia «4 fotos».
- **Al tocarla** se abre con todas sus fotos y los mismos controles que una referencia. «✎ Cambiar fotos» abre el creador con esas fotos; al crearla, la nueva ocupa su sitio en el Stack y las tomas que la citaban la siguen citando.
- **+ Cajita** (en cada mitad) abre el creador: eliges las fotos de las referencias del editor o del Media Loader (`input/minimax_h3`), el nombre, el papel y, si quieres, el nombre en el prompt y la ficha. «Crear cajita» tarda unos 10 s. Puede apagar en el Stack las fotos sueltas que metiste.
- Las fotos de cada cajita se apuntan en `models/refmods/<nombre>.cajita.json`, porque el RefMod solo guarda la primera como vista previa. Las de `personajes/teto_identidad_4` se apuntaron a mano; una cajita sin ese archivo enseña solo su primera foto.

### 4 · Línea de tiempo
- Una cajita de color por toma. **Su ancho es lo que dura**, con los cortes puestos en los beats del audio. Dice su número, su lugar, sus segundos y su efecto.
- Tocar una toma la elige (o la suelta). **+** añade una toma; no deja si ya no caben (0,4 s cada una).

### 5 · Prompt final
- El código lo vuelve a montar cada vez que cambias algo, sin llamar al LLM, y avisa de los huecos.
- **Escribir historia** (unos 80–110 s): rellena lo no fijado del arco, la luz y, en cada toma, el lugar, lo que pasa, las referencias y el efecto. Vacía la dirección no fijada.
- **Escribir tomas** (13–30 s): encuadre, luz, gesto y cámara de todas las tomas, salvo lo fijado.
- **Guardar**, **Editar a mano** (queda «editado a mano» y no se vuelve a montar solo) y **Volver a montar**.

## Guardar
- «Guardar» (arriba o en el prompt final) y «Guardar y cerrar» escriben en el nodo: los campos visibles y el campo oculto `estado`. Después guarda el workflow (Ctrl+S).
- ✕ cierra sin guardar. Escape cierra solo la ventana de encima (ficha, cajita o biblioteca).
- Al ejecutar, el informe del nodo dice «Prompt del editor».

## Por dentro
- **Archivos:** `web/editor.js` es el botón; `web/editor_core.js` junta las piezas de `web/editor/` (plano 2). Todo se vuelve a cargar cada vez que se abre.
- **Servidor:** `/edit_prompt_llm/<acción>`; las acciones están en `rutas.ACCIONES` (recetas, montar, historia, tomas, describir, medios, cajitas, crear_cajita). Antes de usar el LLM, el servidor comprueba que ComfyUI no esté renderizando y le pide que suelte la GPU. Crear una cajita también exige la cola vacía.
- Al abrir sin recargar la pestaña: `const m = await import('/extensions/edit_prompt_llm/editor_core.js?v='+Date.now()); await m.abrir(app.graph.getNodeById(74), app)` (devuelve el `ctx`, útil para probar).

## Límites conocidos
- Si una tarjeta del Stack tiene copias, la numeración puede no coincidir con la del Text Encode. El editor avisa. También avisa con más de 9 fotos o 3 videos.
- Los videos del Media Loader no tienen vista previa en el editor.
- Las frases fijas de los efectos de la receta pueden chocar con el lugar (U3 habla de «the night city»); hoy lo corrige el usuario (plano 5, fila 29).
- El `resumen` de la receta de Teto dice «in a Japanese city» aunque el lugar fijo sea otro.
