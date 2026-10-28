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
/* iconos de trazo (27 oct, en vez de emojis): un <span class="epl-ic"> con un SVG de 24×24 en un solo trazo, que toma el
 * color y el tamaño de la letra (su CSS, en app/web/index.html y en estilos.js). nombre: una clave de ICONOS. */
const ICONOS = {
  accion: "M3 12h4l3-8 4 16 3-8h4", enlace: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  efecto: "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5",
  encuadre: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5", camara: "M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5", luz: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  estilo: "M14.5 4.5l5 5L9 20H4v-5zM12.5 6.5l5 5", sonido: "M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  candado: "M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11", abierto: "M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2",
  x: "M6 6l12 12M18 6L6 18", mas: "M12 5v14M5 12h14", rehacer: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7", volver: "M4 13a8 8 0 1 0 2.3-5.7M4 4v7h7",
  play: "M8 5l11 7-11 7z", pausa: "M8 5v14M16 5v14", semilla: "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  video: "M3 5h18v14H3zM7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4", subir: "M12 16V4M7 9l5-5 5 5M4 20h16",
  musica: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", carpeta: "M3 6h6l2 2h10v11H3z",
  ojo: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", tijeras: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9L20 20M8.1 16.1L20 4",
  lapiz: "M15 4l5 5L9 20H4v-5zM13 6l5 5", girar: "M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4", atras: "M15 18l-6-6 6-6", adelante: "M9 6l6 6-6 6", arriba: "M18 15l-6-6-6 6", abajo: "M6 9l6 6 6-6", retoque: "M4 20l6-6M14 4l6 6-8 8-6-6z", menu: "M4 7h16M4 12h16M4 17h16",
};
export function icono(nombre) {
  const s = document.createElement("span");
  s.className = "epl-ic";
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = `<svg viewBox="0 0 24 24"><path d="${ICONOS[nombre] || ICONOS.mas}"/></svg>`;
  return s;
}
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
