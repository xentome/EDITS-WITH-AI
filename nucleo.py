"""Núcleo del nodo «Prompt del edit (LLM)» y de su editor: todo el trabajo, sin ComfyUI (se puede probar desde la terminal).

Un PLAN es lo que se ve en el editor: arco, look y fondo generales, y una lista de tomas con sus campos (lugar, momento,
personaje, ropa, pose, objeto, lugar_ref, fondo_ref, efecto, encuadre, luz, gesto, camara). Los campos que el usuario fija (candados, lista `fijos`)
se respetan siempre: el LLM los recibe como dados y el código los vuelve a poner encima de lo que responda.

Recorrido (planos/1 Como funciona.md): reloj → historia (1 llamada, razonamiento low) → tomas (1 llamada cada una, sin razonamiento)
→ montaje. Cada respuesta del LLM pasa una revisión; si falla, se le devuelve la lista de problemas y repite.
"""
import copy
import difflib
import glob
import hashlib
import json
import os
import re
import time
import urllib.request

URL = "http://127.0.0.1:8080/v1/chat/completions"
MODELO = "qwen3.8-27b"
CORRIDAS = os.path.expanduser("~/Escritorio/experimentos_edit/edit_prompt_llm")
RECETAS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recetas.json")
with open(os.path.abspath(__file__), "rb") as _f:
    CODIGO = hashlib.sha1(_f.read()).hexdigest()[:8]  # entra en la huella: si cambia este archivo, la despensa no se reutiliza
ENCUADRES = ("extreme close-up", "close-up", "medium close-up")
# Papeles de una referencia. Lo que no cambia (persistente): personaje, objeto, lugar. Lo que se presta: ropa, pose, fondo,
# estilo. "no usar" = cualquier otro valor. planos/1 Como funciona.md.
PERSISTENTES = ("personaje", "objeto", "lugar")
PRESTADOS = ("ropa", "pose", "fondo", "estilo")
PAPELES = PERSISTENTES + PRESTADOS
INTENTOS_HISTORIA, INTENTOS_TOMA = 3, 4
REGLA = "Describe solo lo que se ve: sin metáforas, sin negaciones, sin números, medidas ni tiempos."
FISICA = "Nunca tumbado/a ni con el suelo de fondo."
# Palabras que ya causaron fallos (plano 5, Reglas de revisión): tumbada en el suelo, líquidos en la cara, texto no pedido, planos lejanos
GENERALES = ["lying", "lie down", "lies down", "ground", "floor", "asphalt", "wet", "liquid", "blood", "drip", "dripping", "tears",
             "letters", "words", "text", "caption", "wide shot", "full body", "long shot", "full shot", "medium shot"]
ETIQUETA = re.compile(r"<(?:Subject|Picture|Video|Audio) \d+>")
NEGACION = re.compile(r"\b(?:not|no|never|without|nor|nothing|none)\b|n't\b", re.I)
CONTRARIO = {"she": r"\b(?:he|him|his|himself)\b", "he": r"\b(?:she|her|hers|herself)\b"}
# campo del LLM → campo del plan
HISTORIA = {"PLACE": "lugar", "MOMENT": "momento", "OUTFIT": "personaje", "CLOTHES": "ropa", "POSE": "pose",
            "OBJECT": "objeto", "LOCATION": "lugar_ref", "BACKGROUND": "fondo_ref", "EFFECT": "efecto"}
# campo de la toma que guarda una referencia → papel de las referencias que admite
CAMPO_PAPEL = {"personaje": "personaje", "ropa": "ropa", "pose": "pose", "objeto": "objeto", "lugar_ref": "lugar",
               "fondo_ref": "fondo"}
DIRECCION = {"FRAMING": "encuadre", "LIGHT": "luz", "ACTION": "gesto", "CAMERA": "camara"}
ULTIMA_LLAMADA = [0.0]  # cuándo terminó la última llamada al LLM (el nodo espera a que llama suelte la VRAM)


def cargar_recetas():
    with open(RECETAS) as f:
        return json.load(f)


# ------------------------------------------------------------------ plan y referencias
def toma_vacia():
    return {**{c: "" for c in list(HISTORIA.values()) + list(DIRECCION.values())}, "efecto_frase": "", "fijos": []}


def frase_efecto(receta, t):
    """La frase que va al prompt: la que escribió el usuario en la toma (efecto_frase) o, si no, la probada de la receta."""
    if (t.get("efecto_frase") or "").strip():
        return t["efecto_frase"].strip().rstrip(".")
    return receta["efectos"][t["efecto"]][1] if t.get("efecto") in receta["efectos"] else ""


def plan_vacio(n):
    return {"arco": "", "look": "", "fondo": "", "fijos": [], "tomas": [toma_vacia() for _ in range(n)]}


def ajustar_plan(plan, n):
    """Copia del plan con exactamente n tomas (conserva las que ya había)."""
    p = copy.deepcopy(plan) if plan else plan_vacio(n)
    for c in ("arco", "look", "fondo"):
        p.setdefault(c, "")
    p.setdefault("fijos", [])
    p["tomas"] = [{**toma_vacia(), **t} for t in p.get("tomas", [])][:n]
    p["tomas"] += [toma_vacia() for _ in range(n - len(p["tomas"]))]
    return p


def menu_de(receta, refs=None):
    """Referencias por papel: {'personaje': {tag: {'nombre', 'ficha'}}, 'objeto': …, 'lugar': …, 'ropa': …, 'pose': …}.
    tag es <Picture N> o <Video N> (una cajita de varias fotos llega como <Video N>).
    Las del editor (refs) mandan; sin editor se usan las de la receta."""
    m = {p: {} for p in PAPELES}
    for tag, r in (refs if refs is not None else receta.get("referencias", {})).items():
        if r.get("papel") in m:
            m[r["papel"]][tag] = {"nombre": (r.get("nombre") or "").strip(), "ficha": (r.get("ficha") or "").strip()}
    return m


def atuendos(menu):
    """Referencias de personaje con nombre: son atuendos y cada toma elige uno (OUTFIT). Las que no tienen nombre solo dan la
    identidad (por ejemplo una cajita con las fotos de Teto) y valen para todas las tomas."""
    return {t: a for t, a in menu["personaje"].items() if a["nombre"]}


def sujetos_objeto(menu):
    """Cada objeto que no cambia es un sujeto más: el personaje es <Subject 1> y los objetos <Subject 2>, <Subject 3>…"""
    return {tag: f"<Subject {i}>" for i, tag in enumerate(menu["objeto"], 2)}


def nombre_de(r, otro):
    return (r.get("nombre") or "").strip() or otro


def lista(tags):
    tags = list(tags)
    return tags[0] if len(tags) == 1 else ", ".join(tags[:-1]) + " and " + tags[-1] if tags else ""


# ------------------------------------------------------------------ reloj (habitación 3)
def beats_de_onda(onda, sr):
    """Tiempos de beat (s) de una onda mono (numpy), con librosa."""
    import librosa
    _, cuadros = librosa.beat.beat_track(y=onda.astype("float32"), sr=sr)
    return [round(float(t), 3) for t in librosa.frames_to_time(cuadros, sr=sr)]


_BEATS = {}


def beats_de_archivo(ruta):
    """Beats de un archivo de audio (con caché por archivo y fecha): el editor no tiene la onda, tiene el nombre."""
    clave = (ruta, os.path.getmtime(ruta))
    if clave not in _BEATS:
        import librosa
        y, sr = librosa.load(ruta, sr=None, mono=True)
        _BEATS[clave] = beats_de_onda(y, sr)
    return _BEATS[clave]


