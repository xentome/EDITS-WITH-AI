/* MAX EDITOR · el apartado 3 «Edición» (29 oct, variante P1 «Mesa de montaje» de app/web/prototipo_edicion.html, elegida
 * por Jonathan): juntar trozos de los videos de la biblioteca y audios en una línea de tiempo, con las herramientas de
 * DaVinci Resolve (no su interfaz):
 *   - mover y recortar (A): arrastrar un clip (también a otra pista del mismo tipo); tirar de una orilla lo acorta y
 *     estirarla lo devuelve hasta su largo original (se ve en punteado), nunca más;
 *   - cuchilla (B) y «Cortar aquí» (Ctrl+B, en el cabezal); Supr borra y Mayús+Supr cierra el hueco; imán (N) a bordes y
 *     cabezal; todo cae en un fotograma exacto (24 fps); ← → un fotograma, Mayús un segundo; espacio reproduce;
 *   - varias pistas de video (la de más arriba tapa a las de abajo) y de audio, con ojo y altavoz; soltar encima de otro
 *     clip lo recorta (sobrescribir, como DaVinci);
 *   - la biblioteca: todos los videos (carpetas por proyecto) y los audios de ComfyUI/input; «Cargar audio» sube uno.
 * La línea de tiempo se guarda sola por proyecto (POST /app/edicion/<proyecto>) y «Exportar video» la une con ffmpeg en el
 * servidor (app/edicion.py): el mp4 (montaje_….mp4) entra en la biblioteca. */
const FPS = 24, IMAN_PX = 9, MARGEN_S = 4;
const CLASE_HERR = { true: "max-boton max-ed-herr activa", false: "max-boton max-ed-herr" };
const CLASE_CUERPO = { true: "max-ed-cuerpo cuchilla", false: "max-ed-cuerpo" };
const ICONO_VER = { true: "ojo", false: "ojono" }, ICONO_OIR = { true: "sonido", false: "mudo" }, ICONO_TOCAR = { true: "pausa", false: "play" };
const LETRA_PISTA = { video: "V", audio: "A" };
const TECLA = { mover: "A", cuchilla: "B", iman: "N" };
const CARPETA_AUDIOS = "\u0000audios";                  // la carpeta «Audios» de la biblioteca (no es un proyecto)

