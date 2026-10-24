/* Editor de «Prompt del edit (LLM)»: la interfaz nueva (maqueta/interfaz.html). Planos: ../planos/4 El editor.md.
 * Una sola pantalla con 5 partes, de arriba abajo:
 *   1 · Historia general (idea, arco, luz y ambiente, fondo)        → editor/plan.js
 *   2 · Prompt de la toma elegida (su línea [Shot n] y sus campos)   → editor/plan.js
 *   3 · Referencias en dos mitades: lo que no cambia (rojo) y lo que se presta (azul), con cajitas
 *                                                                     → editor/referencias.js y editor/cajitas.js
 *   4 · Línea de tiempo (una cajita por toma, ancho = duración)      → editor/linea.js
 *   5 · Prompt final (lo que recibe H3)                              → editor/final.js
 * El trabajo lo hace el servidor (rutas /edit_prompt_llm/*, nucleo.py); aquí solo se muestra, se edita y se guarda.
 * Este archivo solo junta las piezas de editor/. Todas comparten un objeto «ctx» con el estado (S), las referencias del
 * workflow (wf) y las funciones de cada pieza. Se vuelve a cargar cada vez que se abre la ventana: editor.js lo importa
 * con «?v=…» y aquí se pasa el mismo «?v=…» a cada pieza, así un cambio en cualquiera se ve al reabrir sin recargar. */

export async function abrir(node, app) {
  const v = new URL(import.meta.url).search;
  const pieza = (nombre) => import(new URL(`./editor/${nombre}.js${v}`, import.meta.url).href);
  const [u, estilos, referencias, cajitas, plan, linea, final] = await Promise.all(
    ["util", "estilos", "referencias", "cajitas", "plan", "linea", "final"].map(pieza));
  const { el, W, leerJSON, api } = u;

  document.getElementById("epl-css")?.remove();
  document.head.append(el("style", { id: "epl-css" }, estilos.CSS));
  document.querySelector(".epl-fondo")?.remove();

  const graph = app.graph;
  const guardado = leerJSON(W(node, "estado")?.value, {});
  const wf = referencias.referenciasDelWorkflow(u, graph, node);
  const S = {
    receta: W(node, "receta").value, idea: W(node, "idea").value, tomas: +W(node, "tomas").value,
    duracion: +W(node, "duracion_s").value, palabras: W(node, "palabras").value, semilla: +W(node, "semilla_llm").value,
    refs: guardado.refs || {}, plan: plan.ajustarPlan(guardado.plan, +W(node, "tomas").value),
    prompt: guardado.prompt || "", a_mano: !!guardado.a_mano, cortes: [], avisos: [], ocupado: false, elegida: null,
  };

  const fondo = el("div", { class: "epl-fondo" });
  const caja = el("div", { class: "epl-caja" });
  fondo.append(caja);
  const estado = el("span", { class: "epl-estado" });
  const sec = (clase) => el("section", { class: "epl-sec " + clase });
  const secHistoria = sec("epl-s-historia"), secToma = sec("epl-s-toma"), secRefs = sec("epl-refs"),
        secLinea = sec("epl-s-linea"), secFinal = sec("epl-s-final");

  const ctx = { u, node, app, graph, S, wf, recetas: {}, biblioteca: {}, cajitas: {}, caja,
                secHistoria, secToma, secRefs, secLinea, secFinal, ajustarPlan: plan.ajustarPlan };
  ctx.avisar = (texto, tipo = "") => { estado.textContent = texto; estado.className = "epl-estado " + tipo; };
  // lo que se manda al servidor: solo las referencias con papel (fotos y videos; una cajita es un <Video N>)
  const entradas = () => ({
    idea: S.idea, tomas: S.tomas, duracion: S.duracion, palabras: S.palabras,
    refs: Object.fromEntries(wf.lista.map((r) => [r.tag, S.refs[r.clave]]).filter(([, x]) => x && x.papel && x.papel !== "no")),
  });
  ctx.cuerpo = (extra = {}) => ({ receta: S.receta, entradas: entradas(), plan: S.plan, audio: wf.audio, semilla: S.semilla, ...extra });

  // ---- montar (sin LLM) cada vez que cambia algo, salvo si el prompt final se editó a mano
  let espera = null;
  ctx.pedirMontaje = () => {
    clearTimeout(espera);
    espera = setTimeout(async () => {
      try {
        const r = await api("montar", ctx.cuerpo());
        S.cortes = r.cortes;
        S.avisos = r.avisos;
        if (!S.a_mano) S.prompt = r.prompt;
        ctx.pintarFinal();
        ctx.pintarLinea();
        ctx.pintarLineaToma();
      } catch (e) { ctx.avisar("No se pudo montar: " + e.message, "mal"); }
    }, 350);
  };

  referencias.instalar(ctx);
  cajitas.instalar(ctx);
  plan.instalar(ctx);
  linea.instalar(ctx);
  final.instalar(ctx);

  try { ctx.recetas = await api("recetas"); } catch (e) { wf.avisos.push("No pude leer las recetas: " + e.message); }
  await ctx.cargarBiblioteca();
  ctx.prepararRefs(guardado);
  document.body.append(fondo);

  // ---- guardar en el nodo
  function guardar() {
    W(node, "idea").value = S.idea;
    W(node, "tomas").value = S.tomas;
    W(node, "duracion_s").value = S.duracion;
    W(node, "palabras").value = S.palabras;
    W(node, "semilla_llm").value = S.semilla;
    W(node, "receta").value = S.receta;
    W(node, "estado").value = JSON.stringify({ v: 3, refs: S.refs, etiquetas: ctx.mapaEtiquetas(), plan: S.plan, prompt: S.prompt,
                                               a_mano: S.a_mano, guardado: new Date().toISOString() });
    node.setDirtyCanvas?.(true, true);
    graph.setDirtyCanvas?.(true, true);
    try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch { /* sin seguimiento de cambios */ }
  }
  ctx.guardarYAvisar = () => {
    guardar();
    ctx.avisar(S.avisos.length ? "Guardado, con huecos en el prompt" : "Guardado en el nodo (guarda el workflow con Ctrl+S)",
               S.avisos.length ? "mal" : "bien");
  };
  const cerrar = () => { fondo.remove(); document.removeEventListener("keydown", tecla, true); };
  // Escape cierra la ventana de encima (ficha, cajita, biblioteca); no cierra el editor, para no perder cambios
  const tecla = (e) => { if (e.key === "Escape" && caja.querySelector(".epl-capa")) { e.stopPropagation(); caja.querySelector(".epl-capa").remove(); } };
  document.addEventListener("keydown", tecla, true);

  caja.append(
    el("div", { class: "epl-cabecera" }, el("b", {}, "Editor del edit"), estado,
      el("button", { class: "epl-boton", onclick: () => ctx.guardarYAvisar() }, "Guardar"),
      el("button", { class: "epl-boton", onclick: () => { guardar(); cerrar(); } }, "Guardar y cerrar"),
      el("button", { class: "epl-x", title: "Cerrar sin guardar", onclick: cerrar }, "✕")),
    el("div", { class: "epl-cuerpo" }, secHistoria, secToma, secRefs, secLinea, secFinal));
  ctx.pintarPlan();
  ctx.pintarRefs();
  ctx.pintarFinal();
  ctx.pedirMontaje();
  ctx.avisar(wf.audio ? `Audio: ${wf.audio}` : "Sin audio conectado: cortes parejos");
  return ctx;
}
