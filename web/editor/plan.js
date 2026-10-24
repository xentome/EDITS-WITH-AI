/* Columna 2 del editor: PROMPT FUNDAMENTAL (el plan que lee y extiende el LLM). Campos con candado, frase del efecto,
 * tomas y los botones que llaman al LLM (historia, tomas, una sola toma).
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Las utilidades llegan en ctx.u, sin imports, para que
 * este archivo también se recargue al abrir la ventana. Planos: ../../planos/4 El editor.md. */

const ENCUADRES = ["extreme close-up", "close-up", "medium close-up"];
const HISTORIA = ["lugar", "momento", "personaje", "pose", "fondo_ref", "efecto"];
const DIRECCION = ["encuadre", "luz", "gesto", "camara"];

const tomaVacia = () => ({ ...Object.fromEntries([...HISTORIA, ...DIRECCION].map((c) => [c, ""])), fijos: [] });
// deja el plan con n tomas y todos sus campos (sin tocar lo que ya tiene)
export function ajustarPlan(plan, n) {
  const p = plan ? JSON.parse(JSON.stringify(plan)) : {};
  for (const c of ["arco", "look", "fondo"]) p[c] = p[c] || "";
  p.fijos = p.fijos || [];
  p.tomas = (p.tomas || []).slice(0, n).map((t) => ({ ...tomaVacia(), ...t, fijos: t.fijos || [] }));
  while (p.tomas.length < n) p.tomas.push(tomaVacia());
  return p;
}

/* Añade a ctx las funciones de la columna 2. Usa de ctx: u, S, wf, caja, colPlan, recetas, avisar, cuerpo,
 * pedirMontaje, pintarRefs. */
