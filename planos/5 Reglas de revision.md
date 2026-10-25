# Reglas de revisión

Lectura: 3 min

**En resumen:** cada fila es un fallo que ya vimos en alguna prueba y lo que lo impide ahora. Tipos de protección:
- **CÓDIGO:** el LLM no lo toca.
- **MENÚ:** el LLM elige de una lista cerrada.
- **REVISIÓN:** el código revisa y, si falla, se lo devuelve al LLM.
- **INSTRUCCIÓN:** solo se le pide y no se comprueba; es el punto débil.

| # | Fallo | Dónde lo vimos | Protección |
|---|---|---|---|
| 1 | Tiempos mal escritos o tomas mal numeradas | «00:00.1045», tomas 6–10 | los tiempos los pone el código · CÓDIGO |
| 2 | Frase de efecto ambigua → artefacto | «wet red strands» → líquido rojo | el LLM elige el código del efecto; la frase probada la pega el código. Tú puedes escribir otra en el editor, bajo tu responsabilidad · MENÚ |
| 3 | Partes fijas reescritas | definiciones cambiadas | salen de la receta · CÓDIGO |
| 4 | Mismo lugar o atuendo en todas las tomas | Teto mínimo, monótono | lugares distintos (repetidos y parecidos); atuendo distinto en tomas seguidas · REVISIÓN |
| 5 | Pose o efecto repetido | — | se revisan repetidos, también contra lo fijado en otras tomas · REVISIÓN |
| 6 | Gesto calcado de otra toma | la narrativa copiaba | parecido > 0,6 → repetir · REVISIÓN |
| 7 | Planos lejanos | «medium shot» | solo 3 encuadres cercanos · MENÚ |
| 8 | Copiar el menú entero en vez de elegir | sin razonamiento escribió las 3 opciones | tiene que ser exactamente una · REVISIÓN |
| 9 | Personaje tumbado o suelo de fondo | «rain-slicked asphalt» | prohibidas: lying, ground, floor, asphalt · REVISIÓN |
| 10 | Líquidos en la cara | líquido rojo | prohibidas: wet, liquid, blood, drip, tears · REVISIÓN |
| 11 | Números en el texto | varias | sin dígitos, salvo en `<Picture N>` · REVISIÓN |
| 12 | Negaciones y metáforas | «a stillness that is not indifference» | negaciones prohibidas; las metáforas solo por instrucción · REVISIÓN + INSTRUCCIÓN |
| 13 | Texto en pantalla no pedido | referencias con texto | sin comillas ni «text/words/letters» · REVISIÓN |
| 14 | Describir al personaje | regla del método mínimo | «no describas su cara, su pelo ni su ropa» · INSTRUCCIÓN |
| 15 | Pronombre equivocado | Teto | se rechaza el pronombre contrario · REVISIÓN |
| 16 | Efecto que no encaja con la escena | luz de móvil sin móvil | los efectos que piden un objeto lo declaran en la receta (U3 phone, U5 rain) · REVISIÓN |
| 17 | Gesto demasiado largo | acciones que no terminan | duración en palabras; 25 palabras como máximo · REVISIÓN |
| 18 | Otro formato de respuesta | «**[HISTORIA]**» | lectura tolerante; si falta un campo, repetir · REVISIÓN |
| 19 | Respuesta cortada | la historia llegó a 4096 tokens | tope de 6144; si se corta, repetir · CÓDIGO + REVISIÓN |
| 20 | Qwen y H3 no caben en la GPU | OOM al despertar llama | soltar modelos antes; esperar a que llama se duerma después · CÓDIGO |
| 21 | Mismo encuadre o cámara en tomas seguidas | 3 close-up con la misma cámara | cada toma sabe qué usaron sus vecinas y se rechaza si repite · REVISIÓN |
| 22 | La hora o la luz cambian sin motivo | «soft daylight» en una idea de noche | una sola línea LOOK para todo el edit · CÓDIGO + INSTRUCCIÓN |
| 23 | La luz contradice el efecto | luz cálida con «cold blue glow» | la toma recibe la frase exacta del efecto · INSTRUCCIÓN |
| 24 | Look fotográfico en Teto | la v3 quitó «bokeh» y «cinematic» | prohibidas de la receta · REVISIÓN |
| 25 | Atuendo y ropa prestada en la misma toma | — (regla de diseño) | una toma lleva OUTFIT o CLOTHES, no los dos · REVISIÓN |
| 26 | Lugar que no cambia con un fondo encima | — (regla de diseño) | LOCATION sin BACKGROUND · REVISIÓN |
| 27 | Objeto que no se ve en la toma | — (regla de diseño) | si la toma lleva OBJECT, MOMENT y ACTION lo nombran con su `<Subject N>` · REVISIÓN |
| 28 | Objeto o lugar que no sale nunca | — (regla de diseño) | cada uno sale al menos en una toma (si el LLM podía ponerlo) · REVISIÓN |
| 29 | Frase fija de un efecto que choca con el lugar | U3 dice «the night city» en una bodega de avión al atardecer (prueba de la interfaz) | todavía ninguna: lo cambió el usuario tocando otro efecto · ❓ |

**Traspaso de identidad.** La retención ya dice que de una ropa o una pose no se pasan «face, hair and body», pero eso es texto: si la foto enseña la cara, H3 puede copiarla igual. La protección de verdad es **tapar** la cara y el pelo de la foto (ficha de la referencia, «tapar con SAM 3.1», plano 4). Recomendado en toda ropa, pose o fondo con una persona real distinta del personaje; probado con la ropa de Vera en Teto (plano 7).

## Fallos vistos en un render y todavía sin regla

- **Con la pose `<Picture 5>` (saludo), Teto sale de cuerpo entero, con el pelo largo y a veces con uniforme de marinero.** Ha pasado en 3 de 3 renders: la recortada, el nodo y el editor. Las otras 4 poses salen bien. Parece que esa referencia arrastra su propia composición. Hay tres opciones, ninguna probada: nombrar el pelo dentro de la toma, como hacía la v3; rehacer ese RefMod; o no usar esa pose.
- En el efecto G2 la cara no queda en color (2 de 2).
- Vistos una sola vez: «TO YOU» tapando la cara, la lluvia de U5 que no se ve, y un garabato como de firma con la pose `<Picture 6>`. En el render del editor no se repitieron.

## Añadir una regla

1. Escríbela en `nucleo.py`: una palabra en `GENERALES` (o en las `prohibidas` de la receta), o una condición en `revisar_historia` o `revisar_toma`.
2. El mensaje tiene que nombrar la causa exacta: campo y valor. Si no, el LLM corrige otra cosa; pasó con «cambia el gesto» cuando lo repetido era la cámara.
3. La regla solo culpa al LLM de lo que eligió él, no de lo que fijó el usuario.
4. Añade su fila aquí y, si puedes, una comprobación en `pruebas.py`.
