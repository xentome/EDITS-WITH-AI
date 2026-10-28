# Fase 9 · Tema «casete» (mundo «Mixtape de casete»)

Lectura: 2 min · 27 oct 2026 · Para los ayudantes y para retomar si se corta.

**En resumen**
- El usuario rechazó «Trama» («solo blanco y negro… no resaltaba lo importante, todo era igual de monótono») y eligió en la ronda r3 «Mixtape de casete» (`.impeccable/mocks/decision/r3/r3-casete.html`). Contrato: `.impeccable/surfaces/app-web-index-html.md`.
- **Solo el estilo:** la disposición y las funciones son las de P10 (fase 8). Se suman tres detalles del mundo: las pistas «A1, A2…» con segundos y fotogramas, las caras «Cara A · 1 · Tomas y referencias» y «Cara B · 2 · Retocar», y la pegatina «recién pegada» (la referencia que se acaba de conectar lleva un anillo hasta que se toca esa toma o esa referencia).
- **Jerarquía por peso de color:** Generar (naranja con sombra rosa) > la fase activa (banda naranja con rayas rosa y cobalto) > la toma elegida y su ACCIÓN (borde naranja) > las referencias (estante cobalto, rótulos crema, pegatinas redondas) > lo demás, sobre tinta #17121C. El naranja es el único color de acción.
- **Temas:** `temas/casete.css` es el único desde el 28 oct (Jonathan pidió quitar trama, azul, coral y amarillo; siguen en el historial de git). `index.html` carga sus letras de Google Fonts.

## Fases (✅ al terminar, con commit)

1. ✅ **El tema y sus detalles** (`temas/casete.css`, `index.html`, `linea.js`, `plan.js`, `referencias.js`, `app.js`, i18n): paleta, letras (Big Shoulders Display, Barlow Condensed, Barlow, JetBrains Mono), pistas, caras, «recién pegada», la onda como cinta marrón.
2. ✅ **La comprobación:** Tomas, la toma elegida, el arrastre y «recién pegada», la ficha, Retocar, el LLM caído, 1440 de ancho; `impeccable detect`.

## Comprobado (27 oct) ✅

- En 2548×1284 CSS la pestaña «Tomas y referencias» cabe sin bajar (sobran unos 39 px; con una referencia conectada en la toma, unos 25).
- «Conectar a…» a la toma 2 deja la pegatina con anillo y «recién pegada»; el LLM caído sale en rojo en la cabecera.
- La ficha (modal centrado), Retocar (cara B) y 1440×900 (ahí la página baja: no se pidió que quepa).
- `impeccable detect`: arreglado el «side-tab» de las rayas de la J-card (ahora son dos bloques, no bordes). Queda un aviso suave en `index.html`: las marcas repetidas de la línea de Retocar (de antes; el tema casete las tapa con su color liso).

## Revisión final y orden nuevo (27 oct) ✅

- **El naranja**, solo en: Generar (y Retocar en la cara B), la banda de la cara activa, la pista elegida con su chip A1, el campo ACCIÓN y, en contorno, las opciones segmentadas (`.epl-seg`: entorno, qué tapar, pestañas de la ficha). Lo demás activo (candados, ES/EN, el póster que usa la toma, la duración, el arrastre, la selección), en crema.
- **El título de la toma:** «Toma 1» rotulado a mano en Gochi Hand (también en las pistas) y sus cifras en JetBrains Mono tabular.
- **Iconos:** girar, menú y los «+» de añadir, con iconos de trazo.
- **Retocar sin video:** el estado vacío va dentro del lienzo, con un rótulo crema y «Cargar video».
- **Cabecera a 1440:** se pliegan el aviso y los estados antes que los botones.
- **Orden nuevo** (lo pidió el usuario): arriba el estante de referencias; después la línea de tiempo entera (texto, duración, tomas, onda, «Cambiar canción» y Sonido); abajo del todo el prompt de la toma y el prompt final. Los pósters enseñan la imagen entera (`object-fit: contain`) con el rótulo debajo; el ancho sigue la proporción de la foto, con alto fijo de 170 px, entre 150 y 320 px.
- `impeccable detect`: sin hallazgos.
