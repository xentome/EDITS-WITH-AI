/* Sección 4 del editor, entre las tomas y la onda del audio: la FILA DE TEXTO. Cada palabra en pantalla es una etiqueta
 * con su momento (t), su fin (por defecto, el de su toma), dónde va respecto a la cara (encima / al lado), la referencia de
 * su letra (una tarjeta del Stack con papel «letra», fuerza 0,5) y una frase opcional de cómo se ve. Viven en el plan
 * (plan.textos) y el montaje (nucleo.textos_de y nucleo.frase_texto) las escribe en su toma y en su momento, sin anunciarlas
 * antes. Sustituye a los campos viejos «Palabras» y «Estilo de las palabras» (el servidor convierte «TO YOU @1»).
 *   añadir: «+ Texto» o doble clic en un hueco (se pega al beat más cercano) · mover: arrastrar la etiqueta (al fotograma
 *   y, con «pegar a los beats», al beat a ±0,15 s) · durar: arrastrar su borde derecho · tocarla: su tarjetita.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md. */

export const FPS = 24, IMAN = 0.15;
const alFotograma = (t) => Math.round(Math.round(t * FPS) / FPS * 1000) / 1000;

// el beat más cercano a t (o t si no hay beats)
export function pegarAlBeat(t, beats = []) {
  return beats.length ? beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a)) : t;
}
// t movido por el usuario: dentro del edit, al fotograma y, con «pegar», al beat a ±0,15 s si lo hay
export function moverTexto(t, dur, beats = [], pegar = false) {
  let x = alFotograma(Math.min(Math.max(t, 0), dur - 1 / FPS));
  if (pegar) {
    const b = pegarAlBeat(x, beats.filter((b) => b >= 0 && b < dur));
    if (beats.length && Math.abs(b - x) <= IMAN) x = b;
  }
  return Math.round(x * 1000) / 1000;
}
// la toma (1…n) que contiene t, y dónde acaba una palabra: su fin o, si no tiene, el fin de su toma
export const tomaDe = (t, cortes) => Math.max(1, cortes.filter((a) => a <= t + 1e-6).length);
export function finDe(x, cortes, dur) {
  if (x.fin != null && x.fin > x.t) return x.fin;
  const k = tomaDe(x.t, cortes);
  return k < cortes.length ? cortes[k] : dur;
}

/* Añade ctx.pintarTexto, ctx.abrirTexto, ctx.textosDeToma. Usa de ctx: u, S, wf, secTexto, capa, avisar, pedirMontaje,
 * pintarRefs, cambiarStack, abrirBiblioteca, abrirSubir, refDe. */
