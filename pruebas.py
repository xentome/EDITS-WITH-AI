"""Comprobaciones rápidas, sin LLM ni ComfyUI (unos segundos). Córrelas después de cada cambio:

    ~/ComfyUI-CLI/.venv/bin/python ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm/pruebas.py

Si cambias a propósito cómo se monta el prompt, la prueba 1 fallará: revisa la diferencia y, si es la que querías,
regenera la referencia con  pruebas.py --nueva-referencia
"""
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import nucleo as N  # noqa: E402

fallos = []


def _falla(f):
    """True si f() lanza un error (lo que debe pasar con una entrada que no vale)."""
    try:
        f()
    except Exception:
        return True
    return False


def comprobar(nombre, condicion, detalle=""):
    print(("  ok   " if condicion else "  FALLA") + f" {nombre}" + ("" if condicion else f" → {detalle}"))
    if not condicion:
        fallos.append(nombre)


ref = json.load(open(os.path.join(AQUI, "pruebas", "plan_teto.json")))
esperado_txt = os.path.join(AQUI, "pruebas", "prompt_teto.txt")
menu = N.menu_de(ref["entradas"]["refs"])
perfil = N.perfil_de(menu, ref["entradas"])

print("1 · Montaje (plan guardado → prompt)")
prompt, avisos, ini = N.montar_plan(ref["entradas"], ref["plan"], ref["beats"])
if "--nueva-referencia" in sys.argv:
    open(esperado_txt, "w").write(prompt)
    print("  referencia regenerada")
comprobar("el prompt es idéntico a la referencia", prompt == open(esperado_txt).read(), "mira la diferencia con difflib")
comprobar("sin huecos", not avisos, avisos)
comprobar("cortes en los beats", ini == [0.0, 0.755, 1.846, 2.392, 3.483, 4.551], ini)

print("2 · Candados (lo fijado por el usuario no lo cambia el LLM)")
plan = N.ajustar_plan(ref["plan"], 6)
plan["tomas"][1].update(lugar="a quiet river bridge", fijos=["lugar"])
plan["tomas"][3].update(pose="<Picture 5>", fijos=["pose"])
resp = "ARC: a calm walk\nLOOK: Night, warm neon\n" + "\n".join(
    f"SHOT {k} | PLACE: street {chr(96 + k)} | MOMENT: she smiles | OUTFIT: <Picture {1 + k % 2}> | "
    f"POSE: {'<Picture 5>' if k == 2 else 'none'} | EFFECT: {['E1', 'E2', 'E3', 'E4', 'E6', 'E6'][k - 1]}" for k in range(1, 7))
datos = N.leer_historia(resp, plan, menu)
comprobar("lugar fijado se conserva", datos["plan"]["tomas"][1]["lugar"] == "a quiet river bridge")
comprobar("pose fijada se conserva", datos["plan"]["tomas"][3]["pose"] == "<Picture 5>")
problemas = N.revisar_historia(datos, perfil, menu)
comprobar("detecta la pose repetida contra un candado", "SHOT 2: repite la pose <Picture 5>" in problemas, problemas)
comprobar("detecta el efecto repetido en tomas seguidas",
          "SHOT 6: repite el efecto E6 de la toma anterior; elige otro o none" in problemas, problemas)
t = {**N.toma_vacia(), "encuadre": "close-up", "fijos": ["encuadre"]}
d = N.leer_toma("FRAMING: medium close-up\nLIGHT: neon\nACTION: waves\nCAMERA: the camera holds still", perfil, t)
comprobar("encuadre fijado se conserva en la toma", d["encuadre"] == "close-up", d)
comprobar("quita 'the camera' del inicio", d["camara"] == "holds still", d)

print("3 · Revisión de una toma (fallos ya vistos)")
d = N.leer_toma("FRAMING: extreme close-up | close-up | medium close-up\nLIGHT: warm glow\n"
                "ACTION: She lies on the wet floor\nCAMERA: holds still", perfil, N.toma_vacia())
p = N.revisar_toma(d, perfil, plan, 1, [], set())
comprobar("rechaza copiar el menú de encuadres", any(x.startswith("FRAMING tiene que ser") for x in p), p)
comprobar("rechaza tumbada / mojado / suelo", sum("da problemas" in x for x in p) >= 2, p)
comprobar("quita el sujeto del inicio del gesto", d["gesto"].startswith("lies"), d["gesto"])
comprobar("rechaza el pronombre contrario (Teto es she)",
          any("usa «his»; Teto es she" in x for x in N.problemas_texto("raises his hand", perfil, "ACTION")))

print("4 · Efectos: referencias de papel efecto y efectos de texto")
comprobar("el LLM elige el efecto por su etiqueta (E2, <Picture N>) y se normaliza",
          N.etiqueta("E2", menu["efecto"]) == "E2" and N.etiqueta("effect e7", menu["efecto"]) == "E7" and
          N.etiqueta("G1", menu["efecto"]) is None and N.etiqueta("none", menu["efecto"]) == "")
plan4 = N.ajustar_plan(ref["plan"], 6)
for t in plan4["tomas"]:
    t["efecto"] = "E1"
p4 = N.revisar_historia({"plan": plan4, "formato": []}, perfil, menu)
comprobar("con más efectos que tomas no exige usarlos todos", not any(x.startswith("ninguna toma usa EFFECT") for x in p4), p4)
comprobar("la historia ofrece los efectos del usuario con su ficha",
          "- E5: luz de móvil y círculos de luz de la ciudad (her face lit only by the cold blue glow" in
          N.prompt_historia(perfil, menu, plan4, "idea", [1] * 6, {}))

