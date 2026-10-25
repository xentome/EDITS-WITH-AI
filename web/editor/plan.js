/* Secciones 1 y 2 del editor: el PLAN (lo que lee y extiende el LLM).
 * 1 · Historia general: idea, estilo, arco, luz y ambiente, fondo general y los campos del nodo (tomas, duración…).
 * 2 · Prompt de la toma elegida en la línea de tiempo: su línea [Shot n] y todos sus campos, con candado, el efecto (de
 *     las referencias de papel efecto o de los efectos de texto) y su frase (↺ vuelve a la ficha del efecto), las
 *     referencias que usa y «rehacer esta toma».
 * También los botones que llaman al LLM (ctx.conLLM). Solo exporta funciones (ComfyUI importa todos los .js de web/).
 * Las utilidades llegan en ctx.u, sin imports, para que este archivo también se recargue al abrir la ventana. Los textos,
 * con u.t("clave") (web/i18n/*.json); cada pintar… los vuelve a escribir en el idioma de ahora.
 * Planos: ../../planos/4 El editor.md. */

// los mismos que nucleo.ENCUADRES (pruebas.py lo comprueba). Van al prompt tal cual (en inglés); su letrero es
// toma.encuadre_op.<i>. Con «✎ escribir el mío», la toma guarda el texto del usuario y se pega igual.
export const ENCUADRES = ["extreme close-up", "close-up", "medium close-up", "low-angle close-up", "close detail shot",
                          "extreme close-up of <Subject 1>'s eyes", "dynamic close-up"];
const ENCUADRE_VIEJO = { "extreme close-up of the eyes": "extreme close-up of <Subject 1>'s eyes" };   // planes de antes del 25 oct
// entorno de una toma (nucleo.ENTORNOS): el LLM elige el lugar, lo escribe el usuario (candado del lugar) o no hay ninguno
export const ENTORNOS = ["auto", "manual", "ninguno"];
const HISTORIA = ["lugar", "momento", "personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"];
const DIRECCION = ["encuadre", "luz", "gesto", "camara"];

const tomaVacia = () => ({ ...Object.fromEntries([...HISTORIA, ...DIRECCION].map((c) => [c, ""])), efecto_frase: "", entorno: "auto",
                           fijos: [] });
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
  p.tomas = (p.tomas || []).slice(0, n).map((t) => conEntorno({ ...tomaVacia(), ...t, entorno: t.entorno, fijos: t.fijos || [] }));
  for (const t of p.tomas) t.encuadre = ENCUADRE_VIEJO[t.encuadre] || t.encuadre;
  while (p.tomas.length < n) p.tomas.push(tomaVacia());
  return p;
}

/* Añade a ctx: conLLM, pintarHistoria, pintarToma, pintarLineaToma, pintarPlan. Usa de ctx: u, S, wf, caja, secHistoria,
 * secToma, avisar, cuerpo, pedirMontaje, pintarRefs, pintarLinea, quitarToma, elegir, resaltar. */
