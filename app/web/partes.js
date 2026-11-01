/* MAX EDITOR · «Generar por partes» (1 nov, Jonathan: «mi PC no llega a más de 5 s a 1 MP»; plano planos/fases/18).
 * Una ventana junto a «Generar»: dice cuánto aguanta tu PC por parte (se recuerda en este navegador), enseña la línea de
 * tiempo con cada parte en su color y las tijeras entre tomas (tocarlas parte ahí o deja de partir), y encola todo: un
 * Generar por parte y un «Unir» que las pega. El servidor es POST /app/partes (partes.py); sin «lanzar» solo calcula. */
export function crear({ el, icono, t, num, pedir, avisar, leerLocal, ponerLocal, valores, semilla, proyecto, antes, alEncolar }) {
  const GUARDA = "max-editor-partes-limite";
  const P = { solo: new Set(), abierto: false, limite: +leerLocal(GUARDA) || 5.167, partir: null, datos: null, error: "", ocupado: false, pide: 0 };
  const caja = el("div", { class: "max-videos-caja max-partes-caja", role: "dialog", "aria-modal": "true" });
  const panel = el("div", { class: "max-videos max-partes", onclick: (e) => { if (e.target === panel) cerrar(); } }, caja);
  document.body.append(panel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && P.abierto) cerrar(); });

  const seg = (s) => t("app.partes.seg", { s: num(s, 2) });
  async function calcular() {
    const yo = ++P.pide;
    P.error = "";
    try {
      const d = await pedir("/app/partes", { valores: valores(), proyecto: proyecto(), limite: P.limite, partir: P.partir });
      if (yo === P.pide) { P.datos = d; P.solo = new Set(d.partes.map((x) => x.i)); }   // al cambiar las partes, todas marcadas
    } catch (e) { if (yo === P.pide) { P.datos = null; P.error = e.message; } }
    if (yo === P.pide) pintar();
  }
  async function abrir() {
    P.abierto = true;
    P.partir = null;
    P.datos = null;
    pintar();
    try { await antes(); } catch (e) { P.error = e.message; return pintar(); }     // el prompt y los campos, al día
    calcular();
  }
  function cerrar() { P.abierto = false; pintar(); }
  async function lanzar() {
    if (!P.datos || P.ocupado) return;
    P.ocupado = true;
    pintar();
    try {
      const partir = P.datos.partes.slice(0, -1).map((x) => x.tomas[x.tomas.length - 1]);
      const solo = [...P.solo].sort((a, b) => a - b);
      const r = await pedir("/app/partes", { valores: valores(), proyecto: proyecto(), semilla: semilla(), limite: P.limite, partir, solo, lanzar: true });
      avisar(t(r.unir ? "app.partes.encolado" : "app.partes.encolado_sueltas", { n: solo.length }), "bien");
      P.abierto = false;
      alEncolar();
    } catch (e) { P.error = e.message; }
    P.ocupado = false;
    pintar();
  }
  // tocar las tijeras entre dos tomas: parte ahí o deja de partir (desde ese momento los cortes van a mano)
  function tijera(k) {
    const ahora = new Set(P.datos.partes.slice(0, -1).map((x) => x.tomas[x.tomas.length - 1]));
    if (ahora.has(k)) ahora.delete(k); else ahora.add(k);
    P.partir = [...ahora].sort((a, b) => a - b);
    if (!P.partir.length) { P.partir = null; P.error = t("app.partes.minimo"); P.datos = null; return pintar(); }
    calcular();
  }

  function linea(d) {
    const total = d.final_f / 24, trozos = [];
    d.partes.forEach((x, pi) => {
      const ancho = (x.segundos / total) * 100;
      trozos.push(el("div", { class: "max-partes-trozo c" + (pi % 4) + (x.sobre_limite ? " pasa" : "") + (P.solo.has(x.i) ? "" : " fuera"), style: { flex: `${ancho} 1 0` } },
        el("label", { class: "max-partes-elegir", title: t("app.partes.elegir.tooltip") },
          el("input", { type: "checkbox", checked: P.solo.has(x.i), onchange: (e) => {
            if (e.target.checked) P.solo.add(x.i); else P.solo.delete(x.i);
            pintar();
          } }), el("b", {}, t("app.partes.parte", { i: x.i }))),
        el("span", {}, t(x.tomas.length > 1 ? "app.partes.tomas" : "app.partes.toma", { a: x.tomas[0], b: x.tomas[x.tomas.length - 1] })),
        el("small", {}, seg(x.segundos) + " · " + t("app.partes.fotogramas", { f: x.fotogramas })),
        el("div", { class: "max-partes-tomas" }, ...x.tomas.map((k, j) => {
          const fin = j + 1 < x.tomas.length ? x.cortes[j + 1] : x.segundos;
          return el("span", { style: { flex: `${Math.max(0.05, fin - x.cortes[j])} 1 0` } }, String(k));
        }))));
    });
    // las tijeras: entre cada par de tomas (dentro de una parte, para partir ahí; en el borde, para juntar)
    const n = d.partes[d.partes.length - 1].tomas.slice(-1)[0];
    const bordes = new Set(d.partes.slice(0, -1).map((x) => x.tomas[x.tomas.length - 1]));
    const tijeras = el("div", { class: "max-partes-tijeras" },
      el("span", { class: "max-aviso" }, t("app.partes.tijeras")),
      ...Array.from({ length: n - 1 }, (_, i) => i + 1).map((k) => el("button", {
        class: "max-boton max-partes-tijera" + (bordes.has(k) ? " fijo" : ""), "aria-pressed": String(bordes.has(k)),
        title: t(bordes.has(k) ? "app.partes.juntar.tooltip" : "app.partes.partir.tooltip", { a: k, b: k + 1 }), onclick: () => tijera(k) },
        icono("tijeras"), " " + t("app.partes.entre", { a: k, b: k + 1 }))));
    return [el("div", { class: "max-partes-linea" }, ...trozos), tijeras];
  }

  function pintar() {
    panel.className = "max-videos max-partes" + (P.abierto ? " ver" : "");
    if (!P.abierto) return caja.replaceChildren();
    caja.setAttribute("aria-label", t("app.partes.titulo"));
    const d = P.datos, pasa = d?.partes.some((x) => x.sobre_limite);
    const limite = el("input", { type: "number", min: 1, max: 30, step: 0.1, value: num(P.limite, 2).replace(",", "."), class: "max-partes-limite",
      "aria-label": t("app.partes.limite"), onchange: (e) => {
        P.limite = Math.max(1, Math.min(30, +e.target.value || 5.167));
        ponerLocal(GUARDA, String(P.limite));
        P.partir = null;
        calcular();
      } });
    caja.replaceChildren(
      el("div", { class: "max-fila" }, el("b", {}, t("app.partes.titulo")),
        el("button", { class: "max-boton max-cerrar max-derecha", title: t("comun.cerrar"), "aria-label": t("comun.cerrar"), onclick: cerrar }, icono("x"))),
      el("div", { class: "max-partes-cuerpo" },
        el("p", { class: "max-partes-ayuda" }, t("app.partes.ayuda")),
        el("label", { class: "max-partes-campo" }, el("span", {}, t("app.partes.limite")), limite,
          d ? el("small", {}, t("app.partes.limite.f", { f: d.limite_f, s: num(d.limite_s, 2) })) : null),
        el("small", { class: "max-partes-nota" }, t("app.partes.limite.ayuda")),
        P.error ? el("div", { class: "max-partes-error", role: "alert" }, P.error) : null,
        !d && !P.error ? el("div", { class: "max-vacio" }, t("app.partes.calculando")) : null,
        ...(d ? linea(d) : []),
        d && pasa ? el("div", { class: "max-partes-error" }, t("app.partes.pasa")) : null,
        d && P.solo.size < d.partes.length ? el("div", { class: "max-partes-aviso" }, t("app.partes.sueltas")) : null,
        d ? el("ul", { class: "max-partes-notas" },
          el("li", {}, t("app.partes.nota.total", { a: seg(d.total_s), b: seg(d.final_f / 24) })),
          el("li", {}, t("app.partes.nota.corte")),
          el("li", {}, t("app.partes.nota.semilla", { semilla: semilla() ?? "?" })),
          el("li", {}, t("app.partes.nota.unir"))) : null),
      el("div", { class: "max-fila max-partes-pie" },
        el("button", { class: "max-boton", onclick: cerrar }, t("app.proyecto.cancelar")),
        el("button", { class: "max-generar max-partes-lanzar max-derecha", disabled: !d || P.ocupado || !P.solo.size, onclick: lanzar },
          !d ? t("app.partes.lanzar", { n: "…" }) : P.solo.size === d.partes.length ? t("app.partes.lanzar", { n: d.partes.length })
            : P.solo.size === 1 ? t("app.partes.lanzar_una", { i: [...P.solo][0] }) : t("app.partes.lanzar_sueltas", { n: P.solo.size }))));
  }
  return { abrir };
}
