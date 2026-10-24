# El editor

Lectura: 3 min

**En resumen:** con «Abrir editor…» (o doble clic en el nodo) se abre una ventana de 3 columnas: referencias, prompt fundamental y prompt final. Lo creativo lo escribes tú o se lo pides al LLM; lo que escribes queda fijo (🔒). «Guardar» lo deja todo en el nodo y, al ejecutar, el nodo saca ese prompt sin volver a llamar al LLM.

## Columna 1 · Referencias

- **De dónde salen:** del RefMod Stack conectado al Prompt Builder y del Media Loader. Cada una tiene su miniatura y la misma numeración que usa el Text Encode.
- **Cambiar las del Stack desde aquí:**
  - **+ Añadir referencia:** se elige de la biblioteca de RefMods;
  - **activa:** una referencia apagada no se envía a H3 y no tiene número;
  - **fuerza:** de 0 a 10, como en Fantastic; 1 es lo normal, 0,3 es suave (las poses) y más de 1 hace copias;
  - **✕ quitar.**

  Se escribe directamente en el nodo Stack y su panel se actualiza. Para **crear** un RefMod nuevo desde una imagen se sigue usando «Create…» en el Stack; después aparece en la biblioteca.
- **Cada referencia se reconoce por su nombre de RefMod, no por su número.** Si añades, quitas o apagas tarjetas, los números cambian, pero el papel, la ficha y las tomas siguen a su imagen. Una toma que usaba una referencia que ya no está queda vacía en ese campo.
- **Qué se ajusta en cada una:**
  - el **papel**: personaje/atuendo, pose, fondo, estilo o no usar;
  - el **nombre**, solo en las de personaje, porque es lo que va al prompt («school uniform»);
  - la **ficha**: lo que el LLM sabe de la imagen, porque no la ve.
- **Qué valores aparecen al abrir:** primero lo guardado en el nodo; si no hay nada, lo de la receta; y si tampoco, los datos del RefMod.
- **👁 describir con visión** (unos 15 s): Qwen mira la imagen y propone una ficha y sus riesgos. No cambia nada hasta que pulses «usar», y «descartar» quita la propuesta. Acierta los riesgos (cara difuminada, bandas negras, texto), pero se equivoca en objetos pequeños: el chicle lo describió como «un bolso rosa».
- **«usada en»:** dice dónde se usa la referencia (definición, T1 · T4). Al pasar el ratón por encima se resalta en las tomas y en el prompt final.

## Columna 2 · Prompt fundamental (lo que lee y extiende el LLM)

- Idea, receta, tomas, duración, semilla y palabras. Son los mismos campos del nodo.
- Arco, luz y ambiente, y fondo general.
- **Cada toma:** lugar, qué pasa, personaje, pose, fondo de referencia, efecto, encuadre, cámara, luz y gesto. La cabecera muestra sus tiempos, puestos en los beats.
- **Frase del efecto:** debajo del menú «Efecto» se ve la frase probada de la receta. Si la cambias, queda fija y es la que va al prompt y la que ve el LLM; «↺» vuelve a la de la receta. También sirve para un efecto propio, eligiendo «sin efecto» en el menú y escribiendo la frase.
- **🔒 / 🔓:** lo que escribes o eliges queda fijo automáticamente. Pulsa el candado para soltarlo.
- **Escribir historia** (unos 2 min): rellena lo no fijado del arco, la luz y, en cada toma, el lugar, lo que pasa, las referencias y el efecto. También vacía la dirección no fijada, porque ya no encaja con la historia nueva.
- **Escribir tomas** (unos 30 s): encuadre, luz, gesto y cámara de todas las tomas, salvo lo fijado.
- **🔄 dirección** (unos 7 s): rehace solo esa toma, teniendo en cuenta a sus dos vecinas.

## Columna 3 · Prompt final (lo que recibe H3)

- El código lo vuelve a montar cada vez que cambias algo, sin llamar al LLM, y avisa de los huecos.
- **Editar a mano:** queda marcado como «editado a mano» y ya no se vuelve a montar solo. «Volver a montar» lo deshace.

## Guardar

- «Guardar» y «Guardar y cerrar» escriben en el nodo: los campos visibles y el campo oculto `estado`. Después guarda el workflow (Ctrl+S).
- ✕ cierra sin guardar.
- Al ejecutar, el informe del nodo dice «Prompt del editor».

## Por dentro

- **Archivos:** `web/editor.js` es el botón; `web/editor_core.js` es la ventana y se vuelve a cargar cada vez que se abre.
- **Servidor:** la ventana habla con él por `/edit_prompt_llm/<acción>`. Las acciones son recetas, montar, historia, tomas y describir, y están en la lista `rutas.ACCIONES`. Antes de usar el LLM, el servidor comprueba que ComfyUI no esté renderizando y le pide que suelte la GPU.
- ✅ **Probado el 24 oct:**

| Prueba | Resultado |
|---|---|
| Escribir historia | 113 s |
| Escribir tomas | 28,7 s |
| Rehacer una toma | 7 s |
| Describir con visión | 15 s |
| Un lugar escrito a mano | queda fijo; las demás tomas no cambian |
| Editar a mano y volver a montar | funciona |
| Guardar y ejecutar | el nodo saca exactamente el mismo texto |

## Límites conocidos

- Si una tarjeta del Stack tiene copias, la numeración puede no coincidir con la del Text Encode. El editor avisa.
- Las referencias de video solo se muestran: no tienen papel.
- En recetas cuya identidad viene de `<Video 1>` (Ren), dar el papel de personaje a una referencia del Stack no cambia su definición.
