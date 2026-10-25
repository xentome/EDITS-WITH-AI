# Medidas y pendientes

Lectura: 2 min

**En resumen:** un plan completo de 6 tomas tarda unos 2 minutos, y la historia se lleva el 80 % de ese tiempo. En el editor, rehacer una sola toma cuesta unos 7 s. Lo que más falta saber es cómo salen en un render las referencias de fondo y estilo, y si las tomas sin razonamiento están a la altura del método de 3 etapas.

## Medidas (24 oct 2026)

| Qué | Valor |
|---|---|
| Plan completo de Teto (6 tomas), núcleo v2 | 104 s, 8 llamadas |
| Planes con el núcleo v1 | 121–204 s |
| Historia (razonamiento low) | 83–129 s; 3.000–4.100 tokens |
| Cada toma (sin razonamiento) | unos 3 s el primer intento y 1,5 s cada repetición; las 6 suman 21–29 s |
| Dentro de ComfyUI | 129 s; llama soltó la VRAM 6 s después (11,4 GB libres) |
| Render de Teto a 480p y 5 s | 514 s |
| Misma semilla | misma respuesta |
| Qwen3.8 | escribe a 34 tok/s y lee a ~360 tok/s |
| Prompt final de Teto | ~700 palabras (v3: 1.524) |
| Comprobaciones de `pruebas.py` | 59 (25 oct: sin recetas, línea de tiempo y duración), unos 5 s |
| Editor: historia / tomas / una toma / visión | 113 s / 28,7 s / 7 s / 15 s |
| Visión: riesgos | acertó (cara difuminada, bandas negras, texto) |
| Visión: objetos pequeños | falla y cambia entre intentos (el chicle salió como «bolso rosa» y como «tira de mochila») |
| Interfaz nueva (24 oct): historia / tomas con 3 tomas | 80 s / 13 s |
| Interfaz nueva: visión del lugar / de la ropa | 21 s / 14 s; la ropa bien, el lugar mal nombrado («spacecraft cabin» en vez de bodega de avión), corregido a mano |
| Crear una cajita de 2 fotos | 8 s |
| Render de la interfaz nueva (480p, 5,17 s, 3 tomas) | 522 s; Teto (cajita `<Video 1>`) se mantiene en las 3, la ropa prestada de Vera también (chaqueta, parches, reloj) y en cada toma se ve una pieza de la bodega: la puerta abierta, la ventanilla redonda y la red roja |
| Render del prompt hecho en el editor (480p, 5 s) | 5 de 6 tomas bien; el lugar fijado a mano aparece tal cual; falla la toma con la pose `<Picture 5>` (plano 5) |
| Ventana de audio: `audio_info` de Blue Fairy (2:40, mp3) | 0,23 s la primera vez (por HTTP); 0,003 s desde la caché; 3.992 picos |
| `audio_info` de un mp3 de 1 hora | 2,9 s la primera vez, 0 s desde la caché; 3.914 picos (0,92 s cada uno) |
| Beats de la canción entera (por trozos), la primera vez | Blue Fairy 2,5 s; 1 hora 13 s (pico de memoria 2,2 GB); después, de la caché |
| Picos finos de la ventana / tramo en WAV (1 h, a los 50 min) | 0,11 s / 0,14 s |
| Abrir el editor hasta ver la onda | 0,3 s |
| Arrastre de la onda (tramo de 5,17 s, 2.283 px) | lento, 40 px a 1 px cada 30 ms: 0,083 s (2 fotogramas); rápido, 600 px en 80 ms: 74,5 s; hacia atrás, 600 px en 180 ms: 33 s |
| ▶ del tramo | suena 5,167 s exactos y se para sola; pausa y sigue desde el mismo punto |
| Recorte de un mp3 | coincide muestra a muestra con la canción entera (diferencia 0) |
| Render con tramo (Blue Fairy desde 1:30.500, 3,042 s, 3 tomas, 480p) | 381 s; el audio del video es la canción desde 90,500 s (correlación 0,998). Cortes planeados en los beats 0,917 y 2,124 s; H3 cortó en el fotograma 20 (0,833 s) y en un fundido del 49 al 51 (2,04–2,12 s), es decir 1–2 fotogramas antes |
| Tapar: máscaras de SAM 3.1 (cara + pelo, un solo `/prompt`) | 2,5–3,4 s con el modelo cargado; 7,4 s desde el editor tras vaciar la caché; 0 s desde la caché |
| Tapar: encender en el editor (`ropa/vera`, foto de 1200×1799) | 15,3 s en total: SAM 7,4 s y RefMod 4 s; cara 4,6 % y pelo 3,8 % de la foto |
| Tapar: apagar / volver a encender (reutiliza, sin SAM) | 0,8 s / 0,1 s; ningún `/prompt` nuevo en ComfyUI |
| Render con la ropa tapada desde el interruptor (Teto + `ropa/vera__tapado_6811477a`, 480p, 3,042 s, 3 tomas) | 377 s; Teto en las 3 tomas con la chaqueta roja, los parches y el reloj de Vera; no se cuela la cara ni el pelo negro de Vera. Igual que la tapada a mano y que `vera_ropa_sam` (`interfaz_nueva/tapar_sam/`) |
| Sin recetas (25 oct): historia / tomas desde la ventana (3 tomas, Teto en cajita con nombre y ficha, ropa de Vera tapada, bodega fija, estilo escrito, efecto de texto E1) | 89 s / 12 s, a la primera |
| Render sin recetas (480p, 3,042 s, 3 tomas) | 422 s; igual que el de tapar: Teto en las 3 tomas, la chaqueta de Vera sin su cara, la puerta, la ventanilla y los asientos rojos de la bodega. El efecto de texto «golden dust» (toma 1) casi no se ve: unas motas. `interfaz_nueva/mejoras_sin_recetas/` |
| Tapar: «text» con SAM 3.1 | encuentra letras grandes y logos (SHINE 30 %, BEABADOOBEE 6,5 %, WRAPSTARZ 8 %, el usuario de un post); no las líneas de letra pequeña |

