/* «Tapar con SAM 3.1» en la ficha de una referencia del Stack (también en una cajita con sus fotos apuntadas).
 * Un interruptor y unos chips: qué tapar (cara, pelo, texto y otra cosa en inglés) y cómo (difuminado, pixelado o parche de
 * color). Al encenderlo, el servidor hace las máscaras con SAM, tapa la foto y crea un RefMod hermano
 * «<original>__tapado_<huella>» (rutas.tapar_previa y rutas.tapar); aquí se cambia la tarjeta del Stack por la tapada,
 * con su fuerza, si está activa y su sitio. Apagarlo vuelve a la original. Con las mismas opciones se reutiliza el tapado
 * ya creado, sin SAM ni GPU. El papel, el nombre y la ficha pasan de una tarjeta a la otra (S.refs va por nombre de RefMod).
 * La relación tapado → original está en <tapado>.tapado.json, junto al RefMod (ctx.tapados).
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md, «Tapar». */

const CHIPS = [["cara", "la cara"], ["pelo", "el pelo"], ["texto", "el texto"]];
const FORMAS = [["difuminar", "difuminado"], ["pixelar", "pixelado"], ["color", "parche de color"]];
const OPCIONES = { cosas: ["cara", "pelo"], libre: "", forma: "difuminar" };

/* Añade ctx.tapados, ctx.cargarTapados, ctx.cambiarTarjeta y ctx.bloqueTapar. Usa de ctx: u, S, wf, caja, biblioteca,
 * cargarBiblioteca, cambiarStack, abrirFicha, abrirCajita, esCajita, fotosDe, nFotos, avisar, pintarRefs, pintarPlan,
 * pedirMontaje. */
