/* MAX EDITOR: la cabecera de la app (proyecto, salud, Generar, videos, idioma) y, debajo, la ventana del nodo «Prompt del
 * edit» tal cual (web/editor_core.js), abierta con un grafo de mentira (grafo_falso.js) en vez del lienzo de ComfyUI.
 * Plano: ../../planos/fases/6 La app MAX EDITOR.md. Todo texto pasa por t() con los mismos web/i18n/*.json del nodo.
 *   - Proyecto = app/proyectos/<nombre>.json con {valores: {id: {campo: valor}}} (solo lo que cambia respecto a la plantilla).
 *   - El autoguardado de la ventana escribe en los widgets del nodo de mentira; al terminar, la app guarda el proyecto.
 *   - Generar (27 oct, planos/fases/10): encola en POST /app/cola una foto fija de todos los valores y la semilla (o N
 *     trabajos con semillas aleatorias, «Encolar ×N»); el servidor los hace de uno en uno aunque la página esté cerrada.
 *     La página mira la cola cada 2 s: la fila de avance enseña el que corre y el panel «Cola» la lista entera.
 *   - La barra de fases (27 oct, interfaz P10): «1 Tomas y referencias | 2 Retocar», a todo el ancho encima de la ventana,
 *     cada una con su mini estado; la elegida se ve (la otra se oculta) y se recuerda en este navegador.
 *   - El ejemplo (app/proyectos/ejemplo.json) va en git y es de solo lectura: elegirlo crea una copia («mi ejemplo») y abre
 *     esa. Así abrirlo nunca reescribe el archivo (el estado lleva la hora de guardado). */
import { construir, valoresDe, nodoDelEdit, nodoPorTipo, campo } from "./grafo_falso.js";

const NODO = "/edit_prompt_llm/web/";
const v = "?v=" + Date.now();
const [core, i18n, util] = await Promise.all(["editor_core.js", "editor/i18n.js", "editor/util.js"].map((f) => import(NODO + f + v)));
const retocarJS = await import("./retocar.js" + v);
const extenderJS = await import("./extender.js" + v);
const { el } = util;

// ---- idioma: el mismo ajuste que en ComfyUI («Prompt del edit › Idioma»), guardado en este navegador
const GUARDA_IDIOMA = "max-editor-idioma", GUARDA_PROYECTO = "max-editor-proyecto", GUARDA_FASE = "max-editor-fase";
const EJEMPLO = "ejemplo";                                 // el proyecto de ejemplo del repo: solo se lee (servidor.py)
const leerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ponerLocal = (k, x) => { try { localStorage.setItem(k, x); } catch { /* sin almacenamiento: solo esta sesión */ } };
const ajustes = {
  get: (k) => (k === i18n.AJUSTE ? leerLocal(GUARDA_IDIOMA) || "auto" : k === "Comfy.Locale" ? navigator.language : undefined),
  set: (k, x) => { if (k === i18n.AJUSTE) { ponerLocal(GUARDA_IDIOMA, x); tr = i18n.traductor(textos, i18n.idiomaElegido(appFalso)); pintarCabecera(); retoque?.pintar(); extension?.pintar(); } },
};
// maxEditor: la ventana sabe que corre en la app (p. ej., el audio del video solo se elige aquí; en el nodo, el grafo es del usuario)
const appFalso = { graph: null, maxEditor: true, extensionManager: { setting: ajustes, toast: { add() {} } } };
const textos = await i18n.cargarTextos();
let tr = i18n.traductor(textos, i18n.idiomaElegido(appFalso));
const t = (clave, datos) => tr.t(clave, datos);

async function pedir(ruta, cuerpo) {
  const r = await fetch(`${ruta}${ruta.includes("?") ? "&" : "?"}idioma=${tr.idioma}`, cuerpo === undefined ? { cache: "no-store" } :
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({ error: t("errores.respuesta_no_valida", { estado: r.status }) }));
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}

// ---- estado de la app
const A = { plantilla: null, graph: null, node: null, ctx: null, proyecto: "", guardadoJSON: "", proyectos: [], salud: {},
            trabajo: null, avance: null, videos: [], videoActual: "", verVideos: false, aviso: ["", ""], pop: null,
            cola: { pausada: false, trabajos: [] }, verCola: false, colaN: 1, colaVista: {},
            fase: leerLocal(GUARDA_FASE) === "retocar" ? "retocar" : "tomas",
            // el agente (MCP, planos/fases/11): rev del proyecto que se cargó, marcas «✎ agente», cambios sin guardar y choque
            rev: 0, marcas: [], sucio: false, recargando: null };

// ---- «Retocar el video»: la sección de abajo del todo (retocar.js), con el último video generado
const retoque = retocarJS.crear({ el, icono: util.icono, mirarCola: () => mirarCola(), t, num: (x, d) => tr.num(x, d), pedir, A, avisar: (x, tipo) => avisar(x, tipo),
                                  alTerminar: () => cargarVideos() });
// ---- «Extender video» (extender.js, planos/fases/12): el segundo apartado de Retocar, con sus pestañas
const extension = extenderJS.crear({ el, icono: util.icono, mirarCola: () => mirarCola(), t, num: (x, d) => tr.num(x, d), pedir, A,
                                     avisar: (x, tipo) => avisar(x, tipo), alTerminar: () => cargarVideos(), retoque });

/* ---- el preview en vivo (28 oct, planos/fases/13 §7): lo que manda el nodo «Model Preview Override» de la plantilla,
 * guardado dentro de ComfyUI por vista_previa.py y leído por GET /max_editor/preview.
 * (29 oct, variante P1 de app/web/prototipo_preview.html, elegida por Jonathan) una cortina dentro de la cabecera: se abre y
 * se cierra con el botón cian de la fila del avance (que ya enseña el preview en chiquito y el paso) y, al abrirse, baja el
 * editor en vez de taparlo. Si llega un paso nuevo con la cortina cerrada, el botón destella. Se recuerda abierta o cerrada. */
