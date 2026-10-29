"""MAX EDITOR · lo que hace un agente (el MCP, mcp_servidor.py) con un proyecto, sin red: leer y cambiar el mismo JSON que usa la
página (app/proyectos/<nombre>.json, {valores: {id_nodo: {campo: valor}}}) igual que lo cambia la ventana. Plano:
../planos/fases/11 MCP.md. Cada función copia a la pieza de la página que hace lo mismo (para que la página, al recargar, vea
lo mismo que dejó el agente):
  - las etiquetas <Picture N> / <Video N> de las referencias → web/editor/referencias.js (referenciasDelWorkflow, remapear,
    conectarRef, tarjeta);
  - la duración (17·k + 5 fotogramas a 24 fps) → web/editor/duracion.js; los cortes a mano → web/editor/linea.js;
  - la resolución (múltiplos de 32) → web/editor/resolucion.js; el plan y sus tomas → web/editor/plan.js (ajustarPlan);
  - lo que se manda a «montar» → web/editor_core.js (entradas, cuerpo); la canción → web/editor/audio.js.
Las marcas «✎ agente» (lo que tocó el agente, para que el creativo lo vea) van en proyecto["agente"]["marcas"]."""
from __future__ import annotations

import copy
import json
import re
from datetime import datetime

FPS = 24
MIN_TOMA, MAX_TOMAS, MAX_TARJETAS = 0.4, 24, 12
PASO_RES, MP_MIN, MP_MAX = 32, 0.1, 2.0
EJEMPLO = "ejemplo"

# los nodos se buscan por su tipo, como en la página
T_EDIT, T_STACK, T_BUILDER, T_AUDIO, T_RUIDO = "PromptDelEdit", "MiniMaxH3RefModStack", "MiniMaxH3PromptBuilder", "LoadAudio", "RandomNoise"
LONGITUD = ("MiniMaxH3FantasticRefModTextEncode", "EmptyMiniMaxH3LatentAV", "MiniMaxH3ImageToVideo",
            "MiniMaxH3ReferenceToVideo", "MpiH3ImageToVideo", "MpiH3References")

# plan.js: los campos de una toma
HISTORIA = ["lugar", "momento", "personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"]
DIRECCION = ["encuadre", "luz", "gesto", "camara"]
CAMPOS_REF = ["personaje", "ropa", "pose", "objeto", "lugar_ref", "fondo_ref", "efecto"]
CAMPOS_TEXTO = ["momento", "gesto", "lugar", "encuadre", "camara", "luz", "estilo", "efecto_frase"]
ENTORNOS = ("auto", "manual", "ninguno")
ENCUADRES = ["extreme close-up", "close-up", "medium shot", "full shot"]
MOVIMIENTOS = ["holds still", "slowly pushes in from a distance", "slowly pulls back from close up",
               "pans slowly from side to side", "is handheld and follows <Subject 1>"]
# referencias.js
PAPELES = {"personaje": "izq", "objeto": "izq", "lugar": "izq", "ropa": "der", "pose": "der", "fondo": "der", "estilo": "der",
           "efecto": "der", "letra": "der"}
CONCEPTO = {"identity": "personaje", "clothing": "ropa", "pose_motion": "pose", "pose": "pose", "background": "fondo",
            "scene": "fondo", "style": "estilo"}
CAMPO_DE_PAPEL = {"fondo": "fondo_ref", "lugar": "lugar_ref", "ropa": "ropa", "pose": "pose", "objeto": "objeto"}
PRONOMBRES = ("they", "she", "he")
SITIOS = ("encima", "al_lado")
AUDIOS_SALIDA = ("cancion", "modelo")
ETIQUETA = re.compile(r"<(Picture|Video) (\d+)>")


try:                                    # con el SDK de MCP, el agente lee el texto del error; sin él (pruebas.py), es normal
    from mcp.server.mcpserver.exceptions import ToolError as _Base
except ImportError:
    _Base = Exception


class ErrorAgente(_Base):
    """Un error que el agente debe leer y arreglar (en inglés claro: lo lee un agente de cualquier idioma)."""


def ahora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def leer_json(texto, otro):
    try:
        return json.loads(texto) if texto else otro
    except (TypeError, ValueError):
        return otro


# ------------------------------------------------------------------ duración y resolución (duracion.js, resolucion.js)
def fotogramas_h3(s: float) -> int:
    """El número de fotogramas válido para H3 (17·k + 5) más cercano a s·24."""
    f = (float(s or 0)) * FPS
    return 17 * max(0, round((f - 5) / 17)) + 5


def segundos_h3(s: float) -> float:
    return round(fotogramas_h3(s) / FPS, 3)


def al_fotograma(t: float) -> float:
    return round(round(t * FPS) / FPS, 3)


def redondear32(x) -> int:
    return max(PASO_RES * 2, round((float(x or 0)) / PASO_RES) * PASO_RES)


def medidas(mp: float, prop: float) -> tuple[int, int]:
    """(ancho, alto) con la proporción ancho/alto `prop` y unos `mp` megapíxeles, en múltiplos de 32."""
    m = min(MP_MAX, max(MP_MIN, float(mp or 1))) * 1e6
    p = prop if prop > 0 else 9 / 16
    alto = (m / p) ** 0.5
    return redondear32(alto * p), redondear32(alto)


def megapixeles(ancho: int, alto: int) -> float:
    return round(ancho * alto / 1e4) / 100


# ------------------------------------------------------------------ el plan (plan.js)
def toma_vacia() -> dict:
    return {**{c: "" for c in HISTORIA + DIRECCION}, "efectos": [], "efecto_frase": "", "estilo": "", "entorno": "auto", "fijos": []}


