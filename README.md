# EDITS WITH AI (nombre provisional)

Base de una app de edits musicales con IA local: **MiniMax H3** en ComfyUI y un **LLM local** (Qwen3.8 en llama.cpp).

- **El nodo** «Prompt del edit (LLM)»: convierte una idea en el prompt de H3. El LLM escribe la historia y las tomas, y el código pone los tiempos en los beats, las frases probadas y la revisión. Tiene un editor de 3 columnas dentro de ComfyUI.
- **La maqueta** (`maqueta/`): un pizarrón web donde se diseña la interfaz nueva.

**Empieza por [PLANOS.md](PLANOS.md)**: es una página, con enlaces a los planos de cada parte.
Comprobación rápida después de cualquier cambio: `python pruebas.py`.

## Licencia y avisos
- El código de este repositorio es **Apache-2.0** (ver `LICENSE`).
- **MiniMax H3 tiene su propia licencia: su uso comercial necesita una licencia aparte de MiniMax.**
- Modelos usados: `MODELOS.md`. Autores de los nodos y herramientas: `CREDITOS.md`.
- Workflow de ejemplo: `workflows/`.
