# Cómo funciona

Lectura: 2 min

**En resumen:** una idea pasa por 4 pasos: reloj, historia, tomas y montaje. Todo lo que se va decidiendo vive en un **plan**. El editor muestra ese plan y deja corregir cualquier parte.

## El recorrido

1. **Reloj** (código). Saca los beats del audio y pone el inicio de cada toma en el beat más cercano a un reparto parejo. Ninguna toma dura menos de 0,4 s.
2. **Historia** (LLM: 1 llamada con razonamiento low). Escribe:
   - el arco;
   - la luz y el ambiente de todo el edit (LOOK);
   - por cada toma: lugar, qué pasa, atuendo o ropa, pose, objeto, lugar que no cambia, fondo y efecto.
3. **Tomas** (LLM: 1 llamada por toma, sin razonamiento). Escribe el encuadre, la luz, el gesto y la cámara de cada toma. Cada toma ve la historia completa, las tomas ya escritas y qué usaron sus vecinas.
4. **Montaje** (código, **solo pega**). Arma las 6 secciones de H3 con tres cosas:
   - el molde: los nombres de las secciones, las etiquetas y los tiempos;
   - lo que escribisteis tú y el LLM, tal cual;
   - las frases de unión de `frases.json`, que ves y cambias en el panel «Frases del código» (plano 4).

   Cada referencia con papel se presenta arriba con su ficha y tiene su renglón de lo que se copia. Si un campo está vacío, no sale nada en su lugar (se avisa). Ver «El código pega», abajo.

**Orden de cada toma en la carta** (frase `toma.linea`, como en el edit de Ren que funcionó): `[Shot n] At t <encuadre>, <efecto>, like the effect in <Picture N>. <lugar>, <luz>: <Subject 1>, <citas>, <gesto>; the camera <cámara>.` y después sus palabras («At 00:02.016 the huge word "RISE" slams over…»). Sin entorno, no hay lugar ni fondo, y la luz solo va si la escribiste. Los campos van tal cual, sin mayúsculas añadidas.

## El código pega

- **`frases.json`** guarda todas las frases que el código pone entre vuestros campos (unas 45). Cada frase es un texto con huecos:
  - `{campo}` se rellena con su dato;
  - `{campo|palabra}` pone «palabra» si el dato está vacío;
  - lo que va entre `[[` y `]]` solo sale si todos sus huecos tienen algo.
- **El usuario las cambia** en el panel «Frases del código». Se guardan en el estado del nodo (`frases`) y valen también para el nodo sin editor.
- **Renglones propios:** «Cómo se presenta» y «Qué se copia» de la ficha sustituyen los renglones de arriba de esa referencia.
- **El montaje devuelve trozos con su origen:** `molde`, `codigo`, `tu` (lo escrito o fijado por el usuario) o `llm`. La ventana pinta cada uno de su color.
- **`pruebas.py`, sección 16, lo comprueba:**
  - con cada frase cambiada por un marcador, fuera de los marcadores, los campos y el molde no queda ni una palabra;
  - con todo vacío, solo queda el molde;
  - cada campo llega entero, con su origen.

Después de cada llamada, el código revisa la respuesta. Si algo falla, se la devuelve al LLM con la causa y le pide que la escriba de nuevo: hasta 3 veces la historia y hasta 4 cada toma. Si aun así no pasa, se detiene con el error en lugar de mandar a H3 un prompt malo.

## El plan

- **General:** `arco`, `look` (luz y ambiente) y `fondo`. El **estilo** y el **sonido** no son del plan: los escribe el usuario y van en las entradas (plano 3).
- **`textos`:** las palabras en pantalla de la fila de texto: `{id, texto, t, fin, sitio, letra, frase}`. `t` en segundos; `fin` vacío = hasta el fin de su toma; `sitio` es `encima` o `al_lado` de la cara; `letra`, la etiqueta de su referencia de tipografía (papel «letra»); `frase`, cómo se ve, en inglés. Sustituye a «Palabras» (`TO YOU @1`), que se convierte la primera vez.
- **Por toma:**
  - lo que decide la historia: `lugar`, `momento`, `personaje` (atuendo), `ropa`, `pose`, `objeto`, `lugar_ref`, `fondo_ref` y `efecto`;
  - `entorno`: `auto` (el LLM escribe el lugar), `manual` (lo escribiste tú: va con el candado del lugar) o `ninguno` (sin lugar ni fondo; la luz no es obligatoria). Un estado viejo pasa a `manual` si tenía el lugar fijado y a `auto` si no;
  - `efecto`: una referencia de papel efecto (`<Picture N>`) o un efecto de texto (`E1`, `E2`…);
  - `efecto_frase`: la frase del efecto si la escribiste tú (si está vacía, va la ficha del efecto);
  - lo que decide la dirección: `encuadre`, `luz`, `gesto` y `camara`.
