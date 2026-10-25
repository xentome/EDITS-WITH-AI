/* Secciones 1 y 2 del editor: el PLAN (lo que lee y extiende el LLM).
 * 1 · Historia general: idea, estilo, arco, luz y ambiente, fondo general y los campos del nodo (tomas, duración…).
 * 2 · Prompt de la toma elegida en la línea de tiempo: su línea [Shot n] y todos sus campos, con candado, el efecto (de
 *     las referencias de papel efecto o de los efectos de texto) y su frase (↺ vuelve a la ficha del efecto), las
 *     referencias que usa y «rehacer esta toma».
 * También los botones que llaman al LLM (ctx.conLLM). Solo exporta funciones (ComfyUI importa todos los .js de web/).
 * Las utilidades llegan en ctx.u, sin imports, para que este archivo también se recargue al abrir la ventana.
 * Planos: ../../planos/4 El editor.md. */

const ENCUADRES = ["extreme close-up", "close-up", "medium close-up"];
const HISTORIA = ["lugar", "momento", "personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"];
const DIRECCION = ["encuadre", "luz", "gesto", "camara"];

const tomaVacia = () => ({ ...Object.fromEntries([...HISTORIA, ...DIRECCION].map((c) => [c, ""])), efecto_frase: "", fijos: [] });
// deja el plan con n tomas y todos sus campos (sin tocar lo que ya tiene)
export function ajustarPlan(plan, n) {
  const p = plan ? JSON.parse(JSON.stringify(plan)) : {};
  for (const c of ["arco", "look", "fondo"]) p[c] = p[c] || "";
  p.fijos = p.fijos || [];
  if ((p.cortes || []).length !== n) delete p.cortes;   // cortes a mano de otro número de tomas: ya no valen
  p.tomas = (p.tomas || []).slice(0, n).map((t) => ({ ...tomaVacia(), ...t, fijos: t.fijos || [] }));
  while (p.tomas.length < n) p.tomas.push(tomaVacia());
  return p;
}

/* Añade a ctx: conLLM, pintarHistoria, pintarToma, pintarLineaToma, pintarPlan. Usa de ctx: u, S, wf, caja, secHistoria,
 * secToma, avisar, cuerpo, pedirMontaje, pintarRefs, pintarLinea, quitarToma, elegir, resaltar. */
