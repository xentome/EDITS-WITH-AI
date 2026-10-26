# Lo que funciona (guía de uso, en construcción)

Lectura: 4 min · Empezada el 26 oct 2026 con las pruebas del usuario y las de los días 25 y 26.

**En resumen**
- Es la base de una futura guía: qué escribir en cada campo para que H3 haga lo que quieres.
- Sirve también para mejorar la interfaz: cada lección lleva al lado qué podría hacer la ventana para ayudar (💡).
- Símbolos: ✅ confirmado con una prueba controlada · 🟢 visto varias veces · 💡 idea para la interfaz, sin hacer.

## Método: copiar el estilo de un edit ajeno («método del reel») ✅

Sirve para que H3 haga un edit con el estilo, el ritmo y la música de otro edit, pero con tu personaje. Se probó con dos reels de anime muy distintos, y los dos salieron bien:

| Edit | Reel de referencia | Resultado |
|---|---|---|
| Ren en el reel de la pareja | `ig_reel_DbOwMf5BMR_` (26,7 s, mixed media pastel y neón) | ✅ aprobado por el usuario («muy muy bien»). 10 s a 1 MP, las 10 tomas en su orden y en sus cortes. `~/Escritorio/experimentos_edit/edit_prompt_llm/prueba_reel/reel_pareja_10s_pod_1mp.mp4`. Receta completa en `~/Escritorio/experimentos_edit/receta_reel_pareja_ren/` |
| Ren en el reel sucio | `ig_reel_DOF8ai_jlWi` (10,5 s, anime sucio de tinta y sepia) | ✅ «salió algo interesante». 9,4 s a 480p, unos 10 planos con todo el estilo del reel. `~/Escritorio/experimentos_edit/edit_prompt_llm/prueba_reel2/reel_sucio_largo_pod_480p.mp4` |

**Los pasos, todos en la ventana salvo el 1:**
1. **El reel entero como una sola referencia**, en un RefMod de tipo clip en modo **Compressed**, con unos 6.000 tokens: 384 px, rejilla 16–24 y todos sus fotogramas. Comprimido copia el estilo; sin comprimir, H3 copia trozos tal cual. Hoy se crea fuera de la ventana, con el nodo de Fantastic (💡 hacerlo desde la ventana).
2. **Papel «efecto»** en la mitad azul, con una ficha que describa el estilo y sus mundos en orden, por ejemplo: «a dreamy mixed-media anime music-video edit that jumps between very different worlds: soft pastel gradients…».
3. **El mismo estilo escrito en la historia general:** estilo, arco y luz. La imagen y el texto piden lo mismo.
4. **La canción del propio reel** («♫ Cambiar canción»), desde 0:00.
5. **Los cortes del reel:** detectarlos (cambios de escena) y arrastrar los bordes de las tomas a esos segundos, con «pegar a los beats» apagado.
6. **Una frase por toma** con la escena del reel de ese momento y tu personaje dentro, citando el reel como efecto y con «Sin entorno». Por ejemplo: «<Subject 1>'s legs and sneakers walking over swirling psychedelic liquid neon…».
7. **Personaje en la mitad roja** con su ficha.
8. **Duración y resolución:** unos 10 s y unas 10 tomas (de 0,4–2 s); a 1 MP en el pod, que mantiene mejor la identidad.

**Lo que se aprendió:**
- Un reel corto de pocos mundos (el edit de Ren, de 5 s) hace que H3 lo repita entero y en su orden, en vez de seguir tus tomas.
- Las tomas muy cortas (20 en 9 s) se pierden: H3 hace unas 10.
- Si una toma se parece mucho a una escena del reel, puede colarse la cara del personaje del reel (más a 480p que a 1 MP).

## Encuadre y movimiento de cámara

- ✅ **El encuadre pesa más que la cámara.** Si el encuadre dice «extreme close-up» y la cámara «full portrait», gana el encuadre. Encuadre y cámara deben pedir lo mismo.
- ✅ **Una cámara escueta deja que H3 arrastre el movimiento de la toma anterior.** Pasó así (26 oct, prueba del usuario en el pod):
  - la toma 1 tenía una cámara larga que acababa en «accelerates into an extreme close-up of her eyes»;
  - la toma 2 decía solo «holds still», y H3 terminó en la toma 2 el acercamiento de la toma 1;
  - con «stays locked off on a tripod at the same distance for the whole shot, keeping her entire body framed from head to sandals until the last frame», la toma 2 se quedó quieta y entera.
  - **Regla:** cuando una toma debe quedarse quieta, descríbelo con detalle y sin negaciones (trípode, misma distancia, qué se ve hasta el final). Y si la cámara de una toma describe un movimiento con final, ese final puede pasar a la toma siguiente.
  - 💡 La opción «quieta» del menú de cámara podría escribir esa frase larga, y no solo «holds still».
