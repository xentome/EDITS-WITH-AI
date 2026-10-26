/* «⬆ Subir» (en «+ Añadir» y en las mitades vacías): una o varias fotos, o un video, desde el PC (elegir o soltar encima)
 * → input/minimax_h3/ (con /upload/image de ComfyUI) → RefMod nuevo en subidas/ (rutas.subir_refmods) → al Stack, con el
 * papel y el nombre elegidos.
 *   - Fotos: varias de un mismo personaje pueden ir juntas en una cajita; «tapar al subir» las tapa (cara y pelo).
 *   - Video (uno cada vez): recortar el cuadro, opcional («✂ Cortar»: un recuadro con tiradores en cada lado y esquina;
 *     con Ctrl crece entero), elegir un tramo opcional (una línea de tiempo con sus fotogramas, desde / hasta) y el modo.
 *   - Modo: «comprimido» (copia el aspecto general y pesa poco: el método del reel, planos/8) o «completo» (el detalle).
 *     En la ficha se puede cambiar después (rutas.cambiar_modo).
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Las utilidades llegan en ctx.u. Planos: ../../planos/4. */

const MIN = 0.04;   // lo mínimo de un recorte (de 0 a 1) y de un tramo (s)

/* Añade ctx.subirFoto y ctx.abrirSubir. Usa de ctx: u, S, wf, caja, capa, PAPELES_LADO, papelLargo, cargarBiblioteca,
 * anadirVariosDeBiblioteca, taparTarjeta, avisar. */
