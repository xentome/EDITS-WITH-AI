# El editor

Lectura: 4 min

**En resumen:** con «Abrir editor…» (o doble clic en el nodo) se abre la **interfaz nueva**: una sola pantalla con 5 partes, de arriba abajo. Es la maqueta aprobada (`maqueta/interfaz.html`) hecha de verdad. Lo creativo lo escribes tú o se lo pides al LLM; lo que escribes queda fijo (🔒). «Guardar» lo deja todo en el nodo y, al ejecutar, el nodo saca ese prompt sin volver a llamar al LLM.

## Las 5 partes

### 1 · Historia general
- **Idea**, con tus palabras. Manda sobre todo lo demás.
- **Arco, luz y ambiente, y fondo general**, con candado.
- **Estilo**, debajo de la idea, en inglés: cómo se dibuja todo (plano 3). Vacío, no se inventa ninguno.
- Arriba a la derecha, los campos del nodo: tomas, duración, semilla y palabras (opcionales: `TO YOU @1`), y el **estilo de las palabras** (opcional).
- La caja va en **rojo oscuro opaco con letras blancas**, para que resalte; los campos de dentro, en un rojo más oscuro.

### 2 · Prompt de la toma
- Al principio dice «Selecciona una toma…». Cuando eliges una en la línea de tiempo, aparece:
  - su línea `[Shot n]`, tal como va al prompt final;
  - **qué pasa:** lugar, qué pasa, efecto (referencias de papel efecto y efectos de texto) y frase del efecto (↺ vuelve a la ficha del efecto; escrita sin efecto, es un efecto solo de esa toma, y «＋ guardar como efecto» la convierte en un efecto de texto);
  - **referencias que usa:** atuendo, ropa, pose, objeto, lugar fijo y fondo. Solo salen los menús de los papeles que tienen referencias;
  - **dirección:** encuadre, cámara, luz y gesto.
- Todo con 🔒 / 🔓: lo que escribes o eliges queda fijo. Pulsa el candado para soltarlo.
- **🔄 rehacer esta toma** (unos 7 s): escribe de nuevo su dirección, mirando a sus dos vecinas. **✕ quitar toma** la saca del edit.

### 3 · Referencias, partidas en dos
- **Izquierda roja, lo que no cambia:** personaje, objeto y lugar.
- **Derecha azul, lo que se presta:** ropa, pose, fondo, estilo y efecto. Abajo, los **efectos de texto** (E1, E2…) como fichas y **+ Efecto** para crear uno (nombre y frase). Tocar uno con una toma elegida lo pone o lo quita; sin toma, se abre para cambiarlo o quitarlo (con confirmación).
- **Colores por mitad:** cada tarjeta lleva un borde de 2 px rojo apagado a la izquierda y azul apagado a la derecha (también cada foto del mosaico de una cajita). La que usa la toma elegida lleva una **doble línea dorada**, más gruesa, para que no se confunda.
- **Cómo se ven:** grandes y enteras, sobre la misma foto desenfocada. Abajo, una franja con el número (`<Picture N>`, `<Video N>`), el papel y el nombre. Las columnas se eligen solas para que las fotos salgan lo más grandes posible.
- **Al elegir una toma** se iluminan en dorado las que usa, en las dos mitades y en los efectos, y las demás se apagan. La identidad (personaje sin nombre) y el estilo cuentan como usados en todas. Tocar un efecto lo pone o lo quita en la toma elegida.
- **Al tocar una referencia** se abre su **ficha**: la foto grande y sus controles:
  - **papel** (cambia de mitad al cambiarlo);
  - **nombre**: en un personaje, su nombre («Teto»; las fotos con el mismo nombre son el mismo personaje); en objeto, lugar, ropa y efecto, el nombre en el prompt;
  - en un personaje, además, **pronombre** (they por defecto, she, he) y **atuendo** opcional;
  - **ficha** en inglés: lo que el LLM sabe de la imagen; en un personaje, va a su definición; en un efecto, es la frase que va al prompt;
  - **👁 describir con visión** (14–21 s): propone nombre, ficha y riesgos; «usar» o «descartar»;
  - **activa, fuerza y ✕ quitar** del Stack;
  - **tapar con SAM 3.1** (ver «Tapar», abajo);
  - **usada en** (definición, T1 · T3).
