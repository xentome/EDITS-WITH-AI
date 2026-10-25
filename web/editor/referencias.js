/* Sección 3 del editor: REFERENCIAS, partidas en dos mitades. Izquierda roja: lo que no cambia (personaje, objeto, lugar).
 * Derecha azul: lo que se presta (ropa, pose, fondo, estilo, efecto) y, abajo, los efectos de texto (E1, E2…) como fichas.
 * Lee el RefMod Stack y el Media Loader del workflow, guarda papel/nombre/ficha de cada referencia por su clave, cambia el
 * Stack, abre la biblioteca de RefMods, enseña la ficha de cada referencia (al tocarla) y pide la ficha con visión.
 * Las cajitas (un RefMod con varias fotos) se abren y se crean en cajitas.js; «tapar con SAM» de la ficha está en tapar.js.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Las utilidades llegan en ctx.u, sin imports, para que
 * este archivo también se recargue al abrir la ventana. Planos: ../../planos/4 El editor.md. */

// papel → [texto, mitad]
export const PAPELES = {
  personaje: ["personaje (identidad o atuendo)", "izq"], objeto: ["objeto / producto", "izq"], lugar: ["lugar", "izq"],
  ropa: ["ropa", "der"], pose: ["pose", "der"], fondo: ["fondo de una toma", "der"], estilo: ["estilo", "der"],
  efecto: ["efecto (imagen o clip de ejemplo)", "der"], no: ["no usar", "der"],
};
// campos de la toma que citan una referencia (los mismos que nucleo.CAMPO_PAPEL); «efecto» también puede ser E1, E2…
export const CAMPOS_REF = ["personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"];
export const PRONOMBRES = [["they", "they (por defecto)"], ["she", "she"], ["he", "he"]];
const CONCEPTO = { identity: "personaje", clothing: "ropa", pose_motion: "pose", pose: "pose", background: "fondo",
                   scene: "fondo", style: "estilo" };
// al añadir desde una mitad, el papel que toca en ese lado según el concepto del RefMod
const POR_LADO = { izq: { identity: "personaje", background: "lugar", scene: "lugar", "": "objeto" },
                   der: { clothing: "ropa", identity: "ropa", pose_motion: "pose", pose: "pose", background: "fondo",
                          scene: "fondo", "": "estilo" } };
export const papelPorLado = (lado, concepto) => POR_LADO[lado][concepto] || POR_LADO[lado][""];
const AYUDA_NOMBRE = { personaje: "nombre del personaje (ej.: Teto); las fotos con el mismo nombre son el mismo personaje",
                       efecto: "nombre corto del efecto (ej.: neon light streaks)",
                       objeto: "nombre del objeto en el prompt (ej.: red soda can)", lugar: "nombre del lugar (ej.: neon arcade street)",
                       ropa: "nombre de la ropa (ej.: red racing jacket)" };

/* Numeración igual que el Text Encode: primero los medios del Media Loader, después las tarjetas activas del Stack,
 * un contador por tipo (Picture / Video). */
export function referenciasDelWorkflow(u, graph, node) {
  const { W, leerJSON, origen, destinos } = u;
  const pb = destinos(graph, node, 0).find((n) => n.type === "MiniMaxH3PromptBuilder");
  const stack = (pb && origen(graph, pb, "mods")) || graph._nodes.find((n) => n.type === "MiniMaxH3RefModStack");
  const loader = pb && origen(graph, pb, "references");
  // items: todo lo que se ve (también las tarjetas apagadas, sin etiqueta); lista: solo lo que recibe H3.
  // Cada referencia se identifica por su «clave» (nombre del RefMod o del medio), no por su número: así el papel y la
  // ficha la siguen aunque cambie el orden.
  const items = [], avisos = [];
  let fotos = 0, videos = 0;
  for (const it of leerJSON(loader?.widgets?.[0]?.value, []) || []) {
    if (it.on === false) continue;
    const tag = it.kind === "picture" ? `<Picture ${++fotos}>` : it.kind === "video" ? `<Video ${++videos}>` : null;
    if (tag) items.push({ tag, nombre: it.name, clave: "media:" + it.name, medio: true, file: it.file,
                          kind: it.kind === "picture" ? "image" : "video" });
  }
  (leerJSON(W(stack || {}, "stack_state")?.value, {}).picks || []).forEach((p, idx) => {
    if (!p) return;
    const activa = p.on !== false && (p.visual?.w ?? 1) > 0;
    if (activa && (p.visual?.c || 1) > 1) avisos.push(`${p.label}: tiene copias; la numeración puede no coincidir con el Text Encode`);
    const kind = p.visual?.kind || "image";
    const tag = !activa ? null : kind === "video" ? `<Video ${++videos}>` : kind === "image" ? `<Picture ${++fotos}>` : null;
    items.push({ tag, nombre: p.label || p.name, clave: p.name, ref: p.name, preview: p.preview || p.name, idx, kind,
                 on: p.on !== false, fuerza: p.visual?.w ?? 1 });
  });
  if (fotos > 9) avisos.push(`Hay ${fotos} fotos activas: H3 admite 9 como mucho`);
  if (videos > 3) avisos.push(`Hay ${videos} videos (o cajitas) activos: H3 admite 3 como mucho`);
  if (!pb) avisos.push("El nodo no está conectado a un Prompt Builder: se usa el primer RefMod Stack del workflow.");
  if (!stack && !loader) avisos.push("No encontré RefMod Stack ni Media Loader: no hay referencias que enlazar.");
  const audioNodo = origen(graph, node, "audio") || (pb && origen(graph, pb, "audio_1"));
  return { items, lista: items.filter((r) => r.tag), avisos, stack, audioNodo, audio: W(audioNodo || {}, "audio")?.value || "" };
}

