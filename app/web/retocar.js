/* MAX EDITOR · «Retocar el video»: la sección de abajo del todo, después de «Prompt final» (planos/fases/7, sección 10).
 * Una segunda línea de tiempo solo para retocar, con el último video generado (o el que se ponga desde «Videos»):
 *   - un reproductor con una capa encima para dibujar el rectángulo de la máscara (con esquinas para ajustarlo);
 *   - la línea de tiempo del clip entero con un tramo de dos asas, que siempre mide 17n+5 fotogramas (lo que pide H3):
 *     pulsar y arrastrar lo dibuja desde el punto pulsado, cada asa mueve solo su borde y el centro lo mueve entero;
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

export function crear({ el, icono, t, num, pedir, A, avisar, alTerminar }) {
  const R = { video: "", info: null, f0: 0, n: 39, modo: "rectangulo", texto: "face", rect: null, refs: [], prompt: "", mp: MP_NORMAL,
              semilla: Math.floor(Math.random() * 2 ** 32), trabajo: null, avance: null, error: "", elegir: false };
  const clave = () => "max-editor-retocar:" + (A.proyecto || "");
  const guardar = () => {
    const { video, f0, n, modo, texto, rect, refs, prompt, semilla, mp } = R;
    try { localStorage.setItem(clave(), JSON.stringify({ video, f0, n, modo, texto, rect, refs, prompt, semilla, mp })); } catch { /* sin almacenamiento */ }
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
  sec.append(cabeza, el("div", { class: "max-rt-cuerpo" },
    el("div", { class: "max-rt-izq" }, marco, transporte, verFila, linea, bajoVideo), lado));

  const fps = () => R.info?.fps || 24;
  const total = () => R.info?.fotogramas || 0;
  const valido = (n) => 17 * Math.max(1, Math.round((n - 5) / 17)) + 5;
  const ajustar = (f0, n) => {                 // el tramo siempre dentro del clip y de 17n+5
    n = valido(n);
    while (n > 22 && n > total()) n -= 17;
    R.n = n;
    R.f0 = Math.max(0, Math.min(Math.round(f0), total() - n));
  };
  const enMarcha = () => R.trabajo && !["listo", "error"].includes(R.avance?.estado);

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
                        refs: g.refs || [], prompt: g.prompt || "", semilla: g.semilla ?? R.semilla, mp: g.mp || MP_NORMAL } : {});
    video.removeAttribute("src");
    video.load();
    if (g?.video) await cargar(g.video, { mantener: true });               // si ya no existe, queda sin info y se sigue
    if (!R.info && A.videos[0]) { R.error = ""; await cargar(A.videos[0].archivo, { mantener: true }); }
    pintar();
  }

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
    if (soloTramo && !enMascara() && video.currentTime >= segundos(R.f0 + R.n)) { video.pause(); soloTramo = false; video.currentTime = segundos(R.f0); }
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
    transporte.replaceChildren(
      b("max-rt-paso", "app.retocar.reproductor.menos5", () => saltar(-5), t("app.retocar.reproductor.menos5_corto")),
      b("max-rt-paso", "app.retocar.reproductor.atras", () => fotograma(-1), icono("atras")),
      el("button", { class: "max-rt-play", title: t(video.paused ? "app.retocar.reproductor.play" : "app.retocar.reproductor.pausa"),
                     "aria-label": t(video.paused ? "app.retocar.reproductor.play" : "app.retocar.reproductor.pausa"),
                     onclick: () => { soloTramo = false; if (video.paused) video.play().catch(() => {}); else video.pause(); } },
        icono(ICONO_PLAY[video.paused])),
      b("max-rt-paso", "app.retocar.reproductor.adelante", () => fotograma(1), icono("adelante")),
      b("max-rt-paso", "app.retocar.reproductor.mas5", () => saltar(5), t("app.retocar.reproductor.mas5_corto")),
      lectura,
      el("span", { class: "epl-ayuda" }, t("app.retocar.reproductor.teclas")));
    pintarLectura();
  }
  document.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key) || !R.info || !sec.offsetParent || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".epl-capa, .max-videos.ver")) return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    if (e.shiftKey) saltar(5 * d); else fotograma(d);
  });

  // ---- la línea de tiempo: el clip entero, el tramo con dos asas y el cursor
  const tramoEl = el("div", { class: "max-rt-tramo" }, el("span", { class: "max-rt-asa izq" }), el("span", { class: "max-rt-asa der" }));
  const cursor = el("div", { class: "max-rt-cursor" });
  linea.append(tramoEl, cursor);
  // el tiempo del clip entero: con la vista de la máscara, el visor tiene solo el tramo (su 0 es el inicio del tramo)
  const enMascara = () => R.vista === "mascara" && !!R.mascara;
  const tiempoClip = () => video.currentTime + (enMascara() ? segundos(R.mascara.f0) : 0);
  function pintarCursor() {
    if (!R.info) return;
    cursor.style.left = (100 * tiempoClip() / R.info.duracion).toFixed(3) + "%";
  }
  function pintarTramo() {
    if (!R.info) { tramoEl.style.display = "none"; return; }
    tramoEl.style.display = "";
    tramoEl.style.left = (100 * R.f0 / total()) + "%";
    tramoEl.style.width = (100 * R.n / total()) + "%";
  }
  const fotogramaEn = (x) => { const r = linea.getBoundingClientRect(); return (x - r.left) / r.width * total(); };
  /* elegir el tramo (27 oct), siempre en largos válidos de H3 (17n+5) y con el otro borde quieto:
   *   - pulsar en la línea y arrastrar: el punto pulsado es el inicio y el final va hacia donde arrastras (hacia la
   *     izquierda, el punto pulsado es el final); un clic sin arrastrar solo mueve el cursor;
   *   - el asa de inicio o la de final: mueve solo ese borde;
   *   - el centro del tramo: lo mueve entero sin cambiar su largo. */
  const largoHasta = (d, max) => {             // el largo válido más cercano a d que cabe en max (al menos 22)
    let n = valido(Math.max(22, d));
    while (n > 22 && n > max) n -= 17;
    return n;
  };
  const ponerDesde = (ancla, f) => {           // un borde quieto en `ancla` y el otro hacia el fotograma f
    if (f >= ancla) { R.f0 = Math.max(0, Math.min(ancla, total() - 22)); R.n = largoHasta(f - R.f0, total() - R.f0); }
    else { const fin = Math.max(22, Math.min(ancla, total())); R.n = largoHasta(fin - f, fin); R.f0 = fin - R.n; }
  };
  linea.addEventListener("pointerdown", (e) => {
    if (!R.info || enMarcha()) return;
    const asa = e.target.closest(".max-rt-asa"), enTramo = e.target.closest(".max-rt-tramo");
    const modo = asa ? (asa.classList.contains("izq") ? "izq" : "der") : enTramo ? "mover" : "nuevo";
    e.preventDefault();
    try { linea.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    const x0 = e.clientX, f = Math.round(fotogramaEn(e.clientX)), inicio = { f0: R.f0, n: R.n };
    let movido = false;
    const mover = (ev) => {
      if (!movido && Math.abs(ev.clientX - x0) < 4) return;
      movido = true;
      const fx = Math.round(fotogramaEn(ev.clientX)), fin = inicio.f0 + inicio.n;
      if (modo === "mover") ajustar(inicio.f0 + fx - f, inicio.n);
      else if (modo === "izq") ponerDesde(fin, fx);           // el final, quieto
      else if (modo === "der") ponerDesde(inicio.f0, fx);     // el inicio, quieto
      else ponerDesde(f, fx);                                 // el punto pulsado, quieto
      video.currentTime = segundos(modo === "der" || (modo === "nuevo" && fx >= f) ? R.f0 + R.n - 1 : R.f0);
      pintarTramo();
      pintarBajo();
    };
    const soltar = () => {
      linea.removeEventListener("pointermove", mover); linea.removeEventListener("pointerup", soltar);
      linea.removeEventListener("pointercancel", soltar);
      if (!movido && modo === "nuevo") video.currentTime = Math.max(0, Math.min(R.info.duracion, segundos(f)));   // un clic: el cursor salta ahí
      if (movido) guardar();
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
    capa.classList.toggle("dibujar", R.modo === "rectangulo" && !!R.info && !enMarcha());
    rectEl.style.display = ver ? "" : "none";
    if (!ver) return;
    const { x, y, w, h } = R.rect, W = R.info.ancho, H = R.info.alto;
    Object.assign(rectEl.style, { left: 100 * x / W + "%", top: 100 * y / H + "%", width: 100 * w / W + "%", height: 100 * h / H + "%" });
  }
  capa.addEventListener("pointerdown", (e) => {
    if (R.modo !== "rectangulo" || !R.info || enMarcha()) return;
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
  const datosMascara = () => ({ video: R.video, inicio: segundos(R.f0) + 0.001, fin: segundos(R.f0 + R.n) + 0.001, megapixeles: R.mp,
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
      R.mascara = { video: a.video, f0: R.f0, n: R.n, firma, segundos: a.segundos };
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
    const escala = R.n / 39 * R.mp / MP_NORMAL;          // más fotogramas o más píxeles, más minutos
    const lo = Math.max(1, Math.round(MIN_POR_39[0] * escala)), hi = Math.max(lo + 1, Math.round(MIN_POR_39[1] * escala));
    bajoVideo.replaceChildren(
      el("button", { class: "epl-mini", title: t("app.retocar.reproducir.tooltip"), onclick: () => (video.paused ? reproducirTramo() : video.pause()) },
        t(video.paused ? "app.retocar.reproducir" : "app.retocar.pausa")),
      el("span", { class: "max-rt-tramo-info" },
        el("span", {}, t("app.retocar.tramo.inicio", { f: R.f0, s: num(segundos(R.f0), 3) })),
        el("span", {}, t("app.retocar.tramo.fin", { f: R.f0 + R.n, s: num(segundos(R.f0 + R.n), 3) })),
        el("b", {}, t("app.retocar.tramo.largo", { n: R.n, s: num(R.n / fps(), 3) }))),
      el("span", { class: "epl-ayuda" }, t("app.retocar.estimado", { lo, hi })),
      ...(R.modo === "rectangulo" && R.rect ? [el("span", { class: "epl-ayuda" }, t("app.retocar.rect_info", R.rect))] : []));
  }

  // ---- referencias: del Stack del proyecto (su foto original) o subidas
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
  async function retocar() {
    if (enMarcha()) return;
    const falta = !R.info ? "app.retocar.falta.video" : R.modo === "rectangulo" && !R.rect ? "app.retocar.falta.rect"
      : R.modo === "texto" && !R.texto.trim() ? "app.retocar.falta.texto" : !R.prompt.trim() ? "app.retocar.falta.prompt" : "";
    if (falta) { R.error = t(falta); return pintar(); }
    const datos = { video: R.video, inicio: segundos(R.f0) + 0.001, fin: segundos(R.f0 + R.n) + 0.001,
                    mascara: R.modo === "texto" ? { modo: "texto", texto: R.texto.trim() } : { modo: "rectangulo", ...R.rect },
                    referencias: R.refs.map(({ refmod, imagen }) => (refmod ? { refmod } : { imagen })),
                    prompt: R.prompt.trim(), semilla: R.semilla, proyecto: A.proyecto, megapixeles: R.mp };
    R.ultimoPedido = datos;                         // para probar desde la consola
    try {
      R.error = "";
      const r = await pedir("/app/retocar", datos);
      R.trabajo = r.id;
      R.avance = { estado: "en_cola", avance: 0, mensaje: "" };
      pintar();
      seguir(r.id);
    } catch (e) { R.error = e.message; pintar(); }
  }
  async function seguir(id) {
    while (R.trabajo === id) {
      try { R.avance = await pedir("/app/trabajo/" + id); } catch (e) { R.avance = { ...(R.avance || {}), mensaje: e.message }; }
      pintarAvance();
      if (R.avance.estado === "listo") {
        await alTerminar?.();
        await cargar(R.avance.video, { mantener: true });
        avisar(t("app.retocar.listo_aviso", { video: R.avance.video }), "bien");
        return pintar();
      }
      if (R.avance.estado === "error") return pintar();
      await new Promise((ok) => setTimeout(ok, 1500));
    }
  }

  // ---- el avance (como el de Generar, pero dentro de la sección)
  const avanceEl = el("div", { class: "max-rt-avance" });
  function pintarAvance() {
    const a = R.avance;
    avanceEl.className = "max-rt-avance" + (a ? " ver" : "") + (a?.estado === "error" ? " mal" : "");
    if (!a) return avanceEl.replaceChildren();
    const seg = num(a.segundos || 0, 0);
    const texto = a.estado === "error" ? t("app.avance.error", { mensaje: a.mensaje || "" })
      : a.estado === "listo" ? t("app.retocar.listo", { s: seg })
      : a.paso && a.pasos ? t("app.avance.paso", { paso: a.paso, pasos: a.pasos, s: seg, nodo: a.nodo || "" })
      : t(a.estado === "generando" ? "app.avance.generando" : "app.avance.en_cola", { s: seg });
    const barra = el("div", { class: "max-barra" }, el("b", { style: { width: Math.round((a.estado === "listo" ? 1 : a.avance || 0) * 100) + "%" } }));
    avanceEl.replaceChildren(el("span", { class: "max-texto" }, texto), barra,
      enMarcha() ? el("button", { class: "max-boton", onclick: () => pedir("/app/cancelar/" + R.trabajo, {}).catch(() => {}) }, t("app.avance.cancelar"))
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
  function pintar() {
    const nombre = R.video ? R.video.replace(/ \[(input|output)\]$/, "") : "";
    cabeza.replaceChildren(el("span", {}, t("app.retocar.titulo")),
      el("span", { class: "max-rt-nombre", title: nombre }, nombre ? t("app.retocar.video", { video: nombre }) : ""),
      el("span", { class: "der" }, el("span", { class: "epl-ayuda" }, t("app.retocar.desde_videos")),
        el("button", { class: "epl-boton epl-azul max-rt-cargar", title: t("app.retocar.cargar.tooltip"), disabled: enMarcha(),
          onclick: () => archivoVideo.click() }, t("app.retocar.cargar"))));
    const [w, h] = R.info ? [R.info.ancho, R.info.alto] : [16, 9];
    marco.style.aspectRatio = `${w} / ${h}`;
    marco.style.width = `min(100%, calc(62vh * ${w} / ${h}))`;   // cabe a lo ancho y a lo alto sin deformarse
    pintarVacio();
    pintarTransporte();
    pintarVer();
    pintarTramo();
    pintarCursor();
    pintarRect();
    pintarBajo();
    pintarAvance();
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
    lado.replaceChildren(
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.retocar.mascara")),
        el("div", { class: "max-rt-fila" }, modoBoton("texto", "app.retocar.mascara.texto"), modoBoton("rectangulo", "app.retocar.mascara.rect")),
        R.modo === "texto"
          ? el("input", { class: "max-rt-texto", value: R.texto, placeholder: t("app.retocar.mascara.texto.placeholder"), disabled: ocupado,
                          oninput: (e) => { R.texto = e.target.value; guardar(); } })
          : el("span", { class: "epl-ayuda" }, t(R.rect ? "app.retocar.mascara.rect.ayuda_hecho" : "app.retocar.mascara.rect.ayuda")),
        R.modo === "texto" ? el("span", { class: "epl-ayuda" }, t("app.retocar.mascara.texto.ayuda")) : null),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.retocar.refs", { n: R.refs.length, max: MAX_REFS })),
        el("div", { class: "max-rt-refs" }, tarjetas),
        el("div", { class: "max-rt-fila" },
          el("button", { class: "epl-mini" + (R.elegir ? " fijo" : ""), disabled: lleno || ocupado, title: t("app.retocar.refs.proyecto.tooltip"),
                         onclick: () => { R.elegir = !R.elegir; pintar(); } }, t("app.retocar.refs.proyecto")),
          el("button", { class: "epl-mini", disabled: lleno || ocupado, title: t("app.retocar.refs.subir.tooltip"), onclick: () => archivo.click() },
            t("app.retocar.refs.subir")), archivo),
        selector,
        el("span", { class: "epl-ayuda" }, t("app.retocar.refs.ayuda"))),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta", title: t("app.retocar.resolucion.tooltip") }, t("app.retocar.resolucion")),
        el("div", { class: "max-rt-fila", role: "group" }, ...RESOLUCIONES.map(([k, mp]) => el("button", {
          class: "epl-mini epl-seg" + (Math.abs(R.mp - mp) < 1e-6 ? " fijo" : ""), disabled: ocupado, "data-mp": mp,
          title: t("app.retocar.resolucion.mp", { mp: num(mp * 1.048576, 2) }),
          onclick: () => { R.mp = mp; guardar(); pintar(); } }, t(`app.retocar.resolucion.${k}`, { mp: num(mp * 1.048576, 2) })))),
        el("span", { class: "epl-ayuda" }, t("app.retocar.resolucion.ayuda"))),
      el("div", { class: "max-rt-bloque" }, el("div", { class: "max-rt-etiqueta" }, t("app.retocar.prompt")),
        el("span", { class: "max-rt-arrastra" }, t("app.retocar.prompt.arrastra")),
        el("textarea", { class: "max-rt-prompt", rows: 5, placeholder: t("app.retocar.prompt.placeholder"), disabled: ocupado,
                         oninput: (e) => { R.prompt = e.target.value; guardar(); },
                         ondragover: (e) => e.currentTarget.classList.add("soltar"),
                         ondragleave: (e) => e.currentTarget.classList.remove("soltar"),
                         ondrop: (e) => e.currentTarget.classList.remove("soltar") }, R.prompt),
        el("span", { class: "epl-ayuda" }, t("app.retocar.prompt.ayuda"))),
      el("div", { class: "max-rt-fila max-rt-final" },
        el("label", { class: "max-rt-semilla", title: t("app.retocar.semilla.tooltip") }, el("span", {}, t("app.retocar.semilla")),
          el("input", { type: "number", min: 0, step: 1, value: R.semilla, disabled: ocupado,
                        onchange: (e) => { R.semilla = Math.max(0, Math.round(+e.target.value || 0)); guardar(); } }),
          el("button", { class: "epl-mini", disabled: ocupado, title: t("app.semilla.otra.tooltip"),
                         onclick: () => { R.semilla = Math.floor(Math.random() * 2 ** 32); guardar(); pintar(); } }, icono("semilla"))),
        el("button", { class: "max-generar max-rt-boton", disabled: ocupado || !R.info, title: t("app.retocar.boton.tooltip"), onclick: retocar },
          t(ocupado ? "app.retocar.boton.trabajando" : "app.retocar.boton"))),
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

  return { R, sec, cargar, colocar, pintar, ver, alAbrirProyecto };
}