export function instalar(ctx) {
  const { u, S, wf, caja, secHistoria, secToma } = ctx;
  const { el, api } = u;

  // ---- acciones con el LLM (Escribir historia, Escribir tomas, rehacer una toma)
  ctx.conLLM = async function conLLM(texto, ruta, extra) {
    if (S.ocupado) return;
    S.ocupado = true;
    caja.classList.add("ocupada");
    const t0 = Date.now();
    const reloj = setInterval(() => ctx.avisar(`${texto}… ${Math.round((Date.now() - t0) / 1000)} s`, "trabajando"), 500);
    try {
      const r = await api(ruta, ctx.cuerpo(extra));
      S.plan = ajustarPlan(r.plan, S.tomas);
      ctx.avisar(`${texto}: listo en ${r.segundos} s.`, "bien");
      ctx.pintarPlan();
      ctx.pintarRefs();
      ctx.pedirMontaje();
    } catch (e) {
      ctx.avisar(`${texto}: ${e.message}`, "mal");
    } finally {
      clearInterval(reloj);
      S.ocupado = false;
      caja.classList.remove("ocupada");
    }
  };

  // ---- campos con candado: lo que escribes queda fijo y el LLM no lo cambia
  const candado = (lista, campo, alCambiar) => el("button", {
    class: "epl-candado" + (lista.includes(campo) ? " fijo" : ""), title: "Fijo: el LLM no lo cambia",
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
    if (papel === "efecto") ops.push(...Object.entries(S.efectos).map(([k, e]) => [k, `${k} ${e.nombre || "efecto de texto"}`]));
    return ops.length ? [["", vacio], ...ops] : null;
  }
  // la ficha del efecto elegido (referencia o efecto de texto): es la frase que va al prompt
  ctx.fichaEfecto = (id) => !id ? "" : /^E\d+$/.test(id) ? S.efectos[id]?.ficha || "" : ctx.refDe(id).papel === "efecto" ? ctx.refDe(id).ficha || "" : "";

  /* frase del efecto: se ve la ficha del efecto elegido; si la escribes, queda fija y es la que va al prompt (↺ vuelve a la
   * ficha). Escrita sin elegir efecto, es un efecto solo de texto para esta toma; «guardar como efecto» la convierte en un
   * efecto de texto reutilizable (E1, E2…), que sale en la mitad azul y el LLM puede elegir en otras tomas. */
  function campoFrase(t) {
    const propia = t.fijos.includes("efecto_frase") && (t.efecto_frase || "").trim();
    const deFicha = ctx.fichaEfecto(t.efecto);
    const marca = el("span", { class: "epl-ayuda" }, propia ? "frase propia 🔒" : deFicha ? "la ficha del efecto, tal cual" : "");
    const area = el("textarea", { rows: 2, placeholder: "frase del efecto, en inglés (o elige un efecto arriba)", "data-campo": "efecto_frase",
      oninput: (e) => { t.efecto_frase = e.target.value; fijar(t.fijos, "efecto_frase"); marca.textContent = "frase propia 🔒"; ctx.pedirMontaje(); } },
      propia ? t.efecto_frase : deFicha);
    const guardarComo = el("button", { class: "epl-mini", title: "Guarda esta frase como un efecto de texto reutilizable (sale en la mitad azul)",
      onclick: () => {
        const frase = (area.value || "").trim();
        if (!frase) return ctx.avisar("Escribe primero la frase del efecto", "mal");
        const id = ctx.nuevoEfecto({ nombre: frase.split(/\s+/).slice(0, 4).join(" "), ficha: frase });
        t.efecto = id;
        t.efecto_frase = "";
        t.fijos = [...t.fijos.filter((f) => f !== "efecto_frase"), ...(t.fijos.includes("efecto") ? [] : ["efecto"])];
        ctx.avisar(`Efecto ${id} creado: ya sale en la mitad azul`, "bien");
        ctx.pintarPlan(); ctx.pintarRefs(); ctx.pedirMontaje();
      } }, "＋ guardar como efecto");
    return el("div", {},
      el("label", { class: "epl-campo" }, el("span", {}, "Frase del efecto"), area,
        el("button", { class: "epl-candado" + (propia ? " fijo" : ""), title: "Volver a la ficha del efecto elegido",
          onclick: () => { t.efecto_frase = ""; t.fijos = t.fijos.filter((f) => f !== "efecto_frase"); ctx.pintarToma(); ctx.pedirMontaje(); } }, "↺")),
      el("div", { class: "epl-marca-frase" }, marca, propia && !/^E\d+$/.test(t.efecto) ? guardarComo : null));
  }

  // ---- 1 · historia general
  ctx.pintarHistoria = function pintarHistoria() {
    const p = S.plan;
    secHistoria.replaceChildren(
      el("div", { class: "epl-tit" }, "Historia general · la narrativa de todo el edit",
        el("span", { class: "der epl-ajustes" },
          el("label", {}, "Tomas ", el("input", { type: "number", min: 1, max: 12, value: S.tomas, class: "corto",
            onchange: (e) => ctx.cambiarTomas(+e.target.value) })),
          el("label", { title: "H3 solo hace 17·k + 5 fotogramas: al guardar, el workflow se pone en el valor válido más cercano" },
            "Duración (s) ", el("input", { type: "number", step: 0.001, value: S.duracion, class: "corto", "data-campo": "duracion",
              onchange: (e) => ctx.cambiarDuracion(+e.target.value) }),
            el("span", { class: "epl-h3-f" }, ` H3: ${ctx.duracion.fotogramasH3(S.duracion)} f` +
              (Math.abs(ctx.duracion.segundosH3(S.duracion) - S.duracion) > 1 / 48
                ? ` = ${ctx.duracion.segundosH3(S.duracion).toFixed(3).replace(".", ",")} s ⚠` : ""))),
          el("label", {}, "Semilla ", el("input", { type: "number", value: S.semilla, class: "corto",
            onchange: (e) => { S.semilla = +e.target.value; } })),
          el("label", {}, "Palabras ", el("input", { class: "palabras", value: S.palabras, placeholder: "opcional: TO YOU @1; PEAK @ultima",
            oninput: (e) => { S.palabras = e.target.value; ctx.pedirMontaje(); } })),
          el("label", { title: "Opcional: cómo se ven las palabras en pantalla, en inglés. Vacío: «in bold clean white letters»" }, "Estilo de las palabras ",
            el("input", { class: "palabras", value: S.estilo_palabras, "data-campo": "estilo_palabras",
              placeholder: "opcional: in a bold retro font with a neon outline",
              oninput: (e) => { S.estilo_palabras = e.target.value; ctx.pedirMontaje(); } })))),
      el("div", { class: "epl-historia" },
        el("div", {},
          el("label", { class: "epl-campo ancho" }, el("span", {}, "Idea"),
            el("textarea", { rows: 3, "data-campo": "idea", placeholder: "qué pasa y con qué tono, en tus palabras (manda sobre todo lo demás)",
              oninput: (e) => { S.idea = e.target.value; } }, S.idea)),
          el("label", { class: "epl-campo ancho", title: "Va tal cual al LLM y a la línea de estilo del prompt. Vacío: el LLM no inventa ningún estilo." },
            el("span", {}, "Estilo"),
            el("textarea", { rows: 2, "data-campo": "estilo", placeholder: "cómo se dibuja todo, en inglés (ej.: flat 2D anime illustration, Japanese city pop, vertical)",
              oninput: (e) => { S.estilo = e.target.value; ctx.pedirMontaje(); } }, S.estilo))),
        el("div", {},
          campoTexto(p, "arco", "Arco", p.fijos, { ayuda: "qué cambia de la primera a la última toma" }),
          campoTexto(p, "look", "Luz y ambiente", p.fijos, { ayuda: "hora, luz y paleta de todo el edit" }),
          campoTexto(p, "fondo", "Fondo general", p.fijos, { ayuda: "opcional: cómo son los fondos" }))));
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
      : ["(aún sin línea: escribe la historia y las tomas, o rellena los campos)"]));
  };
  ctx.pintarToma = function pintarToma() {
    const k = S.elegida, t = k ? S.plan.tomas[k - 1] : null;
    if (!t) {
      secToma.replaceChildren(el("div", { class: "epl-tit" }, "Prompt de la toma"),
        el("div", { class: "epl-vacio" }, "Selecciona una toma en la línea de tiempo para ver su prompt y cambiarlo."));
      return;
    }
    const a = S.cortes[k - 1], z = S.cortes[k] ?? S.duracion;
    const menu = (campo, etiqueta, papel, vacio) => {
      const ops = opcionesDe(papel, vacio);
      return ops ? campoMenu(t, campo, etiqueta, t.fijos, ops) : null;
    };
    const refs = [menu("personaje", "Atuendo", "personaje", "—"), menu("ropa", "Ropa", "ropa", "sin ropa prestada"),
                  menu("pose", "Pose", "pose", "sin pose"), menu("objeto", "Objeto", "objeto", "sin objeto"),
                  menu("lugar_ref", "Lugar fijo", "lugar", "sin lugar fijo"), menu("fondo_ref", "Fondo ref.", "fondo", "sin fondo")].filter(Boolean);
    secToma.replaceChildren(
      el("div", { class: "epl-tit" }, `Prompt de la toma ${k}` + (a === undefined ? "" : ` · ${a.toFixed(3)}–${(+z).toFixed(3)} s`),
        el("span", { class: "der" },
          el("button", { class: "epl-mini", title: "Escribir de nuevo encuadre, luz, gesto y cámara de esta toma (unos 7 s), mirando a sus vecinas",
            onclick: () => ctx.conLLM(`Rehaciendo la toma ${k}`, "tomas", { solo: k }) }, "🔄 rehacer esta toma"),
          S.tomas > 1 ? el("button", { class: "epl-mini", title: "Quitar esta toma del edit", onclick: () => ctx.quitarToma(k) }, "✕ quitar toma") : null,
          el("button", { class: "epl-mini", onclick: () => ctx.elegir(null) }, "cerrar"))),
      el("div", { class: "epl-linea-toma" }),
      el("div", { class: "epl-tres" },
        el("div", {}, el("b", {}, "Qué pasa (historia)"),
          campoTexto(t, "lugar", "Lugar", t.fijos),
          campoTexto(t, "momento", "Qué pasa", t.fijos, { largo: true }),
          opcionesDe("efecto", "sin efecto") ? campoMenu(t, "efecto", "Efecto", t.fijos, opcionesDe("efecto", "sin efecto")) : null,
          campoFrase(t)),
        el("div", {}, el("b", {}, "Referencias que usa"),
          ...(refs.length ? refs : [el("p", { class: "epl-ayuda" }, "No hay referencias que elegir por toma (la identidad y el estilo valen para todas).")]),
          el("p", { class: "epl-ayuda" }, "Lo que usa se ilumina abajo, en las dos mitades.")),
        el("div", {}, el("b", {}, "Dirección"),
          campoMenu(t, "encuadre", "Encuadre", t.fijos, [["", "—"], ...ENCUADRES.map((e) => [e, e])]),
          campoTexto(t, "camara", "Cámara", t.fijos),
          campoTexto(t, "luz", "Luz", t.fijos),
          campoTexto(t, "gesto", "Gesto", t.fijos, { largo: true }))));
    ctx.pintarLineaToma();
  };

  ctx.pintarPlan = function pintarPlan() {
    ctx.pintarHistoria();
    ctx.pintarToma();
    ctx.pintarLinea();
  };
}