const GUARDA_PREVIEW = "max-editor-preview";
const preview = (() => {
  const P = { abierto: false, n: 0, url: "", ultimo: null, trabajo: null, mirando: false };
  try { P.abierto = !!JSON.parse(leerLocal(GUARDA_PREVIEW) || "{}").abierto; } catch { /* sin guardar: cerrada */ }
  const guardar = () => ponerLocal(GUARDA_PREVIEW, JSON.stringify({ abierto: P.abierto }));
  const medio = () => el("video", { autoplay: true, loop: true, muted: true, playsinline: true });
  const vid = medio(), img = el("img", { alt: "" });
  const miniVid = medio(), miniImg = el("img", { alt: "" });
  const visor = el("div", { class: "max-preview-visor" });
  const lado = el("div", { class: "max-preview-lado" });
  const caja = el("div", { class: "max-preview", "aria-hidden": "true" },
    el("div", { class: "max-preview-dentro" }, el("div", { class: "max-preview-cuerpo" }, visor, lado)));
  // el botón no se vuelve a crear al repintar el avance (cada 2 s): así su video chiquito no empieza de cero
  const mini = el("span", { class: "max-preview-mini" });
  const rotulo = el("span", { class: "max-preview-rotulo" });
  const paso = el("span", { class: "max-preview-k" });
  const boton = el("button", { class: "max-ver-preview", title: t("app.preview.tooltip"), onclick: () => alternar() },
    mini, rotulo, paso, el("span", { class: "max-preview-flecha" }, util.icono("abajo")));
  const kn = (u) => (u?.paso != null ? `${u.paso}/${u.total ?? "?"}` : "—");
  const poner = (pieza, url) => { if (pieza.getAttribute("src") !== url) pieza.setAttribute("src", url); return pieza; };
  function pintar() {
    const a = P.trabajo, u = P.ultimo, abierta = P.abierto && !!a;
    caja.classList.toggle("abierta", abierta);
    caja.setAttribute("aria-hidden", String(!abierta));
    boton.setAttribute("aria-expanded", String(abierta));
    boton.classList.toggle("sin", !u);
    rotulo.textContent = t(abierta ? "app.preview.ocultar" : "app.preview.ver");
    paso.textContent = kn(u);
    const video = u && /^video\//.test(u.mime);
    mini.replaceChildren(...(u ? [poner(video ? miniVid : miniImg, P.url)] : [util.icono("ojo")]));
    if (!a) return;
    if (!u) visor.replaceChildren(el("div", { class: "max-vacio" }, t((a.hace_s || 0) > 90 ? "app.preview.sin_datos" : "app.preview.esperando")));
    else { const pieza = poner(video ? vid : img, P.url); if (visor.firstChild !== pieza) visor.replaceChildren(pieza); }
    const total = u?.total || 0, hecho = u?.paso || 0;
    lado.replaceChildren(...[
      el("div", { class: "max-preview-tit" }, el("span", { class: "max-preview-punto" + (u ? "" : " quieto") }), el("b", {}, t("app.preview.titulo"))),
      total ? el("div", { class: "max-preview-pasos" }, ...Array.from({ length: total }, (_, i) => el("i", { class: i < hecho ? "si" : "" }))) : null,
      el("div", { class: "max-preview-info" },
        u?.paso != null ? el("span", {}, t("app.preview.paso", { k: u.paso, n: u.total ?? "?" })) : null,
        u?.ms_paso ? el("span", {}, t("app.preview.por_paso", { s: tr.num(u.ms_paso / 1000, 1) })) : null,
        u?.ms_paso && total > hecho ? el("span", {}, t("app.preview.faltan", { s: Math.round((total - hecho) * u.ms_paso / 1000) })) : null),
      el("p", { class: "epl-ayuda" }, t("app.preview.ayuda")),
      el("button", { class: "max-boton max-preview-recoger", onclick: () => alternar() }, util.icono("arriba"), " " + t("app.preview.recoger"))
    ].filter(Boolean));
  }
  function destellar() {
    boton.classList.remove("nuevo");
    void boton.offsetWidth;                    // vuelve a empezar la animación
    boton.classList.add("nuevo");
  }
  async function mirar() {
    if (P.mirando || !P.trabajo) return;
    P.mirando = true;
    try {
      const r = await pedir("/max_editor/preview?desde=" + P.n);
      /* solo lo de este trabajo (no el último de otro): el preview tiene menos edad que el trabajo. Las dos edades las mide el
       * servidor (ComfyUI y la app): con el reloj del navegador fallaba en un pod, que va en UTC (29 oct) */
      const lleva = P.trabajo?.hace_s ?? Infinity;
      if (!r.igual && r.datos && (r.edad_s ?? 0) <= lleva + 3) {
        const bin = Uint8Array.from(atob(r.datos), (c) => c.charCodeAt(0));
        if (P.url) URL.revokeObjectURL(P.url);
        P.url = URL.createObjectURL(new Blob([bin], { type: r.mime }));
        P.ultimo = { mime: r.mime, paso: r.paso, total: r.total, ms_paso: r.ms_paso };
        if (!P.abierto) destellar();
      }
      P.n = r.n || P.n;
    } catch { /* ComfyUI sin el nodo nuevo o sin reiniciar: se queda «esperando» */ }
    P.mirando = false;
    pintar();
  }
  // se mira aunque la cortina esté cerrada: el botón enseña el preview en chiquito
  setInterval(mirar, 1000);
  function alternar() { P.abierto = !P.abierto; guardar(); pintar(); mirar(); }
  return {
    caja, boton,
    // lo llama pintarAvance con el trabajo que corre (o null): un trabajo nuevo empieza sin preview
    ponerTrabajo(a) {
      if (a && a.id !== P.trabajo?.id) { P.ultimo = null; if (P.url) URL.revokeObjectURL(P.url); P.url = ""; }
      P.trabajo = a || null;
      pintar();
    },
  };
})();

// ---- la cabecera
const cab = el("div", { class: "max-cab" });
const filaCab = el("div", { class: "max-fila" });
const filaAvance = el("div", { class: "max-avance" });
// los videos: una ventana centrada; se cierra con Esc, con un clic fuera o con ✕
const panelVideos = el("div", { class: "max-videos", onclick: (e) => { if (e.target === panelVideos) cerrarVideos(); } });
const cajaVideos = el("div", { class: "max-videos-caja", role: "dialog", "aria-modal": "true" });
panelVideos.append(cajaVideos);
const cerrarVideos = () => { A.verVideos = false; pintarVideos(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && A.verVideos) { e.stopPropagation(); cerrarVideos(); } }, true);
cab.append(filaCab, filaAvance, preview.caja);
document.body.append(cab, panelVideos);
new ResizeObserver(() => document.documentElement.style.setProperty("--max-alto", cab.offsetHeight + "px")).observe(cab);

const avisar = (texto, tipo = "") => { A.aviso = [texto, tipo]; pintarCabecera(); };
const RUIDO = "RandomNoise";                              // el nodo de la semilla del video en la plantilla
const semillaW = () => campo(A.graph && nodoPorTipo(A.graph, RUIDO), "noise_seed");