export function instalar(ctx) {
  const { u, S, wf, caja } = ctx;
  const { el, W, leerJSON, api, t } = u;

  ctx.subirFoto = async function subirFoto(archivo) {
    const fd = new FormData();
    fd.append("image", archivo, archivo.name);
    fd.append("type", "input");
    fd.append("subfolder", "minimax_h3");
    const r = await fetch("/upload/image", { method: "POST", body: fd });
    if (!r.ok) throw new Error(t("comun.no_se_pudo_subir", { nombre: archivo.name, estado: r.status }));
    const j = await r.json();
    return `${j.subfolder ? j.subfolder + "/" : ""}${j.name}`;
  };

  // opciones: {papel, alAnadir(nombres)} (la letra de una palabra, textos.js). Una letra no se tapa: se perdería el texto
  ctx.abrirSubir = function abrirSubir(lado, opciones = {}) {
    const papel0 = opciones.papel || ctx.PAPELES_LADO[lado][0];
    const st = { papel: papel0, nombre: "", tapar: lado === "der" && papel0 !== "letra", juntar: true, fotos: [],
                 video: null, modo: "completo" };      // video: {f, url, recorte, tramo: null | {desde, hasta}, dur}
    const aviso = el("p", { class: "epl-aviso" });
    const archivo = el("input", { type: "file", accept: "image/*,video/*", multiple: true, style: { display: "none" },
                                  onchange: (e) => { anadir(e.target.files); e.target.value = ""; } });
    const v = ctx.capa(lado);
    const nombreDe = (f) => f.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 30);
    const anadir = (lista) => {
      const todos = [...lista];
      const vid = todos.find((f) => /^video\//.test(f.type));
      const imgs = todos.filter((f) => /^image\//.test(f.type));
      if (!vid && !imgs.length) { aviso.textContent = "⚠ " + t("referencias.subir.no_es_imagen"); return; }
      if (vid) {                          // un video va solo: sustituye lo que hubiera
        st.fotos = [];
        st.video = { f: vid, url: URL.createObjectURL(vid), recorte: null, tramo: null, dur: 0 };   // recorte: null = el cuadro entero
        st.modo = "comprimido";
        if (!st.nombre) st.nombre = nombreDe(vid);
      } else {
        st.video = null;
        for (const f of imgs) st.fotos.push({ f, url: URL.createObjectURL(f) });
        if (!st.nombre) st.nombre = nombreDe(imgs[0]);
      }
      aviso.textContent = "";
      pintar();
    };

    // ---- el video: reproductor con el rectángulo del recorte encima y, si se pide, la línea del tramo
    function editorVideo() {
      const x = st.video;
      const video = el("video", { src: x.url, muted: true, playsinline: true, loop: false, class: "epl-sv-video" });
      video.muted = true;
      // el recorte es opcional: «✂ Cortar» enseña el recuadro (x.recorte) y «✕ sin recorte» lo quita (todo el cuadro)
      const lados = ["n", "s", "e", "o", "ne", "no", "se", "so"];
      const rect = el("div", { class: "epl-sv-rect" }, ...lados.map((l) => el("div", { class: `epl-sv-h h-${l}`, "data-lado": l })));
      const marco = el("div", { class: "epl-sv-marco" }, video, rect);
      const cortando = () => !!x.recorte;
      const ponerRect = () => {
        rect.style.display = cortando() ? "" : "none";
        if (cortando()) Object.assign(rect.style, { left: `${x.recorte.x * 100}%`, top: `${x.recorte.y * 100}%`,
                                                    width: `${x.recorte.w * 100}%`, height: `${x.recorte.h * 100}%` });
      };
      /* arrastrar: un lado o una esquina mueve solo esos bordes; con Ctrl, el recuadro crece o encoge entero desde su
       * centro, con su misma proporción; desde dentro, se mueve sin cambiar de tamaño */
      let arrR = null;
      const pos = (e) => { const b = video.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; };
      const lim = (v) => Math.min(1, Math.max(0, v));
      rect.addEventListener("pointerdown", (e) => {
        if (e.button > 0 || !cortando()) return;
        arrR = { lado: e.target.dataset.lado || "mover", ini: pos(e), r: { ...x.recorte } };
        try { rect.setPointerCapture(e.pointerId); } catch { /* sintético */ }
        e.preventDefault(); e.stopPropagation();
      });
      rect.addEventListener("pointermove", (e) => {
        if (!arrR) return;
        const [px, py] = pos(e), dx = px - arrR.ini[0], dy = py - arrR.ini[1], r0 = arrR.r;
        let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
        if (arrR.lado === "mover") {
          const mx = Math.min(1 - r0.w, Math.max(0, r0.x + dx)), my = Math.min(1 - r0.h, Math.max(0, r0.y + dy));
          x.recorte = { x: mx, y: my, w: r0.w, h: r0.h };
        } else if (e.ctrlKey) {                         // todo junto, desde el centro, con la misma proporción
          const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2;
          const k = Math.max(MIN / Math.min(r0.w, r0.h), Math.hypot(px - cx, py - cy) / Math.max(1e-6, Math.hypot(arrR.ini[0] - cx, arrR.ini[1] - cy)));
          const w = Math.min(r0.w * k, 2 * Math.min(cx, 1 - cx)), h = w * r0.h / r0.w;
          const h2 = Math.min(h, 2 * Math.min(cy, 1 - cy)), w2 = h2 * r0.w / r0.h;
          x.recorte = { x: cx - w2 / 2, y: cy - h2 / 2, w: w2, h: h2 };
        } else {                                        // lado por lado
          if (arrR.lado.includes("o")) x0 = Math.min(lim(r0.x + dx), x1 - MIN);
          if (arrR.lado.includes("e")) x1 = Math.max(lim(r0.x + r0.w + dx), x0 + MIN);
          if (arrR.lado.includes("n")) y0 = Math.min(lim(r0.y + dy), y1 - MIN);
          if (arrR.lado.includes("s")) y1 = Math.max(lim(r0.y + r0.h + dy), y0 + MIN);
          x.recorte = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
        ponerRect(); textoRecorte();
      });
      const soltar = () => { arrR = null; };
      rect.addEventListener("pointerup", soltar);
      rect.addEventListener("pointercancel", soltar);
      ponerRect();
      const infoRecorte = el("span", { class: "epl-ayuda" });
      const textoRecorte = () => {
        const W0 = video.videoWidth || 0, H0 = video.videoHeight || 0, r = x.recorte;
        infoRecorte.textContent = !r ? t("referencias.subir.video.sin_recorte", { W: W0, H: H0 })
          : t("referencias.subir.video.recorte_info", { w: Math.round(r.w * W0), h: Math.round(r.h * H0), W: W0, H: H0 });
      };
      const botonCortar = el("button", { class: "epl-boton epl-cortar" });
      const pintarCortar = () => {
        botonCortar.textContent = t(cortando() ? "referencias.subir.video.quitar_recorte" : "referencias.subir.video.cortar");
        botonCortar.classList.toggle("fijo", cortando());
      };
      botonCortar.addEventListener("click", () => {
        x.recorte = cortando() ? null : { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
        ponerRect(); textoRecorte(); pintarCortar();
      });
      pintarCortar();
      // el tramo: una línea con los fotogramas del video y dos tiradores
      const tira = el("canvas", { class: "epl-sv-tira", width: 640, height: 54 });
      const sel = el("div", { class: "epl-sv-sel" });
      const cabezal = el("div", { class: "epl-sv-cabezal" });
      const h1 = el("div", { class: "epl-sv-tirador", "data-t": "desde" }), h2 = el("div", { class: "epl-sv-tirador", "data-t": "hasta" });
      const linea = el("div", { class: "epl-sv-linea" }, tira, sel, h1, h2, cabezal);
      const infoTramo = el("span", { class: "epl-ayuda" });
      const pintarTramo = () => {
        if (!x.tramo || !x.dur) return;
        const a = x.tramo.desde / x.dur * 100, b = x.tramo.hasta / x.dur * 100;
        Object.assign(sel.style, { left: `${a}%`, width: `${b - a}%` });
        h1.style.left = `${a}%`; h2.style.left = `${b}%`;
        infoTramo.textContent = t("referencias.subir.video.tramo_info",
          { a: u.num(x.tramo.desde, 2), b: u.num(x.tramo.hasta, 2), d: u.num(x.tramo.hasta - x.tramo.desde, 2) });
      };
      let arr = null;
      const tiempo = (e) => { const b = linea.getBoundingClientRect(); return Math.min(x.dur, Math.max(0, (e.clientX - b.left) / b.width * x.dur)); };
      for (const h of [h1, h2]) h.addEventListener("pointerdown", (e) => { arr = h.dataset.t; try { h.setPointerCapture(e.pointerId); } catch { /* sintético */ } e.stopPropagation(); e.preventDefault(); });
      linea.addEventListener("pointermove", (e) => {
        if (!arr) return;
        const s = Math.round(tiempo(e) * 24) / 24;           // al fotograma
        if (arr === "desde") x.tramo.desde = Math.min(s, x.tramo.hasta - MIN); else x.tramo.hasta = Math.max(s, x.tramo.desde + MIN);
        video.currentTime = arr === "desde" ? x.tramo.desde : x.tramo.hasta;
        pintarTramo();
      });
      const soltarT = () => { arr = null; };
      linea.addEventListener("pointerup", soltarT);
      linea.addEventListener("pointercancel", soltarT);
      linea.addEventListener("click", (e) => { if (e.target === tira || e.target === sel) video.currentTime = tiempo(e); });
      video.addEventListener("timeupdate", () => {
        if (x.dur) cabezal.style.left = `${video.currentTime / x.dur * 100}%`;
        if (x.tramo && !video.paused && video.currentTime >= x.tramo.hasta) { video.pause(); video.currentTime = x.tramo.desde; }
      });
      // los fotogramas de la tira: 10, buscando en una copia del video
      async function rellenarTira() {
        const copia = el("video", { src: x.url, muted: true, playsinline: true });
        copia.muted = true;
        await new Promise((r) => { copia.onloadeddata = r; copia.onerror = r; });
        const c = tira.getContext("2d"), n = 10, ancho = tira.width / n;
        for (let i = 0; i < n; i++) {
          copia.currentTime = Math.min(x.dur - 0.01, (i + 0.5) / n * x.dur);
          await new Promise((r) => { copia.onseeked = r; setTimeout(r, 800); });
          const esc = Math.max(ancho / copia.videoWidth, tira.height / copia.videoHeight);
          const w = copia.videoWidth * esc, h = copia.videoHeight * esc;
          c.drawImage(copia, i * ancho + (ancho - w) / 2, (tira.height - h) / 2, w, h);
        }
      }
      const elegirTramo = el("input", { type: "checkbox", class: "epl-sv-tramo-si", checked: !!x.tramo, onchange: (e) => {
        x.tramo = e.target.checked ? { desde: 0, hasta: x.dur } : null;
        caja2.replaceChildren(...(x.tramo ? [linea, el("div", { class: "epl-fila" }, botonTramo, infoTramo)] : []));
        if (x.tramo) { pintarTramo(); rellenarTira(); }
      } });
      const botonTramo = el("button", { class: "epl-mini", onclick: () => {
        if (!video.paused) return video.pause();
        if (x.tramo && (video.currentTime < x.tramo.desde || video.currentTime >= x.tramo.hasta)) video.currentTime = x.tramo.desde;
        video.play();
      } }, t("referencias.subir.video.reproducir"));
      const caja2 = el("div", { class: "epl-sv-tramo" });
      video.addEventListener("loadedmetadata", () => { x.dur = video.duration || 0; textoRecorte(); if (x.tramo) { pintarTramo(); rellenarTira(); } });
      return el("div", { class: "epl-sv" },
        marco,
        el("div", { class: "epl-fila" }, botonCortar, infoRecorte,
          el("button", { class: "epl-mini", onclick: () => (video.paused ? video.play() : video.pause()) }, "▶ / ⏸")),
        el("p", { class: "epl-ayuda" }, t("referencias.subir.video.recorte_ayuda")),
        el("label", { style: { display: "flex", gap: "6px", alignItems: "center" } }, elegirTramo, t("referencias.subir.video.tramo")),
        caja2);
    }

    const pintar = () => {
      const varias = st.fotos.length > 1, hay = st.video || st.fotos.length;
      const modo = (m) => el("label", { class: "epl-sv-modo", title: t(`referencias.subir.modo.${m}.tooltip`) },
        el("input", { type: "radio", name: "epl-modo", value: m, checked: st.modo === m, onchange: () => { st.modo = m; } }),
        " " + t(`referencias.subir.modo.${m}`));
      v.modal.replaceChildren(
        el("div", { class: "epl-tit" }, t(lado === "izq" ? "referencias.subir.titulo_izq" : "referencias.subir.titulo_der"),
          el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => v.cerrar() }, t("comun.cerrar")))),
        archivo,
        el("div", { class: "epl-ficha" },
          st.video ? editorVideo()
            : el("div", { class: "epl-soltar", onclick: () => archivo.click() },
              st.fotos.length ? el("div", { class: "epl-fotos" }, ...st.fotos.map((x, i) => el("div", {},
                el("img", { src: x.url, alt: "" }), x.f.name,
                el("button", { class: "epl-mini quitar", title: t("referencias.cajita.sacar"), onclick: (e) => { e.stopPropagation(); st.fotos.splice(i, 1); pintar(); } }, "✕"))))
                : el("p", { class: "epl-vacio" }, t("referencias.subir.vacio"))),
          el("div", {},
            st.video ? el("button", { class: "epl-mini", onclick: () => { st.video = null; st.modo = "completo"; pintar(); } }, t("referencias.subir.video.otro")) : null,
            el("label", {}, t("referencias.ficha.papel")),
            el("select", { class: "epl-subir-papel", onchange: (e) => { st.papel = e.target.value; pintar(); } },
              ...ctx.PAPELES_LADO[lado].map((p) => el("option", { value: p, selected: st.papel === p }, ctx.papelLargo(p)))),
            el("label", {}, t(st.papel === "personaje" ? "referencias.subir.nombre_personaje" : "referencias.subir.nombre")),
            el("input", { class: "epl-subir-nombre", value: st.nombre, placeholder: t("referencias.subir.nombre.placeholder"), oninput: (e) => { st.nombre = e.target.value; } }),
            el("label", {}, t("referencias.subir.modo")),
            el("div", { class: "epl-sv-modos" }, modo("comprimido"), modo("completo")),
            varias ? el("label", { style: { display: "flex", gap: "6px", alignItems: "center" } },
              el("input", { type: "checkbox", class: "epl-subir-juntar", checked: st.juntar, onchange: (e) => { st.juntar = e.target.checked; } }),
              t("referencias.subir.juntar", { n: st.fotos.length })) : null,
            st.video ? null : el("label", { style: { display: "flex", gap: "6px", alignItems: "center" } },
              el("input", { type: "checkbox", class: "epl-subir-tapar", checked: st.tapar, onchange: (e) => { st.tapar = e.target.checked; } }),
              t("referencias.subir.tapar")),
            el("p", { class: "epl-ayuda" }, t(st.video ? "referencias.subir.video.ayuda" : "referencias.subir.ayuda")),
            aviso,
            el("div", { class: "epl-fila" },
              el("button", { class: "epl-boton epl-verde epl-grande epl-subir-crear", disabled: !hay, onclick: () => crear() },
                !hay ? t("referencias.subir.crear") : st.video ? t("referencias.subir.crear_una") : varias && !st.juntar
                  ? t("referencias.subir.crear_varias", { n: st.fotos.length }) : t("referencias.subir.crear_una"))))));
    };
    v.repintar = pintar;
    v.modal.addEventListener("dragover", (e) => { e.preventDefault(); v.modal.classList.add("soltar"); });
    v.modal.addEventListener("dragleave", () => v.modal.classList.remove("soltar"));
    v.modal.addEventListener("drop", (e) => { e.preventDefault(); v.modal.classList.remove("soltar"); anadir(e.dataTransfer.files); });
    async function crear() {
      const archivos = st.video ? [st.video] : st.fotos;
      if (S.ocupado || !archivos.length) return;
      if (!st.nombre.trim()) { aviso.textContent = "⚠ " + t("referencias.subir.sin_nombre"); return; }
      const juntar = !st.video && st.juntar && st.fotos.length > 1, cuantas = st.video || juntar ? 1 : st.fotos.length;
      const hay = (leerJSON(W(wf.stack || {}, "stack_state")?.value, {}).picks || []).length;
      if (hay + cuantas > 12) { aviso.textContent = "⚠ " + t("referencias.subir.no_caben", { hay }); return; }
      S.ocupado = true;
      caja.classList.add("ocupada");
      const t0 = Date.now();
      let fase = "referencias.subir.subiendo";                // la clave del texto de la fase
      const reloj = setInterval(() => ctx.avisar(t("comun.trabajando", { tarea: t(fase), s: Math.round((Date.now() - t0) / 1000) }), "trabajando"), 500);
      let creados = [];
      try {
        const rels = [], ajustes = {};
        for (const x of archivos) {
          const rel = await ctx.subirFoto(x.f);
          rels.push(rel);
          if (st.video) ajustes[rel] = { recorte: x.recorte, tramo: x.tramo };
        }
        fase = "referencias.subir.creando";
        const res = await api("subir_refmods", { nombre: st.nombre.trim(), papel: st.papel, fotos: rels, juntar, modo: st.modo, ajustes });
        creados = res.creados;
        await ctx.cargarBiblioteca();
        const nombre = st.nombre.trim();
        for (const n of creados) S.refs[n] = { papel: st.papel, nombre, ficha: "", origen: "subida" };
        ctx.anadirVariosDeBiblioteca(creados.map((n) => ctx.biblioteca[n]).filter(Boolean), lado);
        v.cerrar();
        ctx.avisar(t(creados.length > 1 ? "referencias.subir.creadas" : "referencias.subir.creada",
                     { nombres: u.lista(creados), s: u.num(res.segundos) }), "bien");
        opciones.alAnadir?.(creados);
      } catch (e) {
        aviso.textContent = "⚠ " + e.message;
        ctx.avisar(t("referencias.subir.error", { error: e.message }), "mal");
      } finally {
        clearInterval(reloj);
        S.ocupado = false;
        caja.classList.remove("ocupada");
      }
      if (!st.video && st.tapar && creados.length) {  // tapar cada foto ya en el Stack (tapar.js); deja la tarjeta tapada en su sitio
        for (const n of creados) {
          const r = wf.items.find((x) => x.clave === n);
          if (r) await ctx.taparTarjeta(r);
        }
      }
      return creados;
    }
    pintar();
    return v;
  };
}
