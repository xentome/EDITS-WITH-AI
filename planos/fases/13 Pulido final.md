# Fase 13 · Pulido final de la interfaz

Lectura: 2 min · 28 oct 2026 · Sesión «PULIDO FINAL APP». Respaldo: etiqueta `respaldo-antes-pulido`.

**En resumen**
- Jonathan pide cambios de interfaz uno a uno. Cada tanda: commit pequeño, `pruebas.py` en TODO BIEN, captura en un navegador aparte (1440×900 y 2548×1284, ES y EN) y la guía del agente al día.

## 1 · El panel de la toma (variante P2) ✅

- **Por qué:** Jonathan vio que el panel rompía los principios de diseño de interfaces (artículo de Figma: jerarquía, divulgación progresiva, consistencia, contraste, accesibilidad, proximidad y alineación). Letra demasiado pequeña e igual en títulos y campos, campos cortados a 1440, candados de 26 px, referencias partidas en dos sitios y una ayuda que decía «abajo» cuando el estante ya está arriba.
- **Prototipo:** `app/web/prototipo_panel_toma.html?variant=P1|P2|P3` (tres variantes con las 10 mejoras; desechable, fuera de git). Eligió **P2**: «sin duda la más amigable e intuitiva».
- **Lo que cambió** (`web/editor/plan.js`, `linea.js`, `util.js`, `estilos.js`, `app/web/temas/casete.css`, i18n):
  1. Tres tamaños de letra: grupo y pestaña (17–18 px), nombre de campo (14 px), lo escrito (16 px; Acción, 20 px).
  2. El título primero: «A1 · Toma 1 · segundos · fotogramas», la pastilla «faltan N: …» y, a la derecha, «Rehacer esta toma» y ✕. «Escribir tomas» pasó a la cabecera de la línea de tiempo (es de todo el edit).
  3. Cada campo es un bloque igual (`bloque` en plan.js): nombre con icono arriba y el control con su botón de 40 px a la derecha.
  4. Los textos crecen con lo escrito (`field-sizing: content`).
  5. Botones, candados y opciones de 40 px.
  6. Lo que falta (los huecos del montaje: encuadre, cámara, gesto y, con entorno, lugar y luz) va en punteado amarillo con «falta», y se pone al día al escribir (`pintarFaltas`).
  7. Lo principal siempre a la vista: «Qué pasa» (Acción / movimiento) y «El personaje» (Gesto). Lo demás en tres pestañas: **Cámara** (encuadre, movimiento, luz), **Lugar y estilo** (entorno, lugar, estilo) y **Referencias** (conectadas, efecto de la referencia, atuendo, ropa, pose, objeto, lugar fijo y fondo). Cada pestaña dice cuánto le falta; la de Referencias, cuántas usa la toma.
  8. «Efecto de la referencia» solo sale con una referencia conectada (o si ya escribiste tu frase). El fondo, con una miniatura de 64 px.
  9. Todos los campos con icono (`ICONO` en plan.js; iconos nuevos en util.js) y el mismo candado; «≡ menú» y ↺ ocupan su sitio. El entorno es su propio bloque y hace de candado del lugar.
  10. La ayuda dice «se ilumina arriba, en el estante; arrastra un póster hasta aquí».
- Cambiar de pestaña no repinta (no se pierde lo que escribes). Las marcas «✎ agente» de un campo en una pestaña cerrada se ven en la pestaña (contorno rosa, CSS `:has`).
- Claves i18n nuevas: `toma.falta`, `toma.falta_n`, `toma.faltan`, `toma.completa`, `toma.pestanas`, `toma.pestana.*`, `toma.grupo.*`, `toma.entorno`, `toma.efecto.mas`, `toma.luz.ayuda`, `toma.gesto.ayuda`. Fuera: `toma.direccion`, `toma.que_pasa`, `toma.refs`, `toma.encuadre.menu`, `toma.quitar`.
- Guía del agente: `app/guia/1_mapa.md` (fila del panel y «Escribir tomas» en la línea de tiempo). Las herramientas del MCP no cambian: los campos y sus `data-campo` son los mismos.
- Comprobado: 1440×900 y 2548×1284, ES y EN, las tres pestañas, la toma 2 con su efecto conectado, escribir el gesto quita su «falta» y la pastilla baja a «1 missing: light».
- Queda en el CSS lo viejo del panel (`.epl-tres`, `.epl-g-*`, `.epl-fondo-grande`…) sin uso; no molesta.

## 2 · Git ordenado y un solo tema ✅