- **`fijos`:** los campos con candado, tanto los generales como los de cada toma. El LLM los recibe como ya decididos, y el código los vuelve a poner encima de lo que responda.

## Las referencias

Cada referencia del workflow (`<Picture N>` o `<Video N>`) tiene un **papel**. Los papeles van en dos lados, como en el editor:

**Lo que no cambia** (sale siempre igual):

| Papel | Qué hace | Cómo se cita en el prompt final |
|---|---|---|
| personaje | quién sale: nombre, pronombre y ficha; vale para todas las tomas. Suele ser una **cajita** (`<Video N>`) con varias fotos ✅. Un sujeto por nombre | en la definición de `<Subject 1>` y en su retención (frases `def.personaje`, `ret.personaje`) |
| personaje con atuendo | además, un atuendo: cada toma elige uno | «wearing her school uniform from `<Picture 1>`» ✅ |
| objeto | un producto u objeto que no cambia; es `<Subject 2>`, `<Subject 3>`… Sale en las tomas donde encaja (al menos una) | se define como sujeto y el gesto lo nombra: «raises `<Subject 2>`…» 💡 |
| lugar | un sitio que no cambia; fija el lugar de las tomas que lo usan | «…, in the cargo plane cabin shown in `<Picture 5>`» y retención `fully_preserved` 💡 |

**Lo que se presta** (solo en algunas tomas):

| Papel | Qué hace | Cómo se cita |
|---|---|---|
| ropa | solo la ropa de otra persona | «wearing the red racing jacket from `<Picture 1>`» y «only the clothes are transferred (…); that person's face, hair and body are not transferred» ✅ |
| pose | solo la postura | «in the pose of `<Picture 5>`» ✅ |
| fondo | solo el fondo de una toma | presentado arriba con su ficha («`<Picture 10>` is the manga rooftop background reference: …»), «like the place in `<Picture 10>`» en su toma y «only the place and its background are transferred» 💡 |
| estilo | solo el estilo visual | en la línea de estilo 💡 |
| efecto | un efecto de ejemplo; su ficha es la frase | definido arriba («`<Picture 1>` is the gradient silhouette effect reference: …»), retenido aparte («only its look is transferred») y en la toma justo tras el encuadre: «Close-up, …, like the effect in `<Picture 1>`.» (render de Ren, plano 7) |
| letra | la tipografía de una palabra de la fila de texto (fuerza 0,5) | «`<Picture 5>` is the typography reference for the word "RISE"», «only its lettering style is transferred; the words written in it are not reproduced» y «in the lettering style of `<Picture 5>`» |

Además hay **efectos de texto** (`E1`, `E2`…), sin imagen: solo su frase (plano 3).

También tiene un **nombre** corto, que es el que va al prompt (por ejemplo, «Teto», «red racing jacket» o «cargo plane cabin»), y una **ficha**: una frase para que el LLM sepa qué hay en la imagen, porque no la ve. La numeración es la misma que usa el Text Encode: primero los medios del Media Loader y después las tarjetas activas del RefMod Stack, por orden, con un contador para fotos y otro para videos.

- ✅ La identidad en `<Video 1>` (cajita de Teto) con la ropa de Vera prestada salió bien en dos renders (la prueba a mano del 24 oct y la prueba de la interfaz nueva, plano 7).
- 💡 Las frases de **objeto** todavía no se han probado en un render. Las de **lugar** tienen un solo render (plano 7).
- Una toma lleva atuendo o ropa, nunca las dos cosas. Una toma en un lugar que no cambia no lleva fondo.

## Quién decide qué

- **El usuario:** la idea, el estilo, las palabras en pantalla, los personajes (nombre, pronombre y ficha), los efectos, los papeles de las referencias y cualquier campo que fije.
- **El LLM:** lo que no está fijado (lugares, momentos, qué referencia va en cada toma, luz, gesto y cámara).
- **El código:** los tiempos y pegar. Une todo con las frases de `frases.json`, que se ven y se cambian, y revisa lo que escribe el LLM (plano 5). Lo que añade el código sale en naranja en el prompt final.