export function instalar(ctx) {
  const { u, S, wf, caja, secHistoria, secToma } = ctx;
  const { el, api, t } = u;

  // ---- acciones con el LLM (Escribir historia, Escribir tomas, rehacer una toma)
  // `tarea` es la clave del texto («final.escribiendo_historia») y `datos` sus marcadores
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

  function campoTexto(obj, campo, etiqueta, lista, opciones = {}) {
    const entrada = el(opciones.largo ? "textarea" : "input", {
      rows: opciones.largo ? 2 : undefined, placeholder: opciones.ayuda || "", "data-campo": campo,
      oninput: (e) => { obj[campo] = e.target.value; fijar(lista, campo); botonCandado.replaceWith(botonCandado = hacer()); ctx.pedirMontaje(); pintarRefsSuave(); },
    });
    if (opciones.largo) entrada.textContent = obj[campo] || ""; else entrada.value = obj[campo] || "";
    const hacer = () => candado(lista, campo, () => { botonCandado.replaceWith(botonCandado = hacer()); });
    let botonCandado = hacer();
    return el("label", { class: "epl-campo" }, el("span", {}, etiqueta), entrada, botonCandado);
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

  /* frase del efecto: se ve la ficha del efecto elegido; si la escribes, queda fija y es la que va al prompt (↺ vuelve a la
   * ficha). Escrita sin elegir efecto, es un efecto solo de texto para esta toma; «guardar como efecto» la convierte en un
   * efecto de texto reutilizable (E1, E2…), que sale en la mitad azul y el LLM puede elegir en otras tomas. */
  function campoFrase(toma) {
    const propia = toma.fijos.includes("efecto_frase") && (toma.efecto_frase || "").trim();
    const deFicha = ctx.fichaEfecto(toma.efecto);
    const marca = el("span", { class: "epl-ayuda" }, propia ? t("toma.frase.propia") : deFicha ? t("toma.frase.de_ficha") : "");
    const area = el("textarea", { rows: 2, placeholder: t("toma.frase.placeholder"), "data-campo": "efecto_frase",
      oninput: (e) => { toma.efecto_frase = e.target.value; fijar(toma.fijos, "efecto_frase"); marca.textContent = t("toma.frase.propia"); ctx.pedirMontaje(); } },
      propia ? toma.efecto_frase : deFicha);
    const guardarComo = el("button", { class: "epl-mini", title: t("toma.frase.guardar_como.tooltip"),
      onclick: () => {
        const frase = (area.value || "").trim();
        if (!frase) return ctx.avisar(t("toma.frase.vacia"), "mal");
        const id = ctx.nuevoEfecto({ nombre: frase.split(/\s+/).slice(0, 4).join(" "), ficha: frase });
        toma.efecto = id;
        toma.efecto_frase = "";
        toma.fijos = [...toma.fijos.filter((f) => f !== "efecto_frase"), ...(toma.fijos.includes("efecto") ? [] : ["efecto"])];
        ctx.avisar(t("toma.frase.creado", { id }), "bien");
        ctx.pintarPlan(); ctx.pintarRefs(); ctx.pedirMontaje();
      } }, t("toma.frase.guardar_como"));
    return el("div", {},
      el("label", { class: "epl-campo" }, el("span", {}, t("toma.frase")), area,
        el("button", { class: "epl-candado" + (propia ? " fijo" : ""), title: t("toma.frase.volver"),
          onclick: () => { toma.efecto_frase = ""; toma.fijos = toma.fijos.filter((f) => f !== "efecto_frase"); ctx.pintarToma(); ctx.pedirMontaje(); } }, "↺")),
      el("div", { class: "epl-marca-frase" }, marca, propia && !/^E\d+$/.test(toma.efecto) ? guardarComo : null));
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
    const entrada = el("input", { "data-campo": "lugar", value: toma.lugar || "", disabled: ninguno,
      placeholder: ninguno ? t("toma.entorno.ninguno.ayuda") : "",
      oninput: (e) => {
        toma.lugar = e.target.value;
        if (toma.entorno !== "manual") { toma.entorno = "manual"; fijar(toma.fijos, "lugar"); botones.replaceWith(botones = selector()); }
        ctx.pedirMontaje(); pintarRefsSuave();
      } });
    const selector = () => el("span", { class: "epl-entorno" }, ...ENTORNOS.map((e) =>
      el("button", { class: "epl-mini" + (toma.entorno === e ? " fijo" : ""), "data-entorno": e, title: t(`toma.entorno.${e}.tooltip`),
                     onclick: () => poner(e) }, t(`toma.entorno.${e}`))));
    let botones = selector();
    return el("div", { class: "epl-campo-lugar" },
      el("label", { class: "epl-campo" }, el("span", {}, t("toma.lugar")), entrada), botones);
  }

  // ---- 1 · historia general
  ctx.pintarHistoria = function pintarHistoria() {
    const p = S.plan;
    const f = ctx.duracion.fotogramasH3(S.duracion), sH3 = ctx.duracion.segundosH3(S.duracion);
    secHistoria.replaceChildren(
      el("div", { class: "epl-tit" }, t("historia.titulo"),
        el("span", { class: "der epl-ajustes" },
          el("label", {}, t("historia.tomas") + " ", el("input", { type: "number", min: 1, max: 12, value: S.tomas, class: "corto",
            onchange: (e) => ctx.cambiarTomas(+e.target.value) })),
          el("label", { title: t("historia.duracion.tooltip") },
            t("historia.duracion") + " ", el("input", { type: "number", step: 0.001, value: S.duracion, class: "corto", "data-campo": "duracion",
              onchange: (e) => ctx.cambiarDuracion(+e.target.value) }),
            el("span", { class: "epl-h3-f" }, " " + (Math.abs(sH3 - S.duracion) > 1 / 48
              ? t("historia.h3_f_aviso", { f, s: u.num(sH3, 3) }) : t("historia.h3_f", { f })))),
          el("label", {}, t("historia.semilla") + " ", el("input", { type: "number", value: S.semilla, class: "corto",
            onchange: (e) => { S.semilla = +e.target.value; } })))),
      el("div", { class: "epl-historia" },
        el("div", {},
          el("label", { class: "epl-campo ancho" }, el("span", {}, t("historia.idea")),
            el("textarea", { rows: 3, "data-campo": "idea", placeholder: t("comun.idea_ayuda"),
              oninput: (e) => { S.idea = e.target.value; } }, S.idea)),
          el("label", { class: "epl-campo ancho", title: t("historia.estilo.tooltip") },
            el("span", {}, t("historia.estilo")),
            el("textarea", { rows: 2, "data-campo": "estilo", placeholder: t("historia.estilo.placeholder"),
              oninput: (e) => { S.estilo = e.target.value; ctx.pedirMontaje(); } }, S.estilo)),
          el("label", { class: "epl-campo ancho", title: t("historia.sonido.tooltip") },
            el("span", {}, t("historia.sonido")),
            el("textarea", { rows: 1, "data-campo": "sonido", placeholder: t("historia.sonido.placeholder"),
              oninput: (e) => { S.sonido = e.target.value; ctx.pedirMontaje(); } }, S.sonido))),
        el("div", {},
          campoTexto(p, "arco", t("historia.arco"), p.fijos, { ayuda: t("historia.arco.ayuda") }),
          campoTexto(p, "look", t("historia.look"), p.fijos, { ayuda: t("historia.look.ayuda") }),
          campoTexto(p, "fondo", t("historia.fondo"), p.fijos, { ayuda: t("historia.fondo.ayuda") }))));
  };

  // ---- 2 · prompt de la toma elegida
  const lineaDe = (k) => (S.prompt.match(new RegExp(`^\\[Shot ${k}\\].*$`, "m")) || [""])[0];
  ctx.pintarLineaToma = function pintarLineaToma() {
    const caja2 = secToma.querySelector(".epl-linea-toma");
    if (!caja2 || !S.elegida) return;
    const linea = lineaDe(S.elegida);
    caja2.replaceChildren(...(linea ? linea.split(/(<(?:Picture|Video|Audio|Subject) \d+>)/).map((s) =>
      /^<(Picture|Video) \d+>$/.test(s) ? el("span", { class: "epl-tag", "data-tag": s, onmouseenter: () => ctx.resaltar(s, true),
                                                      onmouseleave: () => ctx.resaltar(s, false) }, s) : s)
      : [t("toma.sin_linea")]));
  };
  ctx.pintarToma = function pintarToma() {
    const k = S.elegida, toma = k ? S.plan.tomas[k - 1] : null;
    if (!toma) {
      secToma.replaceChildren(el("div", { class: "epl-tit" }, t("toma.titulo_vacio")),
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
                  ninguno ? null : menu("fondo_ref", "toma.fondo", "fondo", t("toma.sin_fondo"))].filter(Boolean);
    const efectos = opcionesDe("efecto", t("toma.sin_efecto"));
    secToma.replaceChildren(
      el("div", { class: "epl-tit" }, a === undefined ? t("toma.titulo", { k })
        : t("toma.titulo_tiempo", { k, a: u.num(a, 3), z: u.num(+z, 3) }),
        el("span", { class: "der" },
          el("button", { class: "epl-mini", title: t("toma.rehacer.tooltip"),
            onclick: () => ctx.conLLM("toma.rehaciendo", "tomas", { solo: k }, { k }) }, t("toma.rehacer")),
          S.tomas > 1 ? el("button", { class: "epl-mini", title: t("toma.quitar.tooltip"), onclick: () => ctx.quitarToma(k) }, t("toma.quitar")) : null,
          el("button", { class: "epl-mini", onclick: () => ctx.elegir(null) }, t("comun.cerrar")))),
      el("div", { class: "epl-linea-toma" }),
      el("div", { class: "epl-tres" },
        el("div", {}, el("b", {}, t("toma.que_pasa")),
          campoLugar(toma),
          campoTexto(toma, "momento", t("toma.momento"), toma.fijos, { largo: true }),
          efectos ? campoMenu(toma, "efecto", t("toma.efecto"), toma.fijos, efectos) : null,
          campoFrase(toma)),
        el("div", {}, el("b", {}, t("toma.refs")),
          ...(refs.length ? refs : [el("p", { class: "epl-ayuda" }, t("toma.sin_refs"))]),
          el("p", { class: "epl-ayuda" }, t("toma.refs.ayuda"))),
        el("div", {}, el("b", {}, t("toma.direccion")),
          campoMenu(toma, "encuadre", t("toma.encuadre"), toma.fijos, [["", "—"], ...ENCUADRES.map((e, i) => [e, t(`toma.encuadre_op.${i}`)])]),
          campoTexto(toma, "camara", t("toma.camara"), toma.fijos),
          campoTexto(toma, "luz", t(ninguno ? "toma.luz_opcional" : "toma.luz"), toma.fijos),
          campoTexto(toma, "gesto", t("toma.gesto"), toma.fijos, { largo: true }))));
    ctx.pintarLineaToma();
  };

  ctx.pintarPlan = function pintarPlan() {
    ctx.pintarHistoria();
    ctx.pintarToma();
    ctx.pintarLinea();
  };
}