print("5 · Frase de efecto escrita por el usuario")
plan3 = N.ajustar_plan(ref["plan"], 6)
plan3["tomas"][0].update(efecto_frase="pink heart confetti falling around <Subject 1>.", fijos=["efecto_frase"])
p3, _, _ = N.montar_plan(ref["entradas"], plan3, ref["beats"])
comprobar("la frase propia sustituye a la ficha del efecto", "Effect: pink heart confetti falling around <Subject 1>." in p3
          and "hand-drawn white and colored doodles" not in p3.split("[Shot 2]")[0].split("[Shot 1]")[1])
plan3["tomas"][1].update(efecto="", efecto_frase="soft film grain")
p3, _, _ = N.montar_plan(ref["entradas"], plan3, ref["beats"])
comprobar("efecto solo de texto escrito en la toma", "Effect: soft film grain." in p3)
plan3["tomas"][2].update(efecto="U3", efecto_frase="")
p3, _, _ = N.montar_plan(ref["entradas"], plan3, ref["beats"])
comprobar("un efecto viejo de receta (U3) ya no pega ninguna frase", "Effect:" not in p3.split("[Shot 3]")[1].split("[Shot 4]")[0])

print("6 · Palabras en pantalla")
comprobar("lee 'TO YOU @1; PEAK @ultima'", N.leer_palabras("TO YOU @1; PEAK @ultima", 6) == {1: "TO YOU", 6: "PEAK"})
comprobar("el estilo de las palabras sale del campo y, vacío, es neutro",
          'the words "TO YOU" appear in a bold retro sans-serif font' in prompt and
          N.perfil_de(menu, {})["texto_estilo"] == N.TEXTO_ESTILO)

print("7 · Papeles: personaje en <Video N>, ropa, objeto y lugar")
refs7 = {"<Video 1>": {"papel": "personaje", "nombre": "Teto", "pronombre": "she",
                       "ficha": "anime girl, bright red hair in two big drill-shaped twin tails"},
         "<Picture 1>": {"papel": "ropa", "nombre": "red racing jacket", "ficha": "red racing jacket with patches, black pants"},
         "<Picture 2>": {"papel": "objeto", "nombre": "red soda can", "ficha": "a red soda can with a white logo"},
         "<Picture 3>": {"papel": "lugar", "nombre": "night arcade street", "ficha": "a covered arcade street with lanterns"},
         "<Picture 4>": {"papel": "fondo", "nombre": "", "ficha": "a park"}}
e7 = {**ref["entradas"], "tomas": 3, "duracion": 5.0, "palabras": "", "refs": refs7}
m7 = N.menu_de(refs7)
pf7 = N.perfil_de(m7, e7)
plan7 = N.ajustar_plan(None, 3)
for k, t in enumerate(plan7["tomas"], 1):
    t.update(lugar=f"corner {k}", momento="she smiles", encuadre="close-up", luz="neon", gesto="smiles", camara="holds still")
plan7["tomas"][0].update(ropa="<Picture 1>", objeto="<Picture 2>", gesto="raises <Subject 2> to her lips")
plan7["tomas"][1].update(lugar_ref="<Picture 3>")
p7, av7, _ = N.montar_plan(e7, plan7)
comprobar("el personaje sale de su referencia: nombre y ficha en la definición, y su retención",
          "<Subject 1> is the character in <Video 1>: anime girl, bright red hair in two big drill-shaped twin tails. "
          "Her name is Teto. In each shot she wears the outfit of the reference cited for that shot." in p7 and
          "<Subject 1>: fully_preserved - Teto's face, hair and features from <Video 1> stay the same in every shot." in p7, p7[:500])
comprobar("ropa: cita en la toma y retención solo de la ropa",
          "<Subject 1>, wearing the red racing jacket from <Picture 1>," in p7 and
          "<Picture 1>: attribute_transfer - only the clothes are transferred (red racing jacket with patches, black pants); "
          "that person's face, hair and body are not transferred." in p7)
comprobar("objeto: es <Subject 2>, definido y retenido",
          "<Subject 2> is the red soda can shown in <Picture 2>" in p7 and "<Subject 2>: fully_preserved" in p7)
comprobar("lugar: fija el lugar de su toma y se retiene",
          "corner 2, in the night arcade street shown in <Picture 3>," in p7 and "<Picture 3>: fully_preserved - the night arcade" in p7)
comprobar("sin atuendos no se pide OUTFIT", not N.atuendos(m7) and N.etiqueta("Video 1", m7["personaje"]) == "<Video 1>")
plan7b = N.ajustar_plan(plan7, 3)
plan7b["tomas"][0].update(objeto="", momento="she smiles")
plan7b["tomas"][1].update(lugar_ref="", fondo_ref="<Picture 4>")
plan7b["tomas"][2].update(objeto="<Picture 2>", lugar_ref="<Picture 3>", fondo_ref="<Picture 4>")
plan7b["arco"], plan7b["look"] = "a calm walk", "night, warm neon"
p7b = N.revisar_historia({"plan": plan7b, "formato": []}, pf7, m7)
comprobar("revisa objeto sin <Subject 2> en MOMENT y LOCATION con BACKGROUND",
          "SHOT 3: lleva OBJECT <Picture 2>; MOMENT tiene que nombrarlo como <Subject 2>" in p7b and
          any(x.startswith("SHOT 3: lleva LOCATION <Picture 3> y BACKGROUND") for x in p7b), p7b)