def _con_efectos(t: dict) -> dict:
    lista = [x for x in t.get("efectos") or [] if x]
    if "efecto" not in (t.get("fijos") or []) or not lista:
        lista = [t["efecto"]] if t.get("efecto") else []
    return {**t, "efectos": lista, "efecto": lista[0] if lista else ""}


def _con_entorno(t: dict) -> dict:
    fijos = t.get("fijos") or []
    e = t.get("entorno") if t.get("entorno") in ENTORNOS else ("manual" if "lugar" in fijos else "auto")
    return {**t, "entorno": e, "fijos": [f for f in fijos if f != "lugar"] + (["lugar"] if e == "manual" else [])}


def ajustar_plan(plan: dict | None, n: int) -> dict:
    """El plan con n tomas y todos sus campos, sin tocar lo que ya tiene (plan.js, ajustarPlan)."""
    p = copy.deepcopy(plan) if plan else {}
    for c in ("arco", "look", "fondo"):
        p[c] = p.get(c) or ""
    p["fijos"] = p.get("fijos") or []
    if len(p.get("cortes") or []) != n:
        p.pop("cortes", None)
    p["tomas"] = [_con_efectos(_con_entorno({**toma_vacia(), **t, "fijos": t.get("fijos") or []})) for t in (p.get("tomas") or [])[:n]]
    while len(p["tomas"]) < n:
        p["tomas"].append(toma_vacia())
    return p


def cortes_validos(c, n: int, dur: float) -> bool:
    try:
        c = [float(x) for x in c or []]
    except (TypeError, ValueError):
        return False
    return len(c) == n and n > 0 and abs(c[0]) < 1e-6 and all(b - a >= MIN_TOMA - 1e-3 for a, b in zip(c, c[1:] + [dur]))


