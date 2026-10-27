/* Cajitas del editor: un RefMod hecho con VARIAS fotos (Fantastic las junta, un fotograma cada una, y H3 lo recibe como
 * <Video N>). Ocupa un solo lugar en su mitad, enseña un mosaico y al tocarla se abre con todas sus fotos.
 * Crear una: se eligen fotos (de las referencias del editor o del Media Loader, input/minimax_h3) y el servidor hace el
 * RefMod (acción crear_cajita, nodo MiniMaxH3FantasticRefModCreate); después se añade al Stack.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md. */

const CONCEPTO = { personaje: "identity", objeto: "generic", lugar: "background", ropa: "clothing", pose: "pose_motion",
                   fondo: "background", estilo: "style", efecto: "style" };
const CAMPOS_REF = ["personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"];
// la descripción que se guarda en el RefMod (en disco, la ve la biblioteca de Fantastic): un dato, en un solo idioma
const DESCRIPCION = (n) => `Cajita de ${n} fotos (editor del edit)`;

/* Añade ctx.abrirCajita y ctx.crearCajita. Usa de ctx: u, S, wf, caja, capa, abrirFicha, cargarBiblioteca, biblioteca,
 * cajitas, cambiarStack, tarjeta, vista, fotosDe, nFotos, ladoDe, avisar. */
