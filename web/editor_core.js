/* Editor de «Prompt del edit (LLM)»: la interfaz P10 (27 oct; planos/fases/8 Interfaz P10.md). Planos: ../planos/4 El editor.md.
 * Una sola pantalla, de arriba abajo (ya no hay Historia general: la idea, el arco, la luz y el fondo general salieron):
 *   2 · Prompt de la toma elegida (su línea [Shot n], sus campos y su estilo) → editor/plan.js
 *   3 · Referencias en dos mitades: lo que no cambia (rojo) y lo que se presta (azul), con cajitas
 *                                                                     → editor/referencias.js y editor/cajitas.js
 *       y en la ficha de cada referencia, «tapar con SAM 3.1»        → editor/tapar.js
 *   4 · Línea de tiempo (una cajita por toma, ancho = duración; la duración del edit, en su título) → editor/linea.js
 *       debajo, la fila de texto (las palabras en pantalla, cada una en su momento) → editor/textos.js
 *       y debajo la ventana de audio (el tramo de la canción, y la canción entera en una línea delgada) → editor/audio.js
 *       y abajo del todo, el sonido de todo el edit (overall_soundscape) → editor/plan.js (pintarSonido)
 *   5 · Prompt final (lo que recibe H3)                              → editor/final.js
 * El trabajo lo hace el servidor (rutas /edit_prompt_llm/*, nucleo.py); aquí solo se muestra, se edita y se guarda.
 * Este archivo solo junta las piezas de editor/. Todas comparten un objeto «ctx» con el estado (S), las referencias del
 * workflow (wf) y las funciones de cada pieza. Se vuelve a cargar cada vez que se abre la ventana: editor.js lo importa
 * con «?v=…» y aquí se pasa el mismo «?v=…» a cada pieza, así un cambio en cualquiera se ve al reabrir sin recargar.
 * Dos idiomas (editor/i18n.js): todas las piezas escriben sus textos con ctx.u.t("clave", {datos}) y los números con
 * ctx.u.num. El botón «ES | EN» de la cabecera cambia el ajuste de ComfyUI y la ventana se vuelve a pintar entera (también
 * la ventanita de encima, con su `repintar`) sin perder lo escrito: todo vive en S y en el plan, no en el DOM. */

