/* La duración manda en todo el workflow. H3 solo hace videos de 17·k + 5 fotogramas a 24 fps (5, 22, 39, 56, 73, 90, 107,
 * 124…; comfy_extras/nodes_minimax_h3.py, align_frame_count, redondea hacia arriba). Al guardar el editor (o al cambiar
 * «duracion_s» en el nodo, web/editor.js) se ponen en el valor válido más cercano a duración·24:
 *   - el «length» de los nodos que fijan el largo del video (Text Encode de Fantastic, latente vacío, ImageToVideo…);
 *   - el «duration» (segundos) de los demás nodos MiniMaxH3 que lo tengan;
 *   - el «duration» del builder_state del Prompt Builder (en segundos: fotogramas / 24).
 * Los nodos se buscan por su tipo, no por su número. Un campo que llega enlazado desde otro nodo no se toca.
 * Solo exporta funciones (ComfyUI importa todos los .js de web/). Planos: ../../planos/4 El editor.md, «La duración». */

export const FPS = 24;
export const LONGITUD = ["MiniMaxH3FantasticRefModTextEncode", "EmptyMiniMaxH3LatentAV", "MiniMaxH3ImageToVideo",
                         "MiniMaxH3ReferenceToVideo", "MpiH3ImageToVideo", "MpiH3References"];

// el número de fotogramas válido para H3 (17·k + 5) más cercano a s·24
export function fotogramasH3(s) {
  const f = (+s || 0) * FPS;
  return 17 * Math.max(0, Math.round((f - 5) / 17)) + 5;
}
export const segundosH3 = (s) => Math.round(fotogramasH3(s) / FPS * 1000) / 1000;

const enlazado = (n, nombre) => (n.inputs || []).some((i) => i.widget?.name === nombre && i.link != null);
const nombreNodo = (n) => `#${n.id} ${n.title || n.type}`;

/* Pone la duración en los nodos del workflow. Devuelve {fotogramas, segundos, cambios: [texto]} (solo lo que cambió). */
export function aplicarDuracion(graph, segundos) {
  const f = fotogramasH3(segundos), s = Math.round(f / FPS * 1000) / 1000, cambios = [];
  for (const n of graph?._nodes || []) {
    const ws = n.widgets || [];
    const poner = (w, v, texto) => {
      if (!w || enlazado(n, w.name) || w.value === v) return;
      const antes = w.value;
      w.value = v;
      try { w.callback?.(v); } catch { /* el nodo no necesita enterarse */ }
      cambios.push(`${nombreNodo(n)}: ${texto} ${typeof antes === "number" ? +antes.toFixed?.(3) : antes} → ${v}`);
    };
    const len = ws.find((w) => w.name === "length" && typeof w.value === "number");
    if (len && (LONGITUD.includes(n.type) || /^MiniMaxH3/.test(n.type))) poner(len, f, "length");
    const dur = ws.find((w) => w.name === "duration" && typeof w.value === "number");
    if (dur && /^MiniMaxH3/.test(n.type)) poner(dur, s, "duración (s)");
    if (n.type === "MiniMaxH3PromptBuilder") {
      const w = ws.find((x) => x.name === "builder_state") || ws.find((x) => typeof x.value === "string" && /^\s*\{[\s\S]*"duration"/.test(x.value));
      let st = null;
      try { st = w && JSON.parse(w.value); } catch { st = null; }
      if (st && typeof st === "object" && Math.abs((+st.duration || 0) - s) > 1e-3 && !enlazado(n, w.name)) {
        const antes = +st.duration;
        st.duration = s;
        w.value = JSON.stringify(st);
        cambios.push(`${nombreNodo(n)}: duración del builder ${Math.round(antes * 1000) / 1000} → ${s}`);
      }
    }
    if (cambios.length) n.setDirtyCanvas?.(true, true);
  }
  graph?.setDirtyCanvas?.(true, true);
  return { fotogramas: f, segundos: s, cambios };
}