function pintarCabecera() {
  document.documentElement.lang = tr.idioma;
  document.title = A.proyecto ? `${t("app.nombre")} · ${A.proyecto}` : t("app.nombre");
  const s = A.salud, punto = (k, clave) => el("span", { class: s[k] === undefined ? "" : s[k] ? "si" : "no",
    title: t(s[k] ? "app.salud.responde" : "app.salud.no_responde", { url: s[k + "_url"] || "" }) }, t(clave));
  const lista = el("select", { title: t("app.proyecto.abrir"), onchange: (e) => abrirProyecto(e.target.value) },
    ...A.proyectos.map((p) => el("option", { value: p.nombre, selected: p.nombre === A.proyecto },
      p.nombre === EJEMPLO ? t("app.proyecto.ejemplo_opcion", { nombre: p.nombre }) : p.nombre)));
  if (A.proyecto && !A.proyectos.some((p) => p.nombre === A.proyecto)) lista.prepend(el("option", { value: A.proyecto, selected: true }, A.proyecto));
  const w = semillaW();
  const semilla = el("input", { type: "number", min: 0, step: 1, value: w ? w.value : "", disabled: !w,
                                onchange: (e) => ponerSemilla(Math.max(0, Math.round(+e.target.value || 0))) });
  const activos = A.cola.trabajos.filter((x) => x.estado === "en_cola" || x.estado === "corriendo" || x.estado === "recuperando").length;
  // (28 oct) el botón dice siempre cuántos va a encolar: se pone al día al escribir el número (antes seguía diciendo ×3)
  const botonEncolar = el("button", { class: "max-boton", disabled: !A.node, onclick: () => generar(A.colaN) }, util.icono("mas"), " " + t("app.cola.encolar", { n: A.colaN }));
  const nCola = el("input", { type: "number", min: 1, max: 20, step: 1, value: A.colaN, class: "max-cola-n", "aria-label": t("app.cola.n"),
                              title: t("app.cola.n"), oninput: (e) => {
                                A.colaN = Math.max(1, Math.min(20, Math.round(+e.target.value || 1)));
                                botonEncolar.replaceChildren(util.icono("mas"), " " + t("app.cola.encolar", { n: A.colaN }));
                              } });
  const idioma = (i, texto) => el("button", { class: "max-boton" + (tr.idioma === i ? " fijo" : ""), onclick: () => cambiarIdioma(i) }, texto);
  filaCab.replaceChildren(
    el("span", { class: "max-nombre" }, t("app.nombre")),
    el("span", { class: "max-sep" }),
    el("span", { class: "max-grupo" }, el("span", { class: "max-aviso" }, t("app.proyecto.titulo")), lista,
      el("button", { class: "max-boton", title: t("app.proyecto.nuevo.tooltip"), onclick: (e) => pedirNombre(e.target, "nuevo") }, t("app.proyecto.nuevo")),
      el("button", { class: "max-boton", title: t("app.proyecto.guardar_como.tooltip"), onclick: (e) => pedirNombre(e.target, "como") }, t("app.proyecto.guardar_como"))),
    el("span", { class: "max-aviso " + A.aviso[1], title: A.aviso[0] }, A.aviso[0]),
    el("span", { class: "max-salud max-derecha", title: t("app.salud.tooltip") }, punto("comfyui", "app.salud.comfyui"),
      punto("proxy", "app.salud.proxy"), punto("llm", "app.salud.llm")),
    el("span", { class: "max-sep" }),
    el("label", { class: "max-grupo max-semilla", title: t("app.semilla.tooltip") }, el("span", {}, t("app.semilla")), semilla,
      el("button", { class: "max-boton", disabled: !w, title: t("app.semilla.otra.tooltip"), onclick: () => ponerSemilla(semillaNueva()) },
        util.icono("semilla"), " " + t("app.semilla.otra"))),
    el("button", { class: "max-generar", disabled: !A.node, title: t("app.generar.tooltip"), onclick: () => generar(1) }, t("app.generar")),
    el("span", { class: "max-grupo max-encolar", title: t("app.cola.encolar.tooltip") }, nCola, botonEncolar),
    el("button", { class: "max-boton max-boton-videos", title: t("app.videos.tooltip"), onclick: () => { A.verVideos = !A.verVideos; pintarVideos(); } },
      util.icono("video"), " " + t("app.videos.boton", { n: A.videos.length })),
    el("button", { class: "max-boton" + (activos ? " max-cola-activa" : ""), title: t("app.cola.tooltip"), onclick: () => { A.verCola = !A.verCola; pintarCola(); } },
      util.icono("menu"), " " + t("app.cola.boton", { n: activos })),
    el("span", { class: "max-grupo max-idioma", title: t("comun.idioma.tooltip") }, idioma("es", "ES"), idioma("en", "EN")));
  pintarAvance();
  pintarFases();
}

/* ---- la barra de fases: dos bloques a todo el ancho. «Tomas y referencias» cuenta tomas, referencias y conexiones (con
 * los puntos de color de cada referencia y cuántas secundarias no van en ninguna toma); «Retocar», los retoques hechos.
 * La activa es más ancha y dice «estás aquí»; la otra parte de la ventana se oculta (clase fase-… en .epl-cuerpo). */
const barraFases = el("nav", { class: "max-fases" });
function ponerFase(f) {
  A.fase = f;
  ponerLocal(GUARDA_FASE, f);
  pintarFases();
  if (f === "retocar") { retoque.pintar(); extension.pintar(); }
}
function pintarFases() {
  const ctx = A.ctx, cuerpo = document.querySelector(".epl-fondo .epl-cuerpo");
  barraFases.setAttribute("aria-label", t("app.fases.titulo"));
  if (!ctx || !cuerpo) return barraFases.replaceChildren();
  if (barraFases.parentNode !== cuerpo || cuerpo.firstChild !== barraFases) cuerpo.prepend(barraFases);
  cuerpo.classList.toggle("fase-tomas", A.fase === "tomas");
  cuerpo.classList.toggle("fase-retocar", A.fase === "retocar");
  const S = ctx.S, lista = ctx.wf.lista, n = S.plan.tomas.length;
  const conexiones = S.plan.tomas.reduce((x, _, i) => x + (ctx.refsDeToma?.(i + 1) || []).length, 0);
  const sinToma = lista.filter((r) => !ctx.enTodas?.(r.clave) && !S.plan.tomas.some((_, i) => (ctx.refsDeToma?.(i + 1) || []).includes(r.tag))).length;
  const retoques = A.videos.filter((x) => x.tipo === "retoque").length;
  const extensiones = A.videos.filter((x) => x.tipo === "extension").length;
  const bloque = (f, num, estado) => el("button", { class: "max-fase" + (A.fase === f ? " activa" : ""), "aria-current": A.fase === f ? "step" : null,
                                                    "data-fase": f, onclick: () => ponerFase(f) },
    el("span", { class: "max-fase-cab" }, el("span", { class: "max-fase-cara" }, t(`app.fases.cara_${f}`)), el("span", { class: "max-fase-num" }, num), el("span", { class: "max-fase-nombre" }, t(`app.fases.${f}`)),
      A.fase === f ? el("span", { class: "max-fase-aqui" }, t("app.fases.aqui")) : null),
    el("span", { class: "max-fase-estado" }, ...estado));
  barraFases.replaceChildren(
    bloque("tomas", "1", [el("span", {}, t("app.fases.estado_tomas", { n, r: lista.length, c: conexiones })),
      el("span", { class: "max-fase-puntos" }, ...lista.map((r) => ctx.punto ? ctx.punto(r.tag) : null)),
      sinToma ? el("span", { class: "max-fase-aviso" }, t("app.fases.sin_toma", { n: sinToma })) : null]),
    bloque("retocar", "2", [el("span", {}, t("app.fases.retoques", { n: retoques })),
      extensiones ? el("span", {}, t("app.fases.extensiones", { n: extensiones })) : null]));
}

async function cambiarIdioma(i) {
  if (A.ctx?.idioma) await A.ctx.idioma.cambiar(i);        // la ventana cambia el ajuste (ajustes.set) y se vuelve a pintar
  else ajustes.set(i18n.AJUSTE, i);
  pintarVideos();
  retoque.pintar();
}

