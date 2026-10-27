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

  // ---- campos con candado: lo que escribes queda fijo y el LLM no lo cambia
  const candado = (lista, campo, alCambiar) => el("button", {
    class: "epl-candado" + (lista.includes(campo) ? " fijo" : ""), title: t("comun.candado"),
    onclick: () => { const i = lista.indexOf(campo); if (i >= 0) lista.splice(i, 1); else lista.push(campo); alCambiar(); },
  }, lista.includes(campo) ? "🔒" : "🔓");
  const fijar = (lista, campo) => { if (!lista.includes(campo)) lista.push(campo); };
  let refrescoRefs = null;
  const pintarRefsSuave = () => { clearTimeout(refrescoRefs); refrescoRefs = setTimeout(() => { ctx.pintarRefs(); ctx.pintarLinea(); }, 600); };

  // un letrero de campo; los importantes llevan su icono y su color (clase epl-et-…), y los destacados un degradado
  const letrero = (texto, clase = "", icono = "") => el("span", { class: clase }, icono ? el("i", { class: "epl-icono" }, icono) : null, texto);
  function campoTexto(obj, campo, etiqueta, lista, opciones = {}) {
    const entrada = el(opciones.largo ? "textarea" : "input", {
      rows: opciones.largo ? (opciones.filas || 2) : undefined, placeholder: opciones.ayuda || "", "data-campo": campo,
      oninput: (e) => { obj[campo] = e.target.value; fijar(lista, campo); botonCandado.replaceWith(botonCandado = hacer()); ctx.pedirMontaje(); pintarRefsSuave(); },
    });
    if (opciones.largo) entrada.textContent = obj[campo] || ""; else entrada.value = obj[campo] || "";
    const hacer = () => candado(lista, campo, () => { botonCandado.replaceWith(botonCandado = hacer()); });
    let botonCandado = hacer();
    return el("label", { class: "epl-campo" + (opciones.clase ? " " + opciones.clase : "") },
      typeof etiqueta === "string" ? el("span", {}, etiqueta) : etiqueta, entrada, botonCandado);
  }
  function campoMenu(obj, campo, etiqueta, lista, opciones) {
    const sel = el("select", { "data-campo": campo, onchange: (e) => { obj[campo] = e.target.value; fijar(lista, campo); ctx.pintarPlan(); ctx.pintarRefs(); ctx.pedirMontaje(); } },
      opciones.map(([v, t]) => el("option", { value: v, selected: (obj[campo] || "") === v }, t)));
    return el("label", { class: "epl-campo" }, el("span", {}, etiqueta), sel, candado(lista, campo, () => ctx.pintarToma()));
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
        onclick: () => conectar(toma, lista.filter((_, j) => j !== i)) }, "✕") : null));
    return el("div", { class: "epl-campo epl-destacado epl-g-refs" },
      el("span", {}, el("i", { class: "epl-icono" }, "🔗"), t("toma.efecto"),
        ops ? el("button", { class: "epl-mini epl-mas-ref", title: t("toma.efecto.mas.tooltip"),
          onclick: () => conectar(toma, [...lista, ""]) }, "+") : null),
      el("div", { class: "epl-ref-lista" }, ...filas),
      candado(toma.fijos, "efecto", () => ctx.pintarToma()));
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
    return el("div", { class: "epl-campo epl-destacado epl-g-efref" },
      el("span", {}, el("i", { class: "epl-icono" }, "✨"), t("toma.frase")),
      el("div", { class: "epl-citas-caja" }, caja3, menu,
        el("div", { class: "epl-citas-ayuda" }, el("span", { class: "epl-ayuda" }, t(conectadas.length ? "toma.frase.arroba" : "toma.frase.sin_conectadas")),
          ...conectadas.map((tag) => el("button", { class: "epl-mini epl-citar", onmousedown: (e) => { e.preventDefault(); meter(tag); } }, "@ " + nombreDe(tag)))),
        el("div", { class: "epl-marca-frase" }, marca, propia ? guardarComo : null)),
      el("button", { class: "epl-candado" + (propia ? " fijo" : ""), title: t("toma.frase.volver"),
        onclick: () => { toma.efecto_frase = ""; toma.fijos = toma.fijos.filter((f) => f !== "efecto_frase"); ctx.pintarToma(); ctx.pedirMontaje(); } }, "↺"));
  }

  /* el encuadre: el menú (ENCUADRES) o, con «✎ escribir el mío», un texto propio (queda fijo y se pega tal cual). Un
   * encuadre que no está en el menú se enseña ya como texto; «≡ menú» vuelve al menú. */
  let encuadrePropio = false, tomaPintada = null, lineaAbierta = false;   // (camaraPropia, más abajo, se olvida igual al cambiar de toma)
  function campoEncuadre(toma) {
    const et = () => letrero(t("toma.encuadre"), "", "🖼️");
    const propio = encuadrePropio || (toma.encuadre && !ENCUADRES.includes(toma.encuadre));
    if (!propio) {
      const ops = [["", "—"], ...ENCUADRES.map((e, i) => [e, t(`toma.encuadre_op.${i}`)]), ["__mio", t("toma.encuadre.mio")]];
      const sel = el("select", { "data-campo": "encuadre", onchange: (e) => {
        if (e.target.value === "__mio") { encuadrePropio = true; ctx.pintarToma(); return; }
        toma.encuadre = e.target.value; fijar(toma.fijos, "encuadre"); ctx.pintarPlan(); ctx.pedirMontaje(); } },
        ops.map(([v, txt]) => el("option", { value: v, selected: (toma.encuadre || "") === v }, txt)));
      return el("label", { class: "epl-campo epl-medio epl-et-encuadre" }, et(), sel, candado(toma.fijos, "encuadre", () => ctx.pintarToma()));
    }
    const entrada = el("textarea", { rows: 2, "data-campo": "encuadre", placeholder: t("toma.encuadre.mio.placeholder"),
      oninput: (e) => { toma.encuadre = e.target.value; fijar(toma.fijos, "encuadre"); ctx.pedirMontaje(); } }, toma.encuadre || "");
    return el("label", { class: "epl-campo epl-medio epl-et-encuadre" }, et(), entrada,
      el("button", { class: "epl-mini", title: t("toma.encuadre.menu.tooltip"),
        onclick: () => { encuadrePropio = false; if (!ENCUADRES.includes(toma.encuadre)) toma.encuadre = ""; ctx.pintarToma(); ctx.pedirMontaje(); } },
        t("toma.encuadre.menu")));
  }
  /* el movimiento de cámara: el menú (MOVIMIENTOS) o un texto propio, como el encuadre. Lo que escribió el LLM y no está
   * en el menú se enseña como texto. */
  let camaraPropia = false;
  function campoCamara(toma) {
    const propia = camaraPropia || (toma.camara && !MOVIMIENTOS.includes(toma.camara));
    const et = letrero(t("toma.camara"), "", "🎥");
    if (!propia) {
      const ops = [["", "—"], ...MOVIMIENTOS.map((m, i) => [m, t(`toma.camara_op.${i}`)]), ["__mio", t("toma.encuadre.mio")]];
      const sel = el("select", { "data-campo": "camara", onchange: (e) => {
        if (e.target.value === "__mio") { camaraPropia = true; ctx.pintarToma(); return; }
        toma.camara = e.target.value; fijar(toma.fijos, "camara"); ctx.pintarToma(); ctx.pedirMontaje(); } },
        ops.map(([v, txt]) => el("option", { value: v, selected: (toma.camara || "") === v }, txt)));
      return el("label", { class: "epl-campo epl-medio epl-et-camara" }, et, sel, candado(toma.fijos, "camara", () => ctx.pintarToma()));
    }
    const entrada = el("textarea", { rows: 2, "data-campo": "camara", placeholder: t("toma.camara.mio.placeholder"),
      oninput: (e) => { toma.camara = e.target.value; fijar(toma.fijos, "camara"); ctx.pedirMontaje(); } }, toma.camara || "");
    return el("label", { class: "epl-campo epl-medio epl-et-camara" }, et, entrada,
      el("button", { class: "epl-mini", title: t("toma.encuadre.menu.tooltip"),
        onclick: () => { camaraPropia = false; if (!MOVIMIENTOS.includes(toma.camara)) toma.camara = ""; ctx.pintarToma(); ctx.pedirMontaje(); } },
        t("toma.encuadre.menu")));
  }
  /* el lugar de la toma con su selector de entorno (en lugar del candado): «Entorno auto» (lo escribe el LLM; si lo
   * escribes tú, pasa a manual), «Entorno manual» (fijo) o «Sin entorno» (no se escribe ningún lugar ni fondo, y la luz
   * solo va si la escribes) */
  function campoLugar(toma) {
    const poner = (e) => {
      toma.entorno = e;
      if (e === "ninguno" && !toma.fijos.includes("luz")) toma.luz = "";   // la luz del LLM no va sin entorno; la tuya sí
      toma.fijos = [...toma.fijos.filter((f) => f !== "lugar"), ...(e === "manual" ? ["lugar"] : [])];
      ctx.pintarToma(); ctx.pintarRefs(); ctx.pintarLinea(); ctx.pedirMontaje();
    };
    const ninguno = toma.entorno === "ninguno";
    const entrada = el("textarea", { rows: 2, "data-campo": "lugar", disabled: ninguno,
      placeholder: ninguno ? t("toma.entorno.ninguno.ayuda") : "",
      oninput: (e) => {
        toma.lugar = e.target.value;
        if (toma.entorno !== "manual") { toma.entorno = "manual"; fijar(toma.fijos, "lugar"); botones.replaceWith(botones = selector()); }
        ctx.pedirMontaje(); pintarRefsSuave();
      } }, toma.lugar || "");
    const selector = () => el("span", { class: "epl-entorno" }, ...ENTORNOS.map((e) =>
      el("button", { class: "epl-mini" + (toma.entorno === e ? " fijo" : ""), "data-entorno": e, title: t(`toma.entorno.${e}.tooltip`),
                     onclick: () => poner(e) }, t(`toma.entorno.${e}`))));
    let botones = selector();
    return el("div", { class: "epl-campo-lugar" },
      el("label", { class: "epl-campo" }, el("span", {}, t("toma.lugar")), entrada), botones);
  }

  // ---- el sonido de todo el edit: un renglón al final de la pestaña (27 oct). Va tal cual a overall_soundscape; vacío,
  // la frase «sonido» de frases.json
  ctx.pintarSonido = function pintarSonido() {
    secSonido?.replaceChildren(el("label", { class: "epl-campo ancho epl-sonido-campo", title: t("linea.sonido.tooltip") },
      el("span", {}, el("i", { class: "epl-icono" }, "🔊"), t("linea.sonido")),
      el("input", { "data-campo": "sonido", placeholder: t("linea.sonido.placeholder"), value: S.sonido,
                    oninput: (e) => { S.sonido = e.target.value; ctx.pedirMontaje(); } })));
  };

  // ---- 2 · prompt de la toma elegida
  const lineaDe = (k) => (S.prompt.match(new RegExp(`^\\[Shot ${k}\\].*$`, "m")) || [""])[0];
  ctx.pintarLineaToma = function pintarLineaToma() {
    const caja2 = secToma.querySelector(".epl-linea-toma");   // dentro de un <details>: plegada, una sola línea
    if (!caja2 || !S.elegida) return;
    // el título lleva los segundos de la toma, que llegan con el montaje (al abrir aún no estaban)
    const tit = secToma.querySelector(".epl-tit-toma"), a = S.cortes[S.elegida - 1], z = S.cortes[S.elegida] ?? S.duracion;
    if (tit && a !== undefined) tit.textContent = t("toma.titulo_tiempo", { k: S.elegida, a: u.num(a, 3), z: u.num(+z, 3) });
    const linea = lineaDe(S.elegida);
    caja2.replaceChildren(...(linea ? linea.split(/(<(?:Picture|Video|Audio|Subject) \d+>)/).map((s) =>
      /^<(Picture|Video) \d+>$/.test(s) ? el("span", { class: "epl-tag", "data-tag": s, onmouseenter: () => ctx.resaltar(s, true),
                                                      onmouseleave: () => ctx.resaltar(s, false) }, s) : s)
      : [t("toma.sin_linea")]));
  };
  /* el fondo de la toma (26 oct): grande pero apagado, con su menú a todo lo ancho y debajo una vista previa cuadrada y
   * grande de la imagen elegida, para aprovechar el hueco de la columna de la derecha */
  function campoFondo(toma) {
    const ops = opcionesDe("fondo", t("toma.sin_fondo"));
    if (!ops) return null;
    const r = wf.lista.find((x) => x.tag === toma.fondo_ref);
    const src = r ? ctx.vista(r) : "";
    return el("div", { class: "epl-fondo-grande" },
      campoMenu(toma, "fondo_ref", t("toma.fondo"), toma.fijos, ops),
      el("div", { class: "epl-fondo-vista" + (src ? "" : " vacia"),
        onmouseenter: () => toma.fondo_ref && ctx.resaltar(toma.fondo_ref, true), onmouseleave: () => toma.fondo_ref && ctx.resaltar(toma.fondo_ref, false) },
        src ? el("img", { src, alt: "", loading: "lazy" }) : el("span", { class: "epl-ayuda" }, t("toma.sin_fondo"))));
  }
  ctx.pintarToma = function pintarToma() {
    const k = S.elegida, toma = k ? S.plan.tomas[k - 1] : null;
    if (k !== tomaPintada) { encuadrePropio = false; camaraPropia = false; tomaPintada = k; }   // en otra toma lo decide su valor
    const botonTomas = el("button", { class: "epl-boton epl-llm epl-azul-osc", title: t("final.escribir_tomas.tooltip"),
      onclick: () => ctx.conLLM("final.escribiendo_tomas", "tomas") }, t("final.escribir_tomas"));
    if (!toma) {
      secToma.replaceChildren(el("div", { class: "epl-tit epl-tit-izq" }, el("span", { class: "epl-botones-toma" }, botonTomas),
        el("span", { class: "epl-tit-toma" }, t("toma.titulo_vacio"))),
        el("div", { class: "epl-vacio" }, t("toma.vacio")));
      return;
    }
    const a = S.cortes[k - 1], z = S.cortes[k] ?? S.duracion;
    const menu = (campo, etiqueta, papel, vacio) => {
      const ops = opcionesDe(papel, vacio);
      return ops ? campoMenu(toma, campo, t(etiqueta), toma.fijos, ops) : null;
    };
    const ninguno = toma.entorno === "ninguno";     // sin entorno no hay lugar fijo ni fondo que elegir
    const refs = [menu("personaje", "toma.atuendo", "personaje", "—"), menu("ropa", "toma.ropa", "ropa", t("toma.sin_ropa")),
                  menu("pose", "toma.pose", "pose", t("toma.sin_pose")), menu("objeto", "toma.objeto", "objeto", t("toma.sin_objeto")),
                  ninguno ? null : menu("lugar_ref", "toma.lugar_fijo", "lugar", t("toma.sin_lugar_fijo")),
                  ninguno ? null : campoFondo(toma)].filter(Boolean);
    const titulo = el("span", { class: "epl-tit-toma" }, a === undefined ? t("toma.titulo", { k })
      : t("toma.titulo_tiempo", { k, a: u.num(a, 3), z: u.num(+z, 3) }));
    secToma.replaceChildren(
      // los botones a la izquierda (se lee de izquierda a derecha) y el título después
      el("div", { class: "epl-tit epl-tit-izq" },
        el("span", { class: "epl-botones-toma" }, botonTomas,
          el("button", { class: "epl-mini", title: t("toma.rehacer.tooltip"),
            onclick: () => ctx.conLLM("toma.rehaciendo", "tomas", { solo: k }, { k }) }, t("toma.rehacer")),
          S.tomas > 1 ? el("button", { class: "epl-mini", title: t("toma.quitar.tooltip"), onclick: () => ctx.quitarToma(k) }, t("toma.quitar")) : null),
        titulo),
      el("div", { class: "epl-tres" },
        el("div", {}, el("b", {}, t("toma.direccion")),
          campoTexto(toma, "momento", el("span", {}, el("i", { class: "epl-icono" }, "🎬"), t("toma.momento")), toma.fijos,
                     { largo: true, filas: 2, clase: "epl-destacado epl-g-accion", ayuda: t("toma.momento.ayuda") }),
          campoReferencias(toma),
          campoEfectoRef(toma)),
        // encuadre, cámara y luz, a la derecha de la acción (26 oct), con un título intermedio: borde de color
        el("div", {}, el("b", {}, t("toma.que_pasa")),
          campoEncuadre(toma),
          campoCamara(toma),
          campoTexto(toma, "luz", el("span", {}, el("i", { class: "epl-icono" }, "💡"), t(ninguno ? "toma.luz_opcional" : "toma.luz")),
                     toma.fijos, { largo: true, filas: 1, clase: "epl-medio epl-et-luz" }),
          campoLugar(toma),
          campoTexto(toma, "gesto", t("toma.gesto"), toma.fijos, { largo: true, filas: 1 }),
          // el estilo de esta toma (27 oct): vacío = el de las referencias de papel estilo
          campoTexto(toma, "estilo", letrero(t("toma.estilo"), "", "🎨"), toma.fijos,
                     { largo: true, filas: 1, clase: "epl-medio epl-et-estilo", ayuda: t("toma.estilo.placeholder") })),
        el("div", { class: "epl-col-refs" }, el("b", {}, t("toma.refs")),
          ...(refs.length ? refs : [el("p", { class: "epl-ayuda" }, t("toma.sin_refs"))]),
          el("p", { class: "epl-ayuda" }, t("toma.refs.ayuda")))),
      // la línea de la toma en el prompt, plegada en una línea (se abre al tocarla); se recuerda abierta o cerrada
      el("details", { class: "epl-linea-plegable", open: lineaAbierta, ontoggle: (e) => { lineaAbierta = e.target.open; } },
        el("summary", { title: t("toma.linea.tooltip") }, el("span", { class: "epl-linea-et" }, t("toma.linea")), el("span", { class: "epl-linea-toma" }))));
    ctx.pintarLineaToma();
    ctx.zonaToma(secToma, k);     // soltar aquí un póster del estante lo conecta a esta toma (referencias.js)
  };

  ctx.pintarPlan = function pintarPlan() {
    ctx.pintarSonido();
    ctx.pintarToma();
    ctx.pintarLinea();
  };
}