- **✕ en la esquina de arriba a la izquierda** de cada tarjeta del Stack (también en las cajitas): siempre visible. El primer toque pregunta «¿quitar? sí / no»; «sí» hace lo mismo que «✕ quitar» de la ficha (`ctx.quitarDelStack`). Tocar la ✕ no abre la ficha. Los medios del Media Loader no la tienen, porque no están en el Stack.
- **+ Añadir** abre la biblioteca de RefMods, con recuadros grandes (unas 4 columnas) y fotos enteras. Con **− / deslizador / +** los haces más grandes o más pequeños; se recuerda el último tamaño en el navegador. Lo que añades toma el papel que toca en esa mitad (por ejemplo, un RefMod de fondo añadido a la izquierda es un lugar).
- **La biblioteca es de selección múltiple:** tocar una foto la marca o la desmarca (✓ y borde azul); no la añade ni cierra. Abajo a la derecha, **«Añadir (N)»** (azul, apagado si no hay ninguna) mete todas las marcadas en el Stack, en el orden en que las marcaste, y cierra (`ctx.anadirVariosDeBiblioteca`). Si con ellas el Stack pasa de 12 tarjetas, avisa dentro de la ventana y no añade ninguna. Buscar no borra lo marcado.
- **Cada referencia se reconoce por su nombre de RefMod, no por su número.** Si añades, quitas o apagas tarjetas, los números cambian, pero el papel, la ficha y las tomas siguen a su imagen.

### Las cajitas
- **Una cajita es un RefMod con varias fotos.** Fantastic las junta, una por fotograma, y H3 la recibe como `<Video N>`. Ocupa un solo lugar, enseña un mosaico y la insignia «4 fotos».
- **Al tocarla** se abre con todas sus fotos y los mismos controles que una referencia. «✎ Cambiar fotos» abre el creador con esas fotos; al crearla, la nueva ocupa su sitio en el Stack y las tomas que la citaban la siguen citando.
- **+ Cajita** (en cada mitad) abre el creador: eliges las fotos de las referencias del editor o del Media Loader (`input/minimax_h3`), el nombre, el papel y, si quieres, el nombre en el prompt y la ficha. Sus fotos para elegir también tienen el control de tamaño, que se recuerda aparte. «Crear cajita» tarda unos 10 s. Puede apagar en el Stack las fotos sueltas que metiste.
- Las fotos de cada cajita se apuntan en `models/refmods/<nombre>.cajita.json`, porque el RefMod solo guarda la primera como vista previa. Las de `personajes/teto_identidad_4` se apuntaron a mano; una cajita sin ese archivo enseña solo su primera foto.

### Tapar (en la ficha de una referencia)
- **Para qué:** que una ropa, una pose o un fondo prestados no traspasen la cara de quien sale en la foto (plano 5). Se tapa la cara, el pelo o el texto de la foto y H3 recibe la copia tapada.
- **Dónde:** en la ficha de cada tarjeta del Stack que sea una foto, y en las cajitas que tienen sus fotos apuntadas (se tapan todas). No está en las fotos del Media Loader ni en los videos.
- **Dos clics:** los chips **cara** y **pelo** vienen marcados; basta con encender **☐ tapar**. También hay **texto** (letras grandes, logos y firmas), un campo libre para otra cosa en inglés (`hat, logo`) y la forma: **difuminado** (por defecto), **pixelado** o **parche de color** (el color medio de la zona).
- **👁 vista previa** enseña la foto tapada sin crear nada y dice cuánto ocupa cada cosa (`face 4,6 % · hair 3,8 %`; con 0 %, «no encontré…»).
- **Al encender** se ve el progreso: «Buscando la cara y el pelo… 7 s» y «Creando la referencia tapada… 4 s». El servidor:
  1. busca la foto fuente: las fotos del `.cajita.json`; si no, la foto de `input/minimax_h3` con el mismo nombre que el RefMod y la misma proporción que su vista previa (`ropa/vera` → `vera.jpg`); si no, la vista previa `.png` junto al `.safetensors` (512 px de alto), copiada a `input/minimax_h3/tapado/fuentes/`, **con un aviso** de que tiene menos resolución (la misma con la que se crea el RefMod, 512);
  2. hace las máscaras con SAM 3.1 (`CheckpointLoaderSimple` con `sam3.1_multiplex_fp16` → `CLIPTextEncode` con la palabra → `SAM3_Detect`, umbral 0,4) en un solo `/prompt`, y las guarda en la caché `~/Escritorio/experimentos_edit/edit_prompt_llm/cache_tapar/`;
  3. sin IA, junta las máscaras, las agranda un poco, suaviza el borde y tapa (radios escalados al tamaño de la foto); guarda `input/minimax_h3/tapado/<nombre>__tapado_<huella>.png`;
  4. crea el RefMod hermano **`<carpeta>/<nombre>__tapado_<huella>`** como una cajita (Full Reference, 512, VAE de H3, el mismo concepto que el original) y escribe al lado su **`.tapado.json`** (original, qué se tapó, forma, fuente, aviso).
