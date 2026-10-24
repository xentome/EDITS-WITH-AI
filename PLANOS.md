# Prompt del edit — planos (empieza aquí)

Lectura: 2 min · Actualizado: 24 oct 2026

**En resumen**
- Es **la base de la app**: convierte una idea en el prompt de MiniMax H3 usando las referencias del workflow y el LLM local (Qwen3.8).
- Funciona como un nodo de ComfyUI, «Prompt del edit (LLM)». También tiene un editor de 3 columnas: referencias, prompt fundamental y prompt final.
- **Regla de la casa:** el LLM decide lo creativo; el código pone lo exacto (tiempos, frases probadas, partes fijas) y revisa todo lo que escribe el LLM.
- Después de cualquier cambio, corre `pruebas.py` (tarda segundos). Si dice TODO BIEN, no se rompió nada.

Símbolos: ✅ comprobado · 💡 sin probar · ❓ pendiente.

## Los planos (en este orden)

1. [Cómo funciona](planos/1%20Como%20funciona.md): el recorrido de una idea hasta el prompt, y qué es el «plan».
2. [Mapa del código](planos/2%20Mapa%20del%20codigo.md): qué hace cada archivo y dónde se cambia cada cosa.
3. [Recetas](planos/3%20Recetas.md): lo fijo de cada personaje y cómo añadir uno.
4. [El editor](planos/4%20El%20editor.md): la ventana y lo que hace cada botón.
5. [Reglas de revisión](planos/5%20Reglas%20de%20revision.md): los fallos que ya vimos y cómo se evitan.
6. [Cambiar sin romper](planos/6%20Cambiar%20sin%20romper.md): el procedimiento para modificarlo.
7. [Medidas y pendientes](planos/7%20Medidas%20y%20pendientes.md): números medidos y lo que aún no sabemos.

## Las 5 reglas de la casa

1. El LLM decide; el código pone lo exacto y revisa.
2. Lo que fija el usuario (candado) nunca lo cambia el LLM.
3. Cada fallo nuevo se convierte en una regla de revisión, con su fila en el plano 5, y no en más texto en el prompt.
4. Cada problema que se le devuelve al LLM nombra la causa exacta: campo y valor.
5. Nada se da por bueno sin `pruebas.py`. Y si cambió el prompt final, tampoco sin un render de prueba.

## Estado

- ✅ **Núcleo v2:** referencias por papel, candados y regenerar una sola toma. Probado con `pruebas.py` y con el LLM real (104 s, 8 llamadas).
- ✅ **Nodo en ComfyUI:** probado con un render de Teto a 480p.
- ✅ **Editor:** las 3 columnas, candados, historia, tomas, una sola toma, visión con «usar / descartar», edición a mano y guardado en el nodo (plano 4).