plan7b["tomas"][2].update(objeto="", lugar_ref="")
p7b = N.revisar_historia({"plan": plan7b, "formato": []}, pf7, m7)
comprobar("un objeto o lugar que no cambia tiene que salir en alguna toma",
          "ninguna toma usa OBJECT <Picture 2>; ponlo al menos en una toma donde encaje" in p7b and
          "ninguna toma usa LOCATION <Picture 3>; ponlo al menos en una toma donde encaje" in p7b, p7b)
d7 = N.leer_toma("FRAMING: close-up\nLIGHT: neon\nACTION: drinks from the can\nCAMERA: holds still", pf7, N.toma_vacia())
plan7["tomas"][2]["objeto"] = "<Picture 2>"
comprobar("la toma con objeto pide <Subject 2> en ACTION",
          "ACTION tiene que incluir el objeto con su etiqueta <Subject 2>" in N.revisar_toma(d7, pf7, plan7, 3, [], set(), m7))

print("8 · Sin recetas: personaje, estilo y efectos a la vista")
comprobar("estilo del campo: va al LLM y a la línea de estilo y al resumen",
          "Estilo de todo el edit (lo escribió el usuario; respétalo): Flat 2D anime illustration" in
          N.prompt_historia(perfil, menu, ref["plan"], "idea", [1] * 6, {}) and
          "detailed_description:\nFlat 2D anime illustration, Japanese city pop, flat painted backgrounds. Night and dusk" in prompt
          and "A music edit of <Subject 1> (Flat 2D anime illustration" in prompt)
e10 = {**e7, "estilo": "", "refs": {}}
plan10 = {**N.ajustar_plan(plan7, 3), "look": "night, warm neon"}
p10, _, _ = N.montar_plan(e10, plan10)
pf10 = N.perfil_de(N.menu_de({}), e10)
comprobar("sin estilo ni referencias: línea neutra, sujeto genérico y they",
          "detailed_description:\nnight, warm neon. No text on screen." in p10 and
          "<Subject 1> is the main character." in p10 and "Estilo" not in "\n".join(N.cabecera(pf10, N.menu_de({}))) and
          pf10["pronombre"] == "they" and pf10["revisar_pronombre"] == "" and "A music edit of <Subject 1>, close shots" in p10,
          p10[:300])
refs10 = {**refs7, "<Video 2>": {"papel": "personaje", "nombre": "Ren", "pronombre": "he", "ficha": "young man, spiky dark hair"},
          "<Picture 5>": {"papel": "personaje", "nombre": "teto", "pronombre": "", "ficha": "", "atuendo": "school uniform"}}
m10 = N.menu_de(refs10)
ps10 = N.personajes(m10)
comprobar("un sujeto por personaje, juntando sus referencias por nombre; los objetos van detrás",
          [(g["sujeto"], g["nombre"], g["tags"]) for g in ps10] == [("<Subject 1>", "Teto", ["<Video 1>", "<Picture 5>"]),
                                                                     ("<Subject 2>", "Ren", ["<Video 2>"])] and
          N.sujetos_objeto(m10) == {"<Picture 2>": "<Subject 3>"} and N.perfil_de(m10)["revisar_pronombre"] == "", ps10)
comprobar("el pronombre por defecto es they (they wear)",
          N.perfil_de(N.menu_de({"<Video 1>": {"papel": "personaje", "nombre": "Aoi"}}))["lleva"] == "wear")
refs11 = {**refs7, "<Picture 6>": {"papel": "efecto", "nombre": "light streaks", "ficha": "neon light streaks cross the frame"},
          "E1": {"papel": "efecto", "nombre": "grano", "ficha": "soft film grain"}}
plan11 = N.ajustar_plan(plan7, 3)
plan11["tomas"][0]["efecto"], plan11["tomas"][1]["efecto"] = "<Picture 6>", "E1"
p11, _, _ = N.montar_plan({**e7, "refs": refs11}, plan11)
comprobar("efecto como referencia: su ficha tal cual, su cita y su retención; el de texto, solo la ficha",
          "Effect: neon light streaks cross the frame, like the effect in <Picture 6>." in p11 and
          "<Picture 6>: attribute_transfer - only the visual effect is transferred" in p11 and
          "Effect: soft film grain." in p11 and "E1:" not in p11, p11)
plan11["tomas"][2]["efecto"] = ""
plan11["tomas"][0]["efecto"] = ""
p11b = N.revisar_historia({"plan": {**plan11, "arco": "a", "look": "b"}, "formato": []}, pf7, N.menu_de(refs11))
comprobar("cada efecto del usuario sale en alguna toma si caben", "ninguna toma usa EFFECT <Picture 6>; ponlo al menos en una "
          "toma donde encaje" in p11b, p11b)
estado = {"v": 4, "refs": {"cajitas/teto": {"papel": "personaje", "nombre": "Teto"}, "ropa/vera": {"papel": "ropa"}},
          "etiquetas": {"<Video 1>": "cajitas/teto", "<Picture 1>": "ropa/vera"}, "efectos": {"E1": {"nombre": "x", "ficha": "y"}},
          "estilo": "flat anime", "receta": "Teto city pop"}