export function instalar(ctx) {
  const { u, S, secTexto } = ctx;
  const { el, t } = u;
  const seg = (x) => u.num(x, 3);
  const cortes = () => (S.cortes.length === S.tomas ? S.cortes : [0]);
  // sin plan.textos todavía, el primer montaje los trae convertidos del formato viejo (editor_core.js): no se crean aquí
  const textos = () => (Array.isArray(S.plan.textos) ? S.plan.textos : []);
  const nuevoId = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const cambio = () => { ctx.pintarTexto(); ctx.pedirMontaje(); };

  // las palabras de la toma k (para el resaltado de sus referencias)
  ctx.textosDeToma = (k) => textos().filter((x) => tomaDe(x.t, cortes()) === k);

  function anadir(t0) {
    const x = { id: nuevoId(), texto: "", t: moverTexto(pegarAlBeat(t0, S.beats || []), +S.duracion), fin: null,
                sitio: "al_lado", letra: "", frase: "" };
    S.plan.textos = [...textos(), x];
    cambio();
    ctx.abrirTexto(x.id);
  }

  ctx.pintarTexto = function pintarTexto() {
    if (!secTexto) return;
    const dur = +S.duracion;
    const pista = el("div", { class: "epl-texto-pista", title: t("texto.ayuda") });
    pista.addEventListener("dblclick", (e) => {
      if (e.target !== pista) return;
      anadir((e.clientX - pista.getBoundingClientRect().left) / Math.max(1, pista.clientWidth) * dur);
    });
    const enS = (dx) => dx / Math.max(1, pista.clientWidth) * dur;
    for (const x of textos()) {
      const et = el("div", { class: "epl-texto-et " + x.sitio, "data-texto": x.id });
      const nombre = el("span", {}, x.texto || t("texto.sin_texto"));
      const segundos = el("span", { class: "seg" });
      const borde = el("div", { class: "fin", title: t("texto.fin.tooltip") });
      et.append(nombre, borde, segundos);
      const colocar = (a, b) => {
        et.style.left = `${a / dur * 100}%`;
        et.style.width = `${Math.max(0.01, b - a) / dur * 100}%`;
        et.title = t("texto.etiqueta.tooltip", { texto: x.texto || t("texto.sin_texto"), a: seg(a), b: seg(b) });
      };
      colocar(x.t, finDe(x, cortes(), dur));
      // arrastrar: la etiqueta entera mueve el momento (y el fin, si lo tiene); el borde derecho cambia el fin
      let arr = null;
      const empezar = (e, que) => {
        if (e.button > 0) return;
        try { et.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
        arr = { id: e.pointerId, que, x0: e.clientX, t: x.t, fin: x.fin, finVisto: finDe(x, cortes(), dur), movido: false };
        e.preventDefault();
        e.stopPropagation();
      };
      et.addEventListener("pointerdown", (e) => empezar(e, e.target === borde ? "fin" : "t"));
      et.addEventListener("pointermove", (e) => {
        if (!arr || e.pointerId !== arr.id) return;
        const dx = e.clientX - arr.x0;
        if (Math.abs(dx) > 3) arr.movido = true;
        if (!arr.movido) return;
        et.classList.add("arrastrando");
        if (arr.que === "t") {
          x.t = moverTexto(arr.t + enS(dx), dur, S.beats || [], S.pegarBeats);
          if (arr.fin != null) x.fin = Math.min(dur, Math.round((arr.fin + x.t - arr.t) * 1000) / 1000);
          segundos.textContent = t("texto.segundos", { s: seg(x.t) });
        } else {
          x.fin = Math.max(x.t + 1 / FPS, moverTexto(arr.finVisto + enS(dx), dur + 1 / FPS, S.beats || [], S.pegarBeats));
          segundos.textContent = t("texto.segundos", { s: seg(x.fin) });
        }
        colocar(x.t, finDe(x, cortes(), dur));
      });
      const soltar = (e) => {
        if (!arr || e.pointerId !== arr.id) return;
        const movido = arr.movido;
        arr = null;
        et.classList.remove("arrastrando");
        if (movido) cambio(); else ctx.abrirTexto(x.id);
      };
      et.addEventListener("pointerup", soltar);
      et.addEventListener("pointercancel", soltar);
      pista.append(et);
    }
    secTexto.replaceChildren(
      el("div", { class: "epl-texto-cab" }, el("b", {}, t("texto.rotulo")),
        el("button", { class: "epl-mini", title: t("texto.anadir.tooltip"),
          onclick: () => anadir(S.elegida ? cortes()[S.elegida - 1] ?? 0 : 0) }, t("texto.anadir")),
        el("span", { class: "epl-ayuda" }, t("texto.ayuda"))),
      el("div", { class: "epl-texto-fila" }, pista, el("span", { class: "epl-hueco" })));
  };

  // la tarjeta del Stack de la letra (para su fuerza)
  const tarjetaDe = (tag) => ctx.wf.items.find((r) => r.tag === tag && r.idx !== undefined);
  // pone la letra recién añadida al Stack (sus nombres de RefMod): fuerza 0,5 y la palabra la usa
  function usarLetra(x, nombres) {
    const n = nombres[0];
    if (!n) return;
    ctx.cambiarStack((picks) => {
      for (let i = picks.length - 1; i >= 0; i--) if (picks[i]?.name === n) { picks[i].visual = { ...(picks[i].visual || {}), mode: "weight", w: 0.5 }; break; }
    });
    const r = [...ctx.wf.items].reverse().find((r) => r.clave === n && r.tag);
    x.letra = r?.tag || "";
    ctx.avisar(t("texto.letra_lista", { tag: x.letra, texto: x.texto }), "bien");
    cambio();
    ctx.abrirTexto(x.id);
  }

  /* la tarjetita de una palabra: el texto, encima / al lado, la referencia de la letra (biblioteca o subir; fuerza), la
   * frase de la letra y ✕ con confirmación */
  ctx.abrirTexto = function abrirTexto(id) {
    const x = textos().find((y) => y.id === id);
    if (!x) return;
    let pregunta = false;
    const v = ctx.capa("der");
    const pintar = () => {
      const dur = +S.duracion, fin = finDe(x, cortes(), dur), card = x.letra ? tarjetaDe(x.letra) : null;
      const sitio = (s) => el("button", { class: "epl-mini" + (x.sitio === s ? " fijo" : ""), "data-sitio": s,
        title: t(`texto.sitio.${s}.tooltip`), onclick: () => { x.sitio = s; cambio(); pintar(); } }, t(`texto.sitio.${s}`));
      const opciones = { papel: "letra", alAnadir: (nombres) => usarLetra(x, nombres) };
      v.modal.replaceChildren(
        el("div", { class: "epl-tit" }, t("texto.titulo"),
          el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => v.cerrar() }, t("comun.cerrar")))),
        el("div", { class: "epl-texto-tarjeta" },
          el("label", {}, t("texto.campo")),
          el("input", { class: "epl-nombre", "data-campo": "texto", value: x.texto, placeholder: t("texto.campo.placeholder"),
                        oninput: (e) => { x.texto = e.target.value; cambio(); } }),
          el("p", { class: "epl-ayuda" }, t("texto.tiempo", { a: seg(x.t), b: seg(fin) }) + (x.fin == null ? " " + t("texto.fin_toma") : " "),
            x.fin != null ? el("button", { class: "epl-mini", onclick: () => { x.fin = null; cambio(); pintar(); } }, t("texto.fin_auto")) : null),
          el("label", {}, t("texto.sitio")),
          el("div", { class: "epl-fila" }, sitio("encima"), sitio("al_lado")),
          el("label", {}, t("texto.letra")),
          el("div", { class: "epl-fila" },
            el("span", { class: "epl-texto-letra" + (x.letra ? " usada" : ""), "data-tag": x.letra || "" },
              x.letra ? `${x.letra} ${card?.nombre || ""}` : t("texto.letra.ninguna")),
            el("button", { class: "epl-mini", onclick: () => ctx.abrirBiblioteca("der", opciones) }, t("texto.letra.elegir")),
            el("button", { class: "epl-mini", onclick: () => ctx.abrirSubir("der", opciones) }, t("texto.letra.subir")),
            x.letra ? el("button", { class: "epl-mini", title: t("texto.letra.quitar.tooltip"),
              onclick: () => { x.letra = ""; cambio(); pintar(); ctx.pintarRefs(); } }, t("texto.letra.quitar")) : null),
          card ? el("label", { title: t("texto.letra.fuerza.tooltip") }, t("texto.letra.fuerza") + " ",
            el("input", { type: "number", min: 0, max: 10, step: 0.05, value: card.fuerza, class: "corto", "data-campo": "fuerza",
              onchange: (e) => { ctx.cambiarStack((p) => {
                p[card.idx].visual = { ...(p[card.idx].visual || {}), mode: "weight", w: Math.max(0, Math.min(10, +e.target.value || 0)) };
              }); pintar(); } })) : null,
          el("label", {}, t("texto.frase")),
          el("input", { class: "epl-nombre", "data-campo": "frase", value: x.frase || "", placeholder: t("texto.frase.placeholder"),
                        oninput: (e) => { x.frase = e.target.value; cambio(); } }),
          el("div", { class: "epl-fila" }, pregunta
            ? el("span", { class: "epl-ayuda" }, t("texto.pregunta_quitar") + " ",
                el("button", { class: "epl-mini", onclick: () => {
                  S.plan.textos = textos().filter((y) => y.id !== id);
                  v.cerrar(); cambio(); ctx.pintarRefs();
                  ctx.avisar(t("texto.quitada", { texto: x.texto }), "bien");
                } }, t("comun.si")),
                el("button", { class: "epl-mini", onclick: () => { pregunta = false; pintar(); } }, t("comun.no")))
            : el("button", { class: "epl-mini", onclick: () => { pregunta = true; pintar(); } }, t("texto.quitar")))));
      v.modal.querySelector("[data-campo=texto]")?.focus();
    };
    v.repintar = pintar;
    pintar();
    return v;
  };
}
