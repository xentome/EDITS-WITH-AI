/* Columna 1 del editor: REFERENCIAS. Lee el RefMod Stack y el Media Loader del workflow, guarda papel/nombre/ficha
 * de cada referencia por su clave, cambia el Stack, abre la biblioteca de RefMods y pide la ficha con visión.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Las utilidades llegan en ctx.u, sin imports, para que
 * este archivo también se recargue al abrir la ventana. Planos: ../../planos/4 El editor.md. */

const PAPELES = [["personaje", "personaje / atuendo"], ["pose", "pose"], ["fondo", "fondo"], ["estilo", "estilo"],
                 ["no", "no usar"]];
const CONCEPTO = { identity: "personaje", clothing: "personaje", pose_motion: "pose", pose: "pose", background: "fondo",
                   scene: "fondo", style: "estilo" };

/* Numeración igual que el Text Encode: primero los medios del Media Loader, después las tarjetas activas del Stack,
 * un contador por tipo (Picture / Video). */
export function referenciasDelWorkflow(u, graph, node) {
  const { W, leerJSON, origen, destinos } = u;
  const pb = destinos(graph, node, 0).find((n) => n.type === "MiniMaxH3PromptBuilder");
  const stack = (pb && origen(graph, pb, "mods")) || graph._nodes.find((n) => n.type === "MiniMaxH3RefModStack");
  const loader = pb && origen(graph, pb, "references");
  // items: todo lo que se ve en la columna (también las tarjetas apagadas, sin etiqueta); lista: solo lo que recibe H3.
  // Cada referencia se identifica por su «clave» (nombre del RefMod o del medio), no por su número: así el papel y la
  // ficha la siguen aunque cambie el orden.
  const items = [], avisos = [];
  let fotos = 0, videos = 0;
  for (const it of leerJSON(loader?.widgets?.[0]?.value, []) || []) {
    if (it.on === false) continue;
    const tag = it.kind === "picture" ? `<Picture ${++fotos}>` : it.kind === "video" ? `<Video ${++videos}>` : null;
    if (tag) items.push({ tag, nombre: it.name, clave: "media:" + it.name, medio: true });
  }
  (leerJSON(W(stack || {}, "stack_state")?.value, {}).picks || []).forEach((p, idx) => {
    if (!p) return;
    const activa = p.on !== false && (p.visual?.w ?? 1) > 0;
    if (activa && (p.visual?.c || 1) > 1) avisos.push(`${p.label}: tiene copias; la numeración puede no coincidir con el Text Encode`);
    const kind = p.visual?.kind || "image";
    const tag = !activa ? null : kind === "video" ? `<Video ${++videos}>` : kind === "image" ? `<Picture ${++fotos}>` : null;
    items.push({ tag, nombre: p.label || p.name, clave: p.name, ref: p.name, preview: p.preview || p.name, idx,
                 on: p.on !== false, fuerza: p.visual?.w ?? 1 });
  });
  if (!pb) avisos.push("El nodo no está conectado a un Prompt Builder: se usa el primer RefMod Stack del workflow.");
  if (!stack && !loader) avisos.push("No encontré RefMod Stack ni Media Loader: no hay referencias que enlazar.");
  const audioNodo = origen(graph, node, "audio") || (pb && origen(graph, pb, "audio_1"));
  return { items, lista: items.filter((r) => r.tag), avisos, stack, audio: W(audioNodo || {}, "audio")?.value || "" };
}

/* Añade a ctx las funciones de la columna 1. Usa de ctx: u, S, wf, graph, node, caja, colRefs, recetas, biblioteca,
 * avisar, pedirMontaje, pintarPlan. */