ee = N.entradas_de_estado(estado)
comprobar("el nodo sin editor lee del estado las referencias, los efectos y el estilo (la receta se ignora)",
          ee["refs"]["<Video 1>"]["nombre"] == "Teto" and ee["refs"]["E1"]["papel"] == "efecto" and ee["estilo"] == "flat anime"
          and "receta" not in ee, ee)
comprobar("no queda ninguna receta en el código", not hasattr(N, "cargar_recetas") and
          not os.path.exists(os.path.join(AQUI, "recetas.json")))

print("9 · Audio: tramo de una canción larga (ventana de audio del editor)")
import shutil  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
import wave  # noqa: E402
import numpy as np  # noqa: E402
tmp = tempfile.mkdtemp(prefix="epl_audio_")
try:
    sr = 44100
    rng = np.random.default_rng(1)
    onda = (rng.standard_normal((40 * sr, 2)) * 3000).astype(np.int16)  # 40 s de ruido estéreo: cada muestra es distinta
    cancion = os.path.join(tmp, "cancion.wav")
    open(cancion, "wb").write(N.wav_bytes(onda, sr))
    r = N.recortar_audio(cancion, 12.345, 3.0, tmp)
    with wave.open(os.path.join(tmp, r["nombre"])) as w:
        recorte = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2)
    comprobar("el recorte dura exactamente dur", abs(len(recorte) - round(3.0 * sr)) <= 1, len(recorte))
    comprobar("el recorte empieza en inicio", np.array_equal(recorte, onda[int(12.345 * sr + 0.5):int(12.345 * sr + 0.5) + len(recorte)]))
    comprobar("el nombre del recorte es estable", N.recortar_audio(cancion, 12.345, 3.0, tmp)["nombre"] == r["nombre"] !=
              N.nombre_tramo(cancion, 12.5, 3.0) and r["nombre"].startswith("edit_tramo_"), r)
    # en un mp3, la búsqueda rápida de ffmpeg sola da mal los primeros 20 ms: el recorte tiene que salir igual que la canción
    mp3 = os.path.join(tmp, "cancion.mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", cancion, "-b:a", "192k", mp3], check=True)
    entero = N.decodificar(mp3, sr, 2)
    trozo = N.decodificar(mp3, sr, 2, 20.0, 2.0)
    dif = np.abs(trozo.astype(int) - entero[20 * sr:22 * sr].astype(int)).max()
    comprobar("el tramo de un mp3 coincide muestra a muestra con la canción entera", len(trozo) == 2 * sr and dif <= 2, dif)
    # beats: una pista de golpes a 120 BPM (uno cada 0,5 s)
    golpes = np.zeros(60 * 22050, np.float32)
    for t in np.arange(0.25, 60, 0.5):
        i = int(t * 22050)
        golpes[i:i + 600] = np.hanning(1200)[600:] * np.sin(np.arange(600) * 0.12)  # unos 400 Hz
    pista = os.path.join(tmp, "golpes.wav")
    open(pista, "wb").write(N.wav_bytes((golpes * 20000).astype(np.int16)[:, None], 22050))
    todos = N.beats_cancion(pista, tmp)
    tramo = N.beats_de_tramo(pista, 20.5, 3.0, tmp)
    comprobar("los beats del tramo son los de la canción desplazados",
              tramo == [round(b - 20.5, 3) for b in todos if 20.5 <= b <= 23.5] and len(tramo) == 6, (tramo, todos[:5]))
    comprobar("los beats de la canción caen en los golpes (±1 fotograma)",
              all(abs((b - 0.25) / 0.5 - round((b - 0.25) / 0.5)) * 0.5 <= 1 / 24 for b in todos) and len(todos) >= 100, todos[:8])
    # el resumen de picos de un audio largo (20 min) se genera una vez y después sale de la caché
    largo = os.path.join(tmp, "largo.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "29", "-i", pista, "-t", "1200", largo], check=True)
    t0 = time.time()
    i1 = N.info_audio(largo, os.path.join(tmp, "cache"))
    t1 = time.time() - t0
    t0 = time.time()
    i2 = N.info_audio(largo, os.path.join(tmp, "cache"))
    t2 = time.time() - t0
    comprobar("resumen de picos de 20 min: pocos miles de valores", not i1["cache"] and abs(i1["duracion"] - 1200) < 0.1 and
              1000 <= len(i1["picos"]) <= N.PICOS_RESUMEN and max(i1["picos"]) > 100, (i1["duracion"], len(i1["picos"])))
    comprobar("el resumen se reutiliza de la caché", i2["cache"] and i2["picos"] == i1["picos"] and t2 < 0.1, (t1, t2))
    v = N.ventana_audio(largo, 600.0, 3.0)
    comprobar("la ventana fina cubre el tramo con margen", v["desde"] <= 600 - 8 and v["desde"] + len(v["picos"]) / v["por_s"] >= 603 + 8, v["desde"])
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print("10 · Tapar (cara, pelo o texto de una referencia), con máscaras sintéticas y sin GPU")
from PIL import Image, ImageDraw  # noqa: E402
foto = Image.fromarray(np.random.default_rng(2).integers(0, 255, (900, 600, 3), dtype=np.uint8))  # ruido: todo píxel cuenta
cara, pelo = Image.new("L", foto.size), Image.new("L", foto.size)
ImageDraw.Draw(cara).rectangle((200, 150, 320, 300), fill=255)
ImageDraw.Draw(pelo).rectangle((300, 100, 420, 200), fill=255)
union = np.array(N.union_mascaras([cara, pelo]))
comprobar("la unión de máscaras tiene la cara y el pelo, y nada más",
          union[200, 250] == 255 and union[120, 400] == 255 and union[600, 100] == 0 and
          (union > 0).sum() == ((np.array(cara) > 0) | (np.array(pelo) > 0)).sum(), (union > 0).sum())
crecer, suavizar, _ = N._radios(foto.size)
zona = np.array(N.agrandar_mascara(Image.fromarray(union), crecer, suavizar)) > 0
fuera_igual, dentro_cambia = True, True
for forma in N.FORMAS_TAPAR:
    dif = np.abs(np.array(N.tapar_imagen(foto, Image.fromarray(union), forma)).astype(int) - np.array(foto).astype(int)).max(axis=2)
    fuera_igual &= bool((dif[~zona] == 0).all())
    dentro_cambia &= bool((dif[union > 0] > 0).mean() > 0.9)
comprobar("tapar solo cambia píxeles dentro de la máscara agrandada (difuminar, pixelar, color)", fuera_igual)
comprobar("y dentro de la máscara sí los cambia", dentro_cambia)
comprobar("las palabras para SAM no dependen del orden de los chips",
          N.palabras_tapar(["pelo", "cara"], "Hat, logo;") == N.palabras_tapar(["cara", "pelo"], "logo, hat") ==
          ["face", "hair", "hat", "logo"])
datos = [b"foto de vera"]
h1 = N.huella_tapado("ropa/vera", datos, N.palabras_tapar(["cara", "pelo"]), "difuminar")
comprobar("el nombre del tapado es estable y cambia con las opciones o la foto",
          h1 == N.huella_tapado("ropa/vera", datos, ["hair", "face"], "difuminar") and
          len({h1, N.huella_tapado("ropa/vera", datos, ["face"], "difuminar"),
               N.huella_tapado("ropa/vera", datos, ["face", "hair"], "pixelar"),
               N.huella_tapado("ropa/vera", [b"otra foto"], ["face", "hair"], "difuminar")}) == 4 and
          N.nombre_tapado("ropa/vera", h1) == f"ropa/vera__tapado_{h1}", h1)
g, sal = N.grafo_sam([("minimax_h3/vera.jpg", "face"), ("minimax_h3/vera.jpg", "hair")])
tipos = [n["class_type"] for n in g.values()]
comprobar("el grafo de SAM carga un modelo y una foto, y no usa SAM3Segment",
          tipos.count("CheckpointLoaderSimple") == 1 and tipos.count("LoadImage") == 1 and tipos.count("SAM3_Detect") == 2 and
          "SAM3Segment" not in tipos and len(sal) == 2 and g["1"]["inputs"]["ckpt_name"] == N.SAM_MODELO, tipos)

print("11 · Línea de tiempo: cortes elegidos a mano (plan.cortes)")
planc = N.ajustar_plan(ref["plan"], 6)
planc["cortes"] = [0, 1.0, 1.846, 2.392, 3.483, 4.551]
pc, avc, inic = N.montar_plan(ref["entradas"], planc, ref["beats"])
comprobar("el montaje usa los cortes fijos en vez de calcularlos",
          inic == planc["cortes"] and "[Shot 2] At 00:01.000" in pc and not avc, (inic, avc))
planc["cortes"] = [0, 0.2, 1.846, 2.392, 3.483, 4.551]
pc, avc, inic = N.montar_plan(ref["entradas"], planc, ref["beats"])
comprobar("si no caben (una toma de menos de 0,4 s), vuelven los automáticos con un aviso",
          inic == [0.0, 0.755, 1.846, 2.392, 3.483, 4.551] and any("cortes elegidos a mano" in x for x in avc), (inic, avc))
comprobar("los cortes de otro número de tomas se olvidan", "cortes" not in N.ajustar_plan({**planc, "cortes": [0, 1]}, 6) and
          N.cortes_validos([0, 1, 2], 3, 3.0) and not N.cortes_validos([0, 2.8], 2, 3.0) and N.al_fotograma(1.01) == 1.0)
import subprocess as _sp  # noqa: E402
js = ("import('" + os.path.join(AQUI, "web", "editor", "linea.js") + "').then(m => console.log(JSON.stringify({"
      "a: m.moverBorde([0, 1, 2], 3, 1, 1.52), b: m.moverBorde([0, 1, 2], 3, 1, 1.52, [1.6], true),"
      "c: m.moverBorde([0, 1, 2], 3, 1, 1.52, [1.8], true), d: m.moverBorde([0, 1, 2], 3, 1, 1.9),"
      "e: m.moverBorde([0, 1, 2], 3, 1, 0.1), f: m.quitarDeCortes([0, 1, 2], 3, 2)})))")
try:
    r = json.loads(_sp.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True, timeout=20).stdout)
