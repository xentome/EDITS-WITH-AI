/* «Prompt del edit (LLM)» — botón «Abrir editor…» en el nodo y ajuste del idioma. La ventana vive en editor_core.js y se
 * carga de nuevo cada vez que se abre (así un cambio en ella se ve sin recargar ComfyUI). Planos: ../planos/4 El editor.md.
 * Este archivo se carga una sola vez, al abrir la página: un cambio aquí pide recargar la pestaña.
 * Idioma (planos/2, «Dos idiomas»): el ajuste «Prompt del edit › Idioma» (auto / Español / English) lo cambian el diálogo
 * de ajustes de ComfyUI y el botón «ES | EN» de la ventana. Al cambiar, se rotulan de nuevo los nodos y se avisa a la
 * ventana abierta con el evento EVENTO. El nombre del nodo y de sus entradas los traduce ComfyUI (locales/), con Comfy.Locale. */
import { app } from "../../scripts/app.js";
import { AJUSTE, EVENTO, cargarTextos, idiomaElegido, traductor } from "./editor/i18n.js";

const NODO = "PromptDelEdit";
let textos = { es: {}, en: {} }, tr = traductor(textos, "es");
const t = (clave, datos) => tr.t(clave, datos);

function ocultar(node, nombre) {
  const w = node.widgets?.find((w) => w.name === nombre);
  if (!w) return;
  w.hidden = true;
  w.computeSize = () => [0, -4];
  w.type = "hidden";
  if (w.inputEl) w.inputEl.style.display = "none";
  if (w.element) w.element.style.display = "none";
}

// lo que el nodo enseña con nuestro idioma: el botón y las ayudas de los campos de texto (ComfyUI no las traduce)
const AYUDAS = { idea: "comun.idea_ayuda", palabras: "nodo.palabras.placeholder", texto_bloqueado: "nodo.texto_bloqueado.placeholder" };
function rotular(node) {
  for (const w of node.widgets || []) {
    if (w._eplAbrir) w.label = t("nodo.abrir_editor");
    const clave = AYUDAS[w.name];
    if (!clave) continue;
    w.options = { ...(w.options || {}), placeholder: t(clave) };
    const caja = w.inputEl || w.element;
    if (caja && "placeholder" in caja) caja.placeholder = t(clave);
  }
  node.setDirtyCanvas?.(true, true);
}
const rotularTodos = () => (app.graph?._nodes || []).filter((n) => n.type === NODO).forEach(rotular);

// el idioma cambió (ajuste o botón ES | EN): se rotulan los nodos y se avisa a la ventana abierta
function alCambiarIdioma() {
  tr = traductor(textos, idiomaElegido(app));
  rotularTodos();
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { idioma: tr.idioma } }));
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
  // el nombre, la ayuda y las opciones los traduce ComfyUI con locales/<idioma>/settings.json (i18n.py); aquí, los de reserva
  settings: [{
    id: AJUSTE, category: ["Prompt del edit", "Idioma"], type: "combo", defaultValue: "auto",
    name: "Idioma / Language", tooltip: "auto = Comfy.Locale",
    options: [{ text: "auto", value: "auto" }, { text: "es", value: "es" }, { text: "en", value: "en" }],
    onChange: () => alCambiarIdioma(),
  }],
  async init() {
    textos = await cargarTextos();
    tr = traductor(textos, idiomaElegido(app));
  },
  async setup() {
    tr = traductor(textos, idiomaElegido(app));
    rotularTodos();
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODO) return;
    const creado = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = creado?.apply(this, arguments);
      ocultar(this, "estado");
      // cambiar «duracion_s» en el nodo pone también el length de H3 y la duración del Prompt Builder (editor/duracion.js)
      const wd = this.widgets?.find((w) => w.name === "duracion_s");
      if (wd) {
        const antes = wd.callback;
        wd.callback = function (v) {
          const r = antes?.apply(this, arguments);
          import(new URL("./editor/duracion.js", import.meta.url).href + "?v=" + Date.now()).then((m) => {
            const d = m.aplicarDuracion(app.graph, +wd.value);
            if (d.cambios.length) app.extensionManager?.toast?.add?.({ severity: "info", summary: t("duracion.aviso.titulo"),
              detail: t("duracion.aviso.detalle", { f: d.fotogramas, s: tr.num(d.segundos, 3),
                                                     cambios: d.cambios.map((c) => m.textoCambio(c, tr)).join(" · ") }), life: 6000 });
          }).catch((e) => console.error("[Prompt del edit] duración:", e));
          return r;
        };
      }
      // el nombre interno no se ve: el botón enseña su label, en el idioma elegido (rotular)
      const boton = this.addWidget("button", "abrir_editor", null, () => abrirEditor(this));
      boton._eplAbrir = true;
      rotular(this);
      return r;
    };
    /* Workflows de antes de quitar las recetas: sus valores empiezan por la receta («city pop») y todos los demás
     * irían un sitio corridos. Se quita ese primer valor (y se recuerda, para avisar en el editor). planos/3. */
    const configurar = nodeType.prototype.configure;
    nodeType.prototype.configure = function (info) {
      const v = info?.widgets_values;
      if (Array.isArray(v) && v.length >= 3 && typeof v[0] === "string" && typeof v[1] === "string" && typeof v[2] === "number") {
        this._eplRecetaVieja = v[0];
        info = { ...info, widgets_values: v.slice(1) };
      }
      return configurar.call(this, info);
    };
    const dobleClic = nodeType.prototype.onDblClick;
    nodeType.prototype.onDblClick = function () {
      abrirEditor(this);
      return dobleClic?.apply(this, arguments) ?? true;
    };
  },
});
