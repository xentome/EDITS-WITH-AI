/* MAX EDITOR · «Extender video» (planos/fases/12): el segundo apartado del paso Retocar, al lado de «Inpainting / detalle».
 * H3 sigue la MISMA toma desde el final del video, sin corte (app/extender.py).
 *   - Las pestañas «Inpainting / detalle | Extender video» van arriba del paso; cada apartado tiene su línea de tiempo.
 *   - La línea de tiempo: el video original entero, resaltado el trozo final que H3 vuelve a ver (el solape) y, después y
 *     en otro color, lo nuevo con sus segundos. El asa del solape salta entre los valores válidos (22, 39, 56, 73 f) y la
 *     del final alarga de 17 en 17 (la ventana es 17n+5), con el mismo tacto que el tramo de Retocar: aceleración suave y
 *     lenta, con lo que sobra acumulado; las flechas mueven el asa elegida un paso.
 *   - Calidad (rápida · media · original), audio (el de entrada · el del modelo), prompt opcional con referencias
 *     <Picture N> que se arrastran, semilla, «Encolar ×N» y «Extender». POST /app/extender_plan dice antes de lanzar de
 *     dónde sale la cola (latente guardado o mp4), qué audio sonará y cuánto tardará.
 *   - Lo que encola el agente (MCP, origen «agente») se carga aquí con «✎ agente». Al terminar, el video nuevo queda en la
 *     línea de tiempo: se puede volver a extender. Lo elegido se recuerda en este navegador, por proyecto. */

const SOLAPES = [22, 39, 56, 73];
const PASO = 17, NUEVOS_MAX = 204, NUEVOS_DEF = 68;
const CALIDADES = ["rapida", "media", "original"];
const MAX_REFS = 4;
const SUBCARPETA = "max_editor/retocar/refs";
const GUARDA_PESTANA = "max-editor-retocar-pestana";