- 🟢 **Sin negaciones:** «no zoom» o «never covering» pueden provocar justo eso. Mejor describir lo que sí pasa.
- 🟢 **Un movimiento con espera y acercamiento** (la mano que se aparta, unos segundos quieta y luego un acercamiento que acelera) necesita una toma larga, de 4–5 s, para notarse.
- 🟢 **Si dos tomas seguidas piden lo mismo** (mismo encuadre, misma cámara, ningún gesto nuevo), H3 no corta: lo hace una sola toma.
  - 💡 Avisar cuando dos tomas seguidas son iguales, o cuando una toma no tiene gesto.

## Lugar y fondo

- ✅ **El lugar escrito en la toma pesa más que la ficha de la referencia de fondo.** Se vio así (26 oct): el fondo cambió en cuanto el lugar de la toma 2 describió el sitio concreto («in front of a dim, near-black scene filled with gray rectangular panels linked by thin red, blue, purple and orange lines…»). Ni el nombre del personaje ni la ficha del fondo influyeron (pruebas 1 y 2).
  - **Regla:** describe el lugar con lo que se ve (formas, colores, luz), no con un nombre vago («the interface of a program»).
- 🟢 **El fondo de la foto del personaje se arrastra.** Con fotos sobre blanco:
  - salen bien los fondos lisos o de estudio (gris, pastel, amarillo);
  - los fondos con escena (calle, neón, grafo) solo aparecen en el primer fotograma y luego vuelve el blanco.
  - 💡 Quitar el fondo de una foto al subirla.

## Texto en pantalla y letras

- 🟢 **Una foto como referencia de letra copia también su texto como marca de agua** si va fuerte, o a 1 MP. A fuerza 0,3 desaparece en fondos lisos, pero vuelve con fondos que H3 no sigue.
  - 💡 Una foto que tenga solo las letras, sin personaje ni fondo, y poder recortarla en la ventana.
- 🟢 Una palabra con su momento, su sitio («encima» o «al lado») y la frase de su letra sale en su sitio.

## Referencias de estilo y de efecto

- 🟢 **Una cajita no es un video:** son fotos sueltas, sin el movimiento ni el cambio de un efecto. Un efecto que se mueve necesita un clip de verdad.
- 🟢 **Un edit entero como referencia:**
  - sin comprimir, H3 copia trozos tal cual;
  - comprimido, copia el estilo y sigue las frases de cada toma.
  - Funciona mejor con reels largos, con muchas escenas distintas.
  - 💡 Crear una referencia a partir de un video desde la ventana.
- 🟢 **Los efectos que cambian el dibujo entran bien** (manga, tramas, tinta). Los de montaje (glitch, zoom, VHS, destellos) apenas entran, o solo al principio. Para esos hace falta un clip de ejemplo.
- 🟢 **Copiar un efecto necesita su causa, no su resultado:** el clip del efecto y una frase que diga qué hace (por ejemplo, «a flat fill that switches color on every beat»), no cómo queda al final.

## Ritmo y tomas

- 🟢 **Tomas de 0,4–0,5 s se pierden.** En 9 s, H3 respeta unas 10 tomas, no 20, y prefiere las que más se parecen a la referencia. Unas 10 tomas en 10 s funcionan.
- 🟢 **H3 corta en el golpe fuerte de la música** (el drop) aunque el plan diga otro momento. Conviene poner ahí el corte.

## Personaje, producto y calidad

- 🟢 **A 1 MP la identidad se mantiene mejor que a 480p,** y con más detalle.
  - 💡 Un selector de resolución en el nodo.
- 🟢 **Producto con una foto limpia de tienda:** sale fiel. Con un recorte de otra imagen, no.
  - 💡 Un papel «producto» que sea el protagonista.
- 🟢 **Faltas y pronombres** («his arm» en una chica, «wihite»): H3 los lee tal cual.
  - 💡 Avisar de faltas y del pronombre en los campos.