except Exception as exc:  # sin node no se prueba la parte de la ventana
    r = {"error": str(exc)}
comprobar("arrastrar un borde: al fotograma, mínimo 0,4 s a cada lado, imán a ±0,15 s del beat",
          r.get("a") == [0, 1.5, 2] and r.get("b") == [0, 1.6, 2] and r.get("c") == [0, 1.5, 2] and
          r.get("d") == [0, 1.583, 2] and r.get("e") == [0, 0.417, 2], r)
comprobar("quitar una toma con cortes a mano: las demás se reparten su tiempo", r.get("f") == [0, 1.5], r)

print("12 · La duración manda en todo el workflow (web/editor/duracion.js, con node)")
js = ("import('" + os.path.join(AQUI, "web", "editor", "duracion.js") + "').then(m => {"
      "const w = (name, value) => ({name, value});"
      "const g = {_nodes: ["
      "{id: 9, type: 'MiniMaxH3FantasticRefModTextEncode', widgets: [w('length', 124)], inputs: []},"
      "{id: 8, type: 'MiniMaxH3PromptBuilder', widgets: [w('prompt', ''), w('builder_state', JSON.stringify({duration: 5.1666, mode: 'REF'}))], inputs: []},"
      "{id: 5, type: 'EmptyMiniMaxH3LatentAV', widgets: [w('length', 124)], inputs: [{name: 'length', widget: {name: 'length'}, link: 3}]},"
      "{id: 4, type: 'KSampler', widgets: [w('length', 50)], inputs: []}]};"
      "const d = m.aplicarDuracion(g, 3.042);"
      "console.log(JSON.stringify({f: [1, 3.042, 4, 5.167].map(m.fotogramasH3), d, enc: g._nodes[0].widgets[0].value,"
      "pb: JSON.parse(g._nodes[1].widgets[1].value).duration, enlazado: g._nodes[2].widgets[0].value, otro: g._nodes[3].widgets[0].value}))})")
