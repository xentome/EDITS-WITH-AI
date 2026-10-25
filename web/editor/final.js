/* Sección 5 del editor: PROMPT FINAL (lo que recibe H3), resaltado o editado a mano, con los botones que llaman al LLM
 * (Escribir historia, Escribir tomas) y Guardar. Solo exporta funciones (ComfyUI importa todos los .js de web/).
 * Las utilidades llegan en ctx.u, sin imports, para que este archivo también se recargue al abrir la ventana.
 * Planos: ../../planos/4 El editor.md. */

/* Añade ctx.pintarFinal. Usa de ctx: u, S, secFinal, resaltar, pedirMontaje, conLLM, guardarYAvisar. */
export function instalar(ctx) {
  const { u, S, secFinal } = ctx;
  const { el, t } = u;

  let editando = false;
  ctx.pintarFinal = function pintarFinal() {
    const cab = el("div", { class: "epl-tit" }, t("final.titulo"),
      S.a_mano ? el("span", { class: "epl-marca" }, t("final.a_mano")) : null,
      el("span", { class: "der" },
        el("button", { class: "epl-boton", title: t("final.escribir_historia.tooltip"),
          onclick: () => ctx.conLLM("final.escribiendo_historia", "historia") }, t("final.escribir_historia")),
        el("button", { class: "epl-boton", title: t("final.escribir_tomas.tooltip"),
          onclick: () => ctx.conLLM("final.escribiendo_tomas", "tomas") }, t("final.escribir_tomas")),
        el("button", { class: "epl-boton fuerte", onclick: () => ctx.guardarYAvisar() }, t("comun.guardar")),
        el("button", { class: "epl-mini", onclick: () => { editando = !editando; pintarFinal(); } }, t(editando ? "final.ver_resaltado" : "final.editar")),
        S.a_mano ? el("button", { class: "epl-mini", onclick: () => { S.a_mano = false; editando = false; ctx.pedirMontaje(); } }, t("final.volver_montar")) : null));
    const vacio = S.plan.tomas.every((x) => !x.lugar && !x.gesto);
    // los huecos llegan del servidor ya en el idioma de la ventana (rutas.montar)
    const avisos = !S.avisos.length ? null : el("p", { class: "epl-aviso" }, vacio ? t("final.plan_vacio")
      : t("final.huecos", { n: S.avisos.length, lista: S.avisos.slice(0, 4).join(" · ") + (S.avisos.length > 4 ? " · …" : "") }));
    let cuerpoFinal;
    if (editando) {
      cuerpoFinal = el("textarea", { class: "epl-final", oninput: (e) => { S.prompt = e.target.value; S.a_mano = true; } }, S.prompt);
    } else {
      cuerpoFinal = el("pre", { class: "epl-final" });
      for (const trozo of S.prompt.split(/(<(?:Picture|Video|Audio|Subject) \d+>)/)) {
        cuerpoFinal.append(/^<(Picture|Video) \d+>$/.test(trozo) ? el("span", { class: "epl-tag", "data-tag": trozo,
          onmouseenter: () => ctx.resaltar(trozo, true), onmouseleave: () => ctx.resaltar(trozo, false) }, trozo) : trozo);
      }
    }
    secFinal.replaceChildren(...[cab, el("p", { class: "epl-ayuda" }, t("final.ayuda")), avisos, cuerpoFinal].filter(Boolean));
  };
}
