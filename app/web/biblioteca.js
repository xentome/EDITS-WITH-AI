/* MAX EDITOR · la ventana «Proyectos» (29 oct, variante P1 de app/web/prototipo_biblioteca.html, elegida por Jonathan).
 * Sale al abrir la app y con el botón del proyecto de la cabecera; es como el gestor de proyectos de DaVinci Resolve:
 *   - «Proyectos»: una tarjeta por proyecto con su último video (una miniatura quieta, GET /app/miniatura, que se mueve al
 *     pasar el ratón), la fecha y cuántos videos tiene. Un clic lo elige, doble clic (o «Abrir proyecto») lo abre.
 *   - «Biblioteca»: TODOS los videos (GET /app/videos), en una carpeta por proyecto. Las carpetas son de la vista: los
 *     archivos siguen en app/salidas/ (decisión de Jonathan). Un video de cualquier carpeta se trae al proyecto abierto sin
 *     copiarlo: «Poner en Retocar», «Extender» o «Retomar su prompt» (aquí o en una copia).
 * Lo que abre, crea o trae lo hace app.js (los mismos caminos que el desplegable de antes y la ventana «Videos»). */
export function crear({ el, icono, t, num, pedir, A, EJEMPLO, abrirProyecto, abrirEjemplo, cargarProyectos, pedirNombre, describir, usarVideo }) {
  const SIN = "";                                  // la carpeta de los videos sin proyecto
  const CLASE = { capa: { true: "max-bib ver", false: "max-bib" }, tab: { true: "max-bib-tab activa", false: "max-bib-tab" },
                  carpeta: { true: "max-bib-carpeta activa", false: "max-bib-carpeta" } };
  const B = { abierta: false, tab: "proyectos", elegido: null, carpeta: null, video: null, buscar: "", videos: [], retomar: false };
  const capa = el("div", { class: "max-bib", onclick: (e) => { if (e.target === capa) cerrar(); } });
  const caja = el("div", { class: "max-bib-caja", role: "dialog", "aria-modal": "true" });
  capa.append(caja);
  // un solo reproductor grande (como en «Videos»): cambia de archivo en vez de crearse otra vez
  const grande = el("video", { controls: true, autoplay: true, loop: true, muted: true, playsinline: true });
  const soltar = () => { grande.pause(); grande.removeAttribute("src"); grande.load(); };
  const urlVideo = (a) => "/app/salidas/" + encodeURIComponent(a);
  const fecha = (s) => (s || "").replace("T", " ").slice(0, 16);
  const de = (nombre) => B.videos.filter((v) => (v.proyecto || SIN) === nombre);
  const nombreCarpeta = (k) => k === SIN ? t("app.biblio.sin_proyecto") : k;
  const coincide = (texto) => !B.buscar || texto.toLowerCase().includes(B.buscar.toLowerCase());
  function carpetas() {            // en el orden de su video más nuevo (la lista ya viene de lo más nuevo a lo más viejo)
    const m = new Map();
    for (const v of B.videos) { const k = v.proyecto || SIN; if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
    return [...m.entries()];
  }

  // la miniatura: una imagen quieta; al pasar el ratón, el video en silencio (se suelta al salir)
  function mini(v) {
    if (!v) return el("div", { class: "max-bib-mini vacia" }, el("span", {}, t("app.biblio.sin_videos")));
    const img = el("img", { src: "/app/miniatura?video=" + encodeURIComponent(v.archivo), alt: "", loading: "lazy" });
    const caja = el("div", { class: "max-bib-mini" }, img,
      v.tipo ? el("span", { class: "max-bib-tipo" }, describir(v).split(" · ")[0]) : null);
    caja.addEventListener("mouseenter", () => {
      const vid = el("video", { src: urlVideo(v.archivo), muted: true, loop: true, autoplay: true, playsinline: true });
      caja.append(vid);
    });
    caja.addEventListener("mouseleave", () => caja.querySelectorAll("video").forEach((x) => { x.pause(); x.removeAttribute("src"); x.load(); x.remove(); }));
    return caja;
  }

  function abrirElegido(nombre = B.elegido) {
    if (!nombre) return;
    cerrar();
    if (nombre !== A.proyecto) (nombre === EJEMPLO ? abrirEjemplo() : abrirProyecto(nombre));
  }
  function tarjetaProyecto(p) {
    const vs = de(p.nombre);
    return el("button", { class: "max-bib-proy" + (B.elegido === p.nombre ? " elegido" : "") + (A.proyecto === p.nombre ? " actual" : ""),
                          title: t("app.biblio.abrir.tooltip"), "aria-pressed": String(B.elegido === p.nombre),
                          onclick: () => { B.elegido = p.nombre; pintar(); }, ondblclick: () => abrirElegido(p.nombre) },
      mini(vs[0]),
      el("b", {}, p.nombre === EJEMPLO ? t("app.proyecto.ejemplo_opcion", { nombre: p.nombre }) : p.nombre,
        A.proyecto === p.nombre ? el("span", { class: "max-bib-abierto" }, t("app.biblio.abierto")) : null),
      el("small", {}, t("app.biblio.proyecto.info", { fecha: fecha(p.guardado), n: vs.length })));
  }
  function tarjetaVideo(v) {
    return el("button", { class: "max-bib-vid" + (B.video === v.archivo ? " elegido" : ""), "aria-pressed": String(B.video === v.archivo),
                          onclick: () => { B.video = v.archivo; B.retomar = false; pintar(); } },
      mini(v), el("small", {}, fecha(v.fecha) + " · " + describir(v)));
  }

  // el video elegido de la biblioteca: verlo y traerlo al proyecto abierto
  function panelTraer() {
    const v = B.videos.find((x) => x.archivo === B.video);
    if (!v) { soltar(); return el("div", { class: "max-bib-traer" }, el("div", { class: "max-vacio" }, t("app.biblio.elige_video"))); }
    if (grande.getAttribute("src") !== urlVideo(v.archivo)) { grande.setAttribute("src", urlVideo(v.archivo)); grande.load(); grande.play().catch(() => {}); }
    const ajeno = (v.proyecto || SIN) !== A.proyecto;
    const boton = (clase, clave, tooltip, ic, accion, extra = {}) => el("button", { class: "max-boton max-vid-accion " + clase, title: t(tooltip), onclick: accion, ...extra },
      icono(ic), " " + t(clave));
    const usar = (accion, donde) => () => { cerrar(); usarVideo(v, accion, donde); };
    const acciones = B.retomar
      ? el("div", { class: "max-vid-confirmar", role: "group" }, el("b", {}, t("app.videos.retomar.donde")),
          boton("max-vid-retomar", "app.videos.retomar.aqui", "app.videos.retomar.aqui.tooltip", "check", usar("retomar", "aqui")),
          boton("", "app.videos.retomar.copia", "app.videos.retomar.copia.tooltip", "mas", usar("retomar", "copia")),
          el("button", { class: "max-boton max-vid-accion", onclick: () => { B.retomar = false; pintar(); } }, t("app.proyecto.cancelar")))
      : el("div", { class: "max-vid-acciones" },
          boton("max-bib-retocar", "app.videos.retocar", "app.videos.retocar.tooltip", "retoque", usar("retocar")),
          boton("", "app.videos.extender", "app.videos.extender.tooltip", "tomas", usar("extender")),
          boton("", "app.biblio.retomar", "app.videos.retomar.tooltip", "texto", () => { B.retomar = true; pintar(); },
                v.prompt_de ? {} : { disabled: true, title: t("app.videos.retomar.sin") }));
    return el("div", { class: "max-bib-traer" }, ...[
      el("h3", {}, t(ajeno ? "app.biblio.traer" : "app.biblio.usar")),
      grande,
      el("small", { class: "max-bib-de" }, t("app.biblio.video.info", { proyecto: nombreCarpeta(v.proyecto || SIN), fecha: fecha(v.fecha), que: describir(v) })),
      ajeno ? el("div", { class: "max-bib-aviso" }, t("app.biblio.ajeno", { de: nombreCarpeta(v.proyecto || SIN), aqui: A.proyecto })) : null,
      acciones].filter(Boolean));
  }

  function pintar() {
    capa.className = CLASE.capa[B.abierta];
    if (!B.abierta) { soltar(); return caja.replaceChildren(); }
    const proyectos = B.tab === "proyectos";
    const tab = (k, ic, clave) => el("button", { class: CLASE.tab[B.tab === k], role: "tab", "aria-selected": String(B.tab === k),
                                                 onclick: () => { B.tab = k; B.video = null; B.retomar = false; pintar(); } }, icono(ic), " " + t(clave));
    const carpeta = (k, nombre, n) => el("button", { class: CLASE.carpeta[B.carpeta === k], onclick: () => { B.carpeta = k; pintar(); } },
      icono("carpeta"), el("span", {}, nombre), el("small", {}, String(n)));
    const lado = el("div", { class: "max-bib-lado", role: "tablist" }, tab("proyectos", "capas", "app.biblio.proyectos"), tab("biblioteca", "video", "app.biblio.biblioteca"),
      ...(proyectos ? [] : [carpeta(null, t("app.biblio.todos"), B.videos.length), ...carpetas().map(([k, vs]) => carpeta(k, nombreCarpeta(k), vs.length))]));
    const buscar = el("input", { class: "max-bib-buscar", type: "search", placeholder: t("app.biblio.buscar"), value: B.buscar,
                                 oninput: (e) => { B.buscar = e.target.value; pintarCentro(); } });
    const nuevo = el("button", { class: "max-boton max-vid-accion", title: t("app.proyecto.nuevo.tooltip"), onclick: (e) => { pedirNombre(e.currentTarget, "nuevo", cerrar); } },
      icono("mas"), " " + t("app.biblio.nuevo"));
    const ejemplo = el("button", { class: "max-boton max-vid-accion", title: t("app.biblio.ejemplo.tooltip"), onclick: () => { cerrar(); abrirEjemplo(); } }, t("app.biblio.ejemplo"));
    const centro = el("div", { class: "max-bib-centro" });
    function pintarCentro() {
      if (proyectos) {
        const lista = A.proyectos.filter((p) => coincide(p.nombre));
        centro.replaceChildren(lista.length ? el("div", { class: "max-bib-rejilla" }, lista.map(tarjetaProyecto)) : el("div", { class: "max-vacio" }, t("app.biblio.nada")));
      } else {
        const vs = (B.carpeta === null ? B.videos : de(B.carpeta)).filter((v) => coincide(`${v.archivo} ${v.proyecto || ""} ${describir(v)}`));
        centro.replaceChildren(el("div", { class: "max-bib-rotulo" }, B.carpeta === null ? t("app.biblio.todos_n", { n: vs.length })
                                                                         : t("app.biblio.carpeta_n", { carpeta: nombreCarpeta(B.carpeta), n: vs.length })),
          vs.length ? el("div", { class: "max-bib-rejilla videos" }, vs.map(tarjetaVideo)) : el("div", { class: "max-vacio" }, t("app.biblio.nada")));
      }
    }
    pintarCentro();
    caja.replaceChildren(
      el("div", { class: "max-bib-cab" }, el("b", { class: "max-bib-titulo" }, t(proyectos ? "app.biblio.proyectos" : "app.biblio.titulo_biblioteca")), buscar,
        el("span", { class: "max-derecha" }), nuevo, ejemplo,
        el("button", { class: "max-boton max-cerrar", title: t("comun.cerrar"), "aria-label": t("comun.cerrar"), onclick: cerrar }, icono("x"))),
      el("div", { class: "max-bib-cuerpo" + (proyectos ? "" : " con-panel") }, lado, centro, ...(proyectos ? [] : [panelTraer()])),
      ...(proyectos ? [el("div", { class: "max-bib-pie" },
        el("span", {}, B.elegido ? t("app.biblio.elegido", { nombre: B.elegido }) : t("app.biblio.elige")),
        el("span", { class: "max-derecha" }),
        el("button", { class: "max-boton max-vid-accion", onclick: cerrar }, t("app.proyecto.cancelar")),
        el("button", { class: "max-generar max-bib-abrir", disabled: !B.elegido, onclick: () => abrirElegido() }, icono("adelante"), " " + t("app.biblio.abrir")))] : []));
  }

  async function abrir(tab = "proyectos") {
    B.abierta = true;
    B.tab = tab;
    B.elegido = A.proyecto;
    B.video = null;
    B.retomar = false;
    B.carpeta = tab === "biblioteca" ? null : B.carpeta;
    pintar();
    try {
      [B.videos] = await Promise.all([pedir("/app/videos"), cargarProyectos()]);
    } catch { B.videos = []; }
    if (B.abierta) pintar();
  }
  function cerrar() { B.abierta = false; B.retomar = false; pintar(); }
  document.addEventListener("keydown", (e) => {
    if (!B.abierta || e.key !== "Escape" || A.pop) return;
    e.stopPropagation();
    if (B.retomar) { B.retomar = false; return pintar(); }
    cerrar();
  }, true);
  document.body.append(capa);
  return { abrir, cerrar, abierta: () => B.abierta };
}
