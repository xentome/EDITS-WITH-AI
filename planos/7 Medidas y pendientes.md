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
| Comprobaciones de `pruebas.py` | 24 (16 de antes y 8 de los papeles nuevos), unos 2 s |
| Editor: historia / tomas / una toma / visión | 113 s / 28,7 s / 7 s / 15 s |
| Visión: riesgos | acertó (cara difuminada, bandas negras, texto) |
| Visión: objetos pequeños | falla y cambia entre intentos (el chicle salió como «bolso rosa» y como «tira de mochila») |
| Interfaz nueva (24 oct): historia / tomas con 3 tomas | 80 s / 13 s |
| Interfaz nueva: visión del lugar / de la ropa | 21 s / 14 s; la ropa bien, el lugar mal nombrado («spacecraft cabin» en vez de bodega de avión), corregido a mano |
| Crear una cajita de 2 fotos | 8 s |
| Render de la interfaz nueva (480p, 5,17 s, 3 tomas) | 522 s; Teto (cajita `<Video 1>`) se mantiene en las 3, la ropa prestada de Vera también (chaqueta, parches, reloj) y en cada toma se ve una pieza de la bodega: la puerta abierta, la ventanilla redonda y la red roja |
| Render del prompt hecho en el editor (480p, 5 s) | 5 de 6 tomas bien; el lugar fijado a mano aparece tal cual; falla la toma con la pose `<Picture 5>` (plano 5) |

## Pendientes

- 💡 **Objeto que no cambia:** frases escritas y revisadas por `pruebas.py`, sin ningún render todavía.
- ❓ **Lugar que no cambia:** un solo render. Salió el lugar, pero la hora del cielo cambió: atardecer con estrellas en la toma 1 y cielo de día por la ventanilla en la toma 2. Falta ver si una toma más abierta lo mantiene entero.
- ❓ **Frases de efecto que chocan con el lugar** (U3 «the night city»; plano 5, fila 29) y el `resumen` de Teto que dice «in a Japanese city».

- 💡 **Citas de fondo y estilo:** escritas, sin ningún render todavía.
- ❓ **Editor:** no hay un botón para leer el papel y la ficha directamente de los datos del RefMod creados con visión; ahora se rellenan desde la receta o con 👁.
- ❓ **Pelo con la pose `<Picture 5>`:** probar a nombrar el pelo dentro de las tomas que usan una pose; la v3 lo hacía y salía bien.
- ❓ **Si las tomas sin razonamiento salen tan bien como con el método de 3 etapas:** hay que compararlo en renders.
- ❓ **Edits de 10 s en 2 clips:** un mismo plan para las dos mitades.
- ❓ **Receta de Vera.**
