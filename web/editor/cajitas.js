/* Cajitas del editor: un RefMod hecho con VARIAS fotos (Fantastic las junta, un fotograma cada una, y H3 lo recibe como
 * <Video N>). Ocupa un solo lugar en su mitad, enseña un mosaico y al tocarla se abre con todas sus fotos.
 * Crear una: se eligen fotos (de las referencias del editor o del Media Loader, input/minimax_h3) y el servidor hace el
 * RefMod (acción crear_cajita, nodo MiniMaxH3FantasticRefModCreate); después se añade al Stack.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md. */

const CONCEPTO = { personaje: "identity", objeto: "generic", lugar: "background", ropa: "clothing", pose: "pose_motion",
                   fondo: "background", estilo: "style" };
const CAMPOS_REF = ["personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref"];

/* Añade ctx.abrirCajita y ctx.crearCajita. Usa de ctx: u, S, wf, caja, capa, abrirFicha, cargarBiblioteca, biblioteca,
 * cajitas, cambiarStack, tarjeta, vista, fotosDe, nFotos, ladoDe, avisar. */
export function instalar(ctx) {
  const { u, S, wf, caja } = ctx;
  const { el, api } = u;

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
            el("p", { class: "epl-ayuda" }, `Esta cajita tiene ${ctx.nFotos(r2)} fotos, pero no están apuntadas: solo se ve la primera. ` +
              "Si la vuelves a crear con «Cambiar fotos», quedarán apuntadas."));
        }
        return el("div", {}, el("div", { class: "epl-ayuda" }, `Cajita «${r2.nombre}» · ${fotos.length} fotos · H3 la recibe como ${r2.tag || "(apagada)"}`),
          el("div", { class: "epl-fotos epl-cajita-fotos" }, ...fotos.map((f, i) => el("div", {},
            el("img", { src: u.vistaMedio(f.file), alt: "" }), el("b", {}, `${i + 1}. `), f.name))));
      },
      botones: (r2, v) => el("div", { class: "epl-fila" },
        el("button", { class: "epl-mini", title: "Abre el creador con estas fotos; al crearla, la nueva ocupa el lugar de esta en el Stack",
          onclick: () => { v.cerrar(); ctx.crearCajita({ lado: ctx.ladoDe(r2), desde: r2 }); } }, "✎ Cambiar fotos (crea una cajita nueva)")),
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
          texto: `${r.tag || "(apagada)"} ${r.nombre}`, fuente: { refmod: r.ref }, ref: r.ref }))
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
        el("div", { class: "epl-tit" }, desde ? `Cambiar las fotos de «${desde.nombre}» (se crea una cajita nueva)` : "Nueva cajita: varias fotos en una sola referencia",
          el("span", { class: "der" }, el("button", { class: "epl-mini", onclick: () => v.cerrar() }, "cerrar"))),
        el("div", { class: "epl-ficha" },
          el("div", {},
            el("div", { class: "epl-fila" },
              el("button", { class: "epl-mini" + (st.pestaña === "editor" ? " fijo" : ""), onclick: () => { st.pestaña = "editor"; pintar(); } },
                "De las referencias del editor"),
              el("button", { class: "epl-mini" + (st.pestaña === "input" ? " fijo" : ""), onclick: async () => {
                st.pestaña = "input";
                if (!medios) { try { medios = (await api("medios", {})).fotos; } catch (e) { ctx.avisar(e.message, "mal"); medios = []; } }
                pintar(); } }, "Del Media Loader (input/minimax_h3)"),
              el("input", { placeholder: "buscar…", value: st.filtro, style: { flex: 1 },
                oninput: (e) => { st.filtro = e.target.value; clearTimeout(st.t); st.t = setTimeout(() => { pintar(); v.modal.querySelector("input[placeholder='buscar…']")?.focus(); }, 250); } })),
            el("div", { class: "epl-fila" }, el("span", { class: "epl-ayuda", style: { margin: 0 } }, "tamaño de las fotos"),
              ctx.controlTamano((t) => { tamElegir = t; rejElegir.style.setProperty("--epl-tam", t + "px"); }, "epl-tam-cajita", tamElegir)),
            st.pestaña === "input" && !medios ? el("p", { class: "epl-vacio" }, "Cargando…") : null,
            rejElegir,
            el("p", { class: "epl-ayuda" }, "Toca una foto para meterla o sacarla. La primera marca el tamaño de las demás.")),
          el("div", {},
            el("label", {}, `Fotos dentro (${st.elegidas.length})`),
            el("div", { class: "epl-fotos" }, ...st.elegidas.map((e, i) => el("div", {},
              el("img", { src: e.src, alt: "", style: { height: "120px" } }), `${i + 1}. ${e.texto}`,
              el("button", { class: "epl-mini quitar", title: "Sacar", onclick: () => { st.elegidas.splice(i, 1); pintar(); } }, "✕")))),
            el("label", {}, "Nombre del RefMod (carpeta cajitas/)"),
            el("input", { value: st.nombre, placeholder: "ej.: teto_identidad", oninput: (e) => { st.nombre = e.target.value; } }),
            el("label", {}, "Papel"),
            el("select", { onchange: (e) => { st.papel = e.target.value; } },
              ...Object.keys(CONCEPTO).map((p) => el("option", { value: p, selected: st.papel === p }, p))),
            el("label", {}, "Nombre en el prompt (objeto, lugar, ropa; vacío para la identidad de un personaje)"),
            el("input", { value: st.nombrePrompt, oninput: (e) => { st.nombrePrompt = e.target.value; } }),
            el("label", {}, "Ficha (en inglés, opcional)"),
            el("textarea", { rows: 2, oninput: (e) => { st.ficha = e.target.value; } }, st.ficha),
            el("label", { style: { display: "flex", gap: "6px", alignItems: "center" } },
              el("input", { type: "checkbox", checked: st.apagar, onchange: (e) => { st.apagar = e.target.checked; } }),
              "apagar en el Stack las referencias sueltas que meta en la cajita"),
            el("div", { class: "epl-fila" },
              el("button", { class: "epl-boton fuerte", onclick: () => crear() }, "Crear cajita (unos 10 s)")))));
    };
    async function crear() {
      if (S.ocupado) return;
      if (st.elegidas.length < 2) return ctx.avisar("Una cajita necesita al menos 2 fotos", "mal");
      if (!st.nombre.trim()) return ctx.avisar("Ponle un nombre a la cajita", "mal");
      S.ocupado = true;
      caja.classList.add("ocupada");
      const t0 = Date.now();
      const reloj = setInterval(() => ctx.avisar(`Creando la cajita… ${Math.round((Date.now() - t0) / 1000)} s`, "trabajando"), 500);
      try {
        const res = await api("crear_cajita", { nombre: st.nombre.trim(), carpeta: "cajitas", concepto: CONCEPTO[st.papel],
          descripcion: `Cajita de ${st.elegidas.length} fotos (editor del edit)`, fotos: st.elegidas.map((e) => e.fuente) });
        await ctx.cargarBiblioteca();
        const it = ctx.biblioteca[res.name];
        if (!it) throw new Error(`${res.name} se creó pero no aparece en la biblioteca`);
        S.refs[res.name] = { papel: st.papel, nombre: st.nombrePrompt.trim(), ficha: st.ficha.trim(), origen: "cajita" };
        const sueltas = st.apagar ? st.elegidas.map((e) => e.fuente.refmod).filter(Boolean) : [];
        // las tomas que citaban la cajita vieja pasan a citar la nueva
        const citas = desde?.tag ? S.plan.tomas.flatMap((t) => CAMPOS_REF.filter((c) => t[c] === desde.tag).map((c) => [t, c])) : [];
        ctx.cambiarStack((picks) => {
          const nueva = ctx.tarjeta(it, picks);
          if (desde?.idx !== undefined && picks[desde.idx]?.name === desde.ref) picks[desde.idx] = nueva;
          else { if (picks.length >= 12) throw new Error("El Stack ya tiene 12 tarjetas"); picks.push(nueva); }
          for (const p of picks) if (sueltas.includes(p.name)) p.on = false;
        });
        const tagNueva = wf.lista.find((r) => r.clave === res.name)?.tag;
        for (const [t, c] of citas) t[c] = tagNueva || "";
        v.cerrar();
        ctx.pintarRefs();
        ctx.pintarPlan();
        ctx.pedirMontaje();
        ctx.avisar(`Cajita ${res.name} creada en ${res.segundos} s y añadida al Stack` + (tagNueva ? ` como ${tagNueva}` : ""), "bien");
      } catch (e) {
        ctx.avisar("Cajita: " + e.message, "mal");
      } finally {
        clearInterval(reloj);
        S.ocupado = false;
        caja.classList.remove("ocupada");
      }
    }
    pintar();
  };
}
