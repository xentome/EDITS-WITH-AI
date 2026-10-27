# Fase 8 · Interfaz P10 (pestaña «Tomas y referencias» de una sola pantalla)

Lectura: 3 min · Empezada el 27 oct 2026 · Para los ayudantes y para retomar si se corta.

**En resumen**
- El usuario eligió la variante **P10** del prototipo (`app/ui-prototipo/`, `?variant=P10`; la referencia visual y de comportamiento está en `src/ronda3.jsx`, `src/ronda2.jsx` y `src/estilos.css`). Se pasa a la app real **sin React**: en `web/editor/*.js`, `web/editor_core.js`, `app/web/*` y `nucleo.py`.
- Respaldo: el tag git `respaldo-antes-interfaz-p10` (3cc74c3) y la copia de `app/proyectos` en `~/comfy/max_editor_app/respaldos/antes-interfaz-p10/`.
- Tras cada fase: `pruebas.py` en TODO BIEN, la app arranca (`app/arrancar.sh --reiniciar --sin-navegador`) y un commit. Sin push.

## Lo que decidió el usuario (27 oct)

- **Se quita la Historia.** Fuera de la interfaz: idea, arco, luz y ambiente (look), fondo general, el número de tomas, la semilla del LLM y «Escribir historia». `nucleo.py` funciona sin ellos: sin huecos de arco ni de look, y «Escribir tomas» escribe con lo que haya.
- **Sonido:** un campo al final de la pestaña, debajo de la onda. Va tal cual a `overall_soundscape`; vacío = la frase `sonido`.
- **Estilo por toma:** un campo «Estilo» en el panel de la toma (`toma.estilo`, frase `toma.estilo`). Vacío = el estilo de las referencias de papel estilo. Un proyecto viejo con estilo general lo copia a cada toma al abrirse.
- **Duración en la línea de tiempo:** segundos y fotogramas arrastrables (↔) o escribibles; solo valores de H3 (17·k + 5). Por defecto 5 s (124 f).
- **Tomas:** se añaden y se quitan en la línea de tiempo (+ y ✕).
- **Semilla del video:** junto a «Generar», con «otra semilla».
- **Principal / Secundarias:** cualquier referencia puede ir en Principal y entonces vale en todas las tomas (marca `en_todas` en su ficha; `nucleo.py` la cita en cada toma). El personaje empieza en Principal.
- **Fondo:** arrastrar o conectar una referencia de papel fondo a una toma rellena su «Fondo ref.», y al revés.

## Fases (marcar ✅ al terminar, con commit)

1. ✅ **El núcleo** (`nucleo.py`, `frases.json`, `pruebas.py`): estilo por toma, `en_todas`, sin huecos de arco ni look, «Escribir tomas» sin historia.
2. ✅ **El panel y la línea** (`plan.js`, `linea.js`, `editor_core.js`, `estilos.js`, i18n): sin Historia, panel compacto con «Estilo», sonido abajo, duración arrastrable, migración de proyectos viejos.
3. ✅ **El estante y la ficha** (`referencias.js`, `linea.js`, `estilos.js`, i18n): Principal | Secundarias con pósters de 160×170, color fijo y sello Im/V, arrastre y «Conectar a…», puntos en las tomas y la ficha en un modal centrado con pestañas.
4. **La barra de fases y la comprobación** (`app/web/app.js`, `index.html`, `temas/azul.css`): «1 Tomas y referencias | 2 Retocar» a todo el ancho, con mini estado; todo cabe sin scroll en 2548×1284; prueba en el navegador y del prompt que recibe H3.
