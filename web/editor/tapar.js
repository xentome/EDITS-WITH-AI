/* «Tapar con SAM 3.1» en la ficha de una referencia del Stack (también en una cajita con sus fotos apuntadas).
 * Un interruptor y unos chips: qué tapar (cara, pelo, texto y otra cosa en inglés) y cómo (difuminado, pixelado o parche de
 * color). Al encenderlo, el servidor hace las máscaras con SAM, tapa la foto y crea un RefMod hermano
 * «<original>__tapado_<huella>» (rutas.tapar_previa y rutas.tapar); aquí se cambia la tarjeta del Stack por la tapada,
 * con su fuerza, si está activa y su sitio. Apagarlo vuelve a la original. Con las mismas opciones se reutiliza el tapado
 * ya creado, sin SAM ni GPU. El papel, el nombre y la ficha pasan de una tarjeta a la otra (S.refs va por nombre de RefMod).
 * La relación tapado → original está en <tapado>.tapado.json, junto al RefMod (ctx.tapados).
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md, «Tapar». */

// los chips (su letrero: tapar.chip.<c>; en una frase: tapar.busca.<c>) y las formas (tapar.forma.<f>)
const CHIPS = ["cara", "pelo", "texto"];
const FORMAS = ["difuminar", "pixelar", "color"];
const OPCIONES = { cosas: ["cara", "pelo"], libre: "", forma: "difuminar" };
// la palabra que recibe SAM (nucleo.COSAS_TAPAR) → su chip, para enseñarla en el idioma de la ventana
const CHIP_DE = { face: "cara", hair: "pelo", text: "texto" };

/* Añade ctx.tapados, ctx.cargarTapados, ctx.cambiarTarjeta y ctx.bloqueTapar. Usa de ctx: u, S, wf, caja, biblioteca,
 * cargarBiblioteca, cambiarStack, abrirFicha, abrirCajita, esCajita, fotosDe, nFotos, avisar, pintarRefs, pintarPlan,
 * pedirMontaje. */
