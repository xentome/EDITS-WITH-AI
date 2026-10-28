# Fase 14 · Traducir al inglés

Lectura: 2 min · 28 oct 2026 · Sesión «PULIDO FINAL APP».

**En resumen**
- Jonathan escribe en su idioma y H3 lee inglés. Un botón **«Traducir a inglés»** junto a cada campo de la toma (Acción, Gesto, Luz, Lugar, Estilo, el encuadre y la cámara escritos a mano, el efecto de la referencia) y de Sonido traduce el campo entero. En **cualquier campo** de la ventana, el **clic derecho** con texto seleccionado ofrece «Traducir selección al inglés» (y «Traducir todo el campo»). Mayús + clic derecho: el menú normal del navegador.
- Siempre AL inglés. El idioma de partida se elige en la cabecera del editor, **«Traducir desde»**: 10 idiomas (español, portugués, francés, italiano, alemán, japonés, coreano, chino, ruso y árabe) con buscador, u otro escrito a mano. Se recuerda en el navegador (`max-editor-traducir-desde`). Sin «detectar solo» (Jonathan: «es demasiado»).
- La traducción entra en el campo como si la escribieras (`execCommand`): **Ctrl+Z vuelve a tu texto**. Mientras traduce, el campo queda de solo lectura.

## Cómo funciona
- **Página:** `web/editor/traducir.js` (selector, botón, clic derecho, reemplazo). El botón va en el nombre de cada bloque (`bloque(…, trad)` en `plan.js`).
- **Servidor:** acción `traducir` (`rutas.py`, con LLM: antes suelta la GPU de ComfyUI; si ComfyUI renderiza, `errores.cola_llm`) → `nucleo.traducir(texto, desde, inicio, fin)`.
  - Lo protegido (`<Picture N>`, `<Subject 1>`, citas `@`, `E1`, el texto entre comillas) se cambia por `{{1}}`, `{{2}}`… y se vuelve a poner: no se puede perder ni cambiar.
  - Una selección se manda con el texto entero y la parte marcada entre `<<<` y `>>>`, para que encaje en su frase; los espacios de sus bordes se quedan fuera.
  - Sin razonamiento, temperatura 0. La revisión (`revisar_traduccion`): vacía, huecos que faltan, sobran o se repiten, marcas copiadas, saltos de línea, largo (0,45–2,4×) y, desde el español, palabras españolas que quedaron. Si falla, se le devuelve al LLM con la causa (hasta 3 veces); si no pasa, `errores.traducir` y el texto no se toca. Cada llamada queda en la carpeta de corridas (`*_traducir`).
- `pruebas.py`, sección 20: con un LLM de mentira (protegido, limpieza de «Here is…», reintento, error, selección, sin nada que traducir).

  - La página manda también el **campo** (cómo se pega en la carta: el gesto sigue a `<Subject 1>` y la cámara a «the camera», así que empiezan por el verbo) y el **pronombre** del personaje (para «su», «ella»). Los tiempos (`0:02`) no van en huecos, para que el LLM sepa que son un momento («at 0:02»); la revisión mira que sigan iguales. La mayúscula del principio sigue al original.

## Pruebas con el LLM de verdad (28 oct, Qwen3.8 27B) ✅
- 21 textos (`scratchpad/bateria_traducir.py`): acción, cámara, luz, lugar, gesto, izquierda/derecha, texto en pantalla, citas @, mezcla con inglés, ya en inglés, dos líneas, un efecto, una palabra, tres selecciones (en medio, con género, junto a una etiqueta), portugués, japonés y una selección en francés.
- **Ronda 1:** sin errores técnicos (etiquetas intactas, 1 intento), pero 4 de calidad: la cámara empezaba por «It starts…» y el gesto por «she…» (se pegan tras «the camera» y `<Subject 1>`), «su cara» → «his face», «encima de ella» → «on top of it» y «en 0:02» → «In 0:02».
- **Ronda 2** (con campo y pronombre): los 21 bien, todos al primer intento.
- **Tiempo:** unos 9 s cada una, de los que la traducción es ~1,3 s; el resto es despertar al LLM (el servicio `llama-qwen38` lo descarga de la GPU a los 5 s sin uso, `--sleep-idle-seconds 5`, para dejar sitio a ComfyUI).
- **GPU:** no se traduce mientras ComfyUI genera (`errores.cola_llm`), y el LLM (~10,3 GB) no cabe con DaVinci Resolve abierto.