export async function abrir(node, app) {
  const v = new URL(import.meta.url).search;
  const pieza = (nombre) => import(new URL(`./editor/${nombre}.js${v}`, import.meta.url).href);
  const [util, estilos, referencias, cajitas, plan, linea, final, audio, tapar, duracion, i18n, filaTexto, subir, resolucion] = await Promise.all(
    ["util", "estilos", "referencias", "cajitas", "plan", "linea", "final", "audio", "tapar", "duracion", "i18n", "textos", "subir",
     "resolucion"].map(pieza));
  // el idioma: los textos de los dos idiomas y el traductor del elegido; las piezas usan u.t, u.num, u.lista y u.api
  const textos = await i18n.cargarTextos();
  let tr = i18n.traductor(textos, i18n.idiomaElegido(app));
  const u = { ...util, t: (clave, datos) => tr.t(clave, datos), num: (x, dec) => tr.num(x, dec), lista: (xs) => tr.lista(xs),
              idioma: () => tr.idioma, api: (ruta, cuerpo) => util.api(ruta, cuerpo, tr) };
  const { el, W, leerJSON, api, t } = u;

  document.getElementById("epl-css")?.remove();
  document.head.append(el("style", { id: "epl-css" }, estilos.CSS));
  document.querySelector(".epl-fondo")?.remove();

  const graph = app.graph;
  const guardado = leerJSON(W(node, "estado")?.value, {});
  const wf = referencias.referenciasDelWorkflow(u, graph, node);
  const S = {
    idea: W(node, "idea").value, tomas: +W(node, "tomas").value,
    duracion: +W(node, "duracion_s").value, palabras: W(node, "palabras").value, semilla: +W(node, "semilla_llm").value,
    refs: guardado.refs || {}, plan: plan.ajustarPlan(guardado.plan, +W(node, "tomas").value),
    // lo que antes daba la receta, ahora a la vista: el estilo de todo el edit, el de las palabras y los efectos de texto
    estilo: guardado.estilo || "", estilo_palabras: guardado.estilo_palabras || "", efectos: guardado.efectos || {},
    sonido: guardado.sonido || "",            // renglón «Sonido»: vacío = la frase «sonido» de frases.json
    // el audio del video generado (27 oct, solo en la app): «cancion» (por defecto) o «modelo» (el de H3); app/generar.py
    audio_salida: guardado.audio_salida === "modelo" ? "modelo" : "cancion",
    // las frases de unión que cambió el usuario (panel «Frases del código»); las demás, las de frases.json (frasesBase).
    // trozos: el prompt por trozos con su origen; lineasRef: los dos renglones de arriba de cada referencia (su ficha)
    frases: guardado.frases || {}, frasesBase: {}, trozos: [], lineasRef: {},
    prompt: guardado.prompt || "", a_mano: !!guardado.a_mano, cortes: [], avisos: [], ocupado: false,
    // siempre hay una toma elegida (26 oct): la última que se eligió (la última que editaste) o, si no, la última creada
    elegida: Math.min(Math.max(1, +guardado.toma_elegida || +W(node, "tomas").value || 1), Math.max(1, +W(node, "tomas").value || 1)),
  };

  const fondo = el("div", { class: "epl-fondo" });
  const caja = el("div", { class: "epl-caja" });
  fondo.append(caja);
  const estado = el("span", { class: "epl-estado" });
  const sec = (clase) => el("section", { class: "epl-sec " + clase });
  const secToma = sec("epl-s-toma"), secRefs = sec("epl-refs"),
        secTiempo = sec("epl-s-linea"), secFinal = sec("epl-s-final");
  // la parte 4 tiene cuatro filas: la fila de texto (textos.js), las tomas (linea.js), la ventana de audio (audio.js) y el
  // sonido de todo el edit (plan.js), abajo del todo (27 oct)
  const secLinea = el("div", { class: "epl-zona-tomas" }), secTexto = el("div", { class: "epl-texto" }),
        secAudio = el("div", { class: "epl-audio" }), secSonido = el("div", { class: "epl-sonido" });
  secTiempo.append(secTexto, secLinea, secAudio, secSonido);   // la fila de texto, encima de las tomas (26 oct)

  const ctx = { u, node, app, graph, S, wf, guardado, enApp: !!app?.maxEditor, biblioteca: {}, cajitas: {}, caja,
                secToma, secRefs, secLinea, secTexto, secAudio, secSonido, secFinal, ajustarPlan: plan.ajustarPlan, duracion };
  // la píldora de estado (una línea, con «…»); el texto entero, o su detalle, en el tooltip
  ctx.avisar = (texto, tipo = "", detalle = "") => { estado.textContent = texto; estado.title = detalle || texto; estado.className = "epl-estado " + tipo; };
  // lo que se manda al servidor: solo las referencias con papel (fotos y videos; una cajita es un <Video N>)
  // (los efectos de texto, E1, E2…, van con las referencias, con papel «efecto»)
  const entradas = () => ({
    idea: S.idea, tomas: S.tomas, duracion: S.duracion, palabras: S.palabras, estilo: S.estilo, estilo_palabras: S.estilo_palabras,
    sonido: S.sonido, frases: S.frases,
    refs: { ...Object.fromEntries(wf.lista.map((r) => [r.tag, S.refs[r.clave]]).filter(([, x]) => x && x.papel && x.papel !== "no")),
            ...Object.fromEntries(Object.entries(S.efectos).map(([k, e]) => [k, { ...e, papel: "efecto" }])) },
  });
  // el audio: la canción original y, si se eligió un tramo, su inicio (audio.js)
  ctx.cuerpo = (extra = {}) => ({ entradas: entradas(), plan: S.plan, ...ctx.audioCuerpo(), semilla: S.semilla, ...extra });

  // ---- montar (sin LLM) cada vez que cambia algo, salvo si el prompt final se editó a mano
  let espera = null;
  ctx.pedirMontaje = () => {
    clearTimeout(espera);
    espera = setTimeout(async () => {
      try {
        const r = await api("montar", ctx.cuerpo());
        S.cortes = r.cortes;
        S.beats = r.beats || [];
        S.avisos = r.avisos;
        // la primera vez, la fila de texto sale del formato viejo («TO YOU @1» y el estilo de las palabras): el servidor
        // la convierte y desde entonces vive en el plan (plan.textos); los campos viejos se vacían
        if (!Array.isArray(S.plan.textos) && Array.isArray(r.textos)) {
          S.plan.textos = r.textos.map(({ k, ...x }, i) => ({ id: x.id || `t${i + 1}`, ...x }));
          S.palabras = "";
          S.estilo_palabras = "";
        }
        if (!S.a_mano) S.prompt = r.prompt;
        S.trozos = r.trozos || [];
        S.lineasRef = r.referencias || {};
        S.frasesBase = r.frases || {};
        ctx.pintarFinal();
        ctx.pintarLinea();
        ctx.pintarLineaToma();
        ctx.alMontar?.();                                  // la app pone al día su barra de fases (app/web/app.js)
        ctx.programarGuardado();
      } catch (e) { ctx.avisar(t("errores.montar", { error: e.message }), "mal"); }
    }, 350);
  };
  /* ---- guardado automático: cada cambio vuelve a montar el prompt y, 2 s después del último, se escribe en el nodo (el
   * estado y los campos visibles; el recorte del audio solo si cambió). Ya no hay botón «Guardar». ctx.guardarYa() lo
   * hace al momento (al cerrar la ventana). El workflow en disco sigue siendo el Ctrl+S de ComfyUI. */
  let esperaGuardar = null, guardando = Promise.resolve();
  ctx.programarGuardado = () => {
    clearTimeout(esperaGuardar);
    esperaGuardar = setTimeout(() => { ctx.guardarYa(); }, 2000);
  };
  ctx.guardarYa = () => {
    clearTimeout(esperaGuardar);
    guardando = guardando.then(async () => {
      try {
        const d = await guardar();
        // los huecos del prompt (campos que faltan), por su nombre; la lista entera y la duración, en el tooltip
        const faltan = S.avisos.length ? t("comun.ventana.autoguardado_faltan", { lista: S.avisos.slice(0, 3).join(" · ") + (S.avisos.length > 3 ? " · …" : "") }) : "";
        ctx.avisar(faltan || t("comun.ventana.autoguardado") + textoDuracion(d), S.avisos.length ? "mal" : "bien",
                   (faltan ? t("comun.ventana.autoguardado_faltan.detalle", { lista: S.avisos.join(" · ") }) + "\n" : "") + t("comun.ventana.autoguardado") + textoDuracion(d));
      } catch (e) { ctx.avisar(t("errores.guardar", { error: e.message }), "mal"); }
    });
    return guardando;
  };

  referencias.instalar(ctx);
  subir.instalar(ctx);
  resolucion.instalar(ctx);
  cajitas.instalar(ctx);
  tapar.instalar(ctx);
  plan.instalar(ctx);
  linea.instalar(ctx);
  filaTexto.instalar(ctx);
  audio.instalar(ctx);
  final.instalar(ctx);

  await ctx.cargarBiblioteca();
  ctx.prepararRefs(guardado);
  migrarSinRecetas();
  migrarP10();
  document.body.append(fondo);

  /* Estados guardados antes de quitar las recetas (v < 4): la receta se ignora (se avisa), los efectos G1–G4 / U3–U5 de
   * las tomas se vacían con un aviso, y el nombre de un personaje era su atuendo («school uniform»): pasa a «atuendo». */
  function migrarSinRecetas() {
    const viejo = (guardado.v || 0) < 4 && Object.keys(guardado).length > 0;
    const receta = node._eplRecetaVieja || W(node, "receta")?.value || guardado.receta;
    if (viejo && receta) wf.avisos.push(["comun.migracion.receta", { receta }]);
    if (viejo) for (const r of Object.values(S.refs)) {
      if (r?.papel === "personaje" && (r.nombre || "").trim() && !r.atuendo) { r.atuendo = r.nombre; r.nombre = ""; }
    }
    const vaciadas = [];
    S.plan.tomas.forEach((t, i) => {
      if (/^[GU]\d$/.test(t.efecto || "")) {
        vaciadas.push(`${u.t("comun.toma_corta", { k: i + 1 })} (${t.efecto})`);
        t.efecto = "";
        if (!(t.efecto_frase || "").trim()) t.fijos = t.fijos.filter((f) => f !== "efecto" && f !== "efecto_frase");
      }
    });
    if (vaciadas.length) wf.avisos.push(["comun.migracion.efectos", { tomas: u.lista(vaciadas) }]);
  }

  /* Interfaz P10 (27 oct), sin Historia: el estilo general pasa a cada toma que no tenga el suyo; el arco, la luz y el
   * fondo generales (ya no se ven) se vacían para que el prompt sea lo que se ve; el personaje empieza en «Principal»
   * (en_todas) si nadie lo movió. */
  function migrarP10() {
    if ((S.estilo || "").trim()) {
      for (const toma of S.plan.tomas) if (!(toma.estilo || "").trim()) toma.estilo = S.estilo.trim();
      S.estilo = "";
    }
    for (const c of ["arco", "look", "fondo"]) S.plan[c] = "";
    S.plan.fijos = (S.plan.fijos || []).filter((c) => !["arco", "look", "fondo"].includes(c));
    for (const r of Object.values(S.refs)) if (r && r.en_todas === undefined) r.en_todas = r.papel === "personaje";
  }

  // ---- guardar en el nodo (si se eligió un tramo del audio, antes se escribe su recorte y el LoadAudio apunta a él)
  async function guardar() {
    await ctx.prepararAudioParaGuardar();
    W(node, "idea").value = S.idea;
    W(node, "tomas").value = S.tomas;
    W(node, "duracion_s").value = S.duracion;
    // la duración manda en todo el workflow: length del Text Encode de H3, duración del Prompt Builder… (duracion.js)
    const dur = duracion.aplicarDuracion(graph, S.duracion);
    W(node, "palabras").value = S.palabras;
    W(node, "semilla_llm").value = S.semilla;
    W(node, "estado").value = JSON.stringify({ v: 4, refs: S.refs, etiquetas: ctx.mapaEtiquetas(), efectos: S.efectos,
                                               estilo: S.estilo, estilo_palabras: S.estilo_palabras, sonido: S.sonido, audio_salida: S.audio_salida, frases: S.frases, plan: S.plan, prompt: S.prompt,
                                               a_mano: S.a_mano, audio: S.audio, pegar_beats: S.pegarBeats, idioma: tr.idioma, toma_elegida: S.elegida,
                                               guardado: new Date().toISOString() });
    node.setDirtyCanvas?.(true, true);
    graph.setDirtyCanvas?.(true, true);
    try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch { /* sin seguimiento de cambios */ }
    return dur;
  }
  // lo que la duración cambió en el workflow, para el aviso de la cabecera
  const textoDuracion = (d) => !d ? "" : " · " + t("comun.ventana.duracion", { f: d.fotogramas, s: u.num(d.segundos, 3) }) + " · " +
    (d.cambios.length ? t("comun.ventana.duracion_cambios", { cambios: d.cambios.map((c) => duracion.textoCambio(c, tr)).join(" · ") })
                      : t("comun.ventana.duracion_igual"));
  ctx.guardarYAvisar = () => ctx.guardarYa();             // nombre de antes (otras piezas y pruebas)
  const cerrar = async () => {
    await ctx.guardarYa();                                 // lo último que se escribió, aunque no hayan pasado los 2 s
    fondo.remove();
    document.removeEventListener("keydown", tecla, true);
    window.removeEventListener(i18n.EVENTO, alAjuste);
  };
  // Escape cierra la ventana de encima (ficha, cajita, biblioteca); no cierra el editor, para no perder cambios
  const tecla = (e) => { if (e.key === "Escape" && caja.querySelector(".epl-capa")) { e.stopPropagation(); caja.querySelector(".epl-capa").remove(); } };
  document.addEventListener("keydown", tecla, true);

  // ---- idioma: el botón «ES | EN» cambia el ajuste de ComfyUI (que lo recuerda); editor.js avisa con un evento y aquí
  // se vuelve a pintar todo con el idioma nuevo. Si el ajuste no se puede guardar, cambia igual en esta ventana.
  function aplicarIdioma(idioma) {
    if (idioma === tr.idioma) return;
    tr = i18n.traductor(textos, idioma);
    pintarCabecera();
    ctx.pintarPlan();
    ctx.pintarRefs();
    ctx.pintarFinal();
    ctx.pintarAudio();
    ctx.pintarTexto();
    caja.querySelector(".epl-capa")?.epl?.repintar?.();
    ctx.pedirMontaje();                                    // los huecos del prompt final llegan del servidor, traducidos
    ctx.avisar(t("comun.idioma.listo"), "bien");
  }
  const alAjuste = () => aplicarIdioma(i18n.idiomaElegido(app));
  window.addEventListener(i18n.EVENTO, alAjuste);
  async function cambiarIdioma(idioma) {
    try { await app.extensionManager?.setting?.set?.(i18n.AJUSTE, idioma); } catch (e) { console.warn("[Prompt del edit] ajuste del idioma:", e); }
    aplicarIdioma(idioma);
  }

  const cabecera = el("div", { class: "epl-cabecera" });
  function pintarCabecera() {
    const boton = (i, texto) => el("button", { class: "epl-mini" + (tr.idioma === i ? " fijo" : ""), "data-idioma": i,
                                               onclick: () => cambiarIdioma(i) }, texto);
    cabecera.replaceChildren(el("b", {}, t("comun.ventana.titulo")), estado, ctx.panelResolucion(),
      el("span", { class: "epl-idioma", title: t("comun.idioma.tooltip") }, boton("es", "ES"), " | ", boton("en", "EN")),
      el("span", { class: "epl-ayuda epl-auto", title: t("comun.ventana.autoguardado.tooltip") }, t("comun.ventana.autoguardado.etiqueta")),
      el("button", { class: "epl-boton epl-verde epl-grande epl-cerrar", onclick: cerrar }, t("comun.cerrar_ventana")),
      el("button", { class: "epl-x", title: t("comun.cerrar_ventana"), onclick: cerrar }, "✕"));
  }
  pintarCabecera();
  // el orden (27 oct, lo pidió el usuario): arriba las referencias, después la línea de tiempo entera (texto, tomas, audio y
  // sonido) y abajo del todo el prompt de la toma elegida y el prompt final
  caja.append(cabecera, el("div", { class: "epl-cuerpo" }, secRefs, secTiempo, secToma, secFinal));
  ctx.pintarPlan();
  ctx.pintarRefs();
  ctx.pintarFinal();
  ctx.pintarAudio();
  ctx.pedirMontaje();
  ctx.avisar(wf.audio ? t("comun.ventana.audio", { audio: wf.audio }) : t("comun.ventana.sin_audio"));
  ctx.idioma = { aplicar: aplicarIdioma, cambiar: cambiarIdioma, actual: () => tr.idioma };   // para probar desde la consola
  return ctx;
}