export function instalar(ctx) {
  const { u, S, wf, caja } = ctx;
  const { el, api } = u;
  const CAMPOS_REF = ["personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref"];
  ctx.tapados = {};
  const mensajes = {};                                   // último resultado de cada tarjeta, para enseñarlo en su ficha

  ctx.cargarTapados = async function cargarTapados() {
    try { ctx.tapados = (await api("tapados", {})).tapados || {}; } catch { ctx.tapados = {}; }
  };

  /* cambia la tarjeta r del Stack por el RefMod `nombre` (el tapado o el original): misma posición, misma fuerza y mismo
   * «activa». El papel, el nombre y la ficha se copian a la clave nueva, y las tomas que la citaban la siguen citando. */
  ctx.cambiarTarjeta = function cambiarTarjeta(r, nombre) {
    const it = ctx.biblioteca[nombre];
    if (!it) throw new Error(`${nombre} no aparece en la biblioteca de RefMods`);
    const citas = r.tag ? S.plan.tomas.flatMap((t) => CAMPOS_REF.filter((c) => t[c] === r.tag).map((c) => [t, c])) : [];
    S.refs[nombre] = JSON.parse(JSON.stringify(S.refs[r.clave] || {}));
    ctx.cambiarStack((picks) => {
      const viejo = picks[r.idx];
      if (viejo?.name !== r.ref) throw new Error("El Stack cambió mientras se tapaba: vuelve a abrir la ficha");
      const nueva = ctx.tarjeta(it, picks);
      nueva.uid = viejo.uid;
      nueva.on = viejo.on;
      if (nueva.visual && viejo.visual) for (const k of ["mode", "w", "s", "c"]) if (viejo.visual[k] !== undefined) nueva.visual[k] = viejo.visual[k];
      picks[r.idx] = nueva;
    });
    const tag = wf.lista.find((x) => x.clave === nombre)?.tag;
    for (const [t, c] of citas) t[c] = tag || "";
    ctx.pintarRefs();
    ctx.pintarPlan();
    ctx.pedirMontaje();
    return wf.items.find((x) => x.clave === nombre);
  };

  const reabrir = (r) => r && (ctx.esCajita(r) ? ctx.abrirCajita(r) : ctx.abrirFicha(r));
  const queBusca = (op) => {
    const partes = [...CHIPS.filter(([c]) => op.cosas.includes(c)).map(([, t]) => t),
                    ...(op.libre || "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => `«${x}»`)];
    return partes.length > 1 ? partes.slice(0, -1).join(", ") + " y " + partes.at(-1) : partes[0] || "";
  };
  const mismas = (a, b) => !!a && !!b && a.forma === b.forma && (a.libre || "").trim() === (b.libre || "").trim() &&
    [...a.cosas].sort().join() === [...b.cosas].sort().join();
  const encontrado = (e = {}) => Object.entries(e).map(([w, p]) => p > 0 ? `${w} ${String(p).replace(".", ",")} %` : `⚠ no encontré «${w}»`).join(" · ");

  // reloj de trabajo: el texto de la fase y los segundos, en la cabecera y en la ficha
  function trabajando(linea) {
    S.ocupado = true;
    caja.classList.add("ocupada");
    const t0 = Date.now();
    let fase = "";
    const pintar = () => { const t = `${fase} ${Math.round((Date.now() - t0) / 1000)} s`; ctx.avisar(t, "trabajando"); if (linea) linea.textContent = t; };
    const reloj = setInterval(pintar, 500);
    return { fase: (f) => { fase = f; pintar(); },
             fin: () => { clearInterval(reloj); S.ocupado = false; caja.classList.remove("ocupada"); } };
  }

  /* encender (o aplicar otras opciones): `desde` es la tarjeta que hay ahora en el Stack y `original` el RefMod sin tapar */
  async function encender(desde, original, op, v, linea) {
    if (S.ocupado) return;
    const meta = ctx.biblioteca[original] || {};
    const cuerpo = { refmod: original, cosas: op.cosas, libre: op.libre, forma: op.forma, n_fotos: ctx.nFotos(desde),
                     concepto: meta.concept || "", descripcion: meta.desc || "", apariencia: meta.appearance || "" };
    const w = trabajando(linea);
    try {
      w.fase(`Buscando ${queBusca(op)}…`);
      const pv = await api("tapar_previa", cuerpo);
      if (!pv.existe) w.fase("Creando la referencia tapada…");
      const res = await api("tapar", cuerpo);
      await ctx.cargarBiblioteca();
      const nueva = ctx.cambiarTarjeta(desde, res.name);
      const texto = res.reutilizado ? `Reutilizo ${res.name}: ya estaba tapado con estas opciones (sin SAM) · ${res.segundos} s`
        : `Tapada en ${Math.round((pv.segundos + res.segundos) * 10) / 10} s (SAM ${pv.segundos_sam} s, RefMod ${res.segundos_refmod} s) · ${encontrado(res.encontrado)}`;
      mensajes[res.name] = texto + (res.aviso ? `\n⚠ ${res.aviso}` : "");
      v.cerrar();
      reabrir(nueva);
      ctx.avisar(texto, "bien");
    } catch (e) {
      ctx.avisar("Tapar: " + e.message, "mal");
      if (linea) linea.textContent = "⚠ " + e.message;
    } finally { w.fin(); }
  }

  function apagar(r, info, v) {
    try {
      const vuelta = ctx.cambiarTarjeta(r, info.original);
      mensajes[info.original] = `Vuelve la original (${info.original}); el tapado se queda guardado para la próxima vez.`;
      v.cerrar();
      reabrir(vuelta);
      ctx.avisar(`Destapada: vuelve ${info.original}`, "bien");
    } catch (e) { ctx.avisar("Tapar: " + e.message, "mal"); }
  }

  async function previa(r, original, op, lugar, linea) {
    if (S.ocupado) return;
    const w = trabajando(linea);
    try {
      w.fase(`Buscando ${queBusca(op)}…`);
      const pv = await api("tapar_previa", { refmod: original, cosas: op.cosas, libre: op.libre, forma: op.forma, n_fotos: ctx.nFotos(r) });
      lugar.replaceChildren(...pv.imagenes.map((f) => el("img", { src: u.vistaMedio(f) + "&t=" + Date.now(), alt: "" })));
      const texto = `Vista previa en ${pv.segundos} s` + (pv.existe ? " (ya creada: se reutilizará)" : pv.sam ? ` (SAM ${pv.segundos_sam} s)` : " (máscaras de la caché)") +
        ` · ${encontrado(pv.encontrado)} · de ${pv.origen}`;
      linea.textContent = texto + (pv.aviso ? `\n⚠ ${pv.aviso}` : "");
      ctx.avisar(texto, "bien");
    } catch (e) {
      ctx.avisar("Vista previa: " + e.message, "mal");
      linea.textContent = "⚠ " + e.message;
    } finally { w.fin(); }
  }

  /* el bloque de la ficha. Solo para tarjetas del Stack que sean una foto o una cajita con sus fotos apuntadas. */
  ctx.bloqueTapar = function bloqueTapar(r, v) {
    if (r.idx === undefined || !r.ref || !(r.kind === "image" || ctx.fotosDe(r))) return null;
    const info = ctx.tapados[r.ref];
    const original = info ? info.original : r.ref;
    const ref = S.refs[r.clave] || (S.refs[r.clave] = { papel: "no", nombre: "", ficha: "" });
    const op = ref.tapar || (ref.tapar = info ? { cosas: [...(info.cosas || [])], libre: info.libre || "", forma: info.forma || "difuminar" }
                                              : JSON.parse(JSON.stringify(OPCIONES)));
    const linea = el("div", { class: "epl-ayuda epl-tapar-estado" }, mensajes[r.ref] || "");
    const previas = el("div", { class: "epl-tapar-previas" });
    const bloque = el("div", { class: "epl-tapar" + (info ? " encendido" : "") });
    const pintar = () => {
      const cambiadas = info && !mismas(op, { cosas: info.cosas || [], libre: info.libre, forma: info.forma });
      bloque.replaceChildren(...[
        el("div", { class: "epl-fila" },
          el("label", { class: "epl-interruptor", title: "Tapa lo elegido en la foto con SAM 3.1 y usa esa copia en el Stack. Apagado vuelve la original.", style: { margin: 0 } },
            el("input", { type: "checkbox", class: "epl-tapar-si", checked: !!info, onchange: (e) => {
              if (S.ocupado) { e.target.checked = !!info; return; }
              if (e.target.checked) encender(r, original, op, v, linea); else apagar(r, info, v);
            } }), el("b", {}, " tapar"), " con SAM 3.1"),
          ...CHIPS.map(([c]) => el("button", { class: "epl-mini epl-tapar-chip" + (op.cosas.includes(c) ? " fijo" : ""), "data-cosa": c,
            onclick: () => { op.cosas = op.cosas.includes(c) ? op.cosas.filter((x) => x !== c) : [...op.cosas, c]; pintar(); } }, c)),
          el("input", { class: "epl-tapar-libre", value: op.libre, placeholder: "otra cosa, en inglés: hat, logo",
                        onchange: (e) => { op.libre = e.target.value; pintar(); } }),
          el("select", { class: "epl-tapar-forma", onchange: (e) => { op.forma = e.target.value; pintar(); } },
            ...FORMAS.map(([f, t]) => el("option", { value: f, selected: op.forma === f }, t)))),
        el("div", { class: "epl-fila" },
          el("button", { class: "epl-mini epl-tapar-previa", title: "Enseña cómo queda, sin crear la referencia", onclick: () => previa(r, original, op, previas, linea) }, "👁 vista previa"),
          cambiadas ? el("button", { class: "epl-mini fijo epl-tapar-aplicar", title: "Crea (o reutiliza) el tapado con estas opciones y lo pone en el Stack",
            onclick: () => encender(r, original, op, v, linea) }, "↻ aplicar estas opciones") : null,
          info ? el("span", { class: "epl-ayuda" }, `tapado de ${original} · ${(info.palabras || []).join(", ")} · ${FORMAS.find(([f]) => f === info.forma)?.[1] || info.forma}`)
               : el("span", { class: "epl-ayuda" }, "para que no se cuele la cara de quien lleva la ropa o la pose")),
        info?.aviso ? el("div", { class: "epl-aviso" }, "⚠ " + info.aviso) : null,
        linea, previas].filter(Boolean));
    };
    pintar();
    return bloque;
  };
}
