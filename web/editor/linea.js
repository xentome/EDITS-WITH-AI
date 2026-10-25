/* Sección 4 del editor: LÍNEA DE TIEMPO. Una cajita de color por toma; su ancho es lo que dura (los cortes del último
 * montaje: en los beats o, si los moviste, los tuyos). Tocar una toma la elige (se ve arriba, en «Prompt de la toma», y se
 * iluminan sus referencias); el + añade una toma y la ✕ de cada toma la quita (pide confirmar). El borde entre dos tomas
 * se arrastra: una se alarga y la otra se acorta (mínimo 0,4 s, al fotograma) y, con «pegar a los beats», al soltar se va
 * al beat más cercano (±0,15 s). Los cortes movidos a mano se guardan en el plan (plan.cortes) y el montaje los usa.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md. */

export const COLORES = ["#f4d35e", "#7bd389", "#6ec5e9", "#f28f8f", "#c39bd3", "#f5b971", "#9ad1c9", "#e6a0c4"];
export const MIN_TOMA = 0.4, FPS = 24, IMAN = 0.15;
export const alFotograma = (t) => Math.round(Math.round(t * FPS) / FPS * 1000) / 1000;

/* El borde i (entre la toma i y la i+1) puesto en t: dentro de sus vecinos con 0,4 s a cada lado, al fotograma y, si
 * «pegar» y hay un beat a ±0,15 s que quepa, en ese beat. Devuelve los cortes nuevos (no cambia los de entrada). */
export function moverBorde(cortes, dur, i, t, beats = [], pegar = false) {
  const c = cortes.slice(), lo = c[i - 1] + MIN_TOMA, hi = (i + 1 < c.length ? c[i + 1] : dur) - MIN_TOMA;
  const dentro = (x) => x >= lo - 1e-6 && x <= hi + 1e-6;
  let x = alFotograma(Math.min(hi, Math.max(lo, t)));
  if (!dentro(x)) x = Math.min(hi, Math.max(lo, x));         // el fotograma más cercano se salía: el límite
  if (pegar) {
    const cerca = beats.filter((b) => Math.abs(b - x) <= IMAN && dentro(b)).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
    if (cerca !== undefined) x = cerca;
  }
  c[i] = Math.round(x * 1000) / 1000;
  return c;
}

/* Quitar la toma k (1…n) de unos cortes a mano: las demás se reparten su tiempo, cada una en proporción a lo que dura, y
 * los inicios caen en el fotograma. */
export function quitarDeCortes(cortes, dur, k) {
  const largos = cortes.map((a, i) => (i + 1 < cortes.length ? cortes[i + 1] : dur) - a).filter((_, i) => i !== k - 1);
  const total = largos.reduce((a, b) => a + b, 0) || 1, out = [0];
  let t = 0;
  for (const l of largos.slice(0, -1)) { t += l * dur / total; out.push(alFotograma(t)); }
  return out;
}

/* Añade ctx.pintarLinea, ctx.elegir, ctx.cambiarTomas, ctx.anadirToma, ctx.quitarToma, ctx.moverCorte, ctx.cortesAuto.
 * Usa de ctx: u, S, secLinea, guardado, ajustarPlan, avisar, pedirMontaje, pintarPlan, pintarToma, pintarRefs. */
