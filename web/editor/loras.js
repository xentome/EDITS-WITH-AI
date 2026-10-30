/* LoRAs del proyecto (30 oct, solo en la app; en el nodo de ComfyUI los LoRAs los pone el usuario en su grafo). Un bloque
 * encima del prompt final: una fila por LoRA (cuál, de la lista de ComfyUI/models/loras, y su fuerza con un deslizador),
 * «+ Añadir LoRA» y «Subir LoRA» (un .safetensors de tu PC; en un pod, sube al pod). Se guardan en el estado (S.loras) y
 * la app los pone sobre el modelo de H3 al Generar, Retocar y Extender (app/generar.py, poner_loras).
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). */

const MAX = 8, FUERZA = 1;
const CLASE_LISTA = { true: "epl-loras-lista", false: "epl-loras-lista vacia" };

export function instalar(ctx) {
  const { u, S, secLoras } = ctx;
  const { el, t } = u;
  if (!ctx.enApp || !secLoras) { ctx.pintarLoras = () => {}; return; }
  S.loras = Array.isArray(S.loras) ? S.loras.filter((x) => x && x.nombre) : [];
  let lista = null, error = "", subiendo = "";

  async function cargar() {
    try {
      const r = await fetch("/app/loras").then((x) => x.json());
      lista = r.loras || [];
      error = "";
    } catch (e) { lista = []; error = e.message; }
    ctx.pintarLoras();
  }
  const cambiar = () => { ctx.programarGuardado(); ctx.pintarLoras(); };
  function opciones(actual) {
    const nombres = (lista || []).map((x) => x.nombre);
    const h3 = (lista || []).filter((x) => x.h3).map((x) => x.nombre), otros = nombres.filter((n) => !h3.includes(n));
    const op = (n) => el("option", { value: n, selected: n === actual }, n);
    return [
      ...(actual && !nombres.includes(actual) ? [el("option", { value: actual, selected: true }, t("loras.no_esta", { nombre: actual }))] : []),
      h3.length ? el("optgroup", { label: t("loras.grupo.h3") }, ...h3.map(op)) : null,
      otros.length ? el("optgroup", { label: t("loras.grupo.otros") }, ...otros.map(op)) : null,
    ].filter(Boolean);
  }
  function fila(x, i) {
    const valor = el("span", { class: "epl-loras-valor" }, u.num(x.fuerza, 2));
    return el("div", { class: "epl-loras-fila" },
      el("select", { "aria-label": t("loras.cual"), onchange: (e) => { x.nombre = e.target.value; cambiar(); } }, ...opciones(x.nombre)),
      el("input", { type: "range", min: -1, max: 2, step: 0.05, value: x.fuerza, "aria-label": t("loras.fuerza"), title: t("loras.fuerza.tooltip"),
                    oninput: (e) => { x.fuerza = +e.target.value; valor.textContent = u.num(x.fuerza, 2); },
                    onchange: () => ctx.programarGuardado() }),
      valor,
      el("button", { class: "epl-x", title: t("loras.quitar"), "aria-label": t("loras.quitar"),
                     onclick: () => { S.loras.splice(i, 1); cambiar(); } }, "✕"));
  }
  function anadir() {
    const usados = new Set(S.loras.map((x) => x.nombre));
    const libre = (lista || []).find((x) => x.h3 && !usados.has(x.nombre)) || (lista || []).find((x) => !usados.has(x.nombre));
    if (!libre) return;
    S.loras.push({ nombre: libre.nombre, fuerza: FUERZA });
    cambiar();
  }
  const archivo = el("input", { type: "file", accept: ".safetensors", hidden: true, onchange: (e) => subir(e.target.files?.[0]) });
  async function subir(f) {
    archivo.value = "";
    if (!f) return;
    subiendo = f.name; ctx.pintarLoras();
    try {
      const fd = new FormData();
      fd.append("archivo", f, f.name);
      const r = await fetch("/app/loras_subir", { method: "POST", body: fd }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      await cargar();
      if (S.loras.length < MAX) { S.loras.push({ nombre: r.nombre, fuerza: FUERZA }); ctx.programarGuardado(); }
      ctx.avisar(t("loras.subido", { nombre: r.nombre }), "bien");
    } catch (e) { ctx.avisar(t("loras.error_subir", { error: e.message }), "mal"); }
    subiendo = ""; ctx.pintarLoras();
  }

  ctx.pintarLoras = function pintarLoras() {
    const lleno = S.loras.length >= MAX, sinLista = !lista?.length;
    secLoras.replaceChildren(el("section", { class: "epl-loras-panel" },
      el("div", { class: "epl-loras-cab" },
        el("h3", {}, el("i", { class: "epl-icono" }, u.icono("capas")), t("loras.titulo", { n: S.loras.length })),
        el("span", { class: "epl-ayuda" }, t("loras.ayuda"))),
      el("div", { class: CLASE_LISTA[S.loras.length > 0] }, ...S.loras.map(fila)),
      el("div", { class: "epl-fila epl-loras-botones" },
        el("button", { class: "epl-mini", disabled: lleno || sinLista, onclick: anadir }, u.icono("mas"), " " + t("loras.anadir")),
        el("button", { class: "epl-mini", disabled: !!subiendo, title: t("loras.subir.tooltip"), onclick: () => archivo.click() },
          u.icono("subir"), " " + (subiendo ? t("loras.subiendo", { nombre: subiendo }) : t("loras.subir"))),
        archivo,
        lista === null ? el("span", { class: "epl-ayuda" }, t("loras.cargando"))
          : error ? el("span", { class: "epl-ayuda mal" }, t("loras.error_lista", { error }))
          : sinLista ? el("span", { class: "epl-ayuda" }, t("loras.vacia")) : null)));
  };
  ctx.pintarLoras();
  cargar();
}
