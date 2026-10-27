/* Sección 3 del editor: REFERENCIAS, en un estante encima de la línea de tiempo (interfaz P10, 27 oct): «Principal» (lo
 * que vale en todas las tomas: marca en_todas; el personaje empieza ahí) y «Secundarias» (lo que se presta a algunas tomas),
 * con pósters de 160×170, un color fijo por referencia (su sello Im1 / V1, el mismo que sus puntos en las tomas) y, al
 * final, los efectos de texto (E1, E2…). Un póster se arrastra a una toma (o al panel de la toma) para conectarlo, o a
 * otro grupo para cambiarlo; sin ratón, «Conectar a…». Tocarlo abre su ficha en una ventana centrada con pestañas.
 * Lee el RefMod Stack y el Media Loader del workflow, guarda papel/nombre/ficha de cada referencia por su clave, cambia el
 * Stack, abre la biblioteca de RefMods, enseña la ficha de cada referencia (al tocarla) y pide la ficha con visión.
 * Las cajitas (un RefMod con varias fotos) se abren y se crean en cajitas.js; «tapar con SAM» de la ficha está en tapar.js.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Las utilidades llegan en ctx.u, sin imports, para que
 * este archivo también se recargue al abrir la ventana. Los textos, con u.t("clave") (web/i18n/*.json); cada ventanita
 * guarda en v.repintar cómo volver a pintarse, para cambiar de idioma sin perder lo escrito. Planos: ../../planos/4 El editor.md. */

// papel → mitad. Su letrero: referencias.papel.<papel> (largo) y referencias.papel_corto.<papel> (en la franja)
export const PAPELES = {
  personaje: "izq", objeto: "izq", lugar: "izq", ropa: "der", pose: "der", fondo: "der", estilo: "der", efecto: "der", letra: "der",
  no: "der",
};
// campos de la toma que citan una referencia (los mismos que nucleo.CAMPO_PAPEL); «efecto» también puede ser E1, E2…
export const CAMPOS_REF = ["personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"];
export const PRONOMBRES = ["they", "she", "he"];       // van al prompt en inglés; solo «they» lleva letrero (por defecto)
const CONCEPTO = { identity: "personaje", clothing: "ropa", pose_motion: "pose", pose: "pose", background: "fondo",
                   scene: "fondo", style: "estilo" };
// los papeles de cada mitad (para elegir al subir o al añadir desde la biblioteca)
const PAPELES_LADO = { izq: ["personaje", "objeto", "lugar"], der: ["ropa", "pose", "fondo", "estilo", "efecto", "letra"] };
// al añadir desde una mitad, el papel que toca en ese lado según el concepto del RefMod
const POR_LADO = { izq: { identity: "personaje", background: "lugar", scene: "lugar", "": "objeto" },
                   der: { clothing: "ropa", identity: "ropa", pose_motion: "pose", pose: "pose", background: "fondo",
                          scene: "fondo", "": "estilo" } };
export const papelPorLado = (lado, concepto) => POR_LADO[lado][concepto] || POR_LADO[lado][""];
// la ayuda del nombre de cada papel: referencias.nombre.<papel>
const CON_NOMBRE = ["personaje", "objeto", "lugar", "ropa", "efecto"];
// de dónde salió la ficha (se guarda así en el estado) → su letrero, referencias.origen.<clave>
const ORIGENES = { RefMod: "RefMod", editor: "editor", "visión, revisada": "vision", cajita: "cajita", subida: "subida" };

/* Numeración igual que el Text Encode: primero los medios del Media Loader, después las tarjetas activas del Stack,
 * un contador por tipo (Picture / Video). Los avisos van como [clave, datos]: se escriben al pintar, en el idioma de ahora. */
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
    if (activa && (p.visual?.c || 1) > 1) avisos.push(["referencias.aviso.copias", { nombre: p.label }]);
    const kind = p.visual?.kind || "image";
    const tag = !activa ? null : kind === "video" ? `<Video ${++videos}>` : kind === "image" ? `<Picture ${++fotos}>` : null;
    items.push({ tag, nombre: p.label || p.name, clave: p.name, ref: p.name, preview: p.preview || p.name, idx, kind,
                 on: p.on !== false, fuerza: p.visual?.w ?? 1 });
  });
  if (fotos > 9) avisos.push(["referencias.aviso.fotos", { n: fotos }]);
  if (videos > 3) avisos.push(["referencias.aviso.videos", { n: videos }]);
  if (!pb) avisos.push(["referencias.aviso.sin_prompt_builder", {}]);
  if (!stack && !loader) avisos.push(["referencias.aviso.sin_stack", {}]);
  const audioNodo = origen(graph, node, "audio") || (pb && origen(graph, pb, "audio_1"));
  return { items, lista: items.filter((r) => r.tag), avisos, stack, audioNodo, audio: W(audioNodo || {}, "audio")?.value || "" };
}

/* Añade a ctx las funciones de la sección 3. Usa de ctx: u, S, wf, graph, node, caja, secRefs, biblioteca,
 * cajitas, avisar, pedirMontaje, pintarPlan, pintarToma, abrirCajita, crearCajita. */