def cortes(n, dur, beats=None):
    """Inicio de cada toma: 0 y después el beat más cercano a un reparto parejo; ninguna toma dura menos de 0,4 s."""
    ini = [0.0]
    for k in range(1, n):
        ideal, lo, hi = k * dur / n, ini[-1] + 0.4, dur - 0.4 * (n - k)
        cand = [b for b in (beats or []) if lo <= b <= hi]
        ini.append(round(min(cand, key=lambda b: abs(b - ideal)) if cand else max(ideal, lo), 3))
    return ini


def duraciones(n, dur, beats=None):
    ini = cortes(n, dur, beats)
    return ini, [b - a for a, b in zip(ini, ini[1:] + [dur])]


# ------------------------------------------------------------------ audio: la canción entera y el tramo elegido
# La ventana de audio del editor (planos/4 El editor.md) deja elegir qué tramo de una canción larga usa el edit. Todo se
# decodifica con ffmpeg (decodificar: búsqueda rápida hasta un segundo entero antes y el resto exacto, a la muestra).
# Los beats del tramo son los de la canción entera (cacheados en disco) desplazados al 0 del tramo.
CACHE_AUDIO = os.path.join(CORRIDAS, "cache_audio")
SR_PICOS, PICOS_POR_S, PICOS_RESUMEN = 4000, 50, 4000


def _ffmpeg(ruta, sr, canales=1, desde=0, dur=None):
    """ffmpeg escribiendo PCM int16 por stdout desde «desde» (s enteros: así la búsqueda cae justo en una muestra)."""
    import subprocess
    cmd = ["ffmpeg", "-v", "error", "-nostdin"] + (["-ss", str(int(desde))] if desde > 0 else []) + ["-i", ruta]
    if dur is not None:
        cmd += ["-t", f"{dur:.6f}"]
    return subprocess.Popen(cmd + ["-f", "s16le", "-ac", str(canales), "-ar", str(sr), "-"], stdout=subprocess.PIPE)


def decodificar(ruta, sr, canales=1, inicio=0.0, dur=None):
    """PCM int16 [muestras, canales] de [inicio, inicio+dur]. Empieza en la muestra floor(inicio·sr + ½) y, con «dur», da
    exactamente round(dur·sr) muestras (con ceros si la canción se acaba antes). ffmpeg busca hasta el segundo entero de al
    menos 1 s antes y el resto se recorta aquí: en un mp3 los primeros 20 ms después de buscar salen mal."""
    import math
    import numpy as np
    desde = max(0, math.floor(inicio) - 1)
    salto = math.floor(inicio * sr + 0.5) - desde * sr
    p = _ffmpeg(ruta, sr, canales, desde, None if dur is None else inicio - desde + dur + 0.25)
    x = np.frombuffer(p.stdout.read(), np.int16).reshape(-1, canales)[salto:]
    p.wait()
    if dur is not None:
        n = round(dur * sr)
        x = x[:n] if len(x) >= n else np.concatenate([x, np.zeros((n - len(x), canales), np.int16)])
    return x


def datos_audio(ruta):
    """Duración, frecuencia y canales (ffprobe)."""
    import subprocess
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                          "stream=sample_rate,channels:format=duration", "-of", "json", ruta],
                         capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    s = (j.get("streams") or [{}])[0]
    return {"duracion": float(j["format"]["duration"]), "sr": int(s.get("sample_rate", 44100)), "canales": int(s.get("channels", 2))}


