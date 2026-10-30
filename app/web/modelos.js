/* MAX EDITOR · «Modelos» (29 oct, Jonathan): un desplegable de la cabecera que dice qué modelos hay y cuáles faltan.
 *   - H3, el codificador de texto, los dos VAE y SAM 3 se pueden cambiar por un archivo propio que ya esté en ComfyUI
 *     (su lista es la del nodo que lo carga). VDN y la vista previa no: la app los necesita tal cual.
 *   - Lo que falta se baja con un clic (el instalador ya no baja nada sin permiso): de Hugging Face, con su sha256 y
 *     reanudable. El servidor es app/modelos.py (GET /app/modelos, POST /app/modelos/{elegir|bajar|parar}). */
export function crear({ el, icono, t, num, pedir, avisar, alCambiar }) {
  const M = { abierto: false, datos: null, ocupado: false };
  // cada pieza: su nombre y para qué sirve (las claves, a la vista para pruebas.py)
  const TEXTO = {
    h3: ["app.modelos.h3", "app.modelos.h3.para"],
    texto: ["app.modelos.texto", "app.modelos.texto.para"],
    vae_video: ["app.modelos.vae_video", "app.modelos.vae_video.para"],
    vae_audio: ["app.modelos.vae_audio", "app.modelos.vae_audio.para"],
    sam: ["app.modelos.sam", "app.modelos.sam.para"],
    vdn: ["app.modelos.vdn", "app.modelos.vdn.para"],
    vista_previa: ["app.modelos.vista_previa", "app.modelos.vista_previa.para"],
  };
  const ERROR = { corte: "app.modelos.error.corte", sha256: "app.modelos.error.sha256" };
  const CLASE = { panel: { true: "max-mod ver", false: "max-mod" }, estado: { true: "max-mod-estado si", false: "max-mod-estado no" },
                  boton: { true: "max-boton max-mod-boton falta", false: "max-boton max-mod-boton" } };
  const tam = (b) => b >= 2 ** 30 ? t("app.modelos.gb", { n: num(b / 2 ** 30, 1) }) : t("app.modelos.mb", { n: num(b / 2 ** 20, 0) });
  const bajandoAlgo = () => (M.datos?.piezas || []).some((p) => ["bajando", "comprobando"].includes(p.bajando?.estado));
  // lo que hace falta para el edit (SAM solo para Retocar) y no está
  const faltan = () => (M.datos?.piezas || []).filter((p) => !p.esta && p.grupo === "edit").length;

  const panel = el("div", { class: "max-mod", role: "dialog", "aria-label": t("app.modelos.titulo") });
  let reloj = null;

  async function cargar() {
    const antes = faltan();
    try { M.datos = await pedir("/app/modelos"); } catch { /* servidor sin reiniciar o caído: el botón no avisa */ }
    pintar();
    if (faltan() !== antes || !M.listo) { M.listo = true; alCambiar(); }
    clearTimeout(reloj);
    if (M.abierto || bajandoAlgo()) reloj = setTimeout(cargar, bajandoAlgo() ? 1500 : 5000);
  }
  async function hacer(accion, cuerpo, aviso) {
    M.ocupado = true;
    pintar();
    try {
      await pedir("/app/modelos/" + accion, cuerpo);
      if (aviso) avisar(aviso, "bien");
    } catch (e) { avisar(e.message, "mal"); }
    M.ocupado = false;
    await cargar();
  }

  function estadoBajada(p) {
    const b = p.bajando;
    if (!b) return null;
    if (b.estado === "bajando") {
      const pct = Math.floor((100 * b.hecho) / Math.max(1, b.total));
      return el("div", { class: "max-mod-bajada" }, el("div", { class: "max-mod-barra" }, el("i", { style: { width: `${pct}%` } })),
        // hasta el primer trozo: aún conectando con Hugging Face (puede tardar hasta un minuto en reintentar)
        el("span", {}, b.hecho ? t("app.modelos.bajando", { pct, vel: tam(b.vel || 0) }) : t("app.modelos.conectando")),
        el("button", { class: "max-boton", onclick: () => hacer("parar", { clave: p.clave }) }, icono("pausa"), " " + t("app.modelos.parar")));
    }
    if (b.estado === "comprobando") return el("div", { class: "max-mod-bajada" }, el("span", {}, t("app.modelos.comprobando")));
    if (b.estado === "parado") return el("div", { class: "max-mod-nota" }, t("app.modelos.parado"));
    if (b.estado === "error") return el("div", { class: "max-mod-nota mal" }, t(ERROR[b.error] || "app.modelos.error.corte"));
    return null;
  }

  function fila(p) {
    const [nombre, para] = TEXTO[p.clave];
    const enCurso = ["bajando", "comprobando"].includes(p.bajando?.estado);
    // la lista: lo que ve ComfyUI en esa carpeta; el nuestro va primero y dice si falta
    const nuestro = p.defecto_completo || p.opciones.includes(p.defecto) ? t("app.modelos.nuestro", { archivo: p.defecto })
      : t("app.modelos.nuestro_falta", { archivo: p.defecto });
    const otros = p.opciones.filter((o) => o !== p.defecto);
    const lista = p.elegible ? el("select", { disabled: M.ocupado, "aria-label": t(nombre),
      onchange: (e) => hacer("elegir", { clave: p.clave, archivo: e.target.value }, t("app.modelos.elegido", { archivo: e.target.value })) },
      el("option", { value: p.defecto, selected: p.elegido === p.defecto }, nuestro),
      ...otros.map((o) => el("option", { value: o, selected: p.elegido === o }, o))) : el("span", { class: "max-mod-fijo" }, p.defecto);
    const puedeBajar = p.elegido === p.defecto && !p.defecto_completo && !enCurso;
    return el("div", { class: "max-mod-fila" },
      el("div", { class: "max-mod-cab" }, el("b", {}, t(nombre)),
        p.grupo === "retocar" ? el("span", { class: "max-mod-chip" }, t("app.modelos.solo_retocar")) : null,
        el("span", { class: "max-derecha" }),
        el("span", { class: CLASE.estado[p.esta] }, t(p.esta ? "app.modelos.esta" : "app.modelos.falta"))),
      el("div", { class: "max-mod-para" }, t(para)),
      el("div", { class: "max-mod-elegir" }, lista,
        puedeBajar ? el("button", { class: "max-boton max-mod-bajar", disabled: M.ocupado, title: t("app.modelos.bajar.tooltip", { repo: p.repo }),
                                    onclick: () => hacer("bajar", { clave: p.clave }) }, icono("abajo"), " " + t("app.modelos.bajar", { tam: tam(p.por_bajar) })) : null),
      p.elegible ? null : el("div", { class: "max-mod-nota" }, t("app.modelos.fijo")),
      estadoBajada(p),
      el("a", { class: "max-mod-hf", href: "https://huggingface.co/" + p.repo, target: "_blank", rel: "noopener", title: t("app.modelos.hf.tooltip") }, p.repo));
  }

  function pintar() {
    panel.className = CLASE.panel[M.abierto];
    if (!M.abierto) return panel.replaceChildren();
    const d = M.datos;
    panel.replaceChildren(
      el("div", { class: "max-mod-titulo" }, el("b", {}, t("app.modelos.titulo")), el("span", { class: "max-derecha" }),
        el("button", { class: "max-boton max-cerrar", title: t("comun.cerrar"), "aria-label": t("comun.cerrar"), onclick: cerrar }, icono("x"))),
      el("p", { class: "max-mod-intro" }, t("app.modelos.intro")),
      el("p", { class: "max-mod-aviso" }, t("app.modelos.aviso")),
      ...(d ? d.piezas.map(fila) : [el("div", { class: "max-vacio" }, t("app.modelos.cargando"))]),
      d ? el("div", { class: "max-mod-pie" },
        d.comfyui ? null : el("div", {}, t("app.modelos.comfyui_apagado")),
        el("div", {}, t("app.modelos.carpeta", { carpeta: d.carpeta })),
        d.libre != null ? el("div", {}, t("app.modelos.libre", { tam: tam(d.libre) })) : null) : null);
  }

  function abrir() { M.abierto = true; pintar(); alCambiar(); cargar(); }
  function cerrar() { M.abierto = false; pintar(); alCambiar(); }
  // el botón de la cabecera (pintarCabecera lo pide cada vez): dice cuántos faltan para hacer un edit
  function boton() {
    const n = faltan();
    return el("button", { class: CLASE.boton[n > 0], title: n ? t("app.modelos.faltan.tooltip", { n }) : t("app.modelos.boton.tooltip"),
                          "aria-expanded": String(M.abierto), onclick: () => (M.abierto ? cerrar() : abrir()) },
      icono("caja"), " " + t("app.modelos.boton"), n ? el("span", { class: "max-mod-cuenta" }, String(n)) : null);
  }
  document.addEventListener("keydown", (e) => { if (M.abierto && e.key === "Escape") { e.stopPropagation(); cerrar(); } }, true);
  document.addEventListener("pointerdown", (e) => {
    if (M.abierto && !panel.contains(e.target) && !e.target.closest?.(".max-mod-boton")) cerrar();
  });
  document.body.append(panel);
  return { boton, abrir, cerrar, cargar };
}