# ------------------------------------------------------------------ el proyecto
class Proyecto:
    """Un proyecto de la app con su plantilla. `datos` es el JSON del proyecto ({nombre, guardado, rev, valores, agente…})."""

    def __init__(self, datos: dict, plantilla: dict):
        self.datos = copy.deepcopy(datos)
        self.datos.setdefault("valores", {})
        self.plantilla = plantilla
        self.nombre = self.datos.get("nombre") or ""
        self.cambios: list[str] = []          # lo que cambió, en frases cortas (lo que devuelve cada herramienta)
        self._estado = None

    # ---- nodos y campos
    def nodos(self, tipo: str) -> list[str]:
        return [nid for nid, d in self.plantilla.items() if d.get("class_type") == tipo]

    def nodo(self, tipo: str) -> str | None:
        n = self.nodos(tipo)
        return n[0] if n else None

    def _es_campo(self, nid: str, campo: str) -> bool:
        v = (self.plantilla.get(nid) or {}).get("inputs", {}).get(campo, None)
        return not (isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and isinstance(v[1], int))

    def valor(self, nid: str, campo: str, otro=None):
        v = self.datos["valores"].get(str(nid), {})
        if campo in v:
            return v[campo]
        return (self.plantilla.get(str(nid)) or {}).get("inputs", {}).get(campo, otro)

    def poner(self, nid: str, campo: str, v) -> None:
        if not self._es_campo(nid, campo):
            return                                             # un campo enlazado desde otro nodo no se toca
        base = (self.plantilla.get(str(nid)) or {}).get("inputs", {}).get(campo, None)
        vals = self.datos["valores"]
        if json.dumps(base, sort_keys=True) == json.dumps(v, sort_keys=True):
            vals.get(str(nid), {}).pop(campo, None)            # como valoresDe con base: solo lo que difiere de la plantilla
            if str(nid) in vals and not vals[str(nid)]:
                del vals[str(nid)]
        else:
            vals.setdefault(str(nid), {})[campo] = v

    # ---- el estado del nodo «Prompt del edit» (lo que guarda la ventana)
    @property
    def edit(self) -> str:
        nid = self.nodo(T_EDIT)
        if not nid:
            raise ErrorAgente("the template has no PromptDelEdit node")
        return nid

    def estado(self) -> dict:
        if self._estado is None:
            e = leer_json(self.valor(self.edit, "estado"), {}) or {}
            n = max(1, int(self.valor(self.edit, "tomas", 1) or 1))
            e.setdefault("v", 4)
            for k, defecto in (("refs", {}), ("efectos", {}), ("frases", {}), ("estilo", ""), ("estilo_palabras", ""), ("sonido", "")):
                if not isinstance(e.get(k), type(defecto)):
                    e[k] = copy.deepcopy(defecto)
            e["audio_salida"] = "modelo" if e.get("audio_salida") == "modelo" else "cancion"
            e["plan"] = ajustar_plan(e.get("plan"), n)
            e.setdefault("prompt", "")
            e["a_mano"] = bool(e.get("a_mano"))
            # editor_core.js, migrarP10: sin historia general; el personaje empieza en Principal
            for c in ("arco", "look", "fondo"):
                e["plan"][c] = ""
            for r in e["refs"].values():
                if isinstance(r, dict) and r.get("en_todas") is None:
                    r["en_todas"] = r.get("papel") == "personaje"
            self._estado = e
        return self._estado

    def guardar_estado(self) -> None:
        e = self.estado()
        e["etiquetas"] = {r["tag"]: r["clave"] for r in self.referencias() if r["tag"]}
        e["guardado"] = datetime.now().astimezone().isoformat(timespec="milliseconds")
        self.poner(self.edit, "estado", json.dumps(e, ensure_ascii=False))

    @property
    def plan(self) -> dict:
        return self.estado()["plan"]

    @property
    def n_tomas(self) -> int:
        return len(self.plan["tomas"])

    @property
    def duracion(self) -> float:
        return float(self.valor(self.edit, "duracion_s", 5.167) or 5.167)

    # ---- marcas «✎ agente»
    def marcar(self, zona: str, toma: int | None = None, campo: str | None = None, ref: str | None = None) -> None:
        ag = self.datos.setdefault("agente", {})
        marcas = ag.setdefault("marcas", [])
        m = {k: v for k, v in (("zona", zona), ("toma", toma), ("campo", campo), ("ref", ref)) if v is not None}
        ident = lambda x: tuple(x.get(k) for k in ("zona", "toma", "campo", "ref"))  # noqa: E731
        marcas[:] = [x for x in marcas if ident(x) != ident(m)]
        marcas.append({**m, "cuando": ahora()})

    # ---- referencias (referencias.js)
    def picks(self) -> list:
        nid = self.nodo(T_STACK)
        st = leer_json(self.valor(nid, "stack_state"), {}) if nid else {}
        return list((st or {}).get("picks") or [])

    def poner_picks(self, picks: list) -> None:
        nid = self.nodo(T_STACK)
        if not nid:
            raise ErrorAgente("the template has no RefMod Stack")
        st = leer_json(self.valor(nid, "stack_state"), {}) or {}
        st["picks"] = picks
        self.poner(nid, "stack_state", json.dumps(st, ensure_ascii=False))

    def referencias(self) -> list[dict]:
        """Las tarjetas del Stack con su etiqueta (solo las activas la tienen): un contador para fotos y otro para videos."""
        out, fotos, videos = [], 0, 0
        refs = self.estado()["refs"]
        for idx, p in enumerate(self.picks()):
            if not p:
                continue
            vis = p.get("visual") or {}
            activa = p.get("on") is not False and (vis.get("w", 1) if vis.get("w") is not None else 1) > 0
            kind = vis.get("kind") or "image"
            tag = None
            if activa and kind == "video":
                videos += 1
                tag = f"<Video {videos}>"
            elif activa and kind == "image":
                fotos += 1
                tag = f"<Picture {fotos}>"
            r = refs.get(p.get("name")) or {}
            out.append({"tag": tag, "clave": p.get("name"), "nombre_refmod": p.get("label") or p.get("name"), "kind": kind,
                        "on": p.get("on") is not False, "fuerza": vis.get("w", 1), "idx": idx, "papel": r.get("papel") or "no",
                        "nombre": r.get("nombre") or "", "ficha": r.get("ficha") or "", "en_todas": self.en_todas(p.get("name")),
                        "pronombre": r.get("pronombre") or "", "atuendo": r.get("atuendo") or ""})
        return out

    def etiquetas(self) -> dict:
        return {r["tag"]: r for r in self.referencias() if r["tag"]}

    def en_todas(self, clave) -> bool:
        x = self.estado()["refs"].get(clave)
        return bool(x) and bool(x.get("en_todas", x.get("papel") == "personaje"))

    def remapear(self, antes: dict) -> None:
        """Las tomas guardan etiquetas: si los números cambiaron, se traducen por clave (lo que ya no está queda vacío)."""
        ahora_ = {r["clave"]: r["tag"] for r in self.referencias() if r["tag"]}
        for t in self.plan["tomas"]:
            for c in CAMPOS_REF:
                if (t.get(c) or "").startswith("<"):
                    t[c] = ahora_.get(antes.get(t[c]), "")
            t["efectos"] = [x if not x.startswith("<") else ahora_.get(antes.get(x), "") for x in t.get("efectos") or []]
            t["efectos"] = [x for x in t["efectos"] if x]
            t["efecto"] = t["efectos"][0] if t["efectos"] else ""
        for x in self.plan.get("textos") or []:
            if (x.get("letra") or "").startswith("<"):
                x["letra"] = ahora_.get(antes.get(x["letra"]), "")

    def existe_etiqueta(self, tag: str) -> bool:
        return tag in self.etiquetas() or tag in self.estado()["efectos"]

    # ---- lo que se manda a montar (editor_core.js, entradas y cuerpo)
    def entradas(self) -> dict:
        e = self.estado()
        refs = {r["tag"]: e["refs"][r["clave"]] for r in self.referencias()
                if r["tag"] and isinstance(e["refs"].get(r["clave"]), dict) and e["refs"][r["clave"]].get("papel") not in (None, "", "no")}
        refs.update({k: {**v, "papel": "efecto"} for k, v in e["efectos"].items()})
        return {"idea": self.valor(self.edit, "idea", ""), "tomas": self.n_tomas, "duracion": self.duracion,
                "palabras": self.valor(self.edit, "palabras", ""), "estilo": e["estilo"], "estilo_palabras": e["estilo_palabras"],
                "sonido": e["sonido"], "frases": e["frases"], "refs": refs}

    def audio(self) -> dict | None:
        """audio.js: la canción original y el tramo elegido; si el LoadAudio apunta a otra, se empieza de cero con ella."""
        nid = self.nodo(T_AUDIO)
        actual = self.valor(nid, "audio", "") if nid else ""
        if not actual:
            return None
        g = self.estado().get("audio") or {}
        if g.get("original") and actual in (g.get("recorte"), g.get("original")):
            return {"original": g["original"], "inicio_s": float(g.get("inicio_s") or 0), "recorte": g.get("recorte") or "",
                    "tocado": bool(g.get("tocado"))}
        return {"original": actual, "inicio_s": 0.0, "recorte": "", "tocado": False}

    def cuerpo_montar(self) -> dict:
        a = self.audio()
        audio = {"audio": ""} if not a else {"audio": a["original"], **({"audio_inicio": a["inicio_s"]} if a["tocado"] else {})}
        return {"entradas": self.entradas(), "plan": self.plan, **audio, "semilla": int(self.valor(self.edit, "semilla_llm", 1) or 1)}

    def aplicar_montaje(self, r: dict) -> None:
        """Lo que hace la página con la respuesta de «montar» (editor_core.js, pedirMontaje)."""
        e = self.estado()
        if not isinstance(self.plan.get("textos"), list) and isinstance(r.get("textos"), list):
            self.plan["textos"] = [{"id": x.get("id") or f"t{i + 1}", **{k: v for k, v in x.items() if k != "k"}}
                                   for i, x in enumerate(r["textos"])]
            self.poner(self.edit, "palabras", "")
            e["estilo_palabras"] = ""
        if not e["a_mano"]:
            e["prompt"] = r.get("prompt") or ""
        self.avisos = r.get("avisos") or []
        self.cortes = r.get("cortes") or []
        self.guardar_estado()

    # ---- duración, tomas y cortes (duracion.js, linea.js)
    def cortes_ahora(self) -> list[float]:
        c = self.plan.get("cortes")
        if c and len(c) == self.n_tomas:
            return [float(x) for x in c]
        if getattr(self, "cortes", None) and len(self.cortes) == self.n_tomas:
            return [float(x) for x in self.cortes]
        return [al_fotograma(self.duracion * i / self.n_tomas) for i in range(self.n_tomas)]

    def poner_duracion(self, segundos: float) -> dict:
        f = fotogramas_h3(segundos)
        if f < 22:
            raise ErrorAgente("the edit must last at least 22 frames (0.917 s)")
        s = round(f / FPS, 3)
        if self.n_tomas * MIN_TOMA > s + 1e-6:
            raise ErrorAgente(f"{self.n_tomas} shots do not fit in {s} s (each shot needs at least {MIN_TOMA} s)")
        antes = self.duracion
        c = self.plan.get("cortes")
        if c and len(c) == self.n_tomas and antes > 0:                    # linea.js: los cortes a mano se estiran en proporción
            nuevos = [al_fotograma(x * s / antes) for x in c]
            if cortes_validos(nuevos, self.n_tomas, s):
                self.plan["cortes"] = nuevos
            else:
                self.plan.pop("cortes", None)
        self.poner(self.edit, "duracion_s", s)
        for nid, d in self.plantilla.items():                             # duracion.js, aplicarDuracion
            tipo, ins = d.get("class_type", ""), d.get("inputs", {})
            if isinstance(ins.get("length"), (int, float)) and (tipo in LONGITUD or tipo.startswith("MiniMaxH3")):
                self.poner(nid, "length", f)
            if isinstance(ins.get("duration"), (int, float)) and tipo.startswith("MiniMaxH3"):
                self.poner(nid, "duration", s)
            if tipo == T_BUILDER and isinstance(ins.get("builder_state"), str):
                st = leer_json(self.valor(nid, "builder_state"), None)
                if isinstance(st, dict) and abs(float(st.get("duration") or 0) - s) > 1e-3:
                    st["duration"] = s
                    self.poner(nid, "builder_state", json.dumps(st))
        return {"fotogramas": f, "segundos": s}

    def fotogramas(self) -> int:
        for nid, d in self.plantilla.items():
            if d.get("class_type") in LONGITUD and isinstance(d.get("inputs", {}).get("length"), (int, float)):
                return int(self.valor(nid, "length"))
        return fotogramas_h3(self.duracion)

    def poner_tomas(self, n: int, duraciones: list[float] | None = None) -> None:
        n = int(n)
        if not 1 <= n <= MAX_TOMAS:
            raise ErrorAgente(f"the number of shots must be between 1 and {MAX_TOMAS}")
        if duraciones is not None:
            if len(duraciones) != n:
                raise ErrorAgente(f"give exactly {n} durations (one per shot), or none")
            if any(float(d) < MIN_TOMA - 1e-6 for d in duraciones):
                raise ErrorAgente(f"every shot must last at least {MIN_TOMA} s")
            self.poner_duracion(sum(float(d) for d in duraciones))
        elif n * MIN_TOMA > self.duracion + 1e-6:
            raise ErrorAgente(f"{n} shots do not fit in {self.duracion} s")
        e = self.estado()
        e["plan"] = ajustar_plan(self.plan, n)
        self.poner(self.edit, "tomas", n)
        if duraciones is not None:
            total, s, ini = self.duracion, sum(float(d) for d in duraciones), []
            acc = 0.0
            for d in duraciones:                                          # escalados al total válido de H3, al fotograma
                ini.append(al_fotograma(acc * total / s))
                acc += float(d)
            if not cortes_validos(ini, n, total):
                raise ErrorAgente("after snapping to whole frames some shot is shorter than 0.4 s: use longer durations")
            self.plan["cortes"] = ini
        e["toma_elegida"] = min(max(1, int(e.get("toma_elegida") or n)), n)

    def quitar_toma(self, k: int) -> None:
        n = self.n_tomas
        if n <= 1:
            raise ErrorAgente("an edit needs at least one shot")
        self._toma(k)
        c = self.plan.get("cortes")
        if c and len(c) == n:                                             # linea.js, quitarDeCortes
            largos = [(c[i + 1] if i + 1 < n else self.duracion) - c[i] for i in range(n) if i != k - 1]
            esc = self.duracion / sum(largos)
            nuevos, acc = [], 0.0
            for x in largos:
                nuevos.append(al_fotograma(acc))
                acc += x * esc
            self.plan["cortes"] = nuevos
        del self.plan["tomas"][k - 1]
        self.poner(self.edit, "tomas", n - 1)
        marcas = (self.datos.get("agente") or {}).get("marcas") or []
        for m in list(marcas):
            if m.get("toma") == k:
                marcas.remove(m)
            elif (m.get("toma") or 0) > k:
                m["toma"] -= 1
        self.estado()["toma_elegida"] = max(1, min(k, n - 1))

    def _toma(self, k: int) -> dict:
        try:
            k = int(k)
        except (TypeError, ValueError):
            raise ErrorAgente("shot numbers start at 1")
        if not 1 <= k <= self.n_tomas:
            raise ErrorAgente(f"there is no shot {k}: the project has {self.n_tomas} shots (1–{self.n_tomas})")
        return self.plan["tomas"][k - 1]

    def duraciones(self) -> list[tuple[float, float]]:
        ini = self.cortes_ahora()
        return [(a, (ini[i + 1] if i + 1 < len(ini) else self.duracion)) for i, a in enumerate(ini)]

    # ---- escribir una toma (plan.js: escribir un campo lo fija; referencias.js: conectarRef / desconectarRef)
    def escribir_toma(self, k: int, campos: dict, conectar: list | None = None, desconectar: list | None = None) -> list[str]:
        toma, hechos = self._toma(k), []
        k = int(k)
        for c, v in campos.items():
            if v is None:
                continue
            if c == "entorno":
                if v not in ENTORNOS:
                    raise ErrorAgente(f"entorno must be one of {', '.join(ENTORNOS)}")
                toma["entorno"] = v
                toma["fijos"] = [f for f in toma["fijos"] if f != "lugar"] + (["lugar"] if v == "manual" else [])
            elif c in CAMPOS_TEXTO:
                v = str(v).strip()
                self._citas_validas(v, f"shot {k} · {c}")
                toma[c] = v
                if c == "lugar":
                    toma["entorno"] = "manual" if v else (toma["entorno"] if toma["entorno"] != "manual" else "auto")
                    toma["fijos"] = [f for f in toma["fijos"] if f != "lugar"] + (["lugar"] if toma["entorno"] == "manual" else [])
                elif v and c not in toma["fijos"]:
                    toma["fijos"].append(c)
                elif not v:
                    toma["fijos"] = [f for f in toma["fijos"] if f != c]
            elif c in ("fondo_ref", "lugar_ref", "ropa", "pose", "objeto", "personaje"):
                v = str(v).strip()
                if v and not self.existe_etiqueta(v):
                    raise ErrorAgente(f"{v} is not a reference of this project (see ver_proyecto)")
                toma[c] = v
                if v and c not in toma["fijos"]:
                    toma["fijos"].append(c)
                if v and c in ("fondo_ref", "lugar_ref") and toma["entorno"] == "ninguno":
                    toma["entorno"] = "auto"
            else:
                raise ErrorAgente(f"unknown shot field «{c}»")
            self.marcar("toma", k, c)
            hechos.append(c)
        for tag in desconectar or []:
            for c in CAMPOS_REF:
                if toma.get(c) == tag:
                    toma[c] = ""
            toma["efectos"] = [x for x in toma.get("efectos") or [] if x and x != tag]
            toma["efecto"] = toma["efectos"][0] if toma["efectos"] else ""
            self.marcar("toma", k, "referencias")
            hechos.append(f"−{tag}")
        for tag in conectar or []:
            hechos.append(self._conectar(toma, k, tag))
        return hechos

    def _conectar(self, toma: dict, k: int, tag: str) -> str:
        etq = self.etiquetas()
        if tag not in etq and tag not in self.estado()["efectos"]:
            raise ErrorAgente(f"{tag} is not a reference of this project (see ver_proyecto)")
        ref = etq.get(tag)
        if ref and ref["en_todas"]:
            return f"{tag} is in Principal (Main): it already goes in every shot"
        papel = ref["papel"] if ref else "efecto"
        campo = CAMPO_DE_PAPEL.get(papel) or ("personaje" if papel == "personaje" and ref and ref["atuendo"].strip() else None)
        if campo:
            toma[campo] = tag
            if campo not in toma["fijos"]:
                toma["fijos"].append(campo)
            if campo in ("fondo_ref", "lugar_ref") and toma["entorno"] == "ninguno":
                toma["entorno"] = "auto"
        else:
            lista = [x for x in (toma.get("efectos") or [toma.get("efecto")]) if x]
            if tag not in lista:
                lista.append(tag)
            toma["efectos"], toma["efecto"] = lista, lista[0]
            if "efecto" not in toma["fijos"]:
                toma["fijos"].append("efecto")
        self.marcar("toma", k, "referencias")
        return f"+{tag}"

    def _citas_validas(self, texto: str, donde: str) -> None:
        for m in ETIQUETA.finditer(texto or ""):
            if m.group(0) not in self.etiquetas():
                raise ErrorAgente(f"{donde}: {m.group(0)} does not exist in this project (its references: "
                                  f"{', '.join(self.etiquetas()) or 'none'})")

    # ---- referencias: añadir, cambiar, quitar (referencias.js, anadirVariosDeBiblioteca, tarjeta, cambiarStack)
    def poner_referencia(self, item: dict, papel: str = "", nombre=None, ficha=None, pronombre=None, principal=None,
                         atuendo=None) -> str:
        clave = item["name"]
        picks, antes = self.picks(), {r["tag"]: r["clave"] for r in self.referencias() if r["tag"]}
        if not any(p and p.get("name") == clave for p in picks):
            if len(picks) >= MAX_TARJETAS:
                raise ErrorAgente(f"the RefMod Stack is full ({MAX_TARJETAS} cards): remove one first")

            def canal(c):
                return {"file": c.get("file"), "kind": c.get("kind"), "tokens": c.get("tokens") or 0, "seconds": c.get("seconds"),
                        "mode": "weight", "w": 1, "s": 1, "c": 1, "embedded_audio_ignored": bool(c.get("embedded_audio_ignored"))}
            p = {"uid": max([int(x.get("uid") or 0) for x in picks if x] + [0]) + 1, "name": clave, "label": item.get("label") or clave,
                 "on": True, "preview": item.get("preview")}
            if item.get("visual"):
                p["visual"] = canal(item["visual"])
            if item.get("audio"):
                p["audio"] = canal(item["audio"])
            picks.append(p)
            self.poner_picks(picks)
        refs = self.estado()["refs"]
        r = refs.setdefault(clave, {"papel": CONCEPTO.get(item.get("concept") or "", "no"), "nombre": "",
                                    "ficha": (item.get("appearance") or item.get("desc") or "")[:300], "origen": "RefMod"})
        if papel:
            if papel not in PAPELES:
                raise ErrorAgente(f"papel must be one of {', '.join(PAPELES)}")
            r["papel"] = papel
        if nombre is not None:
            r["nombre"] = str(nombre).strip()
        if ficha is not None:
            r["ficha"] = str(ficha).strip()
            r["origen"] = "editor"
        if pronombre is not None:
            if pronombre not in PRONOMBRES:
                raise ErrorAgente(f"pronombre must be one of {', '.join(PRONOMBRES)}")
            r["pronombre"] = pronombre
        if atuendo is not None:
            r["atuendo"] = str(atuendo).strip()
        if principal is not None or r.get("en_todas") is None:
            self.poner_grupo(clave, bool(principal) if principal is not None else r.get("papel") == "personaje")
        self.remapear(antes)
        self.marcar("referencia", ref=clave)
        return next((x["tag"] for x in self.referencias() if x["clave"] == clave), None) or "(off)"

    def poner_grupo(self, clave: str, principal: bool) -> None:
        ref = self.estado()["refs"].get(clave)
        if not ref:
            return
        ref["en_todas"] = principal
        tag = next((x["tag"] for x in self.referencias() if x["clave"] == clave), None)
        if principal and tag:                                             # en Principal deja de citarse toma a toma
            for t in self.plan["tomas"]:
                for c in CAMPOS_REF:
                    if t.get(c) == tag:
                        t[c] = ""
                t["efectos"] = [x for x in t.get("efectos") or [] if x and x != tag]
                t["efecto"] = t["efectos"][0] if t["efectos"] else ""

    def clave_de(self, ref: str) -> str:
        """Una referencia por su etiqueta (<Picture 2>) o por su nombre de RefMod."""
        for r in self.referencias():
            if ref in (r["tag"], r["clave"]):
                return r["clave"]
        raise ErrorAgente(f"{ref} is not a reference of this project (see ver_proyecto)")

    def quitar_referencia(self, ref: str) -> str:
        clave = self.clave_de(ref)
        antes = {r["tag"]: r["clave"] for r in self.referencias() if r["tag"]}
        self.poner_picks([p for p in self.picks() if not (p and p.get("name") == clave)])
        self.remapear(antes)
        marcas = (self.datos.get("agente") or {}).get("marcas") or []
        marcas[:] = [m for m in marcas if m.get("ref") != clave]
        self.marcar("referencia", ref="(quitada)")
        return clave

    def poner_efecto_texto(self, nombre: str, frase: str) -> str:
        if not (frase or "").strip():
            raise ErrorAgente("a text effect needs its sentence (in English: it goes into the prompt as is)")
        ef = self.estado()["efectos"]
        n = max([int(k[1:]) for k in ef if k[1:].isdigit()] + [0]) + 1
        ef[f"E{n}"] = {"nombre": (nombre or "").strip(), "ficha": frase.strip()}
        self.marcar("referencia", ref=f"E{n}")
        return f"E{n}"

    # ---- la pista de texto (textos.js)
    def poner_textos(self, textos: list[dict]) -> None:
        out = []
        for i, x in enumerate(textos):
            texto = str(x.get("texto") or "").strip()
            if not texto:
                raise ErrorAgente(f"text {i + 1}: «texto» is empty")
            t0 = float(x.get("t") or 0)
            if not 0 <= t0 < self.duracion:
                raise ErrorAgente(f"text {i + 1}: «t» must be between 0 and {self.duracion} s")
            fin = x.get("fin")
            if fin not in (None, ""):
                fin = float(fin)
                if not t0 < fin <= self.duracion + 1e-6:
                    raise ErrorAgente(f"text {i + 1}: «fin» must be after «t» and inside the edit")
            else:
                fin = None
            sitio = x.get("sitio") or "encima"
            if sitio not in SITIOS:
                raise ErrorAgente(f"text {i + 1}: «sitio» must be «encima» (over the image) or «al_lado» (beside the face)")
            letra = (x.get("letra") or "").strip()
            if letra:
                r = self.etiquetas().get(letra)
                if not r:
                    raise ErrorAgente(f"text {i + 1}: {letra} is not a reference of this project")
            out.append({"id": x.get("id") or f"a{i + 1}{int(datetime.now().timestamp()) % 100000}", "texto": texto,
                        "t": al_fotograma(t0), "fin": al_fotograma(fin) if fin is not None else None, "sitio": sitio,
                        "letra": letra, "frase": str(x.get("frase") or "").strip()})
        self.plan["textos"] = out
        self.marcar("texto")

    # ---- resolución y semilla
    def tamano(self) -> tuple[int, int] | None:
        for nid, d in self.plantilla.items():
            ins = d.get("inputs", {})
            if d.get("class_type", "").startswith("MiniMaxH3") and "width" in ins and "height" in ins:
                return int(self.valor(nid, "width")), int(self.valor(nid, "height"))
        return None

    def poner_tamano(self, ancho: int, alto: int) -> tuple[int, int]:
        ancho, alto = redondear32(ancho), redondear32(alto)
        for nid, d in self.plantilla.items():
            ins = d.get("inputs", {})
            if d.get("class_type", "").startswith("MiniMaxH3") and "width" in ins and "height" in ins:
                self.poner(nid, "width", ancho)
                self.poner(nid, "height", alto)
        self.marcar("resolucion")
        return ancho, alto

    def semilla(self):
        nid = self.nodo(T_RUIDO)
        return self.valor(nid, "noise_seed") if nid else None

    def poner_semilla(self, s: int) -> None:
        nid = self.nodo(T_RUIDO)
        if not nid:
            raise ErrorAgente("the template has no RandomNoise node")
        self.poner(nid, "noise_seed", int(s))
        self.marcar("semilla")

    # ---- la canción (audio.js: el LoadAudio apunta al recorte; la original y el inicio quedan en el estado)
    def poner_audio(self, original: str, inicio_s: float, recorte: str) -> None:
        nid = self.nodo(T_AUDIO)
        if not nid:
            raise ErrorAgente("the template has no LoadAudio node")
        self.poner(nid, "audio", recorte or original)
        self.estado()["audio"] = {"original": original, "inicio_s": round(float(inicio_s), 4), "recorte": recorte, "tocado": True}
        self.marcar("cancion")