def _picos(x, por):
    """Pico (0–255) de cada grupo de «por» muestras de una onda mono int16."""
    import numpy as np
    x = np.abs(x.reshape(-1).astype(np.int32))
    n = -(-len(x) // por)
    x = np.pad(x, (0, n * por - len(x)))
    return (x.reshape(n, por).max(1) * 255 // 32767).astype(np.uint8)


def info_audio(ruta, cache=CACHE_AUDIO):
    """Duración y resumen de picos de la canción entera (≤ PICOS_RESUMEN valores), cacheado en disco por archivo + fecha +
    tamaño. Decodifica en streaming a mono y 4 kHz: una canción de una hora no se carga entera en memoria."""
    import numpy as np
    st = os.stat(ruta)
    clave = hashlib.sha1(f"{os.path.abspath(ruta)}|{st.st_mtime_ns}|{st.st_size}".encode()).hexdigest()[:16]
    archivo = os.path.join(cache, clave + ".json")
    if os.path.isfile(archivo):
        with open(archivo) as f:
            return {**json.load(f), "cache": True}
    d = datos_audio(ruta)
    p, por, trozos, resto = _ffmpeg(ruta, SR_PICOS), SR_PICOS // PICOS_POR_S, [], b""
    while True:
        b = p.stdout.read(1 << 20)
        if not b:
            break
        b, resto = resto + b, b""
        corte = len(b) - len(b) % (2 * por)
        b, resto = b[:corte], b[corte:]
        if b:
            trozos.append(_picos(np.frombuffer(b, np.int16), por))
    p.wait()
    if resto:
        trozos.append(_picos(np.frombuffer(resto[:len(resto) // 2 * 2], np.int16), por))
    finos = np.concatenate(trozos) if trozos else np.zeros(1, np.uint8)
    grupo = max(1, -(-len(finos) // PICOS_RESUMEN))
    n = -(-len(finos) // grupo)
    resumen = np.pad(finos, (0, n * grupo - len(finos))).reshape(n, grupo).max(1)
    out = {**d, "picos": resumen.tolist(), "s_por_pico": grupo / PICOS_POR_S}
    os.makedirs(cache, exist_ok=True)
    with open(archivo, "w") as f:
        json.dump(out, f)
    return {**out, "cache": False}


def ventana_audio(ruta, inicio, dur, margen=None, por_s=400, sr=16000):
    """Picos finos (0–255, «por_s» por segundo) de [inicio − margen, inicio + dur + margen] para dibujar la ventana con detalle
    mientras se arrastra. Devuelve desde dónde empiezan («desde», s)."""
    margen = max(8.0, 3 * dur) if margen is None else margen
    desde = max(0.0, inicio - margen)
    x = decodificar(ruta, sr, 1, desde, inicio + dur + margen - desde)
    return {"desde": desde, "por_s": por_s, "picos": _picos(x, sr // por_s).tolist()}


def wav_bytes(x, sr):
    """PCM int16 [muestras, canales] → bytes de un WAV."""
    import io
    import wave
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(x.tobytes())
    return buf.getvalue()


def tramo_wav(ruta, inicio, dur):
    """El tramo [inicio, inicio+dur] en WAV, con la frecuencia de la canción y como mucho 2 canales."""
    d = datos_audio(ruta)
    sr, can = d["sr"], min(2, d["canales"])
    return wav_bytes(decodificar(ruta, sr, can, inicio, dur), sr), sr, can


def nombre_tramo(ruta, inicio, dur):
    """Nombre estable del recorte: el mismo archivo, inicio y duración dan siempre el mismo nombre."""
    st = os.stat(ruta)
    h = hashlib.sha1(f"{os.path.basename(ruta)}|{st.st_mtime_ns}|{st.st_size}|{inicio:.4f}|{dur:.4f}".encode()).hexdigest()[:12]
    return f"edit_tramo_{h}.wav"


def recortar_audio(ruta, inicio, dur, carpeta):
    """Escribe el tramo [inicio, inicio+dur] como WAV en «carpeta» (input/ de ComfyUI) sin tocar el original. Si ya existe, lo
    reutiliza. Devuelve su nombre, sus muestras y su frecuencia."""
    nombre = nombre_tramo(ruta, inicio, dur)
    destino = os.path.join(carpeta, nombre)
    if not os.path.isfile(destino):
        datos, sr, can = tramo_wav(ruta, inicio, dur)
        with open(destino + ".tmp", "wb") as f:
            f.write(datos)
        os.replace(destino + ".tmp", destino)
    import wave
    with wave.open(destino) as w:
        return {"nombre": nombre, "muestras": w.getnframes(), "sr": w.getframerate()}


def beats_cancion(ruta, cache=CACHE_AUDIO, sr=22050, hop=512, trozo_s=60):
    """Beats (s) de la canción entera, cacheados en disco por archivo + fecha + tamaño. La fuerza de los golpes (onset) se
    calcula por trozos de 1 minuto, así una hora de audio no se carga entera (unos 13 s la primera vez); después librosa
    sigue el pulso de toda la canción de una vez. Da los mismos beats que librosa con la canción entera a 22 kHz (±1 hop)."""
    import numpy as np
    import librosa
    st = os.stat(ruta)
    clave = hashlib.sha1(f"{os.path.abspath(ruta)}|{st.st_mtime_ns}|{st.st_size}|{sr}|{hop}".encode()).hexdigest()[:16]
    archivo = os.path.join(cache, clave + "_beats.json")
    if os.path.isfile(archivo):
        with open(archivo) as f:
            return json.load(f)
    p, n, previo, envs = _ffmpeg(ruta, sr), trozo_s * sr, np.zeros(0, np.float32), []
    while True:
        b = p.stdout.read(n * 2)
        if not b:
            break
        y = np.frombuffer(b[:len(b) // 2 * 2], np.int16).astype(np.float32) / 32768
        c = len(previo) // hop  # el final del trozo anterior va delante para que el borde no invente un golpe
        envs.append(librosa.onset.onset_strength(y=np.concatenate([previo, y]), sr=sr, hop_length=hop)[c:c + -(-len(y) // hop)])
        previo = y[-4 * hop:] if len(y) >= 4 * hop else np.zeros(0, np.float32)
    p.wait()
    env = np.concatenate(envs) if envs else np.zeros(1, np.float32)
    _, cuadros = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop)
    beats = [round(float(t), 3) for t in librosa.frames_to_time(cuadros, sr=sr, hop_length=hop)]
    os.makedirs(cache, exist_ok=True)
    with open(archivo, "w") as f:
        json.dump(beats, f)
    return beats


def beats_de_tramo(ruta, inicio, dur, cache=CACHE_AUDIO):
    """Beats del tramo [inicio, inicio+dur], contados desde su inicio: los de la canción entera, desplazados. (Analizar solo
    el tramo con un margen cambia el tempo que ve librosa: a veces sale la mitad de beats.)"""
    return [round(b - inicio, 3) for b in beats_cancion(ruta, cache) if inicio <= b <= inicio + dur]


def en_palabras(d):
    if d < 0.7:
        return "muy corta: un solo gesto pequeño"
    if d < 1.3:
        return "corta: un gesto simple"
    if d < 2.2:
        return "media: un gesto y un movimiento de cámara"
    return "larga: un gesto que empieza y termina, con movimiento de cámara"


def leer_palabras(texto, n):
    """'TO YOU @1' / 'PEAK @ultima' (una por línea o separadas por ;) → {toma: texto}."""
    out = {}
    for lin in re.split(r"[\n;]", texto or ""):
        if not lin.strip():
            continue
        if "@" not in lin:
            raise ValueError(f"palabras: falta '@ toma' en «{lin.strip()}» (ejemplo: TO YOU @1)")
        txt, donde = (s.strip() for s in lin.rsplit("@", 1))
        k = n if donde.lower() in ("ultima", "última", "last") else int(donde) if donde.isdigit() else 0
        if not txt or not 1 <= k <= n:
            raise ValueError(f"palabras: «{lin.strip()}» no vale (la toma va de 1 a {n}, o @ultima)")
        out[k] = txt.strip('"«»“”')
    return out


# ------------------------------------------------------------------ llamadas al LLM y registro
class Registro:
    """Guarda cada llamada (prompt y respuesta), los problemas de revisión y el plan en la carpeta de la corrida."""

    def __init__(self, carpeta):
        self.carpeta, self.n, self.llamadas, self.problemas = carpeta, 0, [], []
        os.makedirs(carpeta, exist_ok=True)

    def guardar(self, nombre, mensajes, respuesta, segundos, fin, tokens):
        self.n += 1
        base = os.path.join(self.carpeta, f"{self.n:02d}_{nombre}")
        with open(base + "_PROMPT.txt", "w") as f:
            f.write("\n\n".join(f"### {m['role']}\n{m['content']}" for m in mensajes))
        with open(base + "_RESPUESTA.txt", "w") as f:
            f.write(respuesta)
        self.llamadas.append({"paso": nombre, "segundos": round(segundos, 1), "fin": fin, "tokens_salida": tokens})
        self.volcar()

    def volcar(self):
        """registro.json se reescribe tras cada llamada: si la corrida falla, queda qué pasó y cuánto tardó."""
        with open(os.path.join(self.carpeta, "registro.json"), "w") as f:
            json.dump({"llamadas": self.llamadas, "problemas": self.problemas}, f, ensure_ascii=False, indent=1)


def registro_nuevo(accion):
    return Registro(os.path.join(CORRIDAS, time.strftime("%Y%m%d_%H%M%S") + "_" + accion))


def llm_vivo():
    try:
        urllib.request.urlopen(URL.replace("/v1/chat/completions", "/health"), timeout=5)
        return True
    except Exception:
        return False


def pedir(reg, nombre, mensajes, pensar, semilla, max_tokens):
    cuerpo = {"model": MODELO, "temperature": 0.6, "seed": semilla, "max_tokens": max_tokens, "messages": mensajes,
              "chat_template_kwargs": {"reasoning_effort": "low"} if pensar else {"enable_thinking": False}}
    t = time.time()
    pet = urllib.request.Request(URL, json.dumps(cuerpo).encode(), {"Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(pet, timeout=900).read())
    ULTIMA_LLAMADA[0] = time.time()
    ch = r["choices"][0]
    texto = (ch["message"].get("content") or "").strip()
    reg.guardar(nombre, mensajes, texto, time.time() - t, ch.get("finish_reason"), r.get("timings", {}).get("predicted_n"))
    return texto, ch.get("finish_reason")


def conversar(reg, nombre, prompt, leer, revisar, intentos, pensar, semilla, max_tokens):
    """Pide, lee y revisa; si hay problemas se los devuelve al LLM en la misma conversación. Devuelve (datos, intentos)."""
    if not llm_vivo():
        raise RuntimeError(f"El LLM no responde en {URL} (servicio llama-qwen38: systemctl --user start llama-qwen38).")
    mensajes = [{"role": "user", "content": prompt}]
    for i in range(1, intentos + 1):
        texto, fin = pedir(reg, f"{nombre}_{i}", mensajes, pensar, semilla, max_tokens)
        datos = leer(texto)
        problemas = ["la respuesta quedó cortada: escribe solo lo pedido, más breve"] if fin == "length" else revisar(datos)
        if not problemas:
            return datos, i
        reg.problemas.append({"paso": nombre, "intento": i, "problemas": problemas})
        mensajes += [{"role": "assistant", "content": texto},
                     {"role": "user", "content": "Tu respuesta tiene estos problemas:\n- " + "\n- ".join(problemas) +
                      "\nEscríbela de nuevo completa, en el mismo formato, corrigiéndolos."}]
    reg.volcar()
    raise RuntimeError(f"{nombre}: {intentos} intentos sin pasar la revisión. Últimos problemas: {'; '.join(problemas)}. "
                       f"Detalle en {reg.carpeta}")


# ------------------------------------------------------------------ revisiones comunes
def problemas_texto(t, receta, campo):
    """Lo que ya causó fallos en el video (plano 5 (Reglas de revisión), filas 9–13, 15 y 24)."""
    p, s = [], ETIQUETA.sub("", t)
    if re.search(r"\d", s):
        p.append(f"{campo}: tiene números")
    if re.search(r'["«»“”]', s):
        p.append(f"{campo}: tiene comillas (parece texto en pantalla)")
    m = NEGACION.search(s)
    if m:
        p.append(f"{campo}: tiene una negación («{m.group(0)}»); di lo que sí se ve")
    for w in GENERALES + receta.get("prohibidas", []):
        if re.search(rf"\b{re.escape(w)}\b", s, re.I):
            p.append(f"{campo}: usa «{w}», que da problemas en el video")
    m = re.search(CONTRARIO[receta["pronombre"]], s, re.I) if receta["pronombre"] in CONTRARIO else None
    if m:
        p.append(f"{campo}: usa «{m.group(0)}»; {receta['nombre']} es {receta['pronombre']}")
    return p


def parecido(a, b):
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


def etiqueta(valor, menu):
    """'<Picture 5>', 'Picture 5' o '5' → '<Picture 5>' si está en el menú (igual con <Video N>); vacío o 'none' → '';
    lo demás → None (no vale). Un número solo se busca primero como Picture, salvo que diga «video»."""
    if re.fullmatch(r"\s*(?:none|-|ninguna|ninguno)?\s*", valor or "", re.I):
        return ""
    m = re.search(r"\d+", valor)
    if not m:
        return None
    tipos = ("Video", "Picture") if re.search(r"video", valor, re.I) else ("Picture", "Video")
    return next((f"<{t} {m.group(0)}>" for t in tipos if f"<{t} {m.group(0)}>" in menu), None)


def cabecera(receta, menu=None):
    lin = [receta["definicion_edit"],
           f"Estilo: {receta['estilo']}. {receta['protagonista']} (su aspecto lo dan las imágenes de referencia; no lo describas)."]
    for tag, suj in sujetos_objeto(menu or {"objeto": {}}).items():
        o = menu["objeto"][tag]
        lin.append(f"{suj} es {nombre_de(o, 'un objeto')}: un objeto que no cambia en todo el edit (su aspecto lo da {tag}; "
                   "no lo describas).")
    return lin


# ------------------------------------------------------------------ sala de la historia (habitación 5)
def prompt_historia(receta, menu, plan, idea, durs, palabras):
    n = len(plan["tomas"])
    lin = cabecera(receta, menu) + ["", f"IDEA DEL USUARIO (manda): {idea}"]
    if plan["fondo"]:
        lin.append(f"Fondos de todo el edit: {plan['fondo']}")
    lin.append(f"Son {n} tomas, en orden: " +
               "; ".join(f"toma {k} {en_palabras(d).split(':')[0]}" for k, d in enumerate(durs, 1)) + ".")
    if palabras:
        lin.append("Las palabras en pantalla las pone el sistema (" +
                   ", ".join(f"«{w}» en la toma {k}" for k, w in sorted(palabras.items())) + "); tú no escribas texto.")
    campos = ["PLACE: <un lugar concreto, distinto en cada toma; solo el lugar, sin la luz>",
              "MOMENT: <qué hace y siente <Subject 1>, una frase que se pueda ver de cerca>"]
    trajes = atuendos(menu)
    if trajes:
        lin += ["", "Personaje y atuendo (cada toma usa una de estas referencias; cambia de atuendo entre tomas seguidas):"]
        lin += [f"- {t}: {a['nombre']} ({a['ficha']})" for t, a in trajes.items()]
        campos.append("OUTFIT: <Picture N>" + (" o none si la toma lleva CLOTHES" if menu["ropa"] else ""))
    if menu["ropa"]:
        lin += ["", "Ropa prestada (solo la ropa; <Subject 1> se la pone en las tomas que la usen" +
                ("; una toma lleva OUTFIT o CLOTHES, nunca los dos" if trajes else "") + "):"]
        lin += [f"- {t}: {nombre_de(a, 'clothes')} ({a['ficha']})" for t, a in menu["ropa"].items()]
        campos.append("CLOTHES: <Picture N o none>")
    if menu["objeto"]:
        suj = sujetos_objeto(menu)
        lin += ["", "Objetos que no cambian (aparecen en las tomas donde encajen con lo que pasa, al menos en una; en esas tomas "
                "MOMENT dice qué hace <Subject 1> con el objeto y lo nombra con su etiqueta <Subject N>):"]
        lin += [f"- {t} = {suj[t]}: {nombre_de(a, 'object')} ({a['ficha']})" for t, a in menu["objeto"].items()]
        campos.append("OBJECT: <Picture N o none>")
    if menu["lugar"]:
        lin += ["", "Lugares que no cambian (las tomas que van en uno escriben LOCATION con su referencia, y su PLACE es un rincón "
                "concreto de ese lugar; al menos una toma va en él; esas tomas no llevan BACKGROUND):"]
        lin += [f"- {t}: {nombre_de(a, 'place')} ({a['ficha']})" for t, a in menu["lugar"].items()]
        campos.append("LOCATION: <Picture N o none>")
    if menu["pose"]:
        lin += ["", "Poses de referencia (opcionales; cada una como mucho una vez; úsala solo si encaja con lo que pasa):"]
        lin += [f"- {t}: {p['ficha']}" for t, p in menu["pose"].items()]
        campos.append("POSE: <Picture N o none>")
    if menu["fondo"]:
        lin += ["", "Fondos de referencia (opcionales; úsalos solo si encajan con el lugar de la toma):"]
        lin += [f"- {t}: {p['ficha']}" for t, p in menu["fondo"].items()]
        campos.append("BACKGROUND: <Picture N o none>")
    if receta["efectos"]:
        lin += ["", "Efectos visuales (cada toma usa uno distinto; elige el que encaje con el lugar y el momento de esa toma):"]
        lin += [f"- {c}: {e[0]}" + (f" (solo en una toma donde haya: {e[2]})" if len(e) > 2 else "")
                for c, e in receta["efectos"].items()]
        campos.append("EFFECT: <código>")
    dados = [f"LOOK: {plan['look']}"] if "look" in plan["fijos"] else []
    dados += [f"ARC: {plan['arco']}"] if "arco" in plan["fijos"] else []
    inv = {v: k for k, v in HISTORIA.items()}
    for k, t in enumerate(plan["tomas"], 1):
        dados += [f"SHOT {k} {inv[c]}: {t[c] or 'none'}" for c in HISTORIA.values() if c in t.get("fijos", [])]
    if dados:
        lin += ["", "Ya lo decidió el usuario (respétalo tal cual y escribe tú el resto):"] + [f"- {d}" for d in dados]
    lin += ["", "Escribe en inglés y sin nada más: primero el arco y el look, y luego una línea por toma.",
            "ARC: <una frase: qué cambia de la primera a la última toma>",
            "LOOK: <la hora del día, la luz y la paleta de todo el edit, según la idea>",
            "SHOT <n> | " + " | ".join(campos), f"Reglas: {REGLA} {FISICA}"]
    return "\n".join(lin)


def leer_historia(texto, plan, menu, receta):
    """Lee la respuesta y la funde con el plan: lo fijado por el usuario queda encima. Devuelve {'plan', 'formato'}."""
    texto, p, formato = texto.replace("**", ""), copy.deepcopy(plan), []
    for campo, clave in (("ARC", "arco"), ("LOOK", "look")):
        m = re.search(rf"^\s*{campo}\s*:\s*(.+)$", texto, re.M | re.I)
        if clave not in p["fijos"]:
            p[clave] = m.group(1).strip().rstrip(".") if m else ""
    vistas = set()
    for m in re.finditer(r"^\s*SHOT\s*(\d+)\s*[|:]\s*(.+)$", texto, re.M | re.I):
        k = int(m.group(1))
        if not 1 <= k <= len(p["tomas"]):
            continue
        vistas.add(k)
        t = p["tomas"][k - 1]
        for trozo in m.group(2).split("|"):
            if ":" not in trozo:
                continue
            campo, valor = (s.strip() for s in trozo.split(":", 1))
            clave = HISTORIA.get(campo.upper())
            if clave and clave not in t.get("fijos", []):
                t[clave] = valor.rstrip(".")
    if vistas != set(range(1, len(p["tomas"]) + 1)):
        formato.append(f"tienen que ser exactamente {len(p['tomas'])} líneas SHOT, numeradas de 1 a {len(p['tomas'])}")
    inv = {v: c for c, v in HISTORIA.items()}
    for k, t in enumerate(p["tomas"], 1):  # normaliza etiquetas y códigos
        for clave, papel in CAMPO_PAPEL.items():
            opciones = atuendos(menu) if papel == "personaje" else menu[papel]
            if opciones:
                tag = etiqueta(t[clave], opciones)
                if tag is None:
                    formato.append(f"SHOT {k}: {inv[clave]} tiene que ser una de {', '.join(opciones)}" +
                                   ("" if papel == "personaje" and not menu["ropa"] else " o none"))
                t[clave] = tag or ""
            else:
                t[clave] = ""
        if receta["efectos"]:
            e = re.search(r"\b([A-Z]\d)\b", (t["efecto"] or "").upper())
            t["efecto"] = e.group(1) if e and e.group(1) in receta["efectos"] else ""
        else:
            t["efecto"] = ""
    return {"plan": p, "formato": formato}


def revisar_historia(datos, receta, menu):
    """plano 5 (Reglas de revisión), filas 4, 5, 9–16 y 22. Solo culpa al LLM de lo que eligió él (no de lo que fijó el usuario)."""
    p, plan = list(datos["formato"]), datos["plan"]
    for clave, campo in (("arco", "ARC"), ("look", "LOOK")):
        if clave not in plan["fijos"]:
            p += problemas_texto(plan[clave], receta, campo) if plan[clave] else [f"falta la línea {campo}"]
    # lo que el usuario fijó en cualquier toma cuenta como ya usado, también para las tomas anteriores a ella
    fijado = lambda c: [o[c] for o in plan["tomas"] if c in o.get("fijos", []) and o[c]]
    poses, efectos = fijado("pose"), fijado("efecto")
    for k, t in enumerate(plan["tomas"], 1):
        libre = lambda c: c not in t.get("fijos", [])
        for clave, campo in (("lugar", "PLACE"), ("momento", "MOMENT")):
            if libre(clave):
                p += problemas_texto(t[clave], receta, f"SHOT {k} {campo}") if t[clave] else [f"SHOT {k}: falta {campo}"]
        if libre("lugar"):  # dos tomas en el mismo lugar que no cambia sí pueden parecerse
            p += [f"SHOT {k}: el lugar se parece demasiado al de SHOT {j}; cada toma va en un lugar distinto"
                  for j, o in enumerate(plan["tomas"][:k - 1], 1) if t["lugar"] and parecido(t["lugar"], o["lugar"]) > 0.75
                  and not (t["lugar_ref"] and t["lugar_ref"] == o["lugar_ref"])]
        trajes = atuendos(menu)
        if trajes and libre("personaje"):
            if not t["personaje"] and not t["ropa"]:
                p.append(f"SHOT {k}: falta OUTFIT" + (" o CLOTHES" if menu["ropa"] else ""))
            elif t["personaje"] and k > 1 and t["personaje"] == plan["tomas"][k - 2]["personaje"] and len(trajes) > 1:
                p.append(f"SHOT {k}: repite el atuendo de la toma anterior ({t['personaje']})")
        if t["personaje"] and t["ropa"] and (libre("personaje") or libre("ropa")):
            p.append(f"SHOT {k}: lleva OUTFIT {t['personaje']} y CLOTHES {t['ropa']}; elige solo uno de los dos")
        if t["lugar_ref"] and t["fondo_ref"] and (libre("lugar_ref") or libre("fondo_ref")):
            p.append(f"SHOT {k}: lleva LOCATION {t['lugar_ref']} y BACKGROUND {t['fondo_ref']}; una toma en un lugar que no "
                     "cambia no lleva BACKGROUND")
        suj = sujetos_objeto(menu).get(t["objeto"])
        if suj and libre("momento") and suj not in t["momento"]:
            p.append(f"SHOT {k}: lleva OBJECT {t['objeto']}; MOMENT tiene que nombrarlo como {suj}")
        if t["pose"] and t["pose"] in poses and libre("pose"):
            p.append(f"SHOT {k}: repite la pose {t['pose']}")
        if libre("pose"):
            poses.append(t["pose"])
        if receta["efectos"]:
            e = t["efecto"]
            if not e and libre("efecto"):
                p.append(f"SHOT {k}: EFFECT tiene que ser uno de {', '.join(receta['efectos'])}")
            elif e and e in efectos and libre("efecto") and len(plan["tomas"]) <= len(receta["efectos"]):
                p.append(f"SHOT {k}: repite el efecto {e}")
            elif e and len(receta["efectos"][e]) > 2 and (libre("efecto") or libre("momento")):
                pide = receta["efectos"][e][2]
                visto = " ".join([t["lugar"], t["momento"], menu["pose"].get(t["pose"], {}).get("ficha", "")]).lower()
                if pide not in visto:
                    p.append(f"SHOT {k}: el efecto {e} necesita que en la toma haya «{pide}»; ponlo en MOMENT o elige otro efecto")
            if libre("efecto"):
                efectos.append(e)
    # un objeto o un lugar que no cambia tiene que salir al menos en una toma (si el LLM podía ponerlo)
    for clave, papel, campo in (("objeto", "objeto", "OBJECT"), ("lugar_ref", "lugar", "LOCATION")):
        for tag in menu[papel]:
            if all(t[clave] != tag for t in plan["tomas"]) and any(clave not in t.get("fijos", []) for t in plan["tomas"]):
                p.append(f"ninguna toma usa {campo} {tag}; ponlo al menos en una toma donde encaje")
    return p


# ------------------------------------------------------------------ taller de tomas (habitación 6)
def linea_corta(t, k):
    return f"[Shot {k}] {t['encuadre']}, {t['lugar']}, {t['luz']}: {t['gesto']}; the camera {t['camara']}"


def prompt_toma(receta, menu, plan, k, dur, vecinas):
    t, n = plan["tomas"][k - 1], len(plan["tomas"])
    lin = cabecera(receta, menu) + ["", "Historia completa (respétala):", f"ARC: {plan['arco']}",
                              f"Hora, luz y paleta de todo el edit (respétalas): {plan['look']}"]
    if plan["fondo"]:
        lin.append(f"Fondos de todo el edit: {plan['fondo']}")
    lin += [f"SHOT {j}: {o['lugar']} — {o['momento']}" for j, o in enumerate(plan["tomas"], 1)]
    escritas = [linea_corta(o, j) for j, o in enumerate(plan["tomas"], 1) if j != k and o["gesto"]]
    lin += ["", "Tomas ya escritas (no repitas sus gestos, luces ni movimientos de cámara):"] + (escritas or ["(ninguna)"])
    lin += ["", f"Ahora escribe la toma {k} de {n}. Duración: {en_palabras(dur)}.", f"- Lugar: {t['lugar']}",
            f"- Qué pasa: {t['momento']}"]
    if t["personaje"]:
        a = menu["personaje"].get(t["personaje"], {})
        lin.append(f"- Atuendo: {a.get('nombre', '')} ({a.get('ficha', '')}); no lo describas, el sistema lo cita")
    if t["ropa"]:
        a = menu["ropa"].get(t["ropa"], {})
        lin.append(f"- Ropa: {nombre_de(a, 'clothes')} ({a.get('ficha', '')}); no la describas, el sistema la cita")
    if t["lugar_ref"]:
        a = menu["lugar"].get(t["lugar_ref"], {})
        lin.append(f"- El lugar es {nombre_de(a, 'a place')} ({a.get('ficha', '')}), el mismo en todas las tomas que van en él; "
                   "el sistema lo cita")
    suj = sujetos_objeto(menu).get(t["objeto"])
    if suj:
        a = menu["objeto"][t["objeto"]]
        lin.append(f"- Objeto: {suj}, {nombre_de(a, 'an object')}; ACTION lo incluye con su etiqueta {suj} (lo sostiene, lo usa "
                   "o lo mira); no lo describas")
    if t["pose"]:
        lin.append(f"- Pose: {menu['pose'].get(t['pose'], {}).get('ficha', '')}; el gesto es esta pose")
    if t["fondo_ref"]:
        lin.append(f"- Fondo de referencia: {menu['fondo'].get(t['fondo_ref'], {}).get('ficha', '')}")
    if frase_efecto(receta, t):
        lin.append(f"- Efecto (el sistema añade esta frase tal cual; tu luz no debe contradecirla): {frase_efecto(receta, t)}")
    for nombre, j in vecinas:
        o = plan["tomas"][j - 1]
        if o["encuadre"] or o["camara"]:
            lin.append(f"- La toma {nombre} usa el encuadre «{o['encuadre']}» y la cámara «{o['camara']}»: usa otros distintos")
    inv = {v: c for c, v in DIRECCION.items()}
    dados = [f"{inv[c]}: {t[c]}" for c in DIRECCION.values() if c in t.get("fijos", [])]
    if dados:
        lin += ["", "Ya lo decidió el usuario (respétalo tal cual y escribe tú el resto):"] + [f"- {d}" for d in dados]
    lin += ["", "Responde en inglés, solo estas cuatro líneas:",
            "FRAMING: <elige UNA sola: extreme close-up, close-up o medium close-up>",
            "LIGHT: <de dónde viene la luz en esta toma y cómo cae sobre ella, en pocas palabras; la paleta general ya está dicha>",
            f"ACTION: <empieza con un verbo en presente: un gesto de <Subject 1> ({receta['pronombre']}) con una parte del cuerpo "
            "o un objeto>",
            "CAMERA: <qué hace la cámara, empezando con un verbo; por ejemplo pushes in, holds still, drifts sideways, tilts up, "
            "slowly zooms in>",
            f"Reglas: {REGLA} {FISICA} No describas su cara, su pelo ni su ropa."]
    return "\n".join(lin)


def leer_toma(texto, receta, t):
    """Lee las cuatro líneas y las funde con la toma: lo fijado por el usuario queda encima."""
    texto, d = texto.replace("**", ""), {}
    for campo, clave in DIRECCION.items():
        m = re.search(rf"^\s*{campo}\s*:\s*(.+)$", texto, re.M | re.I)
        d[clave] = m.group(1).strip().rstrip(".") if m else ""
    d["encuadre"] = re.sub(r"\s+", " ", d["encuadre"].lower().replace("close up", "close-up")).strip(" <>")
    # el gesto va detrás de "<Subject 1>" y la cámara detrás de "the camera": si el LLM los repitió delante, se quitan
    a = re.sub(rf"^(?:<Subject 1>|{receta['nombre']}|{receta['pronombre']})\s+", "", d["gesto"], flags=re.I)
    d["gesto"] = a[:1].lower() + a[1:] if not a.startswith("<") else a
    c = re.sub(r"^(?:the\s+)?camera\s+", "", d["camara"], flags=re.I)
    d["camara"] = c[:1].lower() + c[1:]
    for clave in DIRECCION.values():
        if clave in t.get("fijos", []):
            d[clave] = t[clave]
    return d


def revisar_toma(d, receta, plan, k, vecinas, fijos, menu=None):
    """plano 5 (Reglas de revisión), filas 6–13, 15, 17, 21 y 27. Solo culpa al LLM de lo que eligió él."""
    libre = lambda c: c not in fijos
    p = [] if d["encuadre"] in ENCUADRES or not libre("encuadre") else [
        f"FRAMING tiene que ser exactamente una de estas: {', '.join(ENCUADRES)} (escribiste «{d['encuadre']}»)"]
    suj = sujetos_objeto(menu).get(plan["tomas"][k - 1]["objeto"]) if menu else None
    if suj and libre("gesto") and suj not in d["gesto"]:
        p.append(f"ACTION tiene que incluir el objeto con su etiqueta {suj}")
    for clave, campo in (("luz", "LIGHT"), ("gesto", "ACTION"), ("camara", "CAMERA")):
        if libre(clave):
            p += problemas_texto(d[clave], receta, campo) if d[clave] else [f"falta {campo}"]
    if libre("luz") and len(d["luz"].split()) > 15:
        p.append("LIGHT es demasiado larga: en pocas palabras")
    if libre("gesto") and len(d["gesto"].split()) > 25:
        p.append("ACTION es demasiado larga: un solo gesto, en una frase corta")
    if libre("gesto") and d["gesto"]:
        p += [f"ACTION se parece demasiado a la de la toma {j}; cambia el gesto"
              for j, o in enumerate(plan["tomas"], 1) if j != k and o["gesto"] and parecido(d["gesto"], o["gesto"]) > 0.6]
    for _, j in vecinas:
        o = plan["tomas"][j - 1]
        if libre("encuadre") and o["encuadre"] and d["encuadre"] == o["encuadre"]:
            p.append(f"FRAMING es igual al de la toma {j} ({o['encuadre']}); usa otro encuadre")
        if libre("camara") and o["camara"] and d["camara"] and parecido(d["camara"], o["camara"]) > 0.7:
            p.append(f"CAMERA es igual a la de la toma {j} ({o['camara']}); usa otro movimiento de cámara")
    return p


# ------------------------------------------------------------------ montaje (habitación 7)
def mmss(t):
    return f"00:{t:06.3f}"


def montar(receta, menu, plan, ini, palabras):
    """Plan → prompt H3 (6 secciones). Devuelve (prompt, avisos); un campo vacío sale como […] y queda en avisos."""
    avisos, falta = [], lambda v, que: v or (avisos.append(que) or "[…]")
    personajes = list(menu["personaje"])
    lineas = []
    for k, t in enumerate(plan["tomas"], 1):
        t0 = ini[k - 1]
        citas = []
        if t["personaje"] and menu["personaje"].get(t["personaje"], {}).get("nombre"):
            citas.append(f"wearing {receta['posesivo']} {menu['personaje'][t['personaje']]['nombre']} from {t['personaje']}")
        if t["ropa"] in menu["ropa"]:  # 💡 cita de la ropa prestada (probada solo en la prueba Teto + ropa de Vera)
            citas.append(f"wearing the {nombre_de(menu['ropa'][t['ropa']], 'clothes')} from {t['ropa']}")
        if t["pose"]:
            citas.append(f"in the pose of {t['pose']}")
        lugar = re.sub(r"^(A|An|The)\b", lambda m: m.group(1).lower(), falta(t["lugar"], f"toma {k}: sin lugar"))
        if t["lugar_ref"] in menu["lugar"]:  # 💡 lugar que no cambia: sin probar en un render
            lugar += f", in the {nombre_de(menu['lugar'][t['lugar_ref']], 'place')} shown in {t['lugar_ref']}"
        if t["fondo_ref"]:
            lugar += f" like the place in {t['fondo_ref']}"
        encuadre = falta(t["encuadre"], f"toma {k}: sin encuadre").capitalize()
        s = (f"[Shot {k}] At {mmss(t0)} {encuadre}, {lugar}, {falta(t['luz'], f'toma {k}: sin luz')}: <Subject 1>" +
             (", " + " and ".join(citas) + "," if citas else "") +
             f" {falta(t['gesto'], f'toma {k}: sin gesto')}; the camera {falta(t['camara'], f'toma {k}: sin cámara')}.")
        if frase_efecto(receta, t):
            s += f" Effect: {frase_efecto(receta, t)}."
        if k in palabras:
            s += (f' At {mmss(t0 + 0.15)} the words "{palabras[k]}" appear {receta["texto_estilo"]}, beside <Subject 1>, '
                  f"never covering {receta['posesivo']} face.")
        lineas.append(s)
    retencion = [receta["retencion"].replace("{personajes}", lista(personajes))]
    objetos = sujetos_objeto(menu)
    for tag, suj in objetos.items():  # 💡 frases nuevas, sin probar en un render
        retencion.append(f"{suj}: fully_preserved - the shape, colors, materials and markings of the "
                         f"{nombre_de(menu['objeto'][tag], 'object')} from {tag} wherever it appears.")
    for tag, a in menu["lugar"].items():  # 💡
        retencion.append(f"{tag}: fully_preserved - the {nombre_de(a, 'place')}: its layout, architecture, colors and light "
                         "fixtures stay the same in every shot set there; any person in it is not transferred.")
    for tag, a in menu["ropa"].items():  # probada con la ropa de Vera sobre la cajita de Teto (24 oct)
        ropa = a["ficha"] if a["ficha"] and len(a["ficha"].split()) <= 20 else nombre_de(a, "")
        retencion.append(f"{tag}: attribute_transfer - only the clothes are transferred" + (f" ({ropa.rstrip('.')})" if ropa else "") +
                         "; that person's face, hair and body are not transferred.")
    if menu["pose"]:
        retencion.append(f"{lista(menu['pose'])}: attribute_transfer - only the body pose; that girl's face, hair and clothes "
                         "are not transferred.")
    if menu["fondo"]:
        retencion.append(f"{lista(menu['fondo'])}: attribute_transfer - only the place and its background are transferred; "
                         "any person in it is not transferred.")
    if menu["estilo"]:
        retencion.append(f"{lista(menu['estilo'])}: attribute_transfer - only the visual style is transferred.")
    retencion.append(receta["retencion_audio"])
    texto = ("The only text on screen is " + " and ".join(f'"{w}" in shot {k}' for k, w in sorted(palabras.items())) + "."
             if palabras else "No text on screen.")
    estilo = receta["estilo_prompt"] + " " + falta(plan["look"], "sin look (luz general)") + "."
    if plan["fondo"]:
        estilo += f" Backgrounds: {plan['fondo'].rstrip('.')}."
    if menu["estilo"]:
        estilo += f" Visual style of {lista(menu['estilo'])}."
    sujeto = receta["sujeto"].replace("{personajes}", lista(personajes))
    if receta.get("sujeto_atuendo") and (atuendos(menu) or menu["ropa"]):
        sujeto += " " + receta["sujeto_atuendo"]
    for tag, suj in objetos.items():  # 💡
        sujeto += (f"\n{suj} is the {nombre_de(menu['objeto'][tag], 'object')} shown in {tag}; it is the same object in every "
                   "shot where it appears.")
    prompt = ("subject_definitions:\n" + sujeto + "\n" + receta["audio"] +
              "\n\nsummary:\n[reference generation + audio reference] " + receta["resumen"] + ": " +
              falta(plan["arco"], "sin arco").rstrip(".") + "." +
              "\n\nretention_analysis:\n" + "\n".join(retencion) +
              "\n\ndetailed_description:\n" + estilo + " " + texto + "\n" + "\n".join(lineas) +
              "\n\noverall_soundscape:\nOnly the music of <Audio 1>, unchanged, with no dialogue and no added sound effects."
              "\n\nnon_diegetic_music:\nThe song in <Audio 1> plays unchanged throughout the whole video.")
    return prompt, avisos


# ------------------------------------------------------------------ visión: ficha de una referencia
# El papel lo pone el usuario: con él, Qwen acierta mucho más (estudio experimentos_edit/nombrar_refmods/INFORME.md).
VISION = {
    "personaje": "This image is an outfit reference for the main character. Give a 2-5 word English name for the outfit "
                 "(for example 'school uniform') and one short English sentence listing only the visible clothes and accessories.",
    "objeto": "This image is a reference of an object or product that must look the same in every shot. Give a 2-4 word "
              "English name for it (for example 'red soda can') and one short English sentence describing only its shape, "
              "colors, materials and markings.",
    "lugar": "This image is a reference of a place that must stay the same in every shot set there. Give a 2-4 word English "
             "name for the place (for example 'neon arcade street') and one short English sentence describing its main "
             "structures, objects, light and colors.",
    "ropa": "This image is a clothing reference: only the clothes will be used, the person wearing them does not matter. "
            "Give a 2-5 word English name for the outfit (for example 'red racing jacket') and one short English sentence "
            "listing only the visible clothes and accessories.",
    "pose": "This image is a pose reference. In one short English sentence describe the person's body pose, what the hands "
            "hold and the place, like: 'a girl waving with one arm raised high, caught mid-step on a night crosswalk'. "
            "The name is 2-4 words.",
    "fondo": "This image is a background reference. In one short English sentence describe only the place: its main objects, "
             "light and colors. The name is 2-4 words.",
    "estilo": "This image is a style reference. In one short English sentence describe only the visual style: drawing "
              "technique, line, color and texture. The name is 2-4 words.",
}
RIESGOS = ("Also list what a video model could copy by mistake: visible signature, watermark, readable text, logo, blurred "
           "or hidden face, black bars, frame or border. Empty list if there is none.")


def describir_imagen(jpeg_b64, papel):
    """Qwen con visión propone nombre, ficha y riesgos de una referencia. Devuelve {'nombre', 'ficha', 'riesgos'}."""
    esquema = {"type": "object", "required": ["nombre", "ficha", "riesgos"], "properties": {
        "nombre": {"type": "string"}, "ficha": {"type": "string"}, "riesgos": {"type": "array", "items": {"type": "string"}}}}
    pregunta = VISION.get(papel, VISION["pose"]) + " " + RIESGOS + " Answer as JSON with: nombre, ficha, riesgos."
    cuerpo = {"model": MODELO, "temperature": 0.2, "max_tokens": 1500, "chat_template_kwargs": {"reasoning_effort": "low"},
              "response_format": {"type": "json_schema", "json_schema": {"name": "ref", "schema": esquema}},
              "messages": [{"role": "user", "content": [
                  {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{jpeg_b64}"}},
                  {"type": "text", "text": pregunta}]}]}
    reg, t = registro_nuevo(f"vision_{papel}"), time.time()
    pet = urllib.request.Request(URL, json.dumps(cuerpo).encode(), {"Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(pet, timeout=300).read())
    ULTIMA_LLAMADA[0] = time.time()
    texto = r["choices"][0]["message"].get("content") or ""
    reg.guardar("vision", [{"role": "user", "content": pregunta}], texto, time.time() - t,
                r["choices"][0].get("finish_reason"), r.get("timings", {}).get("predicted_n"))
    m = re.search(r"\{.*\}", texto, re.S)
    d = json.loads(m.group(0) if m else texto)
    return {"nombre": str(d.get("nombre", "")).strip()[:60], "ficha": str(d.get("ficha", "")).strip()[:300],
            "riesgos": [str(x).strip() for x in d.get("riesgos", []) if str(x).strip()][:5],
            "segundos": round(time.time() - t, 1)}


# ------------------------------------------------------------------ acciones (las usan el nodo y el editor)
def contexto(nombre_receta, entradas, plan, beats):
    """Lo que necesitan todas las acciones: receta, menú, plan con n tomas, cortes, duraciones y palabras."""
    receta = cargar_recetas()[nombre_receta]
    n, dur = int(entradas["tomas"]), float(entradas["duracion"])
    if n * 0.4 > dur:
        raise ValueError(f"{n} tomas no caben en {dur} s (cada toma necesita al menos 0,4 s).")
    ini, durs = duraciones(n, dur, beats)
    return receta, menu_de(receta, entradas.get("refs")), ajustar_plan(plan, n), ini, durs, leer_palabras(entradas.get("palabras"), n)


def escribir_historia(nombre_receta, entradas, plan, beats=None, semilla=0, reg=None):
    """Historia (1 llamada, razonamiento low): arco, look y, por toma, lugar, momento, personaje, pose, fondo y efecto.
    Respeta lo fijado. Devuelve (plan, intentos)."""
    receta, menu, plan, ini, durs, palabras = contexto(nombre_receta, entradas, plan, beats)
    if not (entradas.get("idea") or "").strip():
        raise ValueError("Falta la idea.")
    reg = reg or registro_nuevo("historia")
    datos, intentos = conversar(reg, "historia", prompt_historia(receta, menu, plan, entradas["idea"].strip(), durs, palabras),
                                lambda x: leer_historia(x, plan, menu, receta), lambda x: revisar_historia(x, receta, menu),
                                INTENTOS_HISTORIA, True, semilla, 6144)
    for t in datos["plan"]["tomas"]:  # la dirección anterior ya no encaja con la historia nueva (salvo lo fijado)
        t.update({c: "" for c in [*DIRECCION.values(), "efecto_frase"] if c not in t.get("fijos", [])})
    return datos["plan"], intentos


def escribir_tomas(nombre_receta, entradas, plan, beats=None, semilla=0, solo=None, reg=None, aviso=None):
    """Encuadre, luz, gesto y cámara (1 llamada por toma, sin razonamiento). `solo`: regenera solo esa toma, mirando a
    sus dos vecinas. Respeta lo fijado. Devuelve (plan, intentos por toma)."""
    receta, menu, plan, ini, durs, palabras = contexto(nombre_receta, entradas, plan, beats)
    faltan = [k for k, t in enumerate(plan["tomas"], 1) if not t["lugar"] or not t["momento"]]
    if faltan:
        raise ValueError(f"Primero hace falta la historia: las tomas {faltan} no tienen lugar o momento.")
    reg = reg or registro_nuevo("tomas" if solo is None else f"toma{solo}")
    n, hechas = len(plan["tomas"]), {}
    if solo is None:  # pasada completa: lo no fijado se escribe de nuevo, sin mirar versiones viejas
        for t in plan["tomas"]:
            t.update({c: "" for c in DIRECCION.values() if c not in t.get("fijos", [])})
    for k in ([solo] if solo else range(1, n + 1)):
        t = plan["tomas"][k - 1]
        # en una pasada completa la siguiente aún no está escrita: solo cuenta si el usuario fijó algo en ella
        siguiente = k < n and (solo or {"encuadre", "camara"} & set(plan["tomas"][k].get("fijos", [])))
        vecinas = ([("anterior", k - 1)] if k > 1 else []) + ([("siguiente", k + 1)] if siguiente else [])
        fijos = set(t.get("fijos", []))
        d, it = conversar(reg, f"toma{k}", prompt_toma(receta, menu, plan, k, durs[k - 1], vecinas),
                          lambda x, t=t: leer_toma(x, receta, t),
                          lambda x, k=k, v=vecinas, f=fijos: revisar_toma(x, receta, plan, k, v, f, menu),
                          INTENTOS_TOMA, False, semilla + k, 300)
        t.update(d)
        hechas[k] = it
        if aviso:
            aviso(k, n, f"toma {k}/{n} lista ({it} intento/s)")
    return plan, hechas


def montar_plan(nombre_receta, entradas, plan, beats=None):
    receta, menu, plan, ini, durs, palabras = contexto(nombre_receta, entradas, plan, beats)
    prompt, avisos = montar(receta, menu, plan, ini, palabras)
    return prompt, avisos, ini


def planear(nombre_receta, idea, n, dur, palabras_txt="", semilla=0, beats=None, avance=None, antes_del_llm=None):
    """Recorrido completo del nodo sin editor: idea → prompt H3. Devuelve (prompt, informe, llamó_al_llm).
    avance(paso, total, texto) se llama después de cada etapa; antes_del_llm() justo antes de la primera llamada."""
    receta, idea = cargar_recetas()[nombre_receta], idea.strip()
    if not idea:
        raise ValueError("Falta la idea.")
    entradas = {"idea": idea, "tomas": n, "duracion": dur, "palabras": palabras_txt, "refs": None}
    ini = cortes(n, dur, beats)
    # despensa: mismas entradas, misma receta, mismo código y misma semilla → mismo prompt, sin llamar al LLM
    huella = hashlib.sha1(json.dumps([CODIGO, receta, idea, n, round(dur, 3), leer_palabras(palabras_txt, n), semilla, ini],
                                     sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:10]
    hecho = sorted(glob.glob(os.path.join(CORRIDAS, f"*_{huella}", "prompt_final.txt")))
    if hecho:
        with open(hecho[-1]) as f:
            return f.read(), f"Reutilizado de disco (mismas entradas y semilla): {os.path.dirname(hecho[-1])}", False
    if not llm_vivo():
        raise RuntimeError(f"El LLM no responde en {URL} (servicio llama-qwen38: systemctl --user start llama-qwen38).")
    if antes_del_llm:
        antes_del_llm()
    aviso = avance or (lambda paso, total, texto: print(f"[{paso}/{total}] {texto}", flush=True))
    reg = Registro(os.path.join(CORRIDAS, time.strftime("%Y%m%d_%H%M%S") + "_" + huella))
    t0 = time.time()
    plan, ih = escribir_historia(nombre_receta, entradas, plan_vacio(n), beats, semilla, reg)
    t_historia = time.time() - t0
    aviso(1, n + 1, f"historia lista ({ih} intento/s, {t_historia:.0f} s)")
    plan, _ = escribir_tomas(nombre_receta, entradas, plan, beats, semilla, reg=reg,
                             aviso=lambda k, total, texto: aviso(k + 1, total + 1, texto))
    prompt, avisos, ini = montar_plan(nombre_receta, entradas, plan, beats)
    total = time.time() - t0
    with open(os.path.join(reg.carpeta, "prompt_final.txt"), "w") as f:
        f.write(prompt)
    with open(os.path.join(reg.carpeta, "plan.json"), "w") as f:
        json.dump({"entradas": {**entradas, "receta": nombre_receta, "semilla": semilla, "beats": beats}, "cortes": ini,
                   "plan": plan, "llamadas": reg.llamadas, "problemas": reg.problemas, "segundos": round(total, 1),
                   "huella": huella, "fecha": time.strftime("%Y-%m-%d %H:%M:%S")}, f, ensure_ascii=False, indent=1)
    revision = "; ".join(f"{x['paso']} intento {x['intento']}: {' / '.join(x['problemas'])}" for x in reg.problemas)
    informe = (f"Receta {nombre_receta} · {n} tomas en {dur:.3f} s · semilla {semilla}\n"
               f"Cortes: {' · '.join(f'{t:.3f}' for t in ini)}\n"
               f"{len(reg.llamadas)} llamadas en {total:.0f} s (historia {t_historia:.0f} s, tomas {total - t_historia:.0f} s)\n"
               f"Revisión: {revision or 'todo pasó a la primera'}\n"
               f"Carpeta: {reg.carpeta}")
    return prompt, informe, True


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Prueba el núcleo sin ComfyUI (planos/6 Cambiar sin romper.md).")
    ap.add_argument("--receta", required=True)
    ap.add_argument("--idea", required=True)
    ap.add_argument("--tomas", type=int, default=6)
    ap.add_argument("--duracion", type=float, default=5.167)
    ap.add_argument("--palabras", default="", help="ej.: 'TO YOU @1' (varias separadas por ;)")
    ap.add_argument("--semilla", type=int, default=0)
    ap.add_argument("--audio", help="wav para poner los cortes en sus beats (sin él, cortes parejos)")
    a = ap.parse_args()
    prompt, informe, _ = planear(a.receta, a.idea, a.tomas, a.duracion, a.palabras, a.semilla,
                                 beats_de_archivo(a.audio) if a.audio else None)
    print(prompt + "\n\n" + informe)
