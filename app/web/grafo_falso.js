/* El «grafo de mentira» de MAX EDITOR: la ventana del nodo (web/editor_core.js) lee y escribe el workflow por app.graph, como
 * en el lienzo de ComfyUI. Aquí se arma ese mismo objeto desde la plantilla en formato API (GET /app/plantilla) y los valores
 * de un proyecto, sin LiteGraph. Plano: ../../planos/fases/6 La app MAX EDITOR.md, «El grafo de mentira».
 * Lo que la ventana usa (web/editor/util.js, referencias.js, duracion.js, resolucion.js, audio.js):
 *   graph._nodes, graph.links (Map: id → {origin_id, origin_slot, target_id, target_slot}), graph.getNodeById(id);
 *   cada nodo: id, type, title, widgets [{name, value, callback, options}], inputs [{name, link}], outputs [{links}].
 * En formato API, cada entrada [origen, salida] es un enlace; las demás son campos (widgets). */

const esEnlace = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "number";
const idDe = (x) => (/^\d+$/.test(String(x)) ? +x : String(x));
const copia = (v) => (v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);

/* plantilla: {id: {class_type, inputs, _meta}}; valores: {id: {campo: valor}} (lo guardado en el proyecto). */
export function construir(plantilla, valores = {}) {
  const nodos = [], links = new Map(), porId = new Map();
  let siguiente = 1;
  for (const [id, def] of Object.entries(plantilla || {})) {
    if (!def?.class_type) continue;
    const n = { id: idDe(id), type: def.class_type, title: def._meta?.title || def.class_type, widgets: [], inputs: [], outputs: [],
                setDirtyCanvas() {} };
    for (const [nombre, v] of Object.entries(def.inputs || {})) {
      if (esEnlace(v)) n.inputs.push({ name: nombre, link: null, _origen: v });
      else n.widgets.push({ name: nombre, value: copia(v), callback: null, options: nombre === "audio" ? { values: [] } : {} });
    }
    nodos.push(n);
    porId.set(String(n.id), n);
  }
  // los enlaces, cuando ya existen todos los nodos (el origen puede venir después en la plantilla)
  for (const n of nodos) {
    n.inputs.forEach((inp, slot) => {
      const origen = porId.get(String(inp._origen[0]));
      const salida = inp._origen[1];
      delete inp._origen;
      if (!origen) return;
      const l = { id: siguiente++, origin_id: origen.id, origin_slot: salida, target_id: n.id, target_slot: slot };
      links.set(l.id, l);
      inp.link = l.id;
      while (origen.outputs.length <= salida) origen.outputs.push({ links: [] });
      origen.outputs[salida].links.push(l.id);
    });
  }
  ponerValores({ _nodes: nodos }, valores);
  return { _nodes: nodos, links, getNodeById: (id) => porId.get(String(id)) || null, setDirtyCanvas() {} };
}

/* Pone los valores de un proyecto encima: solo en nodos y campos que existen (un proyecto de otra plantilla no rompe nada). */
export function ponerValores(graph, valores = {}) {
  for (const n of graph._nodes) {
    const v = valores[String(n.id)];
    if (!v) continue;
    for (const w of n.widgets) if (Object.prototype.hasOwnProperty.call(v, w.name)) w.value = copia(v[w.name]);
  }
}

/* {id: {campo: valor}} de todos los campos del grafo: lo que se guarda en el proyecto o se manda a generar. Con `base`
 * (la plantilla), solo lo que cambió respecto a ella: el proyecto no guarda los modelos ni lo que no se tocó. */
export function valoresDe(graph, base = null) {
  const out = {};
  for (const n of graph._nodes) {
    const ins = base?.[String(n.id)]?.inputs;
    for (const w of n.widgets) {
      if (w.value === undefined) continue;
      if (ins && JSON.stringify(ins[w.name]) === JSON.stringify(w.value)) continue;
      (out[String(n.id)] ||= {})[w.name] = copia(w.value);
    }
  }
  return out;
}

// el nodo que abre la ventana
export const nodoDelEdit = (graph) => graph._nodes.find((n) => n.type === "PromptDelEdit") || null;
export const nodoPorTipo = (graph, tipo) => graph._nodes.find((n) => n.type === tipo) || null;
export const campo = (n, nombre) => n?.widgets.find((w) => w.name === nombre) || null;
