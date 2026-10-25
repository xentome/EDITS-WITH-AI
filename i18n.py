"""Dos idiomas (español / inglés) para el servidor y el nodo. Lee los mismos textos que la ventana: web/i18n/es.json y
en.json, planos ({"clave": "texto con {marcadores}"}). planos/2 Mapa del codigo.md, «Dos idiomas».

- t(clave, idioma, **datos): el texto con sus marcadores puestos. Si falta en ese idioma, el español (con un aviso en la
  consola); si tampoco está, la propia clave. Nunca un texto vacío. Los decimales salen con coma en español.
- ErrorUsuario(clave, **datos): un error que ve el usuario. str() da el español; la ruta lo traduce con .texto(idioma).
- Los textos para el lienzo de ComfyUI (nombre del nodo, entradas, ajuste del idioma) se generan desde las mismas claves
  en locales/{es,en}/: `python i18n.py` los escribe y pruebas.py comprueba que estén al día.

No depende de ComfyUI. Se lee cada vez que cambia un .json (no hace falta reiniciar para un texto del servidor).
"""
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(AQUI, "web", "i18n")
LOCALES = os.path.join(AQUI, "locales")
IDIOMAS = ("es", "en")
MARCADOR = re.compile(r"\{(\w+)\}")
_textos = {}          # idioma → (fecha del archivo, textos)
_avisadas = set()


def textos(idioma):
    """Los textos de un idioma, releídos solo si el archivo cambió."""
    ruta = os.path.join(CARPETA, idioma + ".json")
    try:
        fecha = os.path.getmtime(ruta)
    except OSError:
        return {}
    if _textos.get(idioma, (None,))[0] != fecha:
        with open(ruta, encoding="utf-8") as f:
            _textos[idioma] = (fecha, json.load(f))
    return _textos[idioma][1]


def idioma_de(valor):
    """«en», «en-US», «English» → en; todo lo demás (también vacío) → es."""
    return "en" if str(valor or "").strip().lower().startswith("en") else "es"


def num(x, idioma="es", decimales=None):
    """Un número como se escribe en ese idioma: 5,167 en español y 5.167 en inglés (sin separador de miles)."""
    if decimales is not None:
        texto = f"{float(x):.{decimales}f}"
    elif isinstance(x, float):
        texto = f"{x:.3f}".rstrip("0").rstrip(".")
    else:
        texto = str(x)
    return texto.replace(".", ",") if idioma_de(idioma) == "es" else texto


def _dato(v, idioma):
    if isinstance(v, bool) or not isinstance(v, (int, float, list, tuple)):
        return str(v)
    if isinstance(v, (list, tuple)):
        return ", ".join(_dato(x, idioma) for x in v)
    return num(v, idioma)


def t(clave, idioma="es", **datos):
    idioma = idioma_de(idioma)
    texto = textos(idioma).get(clave) or ""
    if not texto:
        texto = textos("es").get(clave) or ""
        if (idioma, clave) not in _avisadas:
            _avisadas.add((idioma, clave))
            print(f"[Prompt del edit] i18n: «{clave}» no está en {idioma}" + (" (uso el español)" if texto else ""),
                  flush=True)
        texto = texto or clave
    return MARCADOR.sub(lambda m: _dato(datos[m.group(1)], idioma) if m.group(1) in datos else m.group(0), texto)


class ErrorUsuario(Exception):
    """Un error que ve el usuario, con su clave y sus datos: la ruta del editor lo traduce al idioma de la ventana."""

    def __init__(self, clave, **datos):
        self.clave, self.datos = clave, datos
        super().__init__(t(clave, "es", **datos))

    def texto(self, idioma):
        return t(self.clave, idioma, **self.datos)


# ------------------------------------------------------------------ textos del lienzo de ComfyUI (locales/)
# ComfyUI los lee una sola vez al arrancar (app/custom_node_manager.py): un cambio aquí pide reiniciar.
# Formato: nodeDefs.<nodo>.display_name / description / inputs.<entrada>.name|tooltip / outputs.<n>.name;
# settings.<id con _>.name / tooltip / options.<texto de la opción>; main.json → settingsCategories.<categoría>.
NODO = "PromptDelEdit"
ENTRADAS = ("idea", "tomas", "duracion_s", "palabras", "semilla_llm", "audio", "texto_bloqueado", "estado")
SALIDAS = ("prompt", "informe")
AJUSTE = "EditPromptLLM.Idioma"
CATEGORIAS = ("Prompt del edit", "Idioma")      # el texto de la categoría del ajuste en web/editor.js (y su clave aquí)


def locales():
    """{idioma: {archivo: contenido}} de locales/<idioma>/, sacado de las claves nodo.* y ajuste.*."""
    out = {}
    for i in IDIOMAS:
        tx = textos(i)
        entradas = {}
        for e in ENTRADAS:
            entradas[e] = {"name": tx[f"nodo.entrada.{e}"]}
            if tx.get(f"nodo.{e}.tooltip"):
                entradas[e]["tooltip"] = tx[f"nodo.{e}.tooltip"]
        out[i] = {
            "nodeDefs.json": {NODO: {"display_name": tx["nodo.nombre"], "description": tx["nodo.descripcion"],
                                     "inputs": entradas,
                                     "outputs": {str(k): {"name": tx[f"nodo.salida.{s}"]} for k, s in enumerate(SALIDAS)}}},
            "settings.json": {AJUSTE.replace(".", "_"): {"name": tx["ajuste.nombre"], "tooltip": tx["ajuste.tooltip"],
                                                         "options": {o: tx[f"ajuste.opcion.{o}"] for o in ("auto", "es", "en")}}},
            "main.json": {"settingsCategories": {CATEGORIAS[0]: tx["ajuste.categoria"], CATEGORIAS[1]: tx["ajuste.subcategoria"]}},
        }
    return out


def escribir_locales():
    for i, archivos in locales().items():
        os.makedirs(os.path.join(LOCALES, i), exist_ok=True)
        for nombre, datos in archivos.items():
            with open(os.path.join(LOCALES, i, nombre), "w", encoding="utf-8") as f:
                json.dump(datos, f, ensure_ascii=False, indent=1)
                f.write("\n")


if __name__ == "__main__":
    escribir_locales()
    print(f"locales/ escritos ({', '.join(IDIOMAS)})", file=sys.stderr)
