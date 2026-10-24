/* «Prompt del edit (LLM)» — botón «Abrir editor…» en el nodo. La ventana vive en editor_core.js y se carga de nuevo
 * cada vez que se abre (así un cambio en ella se ve sin recargar ComfyUI). Planos: ../planos/4 El editor.md. */
import { app } from "../../scripts/app.js";

const NODO = "PromptDelEdit";

function ocultar(node, nombre) {
  const w = node.widgets?.find((w) => w.name === nombre);
  if (!w) return;
  w.hidden = true;
  w.computeSize = () => [0, -4];
  w.type = "hidden";
  if (w.inputEl) w.inputEl.style.display = "none";
  if (w.element) w.element.style.display = "none";
}

export async function abrirEditor(node) {
  try {
    const m = await import(new URL("./editor_core.js", import.meta.url).href + "?v=" + Date.now());
    m.abrir(node, app);
  } catch (err) {
    console.error("[Prompt del edit] no se pudo abrir el editor:", err);
  }
}

app.registerExtension({
  name: "EditPromptLLM.Editor",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODO) return;
    const creado = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = creado?.apply(this, arguments);
      ocultar(this, "estado");
      this.addWidget("button", "Abrir editor…", null, () => abrirEditor(this));
      return r;
    };
    const dobleClic = nodeType.prototype.onDblClick;
    nodeType.prototype.onDblClick = function () {
      abrirEditor(this);
      return dobleClic?.apply(this, arguments) ?? true;
    };
  },
});
