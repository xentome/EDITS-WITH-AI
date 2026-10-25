/* Sección 4 del editor, debajo de las tomas: VENTANA DE AUDIO. Enseña la onda solo del tramo que duran las tomas y deja
 * oírlo (▶/⏸, se para sola al final). Se arrastra para mover la canción por debajo, con aceleración tipo puntero
 * (despacio = muy fino, rápido = lejos) y, al soltar, el inicio cae en el fotograma más cercano (1/24 s). Debajo, una
 * línea delgada es la canción entera: el punto blanco marca el tramo y se arrastra para saltar a cualquier sitio.
 * El servidor da la duración y los picos (rutas audio_info, audio_ventana) y escribe el recorte al guardar
 * (audio_recortar). Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md. */

export const FPS = 24;
// aceleración del arrastre: ganancia = 1 + K·v² (v en px/ms, suavizada), como mucho GANANCIA_MAX
export const K = 4, GANANCIA_MAX = 60;

export function reloj(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
}
export const fotograma = (s) => Math.round(s * FPS);

/* Añade ctx.pintarAudio, ctx.audioCuerpo, ctx.prepararAudioParaGuardar, ctx.audioEstado y ctx.moverAudio, y envuelve
 * ctx.pintarLinea para que la ventana se vuelva a pintar con las tomas. Usa de ctx: u, S, wf, guardado, secAudio,
 * pedirMontaje, avisar. */