export function instalar(ctx) {
  const { u, S, wf, caja } = ctx;
  const { el, api, t } = u;
  const CAMPOS_REF = ["personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"];
  ctx.tapados = {};
  const mensajes = {};       // último resultado de cada tarjeta, para enseñarlo en su ficha (una función: sale en el idioma de ahora)

  ctx.cargarTapados = async function cargarTapados() {
    try { ctx.tapados = (await api("tapados", {})).tapados || {}; } catch { ctx.tapados = {}; }
  };

  /* cambia la tarjeta r del Stack por el RefMod `nombre` (el tapado o el original): misma posición, misma fuerza y mismo
   * «activa». El papel, el nombre y la ficha se copian a la clave nueva, y las tomas que la citaban la siguen citando. */
  ctx.cambiarTarjeta = function cambiarTarjeta(r, nombre) {
    const it = ctx.biblioteca[nombre];
    if (!it) throw new Error(t("tapar.no_en_biblioteca", { nombre }));
    const citas = r.tag ? S.plan.tomas.flatMap((t) => CAMPOS_REF.filter((c) => t[c] === r.tag).map((c) => [t, c])) : [];
    S.refs[nombre] = JSON.parse(JSON.stringify(S.refs[r.clave] || {}));
    ctx.cambiarStack((picks) => {
      const viejo = picks[r.idx];
      if (viejo?.name !== r.ref) throw new Error(t("tapar.stack_cambio"));
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
  const libres = (libre) => (libre || "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  // «la cara, el pelo y “hat”»
  const queBusca = (op) => u.lista([...CHIPS.filter((c) => op.cosas.includes(c)).map((c) => t(`tapar.busca.${c}`)),
                                    ...libres(op.libre).map((x) => t("tapar.busca.libre", { x }))]);
  const palabra = (w) => CHIP_DE[w] ? t(`tapar.chip.${CHIP_DE[w]}`) : w;
  // un aviso del servidor: con su clave (aviso_i18n) se escribe en el idioma de ahora; si no, el texto tal cual
  const avisoDe = (x) => x?.aviso_i18n ? t(x.aviso_i18n.clave, x.aviso_i18n.datos) : x?.aviso || "";
  const origenDe = (x) => x?.origen_i18n ? t(x.origen_i18n.clave, x.origen_i18n.datos) : x?.origen || "";
  const mismas = (a, b) => !!a && !!b && a.forma === b.forma && (a.libre || "").trim() === (b.libre || "").trim() &&
    [...a.cosas].sort().join() === [...b.cosas].sort().join();
  const encontrado = (e = {}) => Object.entries(e).map(([w, p]) => p > 0 ? t("tapar.encontrado", { palabra: palabra(w), pct: u.num(p) })
    : t("tapar.no_encontrado", { palabra: palabra(w) })).join(" · ");

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
  async function encender(desde, original, op, v, linea, sinFicha = false) {
    if (S.ocupado) return;
    const meta = ctx.biblioteca[original] || {};
    const cuerpo = { refmod: original, cosas: op.cosas, libre: op.libre, forma: op.forma, n_fotos: ctx.nFotos(desde),
                     concepto: meta.concept || "", descripcion: meta.desc || "", apariencia: meta.appearance || "" };
    const w = trabajando(linea);
    try {
      w.fase(t("tapar.buscando", { que: queBusca(op) }));
      const pv = await api("tapar_previa", cuerpo);
      if (!pv.existe) w.fase(t("tapar.creando"));
      const res = await api("tapar", cuerpo);
      await ctx.cargarBiblioteca();
      const nueva = ctx.cambiarTarjeta(desde, res.name);
      const texto = () => res.reutilizado ? t("tapar.reutilizo", { nombre: res.name, s: u.num(res.segundos) })
        : t("tapar.tapada", { s: u.num(Math.round((pv.segundos + res.segundos) * 10) / 10), sam: u.num(pv.segundos_sam),
                              refmod: u.num(res.segundos_refmod), encontrado: encontrado(res.encontrado) });
      mensajes[res.name] = () => texto() + (avisoDe(res) ? `\n⚠ ${avisoDe(res)}` : "");
      v.cerrar();
      if (!sinFicha) reabrir(nueva);
      ctx.avisar(texto(), "bien");
      return nueva;
    } catch (e) {
      ctx.avisar(t("tapar.error", { error: e.message }), "mal");
      if (linea) linea.textContent = "⚠ " + e.message;
    } finally { w.fin(); }
  }

  /* tapar una tarjeta sin abrir su ficha (lo usa «Subir foto» con «tapar al subir»): cara y pelo, difuminado */
  ctx.taparTarjeta = (r, op = OPCIONES) => encender(r, r.ref, JSON.parse(JSON.stringify(op)), { cerrar() {} }, null, true);

  function apagar(r, info, v) {
    try {
      const vuelta = ctx.cambiarTarjeta(r, info.original);
      mensajes[info.original] = () => t("tapar.vuelve_original", { original: info.original });
      v.cerrar();
      reabrir(vuelta);
      ctx.avisar(t("tapar.destapada", { original: info.original }), "bien");
    } catch (e) { ctx.avisar(t("tapar.error", { error: e.message }), "mal"); }
  }

  async function previa(r, original, op, lugar, linea) {
    if (S.ocupado) return;
    const w = trabajando(linea);
    try {
      w.fase(t("tapar.buscando", { que: queBusca(op) }));
      const pv = await api("tapar_previa", { refmod: original, cosas: op.cosas, libre: op.libre, forma: op.forma, n_fotos: ctx.nFotos(r) });
      lugar.replaceChildren(...pv.imagenes.map((f) => el("img", { src: u.vistaMedio(f) + "&t=" + Date.now(), alt: "" })));
      const detalle = pv.existe ? t("tapar.previa.ya_creada") : pv.sam ? t("tapar.previa.sam", { s: u.num(pv.segundos_sam) }) : t("tapar.previa.cache");
      const texto = t("tapar.previa.lista", { s: u.num(pv.segundos), detalle, encontrado: encontrado(pv.encontrado), origen: origenDe(pv) });
      linea.textContent = texto + (avisoDe(pv) ? `\n⚠ ${avisoDe(pv)}` : "");
      ctx.avisar(texto, "bien");
    } catch (e) {
      ctx.avisar(t("tapar.previa.error", { error: e.message }), "mal");
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
    const linea = el("div", { class: "epl-ayuda epl-tapar-estado" }, mensajes[r.ref]?.() || "");
    const previas = el("div", { class: "epl-tapar-previas" });
    const bloque = el("div", { class: "epl-tapar" + (info ? " encendido" : "") });
    const pintar = () => {
      const cambiadas = info && !mismas(op, { cosas: info.cosas || [], libre: info.libre, forma: info.forma });
      bloque.replaceChildren(...[
        el("div", { class: "epl-fila" },
          el("label", { class: "epl-interruptor", title: t("tapar.interruptor.tooltip"), style: { margin: 0 } },
            el("input", { type: "checkbox", class: "epl-tapar-si", checked: !!info, onchange: (e) => {
              if (S.ocupado) { e.target.checked = !!info; return; }
              if (e.target.checked) encender(r, original, op, v, linea); else apagar(r, info, v);
            } }), " ", el("b", {}, t("tapar.interruptor.verbo")), " " + t("tapar.interruptor.resto")),
          ...CHIPS.map((c) => el("button", { class: "epl-mini epl-tapar-chip" + (op.cosas.includes(c) ? " fijo" : ""), "data-cosa": c,
            onclick: () => { op.cosas = op.cosas.includes(c) ? op.cosas.filter((x) => x !== c) : [...op.cosas, c]; pintar(); } }, t(`tapar.chip.${c}`))),
          el("input", { class: "epl-tapar-libre", value: op.libre, placeholder: t("tapar.libre.placeholder"),
                        onchange: (e) => { op.libre = e.target.value; pintar(); } }),
          el("select", { class: "epl-tapar-forma", onchange: (e) => { op.forma = e.target.value; pintar(); } },
            ...FORMAS.map((f) => el("option", { value: f, selected: op.forma === f }, t(`tapar.forma.${f}`))))),
        el("div", { class: "epl-fila" },
          el("button", { class: "epl-mini epl-tapar-previa", title: t("tapar.previa.tooltip"), onclick: () => previa(r, original, op, previas, linea) }, t("tapar.previa")),
          cambiadas ? el("button", { class: "epl-mini fijo epl-tapar-aplicar", title: t("tapar.aplicar.tooltip"),
            onclick: () => encender(r, original, op, v, linea) }, t("tapar.aplicar")) : null,
          info ? el("span", { class: "epl-ayuda" }, t("tapar.info", { original, palabras: u.lista((info.palabras || []).map(palabra)),
                                                                     forma: FORMAS.includes(info.forma) ? t(`tapar.forma.${info.forma}`) : info.forma }))
               : el("span", { class: "epl-ayuda" }, t("tapar.para_que"))),
        avisoDe(info) ? el("div", { class: "epl-aviso" }, "⚠ " + avisoDe(info)) : null,
        linea, previas].filter(Boolean));
    };
    pintar();
    return bloque;
  };
}
