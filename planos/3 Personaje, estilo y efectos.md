# Personaje, estilo y efectos

Lectura: 2 min

**En resumen:** ya no hay recetas. Lo que daban (quién es el personaje, cómo se dibuja todo y qué efectos hay) está **a la vista** en el editor: el personaje sale de su referencia, el estilo es un campo de la historia general y cada efecto es una referencia o un efecto de texto. Lo que no depende del personaje es de la casa y vive en `nucleo.py`.

## Quién es el personaje: su referencia

En la mitad roja, una foto o una cajita con papel **personaje** tiene:

| Campo | Para qué | Ejemplo |
|---|---|---|
| Nombre del personaje | las fotos con el **mismo nombre** son el mismo personaje (un sujeto) | `Teto` |
| Pronombre | `they` (por defecto), `she` o `he`: «her uniform», «they wear»… y la revisión del pronombre | `she` |
| Ficha | cómo es, en inglés: va a su definición | `anime girl, bright red hair in two big drill-shaped twin tails` |
| Atuendo (opcional) | si la foto es además un atuendo: cada toma elige uno (OUTFIT) y su ficha describe esa ropa | `school uniform` |

Con eso el código arma (`nucleo.personajes` y `nucleo.definiciones`):
- **un sujeto por personaje**: el primero es `<Subject 1>`, el protagonista; los demás, `<Subject 2>`…; los objetos van detrás;
- su definición: `<Subject 1> is the character in <Video 1>: anime girl, bright red hair…. Her name is Teto.` (sin ficha o sin nombre, esa parte no sale);
- su retención: `<Subject 1>: fully_preserved - Teto's face, hair and features from <Video 1> stay the same in every shot.`;
- sin ningún personaje: `<Subject 1> is the main character.` (pasa en el nodo sin editor).

El pronombre solo se revisa si hay un único personaje con `she` o `he`. 💡 Varios personajes a la vez no tienen render todavía.

## Cómo se dibuja todo: el campo «Estilo»

- En la historia general, debajo de la idea. **En inglés**: va tal cual al LLM, al resumen (`A music edit of <Subject 1> (flat 2D anime…)`) y a la primera línea de `detailed_description`.
- **Vacío:** el LLM no recibe ningún estilo y la línea de estilo es solo la luz (LOOK). No se inventa nada.
- **Sonido** (debajo de «Estilo», opcional, en inglés): va tal cual a `overall_soundscape` («whooshes and impact hits accent each cut and word»). Vacío: `nucleo.SONIDO`, solo la música y sin efectos de sonido.
- **Las palabras en pantalla** ya no son un campo: están en la fila de texto de la línea de tiempo (plano 4), cada una con su momento, encima o al lado de la cara, su referencia de letra y su frase. Sin frase ni letra, al lado: `in bold clean white letters`.

## Efectos

Ya no hay lista fija (G1–G4, U3–U5). Un efecto es:
1. **una referencia con papel «efecto»** en la mitad azul (imagen o clip de ejemplo), con nombre (en inglés: va al prompt) y ficha. Se define arriba (`<Picture 7> is the <nombre> effect reference: <ficha>.`), se retiene aparte (`only its look is transferred`) y en su toma va justo después del encuadre: `Close-up, <ficha>, like the effect in <Picture 7>.` (render de Ren del 25 oct, plano 7);
2. **un efecto de texto** (`E1`, `E2`…), sin imagen: «+ Efecto» en la mitad azul, o «＋ guardar como efecto» desde la frase del efecto de una toma. Va al prompt justo después del encuadre: `Close-up, <frase>. A neon-lit crosswalk, …` (render de Teto del 25 oct, plano 7).

El LLM elige los efectos como elige las poses (`EFFECT: E1`, `<Picture 7>` o `none`); el código pega la ficha tal cual. Reglas: no el mismo en dos tomas seguidas y, si hay tomas para todos, cada efecto sale al menos una vez. La **frase del efecto** de una toma, si la escribes, manda sobre la ficha.

## Lo que es de la casa (`nucleo.py`, arriba)

`DEFINICION_EDIT` (qué es un edit, sin género), `AUDIO` y `RETENCION_AUDIO`, `TEXTO_ESTILO`, `SONIDO`, las palabras prohibidas `GENERALES`, el montaje y los tiempos. Se cambian ahí, para todos los edits.

## Workflows de antes

- El nodo ya no tiene el campo «receta». Sus valores guardados empiezan por la receta: `web/editor.js` quita ese primer valor al abrir el workflow, así los demás quedan en su sitio.
- Al abrir el editor (estado `v` < 4), avisa en la mitad roja de que la receta ya no existe, **vacía los efectos G/U** de las tomas (con un aviso que dice en cuáles) y pasa el nombre viejo de un personaje («school uniform») a su atuendo.
- El nodo sin editor (`planear`) usa las referencias, los efectos y el estilo que el editor dejara en el estado (`nucleo.entradas_de_estado`); sin estado, ninguno.