export function instalar(ctx) {
  const { u, S, wf, secAudio } = ctx;
  const { el, api, W } = u;

  // ---- estado: la canción original y el inicio elegido. Si el LoadAudio ya apunta al recorte guardado, la original sigue
  // siendo la del estado; si apunta a otra canción, se empieza de cero con ella.
  const g = ctx.guardado?.audio;
  S.audio = !wf.audio ? null : g && g.original && (wf.audio === g.recorte || wf.audio === g.original)
    ? { original: g.original, inicio_s: +g.inicio_s || 0, recorte: g.recorte || "", tocado: !!g.tocado }
    : { original: wf.audio, inicio_s: 0, recorte: "", tocado: false };

  // maxPico: el pico más alto de la canción, para que la onda llene la ventana aunque la canción sea bajita
  let info = null, fino = null, pidiendo = false, error = "", maxPico = 1;
  const dur = () => +S.duracion || 0;
  const maxInicio = () => Math.max(0, Math.floor(((info?.duracion || 0) - dur()) * FPS) / FPS);
  const limitar = (s) => Math.min(maxInicio(), Math.max(0, s));
  const alFotograma = (s) => limitar(Math.round(s * FPS) / FPS);

  // lo que se manda al servidor con cada montaje: con un tramo elegido, los beats son los de ese tramo de la original
  ctx.audioCuerpo = () => !S.audio ? { audio: "" } :
    { audio: S.audio.original, ...(S.audio.tocado ? { audio_inicio: S.audio.inicio_s } : {}) };

  // ---- elementos
  const onda = el("canvas", { class: "epl-onda-cv", tabindex: "0",
    title: "Arrastra para mover la canción (despacio = fino, rápido = lejos) · rueda o ←/→ = 1 fotograma · Mayús+flecha = 1 s · espacio = ▶/⏸" });
  const etIni = el("span", { class: "epl-onda-et izq" }), etFin = el("span", { class: "epl-onda-et der" });
  const boton = el("button", { class: "epl-play", title: "Oír solo el tramo (se para sola al final)", onclick: () => alternar() }, "▶");
  const barra = el("canvas", { class: "epl-barra-cv", title: "La canción entera: arrastra el punto blanco (o toca la línea) para saltar" });
  const datos = el("div", { class: "epl-audio-info" });
  const cambiar = el("button", { class: "epl-mini epl-cambiar-cancion", title: "Elegir otra canción de input/ o subir una desde el PC",
                                 onclick: () => ctx.abrirCanciones() }, "♫ Cambiar canción");

  ctx.moverAudio = (s, { soltar = true } = {}) => {
    if (!S.audio || !info) return;
    parar(true);
    S.audio.inicio_s = soltar ? alFotograma(s) : limitar(s);
    S.audio.tocado = true;
    dibujar();
    if (soltar) alSoltar();
  };
  let esperaSoltar = null;
  function alSoltar() {
    clearTimeout(esperaSoltar);
    esperaSoltar = setTimeout(() => { pedirFino(); ctx.pedirMontaje(); }, 120);
  }

  // ---- arrastre de la ventana: agarras la onda y la mueves (a la izquierda = más adelante en la canción)
  let arr = null;
  onda.addEventListener("pointerdown", (e) => {
    if (!info || e.button > 0) return;
    try { onda.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    onda.focus({ preventScroll: true });
    parar(true);
    arr = { id: e.pointerId, x: e.clientX, t: e.timeStamp, v: 0, s: S.audio.inicio_s };
    e.preventDefault();
  });
  onda.addEventListener("pointermove", (e) => {
    if (!arr || e.pointerId !== arr.id) return;
    const dx = e.clientX - arr.x, dt = Math.max(1, e.timeStamp - arr.t);
    arr.v = 0.6 * arr.v + 0.4 * Math.abs(dx) / dt;
    const ganancia = Math.min(GANANCIA_MAX, 1 + K * arr.v * arr.v);
    arr.s = limitar(arr.s - dx * (dur() / Math.max(1, onda.clientWidth)) * ganancia);
    arr.x = e.clientX;
    arr.t = e.timeStamp;
    S.audio.inicio_s = arr.s;
    S.audio.tocado = true;
    dibujar();
    pedirFino();
  });
  const fin = (e) => {
    if (!arr || e.pointerId !== arr.id) return;
    arr = null;
    ctx.moverAudio(S.audio.inicio_s);
  };
  onda.addEventListener("pointerup", fin);
  onda.addEventListener("pointercancel", fin);
  onda.addEventListener("wheel", (e) => {
    if (!info) return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (d) ctx.moverAudio(S.audio.inicio_s + Math.sign(d) * (e.shiftKey ? 1 : 1 / FPS));
  }, { passive: false });
  onda.addEventListener("keydown", (e) => {
    if (!info) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      ctx.moverAudio(S.audio.inicio_s + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / FPS));
    } else if (e.key === " ") alternar();
    else if (e.key === "Home") ctx.moverAudio(0);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  // ---- la línea de la canción entera: el punto sigue al puntero; despacio, se mueve menos que él (más precisión)
  let arrB = null;
  barra.addEventListener("pointerdown", (e) => {
    if (!info || e.button > 0) return;
    try { barra.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    parar(true);
    const w = Math.max(1, barra.clientWidth), x = e.clientX - barra.getBoundingClientRect().left;
    const punto = (S.audio.inicio_s + dur() / 2) / info.duracion * w;
    if (Math.abs(x - punto) > 8) S.audio.inicio_s = limitar(x / w * info.duracion - dur() / 2);  // tocar la línea salta ahí
    S.audio.tocado = true;
    arrB = { id: e.pointerId, x: e.clientX, t: e.timeStamp, v: 1, s: S.audio.inicio_s };
    dibujar();
    pedirFino();
    e.preventDefault();
  });
  barra.addEventListener("pointermove", (e) => {
    if (!arrB || e.pointerId !== arrB.id) return;
    const dx = e.clientX - arrB.x, dt = Math.max(1, e.timeStamp - arrB.t);
    arrB.v = 0.6 * arrB.v + 0.4 * Math.abs(dx) / dt;
    const ganancia = Math.min(1, 0.1 + arrB.v);
    arrB.s = limitar(arrB.s + dx * (info.duracion / Math.max(1, barra.clientWidth)) * ganancia);
    arrB.x = e.clientX;
    arrB.t = e.timeStamp;
    S.audio.inicio_s = arrB.s;
    dibujar();
    pedirFino();
  });
  const finB = (e) => {
    if (!arrB || e.pointerId !== arrB.id) return;
    arrB = null;
    ctx.moverAudio(S.audio.inicio_s);
  };
  barra.addEventListener("pointerup", finB);
  barra.addEventListener("pointercancel", finB);

  // ---- datos del servidor
  async function cargar() {
    if (!S.audio) return;
    try {
      info = await api("audio_info", { audio: S.audio.original });
      maxPico = Math.max(1, ...info.picos);
      S.audio.inicio_s = alFotograma(S.audio.inicio_s);
      error = "";
    } catch (e) { error = "No pude leer el audio: " + e.message; }
    dibujar();
    pedirFino();
  }
  function cubre(f, a, b) { return f && a >= f.desde - 1e-6 && b <= f.desde + f.picos.length / f.por_s + 1e-6; }
  async function pedirFino() {
    if (!info || pidiendo) return;
    const a = S.audio.inicio_s, b = Math.min(info.duracion, a + dur());
    if (cubre(fino, a, b)) return;
    pidiendo = true;
    try { fino = await api("audio_ventana", { audio: S.audio.original, inicio: a, dur: dur() }); } catch { /* se queda el resumen */ }
    pidiendo = false;
    dibujar();
    const a2 = S.audio.inicio_s;
    if (!cubre(fino, a2, Math.min(info.duracion, a2 + dur()))) pedirFino();
  }

  // ---- reproducir solo el tramo (Web Audio: empieza y termina exactamente donde dice el tramo)
  let ac = null, fuente = null, buffer = null, claveBuf = "", empezo = 0, desplaz = 0, sonando = false, cargando = false;
  const clave = () => `${S.audio.original}|${S.audio.inicio_s.toFixed(4)}|${dur().toFixed(4)}`;
  const posicion = () => sonando ? Math.min(dur(), ac.currentTime - empezo) : desplaz;
  async function alternar() {
    if (!S.audio || !info || cargando) return;
    if (sonando) return parar(false);
    ac ||= new AudioContext();
    if (ac.state === "suspended") await ac.resume().catch(() => {});
    if (claveBuf !== clave()) {
      cargando = true;
      boton.textContent = "…";
      try {
        const k = clave();
        const r = await api("audio_ventana", { audio: S.audio.original, inicio: S.audio.inicio_s, dur: dur(), margen: 0, wav: true });
        buffer = await ac.decodeAudioData(Uint8Array.from(atob(r.wav), (c) => c.charCodeAt(0)).buffer);
        claveBuf = k;
        desplaz = 0;
      } catch (e) { ctx.avisar("No pude preparar el tramo: " + e.message, "mal"); }
      cargando = false;
      if (claveBuf !== clave()) return dibujar();
    }
    if (desplaz >= buffer.duration - 0.01) desplaz = 0;
    const f = fuente = ac.createBufferSource();
    f.buffer = buffer;
    f.connect(ac.destination);
    // se acabó el tramo: se para sola y vuelve al principio (una pausa no pasa por aquí)
    f.onended = () => { if (f.parada || fuente !== f) return; sonando = false; desplaz = 0; fuente = null; dibujar(); };
    f.start(0, desplaz);
    empezo = ac.currentTime - desplaz;
    sonando = true;
    const paso = () => { if (!sonando) return; dibujar(); requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }
  // pausa (se sigue desde ahí) o, con «del_todo», vuelve al principio del tramo
  function parar(del_todo) {
    if (sonando && fuente) {
      desplaz = ac.currentTime - empezo;
      fuente.parada = true;
      try { fuente.stop(); } catch { /* ya parada */ }
      fuente = null;
      sonando = false;
    }
    if (del_todo) desplaz = 0;
    dibujar();
  }
  ctx.audioEstado = () => S.audio && ({ ...S.audio, duracion_cancion: info?.duracion, dur: dur(), sonando, posicion: posicion(),
    contexto: ac?.state, buffer_s: buffer?.duration, fino: fino && { desde: fino.desde, hasta: fino.desde + fino.picos.length / fino.por_s } });
  ctx.alternarAudio = alternar;

  // ---- dibujo
  function lienzo(c) {
    const r = window.devicePixelRatio || 1, w = Math.max(1, Math.round(c.clientWidth * r)), h = Math.max(1, Math.round(c.clientHeight * r));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return [c.getContext("2d"), w, h, r];
  }
  function pico(a, b) {
    if (cubre(fino, a, b)) {
      const i0 = Math.floor((a - fino.desde) * fino.por_s), i1 = Math.max(i0 + 1, Math.ceil((b - fino.desde) * fino.por_s));
      let m = 0;
      for (let i = i0; i < i1 && i < fino.picos.length; i++) m = Math.max(m, fino.picos[i]);
      return m;
    }
    const p = info.picos, s = info.s_por_pico;
    const i0 = Math.floor(a / s), i1 = Math.max(i0 + 1, Math.ceil(b / s));
    let m = 0;
    for (let i = i0; i < i1 && i < p.length; i++) m = Math.max(m, p[i]);
    return m;
  }
  function dibujar() {
    if (!onda.isConnected) return;
    const [c, w, h, r] = lienzo(onda);
    c.fillStyle = "#0f1217";
    c.fillRect(0, 0, w, h);
    if (!info) return;
    const a = S.audio.inicio_s, d = dur(), escala = (h / 2 - 3 * r) / maxPico;
    c.fillStyle = "#8fb6f0";
    for (let x = 0; x < w; x++) {
      const t0 = a + x / w * d, t1 = a + (x + 1) / w * d;
      if (t0 >= info.duracion) break;
      const y = Math.max(r * 0.5, pico(t0, t1) * escala);
      c.fillRect(x, h / 2 - y, 1, 2 * y);
    }
    // los cortes de las tomas (deberían caer en los beats del tramo)
    c.fillStyle = "rgba(255,255,255,.55)";
    for (const t of (S.cortes || []).slice(1)) c.fillRect(Math.round(t / d * w), 0, Math.max(1, r), h);
    // el cabezal
    const p = posicion();
    if (sonando || p > 0) { c.fillStyle = "#e0a94c"; c.fillRect(Math.round(p / d * w), 0, 2 * r, h); }
    etIni.textContent = `${reloj(a)} · f ${fotograma(a)}`;
    etFin.textContent = `${reloj(a + d)} · f ${fotograma(a + d)}`;
    boton.textContent = sonando ? "⏸" : "▶";
    dibujarBarra();
    datos.replaceChildren(
      el("span", {}, `Tramo ${reloj(a)} (f ${fotograma(a)}) → ${reloj(a + d)} (f ${fotograma(a + d)}) · ${d.toFixed(3)} s`),
      el("span", { class: "epl-ayuda" }, "arrastra la onda: despacio = fino, rápido = lejos · rueda o ←/→ = 1 fotograma · Mayús = 1 s"),
      el("span", {}, `${S.audio.original} · ${reloj(info.duracion)}`));
  }
  function dibujarBarra() {
    const [c, w, h, r] = lienzo(barra);
    c.clearRect(0, 0, w, h);
    const T = info.duracion, a = S.audio.inicio_s / T * w, b = Math.max(a + 2 * r, (S.audio.inicio_s + dur()) / T * w);
    const alto = Math.round(h * 0.6), y = Math.round((h - alto) / 2);
    c.fillStyle = "#2e3440";
    c.fillRect(0, y, w, alto);
    c.fillStyle = "#3a5f9a";
    c.fillRect(Math.floor(a), y, Math.ceil(b - a), alto);
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(Math.min(w - h / 2, Math.max(h / 2, (a + b) / 2)), h / 2, h / 2, 0, 2 * Math.PI);
    c.fill();
  }

  ctx.pintarAudio = function pintarAudio() {
    if (!S.audio) {
      secAudio.replaceChildren(el("p", { class: "epl-vacio" }, "Sin audio conectado: los cortes van parejos."));
      return;
    }
    if (!onda.isConnected) {
      secAudio.replaceChildren(
        el("div", { class: "epl-audio-fila" }, el("div", { class: "epl-onda" }, onda, etIni, etFin), boton),
        el("div", { class: "epl-audio-fila epl-barra-fila" }, barra, el("span", { class: "epl-hueco" })),
        datos, el("div", { class: "epl-fila", style: { margin: "4px 0 0" } }, cambiar));
    }
    if (error) datos.replaceChildren(el("span", { class: "epl-aviso" }, error));
    if (info && S.audio.inicio_s > maxInicio()) ctx.moverAudio(S.audio.inicio_s);  // la duración creció: que quepa
    if (claveBuf && claveBuf !== clave() && !sonando) desplaz = 0;
    dibujar();
    pedirFino();
  };
  // las tomas y la ventana se pintan juntas (los cortes se dibujan sobre la onda)
  const pintarTomas = ctx.pintarLinea;
  ctx.pintarLinea = () => { pintarTomas(); ctx.pintarAudio(); };
  new ResizeObserver(() => dibujar()).observe(onda);

  // ---- al guardar: si el usuario tocó el audio, se escribe el recorte y el LoadAudio pasa a apuntar a él (es lo que llega
  // a H3 y a CreateVideo); la original queda en el estado
  ctx.prepararAudioParaGuardar = async function prepararAudioParaGuardar() {
    if (!S.audio?.tocado || !info) return null;
    const widget = W(wf.audioNodo || {}, "audio");
    if (!widget) throw new Error("no encuentro el LoadAudio del workflow");
    const r = await api("audio_recortar", { audio: S.audio.original, inicio: S.audio.inicio_s, dur: dur() });
    const valores = widget.options?.values;
    if (Array.isArray(valores) && !valores.includes(r.nombre)) valores.push(r.nombre);
    widget.value = r.nombre;
    try { widget.callback?.(r.nombre); } catch { /* el reproductor del LoadAudio no es imprescindible */ }
    S.audio.recorte = r.nombre;
    wf.audio = r.nombre;
    return r;
  };

  /* ---- cambiar la canción: el LoadAudio del workflow pasa a apuntar a ella (la original del estado), se leen su resumen y
   * sus beats, y la ventana vuelve al inicio. Queda como «tocado»: al guardar se escribe el recorte desde el segundo 0, así
   * H3 recibe solo el tramo que duran las tomas. */
  ctx.cambiarCancion = async function cambiarCancion(nombre) {
    const widget = W(wf.audioNodo || {}, "audio");
    if (!widget) throw new Error("no encuentro el LoadAudio del workflow");
    parar(true);
    const valores = widget.options?.values;
    if (Array.isArray(valores) && !valores.includes(nombre)) valores.push(nombre);
    widget.value = nombre;
    try { widget.callback?.(nombre); } catch { /* el reproductor del LoadAudio no es imprescindible */ }
    wf.audio = nombre;
    S.audio = { original: nombre, inicio_s: 0, recorte: "", tocado: true };
    info = null; fino = null; buffer = null; claveBuf = ""; desplaz = 0; maxPico = 1; error = "";
    S.cortes = [];
    await cargar();
    ctx.pintarAudio();
    ctx.pedirMontaje();
    ctx.avisar(`Canción: ${nombre} (${info ? reloj(info.duracion) : "?"}) · el tramo empieza en 0`, "bien");
  };

  // subir un audio del PC a input/ con la ruta de ComfyUI (/upload/image acepta cualquier archivo); devuelve su nombre
  ctx.subirCancion = async function subirCancion(archivo) {
    const fd = new FormData();
    fd.append("image", archivo, archivo.name);
    fd.append("type", "input");
    const r = await fetch("/upload/image", { method: "POST", body: fd });
    if (!r.ok) throw new Error(`no se pudo subir ${archivo.name} (${r.status})`);
    return (await r.json()).name;
  };

  // la ventanita: lista de input/ con buscador, «Subir desde el PC» y soltar un archivo encima
  ctx.abrirCanciones = async function abrirCanciones() {
    if (!S.audio) return;
    let lista = [];
    const filtro = el("input", { placeholder: "buscar…", style: { flex: 1 }, oninput: () => pintar() });
    const rejilla = el("div", { class: "epl-canciones" });
    const aviso = el("p", { class: "epl-aviso" });
    const elegir = async (nombre) => {
      try { v.cerrar(); await ctx.cambiarCancion(nombre); } catch (e) { ctx.avisar("Canción: " + e.message, "mal"); }
    };
    const subir = async (archivos) => {
      const a = [...archivos].find((f) => /^audio\//.test(f.type) || /\.(wav|mp3|flac|ogg|m4a|aac|opus)$/i.test(f.name));
      if (!a) { aviso.textContent = "⚠ Eso no es un audio (wav, mp3, flac, ogg, m4a…)"; return; }
      aviso.textContent = `Subiendo ${a.name}…`;
      try { await elegir(await ctx.subirCancion(a)); } catch (e) { aviso.textContent = "⚠ " + e.message; }
    };
    const archivo = el("input", { type: "file", accept: "audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.opus", style: { display: "none" },
                                  onchange: (e) => subir(e.target.files) });
    const pintar = () => {
      const q = filtro.value.toLowerCase();
      rejilla.replaceChildren(...lista.filter((x) => x.nombre.toLowerCase().includes(q)).map((x) =>
        el("div", { class: "epl-cancion" + (x.nombre === S.audio.original ? " actual" : ""), title: x.nombre, "data-nombre": x.nombre,
                    onclick: () => elegir(x.nombre) },
          el("b", {}, x.nombre), el("small", {}, `${x.mb.toString().replace(".", ",")} MB · ${x.fecha}` +
            (x.nombre === S.audio.original ? " · la de ahora" : "")))));
      if (!rejilla.children.length) rejilla.append(el("p", { class: "epl-vacio" }, lista.length ? "Nada con ese nombre." : "No hay audios en input/."));
    };
    const v = ctx.capa("der",
      el("div", { class: "epl-tit" }, "Cambiar la canción",
        el("span", { class: "der" }, filtro,
          el("button", { class: "epl-boton epl-azul", onclick: () => archivo.click() }, "⬆ Subir desde el PC"),
          el("button", { class: "epl-mini", onclick: () => v.cerrar() }, "cerrar"))),
      el("p", { class: "epl-ayuda" }, "Los audios de input/ (los que ve el LoadAudio). Toca uno para usarlo, o sube uno: también puedes " +
        "soltar el archivo encima de esta ventana. Al cambiarla, el tramo vuelve al inicio y los beats son los de la canción nueva."),
      archivo, aviso, rejilla);
    v.modal.addEventListener("dragover", (e) => { e.preventDefault(); v.modal.classList.add("soltar"); });
    v.modal.addEventListener("dragleave", () => v.modal.classList.remove("soltar"));
    v.modal.addEventListener("drop", (e) => { e.preventDefault(); v.modal.classList.remove("soltar"); subir(e.dataTransfer.files); });
    rejilla.append(el("p", { class: "epl-vacio" }, "Cargando…"));
    try { lista = (await api("audios", {})).audios; } catch (e) { aviso.textContent = "⚠ " + e.message; }
    pintar();
    filtro.focus();
    return v;
  };

  ctx.audioListo = cargar();
}