- **Un solo tema:** se quitaron `temas/trama.css`, `azul.css`, `coral.css` y `amarillo.css` (Jonathan, 28 oct). `index.html` carga `casete.css` directo, sin `?tema=`.
- **Qué va a git y qué no** (antes del push, 28 oct):
  - Sí: `PRODUCT.md`, `.impeccable/surfaces/` (el contrato del tema) y `.impeccable/mocks/decision/r3/r3-casete.html` (la maqueta elegida, citada en la fase 9); la `maqueta/` (Jonathan quiso guardarla: la del 24 oct, el dibujo del panel del 26 oct y las páginas de inspiración, con sus propias fotos).
  - No (se quedan en el PC, en `.gitignore`): el resto de `.impeccable/` (rondas descartadas, su caché y una imagen de otra marca, «ARCMAIL», que no puede ir en un repo público), `app/ui-prototipo/` (el prototipo React de P10, superado) y `app/web/prototipo_*.html` (el del panel de la toma).

## 3 · Generar sin canción ✅

- **Por qué:** Jonathan quiso generar solo con el prompt de sonido; sin canción, «Generar» fallaba con «falta la canción».
- **Lo que cambió:**
  - `app/generar.py`: con el LoadAudio vacío, se quita, se salta el `MiniMaxH3AddGuide` que solo anclaba la canción (el guía recibe el `positive` del Text Encode) y el `CreateVideo` toma el audio del `VAEDecodeAudio`. El `audio_1` del Builder es opcional y se borra solo.
  - En la ventana (`plan.js`), sin canción, «Tu canción» sale apagado, «Audio de H3» marcado y la ayuda dice que escribas en «Sonido» cómo debe sonar. La elección guardada no se toca y vuelve al poner una canción. Clave i18n nueva: `linea.audio.sin_cancion`.
  - Agente: sin canción ya no es un error de `revisar_proyecto`, solo un aviso (`agente.py`, `mcp_servidor.py`, `app/guia/3_organizar.md`, `1_mapa.md`, `8_errores.md`).
- **Comprobado:** `prueba_generar.py --seco` (grafo sin canción sin enlaces rotos), `pruebas.py` TODO BIEN y la ventana en el navegador aparte. Falta un render de verdad sin canción.

## 4 · Sonido y canción más visibles ✅

- **Por qué:** Jonathan no veía el campo del sonido y no encontraba cómo añadir una canción: sin canción no había ningún botón, solo «Sin audio conectado».
- **Lo que eligió:** cian eléctrico `#22E4FF` (`--k-cian` en casete.css; el naranja es de Generar) y un panel propio para el sonido.
- **Lo que cambió:**
  - `audio.js`: sin canción sale un botón grande cian, «Añadir canción o audio de referencia». Abre la lista de input/ (también sin canción) o recibe el archivo soltado encima. «Cambiar canción» también va en cian.
  - `plan.js`: «Sonido del video» va en su panel cian, con título grande y un texto de 3 renglones a 18 px. Intro no hace salto de línea, porque es un solo renglón del prompt. Sin canción, el ejemplo dice cómo escribirlo.
  - Claves i18n: `audio.anadir`, `audio.anadir.sub`, `audio.anadir.tooltip`, `linea.sonido.titulo`, `linea.sonido.placeholder_sin`.
- **El prompt sin canción** (`nucleo.py`, `rutas.montar`, `frases.json`): no nombra `<Audio 1>`. Sin `def.audio` ni `ret.audio`, el resumen es «An edit of…» y la summary queda en «[reference generation]». Frases nuevas: `resumen.sin_cancion`, `sonido.sin_cancion` y `musica.sin_cancion`. Prueba en la sección 8d de pruebas.py.
- **Comprobado:** 1440×900 y 2548×1284, con canción y sin ella; el botón abre la lista de 56 audios.

## 5 · Menos alto el sonido, más visible la duración ✅

- **Por qué:** Jonathan: «hazlo mucho menos alto, no debe resaltar tanto»; y «la duración sí debe resaltar más, un poco más alta y con un color especial». Eligió violeta eléctrico `#A35BFF` (`--k-violeta`).
- **El sonido:** un renglón que crece con el texto (`field-sizing: content`, 16 px). El borde y el fondo cian van más suaves, y el título baja a 16 px. El panel pasó de unos 230 px a 118 px de alto. El botón «Añadir canción», de 64 a 46 px, con menos brillo.
- **La duración:** 42 px de alto, con borde, fondo y rótulo violeta, números de 18 px y un brillo suave. Solo CSS (`casete.css`), sin cambios en el código.
- **Aún más bajo (Jonathan):** el título, el texto y «Traducir» van en un solo renglón y «Audio del video» queda debajo. El panel pasó de 118 a 74 px.

