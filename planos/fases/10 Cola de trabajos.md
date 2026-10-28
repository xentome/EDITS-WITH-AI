# Fase 10 · Cola de trabajos

Lectura: 2 min · 27 oct 2026 · Para los ayudantes y para retomar si se corta.

**En resumen**
- Generar y Retocar ya no lanzan directo: se encolan y el servidor los hace de uno en uno (una sola GPU), aunque la página esté cerrada. El usuario puede dejar la app «chambeando» sola: por ejemplo, el mismo edit con 5 semillas.
- Cada trabajo guarda al encolarse una **foto fija**: para Generar, los valores de todos los nodos del proyecto (prompt, referencias, canción, resolución, audio de salida) y la semilla; para Retocar, sus datos (video, tramo, máscara, referencias, prompt, semilla, resolución). Seguir editando no cambia lo encolado.
- La cola vive en `app/salidas/cola.json` (fuera de git; `MAX_EDITOR_COLA` cambia la ruta para probar). Al reiniciar el servidor, lo que corría se busca en el historial de ComfyUI por su prompt_id: si terminó, se recoge su video; si sigue en ComfyUI, se espera; si no, queda «interrumpido» y se puede reintentar.
- El hilo de la cola empieza el siguiente solo si no hay otro corriendo, no está en pausa, el LLM local no trabaja y la cola de ComfyUI está vacía. Si uno falla, sigue con el siguiente.

## Rutas (app/servidor.py → app/cola.py)
- `POST /app/cola {tipo: generar | retocar, valores | datos, semilla, proyecto, n}` → `{ids}` (con n > 1, semillas aleatorias distintas).
- `GET /app/cola` → `{pausada, trabajos}` · `GET /app/cola/<id>`.
- `POST /app/cola/<id>/cancelar | subir | bajar | reintentar | quitar` · `POST /app/cola/limpiar` · `POST /app/cola/pausar {pausada}`.
- Estados: en_cola · corriendo · hecho · error · cancelado · interrumpido (recuperando, mientras se mira ComfyUI).

## Fases (✅ al terminar, con commit)
1. ✅ **El servidor:** `app/cola.py`, rutas, foto fija, disco, recuperar al reiniciar, LLM y ComfyUI ocupados; `pruebas/generar_simulado.py` para probar sin GPU (`MAX_EDITOR_GENERAR=simulado`, `MAX_EDITOR_SIMULADO_S`).
2. ✅ **La página:** Generar y Retocar encolan; «Encolar ×N»; el panel «Cola» con sus acciones; aviso opcional al terminar. Lista en orden de ejecución (lo que corre arriba, luego lo que espera, luego lo terminado).
3. ✅ **La prueba real (27 oct):** 3 Generar de 22 f (semillas 11, 22, 33) en orden, de uno en uno, con la cola de ComfyUI vacía: 150 s, 132 s y el segundo recogido de ComfyUI tras reiniciar el servidor a mitad (`recuperando` → `hecho`). Los tres, 960×544 y 22 f.

## Huecos conocidos
- Un trabajo recogido tras reiniciar anota solo los segundos desde el reinicio.
- Retocar con cola se probó en la página (botón y foto fija), no con un retoque real de H3.
