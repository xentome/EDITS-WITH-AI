/* Sección 4 del editor: LÍNEA DE TIEMPO. Una cajita de color por toma; su ancho es lo que dura (los cortes del último
 * montaje: en los beats o, si los moviste, los tuyos). Tocar una toma la elige (se ve arriba, en «Prompt de la toma», y se
 * iluminan sus referencias); el + añade una toma y la ✕ de cada toma la quita (pide confirmar). El borde entre dos tomas
 * se arrastra: una se alarga y la otra se acorta (mínimo 0,4 s, al fotograma) y, con «pegar a los beats», al soltar se va
 * al beat más cercano (±0,15 s). Los cortes movidos a mano se guardan en el plan (plan.cortes) y el montaje los usa.
 * La duración del edit se decide aquí (27 oct): junto al título, los segundos y los fotogramas de H3. Los dos se arrastran
 * (↔: a la derecha alarga, a la izquierda acorta, de un valor válido de H3 al siguiente, 17·k + 5) y, con un clic sin
 * arrastrar, se escriben a mano (se ponen en el valor válido más cercano).
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md. */

export const COLORES = ["#f4d35e", "#7bd389", "#6ec5e9", "#f28f8f", "#c39bd3", "#f5b971", "#9ad1c9", "#e6a0c4"];
export const MIN_TOMA = 0.4, FPS = 24, IMAN = 0.15, MAX_TOMAS = 24;   // MAX_TOMAS: el mismo máximo que el campo «tomas» del nodo
export const alFotograma = (t) => Math.round(Math.round(t * FPS) / FPS * 1000) / 1000;
// la duración en la línea de tiempo: fotogramas válidos de H3 (17·k + 5) entre 22 (0,917 s) y 277 (11,542 s, por debajo de
// los 12 s del campo duracion_s del nodo); cada paso del arrastre (PASO_PX píxeles) es un valor válido más o menos
export const F_MIN = 22, F_MAX = 277, PASO_F = 17, PASO_PX = 10;
export const fValido = (f) => Math.max(F_MIN, Math.min(F_MAX, 17 * Math.max(0, Math.round((f - 5) / 17)) + 5));
export const segundosDe = (f) => Math.round(f / FPS * 1000) / 1000;

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
  const { u, S, secLinea, caja } = ctx;
  const { el, t } = u;
  S.pegarBeats = ctx.guardado?.pegar_beats ?? true;

  // siempre hay una toma elegida: elegir(null) o una que no existe deja la que había (o la última)
  ctx.elegir = function elegir(k) {
    S.elegida = k && k <= S.tomas ? k : Math.min(S.elegida || S.tomas, S.tomas);
    ctx.programarGuardado?.();
    ctx.pintarToma();
    ctx.pintarRefs();
    ctx.pintarLinea();
  };
  ctx.cambiarTomas = function cambiarTomas(n) {
    n = Math.max(1, Math.min(MAX_TOMAS, Math.round(n) || 1));
    if (n * MIN_TOMA > S.duracion) return ctx.avisar(t("errores.tomas_no_caben", { n, dur: u.num(S.duracion) }), "mal");
    S.tomas = n;
    S.plan = ctx.ajustarPlan(S.plan, n);
    if (!S.elegida || S.elegida > n) S.elegida = n;
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
      else { delete S.plan.cortes; ctx.avisar(t("linea.no_partir"), "mal"); }
    }
    ctx.cambiarTomas(S.tomas + 1);
    if (S.tomas > antes) ctx.elegir(S.tomas);
  };
  // quitar la toma k: con cortes a mano, las demás se reparten su tiempo; si no, se vuelven a calcular en los beats
  ctx.quitarToma = function quitarToma(k) {
    if (S.tomas <= 1) return;
    if (S.plan.cortes?.length === S.tomas) S.plan.cortes = quitarDeCortes(S.plan.cortes, S.duracion, k);
    S.plan.tomas.splice(k - 1, 1);
    S.elegida = Math.max(1, Math.min(k, S.tomas - 1));
    ctx.cambiarTomas(S.tomas - 1);
    ctx.avisar(t("linea.quitada", { k }), "bien");
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
    if (S.tomas * MIN_TOMA > d) return ctx.avisar(t("errores.tomas_no_caben", { n: S.tomas, dur: u.num(d) }), "mal");
    const c = S.plan.cortes, antes = +S.duracion;
    S.duracion = d;
    if (c?.length === S.tomas) {
      const nuevos = c.map((x) => alFotograma(x * d / antes));
      const caben = nuevos.every((x, i) => (i + 1 < nuevos.length ? nuevos[i + 1] : d) - x >= MIN_TOMA - 1e-6);
      if (caben) S.plan.cortes = nuevos; else delete S.plan.cortes;
    }
    S.cortes = [];
    ctx.pintarLinea();
    ctx.pintarAudio?.();          // el tramo de la canción dura lo mismo que el edit
    ctx.pedirMontaje();
  };
  ctx.cortesAuto = function cortesAuto() {
    delete S.plan.cortes;
    ctx.pedirMontaje();
    ctx.avisar(t("linea.cortes_auto_listo"), "bien");
  };

  const cortesAhora = () => {
    const n = S.tomas;
    if (S.plan.cortes?.length === n) return S.plan.cortes.slice();
    return S.cortes.length === n ? S.cortes.slice() : Array.from({ length: n }, (_, i) => alFotograma(S.duracion * i / n));
  };
  const seg = (x) => u.num(x, 2);

  /* el recuadro de la duración: los segundos y los fotogramas. Pulsar y arrastrar cambia de un valor válido al siguiente
   * (cursor ↔); soltar lo aplica. Un clic sin arrastrar (o Intro con el foco) lo vuelve un campo para escribir. */
  function recuadroDuracion() {
    const f0 = fValido(ctx.duracion.fotogramasH3(S.duracion));
    const numero = (tipo) => {
      const texto = (f) => tipo === "s" ? t("linea.duracion.s", { s: u.num(segundosDe(f), 3) }) : t("linea.duracion.f", { f });
      const b = el("span", { class: "epl-dur-num", tabindex: 0, role: "spinbutton", "data-dur": tipo, "aria-valuenow": tipo === "s" ? segundosDe(f0) : f0,
                             title: t("linea.duracion.tooltip") }, texto(f0));
      let arr = null;
      b.addEventListener("pointerdown", (e) => {
        if (e.button > 0) return;
        try { b.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
        arr = { id: e.pointerId, x: e.clientX, f: f0, movido: false };
        e.preventDefault();
      });
      b.addEventListener("pointermove", (e) => {
        if (!arr || e.pointerId !== arr.id) return;
        const pasos = Math.trunc((e.clientX - arr.x) / PASO_PX);
        if (!arr.movido && Math.abs(e.clientX - arr.x) < 4) return;
        arr.movido = true;
        b.classList.add("arrastrando");
        arr.f = fValido(f0 + pasos * PASO_F);
        caja.querySelectorAll(".epl-dur-num").forEach((x) => { x.textContent = x.dataset.dur === "s"
          ? t("linea.duracion.s", { s: u.num(segundosDe(arr.f), 3) }) : t("linea.duracion.f", { f: arr.f }); });
      });
      const soltar = (e) => {
        if (!arr || e.pointerId !== arr.id) return;
        const { movido, f } = arr;
        arr = null;
        b.classList.remove("arrastrando");
        if (movido) { if (f !== f0) ctx.cambiarDuracion(segundosDe(f)); }
        else escribir(b, tipo);
      };
      b.addEventListener("pointerup", soltar);
      b.addEventListener("pointercancel", soltar);
      b.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); escribir(b, tipo); }
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); ctx.cambiarDuracion(segundosDe(fValido(f0 + PASO_F))); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); ctx.cambiarDuracion(segundosDe(fValido(f0 - PASO_F))); }
      });
      return b;
    };
    // escribir el número a mano: segundos (con coma o punto) o fotogramas; Intro o salir lo aplica, Escape lo deja
    const escribir = (b, tipo) => {
      const entrada = el("input", { class: "epl-dur-entrada", "data-dur": tipo, inputmode: "decimal",
                                    value: tipo === "s" ? u.num(segundosDe(f0), 3) : String(f0) });
      let hecho = false;
      const aplicar = (si) => {
        if (hecho) return;
        hecho = true;
        const x = parseFloat(entrada.value.replace(",", "."));
        const f = !si || !(x > 0) ? f0 : fValido(tipo === "s" ? x * FPS : x);
        if (f !== f0) ctx.cambiarDuracion(segundosDe(f)); else ctx.pintarLinea();
      };
      entrada.addEventListener("keydown", (e) => { if (e.key === "Enter") aplicar(true); if (e.key === "Escape") aplicar(false); });
      entrada.addEventListener("blur", () => aplicar(true));
      b.replaceWith(entrada);
      entrada.focus();
      entrada.select();
    };
    return el("span", { class: "epl-duracion", title: t("linea.duracion.tooltip") },
      el("span", { class: "epl-dur-et" }, t("linea.duracion")), numero("s"), el("span", { class: "epl-dur-igual" }, "="), numero("f"));
  }

  ctx.pintarLinea = function pintarLinea() {
    const n = S.tomas, dur = +S.duracion;
    let ini = cortesAhora();
    const fin = (c, i) => (i + 1 < n ? c[i + 1] : dur);
    const fila = el("div", { class: "epl-tomas-fila" });
    const tiempos = [];
    const bloques = S.plan.tomas.slice(0, n).map((toma, i) => {
      const cruz = el("span", { class: "epl-tomab-x", onclick: (e) => e.stopPropagation() });
      const normal = () => cruz.replaceChildren(el("button", { class: "x", title: t("toma.quitar.tooltip"), "aria-label": t("toma.quitar.tooltip"),
        onclick: (e) => { e.stopPropagation(); preguntar(); } }, "✕"));
      const preguntar = () => cruz.replaceChildren(el("span", { class: "pregunta" }, t("referencias.pregunta_quitar"),
        el("button", { class: "si", onclick: (e) => { e.stopPropagation(); ctx.quitarToma(i + 1); } }, t("comun.si")),
        el("button", { class: "no", onclick: (e) => { e.stopPropagation(); normal(); } }, t("comun.no"))));
      normal();
      const efecto = toma.efecto ? ` · ${/^E\d+$/.test(toma.efecto) ? S.efectos?.[toma.efecto]?.nombre || toma.efecto : toma.efecto}` : "";
      const tiempo = el("span", { class: "epl-tomab-t" });
      tiempos.push([tiempo, efecto]);
      // los puntos de color de lo que lleva la toma (las de Principal con anillo blanco), con su sello Im1 / V1 (27 oct)
      const lleva = ctx.refsDeToma?.(i + 1) || [];
      const puntos = el("span", { class: "epl-puntos", title: t("linea.puntos", { lista: lleva.map((x) => ctx.selloDe(x)).join(" · ") || "—" }) },
        ...lleva.map((x) => ctx.punto(x, ctx.claveDe(x) && ctx.enTodas(ctx.claveDe(x)) ? " epl-en-todas" : "")));
      const bloque = el("div", {
        class: "epl-tomab" + (S.elegida === i + 1 ? " elegida" : ""), id: `epl-tomab-${i + 1}`,
        style: { background: COLORES[i % COLORES.length] },
        title: [toma.lugar, toma.momento].filter(Boolean).join(" — ") || t("linea.toma_sin_historia"),
        onclick: () => ctx.elegir(i + 1) },
        n > 1 ? cruz : null,
        el("span", { class: "epl-tomab-cab" }, el("b", {}, t("linea.toma", { k: i + 1 })), puntos),
        el("span", {}, toma.momento || (toma.entorno === "ninguno" ? t("toma.entorno.ninguno") : toma.lugar || t("linea.sin_lugar"))), tiempo);
      ctx.zonaToma?.(bloque, i + 1);    // soltar aquí un póster del estante lo conecta a esta toma (referencias.js)
      return bloque;
    });
    // cada toma va donde empieza y dura lo que dura (posición absoluta: los bordes caen justo en los cortes)
    const colocar = (c) => bloques.forEach((b, i) => {
      b.style.left = `calc(${c[i] / dur * 100}% + 2px)`;
      b.style.width = `calc(${(fin(c, i) - c[i]) / dur * 100}% - 4px)`;
      tiempos[i][0].textContent = t("linea.tiempo", { a: seg(c[i]), b: seg(fin(c, i)) }) + tiempos[i][1];
    });
    // los bordes: se arrastran (puntero) y muestran los segundos de las dos tomas mientras tanto
    const bordes = ini.slice(1).map((_, j) => {
      const i = j + 1, etiqueta = el("span", { class: "epl-borde-et" });
      const b = el("div", { class: "epl-borde", "data-borde": i, title: t("linea.borde.tooltip") }, etiqueta);
      let arr = null;
      const en = (e) => (e.clientX - fila.getBoundingClientRect().left) / Math.max(1, fila.clientWidth) * dur;
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
        ini = moverBorde(arr.base, dur, i, en(e));                // sin imán mientras se arrastra: el fotograma exacto
        colocar(ini);
        b.style.left = `${ini[i] / dur * 100}%`;
        etiqueta.textContent = t("linea.borde.etiqueta", { a: seg(ini[i] - ini[i - 1]), b: seg(fin(ini, i) - ini[i]) });
      });
      const soltar = (e) => {
        if (!arr || e.pointerId !== arr.id) return;
        arr = null;
        b.classList.remove("arrastrando");
        ctx.moverCorte(i, en(e));
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
      el("div", { class: "epl-tit" }, t(n === 1 ? "linea.titulo_una" : "linea.titulo_varias", { n }), recuadroDuracion(),
        manual ? el("span", { class: "epl-marca" }, t("linea.a_mano")) : null,
        el("span", { class: "der epl-ayuda", style: { margin: 0 } },
          el("label", { class: "epl-pegar", title: t("linea.pegar.tooltip") },
            el("input", { type: "checkbox", checked: S.pegarBeats, onchange: (e) => { S.pegarBeats = e.target.checked; } }), " " + t("linea.pegar")),
          manual ? el("button", { class: "epl-mini", title: t("linea.cortes_auto.tooltip"),
                                  onclick: () => ctx.cortesAuto() }, t("linea.cortes_auto")) : null,
          " " + t("linea.ayuda"))),
      el("div", { class: "epl-linea" }, fila,
        el("button", { class: "epl-mas", title: t("linea.anadir.tooltip"), onclick: () => ctx.anadirToma() }, "+")),
      el("div", { class: "epl-regla" }, el("span", {}, t("linea.segundos", { s: u.num(0) })), el("span", {}, t("linea.segundos", { s: u.num(dur, 2) }))));
    ctx.pintarTexto?.();          // la fila de texto va debajo, con los mismos cortes (textos.js)
  };
}