try:
    r = json.loads(_sp.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True, timeout=20).stdout)
except Exception as exc:
    r = {"error": str(exc)}
comprobar("fotogramas de H3: el 17·k + 5 más cercano a duración·24", r.get("f") == [22, 73, 90, 124], r)
comprobar("cambia el length del Text Encode y la duración del Prompt Builder, buscados por tipo; no toca lo enlazado ni otros nodos",
          r.get("enc") == 73 and r.get("pb") == 3.042 and r.get("enlazado") == 124 and r.get("otro") == 50 and
          len(r.get("d", {}).get("cambios", [])) == 2, r)

print("13 · Cambiar la canción: la lista de audios de input/ (rutas.audios, con un folder_paths de prueba)")
import types  # noqa: E402
import importlib.util  # noqa: E402
tmp4 = tempfile.mkdtemp(prefix="epl_audios_")
try:
    for a in ("cancion.mp3", "otra.wav", "edit_tramo_abc.wav", "foto.png"):
        open(os.path.join(tmp4, a), "wb").write(b"x")
    os.makedirs(os.path.join(tmp4, "sub"))
    open(os.path.join(tmp4, "sub", "dentro.wav"), "wb").write(b"x")
    sys.modules["folder_paths"] = types.SimpleNamespace(get_input_directory=lambda: tmp4)
    paquete = types.ModuleType("epl_paquete")
    paquete.__path__ = [AQUI]
    sys.modules["epl_paquete"] = paquete
    sys.modules["epl_paquete.nucleo"] = N
    spec = importlib.util.spec_from_file_location("epl_paquete.rutas", os.path.join(AQUI, "rutas.py"))
    R = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(R)
    nombres = sorted(x["nombre"] for x in R.audios()["audios"])
    comprobar("lista los audios de la raíz de input/ (como LoadAudio), sin los recortes ni otras cosas",
              nombres == ["cancion.mp3", "otra.wav"] and "audios" in R.ACCIONES, nombres)
finally:
    sys.modules.pop("folder_paths", None)
    shutil.rmtree(tmp4, ignore_errors=True)

print("14 · Subir foto: papel → concept_type y nombre libre (rutas.subir_refmods)")
tmp5 = tempfile.mkdtemp(prefix="epl_refmods_")
try:
    os.makedirs(os.path.join(tmp5, "subidas"))
    open(os.path.join(tmp5, "subidas", "teto.safetensors"), "wb").write(b"x")
    open(os.path.join(tmp5, "subidas", "teto_2.safetensors"), "wb").write(b"x")
    comprobar("el concept_type sale del papel (personaje→identity, ropa→clothing, pose→pose_motion, lugar/fondo→background, "
              "objeto→generic, estilo/efecto→style)",
              R.CONCEPTO_PAPEL == {"personaje": "identity", "ropa": "clothing", "pose": "pose_motion", "lugar": "background",
                                   "fondo": "background", "objeto": "generic", "estilo": "style", "efecto": "style"})
    comprobar("un nombre que ya existe recibe _2, _3…", R._libre(tmp5, "subidas/teto") == "subidas/teto_3" and
              R._libre(tmp5, "subidas/vera") == "subidas/vera")
    comprobar("sin nombre o sin fotos no se crea nada", all(_falla(lambda d=d: R.subir_refmods(d)) for d in
              ({"nombre": "", "fotos": ["a.jpg"]}, {"nombre": "x", "fotos": []})))
finally:
    shutil.rmtree(tmp5, ignore_errors=True)

