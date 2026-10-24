/* Columna 3 del editor: PROMPT FINAL (lo que recibe H3), resaltado o editado a mano.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Las utilidades llegan en ctx.u, sin imports, para que
 * este archivo también se recargue al abrir la ventana. Planos: ../../planos/4 El editor.md. */

/* Añade ctx.pintarFinal. Usa de ctx: u, S, colFinal, resaltar, pedirMontaje. */
export function instalar(ctx) {
  const { u, S, colFinal } = ctx;
  const { el } = u;

  let editando = false;
  ctx.pintarFinal = function pintarFinal() {
    const cab = el("div", { class: "epl-fila" },
      el("h3", {}, "Prompt final"),
      S.a_mano ? el("span", { class: "epl-marca" }, "editado a mano") : null,
      el("button", { class: "epl-mini", onclick: () => { editando = !editando; pintarFinal(); } }, editando ? "Ver resaltado" : "Editar a mano"),
      S.a_mano ? el("button", { class: "epl-mini", onclick: () => { S.a_mano = false; editando = false; ctx.pedirMontaje(); } }, "Volver a montar") : null);
    const vacio = S.plan.tomas.every((t) => !t.lugar && !t.gesto);
    const avisos = !S.avisos.length ? null : el("p", { class: "epl-aviso" }, vacio
      ? "El plan está vacío: pulsa «Escribir historia» y después «Escribir tomas», o escribe tú los campos."
      : `Huecos (${S.avisos.length}): ` + S.avisos.slice(0, 4).join(" · ") + (S.avisos.length > 4 ? " · …" : ""));
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
    colFinal.replaceChildren(...[cab, el("p", { class: "epl-ayuda" }, "Lo que recibe H3. Pasa el ratón sobre una referencia para ver dónde se usa."),
      avisos, cuerpoFinal].filter(Boolean));
  };
}
