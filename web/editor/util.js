/* Utilidades del editor: crear elementos, leer campos del nodo, seguir enlaces del grafo y llamar al servidor.
 * Solo exporta funciones: ComfyUI importa todos los .js de web/, así que importar este archivo no debe hacer nada. */

export const el = (tag, props = {}, ...hijos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "style") Object.assign(e.style, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined) e.append(h.nodeType ? h : document.createTextNode(h));
  return e;
};
export const W = (node, nombre) => node.widgets?.find((w) => w.name === nombre);
export const enlace = (graph, id) => (graph.links?.get ? graph.links.get(id) : graph.links?.[id]);
export const leerJSON = (t, otro) => { try { return t ? JSON.parse(t) : otro; } catch { return otro; } };

export async function api(ruta, cuerpo) {
  const r = await fetch("/edit_prompt_llm/" + ruta, cuerpo === undefined ? undefined :
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({ error: `respuesta no válida (${r.status})` }));
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}

export function origen(graph, node, entrada) {
  const inp = node.inputs?.find((i) => i.name === entrada);
  const l = inp?.link != null ? enlace(graph, inp.link) : null;
  return l ? graph.getNodeById(l.origin_id) : null;
}

export function destinos(graph, node, salida) {
  return (node.outputs?.[salida]?.links || []).map((id) => enlace(graph, id)).filter(Boolean)
    .map((l) => graph.getNodeById(l.target_id)).filter(Boolean);
}
