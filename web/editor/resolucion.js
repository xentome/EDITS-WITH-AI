/* Resolución del video, arriba en el centro de la ventana: el ancho y el alto (uno encima del otro), un botón ⇅ a la
 * izquierda que los intercambia (horizontal ↔ vertical) y, a la derecha, los megapíxeles (de 0,1 a 2): al escribirlos
 * se calculan el ancho y el alto con la misma proporción. H3 trabaja en múltiplos de 32, así que todo se redondea a 32
 * (1 MP en vertical = 768×1344). Se escribe al momento en los nodos MiniMaxH3 que tienen «width» y «height» (el Text
 * Encode de Fantastic…), buscados por su tipo, como la duración (duracion.js). Un campo enlazado desde otro nodo no se toca.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md. */

export const PASO = 32, MP_MIN = 0.1, MP_MAX = 2;
export const redondear = (x) => Math.max(PASO * 2, Math.round((+x || 0) / PASO) * PASO);
// ancho y alto con la proporción ancho/alto `prop` y unos `mp` megapíxeles, en múltiplos de 32
export function medidas(mp, prop) {
  const m = Math.min(MP_MAX, Math.max(MP_MIN, +mp || 1)) * 1e6, p = prop > 0 ? prop : 9 / 16;
  const alto = Math.sqrt(m / p);
  return { ancho: redondear(alto * p), alto: redondear(alto) };
}
export const megapixeles = (ancho, alto) => Math.round(ancho * alto / 1e4) / 100;

const enlazado = (n, nombre) => (n.inputs || []).some((i) => i.widget?.name === nombre && i.link != null);
// los nodos del workflow con ancho y alto del video
export function nodosConTamano(graph) {
  return (graph?._nodes || []).filter((n) => /^MiniMaxH3/.test(n.type) && (n.widgets || []).some((w) => w.name === "width")
                                             && (n.widgets || []).some((w) => w.name === "height"));
}
export function leerTamano(graph) {
  const n = nodosConTamano(graph)[0];
  if (!n) return null;
  return { ancho: +n.widgets.find((w) => w.name === "width").value, alto: +n.widgets.find((w) => w.name === "height").value };
}
export function ponerTamano(graph, ancho, alto) {
  for (const n of nodosConTamano(graph)) {
    for (const [nombre, v] of [["width", ancho], ["height", alto]]) {
      const w = n.widgets.find((x) => x.name === nombre);
      if (!w || enlazado(n, nombre) || w.value === v) continue;
      w.value = v;
      try { w.callback?.(v); } catch { /* el nodo no necesita enterarse */ }
    }
    n.setDirtyCanvas?.(true, true);
  }
  graph?.setDirtyCanvas?.(true, true);
}

/* Añade ctx.panelResolucion(): el panel (se vuelve a crear al pintar la cabecera). Usa de ctx: u, graph, avisar,
 * programarGuardado. */
export function instalar(ctx) {
  const { u, graph } = ctx;
  const { el, t } = u;
  ctx.panelResolucion = function panelResolucion() {
    const actual = leerTamano(graph);
    if (!actual) return el("span", { class: "epl-ayuda" }, t("resolucion.sin_nodo"));
    let { ancho, alto } = actual;
    const iAncho = el("input", { type: "number", step: PASO, min: PASO * 2, class: "corto", "data-campo": "ancho", value: ancho });
    const iAlto = el("input", { type: "number", step: PASO, min: PASO * 2, class: "corto", "data-campo": "alto", value: alto });
    const iMp = el("input", { type: "number", step: 0.1, min: MP_MIN, max: MP_MAX, class: "corto", "data-campo": "mp",
                              value: megapixeles(ancho, alto) });
    const aplicar = (a, b) => {
      ancho = redondear(a); alto = redondear(b);
      iAncho.value = ancho; iAlto.value = alto; iMp.value = megapixeles(ancho, alto);
      ponerTamano(graph, ancho, alto);
      ctx.avisar(t("resolucion.puesta", { ancho, alto, mp: u.num(megapixeles(ancho, alto), 2) }), "bien");
      ctx.programarGuardado?.();
    };
    iAncho.addEventListener("change", () => aplicar(iAncho.value, alto));
    iAlto.addEventListener("change", () => aplicar(ancho, iAlto.value));
    iMp.addEventListener("change", () => { const m = medidas(iMp.value, ancho / alto); aplicar(m.ancho, m.alto); });
    // una etiqueta de cinta en una sola fila (27 oct): RESOLUCIÓN · Ancho [960] × Alto [544] · [0,52] MP · ⇅ Girar
    return el("div", { class: "epl-resolucion", title: t("resolucion.tooltip") },
      el("span", { class: "epl-res-tit" }, t("resolucion.titulo")),
      el("label", { class: "epl-res-campo" }, el("span", {}, t("resolucion.ancho")), iAncho),
      el("span", { class: "epl-res-por", "aria-hidden": "true" }, "×"),
      el("label", { class: "epl-res-campo" }, el("span", {}, t("resolucion.alto")), iAlto),
      el("label", { class: "epl-res-campo epl-res-mp" }, iMp, el("span", {}, "MP")),
      el("button", { class: "epl-mini epl-girar", title: t("resolucion.girar.tooltip"), onclick: () => aplicar(alto, ancho) },
        u.icono("girar"), " " + t("resolucion.girar")));
  };
}