- **La tarjeta del Stack cambia** al tapado en el mismo sitio, con la misma fuerza y el mismo «activa». La etiqueta (`<Picture 6>`) y las tomas que la citan no cambian; el papel, el nombre y la ficha se copian a la clave del tapado.
- **Apagar** vuelve a la original (lo hecho en la ficha vuelve con ella). **Encender otra vez** con las mismas opciones reutiliza el tapado ya creado: la huella depende del original, del contenido de sus fotos, de lo que se tapa y de la forma, así que da el mismo nombre y no se usa SAM ni la GPU (0,1 s).
- Si cambias los chips o la forma con el tapado puesto, sale **↻ aplicar estas opciones**: hace otro tapado, siempre desde la original.
- **Texto:** SAM 3.1 con «text» encuentra bien las letras grandes y los logos (SHINE, BEABADOOBEE, WRAPSTARZ, el usuario de un post), pero no las líneas de letra pequeña.

### 4 · Línea de tiempo
- Una cajita de color por toma. **Su ancho es lo que dura**, con los cortes puestos en los beats del audio. Dice su número, su lugar, sus segundos y su efecto.
- Tocar una toma la elige (o la suelta). **+** añade una toma; no deja si ya no caben (0,4 s cada una).
- **✕ pequeña** arriba a la derecha de cada toma: el primer toque pregunta «¿quitar? sí / no». Al quitarla, las demás se reparten su tiempo (con cortes a mano, cada una en proporción a lo que dura; si no, se vuelven a poner en los beats).
- **Arrastrar el borde** entre dos tomas alarga una y acorta la otra: mínimo 0,4 s por toma, al fotograma, y mientras arrastras se ven los segundos de las dos («1,25 s | 0,60 s»). Con **☑ pegar a los beats** (encendido por defecto), al soltar el borde se va al beat más cercano si hay uno a ±0,15 s.
- Desde que mueves un borde, los cortes son **«a mano»** (marca dorada en el título): se guardan en el plan (`plan.cortes`) y el montaje los usa en lugar de calcularlos. **↺ cortes automáticos** los olvida. Si cambias la duración, se estiran en proporción; si ya no caben, vuelven los automáticos (con un aviso en el prompt final).
- Con cortes a mano, **+** parte en dos la última toma (si dura al menos 0,8 s).

### 4b · Ventana de audio (debajo de las tomas)
- **Para qué:** elegir con exactitud qué tramo de una canción larga usa el edit, sin recortar audios a mano. Lo eliges tú; la app no lo decide. Los cortes de las tomas caen en los beats **de ese tramo**.
- **Dos filas del mismo largo:** arriba las tomas y debajo la **onda solo del tramo** que duran (por ejemplo 3,042 s). El ▶/⏸ va justo debajo del +. Las líneas blancas sobre la onda son los cortes de las tomas.
- **▶/⏸** suena solo el tramo y se para sola al final; un cabezal dorado avanza. Pausa y sigue desde ahí. Espacio hace lo mismo con la onda elegida.
- **Arrastrar la onda** mueve la canción por debajo (a la izquierda = más adelante). Tiene aceleración tipo puntero: despacio, 1 px es muy poco (unos 2 ms con 5 s de tramo); rápido, avanza mucho (600 px rápidos = unos 75 s). Al soltar, el inicio cae en el fotograma más cercano (1/24 s).
- **Fino:** rueda = ±1 fotograma; **←/→** = ±1 fotograma; **Mayús+flecha** = ±1 s; Inicio = 0.
- Arriba de la onda, el inicio y el fin (`m:ss.mmm · f N`); debajo, el tramo, la ayuda y la canción con su duración.
- **La línea delgada** (10 px, no cuenta como fila) es la **canción entera**, del mismo largo: el segmento azul es el tramo y el **punto blanco** su centro. Tocar la línea salta ahí; arrastrar el punto lo mueve (despacio, menos que el ratón, para afinar). La línea y la ventana se mueven siempre juntas.
- **Al guardar:** si moviste el audio, se escribe el recorte `input/edit_tramo_<hash>.wav` (el mismo archivo, inicio y duración dan el mismo nombre) y el LoadAudio del workflow pasa a apuntar a él: es lo que reciben H3 (AddGuide) y CreateVideo. La canción original y el inicio quedan en el estado; al reabrir, la ventana vuelve a la original. Si no tocaste el audio, todo sigue como antes. Si el LoadAudio apunta a otra canción, se empieza de cero con ella.
- **Beats:** son los de la canción entera (calculados una vez y guardados en `~/Escritorio/experimentos_edit/edit_prompt_llm/cache_audio/`) desplazados al inicio del tramo. Analizar solo el tramo cambiaba el tempo que ve librosa (a veces la mitad de beats).