export function instalar(ctx) {
  const { u, S, wf, graph, node, caja, secRefs } = ctx;
  const { el, W, leerJSON, api, t } = u;
  const papelLargo = (p) => t(`referencias.papel.${PAPELES[p] ? p : "no"}`);
  ctx.papelLargo = papelLargo;
  ctx.PAPELES_LADO = PAPELES_LADO;              // para subir.js
  const apagada = (r) => r.tag || t("comun.apagada");
  const origen = (o) => { const clave = ORIGENES[o]; return clave ? t(`referencias.origen.${clave}`) : o; };

  ctx.claveDe = (tag) => wf.lista.find((r) => r.tag === tag)?.clave;
  ctx.refDe = (tag) => S.refs[ctx.claveDe(tag)] || {};
  ctx.mapaEtiquetas = () => Object.fromEntries(wf.lista.map((r) => [r.tag, r.clave]));
  // las tomas guardan etiquetas: si los números cambiaron, se traducen por clave (lo que ya no está queda vacío)
  ctx.remapear = function remapear(antes) {
    const ahora = Object.fromEntries(wf.lista.map((r) => [r.clave, r.tag]));
    for (const t of S.plan.tomas) for (const c of CAMPOS_REF) if ((t[c] || "").startsWith("<")) t[c] = ahora[antes[t[c]]] || "";
    for (const x of S.plan.textos || []) if ((x.letra || "").startsWith("<")) x.letra = ahora[antes[x.letra]] || "";   // la letra de cada palabra
  };

  // ---- cómo se ve cada referencia
  ctx.vista = (r) => r.medio ? (r.kind === "image" ? u.vistaMedio(r.file) : "") : u.vistaRefmod(r.preview);
  ctx.fotosDe = (r) => (r.ref && ctx.cajitas[r.ref]) || null;           // fotos apuntadas de una cajita
  ctx.esCajita = (r) => !!ctx.fotosDe(r) || ctx.biblioteca[r.ref]?.visual?.source === "stack";
  ctx.nFotos = (r) => ctx.fotosDe(r)?.length || ctx.biblioteca[r.ref]?.visual?.t || 1;
  ctx.ladoDe = (r) => PAPELES[S.refs[r.clave]?.papel || "no"] || "der";

  // ---- Principal y Secundarias (27 oct): una referencia en Principal vale en todas las tomas (nucleo.con_todas)
  ctx.enTodas = (clave) => { const x = S.refs[clave]; return !!x && (x.en_todas ?? x.papel === "personaje"); };
  // un color fijo por referencia (por su orden) y su sello corto: <Picture 2> → Im2, <Video 1> → V1, E1 → E1
  const PALETA = ["#4ade80", "#38bdf8", "#facc15", "#f472b6", "#c4b5fd", "#fb923c", "#2dd4bf", "#f8fafc"];
  ctx.colorDe = (tag) => {
    const i = wf.lista.findIndex((r) => r.tag === tag);
    const n = i >= 0 ? i : wf.lista.length + Object.keys(S.efectos).indexOf(tag);
    return PALETA[(n < 0 ? 0 : n) % PALETA.length];
  };
  ctx.selloDe = (tag) => { const m = /^<(Picture|Video) (\d+)>$/.exec(tag || ""); return m ? (m[1] === "Video" ? "V" : "Im") + m[2] : tag || ""; };
  ctx.punto = (tag, extra = "") => el("span", { class: "epl-punto" + extra, style: { background: ctx.colorDe(tag) }, "data-punto": tag }, ctx.selloDe(tag));
  // lo que lleva la toma k: las de Principal y lo que cita (campos y referencias conectadas), sin repetir
  ctx.refsDeToma = function refsDeToma(k) {
    const toma = S.plan.tomas[k - 1];
    if (!toma) return [];
    const tags = [...wf.lista.filter((r) => ctx.enTodas(r.clave)).map((r) => r.tag),
                  ...CAMPOS_REF.map((c) => toma[c]), ...(toma.efectos || [])].filter(Boolean);
    return [...new Set(tags)].filter((x) => wf.lista.some((r) => r.tag === x) || S.efectos[x]);
  };
  const CAMPO_DE_PAPEL = { fondo: "fondo_ref", lugar: "lugar_ref", ropa: "ropa", pose: "pose", objeto: "objeto" };
  const fijarCampo = (toma, c) => { if (!toma.fijos.includes(c)) toma.fijos.push(c); };
  const nombreTag = (tag) => /^E\d+$/.test(tag) ? S.efectos[tag]?.nombre || tag : ctx.refDe(tag).nombre || wf.lista.find((r) => r.tag === tag)?.nombre || tag;
  const repintarTodo = () => { ctx.pintarToma(); ctx.pintarRefs(); ctx.pintarLinea(); ctx.pedirMontaje(); };
  // ¿puede recibir la toma k esta referencia? (no si va en Principal o ya está en ella)
  ctx.puedeRecibir = (tag, k) => !!tag && !(wf.lista.find((r) => r.tag === tag) && ctx.enTodas(ctx.claveDe(tag))) &&
                                 !ctx.refsDeToma(k).includes(tag);
  /* conectar una referencia a la toma k (arrastrar, «Conectar a…» o la ficha): un fondo, un lugar, una ropa, una pose o un
   * objeto van a su campo de la toma (el mismo dato que su menú; sustituye al que hubiera); lo demás se suma a sus
   * «Referencias» sin repetir. Una de Principal ya vale en todas: solo se avisa. */
  ctx.conectarRef = function conectarRef(tag, k) {
    const toma = S.plan.tomas[k - 1];
    if (!toma || !tag) return;
    const clave = ctx.claveDe(tag), ref = clave ? S.refs[clave] || {} : { papel: "efecto" };
    if (clave && ctx.enTodas(clave)) return ctx.avisar(t("referencias.en_todas_ya", { nombre: nombreTag(tag) }), "mal");
    const campo = CAMPO_DE_PAPEL[ref.papel] || (ref.papel === "personaje" && (ref.atuendo || "").trim() ? "personaje" : null);
    if (campo) {
      if (toma[campo] === tag) return ctx.avisar(t("referencias.ya_en_toma", { nombre: nombreTag(tag), k }), "mal");
      toma[campo] = tag;
      fijarCampo(toma, campo);
      if ((campo === "fondo_ref" || campo === "lugar_ref") && toma.entorno === "ninguno") toma.entorno = "auto";
    } else {
      const lista = (toma.efectos?.length ? toma.efectos : [toma.efecto]).filter(Boolean);
      if (lista.includes(tag)) return ctx.avisar(t("referencias.ya_en_toma", { nombre: nombreTag(tag), k }), "mal");
      toma.efectos = [...lista, tag];
      toma.efecto = toma.efectos[0];
      fijarCampo(toma, "efecto");
    }
    S.recien = { tag, k };      // su pegatina en la toma lleva «recién pegada» hasta que se toque la toma o la referencia
    repintarTodo();
    ctx.avisar(t(campo === "fondo_ref" ? "referencias.conectada_fondo" : "referencias.conectada", { nombre: nombreTag(tag), k }), "bien");
  };
  // quitarla de la toma k (de su campo y de las conectadas)
  ctx.desconectarRef = function desconectarRef(tag, k) {
    const toma = S.plan.tomas[k - 1];
    if (!toma) return;
    for (const c of CAMPOS_REF) if (toma[c] === tag) toma[c] = "";
    toma.efectos = (toma.efectos || []).filter((x) => x && x !== tag);
    toma.efecto = toma.efectos[0] || "";
    if (S.recien?.tag === tag && S.recien.k === k) S.recien = null;
    repintarTodo();
    ctx.avisar(t("referencias.desconectada", { nombre: nombreTag(tag), k }), "bien");
  };
  // pasarla a Principal (vale en todas las tomas; deja de citarse toma a toma) o a Secundarias
  ctx.ponerGrupo = function ponerGrupo(clave, principal) {
    const ref = S.refs[clave], tag = wf.items.find((r) => r.clave === clave)?.tag;
    if (!ref || ctx.enTodas(clave) === principal) return;
    ref.en_todas = principal;
    if (principal && tag) for (const toma of S.plan.tomas) {
      for (const c of CAMPOS_REF) if (toma[c] === tag) toma[c] = "";
      toma.efectos = (toma.efectos || []).filter((x) => x && x !== tag);
      toma.efecto = toma.efectos[0] || "";
    }
    repintarTodo();
    ctx.avisar(t(principal ? "referencias.a_principal" : "referencias.a_secundarias", { nombre: nombreTag(tag) || ref.nombre || clave }), "bien");
  };

  /* el arrastre de un póster: al empezar, las tomas que pueden recibirlo (y el panel de la toma) se marcan con un borde
   * discontinuo; la que está debajo, con uno grueso y «Soltar en la toma N». ctx.zonaToma lo pone en cada toma. */
  ctx.arrastre = null;
  const marcarZonas = (si) => {
    caja.classList.toggle("epl-arrastrando", si);
    caja.querySelectorAll("[data-soltar-toma]").forEach((z) => {
      z.classList.toggle("epl-puede", si && ctx.puedeRecibir(ctx.arrastre?.tag, +z.dataset.soltarToma));
      if (!si) z.classList.remove("epl-encima");
    });
    caja.querySelectorAll("[data-soltar-grupo]").forEach((z) => {
      const clave = ctx.arrastre?.clave;
      z.classList.toggle("epl-puede", si && !!clave && ctx.enTodas(clave) !== (z.dataset.soltarGrupo === "principal"));
      if (!si) z.classList.remove("epl-encima");
    });
  };
  const fuente = (nodo, tag, clave) => {
    nodo.draggable = true;
    nodo.addEventListener("dragstart", (e) => {
      ctx.arrastre = { tag, clave };
      try { e.dataTransfer.setData("text/plain", tag); e.dataTransfer.effectAllowed = "link"; } catch { /* sin dataTransfer */ }
      nodo.classList.add("epl-arrastrado");
      setTimeout(() => marcarZonas(true));      // después de que el navegador copie la imagen del arrastre
    });
    nodo.addEventListener("dragend", () => { nodo.classList.remove("epl-arrastrado"); marcarZonas(false); ctx.arrastre = null; });
  };
  const zona = (nodo, alSoltar) => {
    nodo.addEventListener("dragover", (e) => { if (!ctx.arrastre) return; e.preventDefault(); nodo.classList.add("epl-encima"); });
    nodo.addEventListener("dragleave", (e) => { if (!nodo.contains(e.relatedTarget)) nodo.classList.remove("epl-encima"); });
    nodo.addEventListener("drop", (e) => {
      if (!ctx.arrastre) return;
      e.preventDefault();
      e.stopPropagation();
      const a = ctx.arrastre;
      marcarZonas(false);
      ctx.arrastre = null;
      alSoltar(a);
    });
  };
  // una toma de la línea de tiempo, o el panel de la toma elegida, recibe referencias
  // (el panel se vuelve a pintar sin cambiar de nodo: sus escuchas se ponen una vez y la toma se lee al soltar)
  ctx.zonaToma = (nodo, k) => {
    nodo.dataset.soltarToma = k;
    nodo.dataset.soltar = t("referencias.soltar", { k });
    if (!nodo.eplZona) {
      nodo.eplZona = true;
      zona(nodo, (a) => { const kk = +nodo.dataset.soltarToma; if (S.elegida !== kk) ctx.elegir(kk); ctx.conectarRef(a.tag, kk); });
    }
    return nodo;
  };

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
      el("div", { class: "epl-tit" }, id ? t("referencias.efecto.titulo", { id }) : t("referencias.efecto.nuevo"),
        el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => v.cerrar() }, t("comun.cerrar")))),
      el("p", { class: "epl-ayuda" }, t("referencias.efecto.ayuda")),
      el("label", {}, t("referencias.efecto.nombre")),
      el("input", { class: "epl-nombre", value: e.nombre, placeholder: t("referencias.efecto.nombre.placeholder"), oninput: (x) => { e.nombre = x.target.value; } }),
      el("label", {}, t("referencias.efecto.frase")),
      el("textarea", { class: "epl-ficha-txt", rows: 3, placeholder: t("referencias.efecto.frase.placeholder"),
                       oninput: (x) => { e.ficha = x.target.value; } }, e.ficha),
      aviso,
      el("div", { class: "epl-fila" },
        el("button", { class: "epl-boton epl-azul", onclick: () => {
          if (!e.ficha.trim()) { aviso.textContent = "⚠ " + t("referencias.efecto.falta_frase"); return; }
          if (id) S.efectos[id] = { nombre: e.nombre.trim(), ficha: e.ficha.trim() }; else ctx.nuevoEfecto(e);
          v.cerrar(); ctx.pintarRefs(); ctx.pintarPlan(); ctx.pedirMontaje();
        } }, id ? t("comun.guardar") : t("referencias.efecto.crear")),
        id ? (pregunta
          ? el("span", { class: "epl-ayuda" }, t("referencias.efecto.pregunta_quitar") + " ",
              el("button", { class: "epl-mini", onclick: () => { ctx.quitarEfecto(id); v.cerrar(); ctx.pintarRefs(); ctx.pintarPlan(); ctx.pedirMontaje(); } }, t("comun.si")),
              el("button", { class: "epl-mini", onclick: () => { pregunta = false; pintar(); } }, t("comun.no")))
          : el("button", { class: "epl-mini", onclick: () => { pregunta = true; pintar(); } }, t("referencias.efecto.quitar"))) : null));
    v.repintar = pintar;
    pintar();
    return v;
  };

  // ---- cambiar las tarjetas del RefMod Stack (añadir, quitar, encender, fuerza): se escribe en su propio campo
  ctx.cambiarStack = function cambiarStack(cambio) {
    const st = wf.stack, w = W(st || {}, "stack_state");
    if (!w) return ctx.avisar(t("referencias.sin_stack_conectado"), "mal");
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
    ctx.avisar(t("referencias.quitada", { nombre: r.nombre }), "bien");
  };
  ctx.anadirDeBiblioteca = (it, lado, papel) => ctx.anadirVariosDeBiblioteca([it], lado, papel);
  /* añade varios RefMods de la biblioteca de una vez, en ese orden. Si no caben en las 12 tarjetas del Stack, no añade
   * ninguno y lanza un error (la biblioteca lo enseña dentro de su ventana). El papel: el elegido en la biblioteca; si no,
   * el que ya tenía esa referencia en el editor y, si es nueva, el que toca en esa mitad según el concepto del RefMod. */
  ctx.anadirVariosDeBiblioteca = function anadirVariosDeBiblioteca(its, lado, papel = "") {
    const hay = (leerJSON(W(wf.stack || {}, "stack_state")?.value, {}).picks || []).length;
    if (hay + its.length > 12) {
      throw new Error(t("referencias.no_caben", { hay, n: its.length, sobran: hay + its.length - 12 }));
    }
    for (const it of its) {
      if (lado && !S.refs[it.name]) {
        S.refs[it.name] = { papel: papelPorLado(lado, it.concept || ""), nombre: "",
                            ficha: (it.appearance || it.desc || "").slice(0, 300), origen: "RefMod" };
      }
      if (papel && S.refs[it.name]) S.refs[it.name].papel = papel;
    }
    ctx.cambiarStack((picks) => { for (const it of its) picks.push(ctx.tarjeta(it, picks)); });
  };

  // ---- ventanas sobre el editor (una a la vez). Quien la abre pone en v.repintar cómo pintarla de nuevo (al cambiar de
  // idioma, editor_core.js la llama con caja.querySelector(".epl-capa").epl.repintar)
  ctx.capa = function capa(lado, ...hijos) {
    caja.querySelector(".epl-capa")?.remove();
    const modal = el("div", { class: "epl-modal " + (lado || "") }, ...hijos);
    const c = el("div", { class: "epl-capa", onclick: (e) => { if (e.target === c) c.remove(); } }, modal);
    caja.append(c);
    c.epl = { capa: c, modal, cerrar: () => c.remove(), repintar: null };
    return c.epl;
  };

  /* control − / deslizador / + para el tamaño de los recuadros (biblioteca y creador de cajitas). `aplicar(tam)` lo pone
   * (la variable --epl-tam de la rejilla). Recuerda el último tamaño en localStorage (si el navegador no deja, no pasa nada). */
  ctx.controlTamano = function controlTamano(aplicar, clave, defecto, min = 110, max = 520) {
    let tam = defecto;
    try { const g = +localStorage.getItem(clave); if (g >= min && g <= max) tam = g; } catch { /* sin localStorage */ }
    const barra = el("input", { type: "range", min, max, step: 10, value: tam, class: "epl-tam-barra", title: t("comun.tamano"),
                                oninput: (e) => poner(+e.target.value) });
    const poner = (t) => {
      tam = Math.max(min, Math.min(max, Math.round(t)));
      aplicar(tam);
      barra.value = tam;
      try { localStorage.setItem(clave, String(tam)); } catch { /* sin localStorage */ }
    };
    poner(tam);
    return el("span", { class: "epl-tam", title: t("comun.tamano") },
      el("button", { class: "epl-mini", title: t("comun.mas_pequenos"), onclick: () => poner(tam - 40) }, "−"), barra,
      el("button", { class: "epl-mini", title: t("comun.mas_grandes"), onclick: () => poner(tam + 40) }, "+"));
  };

  /* biblioteca de RefMods con selección múltiple: tocar una foto la marca o la desmarca (✓); «Añadir (N)» mete todas las
   * marcadas en el Stack, en el orden en que se marcaron, y cierra. Buscar no borra lo marcado. */
  // opciones (la letra de una palabra, textos.js): {papel, alAnadir(nombres)}: el papel elegido y qué hacer al añadir
  ctx.abrirBiblioteca = function abrirBiblioteca(lado, opciones = {}) {
    const marcadas = [];                                   // nombres, en el orden en que se marcaron
    let papel = opciones.papel || "";                      // "" = el que ya tenía o el de su concepto
    const filtro = el("input", { oninput: () => pintar(), style: { flex: 1 } });
    const rejilla = el("div", { class: "epl-biblio-rejilla" });
    const aviso = el("p", { class: "epl-aviso epl-biblio-aviso" });
    const anadir = el("button", { class: "epl-boton epl-verde epl-grande epl-biblio-anadir", onclick: () => {
      const its = marcadas.map((n) => ctx.biblioteca[n]).filter(Boolean);
      try {
        ctx.anadirVariosDeBiblioteca(its, lado, papel);
        v.cerrar();
        opciones.alAnadir?.(its.map((it) => it.name));
        ctx.avisar(its.length === 1 ? t("referencias.biblioteca.anadida", { nombre: its[0].label || its[0].name })
                                    : t("referencias.biblioteca.anadidas", { n: its.length }), "bien");
      } catch (e) { aviso.textContent = "⚠ " + e.message; }
    } });
    const v = ctx.capa(lado);
    rejilla.addEventListener("click", (e) => { if (e.target === rejilla) ctx.abrirSubir(lado, opciones); });   // un hueco vacío
    // toda la ventana (también al cambiar de idioma): lo buscado y lo marcado se conservan
    v.repintar = () => {
      filtro.placeholder = t("referencias.biblioteca.buscar");
      v.modal.replaceChildren(
        el("div", { class: "epl-tit" }, t(lado === "izq" ? "referencias.biblioteca.titulo_izq" : "referencias.biblioteca.titulo_der"),
          el("span", { class: "der" }, filtro, ctx.controlTamano((x) => rejilla.style.setProperty("--epl-tam", x + "px"), "epl-tam-biblioteca", 270),
            el("button", { class: "epl-boton epl-verde epl-grande epl-subir", title: t("referencias.subir.tooltip"), onclick: () => ctx.abrirSubir(lado, opciones) }, t("referencias.subir")),
            el("button", { class: "epl-mini", onclick: () => v.cerrar() }, t("comun.cerrar")))),
        el("p", { class: "epl-ayuda" }, t("referencias.biblioteca.ayuda")),
        rejilla,
        el("div", { class: "epl-biblio-pie" }, aviso,
          el("label", { title: t("referencias.biblioteca.papel.tooltip") }, t("referencias.ficha.papel") + " ",
            el("select", { class: "epl-biblio-papel", onchange: (e) => { papel = e.target.value; } },
              el("option", { value: "", selected: !papel }, t("referencias.biblioteca.papel.auto")),
              ...PAPELES_LADO[lado].map((p) => el("option", { value: p, selected: papel === p }, papelLargo(p))))),
          anadir));
      pintar();
      contar();
    };
    const contar = () => {
      anadir.textContent = t("referencias.biblioteca.anadir", { n: marcadas.length });
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
              (it.visual?.source === "stack" ? t("referencias.biblioteca.cajita_de", { n: it.visual.t }) : "")));
          return item;
        }));
    };
    v.repintar();
    filtro.focus();
  };

  // «⬆ Subir» (fotos y videos, con recorte, tramo y modo) está en subir.js: ctx.subirFoto y ctx.abrirSubir

  /* en la ficha de una referencia subida (con su .fuente.json): su modo, comprimido o completo, y un botón para pasarla al
   * otro (rutas.cambiar_modo crea «<nombre>__comprimido» o «__completo», o lo reutiliza, y la tarjeta del Stack cambia). */
  ctx.fuentes = ctx.fuentes || {};
  ctx.bloqueModo = function bloqueModo(r, v) {
    if (!r.ref || r.idx === undefined) return null;
    const f = ctx.fuentes[r.ref];
    if (f === undefined) {
      ctx.fuentes[r.ref] = null;
      api("fuente", { nombre: r.ref }).then((x) => { ctx.fuentes[r.ref] = x || {}; v.repintar?.(); }).catch(() => { ctx.fuentes[r.ref] = {}; });
      return null;
    }
    if (!f?.modo) return null;
    const otro = f.modo === "comprimido" ? "completo" : "comprimido";
    return el("div", { class: "epl-fila epl-modo-ficha" },
      el("span", { class: "epl-ayuda", title: t(`referencias.subir.modo.${f.modo}.tooltip`) },
        t("referencias.modo.actual", { modo: t(`referencias.subir.modo.${f.modo}`) })),
      el("button", { class: "epl-mini", title: t(`referencias.subir.modo.${otro}.tooltip`), onclick: async () => {
        if (S.ocupado) return;
        S.ocupado = true; caja.classList.add("ocupada");
        ctx.avisar(t("referencias.modo.cambiando", { modo: t(`referencias.subir.modo.${otro}`) }), "trabajando");
        try {
          const res = await api("cambiar_modo", { nombre: r.ref, modo: otro });
          await ctx.cargarBiblioteca();
          ctx.fuentes[res.nombre] = undefined;
          const nueva = ctx.cambiarTarjeta(r, res.nombre);
          v.cerrar();
          if (nueva) ctx.abrirFicha(nueva);
          ctx.avisar(t("referencias.modo.cambiado", { nombre: res.nombre, modo: t(`referencias.subir.modo.${otro}`) }), "bien");
        } catch (e) { ctx.avisar(t("referencias.modo.error", { error: e.message }), "mal"); }
        finally { S.ocupado = false; caja.classList.remove("ocupada"); }
      } }, t("referencias.modo.pasar", { modo: t(`referencias.subir.modo.${otro}`) })));
  };

  // ---- dónde se usa cada referencia
  ctx.usadaEn = function usadaEn(tag) {
    if (!tag) return t("referencias.usada.apagada");
    const r = ctx.refDe(tag);
    const tomas = S.plan.tomas.map((x, i) => CAMPOS_REF.some((c) => x[c] === tag) ? t("comun.toma_corta", { k: i + 1 }) : null).filter(Boolean);
    if (r.papel === "personaje") tomas.unshift(t(r.atuendo ? "referencias.usada.definicion" : "referencias.usada.definicion_todas"));
    if (r.papel === "objeto") tomas.unshift(t("referencias.usada.definicion"));
    if (r.papel === "estilo") tomas.unshift(t("referencias.usada.todo"));
    for (const x of S.plan.textos || []) if (x.letra === tag) tomas.push(t("referencias.usada.texto", { texto: x.texto }));
    return tomas.length ? tomas.join(" · ") : t("referencias.usada.sin_usar");
  };
  // lo que usa la toma k: lo que cita, más la identidad (personaje sin nombre) y el estilo, que valen para todas
  ctx.usadasEnToma = function usadasEnToma(k) {
    const toma = S.plan.tomas[k - 1], usadas = new Set(toma ? CAMPOS_REF.map((c) => toma[c]).filter(Boolean) : []);
    for (const x of ctx.textosDeToma?.(k) || []) if (x.letra) usadas.add(x.letra);     // la letra de sus palabras
    for (const r of wf.lista) {
      const ref = S.refs[r.clave] || {};
      if ((ref.papel === "personaje" && !(ref.atuendo || "").trim()) || ref.papel === "estilo") usadas.add(r.tag);
    }
    return usadas;
  };
  // marca la referencia y las tomas que la usan (lo usa también el prompt final al pasar el ratón)
  ctx.resaltar = function resaltar(tag, si) {
    caja.querySelectorAll(`[data-tag="${tag}"]`).forEach((e) => e.classList.toggle("epl-hl", si));
    S.plan.tomas.forEach((toma, i) => {
      if (CAMPOS_REF.some((c) => toma[c] === tag)) caja.querySelector(`#epl-tomab-${i + 1}`)?.classList.toggle("epl-hl", si);
    });
  };

  /* ---- un póster del estante: la foto (o la primera de una cajita) recortada a 160×170, con su sello de color (Im1, V1),
   * «Conectar a…» y la ✕ del Stack arriba, y abajo su nombre y su papel. Se arrastra; tocarlo abre la ficha. */
  function poster(r, usadas) {
    const ref = S.refs[r.clave] || {};
    const fotos = ctx.fotosDe(r), cajita = ctx.esCajita(r);
    const src = fotos ? u.vistaMedio(fotos[0].file) : ctx.vista(r);
    const papel = ref.papel && PAPELES[ref.papel] ? ref.papel : "no";
    const marca = !r.tag ? " apagada" : usadas?.has(r.tag) ? " usada" : "";
    const p = el("div", { class: "epl-poster" + marca, "data-tag": r.tag || "", "data-clave": r.clave, title: r.nombre,
                          style: { "--c": r.tag ? ctx.colorDe(r.tag) : "#555" },
                          onmouseenter: () => r.tag && ctx.resaltar(r.tag, true), onmouseleave: () => r.tag && ctx.resaltar(r.tag, false) },
      el("button", { class: "epl-poster-abrir", title: t("referencias.ficha.abrir", { nombre: r.nombre }),
                     onclick: () => {
                       if (S.recien?.tag === r.tag) { S.recien = null; ctx.pintarLinea(); }   // tocar la referencia quita «recién pegada»
                       return cajita ? ctx.abrirCajita(r) : ctx.abrirFicha(r);
                     } },
        src ? el("img", { src, alt: "", loading: "lazy", draggable: false })
            : el("span", { class: "sinfoto" }, t(r.kind === "video" ? "referencias.tarjeta.video" : "comun.sin_vista_previa")),
        el("span", { class: "epl-poster-pie" },
          el("b", {}, ref.nombre || r.nombre),
          el("span", { class: "epl-papel " + papel }, t(`referencias.papel_corto.${papel}`)),
          cajita ? el("small", {}, t("referencias.tarjeta.fotos", { n: ctx.nFotos(r) })) : null)),
      r.tag ? ctx.punto(r.tag, " epl-sello") : el("span", { class: "epl-punto epl-sello apagado" }, t("comun.apagada")),
      el("span", { class: "epl-poster-botones" }, r.tag ? botonConectar(r.tag) : null, r.idx !== undefined ? cruz(r) : null));
    if (r.tag) fuente(p, r.tag, r.clave);
    return p;
  }
  /* «Conectar a…»: un menú con las tomas (la alternativa sin ratón al arrastre). Una de Principal solo dice que ya está en
   * todas; una toma que ya la lleva sale marcada y, al tocarla, se quita. */
  function botonConectar(tag) {
    return el("button", { class: "epl-mini epl-conectar", title: t("referencias.conectar.tooltip", { tag }), "aria-haspopup": "menu",
                          onclick: (e) => { e.stopPropagation(); menuConectar(e.currentTarget, tag); } }, u.icono("enlace"));
  }
  function menuConectar(boton, tag) {
    caja.querySelector(".epl-menu-conectar")?.remove();
    const clave = ctx.claveDe(tag), principal = clave && ctx.enTodas(clave);
    const cerrar = () => { m.remove(); document.removeEventListener("pointerdown", fuera, true); };
    const fuera = (e) => { if (!m.contains(e.target) && e.target !== boton) cerrar(); };
    const m = el("div", { class: "epl-menu-conectar", role: "menu" },
      el("p", { class: "epl-ayuda" }, principal ? t("referencias.conectar.principal") : t("referencias.conectar", { tag: ctx.selloDe(tag) })),
      ...(principal ? [] : S.plan.tomas.map((_, i) => {
        const k = i + 1, ya = ctx.refsDeToma(k).includes(tag);
        return el("button", { class: "epl-mini" + (ya ? " fijo" : ""), role: "menuitem", "data-k": k,
                              title: t(ya ? "referencias.conectar.quitar" : "referencias.conectar.poner", { k }),
                              onclick: () => { cerrar(); ya ? ctx.desconectarRef(tag, k) : ctx.conectarRef(tag, k); } },
          t("linea.toma", { k }));
      })));
    const r = boton.getBoundingClientRect(), c = caja.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(r.left - c.left, c.width - 240)) + "px";
    m.style.bottom = (c.bottom - r.top + 4) + "px";
    caja.append(m);
    m.querySelector("button")?.focus();
    m.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); boton.focus(); } });
    setTimeout(() => document.addEventListener("pointerdown", fuera, true));
  }
  /* la ✕ de cada póster del Stack: la quita al momento (ctx.quitarDelStack), sin preguntar; se puede volver a añadir desde
   * la biblioteca. Ningún toque aquí abre la ficha. */
  function cruz(r) {
    return el("button", { class: "epl-mini epl-quitar-poster", title: t("referencias.quitar_del_stack"), "aria-label": t("referencias.quitar_del_stack"),
      onclick: (e) => { e.stopPropagation(); ctx.quitarDelStack(r); } }, u.icono("x"));
  }

  // un grupo sin referencias: toda la caja es un botón que abre «Subir foto» (sin Stack, solo el aviso)
  const vacia = (lado) => !wf.stack ? el("p", { class: "epl-vacio" }, t(`referencias.${lado}.vacio`))
    : el("div", { class: "epl-vacia", title: t("referencias.vacia.tooltip"), onclick: () => ctx.abrirSubir(lado) },
        el("span", { class: "mas" }, u.icono("subir")), el("b", {}, t("referencias.vacia.subir")), el("span", {}, t(`referencias.${lado}.vacio`)));
  ctx.pintarRefs = function pintarRefs() {
    const usadas = S.elegida ? new Set(ctx.refsDeToma(S.elegida)) : null;
    const principal = wf.items.filter((r) => r.tag && ctx.enTodas(r.clave)), resto = wf.items.filter((r) => !(r.tag && ctx.enTodas(r.clave)));
    // en Secundarias: primero las activas con papel, después las de «no usar» y las apagadas
    const orden = (r) => (!r.tag ? 2 : (S.refs[r.clave]?.papel || "no") === "no" ? 1 : 0);
    resto.sort((a, b) => orden(a) - orden(b));
    // lado de la biblioteca y de «Subir»: Principal = lo que no cambia (izq); Secundarias = lo que se presta (der)
    const botones = (lado) => el("span", { class: "der" },
      wf.stack ? el("button", { class: "epl-boton epl-verde epl-anadir", onclick: () => ctx.abrirBiblioteca(lado, {
        alAnadir: (nombres) => { for (const n of nombres) if (S.refs[n]) S.refs[n].en_todas = lado === "izq"; ctx.pintarRefs(); ctx.pintarLinea(); ctx.pedirMontaje(); } }) },
        t("referencias.anadir")) : null,
      wf.stack ? el("button", { class: "epl-mini", onclick: () => ctx.crearCajita({ lado }) }, t("referencias.cajita")) : null);
    // efectos de texto: tocar uno lo pone o lo quita en la toma elegida; sin toma elegida, se abre para cambiarlo
    const toma = S.elegida ? S.plan.tomas[S.elegida - 1] : null;
    const fichas = el("div", { class: "epl-efectos" }, el("span", { class: "epl-ayuda", style: { margin: 0 } }, t("referencias.efectos")),
      ...Object.entries(S.efectos).map(([c, e]) => {
        const puesta = toma && ctx.refsDeToma(S.elegida).includes(c);
        return el("span", { class: "epl-efecto" + (toma ? (puesta ? " usada" : " atenuada") : ""), "data-efecto": c,
                     title: e.ficha + "\n\n" + t(toma ? "referencias.efecto.tocar_toma" : "referencias.efecto.tocar"),
                     onclick: () => {
                       if (!toma) return ctx.abrirEfecto(c);
                       if (puesta) ctx.desconectarRef(c, S.elegida); else ctx.conectarRef(c, S.elegida); } },
          ctx.punto(c), e.nombre || e.ficha.split(/\s+/).slice(0, 4).join(" "),
          toma ? el("button", { class: "epl-mini", title: t("referencias.efecto.editar.tooltip"), onclick: (x) => { x.stopPropagation(); ctx.abrirEfecto(c); } }, u.icono("lapiz")) : null);
      }),
      el("button", { class: "epl-mini", title: t("referencias.efecto.anadir.tooltip"), onclick: () => ctx.abrirEfecto(null) }, t("referencias.efecto.anadir")));
    const grupo = (g, lado, lista, extra) => {
      const caja2 = el("div", { class: "epl-grupo epl-grupo-" + g, "data-soltar-grupo": g, "data-soltar": t("referencias.pasar_a", { grupo: t(`referencias.${g}`) }) },
        el("div", { class: "epl-tit" }, el("span", { class: "epl-tit-txt" }, t(`referencias.${g}`)),
          el("span", { class: "epl-ayuda", style: { margin: 0 } }, t(`referencias.${g}.sub`)), botones(lado)),
        el("div", { class: "epl-posters" }, ...(lista.length ? lista.map((r) => poster(r, usadas)) : [vacia(lado)]), ...(extra ? [extra] : [])));
      zona(caja2, (a) => a.clave && ctx.ponerGrupo(a.clave, g === "principal"));
      return caja2;
    };
    secRefs.replaceChildren(
      ...wf.avisos.map(([clave, datos]) => el("p", { class: "epl-aviso" }, "⚠ " + t(clave, datos))),
      el("div", { class: "epl-estante" }, grupo("principal", "izq", principal), el("span", { class: "epl-estante-barra" }),
        grupo("secundarias", "der", resto, fichas)));
  };

  // ---- la ficha de una referencia (al tocarla): foto grande y todos sus controles. `extra` (cajitas.js) cambia la
  // parte izquierda (las fotos de la cajita) y añade botones.
  ctx.abrirFicha = function abrirFicha(r0, extra, primera = "ficha") {
    let r = r0, pestana = primera;
    const v = ctx.capa(ctx.ladoDe(r));
    const pintar = () => {
      r = wf.items.find((x) => x.clave === r.clave) || r;
      const ref = S.refs[r.clave] || (S.refs[r.clave] = { papel: "no", nombre: "", ficha: "" });
      const cambiar = (k, val) => { ref[k] = val; ref.origen = "editor"; ctx.pedirMontaje(); refrescar(); };
      const src = ctx.vista(r);
      const stack = r.idx === undefined ? null : el("div", { class: "epl-fila" },
        el("label", { title: t("referencias.ficha.apagada.tooltip"), style: { margin: 0 } },
          el("input", { type: "checkbox", checked: r.on, onchange: (e) => { ctx.cambiarStack((p) => { p[r.idx].on = e.target.checked; }); pintar(); } }),
          " " + t("referencias.ficha.activa")),
        el("label", { title: t("referencias.ficha.fuerza.tooltip"), style: { margin: 0 } }, t("referencias.ficha.fuerza") + " ",
          el("input", { type: "number", min: 0, max: 10, step: 0.05, value: r.fuerza, class: "corto",
            onchange: (e) => { ctx.cambiarStack((p) => {
              const val = Math.max(0, Math.min(10, +e.target.value || 0));
              p[r.idx].visual = { ...(p[r.idx].visual || {}), mode: "weight", w: val };
            }); pintar(); } })));
      const lleva = CON_NOMBRE.includes(ref.papel);
      const izquierda = extra?.izquierda?.(r) || el("div", { class: "grande" },
        src ? el("div", { class: "fondo", style: { backgroundImage: `url("${src}")` } }) : null,
        clipDe(r, src, pintar) || (src ? el("img", { src, alt: "" }) : el("div", { class: "epl-vacio", style: { padding: "20px" } }, t("comun.sin_vista_previa"))));
      /* (27 oct) una ventana centrada de tamaño medio: la foto a la izquierda y tres pestañas a la derecha. Ficha: papel,
       * nombre, ficha y visión (y los botones de una cajita y quitar). Tomas: Principal o Secundarias y en qué tomas está.
       * Avanzado: los renglones de arriba del prompt, activa y fuerza, el modo y tapar con SAM. */
      v.modal.className = "epl-modal epl-ficha-modal " + ctx.ladoDe(r);
      const quitar = r.idx === undefined ? null : el("button", { class: "epl-mini", title: t("referencias.quitar_del_stack"),
        onclick: () => { v.cerrar(); ctx.quitarDelStack(r); } }, t("referencias.ficha.quitar"));
      const pestanaFicha = () => [
            el("label", {}, t("referencias.ficha.papel")),
            el("select", { class: "epl-papel-sel", onchange: (e) => { cambiar("papel", e.target.value); ctx.pintarRefs(); ctx.pintarPlan(); pintar(); } },
              el("optgroup", { label: t("referencias.mitad.izq") }, ...["personaje", "objeto", "lugar"].map((p) =>
                el("option", { value: p, selected: ref.papel === p }, papelLargo(p)))),
              el("optgroup", { label: t("referencias.mitad.der") }, ...PAPELES_LADO.der.map((p) =>
                el("option", { value: p, selected: ref.papel === p }, papelLargo(p)))),
              el("option", { value: "no", selected: ref.papel === "no" || !PAPELES[ref.papel] }, papelLargo("no"))),
            lleva ? el("label", {}, t(ref.papel === "personaje" ? "referencias.ficha.nombre_personaje" : "referencias.ficha.nombre_prompt")) : null,
            lleva ? el("input", { class: "epl-nombre", value: ref.nombre || "", placeholder: t(`referencias.nombre.${ref.papel}`),
                                  oninput: (e) => cambiar("nombre", e.target.value) }) : null,
            ref.papel === "personaje" ? el("div", { class: "epl-fila" },
              el("label", { style: { margin: 0 } }, t("referencias.ficha.pronombre") + " ",
                el("select", { class: "epl-pronombre", onchange: (e) => cambiar("pronombre", e.target.value) },
                  ...PRONOMBRES.map((p) => el("option", { value: p, selected: (ref.pronombre || "they") === p },
                                              p === "they" ? t("referencias.pronombre.they") : p)))),
              el("label", { style: { margin: 0, flex: 1 } }, t("referencias.ficha.atuendo") + " ",
                el("input", { class: "epl-atuendo", value: ref.atuendo || "", placeholder: t("referencias.ficha.atuendo.placeholder"),
                              oninput: (e) => cambiar("atuendo", e.target.value) }))) : null,
            ref.papel === "personaje" ? el("p", { class: "epl-ayuda" }, t("referencias.ficha.personaje.ayuda")) : null,
            ref.papel !== "no" ? el("label", {}, t(ref.papel === "efecto" ? "referencias.ficha.ficha_efecto"
              : ref.papel === "personaje" ? "referencias.ficha.ficha_personaje" : "referencias.ficha.ficha")) : null,
            ref.papel !== "no" ? el("textarea", { class: "epl-ficha-txt", rows: 3, oninput: (e) => cambiar("ficha", e.target.value) }, ref.ficha || "") : null,
            ref.papel !== "no" && r.preview ? el("div", { class: "epl-fila" },
              el("button", { class: "epl-mini", title: t("referencias.ficha.describir.tooltip"),
                onclick: () => describir(r, ref, pintar) }, u.icono("ojo"), " " + t("referencias.ficha.describir")),
              ref.origen ? el("span", { class: "epl-ayuda" }, t("referencias.ficha.origen", { origen: origen(ref.origen) })) : null) : null,
            ref.propuesta ? el("div", { class: "epl-propuesta" }, t("referencias.propuesta", { nombre: ref.propuesta.nombre, ficha: ref.propuesta.ficha }),
              el("div", { class: "epl-fila" },
                el("button", { class: "epl-mini", onclick: () => {
                  ref.ficha = ref.propuesta.ficha;
                  if (lleva && ref.papel !== "personaje" && !ref.nombre) ref.nombre = ref.propuesta.nombre;
                  ref.origen = "visión, revisada";
                  delete ref.propuesta;
                  ctx.pedirMontaje(); refrescar(); pintar(); } }, t("referencias.propuesta.usar")),
                el("button", { class: "epl-mini", onclick: () => { delete ref.propuesta; pintar(); } }, t("referencias.propuesta.descartar")))) : null,
            ref.riesgos?.length ? el("div", { class: "epl-aviso" }, t("referencias.riesgo", { lista: ref.riesgos.join(" · ") })) : null,
            extra?.botones?.(r, v) || null,
            quitar ? el("div", { class: "epl-fila" }, quitar) : null];
      const principal = ctx.enTodas(r.clave);
      const pestanaTomas = () => [
            el("label", {}, t("referencias.ficha.grupo")),
            el("div", { class: "epl-fila epl-grupo-sel", role: "group" },
              ...[["principal", true], ["secundarias", false]].map(([g, si]) => el("button", {
                class: "epl-mini" + (principal === si ? " fijo" : ""), "data-grupo": g, "aria-pressed": String(principal === si),
                disabled: !r.tag, onclick: () => { ctx.ponerGrupo(r.clave, si); pintar(); } }, t(`referencias.${g}`)))),
            el("p", { class: "epl-ayuda" }, t(principal ? "referencias.principal.ayuda" : "referencias.secundarias.ayuda")),
            el("label", {}, t("referencias.ficha.tomas")),
            !r.tag ? el("p", { class: "epl-ayuda" }, t("referencias.usada.apagada"))
              : principal ? el("p", { class: "epl-ayuda" }, t("referencias.conectar.principal"))
              : el("div", { class: "epl-ficha-tomas" }, ...S.plan.tomas.map((_, i) => {
                  const k = i + 1, ya = ctx.refsDeToma(k).includes(r.tag);
                  return el("label", { class: "epl-ficha-toma" }, el("input", { type: "checkbox", checked: ya, "data-k": k,
                    onchange: () => { if (ya) ctx.desconectarRef(r.tag, k); else ctx.conectarRef(r.tag, k); pintar(); } }),
                    " " + t("linea.toma", { k }));
                })),
            el("div", { class: "epl-usada" }, t("referencias.usada_en", { lista: ctx.usadaEn(r.tag) }))];
      const pestanaAvanzado = () => [
            ref.papel !== "no" ? renglonesArriba(r, ref, cambiar) : null,
            stack,
            ctx.bloqueModo?.(r, v) || null,
            ctx.bloqueTapar?.(r, v) || null];
      const PESTANAS = { ficha: pestanaFicha, tomas: pestanaTomas, avanzado: pestanaAvanzado };
      if (!PESTANAS[pestana]) pestana = "ficha";
      v.modal.replaceChildren(
        el("div", { class: "epl-tit" }, r.tag ? ctx.punto(r.tag, " epl-sello-ficha") : null,
          el("b", { style: { color: "#cfe0ff" } }, apagada(r)), r.nombre,
          el("span", { class: "der" }, el("button", { class: "epl-mini epl-cerrar-ficha", title: t("comun.cerrar"), "aria-label": t("comun.cerrar"),
                                                       onclick: () => v.cerrar() }, u.icono("x")))),
        el("div", { class: "epl-ficha" }, izquierda,
          el("div", { class: "epl-ficha-der" },
            el("div", { class: "epl-pestanas-ficha", role: "tablist" }, ...Object.keys(PESTANAS).map((k) =>
              el("button", { class: "epl-mini epl-seg" + (pestana === k ? " fijo" : ""), role: "tab", "aria-selected": String(pestana === k), "data-pestana": k,
                             onclick: () => { pestana = k; pintar(); } }, t(`referencias.ficha.pestana.${k}`)))),
            el("div", { class: "epl-pestana-ficha", role: "tabpanel" }, ...PESTANAS[pestana]().filter(Boolean)))));
    };
    v.repintar = pintar;
    pintar();
    return v;
  };
  /* un RefMod de tipo clip (no una cajita) se ve en movimiento en su ficha: su video de origen, que busca el servidor
   * (rutas.video_de: su .fuente.json o un video de input/ con su mismo nombre). Mientras lo busca, o si no lo encuentra,
   * se ve su primer fotograma con un aviso. ctx.clips guarda la respuesta de cada RefMod. */
  ctx.clips = ctx.clips || {};
  function clipDe(r, src, repintar) {
    if (r.kind !== "video" || !r.ref || ctx.esCajita(r)) return null;
    if (ctx.fuentes[r.ref] === undefined) {
      ctx.fuentes[r.ref] = null;
      api("fuente", { nombre: r.ref }).then((x) => { ctx.fuentes[r.ref] = x || {}; repintar(); }).catch(() => { ctx.fuentes[r.ref] = {}; });
    }
    const ya = ctx.clips[r.ref];
    if (ya === undefined) {
      ctx.clips[r.ref] = null;
      api("video_de", { nombre: r.ref }).then((x) => { ctx.clips[r.ref] = x.file || ""; repintar(); })
        .catch(() => { ctx.clips[r.ref] = ""; repintar(); });
    }
    if (!ya) {
      return el("div", { class: "epl-clip" }, src ? el("img", { src, alt: "" }) : null,
        el("span", { class: "epl-clip-nota" }, t(ya === "" ? "referencias.clip.sin_video" : "referencias.clip.buscando")));
    }
    const v = el("video", { src: u.vistaMedio(ya), autoplay: true, loop: true, playsinline: true, class: "epl-clip-video" });
    v.muted = true;
    const nota = el("span", { class: "epl-clip-nota" }, t("referencias.clip.de", { file: ya.replace(/ \[input\]$/, "") }));
    // una referencia subida desde esta ventana (con .fuente.json): su recorte se puede cambiar aquí mismo, sobre el video
    // original; «Aplicar recorte» aparece al cambiarlo y rehace el RefMod con el mismo nombre (rutas.recortar)
    const f = ctx.fuentes[r.ref];
    if (!f?.items?.length || !ctx.editorRecorte) return el("div", { class: "epl-clip" }, v, nota);
    const x = { recorte: f.items[0].crop ? { ...f.items[0].crop } : null };
    const antes = JSON.stringify(x.recorte);
    const aplicar = el("button", { class: "epl-boton epl-verde epl-aplicar-recorte", style: { display: "none" }, onclick: async () => {
      if (S.ocupado) return;
      S.ocupado = true; caja.classList.add("ocupada");
      ctx.avisar(t("referencias.recorte.aplicando"), "trabajando");
      try {
        const res = await api("recortar", { nombre: r.ref, recorte: x.recorte });
        ctx.fuentes[r.ref] = undefined;
        await ctx.cargarBiblioteca();
        ctx.pintarRefs(); ctx.pedirMontaje();
        ctx.avisar(t("referencias.recorte.aplicado", { nombre: r.ref, s: u.num(res.segundos) }), "bien");
        repintar();
      } catch (e) { ctx.avisar(t("referencias.recorte.error", { error: e.message }), "mal"); }
      finally { S.ocupado = false; caja.classList.remove("ocupada"); }
    } }, t("referencias.recorte.aplicar"));
    const { marco, botonCortar, infoRecorte } = ctx.editorRecorte(v, x, () => {
      aplicar.style.display = JSON.stringify(x.recorte) === antes ? "none" : "";
    });
    return el("div", { class: "epl-clip editable" }, marco, el("div", { class: "epl-fila" }, botonCortar, infoRecorte, aplicar), nota);
  }

  /* los dos renglones de arriba del prompt de esta referencia (subject_definitions y retention_analysis): vacíos, la frase
   * de su papel en frases.json, que se ve en gris (S.lineasRef, del último montaje); lo que escribas va tal cual */
  function renglonesArriba(r, ref, cambiar) {
    const auto = S.lineasRef[r.tag] || {};
    const campo = (k, etiqueta) => el("label", {}, t(etiqueta),
      el("textarea", { class: "epl-renglon", "data-renglon": k, rows: 2, placeholder: auto[k] || t("referencias.renglon.sin_frase"),
                       oninput: (e) => cambiar(k, e.target.value) }, ref[k] || ""));
    return el("details", { class: "epl-renglones", open: !!(ref.presentacion || ref.copia) },
      el("summary", {}, t("referencias.renglones")),
      el("p", { class: "epl-ayuda" }, t("referencias.renglones.ayuda")),
      campo("presentacion", "referencias.renglon.presentacion"), campo("copia", "referencias.renglon.copia"));
  }
  let espera = null;
  const refrescar = () => { clearTimeout(espera); espera = setTimeout(() => { ctx.pintarRefs(); ctx.pintarToma?.(); }, 500); };

  async function describir(r, ref, repintar) {
    if (S.ocupado) return;
    S.ocupado = true;
    caja.classList.add("ocupada");
    const t0 = Date.now();
    const reloj = setInterval(() => ctx.avisar(t("referencias.mirando", { tag: r.tag, s: Math.round((Date.now() - t0) / 1000) }), "trabajando"), 500);
    try {
      const d = await api("describir", { preview: r.preview, papel: ref.papel });
      // la ficha no se cambia sola: Qwen se equivoca en objetos pequeños (estudio nombrar_refmods); decide el usuario
      ref.propuesta = { ficha: d.ficha, nombre: d.nombre };
      ref.riesgos = d.riesgos;
      ctx.avisar(t("referencias.propuesta_lista", { tag: r.tag, s: u.num(d.segundos) }), "bien");
    } catch (e) {
      ctx.avisar(t("comun.error_de", { tarea: r.tag, error: e.message }), "mal");
    } finally {
      clearInterval(reloj);
      S.ocupado = false;
      caja.classList.remove("ocupada");
      repintar();
    }
  }
}
