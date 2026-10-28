# Fase 12 · Extender video

Lectura: 3 min · 28 oct 2026 · Para los ayudantes y para retomar si se corta. Respaldo: etiqueta `respaldo-antes-extender`.

**En resumen**
- «Extender video» alarga un video siguiendo la MISMA toma desde su final, sin corte. Va dentro del paso Retocar, que ahora tiene dos apartados: «Inpainting / detalle» (lo de antes, igual) y «Extender video».
- Método (informe `~/Escritorio/research_notes/extender_video/informe.md`): el de drozbay (ablejones) que el nodo 😺NKD AV Latent Extend hace en uno. La cola del video (39 f por defecto) se planta al principio de un latente vacío y se marca «no tocar» (máscara 0); el núcleo de ComfyUI (PR #15375) trata esas filas como contexto limpio y H3 sigue su movimiento y su sonido. Después se tira el solape y se pega lo nuevo detrás del original.
- Fuente de la cola: el **latente guardado** del video si existe y encaja (misma resolución); si no, el **mp4** (se vuelve a codificar con el VAE: pierde un poco de color).
- Audio (regla de Jonathan): por defecto se respeta el de entrada. Video de un proyecto con canción → la canción sigue donde iba (guía de H3 con `MiniMaxH3AddGuide`) y al final se pone intacta encima. Sin canción conocida (mp4 de fuera, o generado con «audio del modelo») → el sonido original se queda tal cual y H3 continúa el de los últimos segundos. Opción «audio del modelo»: lo nuevo suena con lo que genere H3.
- Todo por la cola (`tipo: extender`), encadenable y con herramienta MCP `extender`.

## Archivos
- `app/extender.py`: `plan(datos)` (lo que verá la línea de tiempo: fuente, audio, resolución, ventana), `preparar`, `iniciar`, `recuperar` (cola), el grafo se arma en código con los nodos de la plantilla de Retocar (mismo modelo Singularity + VDN, 8 pasos, SamplerCustomAdvanced porque el SPEED no admite máscaras).
- Latentes: `MpiSaveLatent` (ComfyUi-MpiNodes, guarda el latente AV de H3, que el SaveLatent del núcleo no sabe) en Generar y Extender → `ComfyUI/output/latents/<nombre>.latent`; la fila del historial lleva `latente` y `latente_wh`. Retocar no guarda (su latente es solo el recorte de la máscara): para extender un retoque se usa el latente del video del que salió si el retoque no tocó el final.
- `app/web/extender.js` + pestañas en Retocar; `app/servidor.py` (`POST /app/extender_plan`, cola `tipo: extender`); `app/cola.py`; `app/mcp_servidor.py` (`extender`); `app/guia/` (sección propia).

## Fases (✅ al terminar, con commit)
1. ✅ **El servidor:** `extender.py`, latentes en Generar, cola y rutas; `pruebas.py` con su sección; el grafo valida contra `/object_info`.
2. ✅ **La página:** pestañas en Retocar, línea de tiempo (original · solape resaltado · lo nuevo en otro color, con sus segundos), tiradores con el mismo tacto que Retocar, calidad, audio, prompt con referencias y semilla, encolar.
3. ✅ **MCP y guía:** herramienta `extender`, sección en la guía, «✎ agente» en la pestaña.
4. ⬜ **Pruebas reales** (3060, baja resolución, 22–39 f nuevos): un video de la app con latente y un mp4; hoja de la unión.
5. ⬜ **Cierre:** LEEME, este plano, avisos.

## Huecos conocidos
- (se completa al probar)