## 6 · Los submenús: análisis y prototipo (en curso)

- **Pedido:** pulir la ficha de una referencia, «Añadir referencia» y los dos apartados de Retocar. Antes, ver qué hacen mal frente a los principios del artículo de Figma.
- **Análisis (28 oct):** 29 propuestas.
  - A1–A6: ficha. Título humano, ayuda en «ⓘ», «Quitar» en rojo que pregunta, la ventana crece con la pantalla, 2 pestañas y «Listo» con «se guarda solo».
  - B1–B7: añadir. Título corto, «Subir» en la cabecera y zona de soltar solo al arrastrar, tamaño con nombre, barra fija con «Añadir N», tarjetas con el papel en color, filtros por tipo, ventana accesible.
  - C1–C7: Inpainting. Regla con miniaturas donde un clic salta, «👁 Máscara», pantalla grande, una sola fila de transporte de 40 px, nombres claros, pastilla «Elegido» y acción fija.
  - D1–D6: Extender. Botones de 40 px y atajos de largo; orden nuevo (largo, qué pasa, audio, referencias, «Más opciones»); sin jerga; acción fija; el mismo transporte; la semilla recordada.
  - E1–E3: la misma cabecera, un solo tamaño de botón y las ayudas en «ⓘ».
- **Jonathan:** «aplicaremos TODAS» primero en prototipos. Prototipo: `app/web/prototipo_submenus.html?menu=ficha|anadir|inpainting|extender&variant=P1|P2|P3`, desechable y fuera de git, con los RefMods y un video de verdad; no guarda ni genera nada.
  - Ficha: P1 ventana grande con 2 pestañas · P2 panel lateral · P3 navegación a la izquierda con tarjetas.
  - Añadir: P1 galería con barra fija · P2 carpetas a la izquierda y bandeja · P3 lista con vista previa.
  - Inpainting: P1 visor a la izquierda · P2 cine arriba y ajustes en 3 columnas · P3 por pasos.
  - Extender: P1 columna ordenada · P2 la línea de tiempo manda · P3 tres preguntas grandes.
- **Elegidas (Jonathan, 28 oct):** Inpainting P1, Extender P1, Ficha P3 y Añadir P2 («las carpetas son una gran idea»). Las carpetas son las subcarpetas de `ComfyUI/models/refmods/`, de donde Fantastic lee los RefMods. Al tamaño real, el pie de «Añadir» P2 se veía cortado; ya está corregido en el prototipo.
- Aplicado a la app (28 oct): ver §7.

## 7 · Errores, preview en vivo, carpetas y los 4 submenús ✅ (28 oct)

- **Videos se trababa:** cada clic creaba un `<video>` nuevo y el viejo seguía descargando; con los de Retocar y Extender se llenaban las ~6 conexiones del navegador. Ahora hay un solo reproductor, que cambia de archivo y suelta el anterior (`app.js`). Con la lista vacía salía «nullnull»: arreglado.
- **El número de la cola mentía:** decía «×3», pero Generar encola 1 y el botón no cambiaba al escribir el número. Ahora empieza en 1 y el botón se pone al día al momento (cara A, Retocar y Extender).
- **Preview en vivo (A+C):** el nodo «Model Preview Override» de la plantilla manda el preview solo al proxy, que no lo reenvía. `vista_previa.py`, dentro de ComfyUI, guarda el último y lo da en `GET /max_editor/preview`, y la app lo reenvía. En la fila del avance, «▸ Ver preview» lo despliega, y «^» lo saca a una ventana flotante que se arrastra; la app recuerda si quedó abierto y dónde. **Necesita reiniciar ComfyUI una vez.**
- **Carpetas:** al subir, se elige la carpeta o se crea una nueva (sin acentos y sin «..»; `rutas.subir_refmods`). Los nombres salen bonitos (`ctx.nombreCarpeta`: «Efectos edit › Clips»).
- **Añadir (P2):** tipos (del concept del RefMod) y carpetas a la izquierda, galería y barra fija «N elegidas · Papel · AÑADIR N»; la zona de soltar sale solo al arrastrar.
- **Ficha (P3):** nombre legible y pastilla con la etiqueta; «Quién es · Dónde se usa · Avanzado» con la foto a la izquierda; Avanzado en tarjetas; «Quitar» en rojo, que pregunta antes; «Listo». Ayudas en «ⓘ» (`ctx.info`).
- **Inpainting (P1):** una regla con miniaturas sobre el carril del tramo, donde tocar va a ese momento; una fila de transporte (solo lo elegido, bucle, silencio, ½×, 👁, ⛶); la máscara se esconde al sonar; ayudas en «ⓘ»; el bloque de Retocar fijo abajo.
- **Extender (P1):** el mismo transporte; primero «Cuánto se alarga» (− / + violeta y atajos), luego qué pasa, audio y referencias; «Más opciones» plegado.
- Guía del agente (`1_mapa.md`, `3_organizar.md`) al día. Comprobado en el navegador aparte a 1440 y 2548; `pruebas.py` sale TODO BIEN.