### 5 · Prompt final
- El código lo vuelve a montar cada vez que cambias algo, sin llamar al LLM, y avisa de los huecos.
- **Escribir historia** (unos 80–110 s): rellena lo no fijado del arco, la luz y, en cada toma, el lugar, lo que pasa, las referencias y el efecto. Vacía la dirección no fijada.
- **Escribir tomas** (13–30 s): encuadre, luz, gesto y cámara de todas las tomas, salvo lo fijado.
- **Guardar**, **Editar a mano** (queda «editado a mano» y no se vuelve a montar solo) y **Volver a montar**.

## Guardar
- Arriba a la derecha: **«Guardar»** en azul opaco y **«Guardar y cerrar»**, un poco más grande, en verde opaco. Colores lisos, sin degradados.
- «Guardar» (arriba o en el prompt final) y «Guardar y cerrar» escriben en el nodo: los campos visibles y el campo oculto `estado`. Después guarda el workflow (Ctrl+S).
- ✕ cierra sin guardar. Escape cierra solo la ventana de encima (ficha, cajita o biblioteca).
- Al ejecutar, el informe del nodo dice «Prompt del editor».

## Por dentro
- **Esquinas rectas en toda la ventana** (cajas, tarjetas, botones, campos, insignias, menús y ventanitas). En `web/editor/estilos.js` cada curva vale `--radio × su tamaño de antes`, con `--radio:0` en `.epl-fondo`; con `--radio:1` vuelven las de antes. La maqueta usa la misma variable en `:root`.
- **Archivos:** `web/editor.js` es el botón; `web/editor_core.js` junta las piezas de `web/editor/` (plano 2). Todo se vuelve a cargar cada vez que se abre.
- **Servidor:** `/edit_prompt_llm/<acción>`; las acciones están en `rutas.ACCIONES` (montar, historia, tomas, describir, medios, cajitas, crear_cajita, tapados, tapar_previa, tapar, audio_info, audio_ventana, audio_recortar). Antes de usar el LLM, el servidor comprueba que ComfyUI no esté renderizando y le pide que suelte la GPU. Crear una cajita y tapar también exigen la cola vacía.
- Al abrir sin recargar la pestaña: `const m = await import('/extensions/edit_prompt_llm/editor_core.js?v='+Date.now()); await m.abrir(app.graph.getNodeById(74), app)` (devuelve el `ctx`, útil para probar).

## Límites conocidos
- Si una tarjeta del Stack tiene copias, la numeración puede no coincidir con la del Text Encode. El editor avisa. También avisa con más de 9 fotos o 3 videos.
- Los videos del Media Loader no tienen vista previa en el editor.
- Sin el editor (el nodo hace todo con el LLM), los beats salen del audio que llega al nodo, o sea del recorte entero, no de la canción desplazada: pueden variar unos ms.
- Los recortes `edit_tramo_*.wav` se quedan en `input/`; no se borran solos. Lo mismo con las fotos de `input/minimax_h3/tapado/` y los RefMods `__tapado_*` que ya no se usan.
- «Tapar» no está en las fotos del Media Loader (no son tarjetas del Stack) ni en los videos.
- Workflows de antes de quitar las recetas: abren con avisos (plano 3, «Workflows de antes»).
