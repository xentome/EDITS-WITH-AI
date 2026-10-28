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
