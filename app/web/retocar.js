/* MAX EDITOR · «Retocar el video»: la sección de abajo del todo, después de «Prompt final» (planos/fases/7, sección 10).
 * Una segunda línea de tiempo solo para retocar, con el último video generado (o el que se ponga desde «Videos»):
 *   - un reproductor con una capa encima para dibujar el rectángulo de la máscara (con esquinas para ajustarlo);
 *   - la línea de tiempo del clip entero con la selección: de 1 fotograma al clip entero, cada borde de fotograma en
 *     fotograma con aceleración (como un ratón) y su asa, independiente; el centro la mueve entera; «Todo el clip». H3 pide
 *     17n+5: por dentro se genera el válido más pequeño que la contiene y al pegar solo cambia lo elegido (retocar.py);
 *   - la máscara «por texto» (SAM 3.1) o «rectángulo»; hasta 4 referencias (del Stack del proyecto o subidas), cada una
 *     con su <Picture N> para citarla en el prompt; el prompt (inglés), la semilla y «Retocar».
 *   - POST /app/retocar → {id}; el avance, en /app/trabajo/<id> (el mismo de Generar). Al terminar, la línea de tiempo carga
 *     el video completo nuevo (el original con el tramo cambiado), así los retoques se encadenan.
 * Lo que se va eligiendo se recuerda en este navegador, por proyecto. Todo texto pasa por t(). */

const MAX_REFS = 4;
const MIN_POR_39 = [3, 4];                    // minutos por cada 39 fotogramas (pruebas del 27 oct: 3–3,5 min)
const SUBCARPETA = "max_editor/retocar/refs"; // las imágenes subidas desde aquí, en ComfyUI/input/
/* la resolución del retoque (27 oct): los megapíxeles del recorte alrededor de la máscara (retocar.py, MVEx_SubjectCrop
 * upscale_megapixels; 1 MP = 1024 × 1024, en la rejilla de 32). «normal» es la de siempre. El tiempo crece con los píxeles. */
const RESOLUCIONES = [["rapida", 0.12], ["normal", 0.18], ["alta", 0.35], ["maxima", 0.6]];
const MP_NORMAL = 0.18;
/* (29 oct) Inpainting/detalle tiene dos pestañas: «Tapar» (todo lo de arriba) y «Mejorar», que pasa el video ENTERO por los
 * nodos RTX de NVIDIA (mejorar.py): Super Resolution y HDR. Los límites son los de mejorar.py: el lado más grande del nodo
 * y lo que cabe en la memoria (fotogramas × píxeles de salida). El tiempo se estima con lo medido en la RTX 3060
 * (124 fotogramas de 1376 × 800: ×2 en 16 s, HDR en 6 s, los dos en 24 s): unos 30 MP de fotogramas por segundo. */
const GUARDA_SUB = "max-editor-retocar-sub";
const ESCALAS = [1.5, 2, 3, 4];
const CALIDADES_SR = { LOW: "app.retocar.mejorar.sr.calidad.low", MEDIUM: "app.retocar.mejorar.sr.calidad.medium",
                       HIGH: "app.retocar.mejorar.sr.calidad.high", ULTRA: "app.retocar.mejorar.sr.calidad.ultra" };   // valor del nodo → su texto
const CLASE_SUB = { true: "max-rt-sub-b activa", false: "max-rt-sub-b" };
const NITS = [400, 650, 1000];
const LADO_MAX = 8192, MAX_PIXELES = 1.4e9, MP_POR_S = 30;
const tamanoSR = (w, h, e) => [Math.max(8, Math.round(w * e / 8) * 8), Math.max(8, Math.round(h * e / 8) * 8)];