export function instalar(ctx) {
  const { u, S, wf, caja, colPlan } = ctx;
  const { el, api } = u;

  // ---- acciones con el LLM
  async function conLLM(texto, ruta, extra) {
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
  }

  // ---- campos con candado: lo que escribes queda fijo y el LLM no lo cambia
  const candado = (lista, campo, alCambiar) => el("button", {
    class: "epl-candado" + (lista.includes(campo) ? " fijo" : ""), title: "Fijo: el LLM no lo cambia",
    onclick: () => { const i = lista.indexOf(campo); if (i >= 0) lista.splice(i, 1); else lista.push(campo); alCambiar(); },
  }, lista.includes(campo) ? "🔒" : "🔓");
  const fijar = (lista, campo) => { if (!lista.includes(campo)) lista.push(campo); };

  function campoTexto(obj, campo, etiqueta, lista, opciones = {}) {
    const entrada = el(opciones.largo ? "textarea" : "input", {
      rows: opciones.largo ? 2 : undefined, placeholder: opciones.ayuda || "",
      oninput: (e) => { obj[campo] = e.target.value; fijar(lista, campo); botonCandado.replaceWith(botonCandado = hacer()); ctx.pedirMontaje(); pintarRefsSuave(); },
    });
    if (opciones.largo) entrada.textContent = obj[campo] || ""; else entrada.value = obj[campo] || "";
    const hacer = () => candado(lista, campo, () => { botonCandado.replaceWith(botonCandado = hacer()); });
    let botonCandado = hacer();
    return el("label", { class: "epl-campo" }, el("span", {}, etiqueta), entrada, botonCandado);
  }
  function campoMenu(obj, campo, etiqueta, lista, opciones) {
    const sel = el("select", { onchange: (e) => { obj[campo] = e.target.value; fijar(lista, campo); ctx.pintarPlan(); ctx.pintarRefs(); ctx.pedirMontaje(); } },
      opciones.map(([v, t]) => el("option", { value: v, selected: (obj[campo] || "") === v }, t)));
    return el("label", { class: "epl-campo" }, el("span", {}, etiqueta), sel,
      candado(lista, campo, () => ctx.pintarPlan()));
  }
  let refrescoRefs = null;
  const pintarRefsSuave = () => { clearTimeout(refrescoRefs); refrescoRefs = setTimeout(ctx.pintarRefs, 600); };

  function opcionesDe(papel, vacio) {
    const ops = wf.lista.filter((r) => S.refs[r.clave]?.papel === papel).map((r) => [r.tag, `${r.tag} ${r.nombre}`]);
    return vacio ? [["", vacio], ...ops] : [["", "—"], ...ops];
  }

  // frase del efecto: se ve la de la receta; si la escribes, queda fija y es la que va al prompt (↺ vuelve a la receta)
  function campoFrase(t) {
    const propia = t.fijos.includes("efecto_frase") && (t.efecto_frase || "").trim();
    const deReceta = ctx.recetas[S.receta]?.frases?.[t.efecto] || "";
    const marca = el("span", { class: "epl-ayuda" }, propia ? "frase propia 🔒" : deReceta ? "frase probada de la receta" : "");
    const area = el("textarea", { rows: 2, placeholder: "frase del efecto, en inglés (o elige un efecto arriba)",
      oninput: (e) => { t.efecto_frase = e.target.value; fijar(t.fijos, "efecto_frase"); marca.textContent = "frase propia 🔒"; ctx.pedirMontaje(); } },
      propia ? t.efecto_frase : deReceta);
    return el("div", {},
      el("label", { class: "epl-campo" }, el("span", {}, "Frase del efecto"), area,
        el("button", { class: "epl-candado" + (propia ? " fijo" : ""), title: "Volver a la frase de la receta",
          onclick: () => { t.efecto_frase = ""; t.fijos = t.fijos.filter((f) => f !== "efecto_frase"); ctx.pintarPlan(); ctx.pedirMontaje(); } }, "↺")),
      el("div", { class: "epl-marca-frase" }, marca));
  }

  // ---- columna 2: prompt fundamental (el plan)
  ctx.pintarPlan = function pintarPlan() {
    const p = S.plan;
    const recetas = ctx.recetas;
    const efectos = Object.entries(recetas[S.receta]?.efectos || {});
    const generales = el("div", { class: "epl-bloque" },
      el("label", { class: "epl-campo ancho" }, el("span", {}, "Idea"),
        el("textarea", { rows: 3, oninput: (e) => { S.idea = e.target.value; } }, S.idea)),
      el("div", { class: "epl-fila" },
        el("label", {}, "Receta ", el("select", { onchange: (e) => { S.receta = e.target.value; ctx.pintarPlan(); ctx.pedirMontaje(); } },
          Object.keys(recetas).map((n) => el("option", { value: n, selected: n === S.receta }, n)))),
        el("label", {}, "Tomas ", el("input", { type: "number", min: 1, max: 12, value: S.tomas, class: "corto",
          onchange: (e) => { S.tomas = +e.target.value; S.plan = ajustarPlan(S.plan, S.tomas); ctx.pintarPlan(); ctx.pedirMontaje(); } })),
        el("label", {}, "Duración ", el("input", { type: "number", step: 0.001, value: S.duracion, class: "corto",
          onchange: (e) => { S.duracion = +e.target.value; ctx.pedirMontaje(); } })),
        el("label", {}, "Semilla ", el("input", { type: "number", value: S.semilla, class: "corto",
          onchange: (e) => { S.semilla = +e.target.value; } }))),
      el("label", { class: "epl-campo ancho" }, el("span", {}, "Palabras"),
        el("input", { value: S.palabras, placeholder: "TO YOU @1; PEAK @ultima", oninput: (e) => { S.palabras = e.target.value; ctx.pedirMontaje(); } })),
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
    ctx.pintarCabecerasTomas();
  };
  // «Toma k · inicio–fin s» con los cortes del último montaje
  ctx.pintarCabecerasTomas = function pintarCabecerasTomas() {
    caja.querySelectorAll(".epl-cab").forEach((b) => {
      const k = +b.dataset.k, a = S.cortes[k - 1], z = S.cortes[k] ?? S.duracion;
      b.textContent = a === undefined ? `Toma ${k}` : `Toma ${k} · ${a.toFixed(3)}–${(+z).toFixed(3)} s`;
    });
  };
}
