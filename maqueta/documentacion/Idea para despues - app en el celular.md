# Idea para después: la app que se abre en el celular

Lectura: 2 min · 24 oct 2026 · 💡 Idea guardada, sin construir. Por ahora la interfaz se hace como nodo de ComfyUI.

**En resumen**
- Sería como una tiendita que atiende por una ventana: el PC cocina y el celular es el mostrador.
- El trabajo pesado (el LLM, ComfyUI y H3) se queda en el PC. El celular solo pide cosas y ve los resultados.
- Se conecta por Tailscale, como el pizarrón.

## Cómo sería, como para un niño

En el PC se queda trabajando un servidor pequeño que es el **cocinero**: `nucleo.py`, el LLM y ComfyUI con H3.

La pantalla de la maqueta es el **mostrador**: una página web que abres en el celular por Tailscale y que solo pide cosas como «escribe la historia», «haz esta cajita» o «renderiza».

El cocinero lo hace en el PC y te devuelve lo que pediste: el prompt, las fotos o el video.

## Qué habría que enseñarle al cocinero

1. **Guardar cada proyecto en su carpeta.** Las fotos, las cajitas, las tomas y la canción de cada edit irían en carpetas propias, en vez de leerse del workflow de ComfyUI, como hace el nodo ahora.
2. **Armar el workflow por detrás.** Cuando toque renderizar, el servidor le manda a ComfyUI el workflow completo, con las referencias, el prompt y el audio, y espera el video.
3. **Fabricar las cajitas.** Crear un RefMod de varias fotos lo hace la GPU con la herramienta de Fantastic. El servidor la llama y avisa al celular cuando termina.
4. **Avisar del progreso.** El LLM y los renders tardan minutos, así que el celular tiene que ver «escribiendo la historia…» o «renderizando 40 %…».

## Lo que ya tenemos y se reutiliza

- **El motor:** `nucleo.py`, que escribe la historia y las tomas, revisa y monta el prompt. No depende de la pantalla.
- **Las rutas del servidor** del editor (`/edit_prompt_llm/<acción>`).
- **La maqueta** del pizarrón, como base del mostrador.
- **Tailscale,** que ya funciona para abrir páginas del PC en el celular.

## Por qué no ahora

Como nodo de ComfyUI se experimenta más rápido: el workflow ya tiene el Stack, el audio y el render conectados. La app del celular conviene cuando la pantalla esté decidida.
