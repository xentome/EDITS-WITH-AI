/* Dos idiomas (español / inglés) para el nodo y su ventana. Los textos viven en ../i18n/es.json y ../i18n/en.json, planos
 * ({"clave": "texto con {marcadores}"}); el código solo usa t("clave", {datos}). Planos: ../../planos/2 Mapa del codigo.md,
 * «Dos idiomas».
 *   - Si falta una clave en el idioma elegido, sale el español y se avisa en la consola; si tampoco está, la propia clave.
 *     Nunca un texto vacío.
 *   - Números y listas con Intl: coma decimal en español, punto en inglés (num, lista).
 *   - El idioma sale del ajuste de ComfyUI «Prompt del edit › Idioma» (AJUSTE): auto (sigue a Comfy.Locale), es o en. El
 *     botón «ES | EN» de la ventana cambia ese mismo ajuste; al cambiar, editor.js avisa con el evento EVENTO.
 * Solo exporta funciones y constantes (ComfyUI importa todos los .js de web/): importarlo no hace nada. */

export const IDIOMAS = ["es", "en"];
export const AJUSTE = "EditPromptLLM.Idioma";
export const EVENTO = "epl-idioma";
const LOCALE = { es: "es-ES", en: "en-US" };

// los textos de los dos idiomas (el español es el de reserva); sin red, vacíos: t() devuelve la clave
export async function cargarTextos() {
  const v = "?v=" + Date.now();
  const leer = async (i) => {
    try {
      const r = await fetch(new URL(`../i18n/${i}.json${v}`, import.meta.url), { cache: "no-store" });
      return r.ok ? await r.json() : {};
    } catch { return {}; }
  };
  const [es, en] = await Promise.all(IDIOMAS.map(leer));
  return { es, en };
}

// el idioma del ajuste; «auto» (o sin ajuste) sigue a Comfy.Locale: es* → español, lo demás → inglés
export function idiomaElegido(app) {
  const ajustes = app?.extensionManager?.setting;
  let v = "";
  try { v = ajustes?.get?.(AJUSTE) || ""; } catch { /* sin ajustes */ }
  if (IDIOMAS.includes(v)) return v;
  let loc = "";
  try { loc = ajustes?.get?.("Comfy.Locale") || ""; } catch { /* sin ajustes */ }
  return /^es/i.test(loc || globalThis.navigator?.language || "es") ? "es" : "en";
}

/* {idioma, t, num, lista} para un idioma. t(clave, datos) pone cada {x} con datos.x (tal cual: los números con num). */
export function traductor(textos, idioma) {
  const avisadas = new Set(), locale = LOCALE[idioma] || LOCALE.es;
  const buscar = (clave) => {
    const propio = textos?.[idioma]?.[clave];
    if (propio) return propio;
    const es = textos?.es?.[clave];
    if (!avisadas.has(clave)) {
      avisadas.add(clave);
      console.warn(`[Prompt del edit] i18n: «${clave}» no está en ${idioma}` + (es ? " (uso el español)" : ""));
    }
    return es || clave;
  };
  const t = (clave, datos = {}) => buscar(clave).replace(/\{(\w+)\}/g, (m, k) => (datos[k] ?? null) === null ? m : String(datos[k]));
  // num(5.1667, 3) → «5,167» / «5.167»; sin decimales fijos, hasta 3
  const num = (x, decimales = null) => new Intl.NumberFormat(locale, decimales === null
    ? { maximumFractionDigits: 3, useGrouping: false }
    : { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: false }).format(+x || 0);
  // lista(["la cara", "el pelo"]) → «la cara y el pelo» / «the face and the hair»
  const lista = (xs) => new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(xs.map(String));
  return { idioma, locale, t, num, lista };
}