## Pendientes

- 💡 **Objeto que no cambia:** frases escritas y revisadas por `pruebas.py`, sin ningún render todavía.
- ❓ **Lugar que no cambia:** un solo render. Salió el lugar, pero la hora del cielo cambió: atardecer con estrellas en la toma 1 y cielo de día por la ventanilla en la toma 2. Falta ver si una toma más abierta lo mantiene entero.

- 💡 **Citas de fondo y estilo:** escritas, sin ningún render todavía.
- ❓ **Editor:** no hay un botón para leer el papel y la ficha directamente de los datos del RefMod creados con visión; ahora se rellenan con los datos del RefMod (concepto y apariencia) o con 👁.
- ❓ **Pelo con la pose `<Picture 5>`:** probar a nombrar el pelo dentro de las tomas que usan una pose; la v3 lo hacía y salía bien.
- ❓ **Si las tomas sin razonamiento salen tan bien como con el método de 3 etapas:** hay que compararlo en renders.
- ❓ **Edits de 10 s en 2 clips:** un mismo plan para las dos mitades.
- 💡 **Efectos con imagen (papel efecto) y varios personajes a la vez:** escritos y revisados por `pruebas.py`, sin render.
- ❓ **Tapar en las fotos del Media Loader:** hoy solo en tarjetas del Stack. Haría falta cambiar el archivo del medio, no una tarjeta.
- ❓ **Tapar una pose:** sin render. Falta ver si una pose con la cara difuminada sigue dando la pose bien.
- ❓ **H3 corta 1–2 fotogramas antes del beat** (render del tramo de Blue Fairy). Falta ver si pasa siempre y si conviene adelantar los cortes.
