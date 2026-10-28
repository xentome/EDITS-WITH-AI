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
4. ✅ **Pruebas reales (28 oct, RTX 3060, «borrador rápido», 39 f de solape):**
   - Backend por línea de órdenes: video de la app de 22 f, solape 22 + 17 nuevos, desde el mp4 → 216 s, guardó su latente.
   - **Encadenada desde el latente** (por el MCP, como agente; la pestaña la cargó con «✎ agente»): 39 + 34 f a 384×672 → 230 s. Unión limpia: salto 2,9 frente a 1,6–2,1 de un paso normal; mismo brillo. Al final, H3 metió un corte a un primer plano sin el texto (esa prueba aún no llevaba la referencia automática).
   - **mp4 de fuera** (1280×768, 10 s): la primera vez, con el prompt vacío y sin referencias, conservó el solape pero lo nuevo fue **otra escena** (un cuerpo sin cara: contenido que nadie pidió; borrado). Arreglo: el último fotograma va siempre como referencia y el prompt por defecto la cita (misma persona, misma ropa, mismo sitio). Repetida con la misma semilla → sigue la toma (la misma chica, el texto y la cámara), 222 s; salto en la unión 2,1 frente a 0,2–0,3 (lo nuevo sale más blando en «rápido», subido a 1280×768); brillo 45,1 → 43,8.
   - Hojas en `~/Escritorio/research_notes/extender_video/prueba_app/`.
5. ✅ **Cierre:** LEEME, CREDITOS, este plano, avisos.

## Huecos conocidos
- **Sin probar con la canción de un proyecto** (la guía con `MiniMaxH3AddGuide` y la canción encima) ni a la calidad «original» a 1 MP: el grafo valida y la unión de audio pasa en `pruebas.py` (19), pero falta un render real.
- **Sin probar un Generar real con el latente:** el `MpiSaveLatent` entra bien en el grafo de Generar y valida en seco.
- El avance de un trabajo con `MpiSaveLatent` se estima por el tiempo: ese nodo pide su latente de forma perezosa y el proxy lo da como «nodo actual» todo el rato, sin pasos.
- **El arreglo de la unión del VAE** (decodificar el latente del original con las 5 fichas nuevas siguientes, de xmarre) no está hecho: puede quedar un escalón muy leve en los 5 fotogramas antes de la unión.
- Una extensión recogida tras reiniciar el servidor no anota su latente (la siguiente pasa por el mp4).
- Los latentes se acumulan en `ComfyUI/output/latents/` (unos 1–40 MB cada uno); no hay limpieza automática.
- El modelo Singularity con un prompt pobre puede inventar contenido: por eso el último fotograma va siempre como referencia. Si vuelve a pasar, la primera palanca son las referencias del proyecto.
