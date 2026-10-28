/* Traducir al inglés (28 oct; planos/fases/14 Traducir.md). Lo que va a H3 se escribe en inglés: un botón «Traducir a
 * inglés» junto a cada campo de la toma (y del sonido) traduce el campo entero, y en CUALQUIER campo de la ventana el clic
 * derecho con texto seleccionado ofrece «Traducir selección». Siempre AL inglés; el idioma de partida se elige en la
 * cabecera (10 idiomas con buscador, u otro escrito a mano) y se recuerda en este navegador. Mayús + clic derecho abre el
 * menú normal del navegador.
 *   - El LLM local traduce en el servidor (acción «traducir», nucleo.traducir): lo protegido (<Picture N>, <Subject 1>,
 *     citas @, E1, tiempos y el texto entre comillas) no se toca; una selección se manda con el texto entero de contexto.
 *   - La traducción entra en el campo como si la hubieras escrito (execCommand «insertText»/«insertHTML»): Ctrl+Z vuelve a
 *     tu texto. Mientras traduce, el campo queda de solo lectura; si desaparece antes de que llegue, no se toca nada.
 * Añade a ctx: botonTraducir(campo), traducirCampo(campo), pintarIdiomaTraducir() (el selector de la cabecera). */

// los 10 idiomas del selector: su nombre en inglés va al LLM; el letrero, traducir.idioma.<código>
export const IDIOMAS = [["es", "Spanish"], ["pt", "Portuguese"], ["fr", "French"], ["it", "Italian"], ["de", "German"],
                        ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"], ["ru", "Russian"], ["ar", "Arabic"]];
const GUARDA = "max-editor-traducir-desde";

export function instalar(ctx) {
  const { u } = ctx;
  const { el, t } = u;

  // ---- el idioma de partida: {codigo} de los 10, o {libre: "Catalan"} escrito a mano
  const leer = () => { try { return JSON.parse(localStorage.getItem(GUARDA) || "null") || { codigo: "es" }; } catch { return { codigo: "es" }; } };
  const poner = (x) => { try { localStorage.setItem(GUARDA, JSON.stringify(x)); } catch { /* sin almacenamiento: solo esta vez */ } };
  const desde = () => { const x = leer(); return x.libre ? x.libre : (IDIOMAS.find(([c]) => c === x.codigo) || IDIOMAS[0])[1]; };
  const nombreDesde = () => { const x = leer(); return x.libre ? x.libre : t(`traducir.idioma.${(IDIOMAS.find(([c]) => c === x.codigo) || IDIOMAS[0])[0]}`); };

  // ---- el selector de la cabecera: «Traducir desde: Español ▾» y su ventanita con buscador y «otro idioma»
  const selector = el("span", { class: "epl-trad-desde" });
  let abierta = null;
  const cerrarLista = () => { abierta?.remove(); abierta = null; };
  function abrirLista(boton) {
    cerrarLista();
    const buscar = el("input", { type: "search", placeholder: t("traducir.buscar"), "aria-label": t("traducir.buscar") });
    const lista = el("div", { class: "epl-trad-lista", role: "listbox" });
    const otro = el("input", { placeholder: t("traducir.otro.placeholder"), "aria-label": t("traducir.otro") });
    const elegir = (x) => { poner(x); cerrarLista(); ctx.pintarIdiomaTraducir(); };
    const pintar = () => {
      const q = buscar.value.trim().toLowerCase(), x = leer();
      lista.replaceChildren(...IDIOMAS.filter(([c, en]) => !q || t(`traducir.idioma.${c}`).toLowerCase().includes(q) || en.toLowerCase().includes(q))
        .map(([c]) => el("button", { class: "epl-mini" + (!x.libre && x.codigo === c ? " fijo" : ""), role: "option", "aria-selected": String(!x.libre && x.codigo === c),
                                     onclick: () => elegir({ codigo: c }) }, t(`traducir.idioma.${c}`))));
      if (!lista.childElementCount) lista.append(el("span", { class: "epl-ayuda" }, t("traducir.sin_resultados")));
    };
    buscar.addEventListener("input", pintar);
    buscar.addEventListener("keydown", (e) => { if (e.key === "Enter") lista.querySelector("button")?.click(); });
    const usarOtro = () => { const n = otro.value.trim().replace(/[^\p{L} ()'-]+/gu, "").slice(0, 40); if (n) elegir({ libre: n }); };
    otro.addEventListener("keydown", (e) => { if (e.key === "Enter") usarOtro(); });
    if (leer().libre) otro.value = leer().libre;
    abierta = el("div", { class: "epl-trad-pop", role: "dialog", "aria-label": t("traducir.desde") },
      el("b", {}, t("traducir.desde_titulo")), buscar, lista,
      el("label", { class: "epl-trad-otro" }, el("span", {}, t("traducir.otro")), otro,
        el("button", { class: "epl-mini", onclick: usarOtro }, t("traducir.otro.usar"))),
      el("p", { class: "epl-ayuda" }, t("traducir.siempre_ingles")));
    document.body.append(abierta);
    const r = boton.getBoundingClientRect();
    Object.assign(abierta.style, { top: r.bottom + 6 + "px", left: Math.max(8, Math.min(r.left, innerWidth - 340)) + "px" });
    pintar();
    buscar.focus();
  }
  document.addEventListener("pointerdown", (e) => { if (abierta && !abierta.contains(e.target) && !selector.contains(e.target)) cerrarLista(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && abierta) { e.stopPropagation(); cerrarLista(); } }, true);
  ctx.pintarIdiomaTraducir = () => {
    selector.replaceChildren(el("span", { class: "epl-trad-et" }, u.icono("traducir"), " " + t("traducir.desde")),
      el("button", { class: "epl-mini epl-trad-elegir", title: t("traducir.desde.tooltip"), "aria-haspopup": "dialog",
                     onclick: (e) => (abierta ? cerrarLista() : abrirLista(e.currentTarget)) }, nombreDesde(), " ", u.icono("abajo")));
    return selector;
  };

  // ---- el texto de un campo: un textarea/input o un contenteditable (las citas: <span data-tag> = su <Picture N>)
  const textoDe = (nodo) => [...nodo.childNodes].map((x) => x.nodeType === 3 ? x.textContent : x.dataset?.tag ? x.dataset.tag
    : x.nodeName === "BR" ? "\n" : (x.nodeName === "DIV" ? "\n" : "") + textoDe(x)).join("").replace(/ /g, " ");
  const esEditable = (x) => x && (x.matches?.("textarea, input:not([type]), input[type=text], input[type=search]") || x.isContentEditable);
  const raizEditable = (x) => x?.closest?.("[contenteditable=true]") || x;
  // el HTML de un texto traducido para un contenteditable: las etiquetas vuelven a ser citas
  const ETIQUETA = /(<(?:Picture|Video) \d+>)/;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const htmlDe = (texto, campo) => texto.split(ETIQUETA).map((s) => ETIQUETA.test(s)
    ? `<span class="epl-cita" contenteditable="false" data-tag="${esc(s)}" title="${esc(s)}">${esc(campo.querySelector(`[data-tag="${s}"]`)?.textContent || s)}</span>`
    : esc(s).replace(/\n/g, "<br>")).join("");

  let enMarcha = null;
  /* traduce `campo` entero o, con `sel` ({inicio, fin} en un textarea; un Range en un contenteditable), solo esa parte */
  async function traducir(campo, sel = null, boton = null) {
    if (enMarcha) return ctx.avisar(t("traducir.ya"), "mal");
    const ce = campo.isContentEditable;
    let texto, inicio, fin;
    if (ce) {
      texto = textoDe(campo);
      if (sel) {
        const antes = document.createRange(); antes.selectNodeContents(campo); antes.setEnd(sel.startContainer, sel.startOffset);
        const div = document.createElement("div"); div.append(antes.cloneContents()); inicio = textoDe(div).length;
        const dentro = document.createElement("div"); dentro.append(sel.cloneContents()); fin = inicio + textoDe(dentro).length;
      }
    } else {
      texto = campo.value;
      if (sel) ({ inicio, fin } = sel);
    }
    if (!texto.trim() || (sel && !texto.slice(inicio, fin).trim())) return ctx.avisar(t("traducir.vacio"), "mal");
    const t0 = Date.now(), de = nombreDesde();
    const reloj = setInterval(() => { ctx.avisar(t("traducir.traduciendo", { idioma: de, s: Math.round((Date.now() - t0) / 1000) }), "trabajando");
                                      if (boton) boton.dataset.s = Math.round((Date.now() - t0) / 1000) + " s"; }, 500);
    enMarcha = campo;
    campo.classList.add("epl-traduciendo");
    boton?.classList.add("trabajando");
    const ro = ce ? null : campo.readOnly;
    if (ce) campo.contentEditable = "false"; else campo.readOnly = true;
    try {
      // el campo (cómo se pega en el prompt: el gesto y la cámara empiezan por el verbo) y el pronombre del personaje
      const pj = Object.values(ctx.S.refs || {}).find((x) => x?.papel === "personaje" && x.pronombre);
      const r = await u.api("traducir", { texto, desde: desde(), campo: campo.dataset.campo || "", pronombre: pj?.pronombre || "",
                                          ...(sel ? { inicio, fin } : {}) });
      if (!campo.isConnected) return ctx.avisar(t("traducir.campo_cambio"), "mal");   // se volvió a pintar mientras tanto
      if (ce) campo.contentEditable = "true"; else campo.readOnly = ro;
      // la traducción entra como si la escribieras: Ctrl+Z vuelve a lo de antes
      campo.focus();
      const a = r.inicio ?? 0, z = r.fin ?? texto.length;
      if (ce) {
        const rango = document.createRange();
        if (sel) {     // la selección de antes (sin los espacios de sus bordes, que el servidor deja fuera): se recalcula
          rango.setStart(sel.startContainer, sel.startOffset); rango.setEnd(sel.endContainer, sel.endOffset);
        } else rango.selectNodeContents(campo);
        const s = getSelection(); s.removeAllRanges(); s.addRange(rango);
        const borde = sel ? texto.slice(inicio, fin) : "";
        const lead = borde.match(/^\s*/)[0], trail = borde.match(/\s*$/)[0];
        document.execCommand("insertHTML", false, htmlDe(lead + r.texto + trail, campo));
      } else {
        campo.setSelectionRange(a, z);
        if (!document.execCommand("insertText", false, r.texto)) {        // sin execCommand: se pone a mano (sin Ctrl+Z)
          campo.setRangeText(r.texto, a, z, "end");
          campo.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      ctx.avisar(t("traducir.listo", { s: u.num(r.segundos ?? (Date.now() - t0) / 1000, 1), idioma: de }), "bien");
    } catch (e) {
      ctx.avisar(t("traducir.error", { error: e.message }), "mal");
    } finally {
      clearInterval(reloj);
      enMarcha = null;
      campo.classList.remove("epl-traduciendo");
      boton?.classList.remove("trabajando");
      if (boton) delete boton.dataset.s;
      if (campo.isConnected) { if (ce) campo.contentEditable = "true"; else campo.readOnly = ro; }
    }
  }
  ctx.traducirCampo = (campo) => traducir(campo);

  // el botón de un campo: «Traducir a inglés» (entero)
  ctx.botonTraducir = (campo) => el("button", { class: "epl-mini epl-trad-boton", title: t("traducir.boton.tooltip", { idioma: nombreDesde() }),
    onmousedown: (e) => e.preventDefault(),                // que el campo no pierda el foco ni la selección
    onclick: (e) => traducir(campo, null, e.currentTarget) }, u.icono("traducir"), " " + t("traducir.boton"));

  /* ---- el clic derecho en cualquier campo de la ventana: «Traducir selección» (si hay algo seleccionado) y «Traducir todo
   * el campo». Uno solo para la ventana: si se vuelve a abrir, el de antes se quita. */
  const menu = el("div", { class: "epl-trad-menu", role: "menu", hidden: true });
  document.body.append(menu);
  const cerrarMenu = () => { menu.hidden = true; };
  function alClicDerecho(e) {
    if (e.shiftKey) return;                                  // Mayús + clic derecho: el menú del navegador
    const campo = raizEditable(e.target);
    if (!esEditable(campo) || !campo.closest(".epl-fondo") || campo.disabled) return;
    let sel = null;
    if (campo.isContentEditable) {
      const s = getSelection();
      if (s.rangeCount && !s.isCollapsed && campo.contains(s.getRangeAt(0).commonAncestorContainer)) sel = s.getRangeAt(0).cloneRange();
    } else if (campo.selectionEnd > campo.selectionStart) sel = { inicio: campo.selectionStart, fin: campo.selectionEnd };
    if (!sel && !(campo.isContentEditable ? textoDe(campo) : campo.value).trim()) return;
    e.preventDefault();
    const de = nombreDesde();
    menu.replaceChildren(
      sel ? el("button", { role: "menuitem", onclick: () => { cerrarMenu(); traducir(campo, sel); } }, u.icono("traducir"), " " + t("traducir.menu.seleccion", { idioma: de })) : null,
      el("button", { role: "menuitem", onclick: () => { cerrarMenu(); traducir(campo); } }, u.icono("traducir"), " " + t("traducir.menu.todo", { idioma: de })),
      el("small", {}, t("traducir.menu.ayuda")));
    menu.hidden = false;
    Object.assign(menu.style, { left: Math.min(e.clientX, innerWidth - 300) + "px", top: Math.min(e.clientY, innerHeight - 120) + "px" });
  }
  if (window.__eplTraducir) {
    document.removeEventListener("contextmenu", window.__eplTraducir.clic, true);
    window.__eplTraducir.menu.remove();
  }
  window.__eplTraducir = { clic: alClicDerecho, menu };
  document.addEventListener("contextmenu", alClicDerecho, true);
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) cerrarMenu(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) cerrarMenu(); }, true);
  document.addEventListener("scroll", cerrarMenu, true);
}