export function crear({ el, icono, mirarCola, t, num, pedir, A, avisar, alTerminar, retoque }) {
  const R = { video: "", info: null, solape: 39, nuevos: NUEVOS_DEF, calidad: "original", audio: "entrada", prompt: "", refs: [],
              semilla: Math.floor(Math.random() * 2 ** 32), plan: null, error: "", trabajo: null, avance: null, elegir: false,
              agente: null, asa: null };
  const clave = () => "max-editor-extender:" + (A.proyecto || "");
  const guardar = () => {
    const { video, solape, nuevos, calidad, audio, prompt, refs, semilla } = R;
    try { localStorage.setItem(clave(), JSON.stringify({ video, solape, nuevos, calidad, audio, prompt, refs, semilla })); } catch { /* sin almacenamiento */ }
  };
  const leerGuardado = () => { try { return JSON.parse(localStorage.getItem(clave()) || "null"); } catch { return null; } };
  const leerPestana = () => { try { return localStorage.getItem(GUARDA_PESTANA) === "extender" ? "extender" : "inpaint"; } catch { return "inpaint"; } };

  // ---- las pestañas del paso Retocar (dos botones grandes) y la sección de Extender
  const pestanas = el("section", { class: "epl-sec max-rt max-rt-pestanas", role: "tablist" });
  const sec = el("section", { class: "epl-sec max-rt max-ex" });
  retoque.sec.classList.add("max-rt-inpaint");
  let pestana = leerPestana();
  function ponerPestana(p) {
    pestana = p;
    try { localStorage.setItem(GUARDA_PESTANA, p); } catch { /* sin almacenamiento */ }
    pintarPestanas();
    if (p === "extender") pintar(); else retoque.pintar();
  }
  function pintarPestanas() {
    const cuerpo = sec.parentNode;
    cuerpo?.classList.toggle("rt-extender", pestana === "extender");
    const b = (p, ic, claveT, claveA) => el("button", { class: "max-rt-pestana" + (pestana === p ? " activa" : ""), role: "tab",
      "aria-selected": String(pestana === p), "data-pestana": p, onclick: () => ponerPestana(p) },
      el("span", { class: "max-rt-pestana-nombre" }, icono(ic), " " + t(claveT)), el("small", {}, t(claveA)));
    pestanas.replaceChildren(b("inpaint", "retoque", "app.extender.pestana.inpaint", "app.extender.pestana.inpaint.ayuda"),
      b("extender", "video", "app.extender.pestana.extender", "app.extender.pestana.extender.ayuda"));
  }

  // ---- las piezas fijas
  const video = el("video", { class: "max-rt-video", playsinline: true, preload: "auto" });
  const vacio = el("div", { class: "max-rt-vacio", hidden: true });
  const marco = el("div", { class: "max-rt-marco" }, video, vacio);
  const linea = el("div", { class: "max-rt-linea max-ex-linea" });
  const cabeza = el("div", { class: "epl-tit max-rt-tit" });
  const transporte = el("div", { class: "max-rt-transporte" });
  const bajo = el("div", { class: "max-rt-bajo max-ex-bajo" });
  const lado = el("div", { class: "max-rt-lado" });
  sec.append(cabeza, el("div", { class: "max-rt-cuerpo" }, el("div", { class: "max-rt-izq" }, marco, transporte, linea, bajo), lado));

  const fps = () => 24;
  const total = () => R.plan?.total || R.info?.fotogramas || 0;
  const escala = () => total() + NUEVOS_MAX;           // la línea mide el original + lo máximo que se puede alargar: no salta
  const seg = (f) => num(f / fps(), 2);

  // ---- cargar un video
  async function cargar(nombre) {
    if (!nombre) return;
    try {
      R.info = await pedir("/app/video_info?video=" + encodeURIComponent(nombre));
      R.video = nombre;
      R.plan = null;
      R.error = "";
      video.src = "/app/video?video=" + encodeURIComponent(nombre) + "&t=" + Date.now();
      video.addEventListener("loadedmetadata", () => { video.currentTime = Math.max(0, video.duration - R.solape / fps()); }, { once: true });
      guardar();
      pintar();
      pedirPlan();
    } catch (e) { R.error = e.message; pintar(); }
  }
  async function alAbrirProyecto() {
    const g = leerGuardado();
    Object.assign(R, { video: "", info: null, plan: null, error: "", trabajo: null, avance: null, elegir: false, agente: null, asa: null },
                  g ? { solape: SOLAPES.includes(g.solape) ? g.solape : 39, nuevos: g.nuevos || NUEVOS_DEF, calidad: g.calidad || "original",
                        audio: g.audio || "entrada", prompt: g.prompt || "", refs: g.refs || [], semilla: g.semilla ?? R.semilla } : {});
    video.removeAttribute("src");
    video.load();
    if (g?.video) await cargar(g.video);
    if (!R.info && A.videos[0]) { R.error = ""; await cargar(A.videos[0].archivo); }
    pintar();
  }

  // ---- el plan (de dónde sale la cola, el audio, el tamaño y el tiempo): se pide al cambiar algo, con un poco de espera
  let planReloj = null, planPedido = 0;
  const datosPlan = () => ({ video: R.video, solape: R.solape, nuevos: R.nuevos, calidad: R.calidad, audio_salida: R.audio });
  function pedirPlan() {
    clearTimeout(planReloj);
    if (!R.video) return;
    planReloj = setTimeout(async () => {
      const n = ++planPedido;
      try {
        const p = await pedir("/app/extender_plan", datosPlan());
        if (n !== planPedido) return;
        R.plan = p;
        R.error = "";
      } catch (e) { if (n === planPedido) { R.plan = null; R.error = e.message; } }
      pintar();
    }, 250);
  }
  const cambiar = (cambios) => { Object.assign(R, cambios); R.agente = null; guardar(); pintar(); pedirPlan(); };

  // ---- el reproductor (el original): play, ‹ › un fotograma, ir al solape
  video.addEventListener("timeupdate", () => pintarCursor());
  video.addEventListener("seeked", () => pintarCursor());
  video.addEventListener("play", () => pintarTransporte());
  video.addEventListener("pause", () => pintarTransporte());
  const saltar = (s) => { if (!R.info) return; video.pause(); video.currentTime = Math.max(0, Math.min((video.duration || R.info.duracion) - 0.02, video.currentTime + s)); };
  function pintarTransporte() {
    if (!R.info) return transporte.replaceChildren();
    const b = (claveT, accion, ...hijos) => el("button", { class: "epl-mini max-rt-paso", title: t(claveT), "aria-label": t(claveT), onclick: accion }, ...hijos);
    transporte.replaceChildren(
      b("app.retocar.reproductor.atras", () => saltar(-1 / fps()), icono("atras")),
      el("button", { class: "max-rt-play", title: t(video.paused ? "app.retocar.reproductor.play" : "app.retocar.reproductor.pausa"),
                     "aria-label": t(video.paused ? "app.retocar.reproductor.play" : "app.retocar.reproductor.pausa"),
                     onclick: () => (video.paused ? video.play().catch(() => {}) : video.pause()) }, icono(video.paused ? "play" : "pausa")),
      b("app.retocar.reproductor.adelante", () => saltar(1 / fps()), icono("adelante")),
      el("button", { class: "epl-mini", title: t("app.extender.ver_solape.tooltip"),
                     onclick: () => { video.currentTime = Math.max(0, (video.duration || R.info.duracion) - R.solape / fps()); video.play().catch(() => {}); } },
        t("app.extender.ver_solape")),
      el("span", { class: "epl-ayuda" }, t(R.asa ? "app.extender.teclas_asa" : "app.extender.teclas")));
  }

  // ---- la línea de tiempo: original · solape resaltado · lo nuevo (otro color) con sus segundos
  const origEl = el("div", { class: "max-ex-orig" });
  const solapeEl = el("div", { class: "max-ex-solape" }, el("span", { class: "max-rt-asa izq max-ex-asa", "data-asa": "solape" }));
  const nuevoEl = el("div", { class: "max-ex-nuevo" }, el("span", { class: "max-ex-etq" }), el("span", { class: "max-rt-asa der max-ex-asa", "data-asa": "nuevos" }));
  const cursor = el("div", { class: "max-rt-cursor" });
  const regla = el("div", { class: "max-ex-regla" });
  linea.append(origEl, solapeEl, nuevoEl, cursor);
  const pc = (f) => (100 * f / escala()).toFixed(3) + "%";
  function pintarLinea() {
    const vis = !!R.info;
    for (const x of [origEl, solapeEl, nuevoEl, cursor]) x.style.display = vis ? "" : "none";
    if (!vis) return regla.replaceChildren();
    const T = total();
    Object.assign(origEl.style, { left: "0", width: pc(T) });
    Object.assign(solapeEl.style, { left: pc(T - R.solape), width: pc(R.solape) });
    Object.assign(nuevoEl.style, { left: pc(T), width: pc(R.nuevos) });
    solapeEl.title = t("app.extender.linea.solape", { f: R.solape, s: seg(R.solape) });
    nuevoEl.title = t("app.extender.linea.nuevo", { f: R.nuevos, s: seg(R.nuevos) });
    nuevoEl.querySelector(".max-ex-etq").textContent = t("app.extender.segundos", { s: seg(R.nuevos) });
    linea.querySelectorAll(".max-ex-asa").forEach((a) => a.classList.toggle("elegida", R.asa === a.dataset.asa));
    regla.replaceChildren(
      el("span", { class: "max-ex-leyenda o" }, t("app.extender.leyenda.original", { f: T, s: seg(T) })),
      el("span", { class: "max-ex-leyenda s" }, t("app.extender.leyenda.solape", { f: R.solape, s: seg(R.solape) })),
      el("span", { class: "max-ex-leyenda n" }, t("app.extender.leyenda.nuevo", { f: R.nuevos, s: seg(R.nuevos) })),
      el("span", { class: "max-ex-leyenda" }, t("app.extender.leyenda.final", { s: seg(T + R.nuevos) })));
    pintarCursor();
  }
  function pintarCursor() {
    if (!R.info) return;
    cursor.style.left = pc(Math.min(total(), video.currentTime * fps()));
  }
  // mover un asa: el solape salta entre sus valores, lo nuevo de 17 en 17
  function moverAsa(asa, pasos) {
    if (!pasos || !R.info) return;
    if (asa === "solape") {
      const validos = SOLAPES.filter((s) => s <= total());
      const i = Math.max(0, Math.min(validos.length - 1, validos.indexOf(R.solape) + pasos));
      if (validos[i] !== R.solape) cambiar({ solape: validos[i] });
    } else {
      const n = Math.max(PASO, Math.min(NUEVOS_MAX, R.nuevos + pasos * PASO));
      if (n !== R.nuevos) cambiar({ nuevos: n });
    }
  }
  /* el mismo tacto que el tramo de Retocar (retocar.js): ganancia de ~0,04 f/px despacio a 0,8 f/px rápido (smoothstep),
   * lo que sobra se acumula y al soltar no hay inercia; Pointer Lock para no perder el asa al salir de la barra. Como un
   * paso aquí es de 17 f (o el siguiente solape válido), el asa avanza un paso cada 17 f acumulados. */
  const GANANCIA_MIN = 0.04, GANANCIA_MAX = 0.8, V_PLENA = 3, SUAVE = 0.25;
  const ganancia = (v) => { const x = Math.min(1, Math.max(0, v / V_PLENA)); return GANANCIA_MIN + (GANANCIA_MAX - GANANCIA_MIN) * x * x * (3 - 2 * x); };
  linea.addEventListener("pointerdown", (e) => {
    if (!R.info || e.button > 0) return;
    const asaEl = e.target.closest(".max-ex-asa");
    const asa = asaEl ? asaEl.dataset.asa : e.target.closest(".max-ex-nuevo") ? "nuevos" : e.target.closest(".max-ex-solape") ? "solape" : null;
    R.asa = asa;
    pintarLinea();
    pintarTransporte();
    if (!asa) {                                          // un clic en el original: el cursor salta ahí
      const r = linea.getBoundingClientRect();
      video.currentTime = Math.max(0, Math.min(R.info.duracion - 0.02, (e.clientX - r.left) / r.width * escala() / fps()));
      return;
    }
    e.preventDefault();
    const bloqueo = !!linea.requestPointerLock;
    try { linea.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    try { if (bloqueo) linea.requestPointerLock()?.catch?.(() => {}); } catch { /* sin bloqueo */ }
    let x = e.clientX, tAnt = e.timeStamp, v = 0, resto = 0;
    const mover = (ev) => {
      const dx = bloqueo && document.pointerLockElement === linea ? ev.movementX : ev.clientX - x;
      x = ev.clientX;
      const dt = Math.max(1, ev.timeStamp - tAnt);
      tAnt = ev.timeStamp;
      v = v * (1 - SUAVE) + SUAVE * Math.abs(dx) / dt;
      // el solape crece hacia la izquierda: arrastrar a la izquierda es «más»
      resto += (asa === "solape" ? -dx : dx) * ganancia(v);
      const pasos = Math.trunc(resto / PASO);
      if (!pasos) return;
      resto -= pasos * PASO;
      moverAsa(asa, pasos);
    };
    const soltar = () => {
      linea.removeEventListener("pointermove", mover); linea.removeEventListener("pointerup", soltar); linea.removeEventListener("pointercancel", soltar);
      try { if (document.pointerLockElement === linea) document.exitPointerLock(); } catch { /* sin bloqueo */ }
    };
    linea.addEventListener("pointermove", mover);
    linea.addEventListener("pointerup", soltar);
    linea.addEventListener("pointercancel", soltar);
  });
  document.addEventListener("keydown", (e) => {
    if (!sec.offsetParent || !R.info) return;
    if (e.key === "Escape" && R.asa) { R.asa = null; pintarLinea(); pintarTransporte(); return; }
    if (!["ArrowLeft", "ArrowRight"].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".epl-capa, .max-videos.ver")) return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    if (R.asa) moverAsa(R.asa, R.asa === "solape" ? -d : d);
    else saltar(d * (e.shiftKey ? 5 : 1 / fps()));
  });

  // ---- debajo de la línea: lo que se hará (el plan del servidor)
  function pintarBajo() {
    if (!R.info) return bajo.replaceChildren();
    const p = R.plan;
    const filas = [regla];
    if (p) {
      filas.push(el("div", { class: "max-ex-plan" },
        el("span", { class: "max-ex-fuente " + p.fuente }, t(`app.extender.fuente.${p.fuente}`)),
        p.fuente === "mp4" ? el("span", { class: "epl-ayuda" }, t(`app.extender.fuente.por_que.${p.por_que}`)) : null,
        el("span", { class: "epl-ayuda" }, t("app.extender.plan.tamano", { w: p.ancho, h: p.alto, f: p.ventana, lo: p.minutos[0], hi: p.minutos[1] })),
        p.memoria ? el("span", { class: "max-rt-aviso-largo" }, t("app.extender.plan.memoria")) : null));
    }
    bajo.replaceChildren(...filas);
  }

  // ---- referencias (como Retocar): del proyecto o subidas; arrastrarlas al prompt escribe su <Picture N>
  function delProyecto() {
    const items = A.ctx?.wf?.items || [];
    return items.filter((r) => (r.ref && (r.kind || "image") === "image") || (r.medio && r.kind === "image"))
      .map((r) => ({ nombre: r.nombre, vista: A.ctx.vista(r), ...(r.ref ? { refmod: r.ref } : { imagen: r.file }) }));
  }
  async function subir(archivo) {
    const fd = new FormData();
    fd.append("image", archivo, archivo.name);
    fd.append("type", "input");
    fd.append("subfolder", SUBCARPETA);
    const r = await fetch("/upload/image", { method: "POST", body: fd });
    if (!r.ok) throw new Error(t("comun.no_se_pudo_subir", { nombre: archivo.name, estado: r.status }));
    const j = await r.json(), sub = j.subfolder || "";
    return { nombre: j.name, imagen: `${sub ? sub + "/" : ""}${j.name} [input]`,
             vista: `/view?filename=${encodeURIComponent(j.name)}&subfolder=${encodeURIComponent(sub)}&type=input` };
  }
  const citar = (etiqueta) => {
    const area = lado.querySelector(".max-rt-prompt");
    if (!area) return;
    const a = area.selectionStart ?? area.value.length, b = area.selectionEnd ?? a;
    area.value = area.value.slice(0, a) + etiqueta + area.value.slice(b);
    R.prompt = area.value;
    guardar();
    area.focus();
    area.selectionStart = area.selectionEnd = a + etiqueta.length;
  };

  // ---- cargar un video de fuera (como Retocar: se sube a ComfyUI input/max_editor/videos)
  const archivoVideo = el("input", { type: "file", accept: "video/*", style: { display: "none" }, onchange: async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    avisar(t("app.retocar.cargando", { nombre: f.name }));
    try {
      const fd = new FormData();
      fd.append("image", f, f.name);
      fd.append("type", "input");
      fd.append("subfolder", "max_editor/videos");
      const r = await fetch("/upload/image", { method: "POST", body: fd });
      if (!r.ok) throw new Error(t("comun.no_se_pudo_subir", { nombre: f.name, estado: r.status }));
      const j = await r.json(), sub = j.subfolder || "";
      await cargar(`${sub ? sub + "/" : ""}${j.name} [input]`);
      avisar(t("app.retocar.cargado", { nombre: j.name }), "bien");
    } catch (err) { avisar(err.message, "mal"); }
  } });

  // ---- extender: se encola (n = 1 con la semilla de ahora, o n con semillas aleatorias)
  async function extender(n = 1) {
    if (!R.info) { R.error = t("app.retocar.falta.video"); return pintar(); }
    const datos = { ...datosPlan(), prompt: R.prompt.trim(), referencias: R.refs.map(({ refmod, imagen }) => (refmod ? { refmod } : { imagen })),
                    semilla: R.semilla, proyecto: A.proyecto };
    try {
      R.error = "";
      const r = await pedir("/app/cola", { tipo: "extender", datos, n });
      R.trabajo = r.ids[r.ids.length - 1];
      R.avance = { estado: "en_cola", avance: 0, mensaje: "" };
      avisar(t(r.ids.length > 1 ? "app.cola.encolados" : "app.cola.encolado", { n: r.ids.length }), "bien");
      pintar();
      mirarCola?.();
    } catch (e) { R.error = e.message; pintar(); }
  }
  // la cola cambió: el avance del último encolado desde aquí (o por el agente) y, al terminar, el video nuevo aquí
  const vistos = new Set();
  let primeraVez = true;                         // lo que ya estaba en la cola al abrir la página no se carga aquí
  function alCambiarCola(cola) {
    for (const x of cola.trabajos) {
      if (x.tipo !== "extender" || vistos.has(x.id)) continue;
      vistos.add(x.id);
      // lo que encola el agente mientras la página está abierta se ve aquí con «✎ agente» (los de antes no se cargan)
      if (x.origen === "agente" && x.proyecto === A.proyecto && !primeraVez && x.extension && ["en_cola", "corriendo"].includes(x.estado)) {
        const e = x.extension;
        Object.assign(R, { solape: e.solape || R.solape, nuevos: e.nuevos || R.nuevos, calidad: e.calidad || R.calidad,
                           audio: e.audio_salida || R.audio, prompt: e.prompt ?? R.prompt, agente: x.id, trabajo: x.id,
                           avance: { estado: "en_cola", avance: 0, mensaje: "" } });
        if (e.video && e.video !== R.video) cargar(e.video); else { guardar(); pedirPlan(); }
        if (pestana !== "extender") ponerPestana("extender");
      }
    }
    primeraVez = false;
    const x = R.trabajo && cola.trabajos.find((y) => y.id === R.trabajo);
    if (!x) return;
    const antes = R.avance?.estado;
    R.avance = { estado: x.estado === "hecho" ? "listo" : ["error", "cancelado", "interrumpido"].includes(x.estado) ? "error"
                 : x.estado === "corriendo" ? "generando" : "en_cola", avance: x.avance || 0, mensaje: x.mensaje || "", segundos: x.segundos,
                 paso: x.paso, pasos: x.pasos, video: x.video };
    if (R.avance.estado === "listo" && antes !== "listo") {
      alTerminar?.();
      cargar(x.video);                               // el resultado queda listo para extenderse otra vez
      avisar(t("app.extender.listo_aviso", { video: x.video }), "bien");
    }
    pintarAvance();
  }
  const avanceEl = el("div", { class: "max-rt-avance" });
  function pintarAvance() {
    const a = R.avance;
    avanceEl.className = "max-rt-avance" + (a ? " ver" : "") + (a?.estado === "error" ? " mal" : "");
    if (!a) return avanceEl.replaceChildren();
    const s = num(a.segundos || 0, 0);
    const texto = a.estado === "error" ? t("app.avance.error", { mensaje: a.mensaje || "" })
      : a.estado === "listo" ? t("app.extender.listo", { s })
      : a.paso && a.pasos ? t("app.avance.paso", { paso: a.paso, pasos: a.pasos, s, nodo: a.nodo || "" })
      : t(a.estado === "generando" ? "app.avance.generando" : "app.avance.en_cola", { s });
    const barra = el("div", { class: "max-barra" }, el("b", { style: { width: Math.round((a.estado === "listo" ? 1 : a.avance || 0) * 100) + "%" } }));
    const vivo = ["en_cola", "generando"].includes(a.estado);
    avanceEl.replaceChildren(el("span", { class: "max-texto" }, texto), barra,
      vivo ? el("button", { class: "max-boton", onclick: () => pedir("/app/cola/" + R.trabajo + "/cancelar", {}).then(() => mirarCola?.()).catch(() => {}) }, t("app.avance.cancelar"))
           : el("button", { class: "max-boton", onclick: () => { R.avance = null; R.trabajo = null; pintar(); } }, t("comun.cerrar")));
  }

  // ---- pintar
  function pintarAudio() {
    const p = R.plan;
    if (!p) return el("span", { class: "epl-ayuda" }, t("app.extender.audio.ayuda"));
    const cancion = p.cancion?.original || "";
    const clave = p.audio_salida === "modelo" ? "app.extender.audio.explica.modelo"
      : p.usa_cancion ? (p.cancion_de === "proyecto" ? "app.extender.audio.explica.cancion_proyecto" : "app.extender.audio.explica.cancion")
      : p.cancion_de === "cancion_borrada" ? "app.extender.audio.explica.cancion_borrada" : "app.extender.audio.explica.sin_cancion";
    return el("div", { class: "max-rt-bloque" },
      el("span", { class: "epl-ayuda" }, t(clave, { cancion })),
      p.usa_cancion && p.cancion_sobra_s != null && p.cancion_sobra_s < 0
        ? el("span", { class: "max-rt-aviso-largo" }, t("app.extender.audio.se_acaba", { s: num(-p.cancion_sobra_s, 1) })) : null);
  }
  function pintar() {
    pintarPestanas();
    if (pestana !== "extender") return;
    const nombre = R.video ? R.video.replace(/ \[(input|output)\]$/, "") : "";
    cabeza.replaceChildren(el("span", {}, t("app.extender.titulo")),
      el("span", { class: "max-rt-nombre", title: nombre }, nombre ? t("app.retocar.video", { video: nombre }) : ""),
      ...(R.agente ? [el("span", { class: "max-ag-sello", title: t("app.agente.cola.tooltip") }, t("app.agente.marca"))] : []),   // replaceChildren escribiría «null»
      el("span", { class: "der" }, el("span", { class: "epl-ayuda" }, t("app.extender.desde_videos")),
        el("button", { class: "epl-boton epl-azul max-rt-cargar", title: t("app.extender.cargar.tooltip"), onclick: () => archivoVideo.click() },
          t("app.retocar.cargar")), archivoVideo));
    const [w, h] = R.info ? [R.info.ancho, R.info.alto] : [16, 9];
    marco.style.aspectRatio = `${w} / ${h}`;
    marco.style.width = `min(100%, calc(52vh * ${w} / ${h}))`;
    vacio.hidden = !!R.info;
    vacio.replaceChildren(...(R.info ? [] : [el("span", { class: "max-rt-vacio-rotulo" }, t("app.extender.vacio")),
      el("span", { class: "epl-ayuda" }, t("app.retocar.sin_video")),
      el("button", { class: "epl-boton", onclick: () => archivoVideo.click() }, icono("subir"), " " + t("app.retocar.cargar"))]));
    pintarTransporte();
    pintarLinea();
    pintarBajo();
    pintarAvance();

    const seg_ = (grupo, valores, actual, claveDe, alElegir, extra = () => ({})) => el("div", { class: "max-rt-fila", role: "group" },
      ...valores.map((x) => el("button", { class: "epl-mini epl-seg" + (x === actual ? " fijo" : ""), "aria-pressed": String(x === actual),
                                          [`data-${grupo}`]: x, onclick: () => alElegir(x), ...extra(x) }, claveDe(x))));
    const tarjetas = R.refs.map((r, i) => el("div", { class: "max-rt-ref", draggable: "true", title: t("app.retocar.arrastra.tooltip"),
      ondragstart: (e) => { e.dataTransfer.setData("text/plain", `<Picture ${i + 1}>`); e.dataTransfer.effectAllowed = "copy"; } },
      el("img", { src: r.vista || "", alt: r.nombre || "", draggable: "false" }),
      el("button", { class: "epl-cita", title: t("app.retocar.citar.tooltip"), onclick: () => citar(`<Picture ${i + 1}>`) }, `<Picture ${i + 1}>`),
      el("small", { title: r.nombre }, r.nombre || ""),
      el("button", { class: "epl-mini max-rt-quitar", title: t("app.retocar.quitar.tooltip"), onclick: () => { R.refs.splice(i, 1); guardar(); pintar(); } }, icono("x"))));
    const archivo = el("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      try { R.refs.push(await subir(f)); guardar(); } catch (err) { R.error = err.message; }
      pintar();
    } });
    const lleno = R.refs.length >= MAX_REFS, elegibles = delProyecto();
    const selector = R.elegir ? el("div", { class: "max-rt-elegir" },
      elegibles.length ? elegibles.map((r) => el("button", { class: "max-rt-opcion", title: r.nombre, disabled: lleno, onclick: () => {
        if (R.refs.length < MAX_REFS) R.refs.push(r);
        R.elegir = false; guardar(); pintar();
      } }, el("img", { src: r.vista || "", alt: r.nombre || "" }), el("small", {}, r.nombre || "")))
        : el("span", { class: "epl-ayuda" }, t("app.retocar.refs.sin_stack"))) : null;
    const nuevosInput = el("input", { type: "number", min: num(PASO / fps(), 2), max: NUEVOS_MAX / fps(), step: PASO / fps(), class: "max-ex-seg",
      value: (R.nuevos / fps()).toFixed(2), "aria-label": t("app.extender.alarga"),
      onchange: (e) => cambiar({ nuevos: Math.max(PASO, Math.min(NUEVOS_MAX, PASO * Math.max(1, Math.round((+e.target.value || 0) * fps() / PASO)))) }) });

    lado.replaceChildren(
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.extender.calidad")),
        seg_("calidad", CALIDADES, R.calidad, (c) => t(`app.extender.calidad.${c}`), (c) => cambiar({ calidad: c }),
             (c) => ({ title: t(`app.extender.calidad.${c}.ayuda`) })),
        el("span", { class: "epl-ayuda" }, t(`app.extender.calidad.${R.calidad}.ayuda`))),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.extender.solape")),
        seg_("solape", SOLAPES, R.solape, (s) => t("app.extender.solape.valor", { f: s, s: seg(s) }), (s) => cambiar({ solape: s }),
             (s) => ({ disabled: R.info ? s > total() : false })),
        el("span", { class: "epl-ayuda" }, t(R.solape === 39 ? "app.extender.solape.ayuda_39" : "app.extender.solape.ayuda"))),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.extender.alarga")),
        el("div", { class: "max-rt-fila" },
          el("button", { class: "epl-mini", "aria-label": t("app.extender.menos"), title: t("app.extender.menos"), onclick: () => moverAsa("nuevos", -1) }, "−"),
          nuevosInput, el("span", {}, t("app.extender.alarga.unidad", { f: R.nuevos })),
          el("button", { class: "epl-mini", "aria-label": t("app.extender.mas"), title: t("app.extender.mas"), onclick: () => moverAsa("nuevos", 1) }, "+")),
        el("span", { class: "epl-ayuda" }, t("app.extender.alarga.ayuda"))),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.extender.audio")),
        seg_("audio", ["entrada", "modelo"], R.audio, (a) => t(`app.extender.audio.${a}`), (a) => cambiar({ audio: a })),
        pintarAudio()),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.retocar.refs", { n: R.refs.length, max: MAX_REFS })),
        el("div", { class: "max-rt-refs" }, tarjetas),
        el("div", { class: "max-rt-fila" },
          el("button", { class: "epl-mini" + (R.elegir ? " fijo" : ""), disabled: lleno, title: t("app.retocar.refs.proyecto.tooltip"),
                         onclick: () => { R.elegir = !R.elegir; pintar(); } }, t("app.retocar.refs.proyecto")),
          el("button", { class: "epl-mini", disabled: lleno, title: t("app.retocar.refs.subir.tooltip"), onclick: () => archivo.click() },
            t("app.retocar.refs.subir")), archivo),
        selector,
        el("span", { class: "epl-ayuda" }, t("app.extender.refs.ayuda"))),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.extender.prompt")),
        el("span", { class: "max-rt-arrastra" }, t("app.retocar.prompt.arrastra")),
        el("textarea", { class: "max-rt-prompt", rows: 4, placeholder: t("app.extender.prompt.placeholder"),
                         oninput: (e) => { R.prompt = e.target.value; R.agente = null; guardar(); },
                         ondragover: (e) => e.currentTarget.classList.add("soltar"),
                         ondragleave: (e) => e.currentTarget.classList.remove("soltar"),
                         ondrop: (e) => e.currentTarget.classList.remove("soltar") }, R.prompt),
        el("span", { class: "epl-ayuda" }, t("app.extender.prompt.ayuda"))),
      el("div", { class: "max-rt-fila max-rt-final" },
        el("label", { class: "max-rt-semilla", title: t("app.retocar.semilla.tooltip") }, el("span", {}, t("app.retocar.semilla")),
          el("input", { type: "number", min: 0, step: 1, value: R.semilla, onchange: (e) => { R.semilla = Math.max(0, Math.round(+e.target.value || 0)); guardar(); } }),
          el("button", { class: "epl-mini", title: t("app.semilla.otra.tooltip"), onclick: () => { R.semilla = Math.floor(Math.random() * 2 ** 32); guardar(); pintar(); } }, icono("semilla"))),
        el("span", { class: "max-rt-cola", title: t("app.cola.encolar.tooltip") },
          el("input", { type: "number", min: 1, max: 20, step: 1, value: R.colaN || 1, class: "max-cola-n", "aria-label": t("app.cola.n"),
                        oninput: (e) => {          // el botón dice al momento cuántos encola (28 oct: antes, ×3 hasta repintar)
                          R.colaN = Math.max(1, Math.min(20, Math.round(+e.target.value || 1)));
                          e.target.nextElementSibling?.replaceChildren(icono("mas"), " " + t("app.cola.encolar", { n: R.colaN }));
                        } }),
          el("button", { class: "max-boton", disabled: !R.info, onclick: () => extender(R.colaN || 1) }, icono("mas"), " " + t("app.cola.encolar", { n: R.colaN || 1 }))),
        el("button", { class: "max-generar max-rt-boton max-ex-boton", disabled: !R.info, title: t("app.extender.boton.tooltip"), onclick: () => extender(1) },
          t("app.extender.boton", { s: seg(R.nuevos) }))),
      ...(R.error ? [el("div", { class: "max-rt-error" }, R.error)] : []),
      avanceEl);
  }

  // las pestañas y la sección van justo antes y después de la de Retocar (retocar.js la pone al final de la ventana)
  function colocar() {
    const cuerpo = retoque.sec.parentNode;
    if (!cuerpo) return;
    if (pestanas.nextSibling !== retoque.sec) cuerpo.insertBefore(pestanas, retoque.sec);
    if (retoque.sec.nextSibling !== sec) retoque.sec.after(sec);
    pintarPestanas();
    pintar();
  }
  const ver = () => { ponerPestana("extender"); sec.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const verInpaint = () => ponerPestana("inpaint");

  return { R, sec, cargar, colocar, pintar, ver, verInpaint, alAbrirProyecto, alCambiarCola };
}
