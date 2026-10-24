# Cómo funciona

Lectura: 2 min

**En resumen:** una idea pasa por 4 pasos: reloj, historia, tomas y montaje. Todo lo que se va decidiendo vive en un **plan**. El editor muestra ese plan y deja corregir cualquier parte.

## El recorrido

1. **Reloj** (código). Saca los beats del audio y pone el inicio de cada toma en el beat más cercano a un reparto parejo. Ninguna toma dura menos de 0,4 s.
2. **Historia** (LLM: 1 llamada con razonamiento low). Escribe:
   - el arco;
   - la luz y el ambiente de todo el edit (LOOK);
   - por cada toma: lugar, qué pasa, personaje o atuendo, pose, fondo y efecto.
3. **Tomas** (LLM: 1 llamada por toma, sin razonamiento). Escribe el encuadre, la luz, el gesto y la cámara de cada toma. Cada toma ve la historia completa, las tomas ya escritas y qué usaron sus vecinas.
4. **Montaje** (código). Arma las 6 secciones de H3 con los tiempos, las frases de efecto probadas y las partes fijas de la receta.

Después de cada llamada, el código revisa la respuesta. Si algo falla, se la devuelve al LLM con la causa y le pide que la escriba de nuevo: hasta 3 veces la historia y hasta 4 cada toma. Si aun así no pasa, se detiene con el error en lugar de mandar a H3 un prompt malo.

## El plan

- **General:** `arco`, `look` (luz y ambiente) y `fondo`.
- **Por toma:**
  - lo que decide la historia: `lugar`, `momento`, `personaje`, `pose`, `fondo_ref` y `efecto`;
  - `efecto_frase`: la frase del efecto si la escribiste tú (si está vacía, va la de la receta);
  - lo que decide la dirección: `encuadre`, `luz`, `gesto` y `camara`.
- **`fijos`:** los campos con candado, tanto los generales como los de cada toma. El LLM los recibe como ya decididos, y el código los vuelve a poner encima de lo que responda.

## Las referencias

Cada `<Picture N>` del workflow tiene un **papel**:

| Papel | Qué hace | Cómo se cita en el prompt final |
|---|---|---|
| personaje | identidad y atuendo | «wearing her uniform from `<Picture 1>`» y en la definición del personaje |
| pose | solo la postura | «in the pose of `<Picture 5>`» |
| fondo | solo el lugar | «like the place in `<Picture 10>`» 💡 |
| estilo | solo el estilo visual | en la línea de estilo 💡 |

También tiene un **nombre** corto, que es el que va al prompt (por ejemplo, «school uniform»), y una **ficha**: una frase para que el LLM sepa qué hay en la imagen, porque no la ve. La numeración es la misma que usa el Text Encode: primero los medios del Media Loader y después las tarjetas activas del RefMod Stack, por orden.

💡 Las citas de fondo y estilo están escritas, pero ningún render las ha probado todavía.

## Quién decide qué

- **El usuario:** la idea, las palabras en pantalla, los papeles de las referencias y cualquier campo que fije.
- **El LLM:** lo que no está fijado (lugares, momentos, qué referencia va en cada toma, luz, gesto y cámara).
- **El código:** los tiempos, las frases de efecto, la definición del personaje, la retención, el estilo base y la revisión.