export function instalar(ctx) {
  const { u, S, wf, graph, node, caja, colRefs } = ctx;
  const { el, W, leerJSON, api } = u;

  ctx.claveDe = (tag) => wf.lista.find((r) => r.tag === tag)?.clave;
  ctx.refDe = (tag) => S.refs[ctx.claveDe(tag)] || {};
  ctx.mapaEtiquetas = () => Object.fromEntries(wf.lista.map((r) => [r.tag, r.clave]));
  // las tomas guardan etiquetas: si los números cambiaron, se traducen por clave (lo que ya no está queda vacío)
  ctx.remapear = function remapear(antes) {
    const ahora = Object.fromEntries(wf.lista.map((r) => [r.clave, r.tag]));
    for (const t of S.plan.tomas) {
      for (const c of ["personaje", "pose", "fondo_ref"]) if (t[c]) t[c] = ahora[antes[t[c]]] || "";
    }
  };

  // datos de Fantastic (ficha, concepto, vista previa) de cada RefMod de la biblioteca
  ctx.cargarBiblioteca = async function cargarBiblioteca() {
    try {
      const lib = await (await fetch("/minimax_h3/refmods")).json();
      for (const it of lib.items || []) ctx.biblioteca[it.name] = it;
    } catch { /* sin datos de Fantastic: las fichas quedan vacías */ }
  };

  // lo guardado antes de esta versión iba por número: se pasa a clave con el mapa de etiquetas de entonces (o el de ahora)
  ctx.prepararRefs = function prepararRefs(guardado) {
    const etiquetasGuardadas = guardado.etiquetas || Object.fromEntries(wf.lista.map((r) => [r.tag, r.clave]));
    for (const k of Object.keys(S.refs)) {
      if (k.startsWith("<") && etiquetasGuardadas[k]) S.refs[etiquetasGuardadas[k]] ??= S.refs[k];
      if (k.startsWith("<")) delete S.refs[k];
    }
    ctx.remapear(etiquetasGuardadas);
    ctx.rellenarRefs();
  };

  // papel, nombre y ficha de cada referencia: lo guardado manda; si no, la receta; si no, los datos del RefMod
  ctx.rellenarRefs = function rellenarRefs() {
    const deLaReceta = Object.values(ctx.recetas[S.receta]?.referencias || {});
    for (const r of wf.items) {
      if (S.refs[r.clave]) continue;
      const deReceta = deLaReceta.find((x) => x.ref === r.clave);
      const meta = ctx.biblioteca[r.ref] || {};
      S.refs[r.clave] = deReceta ? { papel: deReceta.papel, nombre: deReceta.nombre, ficha: deReceta.ficha, origen: "receta" } :
        { papel: r.medio ? "personaje" : (CONCEPTO[meta.concept] || "no"), nombre: "",
          ficha: (meta.appearance || meta.desc || "").slice(0, 300), origen: meta.name ? "RefMod" : "" };
    }
  };

  // ---- cambiar las tarjetas del RefMod Stack (añadir, quitar, encender, fuerza): se escribe en su propio campo
  ctx.cambiarStack = function cambiarStack(cambio) {
    const st = wf.stack, w = W(st || {}, "stack_state");
    if (!w) return ctx.avisar("No hay RefMod Stack conectado", "mal");
    const estadoStack = leerJSON(w.value, {});
    estadoStack.picks = estadoStack.picks || [];
    const antes = ctx.mapaEtiquetas();
    cambio(estadoStack.picks);
    w.value = JSON.stringify(estadoStack);
    try { st._mmrPanel?.reload?.(); } catch { /* el panel de Fantastic se pondrá al día al redibujar */ }
    graph.setDirtyCanvas?.(true, true);
    Object.assign(wf, referenciasDelWorkflow(u, graph, node));
    ctx.rellenarRefs();
    ctx.remapear(antes);
    ctx.pintarRefs();
    ctx.pintarPlan();
    ctx.pedirMontaje();
  };
  function anadirDeBiblioteca(it) {
    ctx.cambiarStack((picks) => {
      if (picks.length >= 12) throw new Error("El Stack ya tiene 12 tarjetas");
      const canal = (c) => c ? { file: c.file, kind: c.kind, tokens: c.tokens || 0, seconds: c.seconds, mode: "weight", w: 1,
                                 s: 1, c: 1, embedded_audio_ignored: !!c.embedded_audio_ignored } : undefined;
      const p = { uid: Math.max(0, ...picks.map((x) => +x.uid || 0)) + 1, name: it.name, label: it.label || it.name, on: true,
                  preview: it.preview || null };
      if (it.visual) p.visual = canal(it.visual);
      if (it.audio) p.audio = canal(it.audio);
      picks.push(p);
    });
  }
  ctx.abrirBiblioteca = function abrirBiblioteca() {
    const capa = el("div", { class: "epl-biblio" });
    const filtro = el("input", { placeholder: "buscar por nombre o carpeta…", oninput: () => pintar() });
    const rejilla = el("div", { class: "epl-biblio-rejilla" });
    const pintar = () => {
      const q = filtro.value.toLowerCase();
      rejilla.replaceChildren(...Object.values(ctx.biblioteca).filter((it) => it.visual && it.name.toLowerCase().includes(q))
        .map((it) => el("div", { class: "epl-biblio-item", title: it.name, onclick: () => {
          try { anadirDeBiblioteca(it); capa.remove(); ctx.avisar(`Añadida ${it.label || it.name}`, "bien"); }
          catch (e) { ctx.avisar(e.message, "mal"); } } },
          el("img", { src: it.preview ? `/minimax_h3/refmods/preview?name=${encodeURIComponent(it.preview)}` : "", alt: "" }),
          el("div", {}, it.label || it.name), el("small", {}, `${it.folder || ""} · ${it.concept || ""}`))));
    };
    capa.append(el("div", { class: "epl-fila" }, el("b", {}, "Añadir referencia desde la biblioteca de RefMods"), filtro,
      el("button", { class: "epl-mini", onclick: () => capa.remove() }, "cerrar")),
      el("p", { class: "epl-ayuda" }, "Para crear un RefMod nuevo desde una imagen usa «Create…» en el nodo RefMod Stack; " +
        "después aparece aquí."), rejilla);
    caja.append(capa);
    pintar();
    filtro.focus();
  };

  // ---- columna 1: referencias
  function usadaEn(tag) {
    if (!tag) return "apagada: no se envía";
    const r = ctx.refDe(tag);
    const tomas = S.plan.tomas.map((t, i) => [t.personaje, t.pose, t.fondo_ref].includes(tag) ? `T${i + 1}` : null).filter(Boolean);
    if (r.papel === "personaje") tomas.unshift("definición");
    if (r.papel === "estilo") tomas.unshift("todo el edit");
    return tomas.length ? tomas.join(" · ") : "sin usar";
  }
  // marca la referencia y las tomas que la usan (también lo usa la columna 3)
  ctx.resaltar = function resaltar(tag, si) {
    caja.querySelectorAll(`[data-tag="${tag}"]`).forEach((e) => e.classList.toggle("epl-hl", si));
    S.plan.tomas.forEach((t, i) => {
      if ([t.personaje, t.pose, t.fondo_ref].includes(tag)) caja.querySelector(`#epl-toma-${i + 1}`)?.classList.toggle("epl-hl", si);
    });
  };
  ctx.pintarRefs = function pintarRefs() {
    const { cambiarStack, resaltar, pedirMontaje } = ctx;
    colRefs.replaceChildren(el("h3", {}, "Referencias"),
      el("p", { class: "epl-ayuda" }, "Del RefMod Stack conectado, con la numeración del Text Encode. El papel dice cómo se usa; " +
        "la ficha le dice al LLM qué hay en la imagen."),
      ...wf.avisos.map((a) => el("p", { class: "epl-aviso" }, "⚠ " + a)),
      wf.stack ? el("button", { class: "epl-boton", onclick: ctx.abrirBiblioteca }, "+ Añadir referencia") : null);
    for (const r of wf.items) {
      const ref = S.refs[r.clave] || (S.refs[r.clave] = { papel: "no", nombre: "", ficha: "" });
      const cambiar = (k, v) => { ref[k] = v; ref.origen = "editor"; pedirMontaje(); };
      const esFoto = !r.tag || r.tag.startsWith("<Picture");
      // controles del Stack: encender/apagar, fuerza (como en Fantastic: 0–10; más de 1 = copias) y quitar
      const controles = r.idx === undefined ? null : el("div", { class: "epl-fila epl-stack" },
        el("label", { title: "Apagada no se envía a H3 y no tiene número" },
          el("input", { type: "checkbox", checked: r.on, onchange: (e) => cambiarStack((p) => { p[r.idx].on = e.target.checked; }) }),
          " activa"),
        el("label", { title: "Fuerza de la referencia: 1 = normal, 0.3 = suave (poses), más de 1 = copias" }, "fuerza ",
          el("input", { type: "number", min: 0, max: 10, step: 0.05, value: r.fuerza, class: "corto",
            onchange: (e) => cambiarStack((p) => {
              const v = Math.max(0, Math.min(10, +e.target.value || 0));
              p[r.idx].visual = { ...(p[r.idx].visual || {}), mode: "weight", w: v };
            }) })),
        el("button", { class: "epl-mini", title: "Quitar del Stack", onclick: () => cambiarStack((p) => { p.splice(r.idx, 1); }) }, "✕ quitar"));
      colRefs.append(el("div", { class: "epl-ref" + (r.tag ? "" : " apagada"), "data-tag": r.tag || "",
                                 onmouseenter: () => r.tag && resaltar(r.tag, true), onmouseleave: () => r.tag && resaltar(r.tag, false) },
        el("img", { src: r.preview ? `/minimax_h3/refmods/preview?name=${encodeURIComponent(r.preview)}` : "", alt: "" }),
        el("div", {},
          el("div", { class: "epl-reftit" }, el("b", {}, r.tag || "(apagada)"), " ", r.nombre),
          controles,
          esFoto ? el("select", { onchange: (e) => { cambiar("papel", e.target.value); ctx.pintarRefs(); ctx.pintarPlan(); } },
            PAPELES.map(([v, t]) => el("option", { value: v, selected: ref.papel === v }, t)))
            : el("span", { class: "epl-ayuda" }, "video: solo informativo"),
          esFoto && ref.papel === "personaje" ? el("input", { value: ref.nombre || "", placeholder: "nombre en el prompt (ej.: school uniform)",
            oninput: (e) => cambiar("nombre", e.target.value) }) : null,
          esFoto && ref.papel !== "no" ? el("textarea", { rows: 2, placeholder: "ficha: qué se ve (en inglés)",
            oninput: (e) => cambiar("ficha", e.target.value) }, ref.ficha || "") : null,
          esFoto && ref.papel !== "no" && r.preview ? el("div", { class: "epl-fila" },
            el("button", { class: "epl-mini", title: "Qwen mira la imagen y propone la ficha y los riesgos; revísala",
              onclick: () => describir(r, ref) }, "👁 describir con visión"),
            ref.origen ? el("span", { class: "epl-ayuda" }, "ficha: " + ref.origen) : null) : null,
          ref.propuesta ? el("div", { class: "epl-propuesta" }, "Propuesta de Qwen: «" + ref.propuesta.ficha + "»",
            el("div", { class: "epl-fila" },
              el("button", { class: "epl-mini", onclick: () => {
                ref.ficha = ref.propuesta.ficha;
                if (ref.papel === "personaje" && !ref.nombre) ref.nombre = ref.propuesta.nombre;
                ref.origen = "visión, revisada";
                delete ref.propuesta;
                ctx.pintarRefs(); pedirMontaje(); } }, "usar"),
              el("button", { class: "epl-mini", onclick: () => { delete ref.propuesta; ctx.pintarRefs(); } }, "descartar"))) : null,
          ref.riesgos?.length ? el("div", { class: "epl-aviso" }, "⚠ riesgo: " + ref.riesgos.join(" · ")) : null,
          el("div", { class: "epl-usada" }, "usada en: " + usadaEn(r.tag)))));
    }
  };
  async function describir(r, ref) {
    if (S.ocupado) return;
    S.ocupado = true;
    caja.classList.add("ocupada");
    const t0 = Date.now();
    const reloj = setInterval(() => ctx.avisar(`Mirando ${r.tag}… ${Math.round((Date.now() - t0) / 1000)} s`, "trabajando"), 500);
    try {
      const d = await api("describir", { preview: r.preview, papel: ref.papel });
      // la ficha no se cambia sola: Qwen se equivoca en objetos pequeños (estudio nombrar_refmods); decide el usuario
      ref.propuesta = { ficha: d.ficha, nombre: d.nombre };
      ref.riesgos = d.riesgos;
      ctx.avisar(`${r.tag}: propuesta lista en ${d.segundos} s. Úsala o descártala.`, "bien");
      ctx.pintarRefs();
    } catch (e) {
      ctx.avisar(`${r.tag}: ${e.message}`, "mal");
    } finally {
      clearInterval(reloj);
      S.ocupado = false;
      caja.classList.remove("ocupada");
    }
  }
}
