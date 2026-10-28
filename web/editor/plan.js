/* Secciones 1 y 2 del editor: el PLAN (lo que lee y extiende el LLM).
 * Desde el 27 oct (interfaz P10, planos/fases/8) ya no hay Historia general: la idea, el arco, la luz general, el fondo
 * general, el número de tomas y la semilla del LLM salieron de la ventana; la duración va en la línea de tiempo (linea.js),
 * el estilo es de cada toma y el sonido va abajo del todo (ctx.pintarSonido).
 * Prompt de la toma elegida en la línea de tiempo: su línea [Shot n] (plegada en una línea) y todos sus campos, con
 *     candado, el efecto (de las referencias de papel efecto o de los efectos de texto) y su frase (↺ vuelve a la ficha del
 *     efecto), su estilo, las referencias que usa y «rehacer esta toma».
 * También los botones que llaman al LLM (ctx.conLLM). Solo exporta funciones (ComfyUI importa todos los .js de web/).
 * Las utilidades llegan en ctx.u, sin imports, para que este archivo también se recargue al abrir la ventana. Los textos,
 * con u.t("clave") (web/i18n/*.json); cada pintar… los vuelve a escribir en el idioma de ahora.
 * Planos: ../../planos/4 El editor.md. */

// los mismos que nucleo.ENCUADRES (pruebas.py lo comprueba). Van al prompt tal cual (en inglés); su letrero es
// toma.encuadre_op.<i>. Con «✎ escribir el mío», la toma guarda el texto del usuario y se pega igual.
export const ENCUADRES = ["extreme close-up", "close-up", "medium shot", "full shot"];
// los movimientos de cámara básicos del menú: van tras «the camera …» tal cual (en inglés); su letrero es toma.camara_op.<i>.
// El LLM escribe el suyo y el usuario también puede («✎ escribir el mío»).
export const MOVIMIENTOS = ["holds still", "slowly pushes in from a distance", "slowly pulls back from close up",
                            "pans slowly from side to side", "is handheld and follows <Subject 1>"];
const ENCUADRE_VIEJO = { "extreme close-up of the eyes": "extreme close-up of <Subject 1>'s eyes" };   // planes de antes del 25 oct
// entorno de una toma (nucleo.ENTORNOS): el LLM elige el lugar, lo escribe el usuario (candado del lugar) o no hay ninguno
export const ENTORNOS = ["auto", "manual", "ninguno"];
const HISTORIA = ["lugar", "momento", "personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"];
const DIRECCION = ["encuadre", "luz", "gesto", "camara"];

const tomaVacia = () => ({ ...Object.fromEntries([...HISTORIA, ...DIRECCION].map((c) => [c, ""])), efectos: [], efecto_frase: "",
                           estilo: "", entorno: "auto", fijos: [] });
// las referencias que conecta la toma (como nucleo.con_efectos): «efecto» es la primera, la que lee y escribe el LLM; si
// el usuario no fijó el efecto, la lista sigue al LLM
function conEfectos(t) {
  let lista = (t.efectos || []).filter(Boolean);
  if (!(t.fijos || []).includes("efecto") || !lista.length) lista = t.efecto ? [t.efecto] : [];
  return { ...t, efectos: lista, efecto: lista[0] || "" };
}
// compatibilidad (como nucleo.con_entorno): sin entorno guardado, con el lugar fijado es «manual» y si no, «auto».
// «manual» y el candado del lugar van siempre juntos.
function conEntorno(t) {
  const e = ENTORNOS.includes(t.entorno) ? t.entorno : (t.fijos || []).includes("lugar") ? "manual" : "auto";
  return { ...t, entorno: e, fijos: [...(t.fijos || []).filter((f) => f !== "lugar"), ...(e === "manual" ? ["lugar"] : [])] };
}
// deja el plan con n tomas y todos sus campos (sin tocar lo que ya tiene)
export function ajustarPlan(plan, n) {
  const p = plan ? JSON.parse(JSON.stringify(plan)) : {};
  for (const c of ["arco", "look", "fondo"]) p[c] = p[c] || "";
  p.fijos = p.fijos || [];
  if ((p.cortes || []).length !== n) delete p.cortes;   // cortes a mano de otro número de tomas: ya no valen
  p.tomas = (p.tomas || []).slice(0, n).map((t) => conEfectos(conEntorno({ ...tomaVacia(), ...t, entorno: t.entorno, fijos: t.fijos || [] })));
  for (const t of p.tomas) t.encuadre = ENCUADRE_VIEJO[t.encuadre] || t.encuadre;
  while (p.tomas.length < n) p.tomas.push(tomaVacia());
  return p;
}

/* Añade a ctx: conLLM, pintarSonido, pintarToma, pintarLineaToma, pintarPlan. Usa de ctx: u, S, wf, caja, secSonido,
 * secToma, avisar, cuerpo, pedirMontaje, pintarRefs, pintarLinea, quitarToma, elegir, resaltar. */