print("15 · Dos idiomas: web/i18n/{es,en}.json, t() en el código y locales/ de ComfyUI (planos/2, «Dos idiomas»)")
import glob  # noqa: E402
import re  # noqa: E402
import i18n as I  # noqa: E402
ES, EN = (json.load(open(os.path.join(AQUI, "web", "i18n", f"{x}.json"), encoding="utf-8")) for x in ("es", "en"))
marcas = lambda x: sorted(set(re.findall(r"\{(\w+)\}", x)))
comprobar("las dos lenguas tienen las mismas claves, ninguna vacía", set(ES) == set(EN) and all(ES.values()) and all(EN.values()),
          sorted(set(ES) ^ set(EN)) or [k for k in ES if not ES[k] or not EN.get(k)])
comprobar("y los mismos {marcadores} en cada clave", all(marcas(ES[k]) == marcas(EN.get(k, "")) for k in ES),
          [k for k in ES if marcas(ES[k]) != marcas(EN.get(k, ""))])

# las claves que usa el código: literales que empiezan por una zona conocida; con ${x} o {x}, un patrón
ZONAS = sorted({k.split(".")[0] for k in ES})
CODIGO_JS = sorted(glob.glob(os.path.join(AQUI, "web", "**", "*.js"), recursive=True))
CODIGO_PY = [os.path.join(AQUI, x) for x in ("__init__.py", "rutas.py", "nucleo.py", "i18n.py")]
literal = re.compile(r"""(?<![\w.])f?(["'`])((?:%s)\.[\w.${}]+?)\1""" % "|".join(ZONAS))
usadas, patrones, faltan = set(), [], []
for ruta in CODIGO_JS + CODIGO_PY:
    for _, clave in literal.findall(open(ruta, encoding="utf-8").read()):
        if "{" in clave:
            trozos = re.split(r"\$?\{[^}]*\}", clave)
            patrones.append((clave, re.compile("^" + r"[\w.]+".join(map(re.escape, trozos)) + "$")))
        elif clave in ES:
            usadas.add(clave)
        else:
            faltan.append(f"{os.path.basename(ruta)}: {clave}")
for clave, pat in patrones:
    hay = {k for k in ES if pat.match(k)}
    if not hay:
        faltan.append(f"patrón sin claves: {clave}")
    usadas |= hay
comprobar("cada t(\"…\") del código existe en es.json", not faltan, faltan)
sobran = sorted(set(ES) - usadas)


# letreros escritos directamente en el código: un literal con letras donde va un texto para el usuario
LETRAS = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡]")
SIN_LETRERO = {"bien", "mal", "trabajando", "izq", "der", "px", "%", "es", "en"}   # clases de avisar(), CSS e idiomas
TROZO_URL = re.compile(r"^[?&/#][\w=/.&?%-]*$")                                   # «?v=», «&t=», «/view?filename=»…
CLASES = set(re.findall(r"\.([a-z][\w-]*)", open(os.path.join(AQUI, "web", "editor", "estilos.js"), encoding="utf-8").read()))
es_clase = lambda x: all(p in CLASES for p in x.split())                         # « fijo», « usada»: clases de CSS
PALABRAS_SUELTAS = {v.lower() for v in list(ES.values()) + list(EN.values()) if re.fullmatch(r"[\w-]+", v)}
# un nombre de código («stack_state», «textarea», «epl-tam-cajita»): sin espacios, sin mayúscula al empezar, y que no sea
# una palabra que también es un texto de la ventana («cerrar», «usar»…)
es_codigo = lambda x: bool(re.fullmatch(r"[a-z0-9_][\w-]*", x)) and x.lower() not in PALABRAS_SUELTAS
ETIQUETA_H3 = re.compile(r"^<(?:Picture|Video|Subject|Audio) [^>]*>$")              # «<Picture ${n}>»: va al prompt
JS_LETRERO = [r"""\b(?:title|placeholder|label|alt|"aria-label")\s*:\s*(["'`])((?:(?!\1).)*)\1""",
              r"""\.textContent\s*=\s*(["'`])((?:(?!\1).)*)\1""",
              r"""\bavisar\(\s*(["'`])((?:(?!\1).)*)\1""",
              r"""\bnew Error\(\s*(["'`])((?:(?!\1).)*)\1""",
              r"""[)}]\s*,\s*(["'`])((?:(?!\1).)*)\1(?!\s*:)""",             # un hijo de el(...) después de sus props
              r"""\?\s*(["'`])((?:(?!\1).)*)\1\s*:""",                        # x ? "texto" : …
              r"""\+\s*(["'`])((?:(?!\1).)*)\1"""]                            # … + "texto"
PY_LETRERO = [r"""raise\s+(?!ErrorUsuario)\w+\(\s*f?(["'])((?:(?!\1).)*)\1""",
              r"""["'](?:tooltip|placeholder)["']\s*:\s*f?(["'])((?:(?!\1).)*)\1""",
              r"""DESCRIPTION\s*=\s*\(?\s*f?(["'])((?:(?!\1).)*)\1""",
              r"""avisos\.append\(\s*f?(["'])((?:(?!\1).)*)\1""",
              r"""["']error["']\s*:\s*f?(["'])((?:(?!\1).)*)\1""",
              r"""return\s*\([^\n]*,\s*f?(["'])((?:(?!\1).)*)\1\)"""]
