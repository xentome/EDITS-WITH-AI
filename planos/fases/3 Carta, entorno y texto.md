# Fases: carta, entorno y texto

Actualizado: 25 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

**En resumen:** que el nodo haga bien el edit de Ren (efectos que transforman, solo primeros planos, palabras grandes encima de la cara) sin estropear el de Teto (paseo por lugares, palabras al lado). La réplica de Ren falló por cómo armaba la carta nuestro código (`~/Escritorio/experimentos_edit/edit_prompt_llm/replica_ren/INFORME.md`): los efectos no se presentaban arriba, la transformación iba al final de la toma, las palabras iban «al lado», 0,15 s después del corte y anunciadas al principio, y el sonido decía «sin efectos».

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | La carta mejor ordenada: cada efecto definido arriba y retenido aparte; en cada toma, el efecto justo después del encuadre | ✅ hecha · (ver git log) |
| 2 | Selector de entorno por toma (auto / manual / sin entorno) y arreglos pequeños (papel al añadir, más encuadres, sin `.capitalize()`) | ⬜ |
| 3 | La fila de texto en la línea de tiempo (sustituye a «Palabras» y «Estilo de las palabras») | ⬜ |
| 4 | El renglón «Sonido» en la historia general | ⬜ |
| 5 | Prueba de verdad: render de Ren y de Teto, hoja de comparación, capturas en los dos idiomas y planos al día | ⬜ |

## A medias

- Fase 1 hecha (`nucleo.definiciones`, `nucleo.montar`, `efectos_con_imagen`, `solo_primeros_planos`). La referencia de Teto cambió solo en sus 6 tomas: el efecto pasó de «Effect: …» al final a justo después del encuadre («Close-up, hand-drawn … sparkle marks. A neon-lit crosswalk, …»). Teto no tiene efectos con imagen, así que sus definiciones y su retención no cambian. Comprobaciones nuevas en `pruebas.py`, sección 8b.

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. Si al volver de una suspensión falla una llamada (LLM, ComfyUI, navegador o render), repítela antes de dar la fase por fallida.
4. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`. No incluyas `maqueta/dibujo.json` (es del usuario) ni imágenes, audios, RefMods o videos.
5. Las capturas, videos, hojas e informe van a `~/Escritorio/experimentos_edit/edit_prompt_llm/carta_nueva/`.
