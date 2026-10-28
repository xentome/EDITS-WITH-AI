/* MAX EDITOR: la cabecera de la app (proyecto, salud, Generar, videos, idioma) y, debajo, la ventana del nodo «Prompt del
 * edit» tal cual (web/editor_core.js), abierta con un grafo de mentira (grafo_falso.js) en vez del lienzo de ComfyUI.
 * Plano: ../../planos/fases/6 La app MAX EDITOR.md. Todo texto pasa por t() con los mismos web/i18n/*.json del nodo.
 *   - Proyecto = app/proyectos/<nombre>.json con {valores: {id: {campo: valor}}} (solo lo que cambia respecto a la plantilla).
 *   - El autoguardado de la ventana escribe en los widgets del nodo de mentira; al terminar, la app guarda el proyecto.
 *   - Generar: POST /app/generar con todos los valores y la semilla; el avance se pide cada segundo a /app/trabajo/<id>.
 *   - La barra de fases (27 oct, interfaz P10): «1 Tomas y referencias | 2 Retocar», a todo el ancho encima de la ventana,
 *     cada una con su mini estado; la elegida se ve (la otra se oculta) y se recuerda en este navegador.
 *   - El ejemplo (app/proyectos/ejemplo.json) va en git y es de solo lectura: elegirlo crea una copia («mi ejemplo») y abre
 *     esa. Así abrirlo nunca reescribe el archivo (el estado lleva la hora de guardado). */
import { construir, valoresDe, nodoDelEdit, nodoPorTipo, campo } from "./grafo_falso.js";

const NODO = "/edit_prompt_llm/web/";
const v = "?v=" + Date.now();
const [core, i18n, util] = await Promise.all(["editor_core.js", "editor/i18n.js", "editor/util.js"].map((f) => import(NODO + f + v)));
const retocarJS = await import("./retocar.js" + v);
const { el } = util;

// ---- idioma: el mismo ajuste que en ComfyUI («Prompt del edit › Idioma»), guardado en este navegador
const GUARDA_IDIOMA = "max-editor-idioma", GUARDA_PROYECTO = "max-editor-proyecto", GUARDA_FASE = "max-editor-fase";
const EJEMPLO = "ejemplo";                                 // el proyecto de ejemplo del repo: solo se lee (servidor.py)
const leerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ponerLocal = (k, x) => { try { localStorage.setItem(k, x); } catch { /* sin almacenamiento: solo esta sesión */ } };
const ajustes = {
  get: (k) => (k === i18n.AJUSTE ? leerLocal(GUARDA_IDIOMA) || "auto" : k === "Comfy.Locale" ? navigator.language : undefined),
  set: (k, x) => { if (k === i18n.AJUSTE) { ponerLocal(GUARDA_IDIOMA, x); tr = i18n.traductor(textos, i18n.idiomaElegido(appFalso)); pintarCabecera(); retoque?.pintar(); } },
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
            fase: leerLocal(GUARDA_FASE) === "retocar" ? "retocar" : "tomas" };

// ---- «Retocar el video»: la sección de abajo del todo (retocar.js), con el último video generado
const retoque = retocarJS.crear({ el, icono: util.icono, t, num: (x, d) => tr.num(x, d), pedir, A, avisar: (x, tipo) => avisar(x, tipo),
                                  alTerminar: () => cargarVideos() });

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
cab.append(filaCab, filaAvance);
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
  const ocupado = A.trabajo && !["listo", "error"].includes(A.avance?.estado);
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
    el("button", { class: "max-generar", disabled: !!ocupado || !A.node, title: t("app.generar.tooltip"), onclick: () => generar() },
      t(ocupado ? "app.generar.generando" : "app.generar")),
    el("button", { class: "max-boton", title: t("app.videos.tooltip"), onclick: () => { A.verVideos = !A.verVideos; pintarVideos(); } },
      util.icono("video"), " " + t("app.videos.boton", { n: A.videos.length })),
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
  if (f === "retocar") retoque.pintar();
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
  const bloque = (f, num, estado) => el("button", { class: "max-fase" + (A.fase === f ? " activa" : ""), "aria-current": A.fase === f ? "step" : null,
                                                    "data-fase": f, onclick: () => ponerFase(f) },
    el("span", { class: "max-fase-cab" }, el("span", { class: "max-fase-cara" }, t(`app.fases.cara_${f}`)), el("span", { class: "max-fase-num" }, num), el("span", { class: "max-fase-nombre" }, t(`app.fases.${f}`)),
      A.fase === f ? el("span", { class: "max-fase-aqui" }, t("app.fases.aqui")) : null),
    el("span", { class: "max-fase-estado" }, ...estado));
  barraFases.replaceChildren(
    bloque("tomas", "1", [el("span", {}, t("app.fases.estado_tomas", { n, r: lista.length, c: conexiones })),
      el("span", { class: "max-fase-puntos" }, ...lista.map((r) => ctx.punto ? ctx.punto(r.tag) : null)),
      sinToma ? el("span", { class: "max-fase-aviso" }, t("app.fases.sin_toma", { n: sinToma })) : null]),
    bloque("retocar", "2", [el("span", {}, t("app.fases.retoques", { n: retoques }))]));
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