# ------------------------------------------------------------------ contar el proyecto como lo ve la interfaz
def _corto(x: str, n: int = 160) -> str:
    x = (x or "").replace("\n", " ").strip()
    return x if len(x) <= n else x[:n - 1] + "…"


def describir(p: Proyecto, con_prompt: bool = False) -> str:
    """El proyecto contado de arriba abajo, zona por zona, con los nombres de la interfaz (ES / EN)."""
    e, lin = p.estado(), []
    tam = p.tamano()
    lin.append(f"# Project «{p.nombre}» · rev {p.datos.get('rev', 0)} · saved {p.datos.get('guardado', '?')}"
               f" by {p.datos.get('autor') or 'the page'}")
    lin.append("")
    lin.append("## Header (cabecera)")
    if tam:
        lin.append(f"- Resolution (Resolución): {tam[0]}×{tam[1]} = {megapixeles(*tam)} MP · "
                   f"{'vertical' if tam[1] > tam[0] else 'horizontal' if tam[0] > tam[1] else 'square'}")
    lin.append(f"- Video seed (Semilla, next to «Generar»): {p.semilla()}")
    lin.append("")
    lin.append("## Step 1 · References (Referencias) — Principal = every shot · Secundarias = only the shots that cite them")
    refs = p.referencias()
    if not refs:
        lin.append("- (no references yet)")
    for r in refs:
        grupo = "Principal" if r["en_todas"] else "Secundaria"
        estado_ = "" if r["tag"] else " · OFF (not sent to H3)"
        extra = "".join(f" · {k}: {v}" for k, v in (("name", r["nombre"]), ("pronoun", r["pronombre"]), ("outfit", r["atuendo"])) if v)
        lin.append(f"- {r['tag'] or '—'} «{r['clave']}» · role {r['papel']} · {grupo} · {r['kind']} · strength {r['fuerza']}{estado_}{extra}")
        if r["ficha"]:
            lin.append(f"    card (ficha): {_corto(r['ficha'], 240)}")
    for k, v in e["efectos"].items():
        lin.append(f"- {k} text effect «{v.get('nombre', '')}»: {_corto(v.get('ficha', ''))}")
    lin.append("")
    lin.append("## Step 2 · Timeline (Línea de tiempo)")
    lin.append(f"- Duration: {p.duracion} s = {p.fotogramas()} frames at {FPS} fps · {p.n_tomas} shots · cuts "
               f"{'by hand (plan.cortes)' if p.plan.get('cortes') else 'automatic (on the beats)'}")
    for k, (a, b) in enumerate(p.duraciones(), 1):
        t = p.plan["tomas"][k - 1]
        lin.append(f"- Shot {k}: {a:.3f}–{b:.3f} s ({b - a:.3f} s) · action: {_corto(t['momento'], 90) or '(empty)'}")
    textos = p.plan.get("textos") or []
    lin.append(f"- Text track (fila de texto): " + ("(empty)" if not textos else ""))
    for x in textos:
        lin.append(f"    «{x['texto']}» at {x['t']} s → {x['fin'] if x.get('fin') is not None else 'end of its shot'} · "
                   f"{x.get('sitio')} · font {x.get('letra') or '—'} · {_corto(x.get('frase', ''), 100)}")
    a = p.audio()
    if a:
        lin.append(f"- Song (canción): {a['original']} · segment from {a['inicio_s']} s for {p.duracion} s"
                   f"{' (cut file ' + a['recorte'] + ')' if a['recorte'] else ''}")
    else:
        lin.append("- Song (canción): NONE — Generate still works: the video gets the sound H3 makes from «Sound» (poner_cancion to add one)")
    lin.append(f"- Sound (Sonido, under the waveform): {e['sonido'] or '(empty: just the music)'} · video audio: "
               f"{'the song as is' if e['audio_salida'] == 'cancion' and a else 'the audio H3 generates'}")
    lin.append("")
    lin.append("## Shot panel (panel de la toma), one per shot")
    for k, t in enumerate(p.plan["tomas"], 1):
        cit = [x for x in ([t.get(c) for c in CAMPOS_REF if c != "efecto"] + (t.get("efectos") or [])) if x]
        lin.append(f"### Shot {k}" + (" (selected in the page)" if e.get("toma_elegida") == k else ""))
        for c, nombre in (("momento", "Action / movement (Acción / movimiento) — MAIN"), ("gesto", "Gesture (Gesto)"),
                          ("lugar", "Place (Lugar)"), ("encuadre", "Framing (Encuadre)"), ("camara", "Camera (Movimiento de cámara)"),
                          ("luz", "Light (Luz)"), ("estilo", "Style (Estilo)"), ("efecto_frase", "Effect sentence (frase del efecto)")):
            if t.get(c):
                lin.append(f"- {nombre}: {t[c]}")
        lin.append(f"- Environment (entorno): {t['entorno']}" + (f" · background ref: {t['fondo_ref']}" if t.get("fondo_ref") else "")
                   + (f" · fixed place ref: {t['lugar_ref']}" if t.get("lugar_ref") else ""))
        if cit:
            lin.append(f"- References of this shot: {', '.join(dict.fromkeys(cit))}")
    marcas = (p.datos.get("agente") or {}).get("marcas") or []
    if marcas:
        lin.append("")
        lin.append(f"## «✎ agente» marks still visible to the creative: {len(marcas)}")
    avisos = getattr(p, "avisos", None)
    if avisos:
        lin.append("")
        lin.append("## Gaps the page reports (huecos del prompt)")
        lin += [f"- {x}" for x in avisos]
    if e["a_mano"]:
        lin.append("")
        lin.append("⚠ The final prompt was edited BY HAND in the page (a_mano): shot changes do not reach H3 until the creative "
                   "turns that off.")
    if con_prompt:
        lin += ["", "## Final prompt (Prompt final, what H3 receives)", "```", e["prompt"], "```"]
    return "\n".join(lin)