## 8 · Mejorar con NVIDIA RTX: Super Resolution y HDR ✅ (29 oct)

- **Los nodos:** `Nvidia_RTX_Nodes_ComfyUI` actualizado de 0.1.3 a 0.2.1 y `nvidia-vfx` de 0.1 a 0.2 (con permiso de Jonathan). Trae Super Resolution, RTX Video HDR (`RTXTrueHDR`) y Frame Generation.
- **Probados en la 3060** con `chica_pasto_cielo_00008` (124 fotogramas, 1376 × 800): Super Resolution ×2 en 16 s, HDR en 6 s y los dos en 24 s ✅. Frame Generation falla (`NvVFX_Load failed -1999`): solo va en RTX 40 o más nuevas, así que no se ofrece.
- **Decisión de Jonathan:** van en Retocar › Inpainting/detalle, con dos pestañas: «Tapar» (lo de siempre) y «Mejorar».
- **Código:** `app/mejorar.py` (mismo contrato que retocar.py; tipo `mejorar` en la cola, fila `tipo: mejora` en el historial). En `retocar.js`, `R.sub`, `ladoMejorar()` y `mejorar()`. Límites: el lado ≤ 8192 y fotogramas × píxeles de salida ≤ 1,4 G (≈ 17 GB de RAM).
- **Probado de punta a punta** en una app de prueba (:8310, con su propia cola): SR ×2 + HDR desde la interfaz, en 16 s; el resultado sale en 2752 × 1600 HLG de 10 bits y se carga en la línea de tiempo.
- **Pendiente:** herramienta MCP `mejorar_video`, si Jonathan la quiere.

## 9 · Videos más grande y «Retomar prompt» ✅ (29 oct)