// ---- pedir un nombre (nuevo proyecto o guardar como): una cajita debajo del botón, sin diálogos del navegador
function pedirNombre(boton, modo) {
  A.pop?.remove();
  const entrada = el("input", { placeholder: t("app.proyecto.nombre.placeholder"), value: modo === "como" ? A.proyecto + " 2" : "" });
  const listo = async () => {
    const nombre = entrada.value.trim();
    if (!nombre) return;
    try {
      if (modo === "nuevo") await crearProyecto(nombre);
      else await guardarComo(nombre);
      cerrar();
    } catch (e) { aviso.textContent = e.message; }
  };
  const aviso = el("span", { class: "max-aviso mal" });
  const cerrar = () => { pop.remove(); A.pop = null; };
  const pop = el("div", { class: "max-pop" }, el("span", {}, t(modo === "nuevo" ? "app.proyecto.nuevo.titulo" : "app.proyecto.guardar_como.titulo")),
    entrada, el("button", { class: "max-boton", onclick: listo }, t("app.proyecto.crear")),
    el("button", { class: "max-boton", onclick: cerrar }, t("app.proyecto.cancelar")), aviso);
  entrada.addEventListener("keydown", (e) => { if (e.key === "Enter") listo(); if (e.key === "Escape") cerrar(); });
  const r = boton.getBoundingClientRect();
  Object.assign(pop.style, { left: Math.min(r.left, innerWidth - 520) + "px", top: r.bottom + 6 + "px" });
  document.body.append(pop);
  A.pop = pop;
  entrada.focus();
  entrada.select();
}

// ---- proyectos
async function cargarProyectos() {
  A.proyectos = await pedir("/app/proyectos");
}

