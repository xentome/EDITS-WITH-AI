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