export function crear({ el, icono, mirarCola, t, num, pedir, A, avisar, alTerminar }) {
  const R = { video: "", info: null, f0: 0, n: 39, modo: "rectangulo", texto: "face", rect: null, refs: [], prompt: "", mp: MP_NORMAL,
              semilla: Math.floor(Math.random() * 2 ** 32), trabajo: null, avance: null, error: "", elegir: false,
              sub: "tapar", sr: { on: true, escala: 2, calidad: "ULTRA" }, hdr: { on: false, nits: 650 } };
  try { if (localStorage.getItem(GUARDA_SUB) === "mejorar") R.sub = "mejorar"; } catch { /* sin almacenamiento */ }
  const clave = () => "max-editor-retocar:" + (A.proyecto || "");
  const guardar = () => {
    const { video, f0, n, modo, texto, rect, refs, prompt, semilla, mp, sr, hdr } = R;
    try { localStorage.setItem(clave(), JSON.stringify({ video, f0, n, modo, texto, rect, refs, prompt, semilla, mp, sr, hdr })); } catch { /* sin almacenamiento */ }
  };
  const leerGuardado = () => { try { return JSON.parse(localStorage.getItem(clave()) || "null"); } catch { return null; } };

  // ---- las piezas que no se vuelven a crear (el video no se recarga al repintar)
  const sec = el("section", { class: "epl-sec max-rt" });
  const video = el("video", { class: "max-rt-video", playsinline: true, preload: "auto" });
  const capa = el("div", { class: "max-rt-capa" });
  // sin video, el lienzo enseña su estado vacío: un rótulo y «Cargar video» (27 oct, revisión del tema casete)
  const vacio = el("div", { class: "max-rt-vacio", hidden: true });
  const marco = el("div", { class: "max-rt-marco" }, video, capa, vacio);
  const linea = el("div", { class: "max-rt-linea" });
  const lado = el("div", { class: "max-rt-lado" });
  const cabeza = el("div", { class: "epl-tit max-rt-tit" });
  const bajoVideo = el("div", { class: "max-rt-bajo" });
  // debajo del visor: ver el video normal o el tramo con la máscara encima (27 oct)
  const verFila = el("div", { class: "max-rt-ver" });
  // el reproductor (27 oct): play/pausa grande, ‹ › un fotograma, −5 s / +5 s, y el fotograma y el tiempo de ahora
  const transporte = el("div", { class: "max-rt-transporte" });
  /* (28 oct, variante P1 elegida por el usuario) encima del tramo, una regla con miniaturas y segundos: tocarla o arrastrar
   * sobre ella mueve el video (el tramo solo cambia con sus asas o dibujándolo en su carril). ⛶ pone el visor, el
   * transporte y la línea a toda la ventana (max-rt-cine), con los mismos elementos */
  const minis = el("div", { class: "max-rt-minis" });
  const marcas = el("div", { class: "max-rt-marcas" });
  const cursorRegla = el("div", { class: "max-rt-cabezal" });
  const regla = el("div", { class: "max-rt-regla" }, minis, marcas, cursorRegla);
  const etCarril = el("div", { class: "max-rt-et-carril" });
  const izq = el("div", { class: "max-rt-izq" }, marco, transporte, verFila, regla, etCarril, linea, bajoVideo);
  /* las dos pestañas de Inpainting/detalle (29 oct): «Tapar» y «Mejorar» (Super Resolution y HDR). Van arriba del cuadro de la
   * derecha, encima de «Qué tapar» o de «Super Resolution» (pedido de Jonathan, 29 oct), no en una fila propia */
  const subBar = el("div", { class: "max-rt-sub", role: "tablist" });
  sec.append(cabeza, el("div", { class: "max-rt-cuerpo" }, izq, lado));

  const fps = () => R.info?.fps || 24;
  const mejorando = () => R.sub === "mejorar";
  const total = () => R.info?.fotogramas || 0;
  const ajustar = (f0, n) => {                 // la selección: cualquier largo, de 1 fotograma al clip entero
    R.n = Math.max(1, Math.min(Math.round(n), total() || 1));
    R.f0 = Math.max(0, Math.min(Math.round(f0), total() - R.n));
  };
  // lo que genera H3 (como retocar.tramo_generado): el 17n+5 más pequeño que contiene la selección, centrado y dentro del clip
  const validoQueContiene = (n) => 17 * Math.max(1, Math.ceil((Math.max(1, n) - 5) / 17)) + 5;
  const generado = () => {
    const m = validoQueContiene(R.n);
    if (m >= total()) return { g0: 0, m };
    return { g0: Math.max(0, Math.min(R.f0 - Math.floor((m - R.n) / 2), total() - m)), m };
  };
  // con la cola (27 oct) nada se bloquea mientras un retoque espera o corre: cada uno lleva su foto fija y se puede seguir
  // editando, cambiar de semilla y volver a encolar
  const enMarcha = () => false;

  // ---- cargar un video en la línea de tiempo
  async function cargar(nombre, { mantener = false } = {}) {
    if (!nombre) return;
    try {
      const info = await pedir("/app/video_info?video=" + encodeURIComponent(nombre));
      const antes = { f0: R.f0, n: R.n };
      R.video = nombre;
      R.info = info;
      R.vista = "normal";
      R.mascara = null;
      video.src = "/app/video?video=" + encodeURIComponent(nombre) + "&t=" + Date.now();
      hacerMinis(nombre, info);
      if (!mantener) R.rect = R.rect && R.rect.x + R.rect.w <= info.ancho && R.rect.y + R.rect.h <= info.alto ? R.rect : null;
      ajustar(antes.f0, antes.n);
      R.error = "";
      guardar();
      pintar();
    } catch (e) { R.error = e.message; pintar(); }
  }

  // al abrir un proyecto: lo último que se eligió aquí o, si no, el último video del proyecto
  async function alAbrirProyecto() {
    const g = leerGuardado();
    Object.assign(R, { video: "", info: null, rect: null, refs: [], prompt: "", trabajo: null, avance: null, error: "", elegir: false,
                       vista: "normal", mascara: null, calculando: null },
                  g ? { f0: g.f0 ?? 0, n: g.n ?? 39, modo: g.modo || "rectangulo", texto: g.texto ?? "face", rect: g.rect || null,
                        refs: g.refs || [], prompt: g.prompt || "", semilla: g.semilla ?? R.semilla, mp: g.mp || MP_NORMAL,
                        sr: { ...R.sr, ...(g.sr || {}) }, hdr: { ...R.hdr, ...(g.hdr || {}) } } : {});
    video.removeAttribute("src");
    video.load();
    if (g?.video) await cargar(g.video, { mantener: true });               // si ya no existe, queda sin info y se sigue
    if (!R.info && A.videos[0]) { R.error = ""; await cargar(A.videos[0].archivo, { mantener: true }); }
    pintar();
  }

  /* las miniaturas de la regla: 16 fotogramas sacados de otro <video> (el del visor no se mueve); se sueltan al acabar */
  let minisDe = "";
  async function hacerMinis(nombre, info) {
    if (minisDe === nombre) return;
    minisDe = nombre;
    minis.replaceChildren();
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = "/app/video?video=" + encodeURIComponent(nombre);
    try {
      await new Promise((ok, mal) => { v.addEventListener("loadeddata", ok, { once: true }); v.addEventListener("error", mal, { once: true }); });
      const c = document.createElement("canvas"), alto = 54;
      c.width = Math.max(1, Math.round(alto * info.ancho / info.alto)); c.height = alto;
      const g = c.getContext("2d"), imgs = [];
      for (let i = 0; i < 16 && minisDe === nombre; i++) {
        v.currentTime = (i + 0.5) / 16 * (v.duration || info.duracion);
        await new Promise((ok) => v.addEventListener("seeked", ok, { once: true }));
        g.drawImage(v, 0, 0, c.width, c.height);
        imgs.push(el("img", { src: c.toDataURL("image/jpeg", 0.7), alt: "" }));
      }
      if (minisDe === nombre) minis.replaceChildren(...imgs);
    } catch { /* sin miniaturas: la regla sigue sirviendo */ }
    v.removeAttribute("src"); v.load();
  }
  function pintarRegla() {
    if (!R.info) { regla.hidden = true; etCarril.hidden = true; return; }
    regla.hidden = false; etCarril.hidden = false;
    etCarril.textContent = t("app.retocar.carril");
    regla.title = t("app.retocar.regla.tooltip");
    const s = R.info.duracion, paso = s > 12 ? 2 : s > 6 ? 1 : 0.5;
    const hijos = [];
    for (let x = 0; x <= s + 1e-6; x += paso) hijos.push(el("span", { style: { left: (100 * x / s).toFixed(2) + "%" } }, num(x, paso < 1 ? 1 : 0) + " s"));
    marcas.replaceChildren(...hijos);
  }
  // tocar o arrastrar en la regla: el video va a ese momento (con la vista de la máscara, dentro de su tramo)
  regla.addEventListener("pointerdown", (e) => {
    if (!R.info || e.button > 0) return;
    e.preventDefault();
    try { regla.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    video.pause(); soloTramo = false;
    const ir = (ev) => {
      const r = regla.getBoundingClientRect(), s = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * R.info.duracion;
      const fin = Number.isFinite(video.duration) ? video.duration : R.info.duracion;
      video.currentTime = Math.max(0, Math.min(fin - 1 / (2 * fps()), s - (enMascara() ? segundos(R.mascara.f0) : 0)));
    };
    ir(e);
    const soltar = () => { regla.removeEventListener("pointermove", ir); regla.removeEventListener("pointerup", soltar); regla.removeEventListener("pointercancel", soltar); };
    regla.addEventListener("pointermove", ir); regla.addEventListener("pointerup", soltar); regla.addEventListener("pointercancel", soltar);
  });
  // la máscara se esconde mientras suena (para ver el detalle) o con 👁; ⛶ pantalla grande; bucle, silencio y ½×
  const ponerSonando = () => marco.classList.toggle("sonando", !video.paused);
  video.addEventListener("play", ponerSonando); video.addEventListener("pause", ponerSonando);
  function ponerCine(si) {
    R.cine = si;
    izq.classList.toggle("max-rt-cine", si);
    document.body.classList.toggle("max-rt-con-cine", si);
    pintarTransporte();
    requestAnimationFrame(pintarCursor);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && R.cine) { e.stopPropagation(); ponerCine(false); } }, true);

  // ---- el reproductor: el tramo se reproduce solo (empieza en el asa izquierda y para en la derecha)
  let soloTramo = false;
  const segundos = (f) => f / fps();
  function reproducirTramo() {
    if (!R.info) return;
    if (enMascara()) { video.currentTime = 0; video.play().catch(() => {}); return; }   // el visor ya es solo el tramo
    soloTramo = true;
    video.currentTime = segundos(R.f0) + 0.001;
    video.play().catch(() => {});
  }
  video.addEventListener("timeupdate", () => {
    if (soloTramo && !enMascara() && video.currentTime >= segundos(R.f0 + R.n)) {
      if (R.bucle) { video.currentTime = segundos(R.f0) + 0.001; return; }     // en bucle, lo elegido vuelve a empezar
      video.pause(); soloTramo = false; video.currentTime = segundos(R.f0);
    }
    pintarCursor();
  });
  video.addEventListener("pause", () => { pintarBajo(); pintarTransporte(); });
  video.addEventListener("play", () => { pintarBajo(); pintarTransporte(); });
  video.addEventListener("seeked", () => { pintarCursor(); pintarLectura(); });
  video.addEventListener("timeupdate", () => pintarLectura());

  // ---- el reproductor: mover de a un fotograma o de a 5 s (también con las flechas y Mayús+flecha)
  const saltar = (s) => {
    if (!R.info) return;
    video.pause();
    soloTramo = false;
    const fin = Number.isFinite(video.duration) ? video.duration : R.info.duracion;
    video.currentTime = Math.max(0, Math.min(fin - 1 / (2 * fps()), video.currentTime + s));
  };
  const fotograma = (d) => saltar(d / fps());
  const reloj = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.round((s % 1) * 1000)).padStart(3, "0").slice(0, 3)}`;
  const lectura = el("span", { class: "max-rt-lectura", "aria-live": "off" });
  const ICONO_PLAY = { true: "play", false: "pausa" };      // el icono del botón (util.icono), no un texto
  function pintarLectura() {
    if (!R.info) return lectura.replaceChildren();
    const s = tiempoClip();
    lectura.textContent = t("app.retocar.reproductor.ahora", { f: Math.round(s * fps()), t: reloj(s) });
  }
  function pintarTransporte() {
    if (!R.info) return transporte.replaceChildren();
    const b = (clase, clave, accion, ...hijos) => el("button", { class: "epl-mini " + clase, title: t(clave), "aria-label": t(clave), onclick: accion }, ...hijos);
    const si = (x) => (x ? " fijo" : "");
    video.loop = !!R.bucle && !soloTramo;
    transporte.replaceChildren(...[      // sin los null (replaceChildren escribiría «null»)
      b("max-rt-paso", "app.retocar.reproductor.menos5", () => saltar(-5), t("app.retocar.reproductor.menos5_corto")),
      b("max-rt-paso", "app.retocar.reproductor.atras", () => fotograma(-1), icono("atras")),
      el("button", { class: "max-rt-play", title: t(video.paused ? "app.retocar.reproductor.play" : "app.retocar.reproductor.pausa"),
                     "aria-label": t(video.paused ? "app.retocar.reproductor.play" : "app.retocar.reproductor.pausa"),
                     onclick: () => { soloTramo = false; video.loop = !!R.bucle; if (video.paused) video.play().catch(() => {}); else video.pause(); } },
        icono(ICONO_PLAY[video.paused])),
      b("max-rt-paso", "app.retocar.reproductor.adelante", () => fotograma(1), icono("adelante")),
      b("max-rt-paso", "app.retocar.reproductor.mas5", () => saltar(5), t("app.retocar.reproductor.mas5_corto")),
      lectura,
      el("span", { class: "max-rt-sep" }),
      mejorando() ? null : b("max-rt-solo", "app.retocar.reproductor.solo.tooltip", () => (video.paused ? reproducirTramo() : video.pause()), icono("play"), " " + t("app.retocar.reproductor.solo")),
      b("max-rt-paso" + si(R.bucle), "app.retocar.reproductor.bucle", () => { R.bucle = !R.bucle; pintarTransporte(); }, icono("bucle")),
      b("max-rt-paso" + si(video.muted), video.muted ? "app.retocar.reproductor.sonido" : "app.retocar.reproductor.mudo",
        () => { video.muted = !video.muted; pintarTransporte(); }, icono(video.muted ? "mudo" : "sonido")),
      b("max-rt-paso max-rt-vel" + si(video.playbackRate !== 1), "app.retocar.reproductor.vel",
        () => { video.playbackRate = video.playbackRate === 1 ? 0.5 : 1; pintarTransporte(); }, video.playbackRate === 1 ? "1×" : "½×"),
      R.modo === "rectangulo" && !mejorando() ? b("max-rt-paso" + si(R.sinRect), R.sinRect ? "app.retocar.reproductor.mascara_ver" : "app.retocar.reproductor.mascara_ocultar",
        () => { R.sinRect = !R.sinRect; marco.classList.toggle("sin-rect", R.sinRect); pintarTransporte(); }, icono(R.sinRect ? "ojono" : "ojo")) : null,
      el("span", { class: "max-rt-esp" }),
      b("max-rt-paso" + si(R.cine), R.cine ? "app.retocar.reproductor.cine_salir" : "app.retocar.reproductor.cine", () => ponerCine(!R.cine), icono("grande"))].filter(Boolean));
    pintarLectura();
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && R.asa && sec.offsetParent) { R.asa = null; pintarTramo(); } });
  document.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key) || !R.info || !sec.offsetParent || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".epl-capa, .max-videos.ver")) return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    if (R.asa) return moverBorde(R.asa, (e.shiftKey ? 10 : 1) * d, true);   // con un asa elegida: ese borde, 1 o 10 fotogramas
    if (e.shiftKey) saltar(5 * d); else fotograma(d);
  });

  // ---- la línea de tiempo: el clip entero, el tramo con dos asas y el cursor
  const tramoEl = el("div", { class: "max-rt-tramo" }, el("span", { class: "max-rt-asa izq" }), el("span", { class: "max-rt-asa der" }));
  const generadoEl = el("div", { class: "max-rt-generado" });         // lo que genera H3 de verdad (17n+5), debajo de la selección
  const cursor = el("div", { class: "max-rt-cursor" });
  linea.append(generadoEl, tramoEl, cursor);
  // el tiempo del clip entero: con la vista de la máscara, el visor tiene solo el tramo (su 0 es el inicio del tramo)
  const enMascara = () => R.vista === "mascara" && !!R.mascara;
  const tiempoClip = () => video.currentTime + (enMascara() ? segundos(R.mascara.f0) : 0);
  function pintarCursor() {
    if (!R.info) return;
    cursor.style.left = cursorRegla.style.left = (100 * tiempoClip() / R.info.duracion).toFixed(3) + "%";
  }
  function pintarTramo() {
    if (!R.info) { tramoEl.style.display = generadoEl.style.display = "none"; return; }
    tramoEl.style.display = generadoEl.style.display = "";
    tramoEl.style.left = (100 * R.f0 / total()) + "%";
    tramoEl.style.width = (100 * R.n / total()) + "%";
    const { g0, m } = generado();
    generadoEl.style.left = (100 * g0 / total()) + "%";
    generadoEl.style.width = (100 * Math.min(m, total() - g0) / total()) + "%";
    tramoEl.querySelectorAll(".max-rt-asa").forEach((a) => a.classList.toggle("elegida", R.asa === (a.classList.contains("izq") ? "izq" : "der")));
  }
  const fotogramaEn = (x) => { const r = linea.getBoundingClientRect(); return (x - r.left) / r.width * total(); };
  /* elegir la selección (27 oct, rehecho a petición del usuario): cada borde se mueve de fotograma en fotograma, con una
   * aceleración como la de un ratón. Despacio, ~0,04 fotogramas por píxel (1 fotograma cada ~25 px: preciso, nunca salta); rápido, la ganancia sube
   * con la velocidad (suavizada) hasta 0,8 f/px. Más lenta a petición del usuario (27 oct). La curva es continua: g(v) = 0,04 + 0,76 · s(v/3),
   * con s(x) = x² (3 − 2x) entre 0 y 1 (smoothstep), v en px/ms. Lo que queda de fotograma se acumula (sin saltos ni tirones);
   * al soltar no hay inercia. Pointer Lock (o captura del puntero) para no perderlo al salir de la barra. */
  const GANANCIA_MIN = 0.04, GANANCIA_MAX = 0.8, V_PLENA = 3, SUAVE = 0.25;
  const ganancia = (v) => { const x = Math.min(1, Math.max(0, v / V_PLENA)); return GANANCIA_MIN + (GANANCIA_MAX - GANANCIA_MIN) * x * x * (3 - 2 * x); };
  const fin = () => R.f0 + R.n;                // exclusivo: la selección es [f0, f0+n)
  // mueve un borde d fotogramas; el otro se queda quieto (al cruzarse se para en 1 fotograma)
  function moverBorde(borde, d, guardarYa = false) {
    if (!R.info || !d) return;
    if (borde === "izq") { const z = fin(); const a = Math.max(0, Math.min(z - 1, R.f0 + d)); R.f0 = a; R.n = z - a; }
    else { const z = Math.max(R.f0 + 1, Math.min(total(), fin() + d)); R.n = z - R.f0; }
    video.pause();
    soloTramo = false;
    video.currentTime = segundos(borde === "izq" ? R.f0 : fin() - 1) + (enMascara() ? -segundos(R.mascara.f0) : 0);
    pintarTramo();
    pintarBajo();
    if (guardarYa) guardar();
  }
  const todoElClip = () => { if (!R.info) return; R.f0 = 0; R.n = total(); R.asa = null; guardar(); pintar(); };
  linea.addEventListener("pointerdown", (e) => {
    if (!R.info || enMarcha() || e.button > 0) return;
    const asa = e.target.closest(".max-rt-asa"), enTramo = e.target.closest(".max-rt-tramo");
    let modo = asa ? (asa.classList.contains("izq") ? "izq" : "der") : enTramo ? "mover" : "nuevo";
    R.asa = asa ? modo : null;                  // tocar un asa la elige (las flechas la mueven); tocar fuera la suelta
    e.preventDefault();
    const bloqueo = !!linea.requestPointerLock;
    try { linea.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    try { if (bloqueo) linea.requestPointerLock()?.catch?.(() => {}); } catch { /* sin bloqueo: queda la captura */ }
    const pulsado = Math.max(0, Math.min(total() - 1, Math.floor(fotogramaEn(e.clientX))));
    let x = e.clientX, tAnt = e.timeStamp, v = 0, resto = 0, recorrido = 0, movido = false, ancla = pulsado, punta = pulsado;
    const mover = (ev) => {
      const dx = bloqueo && document.pointerLockElement === linea ? ev.movementX : ev.clientX - x;
      x = ev.clientX;
      const dt = Math.max(1, ev.timeStamp - tAnt);
      tAnt = ev.timeStamp;
      v = v * (1 - SUAVE) + SUAVE * Math.abs(dx) / dt;      // la velocidad, suavizada
      recorrido += Math.abs(dx);
      if (!movido && recorrido < 3) return;
      movido = true;
      resto += dx * ganancia(v);
      const d = Math.trunc(resto);
      if (!d) return;
      resto -= d;
      if (modo === "izq" || modo === "der") moverBorde(modo, d);
      else if (modo === "mover") { ajustar(R.f0 + d, R.n); video.currentTime = segundos(R.f0); pintarTramo(); pintarBajo(); }
      else {                                    // dibujar: el punto pulsado queda quieto y la punta va hacia donde se arrastra
        punta = Math.max(0, Math.min(total() - 1, punta + d));
        R.f0 = Math.min(ancla, punta);
        R.n = Math.abs(punta - ancla) + 1;
        video.currentTime = segundos(punta);
        pintarTramo();
        pintarBajo();
      }
    };
    const soltar = () => {
      linea.removeEventListener("pointermove", mover); linea.removeEventListener("pointerup", soltar);
      linea.removeEventListener("pointercancel", soltar);
      try { if (document.pointerLockElement === linea) document.exitPointerLock(); } catch { /* sin bloqueo */ }
      if (!movido && modo === "nuevo") video.currentTime = Math.max(0, Math.min(R.info.duracion, segundos(pulsado)));   // un clic: el cursor salta ahí
      if (movido) guardar();
      pintarTramo();
    };
    linea.addEventListener("pointermove", mover);
    linea.addEventListener("pointerup", soltar);
    linea.addEventListener("pointercancel", soltar);
  });

  // ---- el rectángulo: se dibuja con el ratón sobre el fotograma; arrastrar dentro lo mueve y las esquinas lo ajustan
  const rectEl = el("div", { class: "max-rt-rect" }, ...["nw", "ne", "sw", "se"].map((c) => el("span", { class: "max-rt-esq " + c, "data-esquina": c })));
  capa.append(rectEl);
  const aVideo = (e) => {
    const r = capa.getBoundingClientRect();
    return { x: Math.max(0, Math.min(R.info.ancho, (e.clientX - r.left) / r.width * R.info.ancho)),
             y: Math.max(0, Math.min(R.info.alto, (e.clientY - r.top) / r.height * R.info.alto)) };
  };
  function pintarRect() {
    const ver = R.modo === "rectangulo" && R.info && R.rect;
    capa.classList.toggle("dibujar", R.modo === "rectangulo" && !!R.info && !enMarcha() && !mejorando());
    rectEl.style.display = ver ? "" : "none";
    if (!ver) return;
    const { x, y, w, h } = R.rect, W = R.info.ancho, H = R.info.alto;
    Object.assign(rectEl.style, { left: 100 * x / W + "%", top: 100 * y / H + "%", width: 100 * w / W + "%", height: 100 * h / H + "%" });
  }
  capa.addEventListener("pointerdown", (e) => {
    if (R.modo !== "rectangulo" || !R.info || enMarcha() || mejorando()) return;
    e.preventDefault();
    try { capa.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    video.pause();
    const p0 = aVideo(e), r0 = R.rect ? { ...R.rect } : null;
    const esquina = e.target.dataset?.esquina;
    const modo = esquina ? "esquina" : r0 && e.target.closest(".max-rt-rect") ? "mover" : "nuevo";
    const mover = (ev) => {
      const p = aVideo(ev), W = R.info.ancho, H = R.info.alto;
      if (modo === "nuevo") R.rect = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
      else if (modo === "mover") R.rect = { ...r0, x: Math.max(0, Math.min(W - r0.w, r0.x + p.x - p0.x)), y: Math.max(0, Math.min(H - r0.h, r0.y + p.y - p0.y)) };
      else {
        let x1 = r0.x, y1 = r0.y, x2 = r0.x + r0.w, y2 = r0.y + r0.h;
        if (esquina.includes("w")) x1 = p.x; else x2 = p.x;
        if (esquina.includes("n")) y1 = p.y; else y2 = p.y;
        R.rect = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
      }
      R.rect = Object.fromEntries(Object.entries(R.rect).map(([k, v]) => [k, Math.round(v)]));
      pintarRect();
      pintarBajo();
    };
    const soltar = () => {
      capa.removeEventListener("pointermove", mover); capa.removeEventListener("pointerup", soltar); capa.removeEventListener("pointercancel", soltar);
      if (R.rect && (R.rect.w < 16 || R.rect.h < 16)) R.rect = r0;     // un clic suelto no borra el que había
      guardar();
      pintar();
    };
    capa.addEventListener("pointermove", mover);
    capa.addEventListener("pointerup", soltar);
    capa.addEventListener("pointercancel", soltar);
  });

  /* ---- la vista de la máscara: el tramo con la zona que se rehará en rosa, calculada en ComfyUI con la misma rama,
   * limpieza y recorte que el retoque, sin H3 (retocar.py, preparar_mascara). Si el tramo o la máscara cambian, vale otra. */
  const firmaMascara = () => JSON.stringify([R.video, R.f0, R.n, R.modo, R.modo === "texto" ? R.texto.trim() : R.rect, R.mp]);
  const datosMascara = () => ({ video: R.video, f0: R.f0, n: R.n, inicio: segundos(R.f0) + 0.001, fin: segundos(R.f0 + R.n) + 0.001, megapixeles: R.mp,
                                mascara: R.modo === "texto" ? { modo: "texto", texto: R.texto.trim() } : { modo: "rectangulo", ...R.rect },
                                proyecto: A.proyecto });
  function verNormal() {
    if (R.vista !== "mascara") return;
    const t0 = tiempoClip();
    R.vista = "normal";
    video.src = "/app/video?video=" + encodeURIComponent(R.video) + "&t=" + Date.now();
    video.addEventListener("loadedmetadata", () => { video.currentTime = t0; }, { once: true });
    pintar();
  }
  function mostrarMascara() {
    R.vista = "mascara";
    video.src = "/app/video?video=" + encodeURIComponent(R.mascara.video) + "&t=" + Date.now();
    video.addEventListener("loadedmetadata", () => { video.currentTime = 0; video.play().catch(() => {}); }, { once: true });
    pintar();
  }
  async function verMascara() {
    if (!R.info || R.calculando) return;
    const falta = R.modo === "rectangulo" && !R.rect ? "app.retocar.falta.rect" : R.modo === "texto" && !R.texto.trim() ? "app.retocar.falta.texto" : "";
    if (falta) { R.error = t(falta); return pintar(); }
    if (R.mascara?.firma === firmaMascara()) return mostrarMascara();
    const firma = firmaMascara(), t0 = Date.now();
    R.calculando = { s: 0 };
    R.error = "";
    pintar();
    const reloj = setInterval(() => { if (R.calculando) { R.calculando.s = Math.round((Date.now() - t0) / 1000); pintarVer(); } }, 500);
    try {
      const { id } = await pedir("/app/retocar_mascara", datosMascara());
      let a;
      for (;;) {
        a = await pedir("/app/trabajo/" + id);
        if (a.estado === "listo" || a.estado === "error") break;
        await new Promise((ok) => setTimeout(ok, 1000));
      }
      if (a.estado === "error") throw new Error(a.mensaje || "?");
      // el video de la máscara es el tramo GENERADO (17n+5): su 0 es g0, que puede quedar antes de la selección
      R.mascara = { video: a.video, f0: a.tramo?.g0 ?? R.f0, n: a.tramo?.gn ?? R.n, firma, segundos: a.segundos };
      if (firmaMascara() === firma) mostrarMascara();
    } catch (e) { R.error = t("app.retocar.ver.error", { error: e.message }); }
    finally { clearInterval(reloj); R.calculando = null; pintar(); }
  }
  function pintarVer() {
    if (!R.info) return verFila.replaceChildren();
    if (R.vista === "mascara" && R.mascara?.firma !== firmaMascara()) { verNormal(); return; }   // el tramo o la máscara cambiaron
    const boton = (k, clave, accion, ic) => el("button", { class: "epl-mini epl-seg" + (R.vista === k ? " fijo" : ""), "aria-pressed": String(R.vista === k),
                                                          disabled: !!R.calculando, onclick: accion }, icono(ic), " " + t(clave));
    verFila.replaceChildren(
      boton("normal", "app.retocar.ver.normal", verNormal, "video"),
      boton("mascara", "app.retocar.ver.mascara", verMascara, "ojo"),
      R.calculando ? el("span", { class: "max-rt-calculando", role: "status" }, t("app.retocar.ver.calculando", { s: R.calculando.s }))
        : enMascara() ? el("span", { class: "epl-ayuda" }, t("app.retocar.ver.listo", { s: num(R.mascara.segundos || 0, 0) }))
        : el("span", { class: "epl-ayuda" }, t("app.retocar.ver.ayuda")));
  }

  function pintarVacio() {
    vacio.hidden = !!R.info;
    if (R.info) return vacio.replaceChildren();
    vacio.replaceChildren(el("span", { class: "max-rt-vacio-rotulo" }, t("app.retocar.vacio")),
      el("span", { class: "epl-ayuda" }, t("app.retocar.sin_video")),
      el("button", { class: "epl-boton max-rt-vacio-cargar", title: t("app.retocar.cargar.tooltip"), disabled: enMarcha(),
                     onclick: () => archivoVideo.click() }, icono("subir"), " " + t("app.retocar.cargar")));
  }

  // ---- debajo del video: reproducir el tramo, cuánto mide y cuánto tardará
  function pintarBajo() {
    if (!R.info) return bajoVideo.replaceChildren();      // el aviso va dentro del lienzo (pintarVacio)
    const { m } = generado();
    const escala = m / 39 * R.mp / MP_NORMAL;            // lo que se genera (17n+5) y sus píxeles: más, más minutos
    const lo = Math.max(1, Math.round(MIN_POR_39[0] * escala)), hi = Math.max(lo + 1, Math.round(MIN_POR_39[1] * escala));
    // un tramo largo no se prohíbe: se avisa con el tiempo y, si puede no caber en la VRAM, con lo que se midió
    // (DOCUMENTACION/3 LO QUE APRENDIMOS/1: en la RTX 3060 de 12 GB caben ~8 s a 0,4 MP o 5 s a 1 MP; no 8 s a 0,8 MP)
    const sGen = m / fps(), memoria = sGen > 8 || (sGen > 5 && R.mp > 0.4);
    const aviso = m > 124 || memoria ? el("span", { class: "max-rt-aviso-largo" },
      t(memoria ? "app.retocar.tramo.aviso_memoria" : "app.retocar.tramo.aviso_largo", { lo, hi, s: num(sGen, 1) })) : null;
    bajoVideo.replaceChildren(
      el("span", { class: "max-rt-tramo-info max-rt-pastilla" },
        el("b", {}, t("app.retocar.tramo.elegido", { a: R.f0, b: fin() - 1, n: R.n, s: num(R.n / fps(), 3) })),
        el("small", {}, t("app.retocar.tramo.generado", { m }) + " · " + t("app.retocar.estimado", { lo, hi }))),
      el("button", { class: "epl-mini", title: t("app.retocar.todo.tooltip"), disabled: enMarcha(), onclick: todoElClip }, t("app.retocar.todo")),
      ...(aviso ? [aviso] : []),                          // replaceChildren escribiría «null»
      ...(R.modo === "rectangulo" && R.rect ? [el("span", { class: "epl-ayuda" }, t("app.retocar.rect_info", R.rect))] : []));
  }

  // ---- referencias: del Stack del proyecto (su foto original) o subidas
  /* ---- la guía «¿Cómo detallar la cara?» (29 oct, Jonathan eligió la variante P1): los pasos verificados (app/guia/4_prompts.md)
   * y «Aplicar»: «face», calidad Alta, el personaje como <Picture N> y la plantilla. Los textos salen en el idioma de la app;
   * la plantilla siempre en inglés (es lo que lee H3). */
  const PASOS_GUIA = [["app.retocar.guia.p1", "app.retocar.guia.p1.texto"], ["app.retocar.guia.p2", "app.retocar.guia.p2.texto"],
    ["app.retocar.guia.p3", "app.retocar.guia.p3.texto"], ["app.retocar.guia.p4", "app.retocar.guia.p4.texto"],
    ["app.retocar.guia.p5", "app.retocar.guia.p5.texto"], ["app.retocar.guia.p6", "app.retocar.guia.p6.texto"],
    ["app.retocar.guia.p7", "app.retocar.guia.p7.texto"], ["app.retocar.guia.p8", "app.retocar.guia.p8.texto"]];
  const SI_NO_GUIA = [["si", "app.retocar.guia.si1"], ["no", "app.retocar.guia.no1"], ["si", "app.retocar.guia.si2"], ["no", "app.retocar.guia.no2"]];
  const capaGuia = el("div", { class: "max-rt-guia", onclick: (e) => { if (e.target === capaGuia) cerrarGuia(); } });
  const cerrarGuia = () => capaGuia.remove();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && capaGuia.isConnected) { e.stopPropagation(); cerrarGuia(); } }, true);
  function personajeDelProyecto() {
    const refs = A.ctx?.S?.refs || {}, todas = delProyecto();
    const items = A.ctx?.wf?.items || [];
    const clave = items.find((r) => refs[r.clave]?.papel === "personaje" && (r.ref || r.file));
    return (clave && todas.find((x) => x.refmod === clave.ref || x.imagen === clave.file)) || todas[0] || null;
  }
  function aplicarGuia() {
    R.modo = "texto";
    R.texto = "face";
    R.mp = RESOLUCIONES.find(([k]) => k === "alta")[1];
    const p = personajeDelProyecto();
    if (p && !R.refs.some((r) => (r.refmod && r.refmod === p.refmod) || (r.imagen && r.imagen === p.imagen)) && R.refs.length < MAX_REFS) R.refs.unshift(p);
    const n = p ? R.refs.findIndex((r) => (r.refmod && r.refmod === p.refmod) || (r.imagen && r.imagen === p.imagen)) + 1 : 1;
    R.prompt = t("app.retocar.guia.plantilla", { n });
    guardar();
    cerrarGuia();
    pintar();
  }
  function abrirGuia() {
    const paso = ([titulo, texto], j) => el("div", { class: "max-rt-guia-paso" }, el("span", { class: "max-rt-guia-n" }, String(j + 1)),
      el("div", {}, el("b", {}, t(titulo)), el("div", { class: "epl-ayuda" }, t(texto)),
        j === 5 ? el("div", { class: "max-rt-guia-ejemplo" }, t("app.retocar.guia.plantilla", { n: 1 })) : null,
        j === 6 ? el("div", { class: "max-rt-guia-sino" }, ...SI_NO_GUIA.map(([clase, k]) => el("div", { class: clase }, t(k)))) : null));
    capaGuia.replaceChildren(el("div", { class: "max-rt-guia-caja", role: "dialog", "aria-modal": "true" },
      el("div", { class: "max-rt-fila" }, el("b", { class: "max-rt-guia-titulo" }, t("app.retocar.guia.titulo")), el("span", { class: "max-derecha" }),
        el("button", { class: "max-boton max-cerrar", title: t("comun.cerrar"), "aria-label": t("comun.cerrar"), onclick: cerrarGuia }, icono("x"))),
      ...PASOS_GUIA.map(paso),
      el("div", { class: "max-rt-fila max-rt-guia-pie" }, el("span", { class: "max-derecha" }),
        el("button", { class: "max-boton", onclick: cerrarGuia }, t("app.retocar.guia.entendido")),
        el("button", { class: "max-generar", title: t("app.retocar.guia.aplicar.tooltip"), onclick: aplicarGuia }, t("app.retocar.guia.aplicar")))));
    document.body.append(capaGuia);
  }
  // el fotograma que mira el LLM: el del cabezal (en la vista de la máscara, el visor es solo el tramo)
  const segundoCabezal = () => (enMascara() ? segundos(R.mascara.f0) : 0) + (video.currentTime || 0);
  async function escribirConLLM() {
    const s = segundoCabezal(), f = Math.round(s * fps());
    R.escribiendo = true; R.error = ""; pintar();
    try {
      const r = await pedir("/app/retocar_prompt", { video: R.video, segundo: s, zona: R.modo === "texto" ? R.texto.trim() : "",
                                                     con_referencia: R.refs.length > 0 });
      R.prompt = r.prompt;
      guardar();
      avisar(t("app.retocar.llm.hecho", { f, s: num(s, 2) }), "bien");
    } catch (e) { R.error = e.message; }
    R.escribiendo = false;
    pintar();
  }
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

  // ---- retocar
  // retocar: se encola (n = 1 con la semilla de ahora, o n trabajos con semillas aleatorias: «+ Cola ×N»)
  async function retocar(n = 1) {
    const falta = !R.info ? "app.retocar.falta.video" : R.modo === "rectangulo" && !R.rect ? "app.retocar.falta.rect"
      : R.modo === "texto" && !R.texto.trim() ? "app.retocar.falta.texto" : !R.prompt.trim() ? "app.retocar.falta.prompt" : "";
    if (falta) { R.error = t(falta); return pintar(); }
    const datos = { video: R.video, f0: R.f0, n: R.n, inicio: segundos(R.f0) + 0.001, fin: segundos(R.f0 + R.n) + 0.001,
                    mascara: R.modo === "texto" ? { modo: "texto", texto: R.texto.trim() } : { modo: "rectangulo", ...R.rect },
                    referencias: R.refs.map(({ refmod, imagen }) => (refmod ? { refmod } : { imagen })),
                    prompt: R.prompt.trim(), semilla: R.semilla, proyecto: A.proyecto, megapixeles: R.mp };
    R.ultimoPedido = datos;                         // para probar desde la consola
    try {
      R.error = "";
      const r = await pedir("/app/cola", { tipo: "retocar", datos, n });
      R.mios = [...(R.mios || []), ...r.ids];        // los retoques encolados desde aquí: al terminar, el último se carga
      R.trabajo = r.ids[r.ids.length - 1];
      R.avanceTipo = "retocar";
      R.avance = { estado: "en_cola", avance: 0, mensaje: "" };
      avisar(t(r.ids.length > 1 ? "app.cola.encolados" : "app.cola.encolado", { n: r.ids.length }), "bien");
      pintar();
      mirarCola?.();
    } catch (e) { R.error = e.message; pintar(); }
  }
  // ---- mejorar (29 oct): el video entero por Super Resolution y/o HDR, por la cola como todo
  function cuentaMejora() {
    if (!R.info) return null;
    const { ancho: w, alto: h, fotogramas: f } = R.info;
    const [w2, h2] = R.sr.on ? tamanoSR(w, h, R.sr.escala) : [w, h];
    const mpf = f * w2 * h2 / 1e6 * (R.sr.on && R.hdr.on ? 1.3 : 1);
    return { w, h, w2, h2, f, s: Math.round(3 + mpf / MP_POR_S) };
  }
  const cabeEscala = (e) => {
    if (!R.info) return true;
    const [w2, h2] = tamanoSR(R.info.ancho, R.info.alto, e);
    return Math.max(w2, h2) <= LADO_MAX && w2 * h2 * Math.max(1, R.info.fotogramas) <= MAX_PIXELES;
  };
  async function mejorar() {
    const falta = !R.info ? "app.retocar.falta.video" : !R.sr.on && !R.hdr.on ? "app.retocar.mejorar.falta" : "";
    if (falta) { R.error = t(falta); return pintar(); }
    const datos = { video: R.video, proyecto: A.proyecto, superres: R.sr.on ? { escala: R.sr.escala, calidad: R.sr.calidad } : null,
                    hdr: R.hdr.on ? { nits: R.hdr.nits } : null };
    try {
      R.error = "";
      const r = await pedir("/app/cola", { tipo: "mejorar", datos, n: 1 });
      R.mios = [...(R.mios || []), ...r.ids];
      R.trabajo = r.ids[r.ids.length - 1];
      R.avanceTipo = "mejorar";
      R.avance = { estado: "en_cola", avance: 0, mensaje: "" };
      avisar(t("app.cola.encolado", { n: 1 }), "bien");
      pintar();
      mirarCola?.();
    } catch (e) { R.error = e.message; pintar(); }
  }
  function ponerSub(p) {
    R.sub = p;
    try { localStorage.setItem(GUARDA_SUB, p); } catch { /* sin almacenamiento */ }
    if (p === "mejorar") { R.asa = null; if (R.vista === "mascara") verNormal(); }
    pintar();
  }
  function pintarSub() {
    sec.classList.toggle("max-rt-mejorando", mejorando());
    const b = (p, ic, claveT, claveA) => el("button", { class: CLASE_SUB[R.sub === p], role: "tab",
      "aria-selected": String(R.sub === p), "data-sub": p, onclick: () => ponerSub(p) },
      el("span", { class: "max-rt-sub-nombre" }, icono(ic), " " + t(claveT)), el("small", {}, t(claveA)));
    subBar.replaceChildren(b("tapar", "retoque", "app.retocar.sub.tapar", "app.retocar.sub.tapar.ayuda"),
      b("mejorar", "grande", "app.retocar.sub.mejorar", "app.retocar.sub.mejorar.ayuda"));
  }
  // el lado derecho de «Mejorar»: un bloque por efecto (con su interruptor), lo que saldrá y el botón
  function ladoMejorar() {
    const c = cuentaMejora();
    const interruptor = (x) => el("button", { class: "epl-mini epl-seg max-rt-interruptor" + (x.on ? " fijo" : ""), "aria-pressed": String(x.on),
      onclick: () => { x.on = !x.on; guardar(); pintar(); } }, icono(x.on ? "check" : "x"), " " + t(x.on ? "app.retocar.mejorar.activado" : "app.retocar.mejorar.apagado"));
    const seg = (activo, texto, accion, extra = {}) => el("button", { class: "epl-mini epl-seg" + (activo ? " fijo" : ""), "aria-pressed": String(activo),
                                                                      onclick: accion, ...extra }, texto);
    const sr = el("div", { class: "max-rt-bloque max-rt-efecto" + (R.sr.on ? "" : " apagado") },
      el("div", { class: "max-rt-etiqueta" }, t("app.retocar.mejorar.sr"), info("app.retocar.mejorar.sr.ayuda"), interruptor(R.sr)),
      el("div", { class: "max-rt-sub-et" }, t("app.retocar.mejorar.sr.escala")),
      el("div", { class: "max-rt-fila", role: "group" }, ...ESCALAS.map((e) => {
        const cabe = cabeEscala(e), [w2, h2] = R.info ? tamanoSR(R.info.ancho, R.info.alto, e) : [0, 0];
        return seg(R.sr.escala === e, "×" + num(e, e % 1 ? 1 : 0), () => { R.sr.escala = e; guardar(); pintar(); },
                   { disabled: !R.sr.on || !cabe, title: t(cabe ? "app.retocar.mejorar.sr.tamano_corto" : "app.retocar.mejorar.sr.no_cabe", { w: w2, h: h2 }) });
      })),
      el("div", { class: "max-rt-sub-et" }, t("app.retocar.mejorar.sr.calidad")),
      el("div", { class: "max-rt-fila", role: "group" }, ...Object.entries(CALIDADES_SR).map(([q, clave]) =>
        seg(R.sr.calidad === q, t(clave), () => { R.sr.calidad = q; guardar(); pintar(); }, { disabled: !R.sr.on }))),
      c && R.sr.on ? el("div", { class: "max-rt-resultado" }, t("app.retocar.mejorar.sr.tamano", { a: c.w, b: c.h, c: c.w2, d: c.h2 })) : null);
    const hdr = el("div", { class: "max-rt-bloque max-rt-efecto" + (R.hdr.on ? "" : " apagado") },
      el("div", { class: "max-rt-etiqueta" }, t("app.retocar.mejorar.hdr"), info("app.retocar.mejorar.hdr.ayuda"), interruptor(R.hdr)),
      el("div", { class: "max-rt-sub-et" }, t("app.retocar.mejorar.hdr.brillo")),
      el("div", { class: "max-rt-fila", role: "group" }, ...NITS.map((n) =>
        seg(R.hdr.nits === n, t("app.retocar.mejorar.hdr.nits", { n }), () => { R.hdr.nits = n; guardar(); pintar(); }, { disabled: !R.hdr.on }))),
      R.hdr.on ? el("div", { class: "epl-ayuda" }, t("app.retocar.mejorar.hdr.aviso")) : null);
    const nada = !R.sr.on && !R.hdr.on;
    return [sr, hdr,
      c ? el("div", { class: "max-rt-tramo-info max-rt-pastilla" }, el("b", {}, t("app.retocar.mejorar.todo", { s: num(R.info.duracion, 1), f: c.f })),
            el("small", {}, nada ? t("app.retocar.mejorar.falta") : t("app.retocar.mejorar.estimado", { s: c.s }))) : null,
      el("div", { class: "max-rt-fila max-rt-final" },
        el("button", { class: "max-generar max-rt-boton", disabled: !R.info || nada, title: t("app.retocar.mejorar.boton.tooltip"), onclick: mejorar },
          icono("grande"), " " + t("app.retocar.mejorar.boton")))].filter(Boolean);
  }

  /* la cola cambió (app.js la mira cada 2 s): el avance del último retoque encolado desde aquí y, al terminar uno, el video
   * completo nuevo en la línea de tiempo (así los retoques se encadenan) */
  function alCambiarCola(cola) {
    const x = R.trabajo && cola.trabajos.find((y) => y.id === R.trabajo);
    if (!x) return;
    const antes = R.avance?.estado;
    R.avanceTipo = x.tipo;
    R.avance = { estado: x.estado === "hecho" ? "listo" : ["error", "cancelado", "interrumpido"].includes(x.estado) ? "error"
                 : x.estado === "corriendo" ? "generando" : "en_cola", avance: x.avance || 0, mensaje: x.mensaje || "", segundos: x.segundos,
                 paso: x.paso, pasos: x.pasos, video: x.video };
    if (R.avance.estado === "listo" && antes !== "listo") {
      alTerminar?.();
      cargar(x.video, { mantener: true });
      avisar(t(x.tipo === "mejorar" ? "app.retocar.mejorar.listo_aviso" : "app.retocar.listo_aviso", { video: x.video }), "bien");
    }
    pintarAvance();
  }

  // ---- el avance (como el de Generar, pero dentro de la sección)
  const avanceEl = el("div", { class: "max-rt-avance" });
  function pintarAvance() {
    const a = R.avance;
    avanceEl.className = "max-rt-avance" + (a ? " ver" : "") + (a?.estado === "error" ? " mal" : "");
    if (!a) return avanceEl.replaceChildren();
    const seg = num(a.segundos || 0, 0);
    const texto = a.estado === "error" ? t("app.avance.error", { mensaje: a.mensaje || "" })
      : a.estado === "listo" ? t(R.avanceTipo === "mejorar" ? "app.retocar.mejorar.listo" : "app.retocar.listo", { s: seg })
      : a.paso && a.pasos ? t("app.avance.paso", { paso: a.paso, pasos: a.pasos, s: seg, nodo: a.nodo || "" })
      : t(a.estado === "generando" ? "app.avance.generando" : "app.avance.en_cola", { s: seg });
    const barra = el("div", { class: "max-barra" }, el("b", { style: { width: Math.round((a.estado === "listo" ? 1 : a.avance || 0) * 100) + "%" } }));
    const vivo = ["en_cola", "generando"].includes(a.estado);
    avanceEl.replaceChildren(el("span", { class: "max-texto" }, texto), barra,
      vivo ? el("button", { class: "max-boton", onclick: () => pedir("/app/cola/" + R.trabajo + "/cancelar", {}).then(() => mirarCola?.()).catch(() => {}) }, t("app.avance.cancelar"))
           : el("button", { class: "max-boton", onclick: () => { R.avance = null; R.trabajo = null; pintar(); } }, t("comun.cerrar")));
  }

  // ---- pintar la sección
  // cargar un video ya hecho (de cualquier carpeta del PC): se sube a ComfyUI input/max_editor/videos y se pone aquí
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
  /* una imagen subida como referencia se puede recortar antes (26 oct): la ventana del recorte del editor (subir.js,
   * ctx.editorRecorte) sobre la imagen; «Usar» recorta en el navegador con un canvas y sube solo esa parte */
  // `fuente`: un archivo recién elegido o la dirección de la foto de una referencia ya puesta; `alListo(ref)` la coloca
  function recortarYSubir(fuente, nombre, alListo) {
    const v = A.ctx.capa("");
    const propia = fuente instanceof Blob, url = propia ? URL.createObjectURL(fuente) : fuente;
    const img = el("img", { src: url, alt: "", class: "max-rt-img-recorte" });
    const x = { recorte: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } };
    const ed = A.ctx.editorRecorte(img, x);
    const cerrar = () => { if (propia) URL.revokeObjectURL(url); v.cerrar(); };
    const usar = async () => {
      try {
        let archivo = propia ? fuente : null;
        if (!x.recorte && !propia) { cerrar(); return; }   // una referencia ya puesta, sin recorte: se queda como estaba
        if (x.recorte && img.naturalWidth) {
          const r = x.recorte, W = img.naturalWidth, H = img.naturalHeight;
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(r.w * W)); c.height = Math.max(1, Math.round(r.h * H));
          c.getContext("2d").drawImage(img, r.x * W, r.y * H, r.w * W, r.h * H, 0, 0, c.width, c.height);
          const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
          archivo = new File([blob], nombre.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_") + "_" + Date.now() + "." + "png", { type: "image/png" });
        }
        cerrar();
        alListo(await subir(archivo)); R.error = ""; guardar();
      } catch (err) { R.error = err.message; }
      pintar();
    };
    v.modal.replaceChildren(
      el("div", { class: "epl-tit" }, t("app.retocar.recorte.titulo"),
        el("span", { class: "der" }, ed.botonCortar,
          el("button", { class: "epl-mini", onclick: cerrar }, t("app.proyecto.cancelar")),
          el("button", { class: "epl-boton epl-azul", onclick: usar }, t("app.retocar.recorte.usar")))),
      el("p", { class: "epl-ayuda" }, t("app.retocar.recorte.ayuda")),
      el("div", { class: "max-rt-recorte" }, ed.marco));
  }
  const info = (clave) => A.ctx?.info ? A.ctx.info(t(clave)) : el("span", { class: "epl-ayuda" }, t(clave));   // «ⓘ» del editor
  function pintar() {
    const nombre = R.video ? R.video.replace(/ \[(input|output)\]$/, "") : "";
    cabeza.replaceChildren(el("span", {}, t("app.retocar.titulo")),
      el("span", { class: "max-rt-nombre", title: nombre }, nombre ? t("app.retocar.video", { video: nombre }) : ""),
      el("span", { class: "der" }, el("span", { class: "epl-ayuda" }, t("app.retocar.desde_videos")),
        el("button", { class: "epl-boton max-rt-cargar", title: t("app.retocar.cargar.tooltip"), disabled: enMarcha(),
          onclick: () => archivoVideo.click() }, icono("subir"), " " + t("app.retocar.cargar"))));
    const [w, h] = R.info ? [R.info.ancho, R.info.alto] : [16, 9];
    marco.style.aspectRatio = `${w} / ${h}`;
    marco.style.width = `min(100%, calc(62vh * ${w} / ${h}))`;   // cabe a lo ancho y a lo alto sin deformarse
    pintarSub();
    pintarVacio();
    pintarTransporte();
    pintarVer();
    pintarRegla();
    pintarTramo();
    pintarCursor();
    pintarRect();
    pintarBajo();
    pintarAvance();
    if (mejorando()) {
      lado.replaceChildren(subBar, ...ladoMejorar(), ...(R.error ? [el("div", { class: "max-rt-error" }, R.error)] : []), avanceEl);
      return;
    }
    const ocupado = enMarcha();
    const modoBoton = (m, claveT) => el("button", { class: "epl-mini epl-seg" + (R.modo === m ? " fijo" : ""), disabled: ocupado,
      onclick: () => { R.modo = m; guardar(); pintar(); } }, t(claveT));
    // arrastrar una tarjeta al prompt escribe su <Picture N> donde se suelta (27 oct); el botón de la etiqueta sigue
    const tarjetas = R.refs.map((r, i) => el("div", { class: "max-rt-ref", draggable: ocupado ? false : "true", title: t("app.retocar.arrastra.tooltip"),
      ondragstart: (e) => { e.dataTransfer.setData("text/plain", `<Picture ${i + 1}>`); e.dataTransfer.effectAllowed = "copy"; } },
      el("img", { src: r.vista || "", alt: r.nombre || "", draggable: "false" }),
      el("button", { class: "epl-cita", title: t("app.retocar.citar.tooltip"), onclick: () => citar(`<Picture ${i + 1}>`) }, `<Picture ${i + 1}>`),
      el("small", { title: r.nombre }, r.nombre || ""),
      el("button", { class: "epl-mini max-rt-cortar", title: t("app.retocar.recortar.tooltip"), disabled: ocupado,
                     onclick: () => recortarYSubir(r.refmod ? "/app/foto_referencia?refmod=" + encodeURIComponent(r.refmod)
                       : r.imagen ? "/app/foto_referencia?imagen=" + encodeURIComponent(r.imagen) : r.vista,
                       r.nombre || "ref", (nueva) => { R.refs[i] = { ...nueva, nombre: r.nombre || nueva.nombre }; }) }, icono("tijeras")),
      el("button", { class: "epl-mini max-rt-quitar", title: t("app.retocar.quitar.tooltip"), disabled: ocupado,
                     onclick: () => { R.refs.splice(i, 1); guardar(); pintar(); } }, icono("x"))));
    const archivo = el("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      recortarYSubir(f, f.name, (nueva) => R.refs.push(nueva));
    } });
    const lleno = R.refs.length >= MAX_REFS;
    const elegibles = delProyecto();
    const selector = R.elegir ? el("div", { class: "max-rt-elegir" },
      elegibles.length ? elegibles.map((r) => el("button", { class: "max-rt-opcion", title: r.nombre, disabled: lleno, onclick: () => {
        if (R.refs.length < MAX_REFS) R.refs.push(r);
        R.elegir = false;
        guardar();
        pintar();
      } }, el("img", { src: r.vista || "", alt: r.nombre || "" }), el("small", {}, r.nombre || "")))
        : el("span", { class: "epl-ayuda" }, t("app.retocar.refs.sin_stack"))) : null;
    lado.replaceChildren(subBar,
      // (29 oct, variante P1 de prototipo_ayuda_retoque.html) la guía de cómo detallar la cara, en el idioma de la app
      el("div", { class: "max-rt-fila max-rt-guia-fila" }, el("button", { class: "max-boton max-rt-guia-boton", title: t("app.retocar.guia.boton.tooltip"),
        onclick: () => abrirGuia() }, icono("chispa"), " " + t("app.retocar.guia.boton"))),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.retocar.mascara"),
          info(R.modo === "texto" ? "app.retocar.mascara.texto.ayuda" : R.rect ? "app.retocar.mascara.rect.ayuda_hecho" : "app.retocar.mascara.rect.ayuda")),
        el("div", { class: "max-rt-fila" }, modoBoton("texto", "app.retocar.mascara.texto"), modoBoton("rectangulo", "app.retocar.mascara.rect")),
        R.modo === "texto"
          ? el("input", { class: "max-rt-texto", value: R.texto, placeholder: t("app.retocar.mascara.texto.placeholder"), disabled: ocupado,
                          oninput: (e) => { R.texto = e.target.value; guardar(); } })
          : null),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.retocar.refs", { n: R.refs.length, max: MAX_REFS }), info("app.retocar.refs.ayuda")),
        el("div", { class: "max-rt-refs" }, tarjetas),
        el("div", { class: "max-rt-fila" },
          el("button", { class: "epl-mini" + (R.elegir ? " fijo" : ""), disabled: lleno || ocupado, title: t("app.retocar.refs.proyecto.tooltip"),
                         onclick: () => { R.elegir = !R.elegir; pintar(); } }, t("app.retocar.refs.proyecto")),
          el("button", { class: "epl-mini", disabled: lleno || ocupado, title: t("app.retocar.refs.subir.tooltip"), onclick: () => archivo.click() },
            t("app.retocar.refs.subir")), archivo),
        selector),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta", title: t("app.retocar.resolucion.tooltip") }, t("app.retocar.resolucion"), info("app.retocar.resolucion.ayuda")),
        el("div", { class: "max-rt-fila", role: "group" }, ...RESOLUCIONES.map(([k, mp]) => el("button", {
          class: "epl-mini epl-seg" + (Math.abs(R.mp - mp) < 1e-6 ? " fijo" : ""), disabled: ocupado, "data-mp": mp,
          title: t("app.retocar.resolucion.mp", { mp: num(mp * 1.048576, 2) }),
          onclick: () => { R.mp = mp; guardar(); pintar(); } }, t(`app.retocar.resolucion.${k}`, { mp: num(mp * 1.048576, 2) }))))),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.retocar.prompt"), info("app.retocar.prompt.ayuda")),
        el("span", { class: "max-rt-arrastra" }, t("app.retocar.prompt.arrastra")),
        // (29 oct, Jonathan: «poder elegir el fotograma que el LLM verá») lo escribe el LLM mirando el fotograma del cabezal
        el("div", { class: "max-rt-fila" }, el("button", { class: "max-boton max-rt-llm", disabled: ocupado || !R.info || R.escribiendo,
          title: t("app.retocar.llm.tooltip"), onclick: () => escribirConLLM() }, icono("chispa"),
          " " + t(R.escribiendo ? "app.retocar.llm.escribiendo" : "app.retocar.llm"))),
        el("textarea", { class: "max-rt-prompt", rows: 5, placeholder: t("app.retocar.prompt.placeholder"), disabled: ocupado,
                         oninput: (e) => { R.prompt = e.target.value; guardar(); },
                         ondragover: (e) => e.currentTarget.classList.add("soltar"),
                         ondragleave: (e) => e.currentTarget.classList.remove("soltar"),
                         ondrop: (e) => e.currentTarget.classList.remove("soltar") }, R.prompt)),
      el("div", { class: "max-rt-fila max-rt-final" },
        el("label", { class: "max-rt-semilla", title: t("app.retocar.semilla.tooltip") }, el("span", {}, t("app.retocar.semilla")),
          el("input", { type: "number", min: 0, step: 1, value: R.semilla, disabled: ocupado,
                        onchange: (e) => { R.semilla = Math.max(0, Math.round(+e.target.value || 0)); guardar(); } }),
          el("button", { class: "epl-mini", disabled: ocupado, title: t("app.semilla.otra.tooltip"),
                         onclick: () => { R.semilla = Math.floor(Math.random() * 2 ** 32); guardar(); pintar(); } }, icono("semilla"))),
        el("span", { class: "max-rt-cola", title: t("app.cola.encolar.tooltip") },
          el("input", { type: "number", min: 1, max: 20, step: 1, value: R.colaN || 1, class: "max-cola-n", "aria-label": t("app.cola.n"),
                        oninput: (e) => {          // el botón dice al momento cuántos encola (28 oct: antes, ×3 hasta repintar)
                          R.colaN = Math.max(1, Math.min(20, Math.round(+e.target.value || 1)));
                          e.target.nextElementSibling?.replaceChildren(icono("mas"), " " + t("app.cola.encolar", { n: R.colaN }));
                        } }),
          el("button", { class: "max-boton", disabled: !R.info, onclick: () => retocar(R.colaN || 1) }, icono("mas"), " " + t("app.cola.encolar", { n: R.colaN || 1 }))),
        el("button", { class: "max-generar max-rt-boton", disabled: !R.info, title: t("app.retocar.boton.tooltip"), onclick: () => retocar(1) },
          t("app.retocar.boton"))),
      ...(R.error ? [el("div", { class: "max-rt-error" }, R.error)] : []),   // replaceChildren escribiría «null»
      avanceEl);
  }

  // la sección va al final del cuerpo de la ventana (después de «Prompt final»); la ventana se crea de nuevo al abrir un proyecto
  function colocar() {
    const cuerpo = document.querySelector(".epl-fondo .epl-cuerpo");
    if (cuerpo && sec.parentNode !== cuerpo) cuerpo.append(sec);
    pintar();
  }
  const ver = () => sec.scrollIntoView({ behavior: "smooth", block: "start" });

  return { R, sec, cargar, colocar, pintar, ver, alAbrirProyecto, alCambiarCola };
}
