# Prompt del edit — planos (empieza aquí)

Lectura: 2 min · Actualizado: 25 oct 2026

**En resumen**
- Es **la base de la app**: convierte una idea en el prompt de MiniMax H3 usando las referencias del workflow y el LLM local (Qwen3.8).
- Funciona como un nodo de ComfyUI, «Prompt del edit (LLM)». También tiene un editor de una pantalla: historia, toma elegida, referencias en dos mitades, línea de tiempo y prompt final.
- **Regla de la casa:** el LLM decide lo creativo; el código pone lo exacto (tiempos, fichas de los efectos, partes fijas) y revisa todo lo que escribe el LLM.
- Después de cualquier cambio, corre `pruebas.py` (tarda segundos). Si dice TODO BIEN, no se rompió nada.

Símbolos: ✅ comprobado · 💡 sin probar · ❓ pendiente.

## Los planos (en este orden)

1. [Cómo funciona](planos/1%20Como%20funciona.md): el recorrido de una idea hasta el prompt, y qué es el «plan».
2. [Mapa del código](planos/2%20Mapa%20del%20codigo.md): qué hace cada archivo y dónde se cambia cada cosa.
3. [Personaje, estilo y efectos](planos/3%20Personaje,%20estilo%20y%20efectos.md): lo que antes daban las recetas, ahora a la vista (quitadas el 24 oct).
4. [El editor](planos/4%20El%20editor.md): la ventana y lo que hace cada botón.
5. [Reglas de revisión](planos/5%20Reglas%20de%20revision.md): los fallos que ya vimos y cómo se evitan.
6. [Cambiar sin romper](planos/6%20Cambiar%20sin%20romper.md): el procedimiento para modificarlo.
7. [Medidas y pendientes](planos/7%20Medidas%20y%20pendientes.md): números medidos y lo que aún no sabemos.

Trabajo en curso, por fases (para retomarlo si se corta): [planos/fases/](planos/fases/1%20Sin%20recetas%20y%20mejoras%20del%20editor.md).

## Las 5 reglas de la casa

1. El LLM decide; el código pone lo exacto y revisa.
2. Lo que fija el usuario (candado) nunca lo cambia el LLM.
3. Cada fallo nuevo se convierte en una regla de revisión, con su fila en el plano 5, y no en más texto en el prompt.
4. Cada problema que se le devuelve al LLM nombra la causa exacta: campo y valor.
5. Nada se da por bueno sin `pruebas.py`. Y si cambió el prompt final, tampoco sin un render de prueba.

## Estado

- ✅ **Núcleo v2:** referencias por papel, candados y regenerar una sola toma. Probado con `pruebas.py` y con el LLM real (104 s, 8 llamadas).
- ✅ **Nodo en ComfyUI:** probado con un render de Teto a 480p.
- ✅ **Editor, interfaz nueva (24 oct):** una pantalla con historia general, prompt de la toma, referencias en dos mitades (lo que no cambia / lo que se presta) con cajitas, línea de tiempo y prompt final (plano 4). Probada con un render: Teto en cajita + ropa de Vera + un lugar fijo.
- ✅ **Ventana de audio (24 oct):** debajo de las tomas, la onda del tramo, ▶/⏸, arrastre con aceleración que cae en el fotograma y la canción entera en una línea con su punto (plano 4). Al guardar escribe el recorte para H3. Probada con un render de Blue Fairy desde 1:30.500.
- ✅ **Tapar con SAM 3.1 (24 oct):** en la ficha de cada referencia, un interruptor y unos chips (cara, pelo, texto, otra cosa) crean una copia tapada del RefMod y la ponen en el Stack; apagar vuelve a la original y volver a encender la reutiliza (plano 4).
- ✅ **Papeles nuevos:** objeto, lugar y ropa; personaje como `<Video N>` (plano 1). 💡 El objeto aún no tiene render.
- ✅ **Sin recetas (25 oct):** el personaje sale de su referencia (nombre, pronombre, ficha), el estilo es un campo de la historia general y los efectos son referencias o efectos de texto (plano 3). Probado con un render.
- ✅ **Editor, 25 oct:** quitar tomas y arrastrar el borde entre tomas (cortes a mano, con imán a los beats), la duración manda en todo el workflow (length de H3 y Prompt Builder), «Cambiar canción» y «Subir foto» (plano 4). Probado con un render.
