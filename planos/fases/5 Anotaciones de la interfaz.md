# Anotaciones de la interfaz (sin lanzar)

Lectura: 2 min · Empezado el 26 oct 2026, mientras el usuario hace su edit en el pod.

**En resumen:** son los arreglos de la ventana que pidió el usuario al usarla. ✅ **Los 12 están hechos** (26 oct; probados en una pestaña aparte y con `pruebas.py`).

## Pedidos por el usuario

1. ✅ **Mitad de referencias vacía:** un clic en la caja izquierda o en la derecha abre «Subir foto» directamente.
2. ✅ **La ✕ de cada referencia** borra al momento, sin preguntar «¿quitar?».
3. ✅ **«⬆ Subir foto»:**
   - mucho más grande y verde, en su mismo sitio;
   - en la biblioteca de «+ Añadir», un clic en un hueco vacío abre la subida.
4. ✅ **«+ Añadir»:** más grande y verde en las dos mitades (arriba a la izquierda y arriba a la derecha, dentro del menú).
5. ✅ **El prompt de la toma:**
   - un borde amarillo de Comfy alrededor, para que destaque;
   - la toma elegida en la línea de tiempo, con un borde blanco mucho más grueso y visible.
6. ✅ **Guardado automático en el nodo:**
   - cada cambio se guarda solo unos 2 s después de dejar de escribir, y al momento en las referencias;
   - **se quita el botón «Guardar»**;
   - el recorte del audio solo se escribe cuando cambia el audio;
   - ❓ falta decidir si también se guarda solo el workflow en el disco (el Ctrl+S); por ahora no.
   - la ✕ de una **toma** sigue preguntando, porque borra lo escrito en ella (❓ confirmar con el usuario).
7. ✅ **Botones del LLM:** «Escribir historia» encima de la historia general y «Escribir tomas» encima del prompt de las tomas, no abajo a la derecha.
8. ✅ **Orden de las columnas de la toma:**
   - a la izquierda, la dirección: encuadre, movimiento de cámara y luz;
   - en el centro, «Qué pasa»;
   - a la derecha, «Referencias que usa».
9. ✅ **«Cámara» pasa a llamarse «Movimiento de cámara»** («Camera movement»).
10. ✅ **Menú de encuadre**, con «✎ escribir el mío» al final:
    - extreme close-up;
    - close-up;
    - medium shot;
    - full shot.
11. ✅ **Movimiento de cámara con opciones fijas**, y «✎ escribir el mío» también:
    1. quieta, en el mismo sitio;
    2. acercarse desde lejos;
    3. alejarse desde cerca;
    4. paneo;
    5. cámara en mano siguiéndola.

12. ✅ **La línea `[Shot n]` de la toma elegida** (la vista previa de solo lectura de lo que va al prompt) pasa de **arriba** del panel «Prompt de la toma» a **abajo**, justo encima de las referencias.

13. ⬜ **Cambiar el orden de las tomas** en la línea de tiempo (pedido el 26 oct; para después).

## Vistos al usar la ventana (para comentarlos con el usuario)

- No se puede recortar una foto, ni quitarle el fondo, al subirla.
- La ventana no deja crear una referencia a partir de un video: ni un clip ni un reel entero comprimido.
- No hay papel «producto» como protagonista: hay que cambiar dos frases en el panel.
- La ficha de un personaje con atuendo no sale en la carta, y la frase de los atuendos se pega también al renglón escrito a mano.
- Una frase de efecto heredada manda sobre el efecto elegido, sin avisar.
- No hay selector de resolución en el nodo (480p o 1 MP).
- La visión se equivoca en los ojos (2 de 2) y no hay visión en el pod.
- El nombre del personaje se rellena con el nombre del archivo.
- No avisa cuando una toma está vacía, ni cuando el encuadre y la cámara se contradicen.
- La frase de la letra dice «the words written in it are not reproduced», aunque se quieran esas mismas palabras.
- El nodo podría avisar si su salida va a una entrada del Prompt Builder que no es `prompt_text`.
- Al mover un corte, los textos no se mueven con él: un texto puede seguir «hasta» un segundo que ya es de la toma siguiente (26 oct).
- La frase del efecto va al principio de la toma («At 00:00… a motion-graphics title…»): un efecto que debe pasar a mitad de toma sale desde el primer fotograma. Para un título animado, mejor citar el clip en la frase del texto (26 oct).
