/* Sección 5 del editor: PROMPT FINAL (lo que recibe H3), resaltado o editado a mano, con los botones que llaman al LLM
 * (Escribir historia, Escribir tomas) y Guardar. Solo exporta funciones (ComfyUI importa todos los .js de web/).
 * Las utilidades llegan en ctx.u, sin imports, para que este archivo también se recargue al abrir la ventana.
 * Planos: ../../planos/4 El editor.md. */

/* Añade ctx.pintarFinal. Usa de ctx: u, S, secFinal, resaltar, pedirMontaje, conLLM, guardarYAvisar. */
export function instalar(ctx) {
  const { u, S, secFinal } = ctx;
  const { el } = u;

  let editando = false;
  ctx.pintarFinal = function pintarFinal() {
    const cab = el("div", { class: "epl-tit" }, "Prompt final · lo que recibe H3",
      S.a_mano ? el("span", { class: "epl-marca" }, "editado a mano") : null,
      el("span", { class: "der" },
        el("button", { class: "epl-boton", title: "Arco, luz y, en cada toma, lugar, qué pasa, referencias y efecto (unos 2 min). Respeta lo que tiene 🔒.",
          onclick: () => ctx.conLLM("Escribiendo la historia", "historia") }, "Escribir historia"),
        el("button", { class: "epl-boton", title: "Encuadre, luz, gesto y cámara de todas las tomas (unos 30 s). Respeta lo que tiene 🔒.",
          onclick: () => ctx.conLLM("Escribiendo las tomas", "tomas") }, "Escribir tomas"),
        el("button", { class: "epl-boton fuerte", onclick: () => ctx.guardarYAvisar() }, "Guardar"),
        el("button", { class: "epl-mini", onclick: () => { editando = !editando; pintarFinal(); } }, editando ? "Ver resaltado" : "Editar a mano"),
        S.a_mano ? el("button", { class: "epl-mini", onclick: () => { S.a_mano = false; editando = false; ctx.pedirMontaje(); } }, "Volver a montar") : null));
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
    secFinal.replaceChildren(...[cab, el("p", { class: "epl-ayuda" }, "El código lo vuelve a montar con cada cambio, sin llamar al LLM. " +
      "Pasa el ratón sobre una referencia para ver dónde se usa."), avisos, cuerpoFinal].filter(Boolean));
  };
}
