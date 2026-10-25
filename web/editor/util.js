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

/* llama a una acción del servidor. `tr` (el traductor de la ventana, i18n.js) manda el idioma en cada llamada: el servidor
 * responde sus errores y avisos en ese idioma. */
export async function api(ruta, cuerpo, tr = null) {
  const idioma = tr?.idioma || "es";
  const r = await fetch("/edit_prompt_llm/" + ruta + (cuerpo === undefined ? "?idioma=" + idioma : ""), cuerpo === undefined ? undefined :
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, idioma }) });
  const j = await r.json().catch(() => ({ error: tr ? tr.t("errores.respuesta_no_valida", { estado: r.status }) : String(r.status) }));
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

// dirección de una foto: de un RefMod (su vista previa) o de un archivo del Media Loader («minimax_h3/x.jpg [input]»)
export const vistaRefmod = (nombre) => nombre ? `/minimax_h3/refmods/preview?name=${encodeURIComponent(nombre)}` : "";
export function vistaMedio(file) {
  const rel = (file || "").replace(/ \[input\]$/, ""), i = rel.lastIndexOf("/");
  return rel ? `/view?filename=${encodeURIComponent(rel.slice(i + 1))}&subfolder=${encodeURIComponent(i > 0 ? rel.slice(0, i) : "")}&type=input` : "";
}