export function instalar(ctx) {
  const { u, S, wf, caja, secSonido, secToma } = ctx;
  const { el, api, t } = u;

  // ---- acciones con el LLM (Escribir historia, Escribir tomas, rehacer una toma)
  // `tarea` es la clave del texto («final.escribiendo_tomas») y `datos` sus marcadores
  ctx.conLLM = async function conLLM(tarea, ruta, extra, datos = {}) {
    if (S.ocupado) return;
    S.ocupado = true;
    caja.classList.add("ocupada");
    const t0 = Date.now();
    const texto = () => t(tarea, datos);
    const reloj = setInterval(() => ctx.avisar(t("comun.trabajando", { tarea: texto(), s: Math.round((Date.now() - t0) / 1000) }), "trabajando"), 500);
    try {
      const r = await api(ruta, ctx.cuerpo(extra));
      S.plan = ajustarPlan(r.plan, S.tomas);
      ctx.avisar(t("comun.listo", { tarea: texto(), s: u.num(r.segundos) }), "bien");
      ctx.pintarPlan();
      ctx.pintarRefs();
      ctx.pedirMontaje();
    } catch (e) {
      ctx.avisar(t("comun.error_de", { tarea: texto(), error: e.message }), "mal");
    } finally {
      clearInterval(reloj);
      S.ocupado = false;
      caja.classList.remove("ocupada");
    }
  };

  /* ---- los campos del panel (28 oct, variante P2 del prototipo): cada campo es un bloque con el nombre arriba (su icono
   * y, si hace falta y está vacío, «falta») y debajo el control con su botón (candado, ↺ o menú), siempre a la derecha y
   * de 40 px. Los textos crecen con lo que se escribe (CSS field-sizing). */
  const candado = (lista, campo, alCambiar) => el("button", {
    class: "epl-candado" + (lista.includes(campo) ? " fijo" : ""), title: t("comun.candado"), "aria-label": t("comun.candado"),
    onclick: () => { const i = lista.indexOf(campo); if (i >= 0) lista.splice(i, 1); else lista.push(campo); alCambiar(); },
  }, u.icono(lista.includes(campo) ? "candado" : "abierto"));
  const fijar = (lista, campo) => { if (!lista.includes(campo)) lista.push(campo); };
  let refrescoRefs = null;
  const pintarRefsSuave = () => { clearTimeout(refrescoRefs); refrescoRefs = setTimeout(() => { ctx.pintarRefs(); ctx.pintarLinea(); }, 600); };

  // lo que falta en una toma: los mismos huecos que avisa el montaje (nucleo, final.hueco.*); sin entorno no hay lugar ni luz
  const faltanDe = (toma) => ["encuadre", "camara", "gesto", ...(toma.entorno === "ninguno" ? [] : ["lugar", "luz"])]
    .filter((c) => !String(toma[c] || "").trim());
  const ETIQUETAS = { encuadre: "toma.encuadre", camara: "toma.camara", gesto: "toma.gesto", lugar: "toma.lugar", luz: "toma.luz" };
  // el icono de cada campo (util.icono): todos llevan el suyo
  const ICONO = { momento: "accion", gesto: "mano", encuadre: "encuadre", camara: "camara", luz: "luz", entorno: "capas", lugar: "pin", estilo: "estilo",
                  efecto: "enlace", efecto_frase: "efecto", fondo_ref: "imagen", personaje: "percha", ropa: "percha", pose: "figura", objeto: "caja", lugar_ref: "pin" };
  // un bloque de campo: `campo` (data-c2) da su icono y es lo que se marca como «falta»
  const bloque = (campo, etiqueta, control, boton, clase = "") => el("div", { class: "epl-c2" + (clase ? " " + clase : ""), "data-c2": campo },
    el("span", { class: "epl-c2-et" }, u.icono(ICONO[campo]), el("span", {}, etiqueta), el("span", { class: "epl-falta" }, t("toma.falta"))),
    el("div", { class: "epl-c2-fila" }, control, boton || null));
  /* pone al día lo que falta sin volver a pintar (mientras escribes): la marca de cada campo, la pastilla del título y la
   * cuenta de cada pestaña */
  function pintarFaltas(toma) {
    const faltan = faltanDe(toma);
    for (const b of secToma.querySelectorAll("[data-c2]")) b.classList.toggle("vacio", faltan.includes(b.dataset.c2));
    const pastilla = secToma.querySelector(".epl-p2-faltan");
    if (pastilla) {
      pastilla.classList.toggle("cero", !faltan.length);
      pastilla.textContent = faltan.length ? t("toma.faltan", { n: faltan.length, lista: faltan.map((c) => t(ETIQUETAS[c]).toLowerCase()).join(", ") }) : t("toma.completa");
    }
    for (const p of PESTANAS) {
      const cuenta = secToma.querySelector(`.epl-p2-tab[data-tab="${p.k}"] .epl-p2-cuenta`);
      if (!cuenta || p.k === "refs") continue;
      const n = p.campos.filter((c) => faltan.includes(c)).length;
      cuenta.hidden = !n;
      cuenta.textContent = t("toma.falta_n", { n });
    }
  }

  function campoTexto(obj, campo, etiqueta, lista, opciones = {}) {
    const entrada = el("textarea", {
      rows: 1, placeholder: opciones.ayuda || "", "data-campo": campo, "aria-label": etiqueta,
      oninput: (e) => { obj[campo] = e.target.value; fijar(lista, campo); botonCandado.replaceWith(botonCandado = hacer()); pintarFaltas(obj); ctx.pedirMontaje(); pintarRefsSuave(); },
    }, obj[campo] || "");
    const hacer = () => candado(lista, campo, () => { botonCandado.replaceWith(botonCandado = hacer()); });
    let botonCandado = hacer();
    return bloque(campo, etiqueta, entrada, botonCandado, opciones.clase);
  }
  function campoMenu(obj, campo, etiqueta, lista, opciones) {
    const sel = el("select", { "data-campo": campo, "aria-label": etiqueta, onchange: (e) => { obj[campo] = e.target.value; fijar(lista, campo); ctx.pintarPlan(); ctx.pintarRefs(); ctx.pedirMontaje(); } },
      opciones.map(([v, t]) => el("option", { value: v, selected: (obj[campo] || "") === v }, t)));
    return bloque(campo, etiqueta, sel, candado(lista, campo, () => ctx.pintarToma()));
  }
  // referencias de un papel para un menú de la toma; las de personaje solo si tienen atuendo. Los efectos son las
  // referencias de papel efecto y los efectos de texto (E1, E2…)
  function opcionesDe(papel, vacio) {
    const ops = wf.lista.filter((r) => S.refs[r.clave]?.papel === papel && (papel !== "personaje" || (S.refs[r.clave].atuendo || "").trim()))
      .map((r) => [r.tag, `${r.tag} ${(papel === "personaje" ? S.refs[r.clave].atuendo : S.refs[r.clave].nombre) || r.nombre}`]);
    if (papel === "efecto") ops.push(...Object.entries(S.efectos).map(([k, e]) => [k, `${k} ${e.nombre || t("toma.efecto_texto")}`]));
    return ops.length ? [["", vacio], ...ops] : null;
  }
  // la ficha del efecto elegido (referencia o efecto de texto): es la frase que va al prompt
  ctx.fichaEfecto = (id) => !id ? "" : /^E\d+$/.test(id) ? S.efectos[id]?.ficha || "" : ctx.refDe(id).papel === "efecto" ? ctx.refDe(id).ficha || "" : "";

  /* REFERENCIAS de la toma: las que conecta (toma.efectos, una o varias; «+» añade otra). Pueden ser referencias de
   * papel efecto, efectos de texto (E1…) o cualquier otra del Stack. Sin «efecto de la referencia», la ficha de cada una
   * va al prompt tras el encuadre; con él, manda lo que escribiste. */
  function opcionesConectar() {
    const ops = wf.lista.map((r) => [r.tag, `${r.tag} ${S.refs[r.clave]?.nombre || r.nombre}`]);
    ops.push(...Object.entries(S.efectos).map(([k, e]) => [k, `${k} ${e.nombre || t("toma.efecto_texto")}`]));
    return ops.length ? [["", t("toma.sin_efecto")], ...ops] : null;
  }
  const nombreDe = (tag) => /^E\d+$/.test(tag) ? S.efectos[tag]?.nombre || tag
    : S.refs[wf.lista.find((r) => r.tag === tag)?.clave]?.nombre || wf.lista.find((r) => r.tag === tag)?.nombre || tag;
  const conectar = (toma, lista) => {
    toma.efectos = lista;
    toma.efecto = lista.find(Boolean) || "";
    fijar(toma.fijos, "efecto");
    ctx.pintarToma(); ctx.pintarRefs(); ctx.pedirMontaje();
  };
  function campoReferencias(toma) {
    const ops = opcionesConectar();
    const lista = toma.efectos?.length ? toma.efectos : [toma.efecto || ""];
    const filas = !ops ? [el("p", { class: "epl-ayuda" }, t("toma.sin_refs"))] : lista.map((v, i) => el("div", { class: "epl-ref-fila" },
      el("select", { "data-campo": "efecto", "data-i": i, onchange: (e) => conectar(toma, lista.map((x, j) => j === i ? e.target.value : x)) },
        ops.map(([val, txt]) => el("option", { value: val, selected: (v || "") === val }, txt))),
      lista.length > 1 ? el("button", { class: "epl-mini", title: t("toma.efecto.quitar.tooltip"),
        onclick: () => conectar(toma, lista.filter((_, j) => j !== i)) }, u.icono("x")) : null));
    return bloque("efecto", t("toma.efecto"),
      el("div", { class: "epl-ref-lista" }, ...filas,
        ops ? el("button", { class: "epl-mini epl-mas-ref", title: t("toma.efecto.mas.tooltip"),
          onclick: () => conectar(toma, [...lista, ""]) }, u.icono("mas"), " " + t("toma.efecto.mas")) : null),
      candado(toma.fijos, "efecto", () => ctx.pintarToma()), "epl-g-refs");
  }

  /* EFECTO DE LA REFERENCIA: lo que hace cada referencia conectada, con tus palabras (en inglés). Las referencias van
   * dentro como etiquetas: escribe @ (o toca una de abajo) y sale su nombre; en el prompt es su <Picture N>/<Video N>.
   * Si la escribes queda fija y va al final de la toma (↺ vuelve a las fichas); «guardar como efecto» la convierte en un
   * efecto de texto reutilizable (E1, E2…). */
  const ETIQUETA = /(<(?:Picture|Video) \d+>)/;
  function campoEfectoRef(toma) {
    const propia = toma.fijos.includes("efecto_frase") && (toma.efecto_frase || "").trim();
    const conectadas = (toma.efectos || []).filter((x) => x && x.startsWith("<"));
    const fichas = (toma.efectos || []).filter(Boolean).map((x) => ctx.fichaEfecto(x) || ctx.refDe(x)?.ficha || "").filter(Boolean).join(" · ");
    const marca = el("span", { class: "epl-ayuda" }, propia ? t("toma.frase.propia") : fichas ? t("toma.frase.de_ficha") : "");
    const cita = (tag) => el("span", { class: "epl-cita", contenteditable: "false", "data-tag": tag, title: tag,
      onmouseenter: () => ctx.resaltar(tag, true), onmouseleave: () => ctx.resaltar(tag, false) }, nombreDe(tag));
    const caja3 = el("div", { class: "epl-citas", contenteditable: "true", "data-campo": "efecto_frase",
      "data-placeholder": fichas || t("toma.frase.placeholder") });
    for (const trozo of (propia ? toma.efecto_frase : "").split(ETIQUETA)) {
      if (ETIQUETA.test(trozo)) caja3.append(cita(trozo)); else if (trozo) caja3.append(document.createTextNode(trozo));
    }
    // el texto de la caja, con las etiquetas como <Picture N>
    const leer = (n) => [...n.childNodes].map((x) => x.nodeType === 3 ? x.textContent : x.dataset?.tag ? x.dataset.tag
      : x.nodeName === "BR" ? "\n" : (x.nodeName === "DIV" ? "\n" : "") + leer(x)).join("");
    const guardar = () => {
      toma.efecto_frase = leer(caja3).replace(/\u00a0/g, " ");
      fijar(toma.fijos, "efecto_frase"); marca.textContent = t("toma.frase.propia"); ctx.pedirMontaje();
    };
    let rango = null;
    const recordar = () => { const sel = getSelection(); if (sel.rangeCount && caja3.contains(sel.anchorNode)) rango = sel.getRangeAt(0).cloneRange(); };
    // mete la etiqueta donde está el cursor (o al final); `borrar`: caracteres a quitar antes (la @ que abrió el menú)
    const meter = (tag, borrar = 0) => {
      caja3.focus();
      const sel = getSelection();
      let r = rango && caja3.contains(rango.startContainer) ? rango : null;
      if (!r) { r = document.createRange(); r.selectNodeContents(caja3); r.collapse(false); }
      if (borrar && r.startContainer.nodeType === 3 && r.startOffset >= borrar) r.setStart(r.startContainer, r.startOffset - borrar);
      r.deleteContents();
      const nodo = cita(tag), espacio = document.createTextNode("\u00a0");
      r.insertNode(espacio); r.insertNode(nodo);
      r.setStartAfter(espacio); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
      rango = r.cloneRange(); menu.hidden = true; guardar();
    };
    const menu = el("div", { class: "epl-menu-citas", hidden: true }, ...conectadas.map((tag) =>
      el("button", { class: "epl-mini", onmousedown: (e) => { e.preventDefault(); meter(tag, 1); } }, `${tag} ${nombreDe(tag)}`)));
    caja3.addEventListener("input", (e) => {
      recordar(); guardar();
      if (e.data === "@") menu.hidden = !conectadas.length; else if (!e.data?.trim()) menu.hidden = true;
      if (e.data === "@" && !conectadas.length) ctx.avisar(t("toma.frase.sin_conectadas"), "mal");
    });
    caja3.addEventListener("keyup", recordar);
    caja3.addEventListener("mouseup", recordar);
    caja3.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.hidden = true; });
    caja3.addEventListener("blur", () => setTimeout(() => { menu.hidden = true; }, 150));
    const guardarComo = el("button", { class: "epl-mini", title: t("toma.frase.guardar_como.tooltip"),
      onclick: () => {
        const frase = (toma.efecto_frase || "").trim();
        if (!frase) return ctx.avisar(t("toma.frase.vacia"), "mal");
        const id = ctx.nuevoEfecto({ nombre: frase.replace(ETIQUETA, "").split(/\s+/).filter(Boolean).slice(0, 4).join(" "), ficha: frase });
        toma.efecto_frase = "";
        toma.fijos = toma.fijos.filter((f) => f !== "efecto_frase");
        conectar(toma, [id]);
        ctx.avisar(t("toma.frase.creado", { id }), "bien");
      } }, t("toma.frase.guardar_como"));
    return bloque("efecto_frase", t("toma.frase"),
      el("div", { class: "epl-citas-caja" }, caja3, menu,
        el("div", { class: "epl-citas-ayuda" }, el("span", { class: "epl-ayuda" }, t(conectadas.length ? "toma.frase.arroba" : "toma.frase.sin_conectadas")),
          ...conectadas.map((tag) => el("button", { class: "epl-mini epl-citar", onmousedown: (e) => { e.preventDefault(); meter(tag); } }, "@ " + nombreDe(tag)))),
        el("div", { class: "epl-marca-frase" }, marca, propia ? guardarComo : null)),
      el("button", { class: "epl-candado" + (propia ? " fijo" : ""), title: t("toma.frase.volver"), "aria-label": t("toma.frase.volver"),
        onclick: () => { toma.efecto_frase = ""; toma.fijos = toma.fijos.filter((f) => f !== "efecto_frase"); ctx.pintarToma(); ctx.pedirMontaje(); } }, u.icono("volver")),
      "epl-g-efref");
  }

  /* el encuadre: el menú (ENCUADRES) o, con «✎ escribir el mío», un texto propio (queda fijo y se pega tal cual). Un
   * encuadre que no está en el menú se enseña ya como texto; «≡ menú» vuelve al menú. */
  let encuadrePropio = false, tomaPintada = null, lineaAbierta = true;   // (camaraPropia, más abajo, se olvida igual al cambiar de toma)
  // «≡ menú»: vuelve del texto propio al menú (en el sitio del candado, del mismo tamaño)
  const botonMenu = (alTocar) => el("button", { class: "epl-candado epl-volver-menu", title: t("toma.encuadre.menu.tooltip"),
    "aria-label": t("toma.encuadre.menu.tooltip"), onclick: alTocar }, u.icono("menu"));
  function campoEncuadre(toma) {
    const propio = encuadrePropio || (toma.encuadre && !ENCUADRES.includes(toma.encuadre));
    if (!propio) {
      const ops = [["", "—"], ...ENCUADRES.map((e, i) => [e, t(`toma.encuadre_op.${i}`)]), ["__mio", t("toma.encuadre.mio")]];
      const sel = el("select", { "data-campo": "encuadre", "aria-label": t("toma.encuadre"), onchange: (e) => {
        if (e.target.value === "__mio") { encuadrePropio = true; ctx.pintarToma(); return; }
        toma.encuadre = e.target.value; fijar(toma.fijos, "encuadre"); ctx.pintarPlan(); ctx.pedirMontaje(); } },
        ops.map(([v, txt]) => el("option", { value: v, selected: (toma.encuadre || "") === v }, txt)));
      return bloque("encuadre", t("toma.encuadre"), sel, candado(toma.fijos, "encuadre", () => ctx.pintarToma()));
    }
    const entrada = el("textarea", { rows: 1, "data-campo": "encuadre", "aria-label": t("toma.encuadre"), placeholder: t("toma.encuadre.mio.placeholder"),
      oninput: (e) => { toma.encuadre = e.target.value; fijar(toma.fijos, "encuadre"); pintarFaltas(toma); ctx.pedirMontaje(); } }, toma.encuadre || "");
    return bloque("encuadre", t("toma.encuadre"), entrada,
      botonMenu(() => { encuadrePropio = false; if (!ENCUADRES.includes(toma.encuadre)) toma.encuadre = ""; ctx.pintarToma(); ctx.pedirMontaje(); }));
  }
  /* el movimiento de cámara: el menú (MOVIMIENTOS) o un texto propio, como el encuadre. Lo que escribió el LLM y no está
   * en el menú se enseña como texto. */
  let camaraPropia = false;
  function campoCamara(toma) {
    const propia = camaraPropia || (toma.camara && !MOVIMIENTOS.includes(toma.camara));
    if (!propia) {
      const ops = [["", "—"], ...MOVIMIENTOS.map((m, i) => [m, t(`toma.camara_op.${i}`)]), ["__mio", t("toma.encuadre.mio")]];
      const sel = el("select", { "data-campo": "camara", "aria-label": t("toma.camara"), onchange: (e) => {
        if (e.target.value === "__mio") { camaraPropia = true; ctx.pintarToma(); return; }
        toma.camara = e.target.value; fijar(toma.fijos, "camara"); ctx.pintarToma(); ctx.pedirMontaje(); } },
        ops.map(([v, txt]) => el("option", { value: v, selected: (toma.camara || "") === v }, txt)));
      return bloque("camara", t("toma.camara"), sel, candado(toma.fijos, "camara", () => ctx.pintarToma()));
    }
    const entrada = el("textarea", { rows: 1, "data-campo": "camara", "aria-label": t("toma.camara"), placeholder: t("toma.camara.mio.placeholder"),
      oninput: (e) => { toma.camara = e.target.value; fijar(toma.fijos, "camara"); pintarFaltas(toma); ctx.pedirMontaje(); } }, toma.camara || "");
    return bloque("camara", t("toma.camara"), entrada,
      botonMenu(() => { camaraPropia = false; if (!MOVIMIENTOS.includes(toma.camara)) toma.camara = ""; ctx.pintarToma(); ctx.pedirMontaje(); }));
  }
  /* el entorno (su propio bloque, encima del lugar): «Entorno auto» (lo escribe el LLM; si escribes el lugar, pasa a
   * manual), «Entorno manual» (fijo; hace de candado del lugar) o «Sin entorno» (no se escribe ningún lugar ni fondo, y la
   * luz solo va si la escribes). El lugar no lleva candado: su candado es el entorno. */
  function campoEntorno(toma) {
    const poner = (e) => {
      toma.entorno = e;
      if (e === "ninguno" && !toma.fijos.includes("luz")) toma.luz = "";   // la luz del LLM no va sin entorno; la tuya sí
      toma.fijos = [...toma.fijos.filter((f) => f !== "lugar"), ...(e === "manual" ? ["lugar"] : [])];
      ctx.pintarToma(); ctx.pintarRefs(); ctx.pintarLinea(); ctx.pedirMontaje();
    };
    return bloque("entorno", t("toma.entorno"),
      el("span", { class: "epl-entorno", role: "group", "aria-label": t("toma.entorno") }, ...ENTORNOS.map((e) =>
        el("button", { class: "epl-mini epl-seg" + (toma.entorno === e ? " fijo" : ""), "data-entorno": e, title: t(`toma.entorno.${e}.tooltip`),
                       "aria-pressed": String(toma.entorno === e), onclick: () => poner(e) }, t(`toma.entorno.${e}`)))));
  }
  function campoLugar(toma) {
    const entrada = el("textarea", { rows: 1, "data-campo": "lugar", "aria-label": t("toma.lugar"),
      oninput: (e) => {
        toma.lugar = e.target.value;
        if (toma.entorno !== "manual") {           // escribirlo lo deja en manual (el bloque del entorno se pone al día)
          toma.entorno = "manual"; fijar(toma.fijos, "lugar");
          const viejo = secToma.querySelector('[data-c2="entorno"]');
          if (viejo) viejo.replaceWith(campoEntorno(toma));
        }
        pintarFaltas(toma); ctx.pedirMontaje(); pintarRefsSuave();
      } }, toma.lugar || "");
    return bloque("lugar", t("toma.lugar"), entrada);
  }

  // ---- el sonido de todo el edit: un renglón al final de la pestaña (27 oct). Va tal cual a overall_soundscape; vacío,
  // la frase «sonido» de frases.json
  /* y, en la app (no en el nodo de ComfyUI, donde el grafo es del usuario), qué audio lleva el video generado: tu canción
   * (por defecto; H3 solo la usa de guía) o el audio que genera H3 (app/generar.py conecta el CreateVideo a uno u otro) */
  const AUDIOS = [["cancion", "linea.audio.cancion"], ["modelo", "linea.audio.modelo"]];
  ctx.pintarSonido = function pintarSonido() {
    const audio = !ctx.enApp ? null : el("div", { class: "epl-audio-salida" },
      el("span", { class: "epl-audio-salida-et", id: "epl-audio-salida-et" }, t("linea.audio")),
      el("span", { class: "epl-fila", role: "group", "aria-labelledby": "epl-audio-salida-et" }, ...AUDIOS.map(([k, clave]) =>
        el("button", { class: "epl-mini epl-seg" + (S.audio_salida === k ? " fijo" : ""), "aria-pressed": String(S.audio_salida === k),
                       "data-audio": k, onclick: () => { S.audio_salida = k; ctx.programarGuardado(); ctx.pintarSonido(); } }, t(clave)))),
      el("span", { class: "epl-ayuda" }, t("linea.audio.ayuda")));
    secSonido?.replaceChildren(el("label", { class: "epl-campo ancho epl-sonido-campo", title: t("linea.sonido.tooltip") },
      el("span", {}, el("i", { class: "epl-icono" }, u.icono("sonido")), t("linea.sonido")),
      el("input", { "data-campo": "sonido", placeholder: t("linea.sonido.placeholder"), value: S.sonido,
                    oninput: (e) => { S.sonido = e.target.value; ctx.pedirMontaje(); } })), audio);
  };

  // ---- 2 · prompt de la toma elegida
  const lineaDe = (k) => (S.prompt.match(new RegExp(`^\\[Shot ${k}\\].*$`, "m")) || [""])[0];
  // los segundos y los fotogramas de la toma, para su título (van en letra de cifras; el nombre, en la de título)
  const cifrasToma = (a, z) => t("toma.titulo_cifras", { a: u.num(a, 3), z: u.num(+z, 3), f: Math.round((+z - a) * 24) });
  ctx.pintarLineaToma = function pintarLineaToma() {
    const caja2 = secToma.querySelector(".epl-linea-toma");   // dentro de un <details>: plegada, una sola línea
    if (!caja2 || !S.elegida) return;
    // el título lleva los segundos de la toma, que llegan con el montaje (al abrir aún no estaban)
    const tit = secToma.querySelector(".epl-tit-cifras"), a = S.cortes[S.elegida - 1], z = S.cortes[S.elegida] ?? S.duracion;
    if (tit && a !== undefined) tit.textContent = cifrasToma(a, z);
    const linea = lineaDe(S.elegida);
    caja2.replaceChildren(...(linea ? linea.split(/(<(?:Picture|Video|Audio|Subject) \d+>)/).map((s) =>
      /^<(Picture|Video) \d+>$/.test(s) ? el("span", { class: "epl-tag", "data-tag": s, onmouseenter: () => ctx.resaltar(s, true),
                                                      onmouseleave: () => ctx.resaltar(s, false) }, s) : s)
      : [t("toma.sin_linea")]));
  };
  /* el fondo de la toma: su menú con una miniatura de la imagen elegida al lado (28 oct: pequeña; la imagen grande está
   * arriba, en el estante) */
  function campoFondo(toma) {
    const ops = opcionesDe("fondo", t("toma.sin_fondo"));
    if (!ops) return null;
    const r = wf.lista.find((x) => x.tag === toma.fondo_ref);
    const src = r ? ctx.vista(r) : "";
    const sel = el("select", { "data-campo": "fondo_ref", "aria-label": t("toma.fondo"),
      onchange: (e) => { toma.fondo_ref = e.target.value; fijar(toma.fijos, "fondo_ref"); ctx.pintarPlan(); ctx.pintarRefs(); ctx.pedirMontaje(); } },
      ops.map(([v, txt]) => el("option", { value: v, selected: (toma.fondo_ref || "") === v }, txt)));
    return bloque("fondo_ref", t("toma.fondo"),
      el("span", { class: "epl-fondo-p2" },
        el("span", { class: "epl-fondo-mini" + (src ? "" : " vacia"), onmouseenter: () => toma.fondo_ref && ctx.resaltar(toma.fondo_ref, true),
                     onmouseleave: () => toma.fondo_ref && ctx.resaltar(toma.fondo_ref, false) }, src ? el("img", { src, alt: "", loading: "lazy" }) : null),
        sel),
      candado(toma.fijos, "fondo_ref", () => ctx.pintarToma()));
  }

  /* ---- el panel de la toma (28 oct, variante P2 elegida por el usuario): arriba el título (la toma, sus cifras y lo que
   * falta) con sus acciones a la derecha; después lo principal siempre a la vista, «Qué pasa» (Acción / movimiento) y «El
   * personaje» (Gesto); y lo demás en tres pestañas, Cámara, Lugar y estilo, y Referencias, que dicen cuánto falta en
   * cada una. Al final, el prompt de la toma entero. «Escribir tomas» es de todo el edit: está en la línea de tiempo. */
  const PESTANAS = [{ k: "camara", nombre: "toma.pestana.camara", campos: ["encuadre", "camara", "luz"] },
                    { k: "lugar", nombre: "toma.pestana.lugar", campos: ["lugar"] },
                    { k: "refs", nombre: "toma.pestana.refs", campos: [] }];
  let pestana = "camara";
  // cambiar de pestaña no vuelve a pintar el panel (no se pierde lo que estás escribiendo)
  const ponerPestana = (k) => {
    pestana = k;
    for (const b of secToma.querySelectorAll(".epl-p2-tab")) { b.classList.toggle("si", b.dataset.tab === k); b.setAttribute("aria-selected", String(b.dataset.tab === k)); }
    for (const c of secToma.querySelectorAll(".epl-p2-cont")) c.hidden = c.dataset.tab !== k;
  };
  ctx.pintarToma = function pintarToma() {
    const k = S.elegida, toma = k ? S.plan.tomas[k - 1] : null;
    if (k !== tomaPintada) { encuadrePropio = false; camaraPropia = false; tomaPintada = k; }   // en otra toma lo decide su valor
    if (!toma) {
      secToma.replaceChildren(el("div", { class: "epl-p2-cab" }, el("span", { class: "epl-tit-toma" }, t("toma.titulo_vacio"))),
        el("div", { class: "epl-vacio" }, t("toma.vacio")));
      return;
    }
    const a = S.cortes[k - 1], z = S.cortes[k] ?? S.duracion;
    const menu = (campo, etiqueta, papel, vacio) => {
      const ops = opcionesDe(papel, vacio);
      return ops ? campoMenu(toma, campo, t(etiqueta), toma.fijos, ops) : null;
    };
    const ninguno = toma.entorno === "ninguno";     // sin entorno no hay lugar fijo ni fondo que elegir
    const usa = [menu("personaje", "toma.atuendo", "personaje", "—"), menu("ropa", "toma.ropa", "ropa", t("toma.sin_ropa")),
                 menu("pose", "toma.pose", "pose", t("toma.sin_pose")), menu("objeto", "toma.objeto", "objeto", t("toma.sin_objeto")),
                 ninguno ? null : menu("lugar_ref", "toma.lugar_fijo", "lugar", t("toma.sin_lugar_fijo")),
                 ninguno ? null : campoFondo(toma)].filter(Boolean);
    // «Efecto de la referencia» solo sale con una referencia conectada (o si ya escribiste tu frase: no se esconde lo tuyo)
    const conectadas = (toma.efectos || []).filter(Boolean).length;
    const propia = toma.fijos.includes("efecto_frase") && (toma.efecto_frase || "").trim();
    const contenido = {
      camara: [campoEncuadre(toma), campoCamara(toma),
               campoTexto(toma, "luz", t(ninguno ? "toma.luz_opcional" : "toma.luz"), toma.fijos, { ayuda: t("toma.luz.ayuda") })],
      lugar: [campoEntorno(toma), ninguno ? el("p", { class: "epl-ayuda epl-p2-nota" }, t("toma.entorno.ninguno.ayuda")) : campoLugar(toma),
              // el estilo de esta toma (27 oct): vacío = el de las referencias de papel estilo
              campoTexto(toma, "estilo", t("toma.estilo"), toma.fijos, { ayuda: t("toma.estilo.placeholder") })],
      refs: [campoReferencias(toma), conectadas || propia ? campoEfectoRef(toma) : null, ...usa,
             el("p", { class: "epl-ayuda epl-p2-nota" }, t("toma.refs.ayuda"))],
    };
    const nRefs = (ctx.refsDeToma?.(k) || []).length;
    // el título: «Toma 1» (rotulado, como en la etiqueta de una cinta) y, aparte, sus segundos y fotogramas
    const titulo = el("span", { class: "epl-tit-toma", title: t("toma.titulo", { k }) }, el("span", { class: "epl-tit-nombre" }, t("linea.toma", { k })),
      el("span", { class: "epl-tit-cifras" }, a === undefined ? "" : cifrasToma(a, z)));
    secToma.replaceChildren(
      el("div", { class: "epl-p2-cab" },
        el("span", { class: "epl-pista" }, t("linea.pista", { k })), titulo, el("span", { class: "epl-p2-faltan" }),
        el("span", { class: "epl-p2-acciones" },
          el("button", { class: "epl-boton", title: t("toma.rehacer.tooltip"),
            onclick: () => ctx.conLLM("toma.rehaciendo", "tomas", { solo: k }, { k }) }, u.icono("rehacer"), " " + t("toma.rehacer")),
          S.tomas > 1 ? el("button", { class: "epl-boton epl-solo-icono", title: t("toma.quitar.tooltip"), "aria-label": t("toma.quitar.tooltip"),
                                       onclick: () => ctx.quitarToma(k) }, u.icono("x")) : null)),
      el("div", { class: "epl-p2-arriba" },
        el("section", { class: "epl-p2-grupo" }, el("h3", {}, t("toma.grupo.que_pasa")),
          campoTexto(toma, "momento", t("toma.momento"), toma.fijos, { clase: "epl-g-accion", ayuda: t("toma.momento.ayuda") })),
        el("section", { class: "epl-p2-grupo" }, el("h3", {}, t("toma.grupo.personaje")),
          campoTexto(toma, "gesto", t("toma.gesto"), toma.fijos, { ayuda: t("toma.gesto.ayuda") }))),
      el("div", { class: "epl-p2-tabs", role: "tablist", "aria-label": t("toma.pestanas") }, ...PESTANAS.map((p) =>
        el("button", { class: "epl-p2-tab" + (pestana === p.k ? " si" : ""), role: "tab", "aria-selected": String(pestana === p.k), "data-tab": p.k,
                       onclick: () => ponerPestana(p.k) },
          t(p.nombre), el("span", { class: "epl-p2-cuenta", hidden: true }),
          p.k === "refs" ? el("span", { class: "epl-p2-num", title: t("toma.pestana.refs_n", { n: nRefs }) }, String(nRefs)) : null))),
      ...PESTANAS.map((p) => el("div", { class: "epl-p2-cont epl-p2-cont-" + p.k, role: "tabpanel", "data-tab": p.k, hidden: pestana !== p.k },
        ...contenido[p.k].filter(Boolean))),
      // la línea de la toma en el prompt, entera (se pliega al tocarla); se recuerda abierta o cerrada
      el("details", { class: "epl-linea-plegable", open: lineaAbierta, ontoggle: (e) => { lineaAbierta = e.target.open; } },
        el("summary", { title: t("toma.linea.tooltip") }, el("span", { class: "epl-linea-et" }, t("toma.linea")), el("span", { class: "epl-linea-toma" }))));
    pintarFaltas(toma);
    ctx.pintarLineaToma();
    ctx.zonaToma(secToma, k);     // soltar aquí un póster del estante lo conecta a esta toma (referencias.js)
  };

  ctx.pintarPlan = function pintarPlan() {
    ctx.pintarSonido();
    ctx.pintarToma();
    ctx.pintarLinea();
  };
}
