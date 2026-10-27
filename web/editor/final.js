/* Sección 5 del editor: PROMPT FINAL (lo que recibe H3), resaltado o editado a mano, con los botones que llaman al LLM
 * (los del LLM están ahora encima de la historia y de la toma; se guarda solo). Cada trozo se pinta del color de quien lo escribió (nucleo.montar los
 * devuelve con su origen): molde de H3, frase del código (frases.json), tú o el LLM. Una frase del código se toca y se
 * cambia en el panel «Frases del código» (S.frases: solo las que cambió el usuario; las demás, las de frases.json).
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Las utilidades llegan en ctx.u, sin imports, para que
 * este archivo también se recargue al abrir la ventana. Planos: ../../planos/4 El editor.md. */

const ORIGENES = ["molde", "codigo", "tu", "llm"];

/* Añade ctx.pintarFinal y ctx.abrirFrases. Usa de ctx: u, S, secFinal, capa, resaltar, pedirMontaje, programarGuardado. */
export function instalar(ctx) {
  const { u, S, secFinal } = ctx;
  const { el, t } = u;

  // el texto de un trozo, con las etiquetas (<Picture 1>…) resaltables como siempre
  const conEtiquetas = (texto) => texto.split(/(<(?:Picture|Video|Audio|Subject) \d+>)/).map((trozo) =>
    /^<(Picture|Video) \d+>$/.test(trozo) ? el("span", { class: "epl-tag", "data-tag": trozo,
      onmouseenter: () => ctx.resaltar(trozo, true), onmouseleave: () => ctx.resaltar(trozo, false) }, trozo) : trozo);

  let editando = false;
  // el prompt completo va oculto (26 oct): se ve con «mostrar prompt completo»; se recuerda en este navegador
  let visible = false;
  try { visible = localStorage.getItem("epl-prompt-visible") === "1"; } catch { /* sin almacenamiento */ }
  ctx.pintarFinal = function pintarFinal() {
    const mostrar = el("button", { class: "epl-mini epl-mostrar-prompt", title: t("final.mostrar.tooltip"), onclick: () => {
      visible = !visible;
      try { localStorage.setItem("epl-prompt-visible", visible ? "1" : "0"); } catch { /* sin almacenamiento */ }
      pintarFinal();
    } }, t(visible ? "final.ocultar" : "final.mostrar"));
    const cab = el("div", { class: "epl-tit" }, t("final.titulo"), mostrar,
      S.a_mano ? el("span", { class: "epl-marca" }, t("final.a_mano")) : null,
      !visible ? null : el("span", { class: "der" },
        el("button", { class: "epl-mini epl-abrir-frases", title: t("final.frases.tooltip"), onclick: () => ctx.abrirFrases() },
          t("final.frases", { n: Object.keys(S.frases).length })),
        el("button", { class: "epl-mini", onclick: () => { editando = !editando; pintarFinal(); } }, t(editando ? "final.ver_resaltado" : "final.editar")),
        S.a_mano ? el("button", { class: "epl-mini", onclick: () => { S.a_mano = false; editando = false; ctx.pedirMontaje(); } }, t("final.volver_montar")) : null));
    const vacio = S.plan.tomas.every((x) => !x.lugar && !x.gesto);
    // los huecos llegan del servidor ya en el idioma de la ventana (rutas.montar)
    const avisos = !S.avisos.length ? null : el("p", { class: "epl-aviso" }, vacio ? t("final.plan_vacio")
      : t("final.huecos", { n: S.avisos.length, lista: S.avisos.slice(0, 4).join(" · ") + (S.avisos.length > 4 ? " · …" : "") }));
    // la leyenda de los colores (con el prompt editado a mano ya no se sabe quién escribió qué)
    const colores = !S.a_mano && !editando && S.trozos.length;
    const leyenda = !colores ? null : el("p", { class: "epl-leyenda" }, t("final.leyenda") + " ",
      ...ORIGENES.map((o) => el("span", { class: `epl-o epl-o-${o}`, title: t(`final.origen.${o}.tooltip`) }, t(`final.origen.${o}`))));
    let cuerpoFinal;
    if (editando) {
      cuerpoFinal = el("textarea", { class: "epl-final", oninput: (e) => { S.prompt = e.target.value; S.a_mano = true; ctx.programarGuardado(); } }, S.prompt);
    } else if (colores) {
      cuerpoFinal = el("pre", { class: "epl-final" });
      for (const [texto, origen, clave] of S.trozos) {
        if (origen === "molde") { cuerpoFinal.append(...conEtiquetas(texto)); continue; }
        const titulo = clave ? t("final.origen.frase", { clave, de: t(`final.origen.${origen}`) }) : t(`final.origen.${origen}.tooltip`);
        cuerpoFinal.append(el("span", { class: `epl-o epl-o-${origen}` + (clave ? " frase" : ""), title: titulo,
          onclick: clave ? () => ctx.abrirFrases(clave) : null }, ...conEtiquetas(texto)));
      }
    } else {
      cuerpoFinal = el("pre", { class: "epl-final" }, ...conEtiquetas(S.prompt));
    }
    secFinal.replaceChildren(...(visible ? [cab, el("p", { class: "epl-ayuda" }, t("final.ayuda")), leyenda, avisos, cuerpoFinal]
                                         : [cab, avisos]).filter(Boolean));
  };

  /* panel «Frases del código»: todas las frases de unión de frases.json (S.frasesBase, las manda el servidor al montar),
   * cada una con su texto de ahora. Cambiar una la guarda en S.frases (va al montaje y al estado del nodo); ↺ vuelve a la
   * de frases.json. `foco`: la frase que se tocó en el prompt final (el panel se abre ahí). */
  ctx.abrirFrases = function abrirFrases(foco) {
    const v = ctx.capa("");
    const pintar = () => {
      const filas = Object.entries(S.frasesBase).map(([clave, base]) => {
        const propia = clave in S.frases;
        const marca = el("span", { class: "epl-ayuda" }, propia ? t("final.frases.cambiada") : "");
        const volver = el("button", { class: "epl-mini epl-frase-volver", title: t("final.frases.volver.tooltip"), disabled: !propia,
          onclick: () => { delete S.frases[clave]; ctx.pedirMontaje(); pintar(); } }, u.icono("volver"));
        const entrada = el("textarea", { rows: 2, class: "epl-frase-txt", "data-clave": clave,
          oninput: (e) => { S.frases[clave] = e.target.value; marca.textContent = t("final.frases.cambiada"); volver.disabled = false;
                            ctx.pedirMontaje(); } },
          propia ? S.frases[clave] : base);
        return el("div", { class: "epl-frase" + (clave === foco ? " foco" : "") },
          el("div", { class: "epl-fila" }, el("b", {}, clave), marca, volver), entrada);
      });
      v.modal.replaceChildren(
        el("div", { class: "epl-tit" }, t("final.frases.titulo"),
          el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => { v.cerrar(); ctx.pintarFinal(); } }, t("comun.cerrar")))),
        el("p", { class: "epl-ayuda" }, t("final.frases.ayuda", { c: "{nombre}", cp: "{nombre|object}" })),
        ...filas);
      v.modal.querySelector(".epl-frase.foco")?.scrollIntoView({ block: "center" });
    };
    v.repintar = pintar;
    pintar();
  };
}