export function instalar(ctx) {
  const { u, S, secLinea } = ctx;
  const { el } = u;
  S.pegarBeats = ctx.guardado?.pegar_beats ?? true;

  ctx.elegir = function elegir(k) {
    S.elegida = k && k <= S.tomas ? k : null;
    ctx.pintarToma();
    ctx.pintarRefs();
    ctx.pintarLinea();
  };
  ctx.cambiarTomas = function cambiarTomas(n) {
    n = Math.max(1, Math.min(12, Math.round(n) || 1));
    if (n * MIN_TOMA > S.duracion) return ctx.avisar(`${n} tomas no caben en ${S.duracion} s (cada toma necesita al menos 0,4 s)`, "mal");
    S.tomas = n;
    S.plan = ctx.ajustarPlan(S.plan, n);
    if (S.elegida > n) S.elegida = null;
    S.cortes = S.plan.cortes?.length === n ? S.plan.cortes.slice() : [];
    ctx.pintarPlan();
    ctx.pintarRefs();
    ctx.pedirMontaje();
  };
  // una toma nueva: con cortes a mano, se queda la segunda mitad de la última toma (si dura al menos 0,8 s)
  ctx.anadirToma = function anadirToma() {
    const antes = S.tomas, c = S.plan.cortes;
    if (c?.length === antes) {
      const ult = S.duracion - c[antes - 1];
      if (ult >= 2 * MIN_TOMA) S.plan.cortes = [...c, alFotograma(c[antes - 1] + ult / 2)];
      else { delete S.plan.cortes; ctx.avisar("La última toma no se puede partir: vuelvo a los cortes automáticos", "mal"); }
    }
    ctx.cambiarTomas(S.tomas + 1);
    if (S.tomas > antes) ctx.elegir(S.tomas);
  };
  // quitar la toma k: con cortes a mano, las demás se reparten su tiempo; si no, se vuelven a calcular en los beats
  ctx.quitarToma = function quitarToma(k) {
    if (S.tomas <= 1) return;
    if (S.plan.cortes?.length === S.tomas) S.plan.cortes = quitarDeCortes(S.plan.cortes, S.duracion, k);
    S.plan.tomas.splice(k - 1, 1);
    S.elegida = null;
    ctx.cambiarTomas(S.tomas - 1);
    ctx.avisar(`Quitada la toma ${k}`, "bien");
  };
  // fija el borde i en t (lo que hace soltar un arrastre): desde ahí los cortes son «a mano» y van en el plan
  ctx.moverCorte = function moverCorte(i, t) {
    S.plan.cortes = moverBorde(cortesAhora(), S.duracion, i, t, S.beats || [], S.pegarBeats);
    S.cortes = S.plan.cortes.slice();
    ctx.pintarLinea();
    ctx.pintarToma();
    ctx.pedirMontaje();
  };
  // otra duración: los cortes a mano se estiran o se encogen en proporción (al fotograma); si ya no caben, automáticos
  ctx.cambiarDuracion = function cambiarDuracion(d) {
    if (!(d > 0)) return;
    if (S.tomas * MIN_TOMA > d) return ctx.avisar(`${S.tomas} tomas no caben en ${d} s (cada toma necesita al menos 0,4 s)`, "mal");
    const c = S.plan.cortes, antes = +S.duracion;
    S.duracion = d;
    if (c?.length === S.tomas) {
      const nuevos = c.map((x) => alFotograma(x * d / antes));
      const caben = nuevos.every((x, i) => (i + 1 < nuevos.length ? nuevos[i + 1] : d) - x >= MIN_TOMA - 1e-6);
      if (caben) S.plan.cortes = nuevos; else delete S.plan.cortes;
    }
    S.cortes = [];
    ctx.pintarHistoria?.();
    ctx.pintarLinea();
    ctx.pedirMontaje();
  };
  ctx.cortesAuto = function cortesAuto() {
    delete S.plan.cortes;
    ctx.pedirMontaje();
    ctx.avisar("Cortes automáticos: en los beats, repartidos parejo", "bien");
  };

  const cortesAhora = () => {
    const n = S.tomas;
    if (S.plan.cortes?.length === n) return S.plan.cortes.slice();
    return S.cortes.length === n ? S.cortes.slice() : Array.from({ length: n }, (_, i) => alFotograma(S.duracion * i / n));
  };
  const seg = (x) => x.toFixed(2).replace(".", ",");

  ctx.pintarLinea = function pintarLinea() {
    const n = S.tomas, dur = +S.duracion;
    let ini = cortesAhora();
    const fin = (c, i) => (i + 1 < n ? c[i + 1] : dur);
    const fila = el("div", { class: "epl-tomas-fila" });
    const tiempos = [];
    const bloques = S.plan.tomas.slice(0, n).map((t, i) => {
      const cruz = el("span", { class: "epl-tomab-x", onclick: (e) => e.stopPropagation() });
      const normal = () => cruz.replaceChildren(el("button", { class: "x", title: "Quitar esta toma", "aria-label": "Quitar esta toma",
        onclick: (e) => { e.stopPropagation(); preguntar(); } }, "✕"));
      const preguntar = () => cruz.replaceChildren(el("span", { class: "pregunta" }, "¿quitar?",
        el("button", { class: "si", onclick: (e) => { e.stopPropagation(); ctx.quitarToma(i + 1); } }, "sí"),
        el("button", { class: "no", onclick: (e) => { e.stopPropagation(); normal(); } }, "no")));
      normal();
      const efecto = t.efecto ? ` · ${/^E\d+$/.test(t.efecto) ? S.efectos?.[t.efecto]?.nombre || t.efecto : t.efecto}` : "";
      const tiempo = el("span", { class: "epl-tomab-t" });
      tiempos.push([tiempo, efecto]);
      return el("div", {
        class: "epl-tomab" + (S.elegida === i + 1 ? " elegida" : ""), id: `epl-tomab-${i + 1}`,
        style: { background: COLORES[i % COLORES.length] },
        title: [t.lugar, t.momento].filter(Boolean).join(" — ") || "toma sin historia todavía",
        onclick: () => ctx.elegir(S.elegida === i + 1 ? null : i + 1) },
        n > 1 ? cruz : null,
        el("b", {}, `Toma ${i + 1}`), el("span", {}, t.lugar || "(sin lugar)"), tiempo);
    });
    // cada toma va donde empieza y dura lo que dura (posición absoluta: los bordes caen justo en los cortes)
    const colocar = (c) => bloques.forEach((b, i) => {
      b.style.left = `calc(${c[i] / dur * 100}% + 2px)`;
      b.style.width = `calc(${(fin(c, i) - c[i]) / dur * 100}% - 4px)`;
      tiempos[i][0].textContent = `${seg(c[i])}–${seg(fin(c, i))} s` + tiempos[i][1];
    });
    // los bordes: se arrastran (puntero) y muestran los segundos de las dos tomas mientras tanto
    const bordes = ini.slice(1).map((_, j) => {
      const i = j + 1, etiqueta = el("span", { class: "epl-borde-et" });
      const b = el("div", { class: "epl-borde", "data-borde": i, title: "Arrastra para alargar una toma y acortar la otra" }, etiqueta);
      let arr = null;
      const t = (e) => (e.clientX - fila.getBoundingClientRect().left) / Math.max(1, fila.clientWidth) * dur;
      b.addEventListener("pointerdown", (e) => {
        if (e.button > 0) return;
        try { b.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
        arr = { id: e.pointerId, base: ini.slice() };
        b.classList.add("arrastrando");
        e.preventDefault();
        e.stopPropagation();
      });
      b.addEventListener("pointermove", (e) => {
        if (!arr || e.pointerId !== arr.id) return;
        ini = moverBorde(arr.base, dur, i, t(e));                 // sin imán mientras se arrastra: el fotograma exacto
        colocar(ini);
        b.style.left = `${ini[i] / dur * 100}%`;
        etiqueta.textContent = `${seg(ini[i] - ini[i - 1])} s | ${seg(fin(ini, i) - ini[i])} s`;
      });
      const soltar = (e) => {
        if (!arr || e.pointerId !== arr.id) return;
        arr = null;
        b.classList.remove("arrastrando");
        ctx.moverCorte(i, t(e));
      };
      b.addEventListener("pointerup", soltar);
      b.addEventListener("pointercancel", soltar);
      b.style.left = `${ini[i] / dur * 100}%`;
      return b;
    });
    fila.append(...bloques, ...bordes);
    colocar(ini);
    const manual = S.plan.cortes?.length === n;
    secLinea.replaceChildren(
      el("div", { class: "epl-tit" }, `Línea de tiempo · ${n} toma${n === 1 ? "" : "s"} en ${dur.toFixed(2)} s`,
        manual ? el("span", { class: "epl-marca" }, "cortes a mano") : null,
        el("span", { class: "der epl-ayuda", style: { margin: 0 } },
          el("label", { class: "epl-pegar", title: "Al soltar un borde, se va al beat más cercano (±0,15 s)" },
            el("input", { type: "checkbox", checked: S.pegarBeats, onchange: (e) => { S.pegarBeats = e.target.checked; } }), " pegar a los beats"),
          manual ? el("button", { class: "epl-mini", title: "Olvidar los cortes movidos a mano y volver a ponerlos en los beats",
                                  onclick: () => ctx.cortesAuto() }, "↺ cortes automáticos") : null,
          " Toca una toma para ver su prompt · arrastra un borde para cambiar lo que duran · + añade una")),
      el("div", { class: "epl-linea" }, fila,
        el("button", { class: "epl-mas", title: "Añadir una toma (las demás se estrechan)", onclick: () => ctx.anadirToma() }, "+")),
      el("div", { class: "epl-regla" }, el("span", {}, "0 s"), el("span", {}, `${dur.toFixed(2)} s`)));
  };
}
