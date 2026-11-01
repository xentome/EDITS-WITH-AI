# Fase 18 · Generar por partes

Lectura: 2 min · 1 nov 2026 · Pedido de Jonathan: «mi PC no genera más de 5 s a 1 MP; quiero mi misma línea de tiempo en dos generaciones y que se unan».

**En resumen**
- Botón **✂ Por partes** junto a Generar. La línea de tiempo se parte **solo en los cortes entre tomas** (forma A del plan; la B, seguir la toma con Extender, queda para después si hace falta).
- Cada parte es un «generar» normal de la cola, con sus tomas, sus tiempos desde 0:00, su duración 17·k+5 y su trozo de canción. Detrás va un trabajo **«unir»** (ffmpeg, sin GPU) que las pega y pone encima la canción entera.

## Cómo
- `app/partes.py`: `repartir` (qué tomas van en cada parte; solo o a mano con las tijeras), `proyecto_de_parte` (copia del proyecto con esas tomas, cortes, textos y trozo de canción), `unir`.
- Cada parte empieza donde acabó la anterior (sus fotogramas), así cada toma sigue en su segundo de la canción. Solo el último plano de cada parte cambia ≤ 8 fotogramas; el total, también ≤ 8.
- El trozo de canción se llama `edit_tramo_p<hash>.wav`: `generar._reponer_tramo` lo corta al lanzar.
- `POST /app/partes` (servidor.py): monta el prompt de cada parte con el mismo «montar» que la página. Sin `lanzar` solo calcula.
- `cola.py`: `anadir_grupo`, campo `grupo` {id, i, n}; si una parte falla se cancela el resto del grupo; «Reintentar» vuelve a poner todo el grupo que no está hecho.
- Videos: las partes salen como «parte i de n»; el unido como «unido de n partes» con los valores del edit entero (Retomar prompt) y su canción (Extender la sigue).
- (1 nov, Jonathan: «tengo que poder elegir la parte») cada parte tiene su casilla; `solo` en `POST /app/partes`. Con todas marcadas va el «unir»; con algunas, salen sueltas y un fallo no cancela a las demás.
- El límite por parte se guarda en el navegador (`max-editor-partes-limite`, 5,17 s por defecto).

## Probado (1 nov, sin GPU)
- Reparto con «paracaidas v3» (copia): 4,46 s + 3,04 s; con tijeras, 3 partes. Prompts de cada parte correctos; grafos con 107 y 73 fotogramas.
- Canción («ejemplo vera chica», copia): cada parte con su inicio (4,0 s y 7,042 s).
- Unir con videos de prueba: 180 fotogramas exactos y audio de 7,5 s, con canción y con el audio de cada parte.
- Cola: fallo de una parte cancela el resto; Reintentar las devuelve en orden.
- Ventana a 1440 y 2548 en una copia. `pruebas.py`: TODO BIEN.

## Huecos
- **Falta un render real** (lo hará Jonathan con su proyecto).
- No hay herramienta MCP todavía: se pidió a la sesión MCP (`generate_in_parts` → `POST /app/partes`).
- Las referencias que una parte no usa siguen yendo a H3 (gastan memoria). Quitarlas renumera las etiquetas: para después.
- El unido no guarda latente: Extender lo sigue desde el mp4.
- La cabecera ya no cabía entera a 1440 de ancho antes de este botón (Cola se cortaba); allí «Por partes» solo enseña las tijeras.