- **Pedido de Jonathan:** el botón Videos más visible y más grande, la ventana y su texto más grandes, y poder volver a cargar el prompt de un video ya generado como punto de partida.
- **Color:** verde lima (`--k-ok`, #3FC46E), elegido por Jonathan.
- **Ventana:** hasta 1720 px de ancho y en dos columnas: el video, qué es, y los botones grandes Retomar prompt · Poner en Retocar · Extender; a la derecha, la lista con texto de 17–18 px.
- **Dónde se guarda:** cada Generar hecho guarda sus valores en `app/salidas/valores/<video>.json` (`cola._guardar_valores`). Al arrancar, se rellenan los de los trabajos que siguen en la cola. `GET /app/valores_video` los devuelve, siguiendo «de» desde un retoque, una extensión o una mejora hasta su Generar. `/app/videos` dice `prompt_de` en cada video.
- **Al retomar:** pregunta «En este proyecto» (lo reemplaza) o «En una copia nueva» («<proyecto> retomado»), y pone la semilla de ese video.
- **Probado** en una app de prueba (:8310): el estado del editor retomado es idéntico al de la generación (solo cambia la hora de guardado), con su semilla; también desde una mejora.
- **Límite:** los videos hechos antes del 29 oct que ya no estén en la cola no se pueden retomar (el mp4 guarda el grafo, pero no el estado del editor).

## 10 · Pestañas dentro del cuadro, «Cargar video» grande y preview en el pod ✅ (29 oct)

- Las pestañas «Tapar» y «Mejorar» ya no tienen fila propia: van arriba del cuadro de la derecha, encima de «Qué tapar» o de «Super Resolution», y ocupan su ancho a medias.
- «Cargar video» es grande y verde lima, como «Videos», con su icono de subir.
- **Preview en el pod:** ComfyUI sí guardaba el preview (`/max_editor/preview` daba n = 20). La página lo descartaba: comparaba la hora del preview con «empezado», una hora sin zona que en el pod es UTC; el navegador en México la leía como hora local y el trabajo parecía empezar dentro de 6 h. Ahora `/app/cola` da `hace_s` (segundos que lleva el trabajo, medidos en el servidor) y la página compara `edad_s` del preview con eso: los dos relojes son del servidor.
- Queda: la hora de cada fila de la cola sigue saliendo en la hora del pod (UTC).

## 11 · Preview en cortina (variante P1) ✅ (29 oct)

- Prototipo: `app/web/prototipo_preview.html` (P1 cortina que empuja · P2 cajón lateral · P3 desplegable del botón). Jonathan eligió **P1**.
- El preview ya no es una ventana encima de todo ni flotante: es una cortina debajo de la fila del avance que se abre y se cierra con un botón cian grande (con el preview en chiquito y «2/5»). Como va dentro de la cabecera fija, al abrirse baja el editor (`--max-alto`) en vez de taparlo.
- Al lado del video: «Preview en vivo», una barra por paso, «Paso k de n», s por paso, faltan ≈ s y «Recoger». Con la cortina cerrada, el botón destella cuando llega un paso nuevo.
- Se quitó la ventana flotante (y sus textos `app.preview.flotante/acoplar/cerrar/ver_video`).

## 12 · Lo del agente manda siempre ✅ (29 oct)

- Fuera el aviso «¿Qué versión te quedas?» («Cargar lo del agente» / «Quedarme con lo mío»). Jonathan: «siempre preferiré el del agente… yo di la orden de modificarlo».
- Si el agente cambia el proyecto, la página carga lo suyo aunque haya cambios sin guardar (solo espera si se está escribiendo en un campo) y sale «El agente cambió el proyecto: ya está al día». Un guardado que choca (409) también carga lo del agente.
- El duplicado de la interfaz al fondo: dos recargas a la vez montaban dos editores. Ahora hay una sola recarga a la vez (`A.recargando`), y `editor_core.abrir` quita cualquier `.epl-fondo` justo antes de montar el suyo.

## 13 · Generar verde a la derecha, Videos naranja y Ctrl+Enter ✅ (29 oct)

- Jonathan: los videos resaltaban más que Generar. Ahora Videos va donde estaba Generar, en naranja, y Generar va donde estaba Videos, en verde lima y un poco más grande (`max-generar-cab`). Retocar y Mejorar siguen en naranja.
- Ctrl+Enter (⌘+Enter en Mac), desde cualquier sitio de la página: Generar (un trabajo más en la cola). Sale en el tooltip de Generar.

## 14 · Ventana «Proyectos» y biblioteca global (variante P1) ✅ (29 oct)

- Prototipo: `app/web/prototipo_biblioteca.html` (P1 gestor estilo Resolve · P2 dos mitades · P3 estantería). Jonathan eligió **P1**. Decidido antes: carpetas solo en la vista (los archivos siguen en `app/salidas/`), y cada proyecto con su último video, que se mueve al pasar el ratón.
- `app/web/biblioteca.js`: la ventana sale al arrancar (el último proyecto ya está abierto detrás) y con el botón del proyecto de la cabecera, que sustituye al desplegable y a «Nuevo».
  - «Proyectos»: una tarjeta por proyecto (último video, fecha, cuántos videos); clic elige, doble clic o «Abrir proyecto» abre; «Nuevo proyecto», «Abrir el ejemplo», buscar.
  - «Biblioteca»: todos los videos, una carpeta por proyecto (y «(sin proyecto)»). El video elegido se ve a la derecha y se trae al proyecto abierto sin copiarlo: «Poner en Retocar», «Extender» o «Retomar su prompt» (aquí o en una copia). Mismo camino que «Videos» (`usarVideo` en app.js).
- `GET /app/miniatura?video=`: un JPG del segundo 1 con ffmpeg, guardado una vez en `app/salidas/miniaturas/`; así la ventana no abre decenas de videos a la vez (el límite de ~6 conexiones del navegador).
- (29 oct, Jonathan: «no se ve ninguna miniatura… los proyectos parecen videos») Sin reiniciar el servidor, `/app/miniatura` no existe: la tarjeta usa entonces el primer fotograma del propio video. La tarjeta de un proyecto es ahora una carpeta de trabajo: nombre arriba con su icono y una franja violeta (verde el abierto), la idea, el último video como portada con hojas detrás y el sello «último video», las caritas de sus referencias (`/app/miniatura?refmod=`, 160 px) y fichas «N tomas · N referencias · canción · N videos», «Editado …». `/app/proyectos` trae `resumen` (servidor.resumen_proyecto).

## 15 · Extender: «Audio de entrada» continúa la canción ✅ (29 oct)

- Jonathan: «Audio de entrada» = seguir la canción con la que se generó el video desde el segundo en que acaba; «Audio del modelo» = H3 genera a partir del audio del video.
- Fallaba porque, con «Audio de H3» en Generar, la fila del historial anotaba `audio: None` (generar.cancion_de) y Extender creía que no había canción. Ahora se anota siempre la canción (guió a H3 igual); `sin_cancion: True` solo si de verdad no había. Los videos de antes sin canción anotada usan la del proyecto ahora.
- `extender.unir`: el original suena tal cual y en lo nuevo va la canción desde `inicio_s + total/24` (antes, la canción entera encima, y un original con el audio de H3 perdía su sonido). Las dos partes con el mismo formato (48 kHz estéreo). Comprobado con el video de «chica pasto cielo»: lo nuevo coincide con la canción en el segundo 9,25 (correlación 0,98).
- Una extensión anota la canción aunque se haga con «Audio del modelo», para que otra extensión pueda continuarla.
- (29 oct) Elegir una tarjeta ya no vuelve a pintar la ventana (la lista se quedaba arriba): solo cambia el marco y el pie; si algo repinta, el centro conserva su scroll mientras no cambie la pestaña o la carpeta. Las referencias se nombran como en su ficha («the girl»). Sin `resumen` (servidor sin reiniciar) no se dice «0 tomas».
- Los «mi ejemplo N»: al arrancar sin proyecto recordado se abría el ejemplo, que crea una copia cada vez (cada navegador nuevo, también los de las pruebas). Ahora se abre el más reciente. Jonathan pidió quitarlos: los 26 (`mi ejemplo*`, `my example`) están en `app/proyectos/_borrados/` (se recuperan moviéndolos fuera); sus videos siguen en la biblioteca.
- (29 oct) El preview también con Retocar y Extender (Jonathan): sus workflows ya llevaban el Model Preview Override (nodo 104); solo la página lo limitaba a Generar. `CON_PREVIEW` en app.js: generar, retocar, extender. Mejorar no tiene (los nodos RTX no muestrean con H3).

## 16 · «Versión nueva · Reiniciar» ✅ (29 oct)

- Jonathan: un botón para reiniciar, pero no llamativo («el objetivo no es hacer que reinicien su app muy a menudo»). Elegido: un aviso que solo sale cuando hace falta.
- `servidor.firma_codigo()`: los .py de app/ y del repo, las plantillas y config*.json (tamaño y fecha). `/app/salud` da `arranque` (la firma al arrancar) y `version_nueva`. La web no cuenta: basta con recargar.
- En la cabecera, junto a los puntos de salud, un botón pequeño de borde punteado amarillo «Versión nueva · Reiniciar». `POST /app/reiniciar` lanza `app/arrancar.sh --reiniciar --sin-navegador` en un proceso aparte (log: `app/salidas/reinicio.log`), así reinicia la app y su MCP con el camino de siempre. Con trabajos en la cola responde 409 y el botón sale apagado. La página guarda antes, espera a otra firma en `/app/salud` y se recarga sola.
- Probado en una copia en 8310/8311: aviso tras cambiar un .py, reinicio y recarga en 3 s; los pid de 8300/8301 no se tocaron (parar.sh usa un pid por puerto).

## 17 · Apartado 3 «Edición» (variante P1 «Mesa de montaje») ✅ (29 oct)

- Jonathan: juntar tomas de varios edits sin otro programa, con las herramientas de DaVinci (no su interfaz). Prototipo: `app/web/prototipo_edicion.html` (P1 mesa de montaje · P2 visor al centro · P3 pistas primero); eligió **P1**. Exportar con ffmpeg (decidido).
- `app/web/edicion.js`: la fase «Cara C · 3 · Edición» en la barra. Arriba la biblioteca (todos los videos por proyecto + audios de ComfyUI/input; «Cargar audio» → `input/max_editor/audios`) y el visor (un <video> por pista, la de arriba encima); abajo la línea de tiempo. Herramientas: mover/recortar (A, la orilla vuelve hasta el largo original con el punteado del original), cuchilla (B), Ctrl+B en el cabezal, Supr / Mayús+Supr (cierra el hueco), imán (N), fotograma exacto (24 fps), ← → / Mayús, espacio; soltar encima sobrescribe (como DaVinci); + Video / + Audio, ojo y altavoz por pista. Mientras se arrastra solo se mueve el clip (fluido).
- La línea de tiempo se guarda sola por proyecto en `app/proyectos/ediciones/<proyecto>.json` (`GET/POST /app/edicion/<proyecto>`; subcarpeta: no sale como proyecto).
- `app/edicion.py` + `POST /app/edicion_exportar`: fondo negro del tamaño del primer video, cada clip encima a su tiempo (de la pista de abajo a la de arriba) y todos los audios que se oyen mezclados sin bajar volumen → `montaje_<sello>.mp4` en app/salidas con fila `tipo: montaje` (sale en Videos y en la biblioteca). Con ffmpeg 9, `adelay` + `amix` dejaba el audio en 60 ms: cada sonido va con silencio delante (`anullsrc` + concat) y `apad` hasta el final. Probado: 3 clips + canción en 2,5 s; 19,5 s exportados con audio completo.
- Falta (para después): herramientas en el MCP, transiciones, volumen por clip.

## 18 · La ventana se recargaba sola ✅ (29 oct)

- Jonathan: «la app recarga su ventana cada cierto tiempo sin razón». Tres causas, medidas en una copia con un registro de la red:
  1. La ventana se guarda sola al montarse y escribe la hora en su estado; la app lo contaba como cambio y guardaba. Con dos pestañas del mismo proyecto, cada una recargaba a la otra y la otra volvía a guardar, sin fin («chica pasto cielo» llegó a 529 versiones). Ahora la hora no cuenta (`huella()` en app.js).
  2. El autoguardado aún en camino o dos guardados seguidos hacían creer a `mirarRev` (o al 409) que otro había cambiado el proyecto. Ahora los guardados de una pestaña van en fila (`guardarProyecto` → `guardarAhora`) y llevan su firma (`pestana`, guardada en el proyecto y devuelta por `/app/proyecto_rev`): la propia no recarga.
  3. Otra pestaña de la app (no el agente): la que se está usando (visible y con el foco) no se recarga; si choca al guardar, gana ella. Lo del agente sigue mandando.
- `arrancar.sh --reiniciar` ya no abre otra pestaña si la app estaba corriendo (cada reinicio dejaba una más).
- Comprobado: una pestaña escribiendo 25 s → la misma ventana, sin recargas; dos pestañas quietas 15 s → la versión no se mueve.
- (29 oct) Edición: «Carpeta de audios» (el selector de carpetas del navegador: igual en el PC que en un pod; sube sus audios a `input/max_editor/audios/<carpeta>/` y salen como «Audios · <carpeta>») y «Subir video» (a `input/max_editor/de_fuera/`, grupo «Traídos de fuera» con sello «de fuera»; solo para Edición, no entra en el historial ni en Videos). Un solo `POST /app/edicion_subir` (multipart, escrito por trozos) y `GET /app/edicion_de_fuera`; `/app/miniatura?fuente=` para los de input. Probado con un video y una carpeta con dos mp3 y un .txt (se ignora).
- (29 oct) El visor de Edición se trababa (Jonathan). Medido en una copia, 6 s con un corte: **antes 5,2 fotogramas/s y 25 saltos; ahora 22,5 f/s y 1 salto**. Causas: los videos de H3 traen 2–3 fotogramas clave (cada salto decodificaba hasta 5 s) y el reloj de pantalla corregía el video a saltos en cuanto se retrasaba. Arreglo: `edicion.proxy` + `GET /app/edicion_proxy` (copia de 540 p con un fotograma clave cada 12, en `app/salidas/proxies/`, ~1 s por clip, con caché del navegador; exportar sigue con los originales), el reloj es el propio video de más arriba (si carga, el tiempo espera) y cada pista tiene dos elementos: el siguiente clip se prepara 1,5 s antes del corte.

## 19 · Una extensión que no salía en Videos ✅ (29 oct)

- Jonathan extendió un video y no lo veía en «Videos (0)» ni en la biblioteca. El archivo y su fila sí estaban (y el servidor lo devolvía): su pestaña tenía la lista vieja. El trabajo terminó «recogido de ComfyUI» tras un reinicio, y la página solo pedía la lista cuando veía pasar un trabajo de «corriendo» a «hecho».
- Además la fila estaba dos veces: dos servidores con el mismo `cola.json` (la app y una copia de prueba de otra sesión sin `MAX_EDITOR_COLA`) recogieron el mismo trabajo.
- Arreglo: (1) `mirarCola` vuelve a pedir Videos si la cola tiene un trabajo hecho de este proyecto cuyo video no está en la lista (una vez por video); (2) `/app/videos` no repite un archivo (se queda la última fila); (3) `cola.arrancar` bloquea `cola.json.lock` con flock: solo el primer servidor hace trabajos, una copia con la misma cola solo mira y lo dice en el log.
- (29 oct) Esa extensión salía negra: el mp4 estaba roto (cientos de «Invalid NAL unit size»), porque los dos servidores lo escribieron a la vez. La ventana de H3 estaba sana: se rehízo solo la unión con los datos del trabajo (`extender.plan` + `unir`, 1,8 s, sin GPU; copia del roto en el scratchpad). `extender.unir` ahora escribe a un temporal y lo cambia de golpe.
- (29 oct) Edición: inicio y final de lo que se exporta (I / O en el cabezal, Alt+X o ✕ los quita; botones «Inicio» y «Final»). En la línea de tiempo, el trozo con borde y franja amarilla y lo de fuera apagado; el pie dice «Exportar de … a … (s)» y el botón «Exportar el trozo». Se guarda en `ediciones/<proyecto>.json` (`rango: {desde, hasta}`); `edicion.plan` recorta cada clip a [desde, hasta) y lo corre a 0. Probado: marcas en 2 s y 6 s → montaje de 4,000 s.

## 20 · Ediciones propias ✅ (29 oct)

- Jonathan eligió «ediciones propias»: cada edición del apartado 3 es algo aparte, con nombre, no atada a un proyecto (mezcla videos de todos). Siguen en `app/proyectos/ediciones/<nombre>.json`; las de antes (con el nombre de su proyecto) son ya ediciones con ese nombre.
- `GET /app/ediciones` → `[{nombre, guardado, clips, duracion, portada (su último montaje), primer_video}]`; `POST /app/ediciones/<nombre>/{nueva|duplicar {a}|borrar}` (borrar → `ediciones/_borradas/<nombre>_<sello>.json`, se recupera moviéndola). `/app/edicion/<nombre>` es ahora el nombre de la edición; `/app/edicion_exportar` recibe `nombre` y la fila del montaje lo anota (`edicion`).
- Ventana «Proyectos» › 3.ª pestaña «Ediciones»: tarjetas con franja cian, «Nueva edición», «Abrir edición» (doble clic), «Duplicar», «Borrar» (pregunta con el nombre). En Edición, el nombre de la abierta (botón cian) abre esa pestaña. Se recuerda la última abierta (`max-editor-edicion`); sin ninguna se crea «mi edición».
- Al probar, «Duplicar»/«Borrar» actuaron sobre la edición de Jonathan (la ventana se quedaba con la elegida de la vez anterior); se restauró al instante desde `_borradas` (idéntica) y se arregló: al abrir, la elegida es siempre la abierta.

## 21 · Ventana de exportar ✅ (29 oct)

- Jonathan: «al darle exportar esperaba un menú… como en DaVinci pero con menos opciones… lo que sí veo necesario al 100 es elegir dónde irá a parar el video».
- «Exportar» abre una ventana: **dónde va** («A mi PC (eliges carpeta y nombre)» y/o «Guardar también en la biblioteca»), nombre del archivo, formato (MP4 H.264 · MP4 H.265 · WebM VP9 · MOV ProRes 422), resolución (original · 1080p · 720p, por el lado corto), calidad (alta · media · ligera; no en ProRes) y audio (AAC 192/320, Opus en WebM, PCM en ProRes, sin audio). Resumen con tamaño y duración. Se recuerdan las últimas opciones (`max-editor-exportar`).
- «A mi PC»: `showSaveFilePicker` se pide al hacer clic (luego ya no se puede) y se escribe ahí al terminar; si el navegador no lo tiene (Brave puede tenerlo apagado), descarga normal. Funciona igual desde un pod: el video baja al ordenador.
- Servidor: `edicion.exportar(..., opciones)` + `edicion.FORMATOS`; sin biblioteca va a `app/salidas/exportados/` (sin fila; se borra al día), con biblioteca a `app/salidas` con su fila. `GET /app/edicion_descargar/<archivo>` (attachment). Probados los 4 formatos a 720p, sin audio, «solo PC» (descarga) y «solo biblioteca».
- Al probar: alguien quitó a la vez mis archivos «zz» de prueba y la página de prueba abrió la edición más reciente, «GANCHO» (de Jonathan), y al exportar la volvió a guardar igual (solo subió la rev). Las pruebas bloquean ahora todo guardado que no sea de algo «zz».
- (29 oct) El lienzo («Original» en exportar) lo fijaba el primer clip que se puso y no cambiaba nunca: «chica pasto cielo» se quedó en 960×544 con clips de 1376×800 y 800×480. Ahora es el del video **más grande** que hay en la línea de tiempo, en la página (`lienzoActual()`, mide cada video una vez) y en el servidor (`edicion.plan` sin lienzo pedido). El guardado lleva el lienzo calculado. Nota para el MCP: `_poner_lienzo` aún dice «el primer video»; el lienzo que guarda la página ya es el bueno.

