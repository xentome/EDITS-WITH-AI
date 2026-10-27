# Fase 9 · Tema «trama» (mundo «Trama con raíl de estudio»)

Lectura: 2 min · 27 oct 2026 · Para los ayudantes y para retomar si se corta.

**En resumen**
- El usuario eligió el mundo visual «Trama con raíl de estudio» (`.impeccable/mocks/decision/r2/rail.html`, `trama.html` y `referencia_usuario.webp`). Contrato: `.impeccable/surfaces/app-web-index-html.md`.
- **Solo el estilo:** la disposición y las funciones son las de P10 (fase 8). No hay raíl lateral ni visor grande.
- **Color:** negro, gris y blanco. El color es solo dato: los 8 colores de las referencias (marcos, sellos Im/V, puntos de las tomas) y los avisos y errores. Generar es un rectángulo blanco con letra negra. Sin degradados, brillos ni sombras de color.
- **Trama de puntos:** solo en el suelo y en los huecos (fondo sin elegir, estante vacío, video de Retocar sin cargar). Las fotos, a todo color.
- **Tema azul:** sigue en `app/web/temas/azul.css`. El de siempre es `temas/trama.css` (`<body class="tema-trama">`). Para volver al azul: abrir la app con `?tema=azul` (se recuerda en el navegador; `?tema=trama` vuelve).

## Fases (✅ al terminar, con commit)

1. ✅ **El tema** (`app/web/temas/trama.css`, `index.html`, `audio.js`, `util.js`): paleta, letras (Schibsted Grotesk y Spline Sans Mono, de Google Fonts, con respaldo), etiquetas en caja con ●, cruces de registro, la onda en gris, el cambio de tema por parámetro y la colocación de P10 sacada de `azul.css` a `index.html`.
2. ✅ **Los iconos** (`util.icono`, `plan.js`, `referencias.js`, `linea.js`, `audio.js`, `app.js`, `retocar.js`, i18n): iconos de trazo en SVG en lugar de emojis.
3. **La comprobación:** Tomas, Retocar, la ficha, el arrastre, los avisos; sin scroll en 2548×1284; `impeccable detect`.