async function guardarProyecto(nombre = A.proyecto, nuevo = false, forzar = false) {
  if (!A.graph || !nombre) return;
  const valores = valoresDe(A.graph, A.plantilla), texto = JSON.stringify(valores);
  const propio = !nuevo && nombre === A.proyecto;
  if (propio && texto === A.guardadoJSON && !forzar) { A.sucio = false; return; }   // nada nuevo que escribir
  if (propio && A.recargando) return;                    // se está cargando lo del agente: lo de aquí ya no vale
  // con base_rev el servidor no pisa lo que el agente escribió después de abrirlo: responde 409 y aquí se carga lo suyo
  const r = await fetch(`/app/proyecto/${encodeURIComponent(nombre)}?idioma=${tr.idioma}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valores, nuevo, ...(propio ? { base_rev: A.rev, agente: { marcas: A.marcas } } : {}) }) });
  const j = await r.json().catch(() => ({ error: t("errores.respuesta_no_valida", { estado: r.status }) }));
  if (r.status === 409 && j.clave === "app.error.conflicto") { await recargarProyecto(); return; }
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  if (propio || nombre === A.proyecto) { A.guardadoJSON = texto; A.rev = j.rev ?? A.rev; A.sucio = false; }
  // un aviso importante (p. ej. «Prompt retomado») no lo tapa el «guardado» del autoguardado que llega justo después
  if (Date.now() > (A.avisoFijo || 0)) avisar(t("app.proyecto.guardado", { nombre, hora: new Date().toLocaleTimeString(tr.locale) }), "bien");
  return j;
}

async function abrirProyecto(nombre, valores = null, recargar = false) {
  if (nombre === EJEMPLO) return abrirEjemplo();
  try {
    if (A.ctx && !recargar) await A.ctx.guardarYa();      // lo último del proyecto que se deja (al recargar, no: lo nuevo manda)
    const doc = await pedir("/app/proyecto/" + encodeURIComponent(nombre));
    if (valores === null) valores = doc.valores || {};
    A.rev = doc.rev || 0;
    A.marcas = doc.agente?.marcas || [];
    A.sucio = false;
    A.proyecto = nombre;
    ponerLocal(GUARDA_PROYECTO, nombre);
    A.graph = construir(A.plantilla, valores);
    A.guardadoJSON = JSON.stringify(valoresDe(A.graph, A.plantilla));
    A.node = nodoDelEdit(A.graph);
    appFalso.graph = A.graph;
    if (!A.node) throw new Error(t("app.error.sin_nodo"));
    A.ctx = await core.abrir(A.node, appFalso);
    // el autoguardado de la ventana (2 s después del último cambio) termina guardando el proyecto
    const guardarVentana = A.ctx.guardarYa;
    const ctx = A.ctx;
    ctx.guardarYa = () => guardarVentana().then(() => ctx === A.ctx && guardarProyecto())
      .catch((e) => avisar(t("app.proyecto.error_guardar", { error: e.message }), "mal"));
    // cualquier cambio en la ventana deja el proyecto «sucio» hasta que se guarda: entonces no se recarga solo (mirarRev)
    const programar = ctx.programarGuardado;
    ctx.programarGuardado = () => { if (ctx === A.ctx) A.sucio = true; return programar(); };
    ctx.alMontar = () => { if (ctx === A.ctx) pintarFases(); };
    document.getElementById("cargando")?.remove();
    if (!recargar) avisar(t("app.proyecto.abierto", { nombre }), "bien");
    pintarAgente();
    await cargarVideos();
    retoque.colocar();                                    // debajo de «Prompt final», en la ventana nueva
    extension.colocar();                                  // sus pestañas (antes) y «Extender video» (después)
    pintarFases();                                        // la barra de fases, arriba del todo de la ventana
    await retoque.alAbrirProyecto();
    await extension.alAbrirProyecto();
  } catch (e) {
    avisar(t("app.proyecto.error_abrir", { nombre, error: e.message }), "mal");
  }
}

// el ejemplo se abre como plantilla: una copia nueva con nombre libre («mi ejemplo», «mi ejemplo 2»…); el original no se toca
async function abrirEjemplo() {
  try {
    if (A.ctx) await A.ctx.guardarYa();
    const valores = (await pedir("/app/proyecto/" + EJEMPLO)).valores || {};
    const base = t("app.proyecto.copia_ejemplo"), usados = new Set(A.proyectos.map((p) => p.nombre));
    let nombre = base;
    for (let i = 2; usados.has(nombre); i++) nombre = `${base} ${i}`;
    await pedir("/app/proyecto/" + encodeURIComponent(nombre), { valores, nuevo: true });
    await cargarProyectos();
    await abrirProyecto(nombre, valores);
    avisar(t("app.proyecto.ejemplo_copiado", { nombre }), "bien");
  } catch (e) {
    avisar(t("app.proyecto.error_abrir", { nombre: EJEMPLO, error: e.message }), "mal");
    pintarCabecera();
  }
}

async function crearProyecto(nombre) {
  if (A.ctx) await A.ctx.guardarYa();
  const g = construir(A.plantilla, {});
  await pedir("/app/proyecto/" + encodeURIComponent(nombre), { valores: valoresDe(g, A.plantilla), nuevo: true });
  await cargarProyectos();
  await abrirProyecto(nombre, {});
}

async function guardarComo(nombre) {
  if (A.ctx) await A.ctx.guardarYa();
  const valores = valoresDe(A.graph, A.plantilla);
  await pedir("/app/proyecto/" + encodeURIComponent(nombre), { valores, nuevo: true });
  await cargarProyectos();
  A.proyecto = nombre;
  A.guardadoJSON = JSON.stringify(valores);
  ponerLocal(GUARDA_PROYECTO, nombre);
  avisar(t("app.proyecto.guardado", { nombre, hora: new Date().toLocaleTimeString(tr.locale) }), "bien");
  await cargarVideos();
}

// ---- semilla del video (el noise_seed del RandomNoise de la plantilla)
const semillaNueva = () => Math.floor(Math.random() * 2 ** 32);
function ponerSemilla(x) {
  const w = semillaW();
  if (!w) return;
  w.value = x;
  pintarCabecera();
  guardarProyecto().catch((e) => avisar(t("app.proyecto.error_guardar", { error: e.message }), "mal"));
}

// ---- salud: ComfyUI, el proxy y el LLM
async function mirarSalud() {
  try { A.salud = await pedir("/app/salud"); } catch { A.salud = { comfyui: false, proxy: false, llm: false }; }
  pintarCabecera();
}

// ---- generar: se encola (1 con la semilla de ahora, o n con semillas aleatorias); el servidor los hace de uno en uno
async function generar(n = 1) {
  if (!A.ctx) return;
  const fallo = (texto) => avisar(texto, "mal");
  try {
    await A.ctx.guardarYa();                              // el prompt y los campos, al día en el grafo y en el proyecto
    const estado = util.leerJSON(campo(A.node, "estado")?.value, {});
    if (!(estado.prompt || "").trim()) return fallo(t("app.generar.sin_prompt"));
    await mirarSalud();
    if (!A.salud.generar) return fallo(t("app.error.sin_generar"));
    const w = semillaW();
    const r = await pedir("/app/cola", { tipo: "generar", valores: valoresDe(A.graph), semilla: w ? +w.value : null, proyecto: A.proyecto, n });
    avisar(t(r.ids.length > 1 ? "app.cola.encolados" : "app.cola.encolado", { n: r.ids.length }), "bien");
    await mirarCola();
  } catch (e) { fallo(e.message); }
}

/* ---- la cola: se mira cada 2 s. La fila de avance enseña el que corre; al terminar uno de este proyecto se ponen al día
 * sus videos (y Retocar, si era un retoque suyo). Aviso opcional (sonido o notificación del navegador) al terminar. */
const GUARDA_AVISOS = "max-editor-avisos";
const avisosOn = () => leerLocal(GUARDA_AVISOS) === "1";
function sonar() {
  try {
    const c = new AudioContext(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.08, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.36);
  } catch { /* sin audio */ }
}
function avisarFin(x, todos) {
  if (!avisosOn()) return;
  sonar();
  try {
    if (window.Notification?.permission === "granted") new Notification(t("app.nombre"), {
      body: t(todos ? "app.cola.aviso.todo" : x.estado === "hecho" ? "app.cola.aviso.hecho" : "app.cola.aviso.error",
              { tipo: t(`app.cola.tipo.${x.tipo}`), proyecto: x.proyecto || "—" }) });
  } catch { /* sin notificaciones */ }
}
async function mirarCola() {
  try { A.cola = await pedir("/app/cola"); } catch { return; }
  let algunoHecho = false;
  for (const x of A.cola.trabajos) {
    const antes = A.colaVista[x.id];
    if (antes && antes !== x.estado && ["hecho", "error"].includes(x.estado) && ["en_cola", "corriendo", "recuperando"].includes(antes)) {
      algunoHecho = true;
      const quedan = A.cola.trabajos.some((y) => ["en_cola", "corriendo", "recuperando"].includes(y.estado));
      avisarFin(x, !quedan);
      if (x.estado === "hecho" && x.proyecto === A.proyecto) avisar(t("app.cola.terminado", { tipo: t(`app.cola.tipo.${x.tipo}`) }), "bien");
    }
    A.colaVista[x.id] = x.estado;
  }
  if (algunoHecho) await cargarVideos();
  pintarCabecera();
  pintarCola();
  retoque.alCambiarCola?.(A.cola);
  extension.alCambiarCola?.(A.cola);
}

function pintarAvance() {
  const a = A.cola.trabajos.find((x) => x.estado === "corriendo" || x.estado === "recuperando");
  const quedan = A.cola.trabajos.filter((x) => x.estado === "en_cola").length;
  filaAvance.className = "max-avance" + (a ? " ver" : "");
  preview.ponerTrabajo(a && a.tipo === "generar" ? a : null);
  if (!a) return filaAvance.replaceChildren();
  const seg = tr.num(a.segundos || 0, 0);
  const texto = t("app.cola.corriendo", { tipo: t(`app.cola.tipo.${a.tipo}`), proyecto: a.proyecto || "—", semilla: a.semilla ?? "?",
                                           p: Math.round((a.avance || 0) * 100), s: seg, quedan });
  const barra = el("div", { class: "max-barra" }, el("b", { style: { width: Math.round((a.avance || 0) * 100) + "%" } }));
  filaAvance.replaceChildren(el("span", { class: "max-texto", title: a.mensaje || "" }, texto), barra,
    a.tipo === "generar" ? preview.boton : null,
    el("button", { class: "max-boton", onclick: () => colaAccion(a.id, "cancelar") }, t("app.avance.cancelar")),
    el("button", { class: "max-boton", onclick: () => { A.verCola = true; pintarCola(); } }, t("app.cola.ver")));
}
const colaAccion = (id, que) => pedir(`/app/cola/${id}/${que}`, {}).then(mirarCola).catch((e) => avisar(e.message, "mal"));

// ---- el panel «Cola»: una ventana centrada, como la de los videos
const panelCola = el("div", { class: "max-videos max-cola", onclick: (e) => { if (e.target === panelCola) cerrarCola(); } });
const cajaCola = el("div", { class: "max-videos-caja max-cola-caja", role: "dialog", "aria-modal": "true" });
panelCola.append(cajaCola);
document.body.append(panelCola);
const cerrarCola = () => { A.verCola = false; pintarCola(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && A.verCola) { e.stopPropagation(); cerrarCola(); } }, true);
function pintarCola() {
  panelCola.className = "max-videos max-cola" + (A.verCola ? " ver" : "");
  if (!A.verCola) return;
  cajaCola.setAttribute("aria-label", t("app.cola.titulo"));
  const hora = (x) => (x.terminado || x.empezado || x.creado || "").slice(11, 16);
  const pendientes = A.cola.trabajos.filter((x) => x.estado === "en_cola");
  const fila = (x) => {
    const pos = pendientes.indexOf(x);
    const b = (que, clave, ic, extra = {}) => el("button", { class: "max-boton max-cola-b", title: t(clave), "aria-label": t(clave),
                                                             onclick: () => colaAccion(x.id, que), ...extra }, util.icono(ic));
    const tramo = x.tramo ? (x.tramo.n != null ? t("app.cola.tramo_f", { a: x.tramo.f0, n: x.tramo.n }) : "") : "";
    return el("div", { class: "max-cola-fila e-" + x.estado, "data-id": x.id },
      util.icono(x.tipo === "retocar" ? "retoque" : "video"),
      el("div", { class: "max-cola-que" }, el("b", {}, t(`app.cola.tipo.${x.tipo}`) + " · " + (x.proyecto || "—"),
        x.origen === "agente" ? el("span", { class: "max-ag-sello", title: t("app.agente.cola.tooltip") }, t("app.agente.marca")) : null),
        el("small", {}, [t("app.cola.semilla", { semilla: x.semilla ?? "?" }), tramo, hora(x)].filter(Boolean).join(" · "))),
      el("span", { class: "max-cola-estado", title: x.mensaje || "" },
        t(`app.cola.estado.${x.estado}`, { p: Math.round((x.avance || 0) * 100) })),
      el("span", { class: "max-cola-acciones" },
        x.estado === "en_cola" ? b("subir", "app.cola.subir", "arriba", { disabled: pos <= 0 }) : null,
        x.estado === "en_cola" ? b("bajar", "app.cola.bajar", "abajo", { disabled: pos < 0 || pos >= pendientes.length - 1 }) : null,
        ["en_cola", "corriendo"].includes(x.estado) ? b("cancelar", "app.cola.cancelar", "x") : null,
        ["error", "cancelado", "interrumpido"].includes(x.estado) ? b("reintentar", "app.cola.reintentar", "rehacer") : null,
        x.estado === "hecho" && x.video ? el("button", { class: "max-boton", title: t("app.cola.ver_video.tooltip"), onclick: () => verVideoDeCola(x) },
          util.icono("play"), " " + t("app.cola.ver_video")) : null,
        ["hecho", "error", "cancelado", "interrumpido"].includes(x.estado) ? b("quitar", "app.cola.quitar", "x") : null));
  };
  const avisos = el("label", { class: "max-cola-avisos", title: t("app.cola.avisos.tooltip") },
    el("input", { type: "checkbox", checked: avisosOn(), onchange: (e) => {
      ponerLocal(GUARDA_AVISOS, e.target.checked ? "1" : "0");
      if (e.target.checked && window.Notification && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    } }), " " + t("app.cola.avisos"));
  cajaCola.replaceChildren(
    el("div", { class: "max-fila" }, el("b", {}, t("app.cola.titulo")),
      el("span", { class: "max-aviso" }, t(A.cola.pausada ? "app.cola.pausada" : "app.cola.activa")),
      el("button", { class: "max-boton max-derecha", onclick: () => pedir("/app/cola/pausar", { pausada: !A.cola.pausada }).then(mirarCola) },
        util.icono(A.cola.pausada ? "play" : "pausa"), " " + t(A.cola.pausada ? "app.cola.reanudar" : "app.cola.pausar")),
      el("button", { class: "max-boton", onclick: () => pedir("/app/cola/limpiar", {}).then(mirarCola) }, t("app.cola.limpiar")),
      el("button", { class: "max-boton max-cerrar", title: t("comun.cerrar"), "aria-label": t("comun.cerrar"), onclick: cerrarCola }, util.icono("x"))),
    el("div", { class: "max-fila" }, el("small", {}, t("app.cola.ayuda")), avisos),
    el("div", { class: "max-lista max-cola-lista" }, A.cola.trabajos.length ? ordenCola().map(fila)
      : el("div", { class: "max-vacio" }, t("app.cola.vacia"))));
}
// en el orden en que se harán: lo que corre, lo que espera (el siguiente arriba) y lo terminado, lo último primero
const ordenCola = () => {
  const ts = A.cola.trabajos, de = (...e) => ts.filter((x) => e.includes(x.estado));
  return [...de("corriendo", "recuperando"), ...de("en_cola"), ...de("hecho", "error", "cancelado", "interrumpido").reverse()];
};
// un trabajo hecho: su video en «Videos» (si es de otro proyecto, se abre el archivo)
async function verVideoDeCola(x) {
  if (x.proyecto !== A.proyecto) return window.open("/app/salidas/" + encodeURIComponent(x.video), "_blank");
  await cargarVideos();
  A.videoActual = x.video;
  A.verCola = false; pintarCola();
  A.verVideos = true; pintarVideos();
}

// ---- los videos del proyecto (app/salidas, historial de generar.py)
async function cargarVideos() {
  try { A.videos = await pedir("/app/videos?proyecto=" + encodeURIComponent(A.proyecto)); } catch { A.videos = []; }
  if (!A.videos.some((x) => x.archivo === A.videoActual)) A.videoActual = A.videos[0]?.archivo || "";
  pintarCabecera();
  pintarVideos();
}

/* un solo reproductor (28 oct): cambia de archivo en vez de crearse de nuevo. Antes cada clic dejaba un <video> viejo
 * descargando; con los de Retocar y Extender se llenaban las ~6 conexiones del navegador y el nuevo se quedaba trabado */
const reproductor = el("video", { controls: true, autoplay: true, loop: true, playsinline: true });
function soltarVideo() { reproductor.pause(); reproductor.removeAttribute("src"); reproductor.load(); }
function ponerVideo(archivo) {
  const src = "/app/salidas/" + encodeURIComponent(archivo);
  if (reproductor.getAttribute("src") !== src) { reproductor.pause(); reproductor.setAttribute("src", src); reproductor.load(); reproductor.play().catch(() => {}); }
  return reproductor;
}
/* (29 oct, a petición del usuario) la ventana es grande y en dos columnas: a la izquierda el video elegido, su información y
 * sus acciones en botones grandes (Retomar prompt · Retocar · Extender); a la derecha la lista. «Retomar prompt» carga los
 * valores con que se generó ese video (o, en un retoque, extensión o mejora, los de su Generar de origen: prompt_de) en este
 * proyecto (reemplaza lo de ahora, tras confirmarlo) o en una copia nueva, y pone su semilla */
const ICONO_VIDEO = { retoque: "retoque", extension: "tomas", mejora: "grande", retomar: "texto" };   // tipo o acción → util.icono
function describirVideo(x) {
  return x.tipo === "retoque" ? t("app.videos.retoque", { a: tr.num(x.tramo?.inicio ?? 0, 2), b: tr.num(x.tramo?.fin ?? 0, 2) })
    : x.tipo === "extension" ? t("app.videos.extension", { s: tr.num((x.extension?.nuevos || 0) / 24, 2), semilla: x.semilla ?? "?" })
    : x.tipo === "mejora" ? t("app.videos.mejora", { que: [x.superres ? "×" + tr.num(x.superres.escala, x.superres.escala % 1 ? 1 : 0) : "",
                                                           x.hdr ? t("app.retocar.mejorar.hdr") : ""].filter(Boolean).join(" · ") })
    : t("app.videos.semilla", { semilla: x.semilla ?? "?" });
}
async function retomarPrompt(x, donde) {
  try {
    const d = await pedir("/app/valores_video?video=" + encodeURIComponent(x.archivo));
    A.retomar = null;
    A.verVideos = false;
    pintarVideos();
    let nombre = A.proyecto;
    if (donde === "copia") {
      const base = t("app.videos.retomar.nombre_copia", { proyecto: A.proyecto }), usados = new Set(A.proyectos.map((p) => p.nombre));
      nombre = base;
      for (let i = 2; usados.has(nombre); i++) nombre = `${base} ${i}`;
      await pedir("/app/proyecto/" + encodeURIComponent(nombre), { valores: d.valores, nuevo: true });
      await cargarProyectos();
    }
    await abrirProyecto(nombre, d.valores);
    const w = semillaW();                                 // la semilla del video (con «+ Cola ×N» no es la del campo)
    if (w && d.semilla != null && d.semilla !== "") w.value = +d.semilla;
    await guardarProyecto(nombre, false, true);          // lo retomado ya es el proyecto (también en disco)
    ponerFase("tomas");
    avisar(t(donde === "copia" ? "app.videos.retomar.hecho_copia" : "app.videos.retomar.hecho",
             { fecha: (d.fecha || "").replace("T", " ").slice(0, 16), semilla: d.semilla ?? "?", proyecto: nombre }), "bien");
    A.avisoFijo = Date.now() + 8000;
  } catch (e) { avisar(t("app.videos.retomar.error", { error: e.message }), "mal"); }
}
function pintarVideos() {
  panelVideos.className = "max-videos" + (A.verVideos ? " ver" : "");
  if (!A.verVideos) { A.retomar = null; soltarVideo(); return cajaVideos.replaceChildren(); }   // cerrada: fuera el reproductor
  cajaVideos.setAttribute("aria-label", t("app.videos.titulo", { proyecto: A.proyecto }));
  const actual = A.videos.find((x) => x.archivo === A.videoActual);
  const fecha = (x) => (x.fecha || "").replace("T", " ");
  if (!actual) soltarVideo();
  const ir = (x, accion) => (e) => {
    e.stopPropagation();
    A.verVideos = false;
    pintarVideos();
    ponerFase("retocar");
    if (accion === "retocar") { extension.verInpaint(); retoque.cargar(x.archivo).then(retoque.ver); }
    else extension.cargar(x.archivo).then(extension.ver);
  };
  const grande = (clase, clave, tooltip, accion, ic, extra = {}) => el("button", { class: "max-boton max-vid-accion " + clase, title: t(tooltip), onclick: accion, ...extra },
    util.icono(ic), " " + t(clave));
  const acciones = !actual ? null : A.retomar === actual.archivo
    ? el("div", { class: "max-vid-confirmar", role: "group" },
        el("b", {}, t("app.videos.retomar.donde")),
        grande("max-vid-retomar", "app.videos.retomar.aqui", "app.videos.retomar.aqui.tooltip", () => retomarPrompt(actual, "aqui"), "check"),
        grande("", "app.videos.retomar.copia", "app.videos.retomar.copia.tooltip", () => retomarPrompt(actual, "copia"), "mas"),
        el("button", { class: "max-boton max-vid-accion", onclick: () => { A.retomar = null; pintarVideos(); } }, t("app.proyecto.cancelar")))
    : el("div", { class: "max-vid-acciones" },
        grande("max-vid-retomar", "app.videos.retomar", "app.videos.retomar.tooltip", () => { A.retomar = actual.archivo; pintarVideos(); }, ICONO_VIDEO.retomar,
               actual.prompt_de ? {} : { disabled: true, title: t("app.videos.retomar.sin") }),
        grande("", "app.videos.retocar", "app.videos.retocar.tooltip", ir(actual, "retocar"), ICONO_VIDEO.retoque),
        grande("", "app.videos.extender", "app.videos.extender.tooltip", ir(actual, "extender"), ICONO_VIDEO.extension));
  const origen = actual?.prompt_de && actual.prompt_de !== actual.archivo ? el("small", { class: "max-vid-origen" }, t("app.videos.retomar.origen")) : null;
  cajaVideos.replaceChildren(...[       // sin los null (replaceChildren escribiría «null»)
    el("div", { class: "max-fila max-vid-cab" }, util.icono("video"), el("b", {}, t("app.videos.titulo", { proyecto: A.proyecto })),
      el("span", { class: "max-vid-cuenta" }, t("app.videos.cuenta", { n: A.videos.length })),
      el("button", { class: "max-boton max-derecha max-vid-accion", title: t("app.videos.carpeta.tooltip"),
                     onclick: () => pedir("/app/abrir_carpeta", {}).catch((e) => avisar(e.message, "mal")) }, t("app.videos.carpeta")),
      el("button", { class: "max-boton max-cerrar", title: t("comun.cerrar"), "aria-label": t("comun.cerrar"), onclick: cerrarVideos }, util.icono("x"))),
    A.videos.length ? el("div", { class: "max-vid-cuerpo" },
      el("div", { class: "max-vid-izq" }, ...[actual ? ponerVideo(actual.archivo) : null,
        actual ? el("div", { class: "max-vid-info" }, el("b", {}, describirVideo(actual)),
                    el("span", {}, t(actual.semilla == null ? "app.videos.info_sin_semilla" : "app.videos.info",
                                     { fecha: fecha(actual), semilla: actual.semilla, s: tr.num(actual.segundos || 0, 0) }))) : null,
        acciones, origen].filter(Boolean)),
      el("div", { class: "max-lista" }, A.videos.map((x) =>
        el("button", { class: "max-video" + (x.archivo === A.videoActual ? " actual" : ""), "aria-pressed": String(x.archivo === A.videoActual),
                       onclick: () => { A.videoActual = x.archivo; A.retomar = null; pintarVideos(); } },
          util.icono(ICONO_VIDEO[x.tipo] || "video"),
          el("span", { class: "max-video-txt" }, el("span", {}, fecha(x)), el("small", {}, describirVideo(x))),
          x.prompt_de ? el("span", { class: "max-video-prompt", title: t("app.videos.retomar.hay") }, util.icono(ICONO_VIDEO.retomar)) : null))))
      : el("div", { class: "max-vacio" }, t("app.videos.vacio"))].filter(Boolean));
}

/* ---- el agente (MCP, planos/fases/11 MCP.md): un agente cambia el MISMO proyecto por el servidor y aquí se ve.
 *   - Cada 2 s se mira la rev del proyecto. Si subió y aquí no hay nada a medio guardar (ni se está escribiendo en un campo),
 *     se recarga solo, sin perder la toma elegida ni el scroll. Lo del agente manda siempre (29 oct, Jonathan: «yo di la
 *     orden de modificarlo»): aunque aquí haya cambios sin guardar, se carga lo suyo y solo sale el aviso de que lo cambió.
 *     Si se está escribiendo en un campo, se espera a que lo deje.
 *   - Lo que tocó el agente lleva «✎ agente» (proyecto.agente.marcas) hasta que el usuario lo edita o pulsa «visto». */
let mirandoRev = false;
async function mirarRev() {
  if (!A.proyecto || !A.ctx || mirandoRev) return;
  mirandoRev = true;
  try {
    const r = await pedir("/app/proyecto_rev/" + encodeURIComponent(A.proyecto));
    if (r.rev <= A.rev) return;
    const activo = document.activeElement, escribiendo = activo && activo.closest?.(".epl-fondo") &&
      (activo.matches("input, textarea, select") || activo.isContentEditable);
    if (escribiendo) return;                                 // se recarga cuando deje el campo (en la siguiente vuelta)
    await recargarProyecto(r.autor);
  } catch { /* sin servidor: ya avisa la salud */ } finally { mirandoRev = false; }
}
// una sola recarga a la vez: dos abrirProyecto juntos montaban dos editores, uno detrás del otro (29 oct)
function recargarProyecto(autor = "agente") {
  if (!A.recargando) A.recargando = recargar(autor).finally(() => { A.recargando = null; });
  return A.recargando;
}
async function recargar(autor) {
  const cuerpo = document.querySelector(".epl-fondo .epl-cuerpo");
  const scroll = [window.scrollX, window.scrollY, cuerpo?.scrollTop || 0];
  await abrirProyecto(A.proyecto, null, true);
  window.scrollTo(scroll[0], scroll[1]);
  const nuevo = document.querySelector(".epl-fondo .epl-cuerpo");
  if (nuevo) nuevo.scrollTop = scroll[2];
  avisar(t(autor === "agente" ? "app.agente.recargado" : "app.agente.recargado_otro"), "bien");
}

// el aviso del agente, en la cabecera: «✎ agente · N cambios · visto» y, si chocan, las dos opciones
const avisoAgente = el("div", { class: "max-ag-aviso" });
cab.append(avisoAgente);
function pintarAgente() {
  const n = A.marcas.length;
  avisoAgente.className = "max-ag-aviso" + (n ? " ver" : "");
  if (n) {
    avisoAgente.replaceChildren(el("span", { class: "max-ag-sello" }, t("app.agente.marca")),
      el("span", { title: t("app.agente.cambios.tooltip") }, t("app.agente.cambios", { n })),
      el("button", { class: "max-boton", title: t("app.agente.visto.tooltip"), onclick: () => quitarMarcas(() => true) }, t("app.agente.visto")));
  } else avisoAgente.replaceChildren();
  pintarMarcas();
}

// dónde se ve cada marca: la toma en la línea de tiempo y su campo en el panel (si está elegida), el póster de la referencia…
const ZONAS = { resolucion: ".epl-resolucion", semilla: ".max-semilla", cancion: ".epl-audio", duracion: ".epl-zona-tomas",
                sonido: '[data-campo="sonido"]', texto: ".epl-texto" };
const CITAS = ".epl-citas";                                 // las referencias de la toma, en su panel
function nodosDe(m) {
  const S = A.ctx?.S;
  if (m.zona === "toma") {
    const out = [document.getElementById(`epl-tomab-${m.toma}`)];
    const panel = document.querySelector(".epl-s-toma");
    if (panel && S?.elegida === m.toma && m.campo) out.push(...panel.querySelectorAll(m.campo === "referencias" ? CITAS : `[data-campo="${m.campo}"]`));
    return out.filter(Boolean);
  }
  if (m.zona === "referencia") return [...document.querySelectorAll(".epl-poster")].filter((p) => p.dataset.clave === m.ref);
  return ZONAS[m.zona] ? [...document.querySelectorAll(ZONAS[m.zona])] : [];
}
let pintandoMarcas = false;
function pintarMarcas() {
  if (pintandoMarcas) return;
  pintandoMarcas = true;
  for (const x of document.querySelectorAll(".max-ag")) { x.classList.remove("max-ag"); delete x.dataset.ag; }
  for (const m of A.marcas) for (const x of nodosDe(m)) { x.classList.add("max-ag"); x.dataset.ag = t("app.agente.marca"); }
  pintandoMarcas = false;
}
// la ventana se vuelve a pintar a trozos: las marcas se ponen de nuevo en el siguiente fotograma
let marcasPendientes = false;
new MutationObserver(() => {
  if (pintandoMarcas || marcasPendientes || !A.marcas.length) return;
  marcasPendientes = true;
  requestAnimationFrame(() => { marcasPendientes = false; pintarMarcas(); });
}).observe(document.body, { childList: true, subtree: true });

// el usuario edita algo marcado: esa marca se quita (y se guarda con el proyecto)
function quitarMarcas(cual) {
  const antes = A.marcas.length;
  A.marcas = A.marcas.filter((m) => !cual(m));
  if (A.marcas.length === antes) return;
  pintarAgente();
  guardarProyecto(A.proyecto, false, true).catch((e) => avisar(t("app.proyecto.error_guardar", { error: e.message }), "mal"));
}
const alEditar = (e) => {
  const x = e.target;
  if (!A.marcas.length || !x?.closest) return;
  const S = A.ctx?.S, campo = x.closest("[data-campo]")?.dataset.campo, enToma = x.closest(".epl-s-toma");
  quitarMarcas((m) => (enToma && m.zona === "toma" && m.toma === S?.elegida && (m.campo === campo || (m.campo === "referencias" && !campo)))
    || (m.zona === "referencia" && x.closest(".epl-poster")?.dataset.clave === m.ref)
    || Object.entries(ZONAS).some(([z, sel]) => m.zona === z && x.closest(sel)));
};
document.addEventListener("change", alEditar, true);
document.addEventListener("input", (e) => { if (e.target?.closest?.(".max-ag")) alEditar(e); }, true);

// el aspecto (con los colores del tema casete si está; si no, los suyos): la marca es un borde discontinuo rosa con su rótulo
document.head.append(el("style", { id: "max-agente-css" }, `
.max-ag{outline:2px dashed var(--k-rosa,#ff3e8a)!important;outline-offset:2px;position:relative}
.max-ag:not(input):not(textarea):not(select)::after{content:attr(data-ag);position:absolute;top:-.85em;right:.3em;z-index:5;
  padding:0 .45em;border-radius:.6em;background:var(--k-rosa,#ff3e8a);color:#fff;font:600 11px/1.5 var(--k-mano,inherit);
  pointer-events:none;white-space:nowrap}
.max-ag-sello{display:inline-block;margin:0 .4em;padding:0 .5em;border-radius:.7em;background:var(--k-rosa,#ff3e8a);color:#fff;
  font:600 12px/1.6 var(--k-mano,inherit);white-space:nowrap}
.max-ag-aviso{display:none;align-items:center;gap:.6em;padding:.25em .8em;font-size:13px}
.max-ag-aviso.ver{display:flex}
.max-ag-aviso.choque{background:color-mix(in srgb,var(--k-rosa,#ff3e8a) 22%,transparent)}`));

// ---- arrancar: plantilla, proyectos y el último proyecto abierto (o el ejemplo)
pintarCabecera();
try {
  A.plantilla = await pedir("/app/plantilla");
  await cargarProyectos();
  const ultimo = leerLocal(GUARDA_PROYECTO);
  const nombre = A.proyectos.some((p) => p.nombre === ultimo) ? ultimo
    : A.proyectos.some((p) => p.nombre === "ejemplo") ? "ejemplo" : A.proyectos[0]?.nombre;
  if (nombre) await abrirProyecto(nombre);
  else await crearProyecto(t("app.proyecto.primero"));
} catch (e) {
  avisar(t("app.error.arrancar", { error: e.message }), "mal");
}
mirarSalud();
setInterval(mirarSalud, 10000);
mirarCola();
setInterval(mirarCola, 2000);
setInterval(mirarRev, 2000);
addEventListener("beforeunload", () => { A.ctx?.guardarYa(); });
window.maxEditor = A;                                    // para probar desde la consola
window.maxRetoque = retoque;
