/* Editor todo en uno de «Prompt del edit (LLM)». Planos: ../planos/4 El editor.md.
 * Tres columnas: REFERENCIAS (del RefMod Stack conectado) · PROMPT FUNDAMENTAL (el plan que lee y extiende el LLM)
 * · PROMPT FINAL (lo que recibe H3). El trabajo lo hace el servidor (rutas /edit_prompt_llm/*, nucleo.py); aquí solo se
 * muestra, se edita y se guarda. Se vuelve a cargar cada vez que se abre la ventana. */

const PAPELES = [["personaje", "personaje / atuendo"], ["pose", "pose"], ["fondo", "fondo"], ["estilo", "estilo"],
                 ["no", "no usar"]];
const CONCEPTO = { identity: "personaje", clothing: "personaje", pose_motion: "pose", pose: "pose", background: "fondo",
                   scene: "fondo", style: "estilo" };
const ENCUADRES = ["extreme close-up", "close-up", "medium close-up"];
const HISTORIA = ["lugar", "momento", "personaje", "pose", "fondo_ref", "efecto"];
const DIRECCION = ["encuadre", "luz", "gesto", "camara"];

// ------------------------------------------------------------ utilidades
const el = (tag, props = {}, ...hijos) => {
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
const W = (node, nombre) => node.widgets?.find((w) => w.name === nombre);
const enlace = (graph, id) => (graph.links?.get ? graph.links.get(id) : graph.links?.[id]);
const leerJSON = (t, otro) => { try { return t ? JSON.parse(t) : otro; } catch { return otro; } };

async function api(ruta, cuerpo) {
  const r = await fetch("/edit_prompt_llm/" + ruta, cuerpo === undefined ? undefined :
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({ error: `respuesta no válida (${r.status})` }));
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}

function origen(graph, node, entrada) {
  const inp = node.inputs?.find((i) => i.name === entrada);
  const l = inp?.link != null ? enlace(graph, inp.link) : null;
  return l ? graph.getNodeById(l.origin_id) : null;
}

function destinos(graph, node, salida) {
  return (node.outputs?.[salida]?.links || []).map((id) => enlace(graph, id)).filter(Boolean)
    .map((l) => graph.getNodeById(l.target_id)).filter(Boolean);
}

// ------------------------------------------------------------ referencias del workflow
/* Numeración igual que el Text Encode: primero los medios del Media Loader, después las tarjetas activas del Stack,
 * un contador por tipo (Picture / Video). */
function referenciasDelWorkflow(graph, node) {
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

// ------------------------------------------------------------ plan
const tomaVacia = () => ({ ...Object.fromEntries([...HISTORIA, ...DIRECCION].map((c) => [c, ""])), fijos: [] });
function ajustarPlan(plan, n) {
  const p = plan ? JSON.parse(JSON.stringify(plan)) : {};
  for (const c of ["arco", "look", "fondo"]) p[c] = p[c] || "";
  p.fijos = p.fijos || [];
  p.tomas = (p.tomas || []).slice(0, n).map((t) => ({ ...tomaVacia(), ...t, fijos: t.fijos || [] }));
  while (p.tomas.length < n) p.tomas.push(tomaVacia());
  return p;
}

// ------------------------------------------------------------ la ventana
export async function abrir(node, app) {
  document.getElementById("epl-css")?.remove();
  document.head.append(el("style", { id: "epl-css" }, CSS));
  document.querySelector(".epl-fondo")?.remove();

  const graph = app.graph;
  const guardado = leerJSON(W(node, "estado")?.value, {});
  const wf = referenciasDelWorkflow(graph, node);
  const S = {
    receta: W(node, "receta").value, idea: W(node, "idea").value, tomas: +W(node, "tomas").value,
    duracion: +W(node, "duracion_s").value, palabras: W(node, "palabras").value, semilla: +W(node, "semilla_llm").value,
    refs: guardado.refs || {}, plan: ajustarPlan(guardado.plan, +W(node, "tomas").value),
    prompt: guardado.prompt || "", a_mano: !!guardado.a_mano, cortes: [], avisos: [], ocupado: false,
  };
  let recetas = {}, biblioteca = {};
  try { recetas = await api("recetas"); } catch (e) { wf.avisos.push("No pude leer las recetas: " + e.message); }
  try {
    const lib = await (await fetch("/minimax_h3/refmods")).json();
    for (const it of lib.items || []) biblioteca[it.name] = it;
  } catch { /* sin datos de Fantastic: las fichas quedan vacías */ }

  // lo guardado antes de esta versión iba por número: se pasa a clave con el mapa de etiquetas de entonces (o el de ahora)
  const etiquetasGuardadas = guardado.etiquetas || Object.fromEntries(wf.lista.map((r) => [r.tag, r.clave]));
  for (const k of Object.keys(S.refs)) {
    if (k.startsWith("<") && etiquetasGuardadas[k]) S.refs[etiquetasGuardadas[k]] ??= S.refs[k];
    if (k.startsWith("<")) delete S.refs[k];
  }
  const claveDe = (tag) => wf.lista.find((r) => r.tag === tag)?.clave;
  const refDe = (tag) => S.refs[claveDe(tag)] || {};
  const mapaEtiquetas = () => Object.fromEntries(wf.lista.map((r) => [r.tag, r.clave]));
  // las tomas guardan etiquetas: si los números cambiaron, se traducen por clave (lo que ya no está queda vacío)
  function remapear(antes) {
    const ahora = Object.fromEntries(wf.lista.map((r) => [r.clave, r.tag]));
    for (const t of S.plan.tomas) {
      for (const c of ["personaje", "pose", "fondo_ref"]) if (t[c]) t[c] = ahora[antes[t[c]]] || "";
    }
  }
  remapear(etiquetasGuardadas);

  // papel, nombre y ficha de cada referencia: lo guardado manda; si no, la receta; si no, los datos del RefMod
  function rellenarRefs() {
    const deLaReceta = Object.values(recetas[S.receta]?.referencias || {});
    for (const r of wf.items) {
      if (S.refs[r.clave]) continue;
      const deReceta = deLaReceta.find((x) => x.ref === r.clave);
      const meta = biblioteca[r.ref] || {};
      S.refs[r.clave] = deReceta ? { papel: deReceta.papel, nombre: deReceta.nombre, ficha: deReceta.ficha, origen: "receta" } :
        { papel: r.medio ? "personaje" : (CONCEPTO[meta.concept] || "no"), nombre: "",
          ficha: (meta.appearance || meta.desc || "").slice(0, 300), origen: meta.name ? "RefMod" : "" };
    }
  }
  rellenarRefs();

  // ---- cambiar las tarjetas del RefMod Stack (añadir, quitar, encender, fuerza): se escribe en su propio campo
  function cambiarStack(cambio) {
    const st = wf.stack, w = W(st || {}, "stack_state");
    if (!w) return avisar("No hay RefMod Stack conectado", "mal");
    const estadoStack = leerJSON(w.value, {});
    estadoStack.picks = estadoStack.picks || [];
    const antes = mapaEtiquetas();
    cambio(estadoStack.picks);
    w.value = JSON.stringify(estadoStack);
    try { st._mmrPanel?.reload?.(); } catch { /* el panel de Fantastic se pondrá al día al redibujar */ }
    graph.setDirtyCanvas?.(true, true);
    Object.assign(wf, referenciasDelWorkflow(graph, node));
    rellenarRefs();
    remapear(antes);
    pintarRefs();
    pintarPlan();
    pedirMontaje();
  }
  function anadirDeBiblioteca(it) {
    cambiarStack((picks) => {
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
  function abrirBiblioteca() {
    const capa = el("div", { class: "epl-biblio" });
    const filtro = el("input", { placeholder: "buscar por nombre o carpeta…", oninput: () => pintar() });
    const rejilla = el("div", { class: "epl-biblio-rejilla" });
    const pintar = () => {
      const q = filtro.value.toLowerCase();
      rejilla.replaceChildren(...Object.values(biblioteca).filter((it) => it.visual && it.name.toLowerCase().includes(q))
        .map((it) => el("div", { class: "epl-biblio-item", title: it.name, onclick: () => {
          try { anadirDeBiblioteca(it); capa.remove(); avisar(`Añadida ${it.label || it.name}`, "bien"); }
          catch (e) { avisar(e.message, "mal"); } } },
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
  }

  const fondo = el("div", { class: "epl-fondo" });
  const caja = el("div", { class: "epl-caja" });
  fondo.append(caja);
  document.body.append(fondo);
  const estado = el("span", { class: "epl-estado" });
  const colRefs = el("div", { class: "epl-col" }), colPlan = el("div", { class: "epl-col" }), colFinal = el("div", { class: "epl-col" });

  const entradas = () => ({
    idea: S.idea, tomas: S.tomas, duracion: S.duracion, palabras: S.palabras,
    refs: Object.fromEntries(wf.lista.filter((r) => r.tag.startsWith("<Picture")).map((r) => [r.tag, S.refs[r.clave]])
      .filter(([, v]) => v && v.papel !== "no")),
  });
  const cuerpo = (extra = {}) => ({ receta: S.receta, entradas: entradas(), plan: S.plan, audio: wf.audio, semilla: S.semilla, ...extra });
  const avisar = (texto, tipo = "") => { estado.textContent = texto; estado.className = "epl-estado " + tipo; };

  // ---- montar (sin LLM) cada vez que cambia algo, salvo si el prompt final se editó a mano
  let espera = null;
  const pedirMontaje = () => {
    clearTimeout(espera);
    espera = setTimeout(async () => {
      try {
        const r = await api("montar", cuerpo());
        S.cortes = r.cortes;
        S.avisos = r.avisos;
        if (!S.a_mano) S.prompt = r.prompt;
        pintarFinal();
        pintarCabecerasTomas();
      } catch (e) { avisar("No se pudo montar: " + e.message, "mal"); }
    }, 350);
  };

  // ---- acciones con el LLM
  async function conLLM(texto, ruta, extra) {
    if (S.ocupado) return;
    S.ocupado = true;
    caja.classList.add("ocupada");
    const t0 = Date.now();
    const reloj = setInterval(() => avisar(`${texto}… ${Math.round((Date.now() - t0) / 1000)} s`, "trabajando"), 500);
    try {
      const r = await api(ruta, cuerpo(extra));
      S.plan = ajustarPlan(r.plan, S.tomas);
      avisar(`${texto}: listo en ${r.segundos} s.`, "bien");
      pintarPlan();
      pintarRefs();
      pedirMontaje();
    } catch (e) {
      avisar(`${texto}: ${e.message}`, "mal");
    } finally {
      clearInterval(reloj);
      S.ocupado = false;
      caja.classList.remove("ocupada");
    }
  }

  // ---- columna 1: referencias
  function usadaEn(tag) {
    if (!tag) return "apagada: no se envía";
    const r = refDe(tag);
    const tomas = S.plan.tomas.map((t, i) => [t.personaje, t.pose, t.fondo_ref].includes(tag) ? `T${i + 1}` : null).filter(Boolean);
    if (r.papel === "personaje") tomas.unshift("definición");
    if (r.papel === "estilo") tomas.unshift("todo el edit");
    return tomas.length ? tomas.join(" · ") : "sin usar";
  }
  function resaltar(tag, si) {
    caja.querySelectorAll(`[data-tag="${tag}"]`).forEach((e) => e.classList.toggle("epl-hl", si));
    S.plan.tomas.forEach((t, i) => {
      if ([t.personaje, t.pose, t.fondo_ref].includes(tag)) caja.querySelector(`#epl-toma-${i + 1}`)?.classList.toggle("epl-hl", si);
    });
  }
  function pintarRefs() {
    colRefs.replaceChildren(el("h3", {}, "Referencias"),
      el("p", { class: "epl-ayuda" }, "Del RefMod Stack conectado, con la numeración del Text Encode. El papel dice cómo se usa; " +
        "la ficha le dice al LLM qué hay en la imagen."),
      ...wf.avisos.map((a) => el("p", { class: "epl-aviso" }, "⚠ " + a)),
      wf.stack ? el("button", { class: "epl-boton", onclick: abrirBiblioteca }, "+ Añadir referencia") : null);
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
          esFoto ? el("select", { onchange: (e) => { cambiar("papel", e.target.value); pintarRefs(); pintarPlan(); } },
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
                pintarRefs(); pedirMontaje(); } }, "usar"),
              el("button", { class: "epl-mini", onclick: () => { delete ref.propuesta; pintarRefs(); } }, "descartar"))) : null,
          ref.riesgos?.length ? el("div", { class: "epl-aviso" }, "⚠ riesgo: " + ref.riesgos.join(" · ")) : null,
          el("div", { class: "epl-usada" }, "usada en: " + usadaEn(r.tag)))));
    }
  }
  async function describir(r, ref) {
    if (S.ocupado) return;
    S.ocupado = true;
    caja.classList.add("ocupada");
    const t0 = Date.now();
    const reloj = setInterval(() => avisar(`Mirando ${r.tag}… ${Math.round((Date.now() - t0) / 1000)} s`, "trabajando"), 500);
    try {
      const d = await api("describir", { preview: r.preview, papel: ref.papel });
      // la ficha no se cambia sola: Qwen se equivoca en objetos pequeños (estudio nombrar_refmods); decide el usuario
      ref.propuesta = { ficha: d.ficha, nombre: d.nombre };
      ref.riesgos = d.riesgos;
      avisar(`${r.tag}: propuesta lista en ${d.segundos} s. Úsala o descártala.`, "bien");
      pintarRefs();
    } catch (e) {
      avisar(`${r.tag}: ${e.message}`, "mal");
    } finally {
      clearInterval(reloj);
      S.ocupado = false;
      caja.classList.remove("ocupada");
    }
  }

  // ---- columna 2: prompt fundamental (el plan)
  const candado = (lista, campo, alCambiar) => el("button", {
    class: "epl-candado" + (lista.includes(campo) ? " fijo" : ""), title: "Fijo: el LLM no lo cambia",
    onclick: () => { const i = lista.indexOf(campo); if (i >= 0) lista.splice(i, 1); else lista.push(campo); alCambiar(); },
  }, lista.includes(campo) ? "🔒" : "🔓");
  const fijar = (lista, campo) => { if (!lista.includes(campo)) lista.push(campo); };

  function campoTexto(obj, campo, etiqueta, lista, opciones = {}) {
    const entrada = el(opciones.largo ? "textarea" : "input", {
      rows: opciones.largo ? 2 : undefined, placeholder: opciones.ayuda || "",
      oninput: (e) => { obj[campo] = e.target.value; fijar(lista, campo); botonCandado.replaceWith(botonCandado = hacer()); pedirMontaje(); pintarRefsSuave(); },
    });
    if (opciones.largo) entrada.textContent = obj[campo] || ""; else entrada.value = obj[campo] || "";
    const hacer = () => candado(lista, campo, () => { botonCandado.replaceWith(botonCandado = hacer()); });
    let botonCandado = hacer();
    return el("label", { class: "epl-campo" }, el("span", {}, etiqueta), entrada, botonCandado);
  }
  function campoMenu(obj, campo, etiqueta, lista, opciones) {
    const sel = el("select", { onchange: (e) => { obj[campo] = e.target.value; fijar(lista, campo); pintarPlan(); pintarRefs(); pedirMontaje(); } },
      opciones.map(([v, t]) => el("option", { value: v, selected: (obj[campo] || "") === v }, t)));
    return el("label", { class: "epl-campo" }, el("span", {}, etiqueta), sel,
      candado(lista, campo, () => pintarPlan()));
  }
  let refrescoRefs = null;
  const pintarRefsSuave = () => { clearTimeout(refrescoRefs); refrescoRefs = setTimeout(pintarRefs, 600); };

  function opcionesDe(papel, vacio) {
    const ops = wf.lista.filter((r) => S.refs[r.clave]?.papel === papel).map((r) => [r.tag, `${r.tag} ${r.nombre}`]);
    return vacio ? [["", vacio], ...ops] : [["", "—"], ...ops];
  }

  // frase del efecto: se ve la de la receta; si la escribes, queda fija y es la que va al prompt (↺ vuelve a la receta)
  function campoFrase(t) {
    const propia = t.fijos.includes("efecto_frase") && (t.efecto_frase || "").trim();
    const deReceta = recetas[S.receta]?.frases?.[t.efecto] || "";
    const marca = el("span", { class: "epl-ayuda" }, propia ? "frase propia 🔒" : deReceta ? "frase probada de la receta" : "");
    const area = el("textarea", { rows: 2, placeholder: "frase del efecto, en inglés (o elige un efecto arriba)",
      oninput: (e) => { t.efecto_frase = e.target.value; fijar(t.fijos, "efecto_frase"); marca.textContent = "frase propia 🔒"; pedirMontaje(); } },
      propia ? t.efecto_frase : deReceta);
    return el("div", {},
      el("label", { class: "epl-campo" }, el("span", {}, "Frase del efecto"), area,
        el("button", { class: "epl-candado" + (propia ? " fijo" : ""), title: "Volver a la frase de la receta",
          onclick: () => { t.efecto_frase = ""; t.fijos = t.fijos.filter((f) => f !== "efecto_frase"); pintarPlan(); pedirMontaje(); } }, "↺")),
      el("div", { class: "epl-marca-frase" }, marca));
  }

  function pintarPlan() {
    const p = S.plan;
    const efectos = Object.entries(recetas[S.receta]?.efectos || {});
    const generales = el("div", { class: "epl-bloque" },
      el("label", { class: "epl-campo ancho" }, el("span", {}, "Idea"),
        el("textarea", { rows: 3, oninput: (e) => { S.idea = e.target.value; } }, S.idea)),
      el("div", { class: "epl-fila" },
        el("label", {}, "Receta ", el("select", { onchange: (e) => { S.receta = e.target.value; pintarPlan(); pedirMontaje(); } },
          Object.keys(recetas).map((n) => el("option", { value: n, selected: n === S.receta }, n)))),
        el("label", {}, "Tomas ", el("input", { type: "number", min: 1, max: 12, value: S.tomas, class: "corto",
          onchange: (e) => { S.tomas = +e.target.value; S.plan = ajustarPlan(S.plan, S.tomas); pintarPlan(); pedirMontaje(); } })),
        el("label", {}, "Duración ", el("input", { type: "number", step: 0.001, value: S.duracion, class: "corto",
          onchange: (e) => { S.duracion = +e.target.value; pedirMontaje(); } })),
        el("label", {}, "Semilla ", el("input", { type: "number", value: S.semilla, class: "corto",
          onchange: (e) => { S.semilla = +e.target.value; } }))),
      el("label", { class: "epl-campo ancho" }, el("span", {}, "Palabras"),
        el("input", { value: S.palabras, placeholder: "TO YOU @1; PEAK @ultima", oninput: (e) => { S.palabras = e.target.value; pedirMontaje(); } })),
      campoTexto(p, "arco", "Arco", p.fijos, { ayuda: "qué cambia de la primera a la última toma" }),
      campoTexto(p, "look", "Luz y ambiente", p.fijos, { ayuda: "hora, luz y paleta de todo el edit" }),
      campoTexto(p, "fondo", "Fondo general", p.fijos, { ayuda: "opcional: cómo son los fondos" }));
    const botones = el("div", { class: "epl-fila" },
      el("button", { class: "epl-boton", onclick: () => conLLM("Escribiendo la historia", "historia") }, "Escribir historia"),
      el("button", { class: "epl-boton", onclick: () => conLLM("Escribiendo las tomas", "tomas") }, "Escribir tomas"),
      el("span", { class: "epl-ayuda" }, "Rellenan lo que no tiene 🔒. Lo que escribes tú queda fijo."));
    const tomas = p.tomas.map((t, i) => {
      const k = i + 1;
      return el("div", { class: "epl-toma", id: `epl-toma-${k}` },
        el("div", { class: "epl-tomatit" }, el("b", { class: "epl-cab", "data-k": k }, `Toma ${k}`),
          el("button", { class: "epl-mini", title: "Escribir de nuevo encuadre, luz, gesto y cámara de esta toma",
            onclick: () => conLLM(`Escribiendo la toma ${k}`, "tomas", { solo: k }) }, "🔄 dirección")),
        campoTexto(t, "lugar", "Lugar", t.fijos),
        campoTexto(t, "momento", "Qué pasa", t.fijos, { largo: true }),
        el("div", { class: "epl-dos" },
          campoMenu(t, "personaje", "Personaje", t.fijos, opcionesDe("personaje")),
          campoMenu(t, "pose", "Pose", t.fijos, opcionesDe("pose", "sin pose")),
          campoMenu(t, "fondo_ref", "Fondo ref.", t.fijos, opcionesDe("fondo", "sin fondo")),
          campoMenu(t, "efecto", "Efecto", t.fijos, [["", "sin efecto"], ...efectos.map(([c, n]) => [c, `${c} ${n}`])])),
        campoFrase(t),
        el("div", { class: "epl-dos" },
          campoMenu(t, "encuadre", "Encuadre", t.fijos, [["", "—"], ...ENCUADRES.map((e) => [e, e])]),
          campoTexto(t, "camara", "Cámara", t.fijos)),
        campoTexto(t, "luz", "Luz", t.fijos),
        campoTexto(t, "gesto", "Gesto", t.fijos));
    });
    colPlan.replaceChildren(el("h3", {}, "Prompt fundamental"),
      el("p", { class: "epl-ayuda" }, "Lo que lee y extiende el LLM. Fija con 🔒 lo que no quieres que cambie."),
      generales, botones, ...tomas);
    pintarCabecerasTomas();
  }
  function pintarCabecerasTomas() {
    caja.querySelectorAll(".epl-cab").forEach((b) => {
      const k = +b.dataset.k, a = S.cortes[k - 1], z = S.cortes[k] ?? S.duracion;
      b.textContent = a === undefined ? `Toma ${k}` : `Toma ${k} · ${a.toFixed(3)}–${(+z).toFixed(3)} s`;
    });
  }

  // ---- columna 3: prompt final
  let editando = false;
  function pintarFinal() {
    const cab = el("div", { class: "epl-fila" },
      el("h3", {}, "Prompt final"),
      S.a_mano ? el("span", { class: "epl-marca" }, "editado a mano") : null,
      el("button", { class: "epl-mini", onclick: () => { editando = !editando; pintarFinal(); } }, editando ? "Ver resaltado" : "Editar a mano"),
      S.a_mano ? el("button", { class: "epl-mini", onclick: () => { S.a_mano = false; editando = false; pedirMontaje(); } }, "Volver a montar") : null);
    const vacio = S.plan.tomas.every((t) => !t.lugar && !t.gesto);
    const avisos = !S.avisos.length ? null : el("p", { class: "epl-aviso" }, vacio
      ? "El plan está vacío: pulsa «Escribir historia» y después «Escribir tomas», o escribe tú los campos."
      : `Huecos (${S.avisos.length}): ` + S.avisos.slice(0, 4).join(" · ") + (S.avisos.length > 4 ? " · …" : ""));
    let cuerpoFinal;
    if (editando) {
      cuerpoFinal = el("textarea", { class: "epl-final", oninput: (e) => { S.prompt = e.target.value; S.a_mano = true; } }, S.prompt);
    } else {
      cuerpoFinal = el("pre", { class: "epl-final" });
      for (const trozo of S.prompt.split(/(<(?:Picture|Video|Audio|Subject) \d+>)/)) {
        cuerpoFinal.append(/^<(Picture|Video) \d+>$/.test(trozo) ? el("span", { class: "epl-tag", "data-tag": trozo,
          onmouseenter: () => resaltar(trozo, true), onmouseleave: () => resaltar(trozo, false) }, trozo) : trozo);
      }
    }
    colFinal.replaceChildren(...[cab, el("p", { class: "epl-ayuda" }, "Lo que recibe H3. Pasa el ratón sobre una referencia para ver dónde se usa."),
      avisos, cuerpoFinal].filter(Boolean));
  }

  // ---- guardar en el nodo
  function guardar() {
    W(node, "idea").value = S.idea;
    W(node, "tomas").value = S.tomas;
    W(node, "duracion_s").value = S.duracion;
    W(node, "palabras").value = S.palabras;
    W(node, "semilla_llm").value = S.semilla;
    W(node, "receta").value = S.receta;
    W(node, "estado").value = JSON.stringify({ v: 2, refs: S.refs, etiquetas: mapaEtiquetas(), plan: S.plan, prompt: S.prompt, a_mano: S.a_mano,
                                               guardado: new Date().toISOString() });
    node.setDirtyCanvas?.(true, true);
    graph.setDirtyCanvas?.(true, true);
    try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch { /* sin seguimiento de cambios */ }
  }
  const cerrar = () => fondo.remove();

  caja.append(
    el("div", { class: "epl-cabecera" }, el("b", {}, "Editor del edit"), estado,
      el("button", { class: "epl-boton", onclick: () => { guardar(); avisar(S.avisos.length ? "Guardado, con huecos en el prompt" : "Guardado en el nodo", S.avisos.length ? "mal" : "bien"); } }, "Guardar"),
      el("button", { class: "epl-boton", onclick: () => { guardar(); cerrar(); } }, "Guardar y cerrar"),
      el("button", { class: "epl-x", title: "Cerrar sin guardar", onclick: cerrar }, "✕")),
    el("div", { class: "epl-cuerpo" }, colRefs, colPlan, colFinal));
  pintarRefs();
  pintarPlan();
  pintarFinal();
  pedirMontaje();
  avisar(wf.audio ? `Audio: ${wf.audio}` : "Sin audio conectado: cortes parejos");
}

const CSS = `
.epl-fondo{position:fixed;inset:0;z-index:10000;background:rgba(8,10,14,.62);display:flex;align-items:center;justify-content:center;
  font-family:system-ui,sans-serif;font-size:13px}
.epl-caja{position:relative;width:min(1880px,97vw);height:min(1000px,94vh);display:flex;flex-direction:column;background:#191c22;color:#d7dbe2;
  border:1px solid #303642;border-radius:10px;box-shadow:0 24px 64px rgba(0,0,0,.55);overflow:hidden}
.epl-caja.ocupada .epl-boton,.epl-caja.ocupada .epl-mini{opacity:.45;pointer-events:none}
.epl-cabecera{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #2a2f3a;background:#1e222a}
.epl-estado{flex:1;color:#8a93a3}.epl-estado.bien{color:#5fbf7f}.epl-estado.mal{color:#f07070}.epl-estado.trabajando{color:#e0a94c}
.epl-cuerpo{flex:1;display:grid;grid-template-columns:320px minmax(0,1.15fr) minmax(0,1fr);min-height:0}
.epl-col{overflow:auto;padding:10px 14px;border-right:1px solid #2a2f3a}
.epl-col h3{margin:4px 0 6px;font-size:14px}
.epl-ayuda{color:#7d8698;font-size:11px;margin:2px 0 8px}
.epl-aviso{color:#e0a94c;font-size:11px;margin:4px 0}
.epl-ref{display:grid;grid-template-columns:64px 1fr;gap:8px;padding:7px;margin-bottom:7px;border:1px solid #2e3440;border-radius:7px;background:#15181e}
.epl-ref img{width:64px;height:84px;object-fit:cover;border-radius:5px;background:#0d1015}
.epl-ref select,.epl-ref input,.epl-ref textarea{width:100%;box-sizing:border-box;margin-top:3px}
.epl-reftit{font-size:12px;word-break:break-all}
.epl-usada{font-size:11px;color:#8fb0e0;margin-top:3px}
.epl-ref.apagada{opacity:.5}
.epl-stack{margin:3px 0;gap:8px;font-size:11px}.epl-stack input.corto{width:60px}
.epl-biblio{position:absolute;inset:60px 40px 40px 40px;z-index:5;background:#191c22;border:1px solid #3d4a5c;border-radius:10px;padding:14px;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.6)}
.epl-biblio input{background:#12151b;color:#d7dbe2;border:1px solid #2e3440;border-radius:5px;padding:4px 6px;flex:1}
.epl-biblio-rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.epl-biblio-item{cursor:pointer;border:1px solid #2e3440;border-radius:7px;padding:6px;background:#15181e;font-size:11px;word-break:break-all}
.epl-biblio-item:hover{border-color:#e0a94c}.epl-biblio-item img{width:100%;height:120px;object-fit:cover;border-radius:5px;background:#0d1015}
.epl-biblio-item small{color:#7d8698;display:block}
.epl-marca-frase{margin:-2px 0 4px 92px}
.epl-propuesta{font-size:11px;color:#cfe0ff;background:#1c2738;border:1px solid #2b3a52;border-radius:6px;padding:5px;margin-top:4px}
.epl-col input,.epl-col textarea,.epl-col select{background:#12151b;color:#d7dbe2;border:1px solid #2e3440;border-radius:5px;padding:4px 6px;font:inherit}
.epl-col textarea{resize:vertical}
.epl-campo{display:grid;grid-template-columns:86px 1fr 26px;align-items:start;gap:6px;margin:3px 0}
.epl-campo>span{color:#9aa3b2;padding-top:5px;font-size:12px}
.epl-campo.ancho{grid-template-columns:86px 1fr}
.epl-fila{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0}
.epl-fila input.corto{width:70px}
.epl-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:0 10px}
.epl-dos .epl-campo{grid-template-columns:70px minmax(0,1fr) 26px}
.epl-campo select,.epl-campo input,.epl-campo textarea{min-width:0;width:100%;box-sizing:border-box}
.epl-bloque{padding:8px;border:1px solid #2e3440;border-radius:7px;background:#15181e;margin-bottom:6px}
.epl-toma{padding:8px;border:1px solid #2e3440;border-radius:7px;background:#15181e;margin:8px 0}
.epl-tomatit{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.epl-candado{background:none;border:0;cursor:pointer;font-size:13px;padding:1px 3px;opacity:.3;filter:grayscale(1)}
.epl-candado.fijo{opacity:1;filter:none;background:#5a4515;border-radius:5px}
.epl-boton{background:#2f3947;color:#fff;border:1px solid #3d4a5c;border-radius:6px;padding:6px 12px;cursor:pointer}
.epl-boton:hover{background:#3a4658}
.epl-mini{background:#232833;color:#c9cfd9;border:1px solid #343b48;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px}
.epl-x{background:none;border:0;color:#8a93a3;font-size:18px;cursor:pointer}
.epl-final{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:11.5px;line-height:1.45;
  background:#12151b;border:1px solid #2e3440;border-radius:7px;padding:10px;margin:0;width:100%;box-sizing:border-box;min-height:70vh}
.epl-tag{background:#2b3a52;color:#cfe0ff;border-radius:4px;padding:0 3px}
.epl-marca{color:#e0a94c;font-size:11px;border:1px solid #6d5527;border-radius:6px;padding:1px 6px}
.epl-hl{outline:2px solid #e0a94c !important;background:#4a3a1a !important}
`;