export function crear({ el, icono, t, num, pedir, A, avisar, alTerminar }) {
  const E = { zoom: 90, t: 0, tocando: false, herramienta: "mover", iman: true, elegidos: new Set(), imanX: null,
              pistas: pistasNuevas(), fuentes: [], cargado: null, exportando: false, aviso: "" };
  let idClip = 1;
  function pistasNuevas() {
    return [{ id: "V2", tipo: "video", clips: [], ver: true, oir: true }, { id: "V1", tipo: "video", clips: [], ver: true, oir: true },
            { id: "A1", tipo: "audio", clips: [], ver: true, oir: true }, { id: "A2", tipo: "audio", clips: [], ver: true, oir: true }];
  }
  const largo = (c) => c.fin - c.ini;
  const finDe = (c) => c.en + largo(c);
  const total = () => Math.max(10, ...E.pistas.flatMap((p) => p.clips.map(finDe))) + MARGEN_S;
  const duracion = () => Math.max(0, ...E.pistas.flatMap((p) => p.clips.map(finDe)));
  const aFot = (s) => Math.round(s * FPS) / FPS;
  const tc = (s) => { const f = Math.round(Math.max(0, s) * FPS), ss = Math.floor(f / FPS);
    return `${String(Math.floor(ss / 60)).padStart(2, "0")}:${String(ss % 60).padStart(2, "0")}:${String(f % FPS).padStart(2, "0")}`; };
  const pistaDe = (id) => E.pistas.find((p) => p.id === id);
  const clipDe = (id) => { for (const p of E.pistas) { const c = p.clips.find((x) => x.id === id); if (c) return [p, c]; } return [null, null]; };
  const srcDe = (f) => f.tipo === "video" ? "/app/salidas/" + encodeURIComponent(f.fuente) : "/app/video?video=" + encodeURIComponent(f.fuente);

  // ---------------------------------------------------------------- guardar (solo, por proyecto)
  let temporizador = null;
  function guardar() {
    clearTimeout(temporizador);
    const proyecto = A.proyecto;
    temporizador = setTimeout(() => {
      const pistas = E.pistas.map((p) => ({ id: p.id, tipo: p.tipo, ver: p.ver, oir: p.oir,
        clips: p.clips.map((c) => ({ fuente: c.fuente, nombre: c.nombre, tipo: c.tipo, dur: c.dur, ini: c.ini, fin: c.fin, en: c.en })) }));
      pedir("/app/edicion/" + encodeURIComponent(proyecto), { pistas, zoom: E.zoom, lienzo: E.lienzo || null }).catch(() => {});
    }, 700);
  }
  async function alAbrirProyecto() {
    E.tocando = false; E.t = 0; E.elegidos.clear();
    let d = {};
    try { d = await pedir("/app/edicion/" + encodeURIComponent(A.proyecto)); } catch { /* sin guardar: vacía */ }
    E.pistas = Array.isArray(d.pistas) && d.pistas.length ? d.pistas.map((p) => ({ ...p, clips: (p.clips || []).map((c) => ({ ...c, id: idClip++ })) })) : pistasNuevas();
    E.zoom = +d.zoom || 90;
    E.lienzo = d.lienzo || null;
    E.cargado = A.proyecto;
    if (activo()) await cargarBiblioteca();
    pintar();
  }

  // ---------------------------------------------------------------- la biblioteca: los videos (con su duración) y los audios
  async function cargarBiblioteca() {
    let videos = [], audios = [];
    try { [videos, audios] = await Promise.all([pedir("/app/videos"), pedir("/app/edicion_audios")]); } catch { /* sin servidor */ }
    const antes = new Map(E.fuentes.map((f) => [f.fuente, f]));
    E.fuentes = [
      ...videos.map((v) => antes.get(v.archivo) || { fuente: v.archivo, tipo: "video", nombre: v.archivo.replace(/\.mp4$/, ""), proyecto: v.proyecto || "",
                                                     mini: "/app/miniatura?video=" + encodeURIComponent(v.archivo), dur: 0 }),
      ...audios.map((a) => antes.get(a.fuente) || { fuente: a.fuente, tipo: "audio", nombre: a.nombre, dur: 0 })];
    pintarBin();
  }
  // la duración (y el tamaño) de un video, una vez; la de un audio, con su metadato
  async function medir(f) {
    if (f.dur) return f;
    if (f.tipo === "video") {
      try { const i = await pedir("/app/video_info?video=" + encodeURIComponent(f.fuente)); Object.assign(f, { dur: i.duracion || 1, ancho: i.ancho, alto: i.alto }); }
      catch { f.dur = 1; }
    } else {
      f.dur = await new Promise((r) => { const a = new Audio(); a.preload = "metadata"; a.onloadedmetadata = () => r(a.duration || 1); a.onerror = () => r(1); a.src = srcDe(f); });
    }
    return f;
  }

  // ---------------------------------------------------------------- las operaciones (como DaVinci)
  function sobrescribir(pista, s, e, salvo) {
    const nuevos = [];
    for (const c of pista.clips) {
      if (c.id === salvo || finDe(c) <= s || c.en >= e) { nuevos.push(c); continue; }
      if (c.en < s) nuevos.push({ ...c, fin: c.ini + (s - c.en) });
      if (finDe(c) > e) nuevos.push({ ...c, id: c.en < s ? idClip++ : c.id, ini: c.ini + (e - c.en), en: e });
    }
    pista.clips = nuevos;
  }
  function cortarEn(p, c, tt) {
    tt = aFot(tt);
    if (tt <= c.en + 1 / FPS || tt >= finDe(c) - 1 / FPS) return;
    const corte = c.ini + (tt - c.en);
    p.clips.push({ ...c, id: idClip++, ini: corte, en: tt });
    c.fin = corte;
  }
  function cortarCabezal() {
    for (const p of E.pistas) for (const c of [...p.clips])
      if ((!E.elegidos.size || E.elegidos.has(c.id)) && c.en < E.t && finDe(c) > E.t) cortarEn(p, c, E.t);
    cambio();
  }
  function borrar(rizo) {
    for (const p of E.pistas) for (const c of p.clips.filter((x) => E.elegidos.has(x.id))) {
      p.clips = p.clips.filter((x) => x !== c);
      if (rizo) for (const o of p.clips) if (o.en >= finDe(c)) o.en = aFot(o.en - largo(c));
    }
    E.elegidos.clear();
    cambio();
  }
  function imantar(x, salvo) {
    if (!E.iman) return [x, null];
    let mejor = null;
    const puntos = [0, E.t];
    for (const p of E.pistas) for (const c of p.clips) if (!salvo.has(c.id)) puntos.push(c.en, finDe(c));
    for (const y of puntos) if (Math.abs(y - x) * E.zoom < IMAN_PX && (mejor === null || Math.abs(y - x) < Math.abs(mejor - x))) mejor = y;
    return mejor === null ? [x, null] : [mejor, mejor];
  }
  async function anadir(f, pista, en) {
    await medir(f);
    const p = pista && pista.tipo === f.tipo ? pista : E.pistas.find((x) => x.tipo === f.tipo && (f.tipo === "audio" || x.id === "V1")) || E.pistas.find((x) => x.tipo === f.tipo);
    if (!p) return;
    if (f.tipo === "video" && !E.lienzo && f.ancho) E.lienzo = { ancho: f.ancho, alto: f.alto };   // el primer video manda el tamaño
    const c = { id: idClip++, fuente: f.fuente, nombre: f.nombre, tipo: f.tipo, dur: f.dur, ini: 0, fin: f.dur, en: aFot(Math.max(0, en)) };
    sobrescribir(p, c.en, finDe(c), null);
    p.clips.push(c);
    E.elegidos = new Set([c.id]);
    cambio();
  }
  function cambio() { guardar(); pintar(); }

  // ---------------------------------------------------------------- reproducir: un <video>/<audio> por pista
  const medios = {};
  const lienzo = el("div", { class: "max-ed-lienzo" }, el("div", { class: "max-ed-negro" }, t("app.edicion.sin_clip")));
  function medioDe(p) {
    if (!medios[p.id]) medios[p.id] = Object.assign(document.createElement(p.tipo), { preload: "auto", playsInline: true });
    return medios[p.id];
  }
  function sincronizar(forzar = false) {
    let alguno = false;
    E.pistas.forEach((p, i) => {
      const m = medioDe(p);
      if (p.tipo === "video" && m.parentNode !== lienzo) lienzo.append(m);
      if (p.tipo === "video") m.style.zIndex = String(50 - i);
      const c = p.clips.find((x) => x.en <= E.t && finDe(x) > E.t);
      if (!c || !p.ver) { m.style.display = "none"; if (!m.paused) m.pause(); return; }
      if (p.tipo === "video") { m.style.display = "block"; alguno = true; }
      const src = srcDe(c);
      if (m.dataset.src !== src) { m.dataset.src = src; m.src = src; }
      m.muted = !p.oir;
      const debe = c.ini + (E.t - c.en);
      if (forzar || Math.abs(m.currentTime - debe) > (E.tocando ? 0.2 : 0.02)) { try { m.currentTime = debe; } catch { /* aún sin datos */ } }
      if (E.tocando && m.paused) m.play().catch(() => {});
      if (!E.tocando && !m.paused) m.pause();
    });
    for (const [id, m] of Object.entries(medios)) if (!pistaDe(id)) { m.pause(); m.style.display = "none"; }
    lienzo.firstChild.hidden = alguno;
  }
  let ultimo = 0;
  function bucle(ahora) {
    if (E.tocando) {
      E.t += (ahora - ultimo) / 1000;
      if (E.t >= duracion()) { E.t = duracion(); E.tocando = false; pintarTransporte(); }
      pintarCabezal(); sincronizar();
    }
    ultimo = ahora;
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);
  function tocar() { if (!E.tocando && E.t >= duracion() - 1 / FPS) E.t = 0; E.tocando = !E.tocando; sincronizar(true); pintarTransporte(); }
  function irA(x) { E.t = Math.min(Math.max(0, aFot(x)), total()); sincronizar(true); pintarCabezal(); }

  // ---------------------------------------------------------------- las piezas que no se vuelven a crear
  const sec = el("section", { class: "epl-sec max-ed" });
  const bin = el("div", { class: "max-ed-bin" });
  const tcEl = el("span", { class: "max-ed-tc" });
  const durEl = el("span", { class: "max-ed-dur" });
  const botonTocar = el("button", { class: "max-ed-play", title: t("app.edicion.tocar.tooltip"), onclick: () => tocar() });
  const herr = el("div", { class: "max-ed-herrs" });
  const lt = el("div", { class: "max-ed-lt" });
  const info = el("div", { class: "max-ed-info" });
  const pie = el("div", { class: "max-ed-pie" });
  const subir = el("input", { type: "file", accept: "audio/*", multiple: true, style: { display: "none" }, onchange: (e) => subirAudios(e) });
  const boton = (ic, clave, tooltip, accion, extra = {}) => el("button", { class: "max-boton", title: t(tooltip), onclick: accion, ...extra }, icono(ic), clave ? " " + t(clave) : "");
  sec.append(
    el("div", { class: "epl-tit max-ed-tit" }, el("span", {}, t("app.edicion.titulo")), el("span", { class: "epl-ayuda" }, t("app.edicion.ayuda"))),
    el("div", { class: "max-ed-arriba" },
      el("div", { class: "max-ed-panel" }, el("div", { class: "max-ed-cab" }, el("b", {}, t("app.edicion.biblioteca")), el("span", { class: "max-derecha" }),
        boton("musica", "app.edicion.cargar_audio", "app.edicion.cargar_audio.tooltip", () => subir.click()), subir), bin),
      el("div", { class: "max-ed-panel" }, el("div", { class: "max-ed-cab" }, el("b", {}, t("app.edicion.visor")), el("span", { class: "max-ed-nota" }, t("app.edicion.visor.nota"))),
        el("div", { class: "max-ed-visor" }, lienzo),
        el("div", { class: "max-ed-transporte" },
          boton("atras", "", "app.edicion.inicio.tooltip", () => irA(0)), boton("volver", "", "app.edicion.atras.tooltip", () => irA(E.t - 1 / FPS)),
          botonTocar, boton("adelante", "", "app.edicion.adelante.tooltip", () => irA(E.t + 1 / FPS)), tcEl, durEl))),
    el("div", { class: "max-ed-panel max-ed-abajo" }, el("div", { class: "max-ed-cab" }, el("b", {}, t("app.edicion.linea")), herr), lt, info),
    pie);

  function pintarBin() {
    const grupos = new Map();
    for (const f of E.fuentes) {
      const k = f.tipo === "audio" ? CARPETA_AUDIOS : f.proyecto;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(f);
    }
    const nombre = (k) => k === CARPETA_AUDIOS ? t("app.edicion.audios") : k || t("app.biblio.sin_proyecto");
    bin.replaceChildren(...(E.fuentes.length ? [...grupos.entries()].flatMap(([k, fs]) => [
      el("div", { class: "max-ed-carpeta" }, icono("carpeta"), " " + nombre(k)),
      ...fs.map((f) => el("div", { class: "max-ed-fuente " + f.tipo, draggable: "true", title: t("app.edicion.fuente.tooltip"),
                                   ondragstart: (e) => e.dataTransfer.setData("text/max-fuente", f.fuente),
                                   ondblclick: () => anadir(f, null, Math.max(0, ...(E.pistas.find((p) => p.tipo === f.tipo && (f.tipo === "audio" || p.id === "V1"))?.clips || []).map(finDe))) },
        f.tipo === "video" ? el("img", { src: f.mini, alt: "", loading: "lazy", draggable: "false" }) : icono("musica"),
        el("span", {}, f.dur ? t("app.edicion.fuente.nombre", { s: num(f.dur, 1), nombre: f.nombre }) : f.nombre)))]) : [el("span", { class: "epl-ayuda" }, t("app.edicion.biblioteca.vacia"))]));
  }
  function pintarHerramientas() {
    const h = (k, ic, clave, tooltip, tecla) => el("button", { class: CLASE_HERR[E.herramienta === k], title: t(tooltip),
      onclick: () => { E.herramienta = k; pintar(); } }, icono(ic), " " + t(clave), el("span", { class: "max-ed-tecla" }, tecla));
    herr.replaceChildren(h("mover", "mano", "app.edicion.mover", "app.edicion.mover.tooltip", TECLA.mover), h("cuchilla", "tijeras", "app.edicion.cuchilla", "app.edicion.cuchilla.tooltip", TECLA.cuchilla), el("span", { class: "max-ed-sep" }),
      el("button", { class: CLASE_HERR[E.iman], title: t("app.edicion.iman.tooltip"), onclick: () => { E.iman = !E.iman; pintar(); } },
        icono("pin"), " " + t("app.edicion.iman"), el("span", { class: "max-ed-tecla" }, TECLA.iman)),
      boton("tijeras", "app.edicion.cortar", "app.edicion.cortar.tooltip", () => cortarCabezal()),
      boton("papelera", "app.edicion.borrar", "app.edicion.borrar.tooltip", (e) => borrar(e.shiftKey), { disabled: !E.elegidos.size }), el("span", { class: "max-ed-sep" }),
      el("button", { class: "max-boton max-ed-zoom", title: t("app.edicion.alejar.tooltip"), onclick: () => { E.zoom = Math.max(8, E.zoom / 1.4); cambio(); } }, "−"),
      boton("mas", "", "app.edicion.acercar.tooltip", () => { E.zoom = Math.min(400, E.zoom * 1.4); cambio(); }),
      boton("capas", "app.edicion.pista_video", "app.edicion.pista_video.tooltip", () => nuevaPista("video")),
      boton("capas", "app.edicion.pista_audio", "app.edicion.pista_audio.tooltip", () => nuevaPista("audio")));
  }
  function nuevaPista(tipo) {
    const n = E.pistas.filter((p) => p.tipo === tipo).length + 1, letra = LETRA_PISTA[tipo];
    const p = { id: letra + n, tipo, clips: [], ver: true, oir: true };
    tipo === "video" ? E.pistas.unshift(p) : E.pistas.push(p);
    cambio();
  }
  function pintarLT() {
    const T = total(), ancho = T * E.zoom, viejo = lt.querySelector(".max-ed-cuerpo");
    const [sx, sy] = [viejo?.scrollLeft || 0, viejo?.scrollTop || 0];
    const paso = E.zoom > 150 ? 0.5 : E.zoom > 60 ? 1 : E.zoom > 25 ? 2 : 5;
    const marcas = [];
    for (let s = 0; s <= T; s += paso) marcas.push(el("i", { style: { left: s * E.zoom + "px" } }, Number.isInteger(s) ? s + "s" : ""));
    const cabezas = el("div", { class: "max-ed-cabezas" }, el("div", { class: "max-ed-cabeza regla" }),
      ...E.pistas.map((p) => el("div", { class: "max-ed-cabeza " + p.tipo }, el("b", {}, p.id),
        p.tipo === "video" ? el("button", { class: p.ver ? "" : "off", title: t("app.edicion.ver.tooltip"), onclick: () => { p.ver = !p.ver; cambio(); } }, icono(ICONO_VER[p.ver])) : null,
        el("button", { class: p.oir ? "" : "off", title: t("app.edicion.oir.tooltip"), onclick: () => { p.oir = !p.oir; cambio(); } }, icono(ICONO_OIR[p.oir])),
        !p.clips.length && E.pistas.filter((x) => x.tipo === p.tipo).length > 1
          ? el("button", { title: t("app.edicion.quitar_pista.tooltip"), onclick: () => { E.pistas = E.pistas.filter((x) => x !== p); cambio(); } }, icono("x")) : null)));
    const pistas = el("div", { class: "max-ed-pistas", style: { width: ancho + "px" } },
      el("div", { class: "max-ed-regla", style: { width: ancho + "px" } }, ...marcas),
      ...E.pistas.map((p) => el("div", { class: "max-ed-pista " + p.tipo + (p.ver ? "" : " oculta"), "data-pista": p.id, style: { width: ancho + "px" } }, ...p.clips.map(clipEl))),
      el("div", { class: "max-ed-cabezal", style: { left: E.t * E.zoom + "px" } }));
    const cuerpo = el("div", { class: CLASE_CUERPO[E.herramienta === "cuchilla"] }, cabezas, pistas);
    lt.replaceChildren(cuerpo);
    cuerpo.scrollLeft = sx; cuerpo.scrollTop = sy;
  }
  function clipEl(c) {
    const f = E.fuentes.find((x) => x.fuente === c.fuente);
    return el("div", { class: "max-ed-clip " + c.tipo + (E.elegidos.has(c.id) ? " elegido" : ""), "data-clip": c.id,
                       style: { left: c.en * E.zoom + "px", width: Math.max(2, largo(c) * E.zoom) + "px" },
                       title: t("app.edicion.clip.tooltip", { nombre: c.nombre, usa: num(largo(c), 2), de: num(c.dur, 2) }) },
      c.tipo === "video" && f?.mini ? el("div", { class: "max-ed-tira", style: { backgroundImage: `url("${f.mini}")` } }) : el("div", { class: "max-ed-onda" }),
      el("b", {}, c.nombre), el("div", { class: "max-ed-asa izq", "data-asa": "izq" }), el("div", { class: "max-ed-asa der", "data-asa": "der" }));
  }
  function pintarCabezal() {
    const c = lt.querySelector(".max-ed-cabezal");
    if (c) c.style.left = E.t * E.zoom + "px";
    tcEl.textContent = tc(E.t);
    const r = lt.querySelector(".max-ed-cabeza.regla");
    if (r) r.textContent = tc(E.t);
  }
  function pintarTransporte() { botonTocar.replaceChildren(icono(ICONO_TOCAR[E.tocando])); }
  function pintarPie() {
    const n = E.pistas.reduce((x, p) => x + p.clips.length, 0);
    pie.replaceChildren(el("b", {}, t("app.edicion.resumen", { n, dur: tc(duracion()) })),
      E.lienzo ? el("span", { class: "epl-ayuda" }, t("app.edicion.lienzo", { w: E.lienzo.ancho, h: E.lienzo.alto })) : null,
      el("span", { class: "max-derecha" }),
      el("button", { class: "max-generar max-ed-exportar", disabled: !n || E.exportando, title: t("app.edicion.exportar.tooltip"), onclick: () => exportar() },
        icono("subir"), " " + t(E.exportando ? "app.edicion.exportando" : "app.edicion.exportar")));
  }
  function pintar() {
    if (!sec.isConnected) return;
    pintarHerramientas(); pintarLT(); pintarCabezal(); pintarTransporte(); pintarPie();
    durEl.textContent = "/ " + tc(duracion());
    lienzo.style.aspectRatio = E.lienzo ? `${E.lienzo.ancho} / ${E.lienzo.alto}` : "16 / 9";
    info.textContent = E.aviso || t("app.edicion.info");
    sincronizar(true);
  }

  // ---------------------------------------------------------------- las manos: clips, orillas, cabezal y biblioteca
  let gesto = null;
  const xAt = (e) => (e.clientX - lt.querySelector(".max-ed-pistas").getBoundingClientRect().left) / E.zoom;
  lt.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".max-ed-regla")) { gesto = { tipo: "cabezal" }; irA(xAt(e)); return; }
    const ce = e.target.closest(".max-ed-clip");
    if (!ce) { if (e.target.closest(".max-ed-pista")) { E.elegidos.clear(); pintar(); } return; }
    const [p, c] = clipDe(+ce.dataset.clip);
    if (!c) return;
    if (E.herramienta === "cuchilla") { cortarEn(p, c, imantar(xAt(e), new Set())[0]); cambio(); return; }
    if (e.shiftKey) E.elegidos.has(c.id) ? E.elegidos.delete(c.id) : E.elegidos.add(c.id);
    else if (!E.elegidos.has(c.id)) E.elegidos = new Set([c.id]);
    const asa = e.target.dataset.asa;
    gesto = asa ? { tipo: "asa", lado: asa, p, c, orig: { ...c } } : { tipo: "mover", p, c, orig: { ...c }, dt: xAt(e) - c.en };
    pintar();
  });
  addEventListener("pointermove", (e) => {
    if (!gesto) {
      const ce = E.herramienta === "cuchilla" && e.target.closest?.(".max-ed-clip");
      if (ce) ce.style.setProperty("--corte", e.clientX - ce.getBoundingClientRect().left + "px");
      return;
    }
    const x = xAt(e);
    if (gesto.tipo === "cabezal") return irA(x);
    const { c, orig } = gesto, salvo = new Set([c.id]);
    if (gesto.tipo === "asa") {
      const [nx, im] = imantar(x, salvo);
      if (gesto.lado === "izq") {                    // hasta el principio del original
        const en = Math.min(Math.max(nx, orig.en - orig.ini, 0), finDe(orig) - 1 / FPS);
        c.en = aFot(en); c.ini = aFot(orig.ini + (c.en - orig.en));
      } else {                                       // hasta el final del original
        const fin = Math.max(Math.min(nx, orig.en + (orig.dur - orig.ini)), orig.en + 1 / FPS);
        c.fin = aFot(orig.ini + (fin - orig.en));
      }
      E.imanX = im;
      E.aviso = t("app.edicion.recortando", { usa: num(largo(c), 2), de: num(c.dur, 2), desde: num(c.ini, 2) });
    } else {
      let inicio = Math.max(0, x - gesto.dt);
      const [a, ia] = imantar(inicio, salvo), [b, ib] = imantar(inicio + largo(c), salvo);
      if (ia !== null) inicio = a; else if (ib !== null) inicio = b - largo(c);
      E.imanX = ia ?? ib;
      c.en = aFot(Math.max(0, inicio));
      const bajo = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains("max-ed-pista"));
      const destino = bajo && pistaDe(bajo.dataset.pista);
      if (destino && destino.tipo === gesto.p.tipo && destino !== gesto.p) {
        gesto.p.clips = gesto.p.clips.filter((y) => y !== c); destino.clips.push(c); gesto.p = destino;
      }
      E.aviso = t("app.edicion.moviendo", { nombre: c.nombre, tc: tc(c.en), pista: gesto.p.id });
    }
    pintarArrastre();
  });
  addEventListener("pointerup", () => {
    if (!gesto) return;
    if (gesto.tipo !== "cabezal") sobrescribir(gesto.p, gesto.c.en, finDe(gesto.c), gesto.c.id);
    const fue = gesto.tipo;
    gesto = null; E.imanX = null; E.aviso = "";
    fue === "cabezal" ? pintarCabezal() : cambio();
  });
  // mientras se arrastra, solo se mueve el clip (y el punteado del original y la línea del imán): fluido
  function pintarArrastre() {
    const g = gesto, ce = lt.querySelector(`.max-ed-clip[data-clip="${g.c.id}"]`), pe = lt.querySelector(`.max-ed-pista[data-pista="${g.p.id}"]`);
    if (ce && pe && ce.parentNode !== pe) pe.append(ce);
    if (ce) { ce.style.left = g.c.en * E.zoom + "px"; ce.style.width = Math.max(2, largo(g.c) * E.zoom) + "px"; }
    lt.querySelectorAll(".max-ed-fantasma,.max-ed-iman").forEach((x) => x.remove());
    if (g.tipo === "asa" && pe) pe.append(el("div", { class: "max-ed-fantasma", style: { left: (g.c.en - g.c.ini) * E.zoom + "px", width: g.c.dur * E.zoom + "px" } }));
    if (E.imanX !== null) lt.querySelector(".max-ed-pistas").append(el("div", { class: "max-ed-iman", style: { left: E.imanX * E.zoom + "px" } }));
    info.textContent = E.aviso;
  }
  lt.addEventListener("dragover", (e) => {
    const pe = e.target.closest(".max-ed-pista");
    lt.querySelectorAll(".max-ed-pista.destino").forEach((x) => x !== pe && x.classList.remove("destino"));
    if (pe && e.dataTransfer.types.includes("text/max-fuente")) { e.preventDefault(); pe.classList.add("destino"); }
  });
  lt.addEventListener("drop", (e) => {
    const pe = e.target.closest(".max-ed-pista");
    lt.querySelectorAll(".max-ed-pista.destino").forEach((x) => x.classList.remove("destino"));
    const f = E.fuentes.find((x) => x.fuente === e.dataTransfer.getData("text/max-fuente"));
    if (!pe || !f) return;
    e.preventDefault();
    anadir(f, pistaDe(pe.dataset.pista), imantar(xAt(e), new Set())[0]);
  });
  // el teclado, solo con el apartado Edición a la vista y fuera de los campos de texto
  document.addEventListener("keydown", (e) => {
    if (!activo() || e.target.closest?.("input, textarea, select, [contenteditable]") || e.altKey) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    const hecho = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === " ") { hecho(); tocar(); }
    else if (k === "b" && ctrl) { hecho(); cortarCabezal(); }
    else if (ctrl) return;
    else if (k === "a") { hecho(); E.herramienta = "mover"; pintar(); }
    else if (k === "b") { hecho(); E.herramienta = "cuchilla"; pintar(); }
    else if (k === "n") { hecho(); E.iman = !E.iman; pintar(); }
    else if ((k === "delete" || k === "backspace") && E.elegidos.size) { hecho(); borrar(e.shiftKey); }
    else if (k === "arrowleft") { hecho(); irA(E.t - (e.shiftKey ? 1 : 1 / FPS)); }
    else if (k === "arrowright") { hecho(); irA(E.t + (e.shiftKey ? 1 : 1 / FPS)); }
    else if (k === "home") { hecho(); irA(0); }
    else if ("+=".includes(k)) { hecho(); E.zoom = Math.min(400, E.zoom * 1.4); cambio(); }
    else if (k === "-") { hecho(); E.zoom = Math.max(8, E.zoom / 1.4); cambio(); }
  }, true);

  // ---------------------------------------------------------------- subir audios y exportar
  async function subirAudios(e) {
    const archivos = [...e.target.files];
    e.target.value = "";
    for (const f of archivos) {
      const fd = new FormData();
      fd.append("archivo", f, f.name);
      try {
        const r = await fetch("/app/edicion_audio", { method: "POST", body: fd }).then((x) => x.json());
        if (r.error) throw new Error(r.error);
        avisar(t("app.edicion.audio_subido", { nombre: r.nombre }), "bien");
      } catch (err) { avisar(err.message, "mal"); }
    }
    await cargarBiblioteca();
  }
  async function exportar() {
    E.exportando = true; pintarPie();
    try {
      await new Promise((r) => { clearTimeout(temporizador); r(); });
      const pistas = E.pistas.map((p) => ({ id: p.id, tipo: p.tipo, ver: p.ver, oir: p.oir, clips: p.clips.map((c) => ({ fuente: c.fuente, ini: c.ini, fin: c.fin, en: c.en })) }));
      const r = await pedir("/app/edicion_exportar", { proyecto: A.proyecto, edicion: { pistas, lienzo: E.lienzo } });
      avisar(t("app.edicion.exportado", { archivo: r.archivo }), "bien");
      guardar();
      await alTerminar?.();
      await cargarBiblioteca();
    } catch (err) { avisar(t("app.edicion.error_exportar", { error: err.message }), "mal"); }
    E.exportando = false; pintarPie();
  }

  const activo = () => sec.isConnected && sec.offsetParent !== null;
  function colocar() {
    const cuerpo = document.querySelector(".epl-fondo .epl-cuerpo");
    if (cuerpo && sec.parentNode !== cuerpo) cuerpo.append(sec);
  }
  // al entrar en el apartado: la biblioteca al día y la línea de tiempo pintada
  async function mostrar() {
    colocar();
    if (E.cargado !== A.proyecto) await alAbrirProyecto();
    else { await cargarBiblioteca(); pintar(); }
  }
  function ocultar() { if (E.tocando) { E.tocando = false; sincronizar(); } }
  return { sec, colocar, pintar, mostrar, ocultar, alAbrirProyecto, activo };
}