# excepciones justificadas: (archivo, el literal tal cual)
EXCEPCIONES = {
    ("editor.js", "Idioma / Language"),     # nombre de reserva del ajuste; ComfyUI lo traduce con locales/*/settings.json
    ("editor.js", "auto = Comfy.Locale"),   # su ayuda de reserva, igual
    ("editor_core.js", "ES"), ("editor_core.js", "EN"),   # el botón de idioma: los nombres de los idiomas no se traducen
    ("audio.js", "audio"), ("referencias.js", "audio"),   # el nombre del campo del LoadAudio (W(nodo, "audio"))
    ("referencias.js", "RefMod"),           # de dónde salió una ficha: un dato del estado (se enseña con referencias.origen.*)
}
# piezas que aún no pasaron a t(): se vacía al terminar las fases 2 (ventana) y 3 (servidor y nodo)
PENDIENTES = set()  # (vacía: todo pasa por t())
letreros = []
for ruta, pats in [(r, JS_LETRERO) for r in CODIGO_JS] + [(r, PY_LETRERO) for r in CODIGO_PY]:
    nombre = os.path.basename(ruta)
    if nombre in PENDIENTES:
        continue
    for n_lin, lin in enumerate(open(ruta, encoding="utf-8"), 1):
        if lin.lstrip().startswith(("//", "*", "/*", "#")) or re.search(r"console\.(?:warn|error|log)\(|print\(", lin):
            continue                         # comentarios y mensajes de consola (son para quien programa)
        for pat in pats:
            for _, txt in re.findall(pat, lin):
                limpio = re.sub(r"\$\{[^}]*\}|\{\w*\}|\\[nt]", "", txt).strip()
                if LETRAS.search(limpio) and limpio not in SIN_LETRERO and not TROZO_URL.match(limpio) and not es_clase(limpio) \
                        and not es_codigo(limpio) and not ETIQUETA_H3.match(txt) \
                        and (nombre, txt) not in EXCEPCIONES \
                        and not literal.fullmatch(f'"{txt}"'):
                    letreros.append(f"{nombre}:{n_lin}: {txt[:60]}")
comprobar("no quedan letreros escritos en el código (todo pasa por t())", not letreros, letreros[:20])
if PENDIENTES:
    print(f"  (falta pasar a t(): {', '.join(sorted(PENDIENTES))}; hasta entonces no se miran sus letreros ni las claves que sobran)")
else:
    comprobar("no sobran claves (cada texto se usa en algún sitio)", not sobran, sobran)

comprobar("Python: t() pone los marcadores, la coma decimal y, sin clave, el español o la propia clave",
          I.t("errores.tomas_no_caben", "es", n=6, dur=2.0) == "6 tomas no caben en 2 s (cada toma necesita al menos 0,4 s)."
          and I.t("errores.tomas_no_caben", "en", n=6, dur=1.5).startswith("6 shots don't fit in 1.5 s")
          and I.t("no.existe", "en") == "no.existe" and I.num(5.1667, "es", 3) == "5,167" and I.idioma_de("en-US") == "en",
          I.t("errores.tomas_no_caben", "es", n=6, dur=2.0))
e = I.ErrorUsuario("errores.falta_idea")
comprobar("ErrorUsuario: str() en español y texto() en el idioma pedido",
          str(e) == ES["errores.falta_idea"] and e.texto("en") == EN["errores.falta_idea"])
js = ("import('" + os.path.join(AQUI, "web", "editor", "i18n.js") + "').then(m => {"
      "const tx = {es: {a: 'Hola {n}', b: 'solo es'}, en: {a: 'Hi {n}'}};"
      "const es = m.traductor(tx, 'es'), en = m.traductor(tx, 'en');"
      "const w = console.warn; let avisos = 0; console.warn = () => { avisos++; };"
      "const r = {a: en.t('a', {n: 2}), b: en.t('b'), c: en.t('nada'), d: es.num(5.1667, 3), e: en.num(5.1667, 3),"
      "f: es.lista(['la cara', 'el pelo', 'el texto']), g: en.lista(['face', 'hair'])};"
      "en.t('b'); console.warn = w; r.avisos = avisos; console.log(JSON.stringify(r)); })")
try:
    r = json.loads(_sp.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True, timeout=20).stdout)
except Exception as exc:
    r = {"error": str(exc)}
comprobar("JS: t() con marcadores, el español de reserva (avisa una vez), la clave sola; Intl para números y listas",
          r.get("a") == "Hi 2" and r.get("b") == "solo es" and r.get("c") == "nada" and r.get("avisos") == 2 and
          r.get("d") == "5,167" and r.get("e") == "5.167" and r.get("f") == "la cara, el pelo y el texto" and
          r.get("g") == "face and hair", r)
generados = I.locales()
al_dia = all(json.load(open(os.path.join(AQUI, "locales", i, a), encoding="utf-8")) == c
             for i, archivos in generados.items() for a, c in archivos.items()
             if os.path.exists(os.path.join(AQUI, "locales", i, a))) and \
    all(os.path.exists(os.path.join(AQUI, "locales", i, a)) for i, archivos in generados.items() for a in archivos)
comprobar("locales/{es,en}/ (nodeDefs, settings, main) están al día con las claves (si no: python i18n.py)", al_dia)
raros = [v for archivos in generados.values() for c in archivos.values() for v in re.findall(r'"([^"]*)"', json.dumps(c, ensure_ascii=False))
         if re.search(r"[{}|@]", v)]
comprobar("y no llevan { } | @ (ComfyUI los lee como formato de vue-i18n)", not raros, raros)

print("\n" + ("TODO BIEN" if not fallos else f"{len(fallos)} FALLO(S): {', '.join(fallos)}"))
sys.exit(1 if fallos else 0)