export function instalar(ctx) {
  const { u, S, wf, caja } = ctx;
  const { el, api, t } = u;

  // ---- abrir: la ficha de la referencia, con sus fotos a la izquierda
  ctx.abrirCajita = function abrirCajita(r) {
    ctx.abrirFicha(r, {
      izquierda: (r2) => {
        const fotos = ctx.fotosDe(r2);
        if (!fotos) {
          const src = ctx.vista(r2);
          return el("div", {},
            el("div", { class: "grande" }, src ? el("div", { class: "fondo", style: { backgroundImage: `url("${src}")` } }) : null,
              src ? el("img", { src, alt: "" }) : null),
            el("p", { class: "epl-ayuda" }, t("referencias.cajita.sin_apuntar", { n: ctx.nFotos(r2) })));
        }
        return el("div", {}, el("div", { class: "epl-ayuda" }, t("referencias.cajita.resumen",
                                                                { nombre: r2.nombre, n: fotos.length, tag: r2.tag || t("comun.apagada") })),
          el("div", { class: "epl-fotos epl-cajita-fotos" }, ...fotos.map((f, i) => el("div", {},
            el("img", { src: u.vistaMedio(f.file), alt: "" }), el("b", {}, `${i + 1}. `), f.name))));
      },
      botones: (r2, v) => el("div", { class: "epl-fila" },
        el("button", { class: "epl-mini", title: t("referencias.cajita.cambiar.tooltip"),
          onclick: () => { v.cerrar(); ctx.crearCajita({ lado: ctx.ladoDe(r2), desde: r2 }); } }, t("referencias.cajita.cambiar"))),
    });
  };

  // ---- crear
  ctx.crearCajita = async function crearCajita({ lado = "izq", desde = null } = {}) {
    const refDesde = desde ? S.refs[desde.clave] || {} : {};
    const st = {
      nombre: desde ? `${desde.nombre}_v2` : "", papel: refDesde.papel || (lado === "izq" ? "personaje" : "ropa"),
      nombrePrompt: refDesde.nombre || "", ficha: refDesde.ficha || "", apagar: true, pestaña: "editor", filtro: "",
      elegidas: (desde && ctx.fotosDe(desde) || []).map((f) => ({ clave: "file:" + f.file, src: u.vistaMedio(f.file), texto: f.name,
                                                                fuente: { file: f.file } })),
    };
    let medios = null;
    const v = ctx.capa(lado);
    const elegida = (clave) => st.elegidas.some((e) => e.clave === clave);
    const alternar = (c) => {
      if (elegida(c.clave)) st.elegidas = st.elegidas.filter((e) => e.clave !== c.clave);
      else st.elegidas.push(c);
      pintar();
    };
    const candidatos = () => st.pestaña === "editor"
      ? wf.items.filter((r) => r.ref && r.kind === "image").map((r) => ({ clave: "ref:" + r.ref, src: ctx.vista(r),
          texto: `${r.tag || t("comun.apagada")} ${r.nombre}`, fuente: { refmod: r.ref }, ref: r.ref }))
      : (medios || []).map((m) => ({ clave: "file:" + m.file, src: u.vistaMedio(m.file), texto: `${m.carpeta.replace(/^minimax_h3\/?/, "")}/${m.name}`,
                                    fuente: { file: m.file } }));
    // tamaño de los recuadros del selector: se recuerda (ctx.controlTamano) y sobrevive a cada repintado
    let tamElegir = 200;
    const pintar = () => {
      const q = st.filtro.toLowerCase();
      const lista = candidatos().filter((c) => c.texto.toLowerCase().includes(q));
      v.modal.className = "epl-modal " + lado;
      const rejElegir = el("div", { class: "epl-elegir" }, ...lista.map((c) => el("div", { class: elegida(c.clave) ? "si" : "", title: c.texto,
                onclick: () => alternar(c) }, el("img", { src: c.src, alt: "", loading: "lazy" }), el("div", { class: "nombre" }, c.texto))));
      v.modal.replaceChildren(
        el("div", { class: "epl-tit" }, desde ? t("referencias.cajita.titulo_cambiar", { nombre: desde.nombre }) : t("referencias.cajita.titulo_nueva"),
          el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => v.cerrar() }, t("comun.cerrar")))),
        el("div", { class: "epl-ficha" },
          el("div", {},
            el("div", { class: "epl-fila" },
              el("button", { class: "epl-mini" + (st.pestaña === "editor" ? " fijo" : ""), onclick: () => { st.pestaña = "editor"; pintar(); } },
                t("referencias.cajita.de_editor")),
              el("button", { class: "epl-mini" + (st.pestaña === "input" ? " fijo" : ""), onclick: async () => {
                st.pestaña = "input";
                if (!medios) { try { medios = (await api("medios", {})).fotos; } catch (e) { ctx.avisar(e.message, "mal"); medios = []; } }
                pintar(); } }, t("referencias.cajita.de_media")),
              // se busca por su clase (no por su texto, que cambia con el idioma) para devolverle el foco al repintar
              el("input", { class: "epl-cajita-buscar", placeholder: t("comun.buscar"), value: st.filtro, style: { flex: 1 },
                oninput: (e) => { st.filtro = e.target.value; clearTimeout(st.t); st.t = setTimeout(() => { pintar(); v.modal.querySelector(".epl-cajita-buscar")?.focus(); }, 250); } })),
            el("div", { class: "epl-fila" }, el("span", { class: "epl-ayuda", style: { margin: 0 } }, t("referencias.cajita.tamano")),
              ctx.controlTamano((t) => { tamElegir = t; rejElegir.style.setProperty("--epl-tam", t + "px"); }, "epl-tam-cajita", tamElegir)),
            st.pestaña === "input" && !medios ? el("p", { class: "epl-vacio" }, t("comun.cargando")) : null,
            rejElegir,
            el("p", { class: "epl-ayuda" }, t("referencias.cajita.ayuda"))),
          el("div", {},
            el("label", {}, t("referencias.cajita.dentro", { n: st.elegidas.length })),
            el("div", { class: "epl-fotos" }, ...st.elegidas.map((e, i) => el("div", {},
              el("img", { src: e.src, alt: "", style: { height: "120px" } }), `${i + 1}. ${e.texto}`,
              el("button", { class: "epl-mini quitar", title: t("referencias.cajita.sacar"), onclick: () => { st.elegidas.splice(i, 1); pintar(); } }, u.icono("x"))))),
            el("label", {}, t("referencias.cajita.nombre_refmod")),
            el("input", { value: st.nombre, placeholder: t("referencias.cajita.nombre_refmod.placeholder"), oninput: (e) => { st.nombre = e.target.value; } }),
            el("label", {}, t("referencias.ficha.papel")),
            el("select", { onchange: (e) => { st.papel = e.target.value; } },
              ...Object.keys(CONCEPTO).map((p) => el("option", { value: p, selected: st.papel === p }, t(`referencias.papel.${p}`)))),
            el("label", {}, t("referencias.cajita.nombre")),
            el("input", { value: st.nombrePrompt, oninput: (e) => { st.nombrePrompt = e.target.value; } }),
            el("label", {}, t("referencias.cajita.ficha")),
            el("textarea", { rows: 2, oninput: (e) => { st.ficha = e.target.value; } }, st.ficha),
            el("label", { style: { display: "flex", gap: "6px", alignItems: "center" } },
              el("input", { type: "checkbox", checked: st.apagar, onchange: (e) => { st.apagar = e.target.checked; } }),
              t("referencias.cajita.apagar_sueltas")),
            el("div", { class: "epl-fila" },
              el("button", { class: "epl-boton fuerte", onclick: () => crear() }, t("referencias.cajita.crear"))))));
    };
    v.repintar = pintar;                                   // al cambiar de idioma: lo elegido se conserva en st
    async function crear() {
      if (S.ocupado) return;
      if (st.elegidas.length < 2) return ctx.avisar(t("errores.cajita_pocas_fotos"), "mal");
      if (!st.nombre.trim()) return ctx.avisar(t("errores.cajita_sin_nombre"), "mal");
      S.ocupado = true;
      caja.classList.add("ocupada");
      const t0 = Date.now();
      const reloj = setInterval(() => ctx.avisar(t("referencias.cajita.creando", { s: Math.round((Date.now() - t0) / 1000) }), "trabajando"), 500);
      try {
        const res = await api("crear_cajita", { nombre: st.nombre.trim(), carpeta: "cajitas", concepto: CONCEPTO[st.papel],
          descripcion: DESCRIPCION(st.elegidas.length), fotos: st.elegidas.map((e) => e.fuente) });
        await ctx.cargarBiblioteca();
        const it = ctx.biblioteca[res.name];
        if (!it) throw new Error(t("referencias.cajita.no_en_biblioteca", { nombre: res.name }));
        S.refs[res.name] = { papel: st.papel, nombre: st.nombrePrompt.trim(), ficha: st.ficha.trim(), origen: "cajita" };
        const sueltas = st.apagar ? st.elegidas.map((e) => e.fuente.refmod).filter(Boolean) : [];
        // las tomas que citaban la cajita vieja pasan a citar la nueva
        const citas = desde?.tag ? S.plan.tomas.flatMap((t) => CAMPOS_REF.filter((c) => t[c] === desde.tag).map((c) => [t, c])) : [];
        ctx.cambiarStack((picks) => {
          const nueva = ctx.tarjeta(it, picks);
          if (desde?.idx !== undefined && picks[desde.idx]?.name === desde.ref) picks[desde.idx] = nueva;
          else { if (picks.length >= 12) throw new Error(t("errores.stack_lleno")); picks.push(nueva); }
          for (const p of picks) if (sueltas.includes(p.name)) p.on = false;
        });
        const tagNueva = wf.lista.find((r) => r.clave === res.name)?.tag;
        for (const [t, c] of citas) t[c] = tagNueva || "";
        v.cerrar();
        ctx.pintarRefs();
        ctx.pintarPlan();
        ctx.pedirMontaje();
        ctx.avisar(t(tagNueva ? "referencias.cajita.creada_como" : "referencias.cajita.creada",
                     { nombre: res.name, s: u.num(res.segundos), tag: tagNueva }), "bien");
      } catch (e) {
        ctx.avisar(t("referencias.cajita.error", { error: e.message }), "mal");
      } finally {
        clearInterval(reloj);
        S.ocupado = false;
        caja.classList.remove("ocupada");
      }
    }
    pintar();
  };
}