/* Añade a ctx las funciones de la sección 3. Usa de ctx: u, S, wf, graph, node, caja, secRefs, biblioteca,
 * cajitas, avisar, pedirMontaje, pintarPlan, pintarToma, abrirCajita, crearCajita. */
export function instalar(ctx) {
  const { u, S, wf, graph, node, caja, secRefs } = ctx;
  const { el, W, leerJSON, api } = u;

  ctx.claveDe = (tag) => wf.lista.find((r) => r.tag === tag)?.clave;
  ctx.refDe = (tag) => S.refs[ctx.claveDe(tag)] || {};
  ctx.mapaEtiquetas = () => Object.fromEntries(wf.lista.map((r) => [r.tag, r.clave]));
  // las tomas guardan etiquetas: si los números cambiaron, se traducen por clave (lo que ya no está queda vacío)
  ctx.remapear = function remapear(antes) {
    const ahora = Object.fromEntries(wf.lista.map((r) => [r.clave, r.tag]));
    for (const t of S.plan.tomas) for (const c of CAMPOS_REF) if ((t[c] || "").startsWith("<")) t[c] = ahora[antes[t[c]]] || "";
  };

  // ---- cómo se ve cada referencia
  ctx.vista = (r) => r.medio ? (r.kind === "image" ? u.vistaMedio(r.file) : "") : u.vistaRefmod(r.preview);
  ctx.fotosDe = (r) => (r.ref && ctx.cajitas[r.ref]) || null;           // fotos apuntadas de una cajita
  ctx.esCajita = (r) => !!ctx.fotosDe(r) || ctx.biblioteca[r.ref]?.visual?.source === "stack";
  ctx.nFotos = (r) => ctx.fotosDe(r)?.length || ctx.biblioteca[r.ref]?.visual?.t || 1;
  ctx.ladoDe = (r) => PAPELES[S.refs[r.clave]?.papel || "no"]?.[1] || "der";

  // datos de Fantastic (ficha, concepto, vista previa) de cada RefMod, y las fotos de cada cajita
  ctx.cargarBiblioteca = async function cargarBiblioteca() {
    try {
      const lib = await (await fetch("/minimax_h3/refmods", { cache: "no-store" })).json();
      for (const k of Object.keys(ctx.biblioteca)) delete ctx.biblioteca[k];
      for (const it of lib.items || []) ctx.biblioteca[it.name] = it;
    } catch { /* sin datos de Fantastic: las fichas quedan vacías */ }
    try { Object.assign(ctx.cajitas, (await api("cajitas", {})).cajitas); } catch { /* sin fotos apuntadas */ }
    await ctx.cargarTapados?.();                         // qué tarjetas son tapados y de qué original (tapar.js)
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

  // papel, nombre y ficha de cada referencia: lo guardado manda; si no, los datos del RefMod (su concepto y su apariencia)
  ctx.rellenarRefs = function rellenarRefs() {
    for (const r of wf.items) {
      if (S.refs[r.clave]) continue;
      const meta = ctx.biblioteca[r.ref] || {};
      S.refs[r.clave] = { papel: r.medio ? "personaje" : (CONCEPTO[meta.concept] || "no"), nombre: "",
                          ficha: (meta.appearance || meta.desc || "").slice(0, 300), origen: meta.name ? "RefMod" : "" };
    }
  };

  // ---- efectos solo de texto (E1, E2…): nombre y ficha (la frase que va al prompt); se guardan en el estado del nodo
  ctx.nuevoEfecto = function nuevoEfecto(e) {
    const n = Math.max(0, ...Object.keys(S.efectos).map((k) => +k.slice(1) || 0)) + 1;
    S.efectos["E" + n] = { nombre: (e.nombre || "").trim(), ficha: (e.ficha || "").trim() };
    return "E" + n;
  };
  ctx.quitarEfecto = function quitarEfecto(id) {
    delete S.efectos[id];
    for (const t of S.plan.tomas) if (t.efecto === id) { t.efecto = ""; t.fijos = t.fijos.filter((f) => f !== "efecto"); }
  };
  /* ventanita para crear o cambiar un efecto de texto: nombre y frase (en inglés, va tal cual al prompt) */
  ctx.abrirEfecto = function abrirEfecto(id) {
    const e = id ? { ...S.efectos[id] } : { nombre: "", ficha: "" };
    const aviso = el("p", { class: "epl-aviso" });
    let pregunta = false;
    const v = ctx.capa("der");
    const pintar = () => v.modal.replaceChildren(
      el("div", { class: "epl-tit" }, id ? `Efecto de texto ${id}` : "Nuevo efecto de texto",
        el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => v.cerrar() }, "cerrar"))),
      el("p", { class: "epl-ayuda" }, "Un efecto sin imagen: el LLM puede ponerlo en las tomas donde encaje y el código pega la frase tal cual. " +
        "Para un efecto con imagen o clip de ejemplo, añade la referencia y ponle el papel «efecto»."),
      el("label", {}, "Nombre corto"),
      el("input", { class: "epl-nombre", value: e.nombre, placeholder: "ej.: neon light streaks", oninput: (x) => { e.nombre = x.target.value; } }),
      el("label", {}, "Frase del efecto (en inglés; va tal cual al prompt)"),
      el("textarea", { class: "epl-ficha-txt", rows: 3, placeholder: "ej.: thin neon light streaks cross the frame behind <Subject 1>",
                       oninput: (x) => { e.ficha = x.target.value; } }, e.ficha),
      aviso,
      el("div", { class: "epl-fila" },
        el("button", { class: "epl-boton epl-azul", onclick: () => {
          if (!e.ficha.trim()) { aviso.textContent = "⚠ Escribe la frase del efecto"; return; }
          if (id) S.efectos[id] = { nombre: e.nombre.trim(), ficha: e.ficha.trim() }; else ctx.nuevoEfecto(e);
          v.cerrar(); ctx.pintarRefs(); ctx.pintarPlan(); ctx.pedirMontaje();
        } }, id ? "Guardar" : "Crear efecto"),
        id ? (pregunta
          ? el("span", { class: "epl-ayuda" }, "¿quitar el efecto? ",
              el("button", { class: "epl-mini", onclick: () => { ctx.quitarEfecto(id); v.cerrar(); ctx.pintarRefs(); ctx.pintarPlan(); ctx.pedirMontaje(); } }, "sí"),
              el("button", { class: "epl-mini", onclick: () => { pregunta = false; pintar(); } }, "no"))
          : el("button", { class: "epl-mini", onclick: () => { pregunta = true; pintar(); } }, "✕ quitar efecto")) : null));
    pintar();
    return v;
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
  // tarjeta del Stack para un RefMod de la biblioteca (igual que la escribe Fantastic)
  ctx.tarjeta = function tarjeta(it, picks) {
    const canal = (c) => c ? { file: c.file, kind: c.kind, tokens: c.tokens || 0, seconds: c.seconds, mode: "weight", w: 1,
                               s: 1, c: 1, embedded_audio_ignored: !!c.embedded_audio_ignored } : undefined;
    const p = { uid: Math.max(0, ...picks.map((x) => +x.uid || 0)) + 1, name: it.name, label: it.label || it.name, on: true,
                preview: it.preview || null };
    if (it.visual) p.visual = canal(it.visual);
    if (it.audio) p.audio = canal(it.audio);
    return p;
  };
  // quitar una tarjeta del Stack: lo usan el botón «✕ quitar» de la ficha y la ✕ de cada tarjeta grande
  ctx.quitarDelStack = function quitarDelStack(r) {
    ctx.cambiarStack((p) => { p.splice(r.idx, 1); });
    ctx.avisar(`Quitada ${r.nombre} del Stack`, "bien");
  };
  ctx.anadirDeBiblioteca = (it, lado) => ctx.anadirVariosDeBiblioteca([it], lado);
  /* añade varios RefMods de la biblioteca de una vez, en ese orden. Si no caben en las 12 tarjetas del Stack, no añade
   * ninguno y lanza un error (la biblioteca lo enseña dentro de su ventana). */
  ctx.anadirVariosDeBiblioteca = function anadirVariosDeBiblioteca(its, lado) {
    const hay = (leerJSON(W(wf.stack || {}, "stack_state")?.value, {}).picks || []).length;
    if (hay + its.length > 12) {
      throw new Error(`No caben: el Stack tiene ${hay} de 12 tarjetas y quieres añadir ${its.length}. ` +
                      `Desmarca ${hay + its.length - 12} o quita tarjetas del Stack.`);
    }
    for (const it of its) {
      if (lado && !S.refs[it.name]) {
        S.refs[it.name] = { papel: papelPorLado(lado, it.concept || ""), nombre: "",
                            ficha: (it.appearance || it.desc || "").slice(0, 300), origen: "RefMod" };
      }
    }
    ctx.cambiarStack((picks) => { for (const it of its) picks.push(ctx.tarjeta(it, picks)); });
  };

  // ---- ventanas sobre el editor (una a la vez)
  ctx.capa = function capa(lado, ...hijos) {
    caja.querySelector(".epl-capa")?.remove();
    const modal = el("div", { class: "epl-modal " + (lado || "") }, ...hijos);
    const c = el("div", { class: "epl-capa", onclick: (e) => { if (e.target === c) c.remove(); } }, modal);
    caja.append(c);
    return { capa: c, modal, cerrar: () => c.remove() };
  };

  /* control − / deslizador / + para el tamaño de los recuadros (biblioteca y creador de cajitas). `aplicar(tam)` lo pone
   * (la variable --epl-tam de la rejilla). Recuerda el último tamaño en localStorage (si el navegador no deja, no pasa nada). */
  ctx.controlTamano = function controlTamano(aplicar, clave, defecto, min = 110, max = 520) {
    let tam = defecto;
    try { const g = +localStorage.getItem(clave); if (g >= min && g <= max) tam = g; } catch { /* sin localStorage */ }
    const barra = el("input", { type: "range", min, max, step: 10, value: tam, class: "epl-tam-barra", title: "Tamaño de los recuadros",
                                oninput: (e) => poner(+e.target.value) });
    const poner = (t) => {
      tam = Math.max(min, Math.min(max, Math.round(t)));
      aplicar(tam);
      barra.value = tam;
      try { localStorage.setItem(clave, String(tam)); } catch { /* sin localStorage */ }
    };
    poner(tam);
    return el("span", { class: "epl-tam", title: "Tamaño de los recuadros" },
      el("button", { class: "epl-mini", title: "Más pequeños", onclick: () => poner(tam - 40) }, "−"), barra,
      el("button", { class: "epl-mini", title: "Más grandes", onclick: () => poner(tam + 40) }, "+"));
  };

  /* biblioteca de RefMods con selección múltiple: tocar una foto la marca o la desmarca (✓); «Añadir (N)» mete todas las
   * marcadas en el Stack, en el orden en que se marcaron, y cierra. Buscar no borra lo marcado. */
  ctx.abrirBiblioteca = function abrirBiblioteca(lado) {
    const marcadas = [];                                   // nombres, en el orden en que se marcaron
    const filtro = el("input", { placeholder: "buscar por nombre o carpeta…", oninput: () => pintar(), style: { flex: 1 } });
    const rejilla = el("div", { class: "epl-biblio-rejilla" });
    const aviso = el("p", { class: "epl-aviso epl-biblio-aviso" });
    const anadir = el("button", { class: "epl-boton epl-azul epl-grande epl-biblio-anadir", onclick: () => {
      const its = marcadas.map((n) => ctx.biblioteca[n]).filter(Boolean);
      try {
        ctx.anadirVariosDeBiblioteca(its, lado);
        v.cerrar();
        ctx.avisar(its.length === 1 ? `Añadida ${its[0].label || its[0].name}` : `Añadidas ${its.length} referencias`, "bien");
      } catch (e) { aviso.textContent = "⚠ " + e.message; }
    } });
    const v = ctx.capa(lado,
      el("div", { class: "epl-tit" }, `Añadir a «${lado === "izq" ? "lo que no cambia" : "lo que se presta"}» desde la biblioteca de RefMods`,
        el("span", { class: "der" }, filtro, ctx.controlTamano((t) => rejilla.style.setProperty("--epl-tam", t + "px"), "epl-tam-biblioteca", 270),
          el("button", { class: "epl-boton epl-azul", title: "Crear referencias nuevas con fotos de tu PC", onclick: () => ctx.abrirSubir(lado) }, "⬆ Subir foto"),
          el("button", { class: "epl-mini", onclick: () => v.cerrar() }, "cerrar"))),
      el("p", { class: "epl-ayuda" }, "Toca las fotos para marcarlas o desmarcarlas y pulsa «Añadir». Para juntar varias fotos en una " +
        "sola referencia usa «+ Cajita». Para una foto nueva de tu PC, «⬆ Subir foto»."),
      rejilla,
      el("div", { class: "epl-biblio-pie" }, aviso, anadir));
    const contar = () => {
      anadir.textContent = `Añadir (${marcadas.length})`;
      anadir.disabled = !marcadas.length;
      aviso.textContent = "";
    };
    const pintar = () => {
      const q = filtro.value.toLowerCase();
      rejilla.replaceChildren(...Object.values(ctx.biblioteca).filter((it) => it.visual && it.name.toLowerCase().includes(q))
        .map((it) => {
          const item = el("div", { class: "epl-biblio-item" + (marcadas.includes(it.name) ? " marcada" : ""), title: it.name,
                                   "data-nombre": it.name, onclick: () => {
            const i = marcadas.indexOf(it.name);
            if (i >= 0) marcadas.splice(i, 1); else marcadas.push(it.name);
            item.classList.toggle("marcada", i < 0);
            contar();
          } },
            el("span", { class: "epl-check" }, "✓"),
            el("img", { src: u.vistaRefmod(it.preview), alt: "", loading: "lazy" }),
            el("div", { class: "nombre" }, it.label || it.name), el("small", {}, `${it.folder || ""} · ${it.concept || ""}` +
              (it.visual?.source === "stack" ? ` · cajita de ${it.visual.t}` : "")));
          return item;
        }));
    };
    pintar();
    contar();
    filtro.focus();
  };

  /* ---- «⬆ Subir foto»: una o varias imágenes del PC (elegir o soltar encima) → input/minimax_h3/ (con /upload/image de
   * ComfyUI) → RefMod nuevo en subidas/ (rutas.subir_refmods: Full Reference, 512, concept_type según el papel) → al Stack,
   * con el papel y el nombre elegidos. Varias fotos de un mismo personaje pueden ir juntas en una cajita. Con «tapar al
   * subir», cada referencia nueva se tapa (cara y pelo, SAM 3.1) en cuanto entra en el Stack. */
  const PAPELES_LADO = { izq: ["personaje", "objeto", "lugar"], der: ["ropa", "pose", "fondo", "estilo", "efecto"] };
  ctx.subirFoto = async function subirFoto(archivo) {
    const fd = new FormData();
    fd.append("image", archivo, archivo.name);
    fd.append("type", "input");
    fd.append("subfolder", "minimax_h3");
    const r = await fetch("/upload/image", { method: "POST", body: fd });
    if (!r.ok) throw new Error(`no se pudo subir ${archivo.name} (${r.status})`);
    const j = await r.json();
    return `${j.subfolder ? j.subfolder + "/" : ""}${j.name}`;
  };
  ctx.abrirSubir = function abrirSubir(lado) {
    const st = { papel: PAPELES_LADO[lado][0], nombre: "", tapar: lado === "der", juntar: true, fotos: [] };
    const aviso = el("p", { class: "epl-aviso" });
    const archivo = el("input", { type: "file", accept: "image/*", multiple: true, style: { display: "none" },
                                  onchange: (e) => { anadir(e.target.files); e.target.value = ""; } });
    const v = ctx.capa(lado);
    const anadir = (lista) => {
      const imgs = [...lista].filter((f) => /^image\//.test(f.type));
      if (!imgs.length) { aviso.textContent = "⚠ Eso no es una imagen"; return; }
      for (const f of imgs) st.fotos.push({ f, url: URL.createObjectURL(f) });
      if (!st.nombre) st.nombre = imgs[0].name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 30);
      aviso.textContent = "";
      pintar();
    };
    const pintar = () => {
      const varias = st.fotos.length > 1;
      v.modal.replaceChildren(
        el("div", { class: "epl-tit" }, `Subir foto a «${lado === "izq" ? "lo que no cambia" : "lo que se presta"}»`,
          el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => v.cerrar() }, "cerrar"))),
        archivo,
        el("div", { class: "epl-ficha" },
          el("div", { class: "epl-soltar", onclick: () => archivo.click() },
            st.fotos.length ? el("div", { class: "epl-fotos" }, ...st.fotos.map((x, i) => el("div", {},
              el("img", { src: x.url, alt: "" }), x.f.name,
              el("button", { class: "epl-mini quitar", title: "Sacar", onclick: (e) => { e.stopPropagation(); st.fotos.splice(i, 1); pintar(); } }, "✕"))))
              : el("p", { class: "epl-vacio" }, "Toca aquí para elegir una o varias imágenes de tu PC, o suéltalas encima de esta ventana.")),
          el("div", {},
            el("label", {}, "Papel"),
            el("select", { class: "epl-subir-papel", onchange: (e) => { st.papel = e.target.value; pintar(); } },
              ...PAPELES_LADO[lado].map((p) => el("option", { value: p, selected: st.papel === p }, PAPELES[p][0]))),
            el("label", {}, st.papel === "personaje" ? "Nombre del personaje (corto; también el del RefMod)" : "Nombre corto (va al prompt y al RefMod)"),
            el("input", { class: "epl-subir-nombre", value: st.nombre, placeholder: "ej.: teto, chaqueta_roja", oninput: (e) => { st.nombre = e.target.value; } }),
            varias ? el("label", { style: { display: "flex", gap: "6px", alignItems: "center" } },
              el("input", { type: "checkbox", class: "epl-subir-juntar", checked: st.juntar, onchange: (e) => { st.juntar = e.target.checked; } }),
              `juntar las ${st.fotos.length} fotos en una sola cajita (el mismo personaje u objeto)`) : null,
            el("label", { style: { display: "flex", gap: "6px", alignItems: "center" } },
              el("input", { type: "checkbox", class: "epl-subir-tapar", checked: st.tapar, onchange: (e) => { st.tapar = e.target.checked; } }),
              "tapar al subir: cara y pelo, con SAM 3.1 (para que no se cuele quien sale en la foto)"),
            el("p", { class: "epl-ayuda" }, "Se guardan en input/minimax_h3/ y el RefMod en la carpeta subidas/ (Full Reference, 512; unos 5–10 s cada uno, más unos 15 s si se tapa)."),
            aviso,
            el("div", { class: "epl-fila" },
              el("button", { class: "epl-boton fuerte epl-subir-crear", disabled: !st.fotos.length, onclick: () => crear() },
                st.fotos.length ? `Subir y crear (${varias && !st.juntar ? st.fotos.length + " referencias" : "1 referencia"})` : "Subir y crear")))));
    };
    v.modal.addEventListener("dragover", (e) => { e.preventDefault(); v.modal.classList.add("soltar"); });
    v.modal.addEventListener("dragleave", () => v.modal.classList.remove("soltar"));
    v.modal.addEventListener("drop", (e) => { e.preventDefault(); v.modal.classList.remove("soltar"); anadir(e.dataTransfer.files); });
    async function crear() {
      if (S.ocupado || !st.fotos.length) return;
      if (!st.nombre.trim()) { aviso.textContent = "⚠ Ponle un nombre corto"; return; }
      const juntar = st.juntar && st.fotos.length > 1, cuantas = juntar ? 1 : st.fotos.length;
      const hay = (leerJSON(W(wf.stack || {}, "stack_state")?.value, {}).picks || []).length;
      if (hay + cuantas > 12) { aviso.textContent = `⚠ No caben: el Stack tiene ${hay} de 12 tarjetas.`; return; }
      S.ocupado = true;
      caja.classList.add("ocupada");
      const t0 = Date.now();
      let fase = "Subiendo las fotos…";
      const reloj = setInterval(() => ctx.avisar(`${fase} ${Math.round((Date.now() - t0) / 1000)} s`, "trabajando"), 500);
      let creados = [];
      try {
        const rels = [];
        for (const x of st.fotos) rels.push(await ctx.subirFoto(x.f));
        fase = "Creando la referencia…";
        const res = await api("subir_refmods", { nombre: st.nombre.trim(), papel: st.papel, fotos: rels, juntar });
        creados = res.creados;
        await ctx.cargarBiblioteca();
        const nombre = st.nombre.trim();
        for (const n of creados) S.refs[n] = { papel: st.papel, nombre, ficha: "", origen: "subida" };
        ctx.anadirVariosDeBiblioteca(creados.map((n) => ctx.biblioteca[n]).filter(Boolean), lado);
        v.cerrar();
        ctx.avisar(`Creada${creados.length > 1 ? "s" : ""} ${creados.join(", ")} en ${res.segundos} s y añadida${creados.length > 1 ? "s" : ""} al Stack`, "bien");
      } catch (e) {
        aviso.textContent = "⚠ " + e.message;
        ctx.avisar("Subir foto: " + e.message, "mal");
      } finally {
        clearInterval(reloj);
        S.ocupado = false;
        caja.classList.remove("ocupada");
      }
      if (st.tapar && creados.length) {           // tapar cada una ya en el Stack (tapar.js); deja la tarjeta tapada en su sitio
        for (const n of creados) {
          const r = wf.items.find((x) => x.clave === n);
          if (r) await ctx.taparTarjeta(r);
        }
      }
      return creados;
    }
    pintar();
    return v;
  };

  // ---- dónde se usa cada referencia
  ctx.usadaEn = function usadaEn(tag) {
    if (!tag) return "apagada: no se envía";
    const r = ctx.refDe(tag);
    const tomas = S.plan.tomas.map((t, i) => CAMPOS_REF.some((c) => t[c] === tag) ? `T${i + 1}` : null).filter(Boolean);
    if (r.papel === "personaje") tomas.unshift(r.atuendo ? "definición" : "definición (todas las tomas)");
    if (r.papel === "objeto") tomas.unshift("definición");
    if (r.papel === "estilo") tomas.unshift("todo el edit");
    return tomas.length ? tomas.join(" · ") : "sin usar";
  };
  // lo que usa la toma k: lo que cita, más la identidad (personaje sin nombre) y el estilo, que valen para todas
  ctx.usadasEnToma = function usadasEnToma(k) {
    const t = S.plan.tomas[k - 1], usadas = new Set(t ? CAMPOS_REF.map((c) => t[c]).filter(Boolean) : []);
    for (const r of wf.lista) {
      const ref = S.refs[r.clave] || {};
      if ((ref.papel === "personaje" && !(ref.atuendo || "").trim()) || ref.papel === "estilo") usadas.add(r.tag);
    }
    return usadas;
  };
  // marca la referencia y las tomas que la usan (lo usa también el prompt final al pasar el ratón)
  ctx.resaltar = function resaltar(tag, si) {
    caja.querySelectorAll(`[data-tag="${tag}"]`).forEach((e) => e.classList.toggle("epl-hl", si));
    S.plan.tomas.forEach((t, i) => {
      if (CAMPOS_REF.some((c) => t[c] === tag)) caja.querySelector(`#epl-tomab-${i + 1}`)?.classList.toggle("epl-hl", si);
    });
  };

  // ---- una tarjeta grande: foto entera (contain) sobre la misma foto desenfocada, y una franja con número y papel
  function tile(r, usadas) {
    const ref = S.refs[r.clave] || {};
    const src = ctx.vista(r), fotos = ctx.fotosDe(r), cajita = ctx.esCajita(r);
    const marca = !r.tag ? " apagada" : usadas ? (usadas.has(r.tag) ? " usada" : " atenuada") : "";
    const imagen = fotos ? el("div", { class: "mosaico" }, ...fotos.slice(0, 4).map((f) => el("img", { src: u.vistaMedio(f.file), alt: "", loading: "lazy" })))
      : src ? el("img", { src, alt: "", loading: "lazy" }) : el("div", { class: "sinfoto" }, r.kind === "video" ? "🎞 video" : "sin vista previa");
    const fondoSrc = fotos ? u.vistaMedio(fotos[0].file) : src;
    const papel = ref.papel && PAPELES[ref.papel] ? ref.papel : "no";
    return el("div", { class: "epl-tile" + marca, "data-tag": r.tag || "", title: r.nombre,
                       onclick: () => cajita ? ctx.abrirCajita(r) : ctx.abrirFicha(r),
                       onmouseenter: () => r.tag && ctx.resaltar(r.tag, true), onmouseleave: () => r.tag && ctx.resaltar(r.tag, false) },
      fondoSrc ? el("div", { class: "fondo", style: { backgroundImage: `url("${fondoSrc}")` } }) : null,
      imagen,
      r.idx !== undefined ? cruz(r) : null,
      cajita ? el("span", { class: "epl-insignia" }, `${ctx.nFotos(r)} fotos`) : null,
      el("div", { class: "franja" }, el("b", {}, r.tag || "(apagada)"), " ",
        el("span", { class: "epl-papel " + papel }, PAPELES[papel][0].split(" (")[0]),
        ref.nombre ? ` ${ref.nombre}` : "",
        el("small", {}, (cajita ? "cajita · tócala para abrirla · " : "") + r.nombre)));
  }
  /* la ✕ de la esquina de cada tarjeta del Stack: el primer toque pide confirmar («¿quitar? sí / no») y «sí» la quita
   * con ctx.quitarDelStack, lo mismo que «✕ quitar» de la ficha. Ningún toque aquí abre la ficha. */
  function cruz(r) {
    const nodo = el("div", { class: "epl-cruz", onclick: (e) => e.stopPropagation() });
    const normal = () => nodo.replaceChildren(el("button", { class: "x", title: "Quitar del Stack", "aria-label": "Quitar del Stack",
      onclick: (e) => { e.stopPropagation(); preguntar(); } }, "✕"));
    const preguntar = () => {
      nodo.replaceChildren(el("button", { class: "x", title: "No quitar", onclick: (e) => { e.stopPropagation(); normal(); } }, "✕"),
        el("span", { class: "pregunta" }, "¿quitar?",
          el("button", { class: "si", onclick: (e) => { e.stopPropagation(); ctx.quitarDelStack(r); } }, "sí"),
          el("button", { class: "no", onclick: (e) => { e.stopPropagation(); normal(); } }, "no")));
    };
    normal();
    return nodo;
  }
  // columnas que dejan las fotos más grandes (retrato 3:4) en el hueco de cada mitad
  function ajustarRejilla(rejilla, n) {
    const ancho = rejilla.clientWidth || 600, alto = rejilla.clientHeight || 300;
    let mejor = 1, tam = 0;
    for (let c = 1; c <= Math.max(1, n); c++) {
      const filas = Math.ceil(n / c);
      const s = Math.min((ancho - 8 * (c - 1)) / c / 3, (alto - 8 * (filas - 1)) / filas / 4);
      if (s > tam) { tam = s; mejor = c; }
    }
    rejilla.style.gridTemplateColumns = `repeat(${mejor}, minmax(0, 1fr))`;
  }

  ctx.pintarRefs = function pintarRefs() {
    const usadas = S.elegida ? ctx.usadasEnToma(S.elegida) : null;
    const izq = wf.items.filter((r) => ctx.ladoDe(r) === "izq"), der = wf.items.filter((r) => ctx.ladoDe(r) === "der");
    // dentro de cada mitad: primero las activas con papel, después las de «no usar» y las apagadas
    const orden = (r) => (!r.tag ? 2 : (S.refs[r.clave]?.papel || "no") === "no" ? 1 : 0);
    der.sort((a, b) => orden(a) - orden(b));
    const botones = (lado) => el("span", { class: "der" },
      wf.stack ? el("button", { class: "epl-mini", onclick: () => ctx.abrirBiblioteca(lado) }, "+ Añadir") : null,
      wf.stack ? el("button", { class: "epl-mini", onclick: () => ctx.crearCajita({ lado }) }, "+ Cajita") : null);
    const rejIzq = el("div", { class: "epl-rejilla" }, ...izq.map((r) => tile(r, usadas)));
    const rejDer = el("div", { class: "epl-rejilla" }, ...der.map((r) => tile(r, usadas)));
    // efectos de texto: tocar uno lo pone o lo quita en la toma elegida; sin toma elegida, se abre para cambiarlo
    const efectos = Object.entries(S.efectos);
    const t = S.elegida ? S.plan.tomas[S.elegida - 1] : null;
    const fichas = el("div", { class: "epl-efectos" }, el("span", { class: "epl-ayuda", style: { margin: 0 } }, "Efectos de texto:"),
      ...efectos.map(([c, e]) =>
        el("span", { class: "epl-efecto" + (t ? (t.efecto === c ? " usada" : " atenuada") : ""), "data-efecto": c,
                     title: e.ficha + (t ? "\n\nTócalo para ponerlo o quitarlo en la toma elegida" : "\n\nTócalo para cambiarlo o quitarlo"),
                     onclick: () => {
                       if (!t) return ctx.abrirEfecto(c);
                       t.efecto = t.efecto === c ? "" : c;
                       if (!t.fijos.includes("efecto")) t.fijos.push("efecto");
                       ctx.pintarPlan(); ctx.pintarRefs(); ctx.pedirMontaje(); } },
          el("b", {}, c), e.nombre || e.ficha.split(/\s+/).slice(0, 4).join(" "),
          t ? el("button", { class: "epl-mini", title: "Cambiar o quitar este efecto", onclick: (x) => { x.stopPropagation(); ctx.abrirEfecto(c); } }, "✎") : null)),
      el("button", { class: "epl-mini", title: "Un efecto sin imagen: nombre y frase que va tal cual al prompt", onclick: () => ctx.abrirEfecto(null) }, "+ Efecto"));
    secRefs.replaceChildren(el("div", { class: "epl-mitades" },
      el("div", { class: "epl-mitad izq" },
        el("div", { class: "epl-tit" }, "Lo que no cambia · persistente", botones("izq")),
        ...wf.avisos.map((a) => el("p", { class: "epl-aviso" }, "⚠ " + (Array.isArray(a) ? u.t(...a) : a))),
        izq.length ? rejIzq : el("p", { class: "epl-vacio" }, "Pon aquí lo que tiene que salir siempre igual: el personaje " +
          "(una cajita con sus fotos), un producto o un lugar. Usa «+ Añadir» o «+ Cajita», o cambia el papel de una referencia.")),
      el("div", { class: "epl-mitad der" },
        el("div", { class: "epl-tit" }, "Lo que se presta · ropa, poses, fondos, estilo y efectos", botones("der")),
        der.length ? rejDer : el("p", { class: "epl-vacio" }, "Ropa, poses, fondos y estilos que se toman solo en algunas tomas."),
        fichas)));
    requestAnimationFrame(() => { ajustarRejilla(rejIzq, izq.length); ajustarRejilla(rejDer, der.length); });
  };

  // ---- la ficha de una referencia (al tocarla): foto grande y todos sus controles. `extra` (cajitas.js) cambia la
  // parte izquierda (las fotos de la cajita) y añade botones.
  ctx.abrirFicha = function abrirFicha(r0, extra) {
    let r = r0;
    const v = ctx.capa(ctx.ladoDe(r));
    const pintar = () => {
      r = wf.items.find((x) => x.clave === r.clave) || r;
      const ref = S.refs[r.clave] || (S.refs[r.clave] = { papel: "no", nombre: "", ficha: "" });
      const cambiar = (k, val) => { ref[k] = val; ref.origen = "editor"; ctx.pedirMontaje(); refrescar(); };
      const src = ctx.vista(r);
      const stack = r.idx === undefined ? null : el("div", { class: "epl-fila" },
        el("label", { title: "Apagada no se envía a H3 y no tiene número", style: { margin: 0 } },
          el("input", { type: "checkbox", checked: r.on, onchange: (e) => { ctx.cambiarStack((p) => { p[r.idx].on = e.target.checked; }); pintar(); } }),
          " activa"),
        el("label", { title: "Fuerza: 1 = normal, 0.3 = suave (poses), más de 1 = copias", style: { margin: 0 } }, "fuerza ",
          el("input", { type: "number", min: 0, max: 10, step: 0.05, value: r.fuerza, class: "corto",
            onchange: (e) => { ctx.cambiarStack((p) => {
              const val = Math.max(0, Math.min(10, +e.target.value || 0));
              p[r.idx].visual = { ...(p[r.idx].visual || {}), mode: "weight", w: val };
            }); pintar(); } })),
        el("button", { class: "epl-mini", title: "Quitar del Stack", onclick: () => { v.cerrar(); ctx.quitarDelStack(r); } }, "✕ quitar"));
      const lleva = ["personaje", "objeto", "lugar", "ropa", "efecto"].includes(ref.papel);
      const izquierda = extra?.izquierda?.(r) || el("div", { class: "grande" },
        src ? el("div", { class: "fondo", style: { backgroundImage: `url("${src}")` } }) : null,
        src ? el("img", { src, alt: "" }) : el("div", { class: "epl-vacio", style: { padding: "20px" } }, "sin vista previa"));
      v.modal.className = "epl-modal " + ctx.ladoDe(r);
      v.modal.replaceChildren(
        el("div", { class: "epl-tit" }, el("b", { style: { color: "#cfe0ff" } }, r.tag || "(apagada)"), r.nombre,
          el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => v.cerrar() }, "cerrar"))),
        el("div", { class: "epl-ficha" }, izquierda,
          el("div", {},
            el("label", {}, "Papel"),
            el("select", { class: "epl-papel-sel", onchange: (e) => { cambiar("papel", e.target.value); ctx.pintarRefs(); ctx.pintarPlan(); pintar(); } },
              el("optgroup", { label: "Lo que no cambia" }, ...["personaje", "objeto", "lugar"].map((p) =>
                el("option", { value: p, selected: ref.papel === p }, PAPELES[p][0]))),
              el("optgroup", { label: "Lo que se presta" }, ...["ropa", "pose", "fondo", "estilo", "efecto"].map((p) =>
                el("option", { value: p, selected: ref.papel === p }, PAPELES[p][0]))),
              el("option", { value: "no", selected: ref.papel === "no" || !PAPELES[ref.papel] }, "no usar")),
            lleva ? el("label", {}, ref.papel === "personaje" ? "Nombre del personaje" : "Nombre en el prompt") : null,
            lleva ? el("input", { class: "epl-nombre", value: ref.nombre || "", placeholder: AYUDA_NOMBRE[ref.papel],
                                  oninput: (e) => cambiar("nombre", e.target.value) }) : null,
            ref.papel === "personaje" ? el("div", { class: "epl-fila" },
              el("label", { style: { margin: 0 } }, "Pronombre ",
                el("select", { class: "epl-pronombre", onchange: (e) => cambiar("pronombre", e.target.value) },
                  ...PRONOMBRES.map(([v2, t2]) => el("option", { value: v2, selected: (ref.pronombre || "they") === v2 }, t2)))),
              el("label", { style: { margin: 0, flex: 1 } }, "Atuendo (opcional) ",
                el("input", { class: "epl-atuendo", value: ref.atuendo || "", placeholder: "solo si esta foto es un atuendo: school uniform",
                              oninput: (e) => cambiar("atuendo", e.target.value) }))) : null,
            ref.papel === "personaje" ? el("p", { class: "epl-ayuda" }, "Cada personaje es un sujeto (<Subject 1>, <Subject 2>…): el código " +
              "escribe su definición y su retención con el nombre, el pronombre y la ficha. Las fotos con el mismo nombre son el mismo " +
              "personaje. Con atuendo, la foto es además un atuendo y cada toma elige uno (su ficha describe esa ropa).") : null,
            ref.papel !== "no" ? el("label", {}, ref.papel === "efecto" ? "Ficha: la frase del efecto que va tal cual al prompt (en inglés)"
              : ref.papel === "personaje" ? "Ficha: cómo es el personaje (en inglés; va a su definición)" : "Ficha: qué se ve (en inglés; el LLM no ve la imagen)") : null,
            ref.papel !== "no" ? el("textarea", { class: "epl-ficha-txt", rows: 3, oninput: (e) => cambiar("ficha", e.target.value) }, ref.ficha || "") : null,
            ref.papel !== "no" && r.preview ? el("div", { class: "epl-fila" },
              el("button", { class: "epl-mini", title: "Qwen mira la imagen y propone la ficha y los riesgos; revísala",
                onclick: () => describir(r, ref, pintar) }, "👁 describir con visión"),
              ref.origen ? el("span", { class: "epl-ayuda" }, "ficha: " + ref.origen) : null) : null,
            ref.propuesta ? el("div", { class: "epl-propuesta" }, `Propuesta de Qwen: «${ref.propuesta.nombre}» · ${ref.propuesta.ficha}`,
              el("div", { class: "epl-fila" },
                el("button", { class: "epl-mini", onclick: () => {
                  ref.ficha = ref.propuesta.ficha;
                  if (lleva && ref.papel !== "personaje" && !ref.nombre) ref.nombre = ref.propuesta.nombre;
                  ref.origen = "visión, revisada";
                  delete ref.propuesta;
                  ctx.pedirMontaje(); refrescar(); pintar(); } }, "usar"),
                el("button", { class: "epl-mini", onclick: () => { delete ref.propuesta; pintar(); } }, "descartar"))) : null,
            ref.riesgos?.length ? el("div", { class: "epl-aviso" }, "⚠ riesgo: " + ref.riesgos.join(" · ")) : null,
            stack,
            ctx.bloqueTapar?.(r, v) || null,
            extra?.botones?.(r, v) || null,
            el("div", { class: "epl-usada" }, "usada en: " + ctx.usadaEn(r.tag)))));
    };
    pintar();
    return v;
  };
  let espera = null;
  const refrescar = () => { clearTimeout(espera); espera = setTimeout(() => { ctx.pintarRefs(); ctx.pintarToma?.(); }, 500); };

  async function describir(r, ref, repintar) {
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
    } catch (e) {
      ctx.avisar(`${r.tag}: ${e.message}`, "mal");
    } finally {
      clearInterval(reloj);
      S.ocupado = false;
      caja.classList.remove("ocupada");
      repintar();
    }
  }
}