async function guardarProyecto(nombre = A.proyecto, nuevo = false) {
  if (!A.graph || !nombre) return;
  const valores = valoresDe(A.graph, A.plantilla), texto = JSON.stringify(valores);
  if (!nuevo && nombre === A.proyecto && texto === A.guardadoJSON) return;    // nada nuevo que escribir
  const r = await pedir("/app/proyecto/" + encodeURIComponent(nombre), { valores, nuevo });
  if (nombre === A.proyecto) A.guardadoJSON = texto;
  avisar(t("app.proyecto.guardado", { nombre, hora: new Date().toLocaleTimeString(tr.locale) }), "bien");
  return r;
}

async function abrirProyecto(nombre, valores = null) {
  if (nombre === EJEMPLO) return abrirEjemplo();
  try {
    if (A.ctx) await A.ctx.guardarYa();                   // lo último del proyecto que se deja
    if (valores === null) valores = (await pedir("/app/proyecto/" + encodeURIComponent(nombre))).valores || {};
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
    ctx.alMontar = () => { if (ctx === A.ctx) pintarFases(); };
    document.getElementById("cargando")?.remove();
    avisar(t("app.proyecto.abierto", { nombre }), "bien");
    await cargarVideos();
    retoque.colocar();                                    // debajo de «Prompt final», en la ventana nueva
    pintarFases();                                        // la barra de fases, arriba del todo de la ventana
    await retoque.alAbrirProyecto();
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

// ---- generar
async function generar() {
  if (!A.ctx || (A.trabajo && !["listo", "error"].includes(A.avance?.estado))) return;
  const fallo = (texto) => { A.trabajo = "x"; A.avance = { estado: "error", mensaje: texto, avance: 0 }; pintarCabecera(); };
  try {
    await A.ctx.guardarYa();                              // el prompt y los campos, al día en el grafo y en el proyecto
    const estado = util.leerJSON(campo(A.node, "estado")?.value, {});
    if (!(estado.prompt || "").trim()) return fallo(t("app.generar.sin_prompt"));
    await mirarSalud();
    if (!A.salud.comfyui) return fallo(t("app.error.comfyui", { url: A.salud.comfyui_url }));
    if (!A.salud.proxy) return fallo(t("app.error.proxy", { url: A.salud.proxy_url }));
    if (!A.salud.generar) return fallo(t("app.error.sin_generar"));
    const w = semillaW();
    const r = await pedir("/app/generar", { valores: valoresDe(A.graph), semilla: w ? +w.value : null, proyecto: A.proyecto });
    A.trabajo = r.id;
    A.avance = { estado: "en_cola", avance: 0, mensaje: "" };
    pintarCabecera();
    seguir(r.id);
  } catch (e) { fallo(e.message); }
}

async function seguir(id) {
  while (A.trabajo === id) {
    try { A.avance = await pedir("/app/trabajo/" + id); } catch (e) { A.avance = { ...(A.avance || {}), mensaje: e.message }; }
    pintarCabecera();
    if (A.avance.estado === "listo") {
      await cargarVideos();
      A.videoActual = A.avance.video;
      pintarVideos();
      await retoque.cargar(A.avance.video);               // el clip nuevo, en la línea de tiempo de «Retocar»
      ponerFase("retocar");
      retoque.ver();
      return;
    }
    if (A.avance.estado === "error") return;
    await new Promise((ok) => setTimeout(ok, 1000));
  }
}

function pintarAvance() {
  const a = A.avance;
  filaAvance.className = "max-avance" + (a ? " ver" : "") + (a?.estado === "error" ? " mal" : "");
  if (!a) return filaAvance.replaceChildren();
  const seg = tr.num(a.segundos || 0, 0);
  const texto = a.estado === "error" ? t("app.avance.error", { mensaje: a.mensaje || "" })
    : a.estado === "listo" ? t("app.avance.listo", { s: seg })
    : a.paso && a.pasos ? t("app.avance.paso", { paso: a.paso, pasos: a.pasos, s: seg, nodo: a.nodo || "" })
    : t(a.estado === "generando" ? "app.avance.generando" : "app.avance.en_cola", { s: seg });
  const barra = el("div", { class: "max-barra" }, el("b", { style: { width: Math.round((a.estado === "listo" ? 1 : a.avance || 0) * 100) + "%" } }));
  const enMarcha = !["listo", "error"].includes(a.estado);
  filaAvance.replaceChildren(el("span", { class: "max-texto" }, texto), barra,
    enMarcha ? el("button", { class: "max-boton", onclick: () => pedir("/app/cancelar/" + A.trabajo, {}).catch(() => {}) }, t("app.avance.cancelar"))
             : el("button", { class: "max-boton", onclick: () => { A.avance = null; A.trabajo = null; pintarCabecera(); } }, t("comun.cerrar")));
}

// ---- los videos del proyecto (app/salidas, historial de generar.py)
async function cargarVideos() {
  try { A.videos = await pedir("/app/videos?proyecto=" + encodeURIComponent(A.proyecto)); } catch { A.videos = []; }
  if (!A.videos.some((x) => x.archivo === A.videoActual)) A.videoActual = A.videos[0]?.archivo || "";
  pintarCabecera();
  pintarVideos();
}

function pintarVideos() {
  panelVideos.className = "max-videos" + (A.verVideos ? " ver" : "");
  if (!A.verVideos) return cajaVideos.replaceChildren();     // cerrada: fuera el reproductor (que no siga sonando)
  cajaVideos.setAttribute("aria-label", t("app.videos.titulo", { proyecto: A.proyecto }));
  const actual = A.videos.find((x) => x.archivo === A.videoActual);
  const fecha = (x) => (x.fecha || "").replace("T", " ");
  cajaVideos.replaceChildren(
    el("div", { class: "max-fila" }, el("b", {}, t("app.videos.titulo", { proyecto: A.proyecto })),
      el("button", { class: "max-boton max-derecha", title: t("app.videos.carpeta.tooltip"),
                     onclick: () => pedir("/app/abrir_carpeta", {}).catch((e) => avisar(e.message, "mal")) }, t("app.videos.carpeta")),
      el("button", { class: "max-boton max-cerrar", title: t("comun.cerrar"), "aria-label": t("comun.cerrar"), onclick: cerrarVideos }, util.icono("x"))),
    actual ? el("video", { src: "/app/salidas/" + encodeURIComponent(actual.archivo), controls: true, autoplay: true, loop: true }) : null,
    actual ? el("div", { class: "max-fila" }, el("small", {}, t("app.videos.info", { fecha: fecha(actual), semilla: actual.semilla ?? "?",
                                                                                     s: tr.num(actual.segundos || 0, 0) }))) : null,
    el("div", { class: "max-lista" }, A.videos.length ? A.videos.map((x) =>
      el("div", { class: "max-video" + (x.archivo === A.videoActual ? " actual" : ""), onclick: () => { A.videoActual = x.archivo; pintarVideos(); } },
        util.icono(x.tipo === "retoque" ? "retoque" : "video"),
        el("div", {}, el("div", {}, fecha(x)), el("small", {}, x.tipo === "retoque"
          ? t("app.videos.retoque", { a: tr.num(x.tramo?.inicio ?? 0, 2), b: tr.num(x.tramo?.fin ?? 0, 2) })
          : t("app.videos.semilla", { semilla: x.semilla ?? "?" }))),
        el("button", { class: "max-boton max-derecha", title: t("app.videos.retocar.tooltip"), onclick: (e) => {
          e.stopPropagation();
          A.verVideos = false;
          pintarVideos();
          ponerFase("retocar");
          retoque.cargar(x.archivo).then(retoque.ver);
        } }, t("app.videos.retocar"))))
      : el("div", { class: "max-vacio" }, t("app.videos.vacio"))));
}

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
addEventListener("beforeunload", () => { A.ctx?.guardarYa(); });
window.maxEditor = A;                                    // para probar desde la consola
window.maxRetoque = retoque;
