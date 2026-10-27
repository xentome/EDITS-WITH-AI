# Prompt del edit — planos (empieza aquí)

Lectura: 2 min · Actualizado: 26 oct 2026

**En resumen**
- Es **la base de la app**: convierte una idea en el prompt de MiniMax H3 usando las referencias del workflow y el LLM local (Qwen3.8).
- **La app MAX EDITOR** (`app/`, 26 oct): la misma ventana a pantalla completa en `http://127.0.0.1:8300`, que genera el video con el SDK de Comfy. Instalar y usar: [app/LEEME.md](app/LEEME.md) (en inglés, [README.md](README.md)).
- También funciona como un nodo de ComfyUI, «Prompt del edit (LLM)». También tiene un editor de una pantalla: historia, toma elegida, referencias en dos mitades, línea de tiempo y prompt final.
- **Regla de la casa:** deciden tú y el LLM; el código **solo pega**. Pone los tiempos y el molde de H3, y une lo que escribisteis con las frases de `frases.json`, que se ven y se cambian en la ventana. En el prompt final, cada trozo sale del color de quien lo escribió.
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
8. [Lo que funciona](planos/8%20Lo%20que%20funciona.md): qué escribir en cada campo para que H3 obedezca (base de la guía de uso) y qué podría mejorar la interfaz con eso.

Trabajo en curso, por fases (para retomarlo si se corta): [planos/fases/](planos/fases/1%20Sin%20recetas%20y%20mejoras%20del%20editor.md), [2 Bilingüe](planos/fases/2%20Bilingue.md), [3 Carta, entorno y texto](planos/fases/3%20Carta,%20entorno%20y%20texto.md) [4 El código solo pega](planos/fases/4%20El%20codigo%20solo%20pega.md) y [6 La app MAX EDITOR](planos/fases/6%20La%20app%20MAX%20EDITOR.md).

## Las 5 reglas de la casa

1. Deciden tú y el LLM; el código solo pega: el molde de H3, los tiempos, vuestros campos y las frases de `frases.json`. No añade, no quita y no cambia letras. `pruebas.py` lo comprueba (sección 16).
2. Lo que fija el usuario (candado) nunca lo cambia el LLM.
3. Cada fallo nuevo se apunta en el plano 5. Si hace falta protegerse, que sea a la vista: una frase de `frases.json` o una revisión de lo que escribe el LLM, nunca un texto escondido. ❓ Las reglas de revisión que limitan al LLM están por repasar con el usuario (plano 5, «Para repasar»).
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
- ✅ **Carta, entorno y texto (25 oct):** cada efecto se define arriba y va justo tras el encuadre; selector de entorno por toma (auto / manual / sin entorno); 7 encuadres; fila de texto en la línea de tiempo (palabras encima o al lado, con su letra y su momento, sin anunciarlas antes); renglón «Sonido». Probado con dos renders: Ren saca sus 5 mundos y las palabras encima (como el original, con sus defectos) y Teto sale igual de bien (plano 7).
- ✅ **El código solo pega (25 oct):** todas las frases de unión están en `frases.json` y en el panel «Frases del código». El prompt final se pinta por quién lo escribió: molde, código, tú o LLM. Cada referencia con papel se presenta arriba con su ficha, que se puede reescribir («Cómo se presenta», «Qué se copia»), y hay un encuadre propio (planos 1 y 4). Probado con `pruebas.py` (frases marcadas, carta vacía y copia y pega) y en el navegador en los dos idiomas. 💡 Sin render todavía.
- ✅ **Bilingüe (25 oct):** la ventana, el nodo y los avisos del servidor en español o inglés; botón «ES | EN» y ajuste «Prompt del edit › Idioma» (plano 4). Los textos están en `web/i18n/`; cómo añadir uno, en el plano 2. Probado en el navegador en los dos idiomas.
- ✅ **App MAX EDITOR (26 oct):** servidor local con la ventana del nodo, proyectos (el ejemplo es de solo lectura y se abre como copia), Generar con el SDK de Comfy (`comfy-sdk` + `comfy-api-proxy`), avance y videos. Arranque con `app/arrancar.sh`, parada con `app/parar.sh`, instalación con `app/instalar.sh`; probada desde cero en un clon limpio (plano de la fase 6). 💡 Falta un render de verdad desde el botón.
