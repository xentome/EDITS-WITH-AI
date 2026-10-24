/* Sección 4 del editor: LÍNEA DE TIEMPO. Una cajita de color por toma; su ancho es lo que dura (los cortes del último
 * montaje, puestos en los beats). Tocar una toma la elige (se ve arriba, en «Prompt de la toma», y se iluminan sus
 * referencias); el + añade una toma. Solo exporta funciones (ComfyUI importa todos los .js de web/).
 * Planos: ../../planos/4 El editor.md. */

export const COLORES = ["#f4d35e", "#7bd389", "#6ec5e9", "#f28f8f", "#c39bd3", "#f5b971", "#9ad1c9", "#e6a0c4"];

/* Añade ctx.pintarLinea, ctx.elegir, ctx.cambiarTomas, ctx.anadirToma, ctx.quitarToma. Usa de ctx: u, S, secLinea,
 * ajustarPlan, avisar, pedirMontaje, pintarPlan, pintarToma, pintarRefs. */
export function instalar(ctx) {
  const { u, S, secLinea } = ctx;
  const { el } = u;

  ctx.elegir = function elegir(k) {
    S.elegida = k && k <= S.tomas ? k : null;
    ctx.pintarToma();
    ctx.pintarRefs();
    ctx.pintarLinea();
  };
  ctx.cambiarTomas = function cambiarTomas(n) {
    n = Math.max(1, Math.min(12, Math.round(n) || 1));
    if (n * 0.4 > S.duracion) return ctx.avisar(`${n} tomas no caben en ${S.duracion} s (cada toma necesita al menos 0,4 s)`, "mal");
    S.tomas = n;
    S.plan = ctx.ajustarPlan(S.plan, n);
    if (S.elegida > n) S.elegida = null;
    S.cortes = [];
    ctx.pintarPlan();
    ctx.pintarRefs();
    ctx.pedirMontaje();
  };
  ctx.anadirToma = function anadirToma() {
    const antes = S.tomas;
    ctx.cambiarTomas(S.tomas + 1);
    if (S.tomas > antes) ctx.elegir(S.tomas);
  };
  ctx.quitarToma = function quitarToma(k) {
    if (S.tomas <= 1) return;
    S.plan.tomas.splice(k - 1, 1);
    S.elegida = null;
    ctx.cambiarTomas(S.tomas - 1);
  };

  ctx.pintarLinea = function pintarLinea() {
    const n = S.tomas, dur = S.duracion;
    const ini = S.cortes.length === n ? S.cortes : Array.from({ length: n }, (_, i) => dur * i / n);
    const fin = (i) => (i + 1 < n ? ini[i + 1] : dur);
    secLinea.replaceChildren(
      el("div", { class: "epl-tit" }, `Línea de tiempo · ${n} toma${n === 1 ? "" : "s"} en ${(+dur).toFixed(2)} s`,
        el("span", { class: "der epl-ayuda", style: { margin: 0 } }, "Toca una toma para ver y cambiar su prompt; + añade una")),
      el("div", { class: "epl-linea" },
        ...S.plan.tomas.slice(0, n).map((t, i) => el("div", {
          class: "epl-tomab" + (S.elegida === i + 1 ? " elegida" : ""), id: `epl-tomab-${i + 1}`,
          style: { flex: `${Math.max(0.05, fin(i) - ini[i])} 1 0`, background: COLORES[i % COLORES.length] },
          title: [t.lugar, t.momento].filter(Boolean).join(" — ") || "toma sin historia todavía",
          onclick: () => ctx.elegir(S.elegida === i + 1 ? null : i + 1) },
          el("b", {}, `Toma ${i + 1}`), el("span", {}, t.lugar || "(sin lugar)"),
          el("span", {}, `${ini[i].toFixed(2)}–${fin(i).toFixed(2)} s` + (t.efecto ? ` · ${t.efecto}` : "")))),
        el("button", { class: "epl-mas", title: "Añadir una toma (las demás se estrechan)", onclick: () => ctx.anadirToma() }, "+")),
      el("div", { class: "epl-regla" }, el("span", {}, "0 s"), el("span", {}, `${(+dur).toFixed(2)} s`)));
  };
}