# ------------------------------------------------------------------ revisar antes de generar
NEGACIONES = re.compile(r"\b(no|not|never|without|don't|doesn't|nothing|avoid)\b", re.I)


def revisar(p: Proyecto) -> tuple[list[str], list[str]]:
    """(errores, avisos): lo que impide generar y lo que conviene mirar. Cada regla sale de una prueba (app/guia/)."""
    errores, avisos = [], []
    e = p.estado()
    f = p.fotogramas()
    if (f - 5) % 17:
        errores.append(f"the video length is {f} frames: H3 only makes 17·k+5 frames (use poner_duracion)")
    if not p.audio():
        avisos.append("there is no song: the video gets the sound H3 invents from «Sound» (sonido); write there what it should "
                      "sound like, or poner_cancion")
    if not (e.get("prompt") or "").strip():
        errores.append("the final prompt is empty")
    etq = p.etiquetas()
    for k, t in enumerate(p.plan["tomas"], 1):
        if not (t.get("momento") or "").strip():
            avisos.append(f"shot {k}: «Action / movement» (the main field) is empty")
        for c in CAMPOS_REF:
            v = t.get(c)
            if v and v.startswith("<") and v not in etq:
                errores.append(f"shot {k}: {c} cites {v}, which no longer exists")
        for c in CAMPOS_TEXTO:
            for m in ETIQUETA.finditer(t.get(c) or ""):
                if m.group(0) not in etq:
                    errores.append(f"shot {k}: «{c}» cites {m.group(0)}, which does not exist")
        cam = t.get("camara") or ""
        if NEGACIONES.search(cam):
            avisos.append(f"shot {k}: the camera uses a negation («{_corto(cam, 60)}»): H3 may do just that; describe what does happen")
        if cam.strip() in ("holds still", "") and k > 1 and (p.plan["tomas"][k - 2].get("camara") or "") not in ("", "holds still"):
            avisos.append(f"shot {k}: a short «holds still» after a moving camera lets H3 carry the previous move over; describe the "
                          "still camera in detail (tripod, same distance, what stays framed until the last frame)")
        if k > 1:
            a = p.plan["tomas"][k - 2]
            if (a.get("encuadre"), a.get("camara"), a.get("momento")) == (t.get("encuadre"), t.get("camara"), t.get("momento")) and t.get("momento"):
                avisos.append(f"shots {k - 1} and {k} ask for the same thing: H3 will not cut between them")
    for k, (a, b) in enumerate(p.duraciones(), 1):
        if b - a < 0.5:
            avisos.append(f"shot {k} lasts {b - a:.2f} s: shots of 0.4–0.5 s tend to get lost")
    if p.n_tomas > max(1, round(p.duracion * 1.2)):
        avisos.append(f"{p.n_tomas} shots in {p.duracion} s: H3 keeps about 10 shots per 10 s")
    tam = p.tamano()
    if tam:
        carga = megapixeles(*tam) * f
        if carga > 135:
            avisos.append(f"{megapixeles(*tam)} MP × {f} frames is heavy for a 12 GB GPU (tested: 5 s at 1 MP, 8 s at 0.4 MP); "
                          "a pod with 24 GB does 12 s at 1 MP")
        if tam[0] >= tam[1]:
            avisos.append("the video is not vertical (the project's format is vertical, e.g. 768×1344)")
    if not any(r["papel"] == "personaje" and r["tag"] for r in p.referencias()):
        avisos.append("no reference has the role «personaje» (character)")
    for r in p.referencias():
        if r["tag"] and r["papel"] == "no":
            avisos.append(f"{r['tag']} «{r['clave']}» has no role: it is sent to H3 but the prompt does not explain it")
    if len([r for r in p.referencias() if r["tag"] and r["kind"] == "image"]) > 9:
        errores.append("more than 9 pictures: H3 takes 9 at most")
    if len([r for r in p.referencias() if r["tag"] and r["kind"] == "video"]) > 3:
        errores.append("more than 3 videos: H3 takes 3 at most")
    if e["a_mano"]:
        avisos.append("the final prompt was edited by hand in the page: your shot changes do not reach H3")
    for x in getattr(p, "avisos", None) or []:
        avisos.append(f"page gap (informative): {x}")
    return errores, avisos
