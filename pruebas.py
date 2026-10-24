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


def comprobar(nombre, condicion, detalle=""):
    print(("  ok   " if condicion else "  FALLA") + f" {nombre}" + ("" if condicion else f" → {detalle}"))
    if not condicion:
        fallos.append(nombre)


ref = json.load(open(os.path.join(AQUI, "pruebas", "plan_teto.json")))
esperado_txt = os.path.join(AQUI, "pruebas", "prompt_teto.txt")
receta = N.cargar_recetas()[ref["receta"]]
menu = N.menu_de(receta, ref["entradas"]["refs"])

print("1 · Montaje (plan guardado → prompt)")
prompt, avisos, ini = N.montar_plan(ref["receta"], ref["entradas"], ref["plan"], ref["beats"])
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
    f"POSE: {'<Picture 5>' if k == 2 else 'none'} | EFFECT: {['G1', 'G2', 'G3', 'G4', 'U4', 'U4'][k - 1]}" for k in range(1, 7))
datos = N.leer_historia(resp, plan, menu, receta)
comprobar("lugar fijado se conserva", datos["plan"]["tomas"][1]["lugar"] == "a quiet river bridge")
comprobar("pose fijada se conserva", datos["plan"]["tomas"][3]["pose"] == "<Picture 5>")
problemas = N.revisar_historia(datos, receta, menu)
comprobar("detecta la pose repetida contra un candado", "SHOT 2: repite la pose <Picture 5>" in problemas, problemas)
comprobar("detecta el efecto repetido", "SHOT 6: repite el efecto U4" in problemas, problemas)
t = {**N.toma_vacia(), "encuadre": "close-up", "fijos": ["encuadre"]}
d = N.leer_toma("FRAMING: medium close-up\nLIGHT: neon\nACTION: waves\nCAMERA: the camera holds still", receta, t)
comprobar("encuadre fijado se conserva en la toma", d["encuadre"] == "close-up", d)
comprobar("quita 'the camera' del inicio", d["camara"] == "holds still", d)

print("3 · Revisión de una toma (fallos ya vistos)")
d = N.leer_toma("FRAMING: extreme close-up | close-up | medium close-up\nLIGHT: warm glow\n"
                "ACTION: She lies on the wet floor\nCAMERA: holds still", receta, N.toma_vacia())
p = N.revisar_toma(d, receta, plan, 1, [], set())
comprobar("rechaza copiar el menú de encuadres", any(x.startswith("FRAMING tiene que ser") for x in p), p)
comprobar("rechaza tumbada / mojado / suelo", sum("da problemas" in x for x in p) >= 2, p)
comprobar("quita el sujeto del inicio del gesto", d["gesto"].startswith("lies"), d["gesto"])

print("4 · Efectos que piden un objeto")
plan2 = N.ajustar_plan(ref["plan"], 6)
plan2["tomas"][0].update(efecto="U3", momento="she waves", pose="")
datos = {"plan": plan2, "formato": []}
comprobar("U3 sin móvil se rechaza", any("necesita que en la toma haya «phone»" in x for x in N.revisar_historia(datos, receta, menu)))

print("5 · Frase de efecto escrita por el usuario")
plan3 = N.ajustar_plan(ref["plan"], 6)
plan3["tomas"][0].update(efecto_frase="pink heart confetti falling around <Subject 1>.", fijos=["efecto_frase"])
p3, _, _ = N.montar_plan(ref["receta"], ref["entradas"], plan3, ref["beats"])
comprobar("la frase propia sustituye a la de la receta", "Effect: pink heart confetti falling around <Subject 1>." in p3
          and "hand-drawn white and colored doodles" not in p3.split("[Shot 2]")[0].split("[Shot 1]")[1])
plan3["tomas"][1].update(efecto="", efecto_frase="soft film grain")
p3, _, _ = N.montar_plan(ref["receta"], ref["entradas"], plan3, ref["beats"])
comprobar("efecto libre sin código de la receta", "Effect: soft film grain." in p3)

print("6 · Palabras en pantalla")
comprobar("lee 'TO YOU @1; PEAK @ultima'", N.leer_palabras("TO YOU @1; PEAK @ultima", 6) == {1: "TO YOU", 6: "PEAK"})

print("7 · Papeles nuevos: personaje en <Video N>, ropa, objeto y lugar")
refs7 = {"<Video 1>": {"papel": "personaje", "nombre": "", "ficha": "Teto, four pictures"},
         "<Picture 1>": {"papel": "ropa", "nombre": "red racing jacket", "ficha": "red racing jacket with patches, black pants"},
         "<Picture 2>": {"papel": "objeto", "nombre": "red soda can", "ficha": "a red soda can with a white logo"},
         "<Picture 3>": {"papel": "lugar", "nombre": "night arcade street", "ficha": "a covered arcade street with lanterns"},
         "<Picture 4>": {"papel": "fondo", "nombre": "", "ficha": "a park"}}
e7 = {**ref["entradas"], "tomas": 3, "duracion": 5.0, "palabras": "", "refs": refs7}
m7 = N.menu_de(receta, refs7)
plan7 = N.ajustar_plan(None, 3)
for k, t in enumerate(plan7["tomas"], 1):
    t.update(lugar=f"corner {k}", momento="she smiles", encuadre="close-up", luz="neon", gesto="smiles", camara="holds still")
plan7["tomas"][0].update(ropa="<Picture 1>", objeto="<Picture 2>", gesto="raises <Subject 2> to her lips")
plan7["tomas"][1].update(lugar_ref="<Picture 3>")
p7, av7, _ = N.montar_plan(ref["receta"], e7, plan7)
comprobar("personaje como <Video 1> en la definición y la retención",
          "the anime girl in <Video 1>, with" in p7 and "black choker from <Video 1> in every shot" in p7, p7[:400])
comprobar("ropa: cita en la toma y retención solo de la ropa",
          "<Subject 1>, wearing the red racing jacket from <Picture 1>," in p7 and
          "<Picture 1>: attribute_transfer - only the clothes are transferred (red racing jacket with patches, black pants); "
          "that person's face, hair and body are not transferred." in p7)
comprobar("objeto: es <Subject 2>, definido y retenido",
          "<Subject 2> is the red soda can shown in <Picture 2>" in p7 and "<Subject 2>: fully_preserved" in p7)
comprobar("lugar: fija el lugar de su toma y se retiene",
          "corner 2, in the night arcade street shown in <Picture 3>," in p7 and "<Picture 3>: fully_preserved - the night arcade" in p7)
comprobar("sin cajita de atuendos no se pide OUTFIT", not N.atuendos(m7) and N.etiqueta("Video 1", m7["personaje"]) == "<Video 1>")
plan7b = N.ajustar_plan(plan7, 3)
plan7b["tomas"][0].update(objeto="", momento="she smiles")
plan7b["tomas"][1].update(lugar_ref="", fondo_ref="<Picture 4>")
plan7b["tomas"][2].update(objeto="<Picture 2>", lugar_ref="<Picture 3>", fondo_ref="<Picture 4>")
plan7b["arco"], plan7b["look"] = "a calm walk", "night, warm neon"
p7b = N.revisar_historia({"plan": plan7b, "formato": []}, receta, m7)
comprobar("revisa objeto sin <Subject 2> en MOMENT y LOCATION con BACKGROUND",
          "SHOT 3: lleva OBJECT <Picture 2>; MOMENT tiene que nombrarlo como <Subject 2>" in p7b and
          any(x.startswith("SHOT 3: lleva LOCATION <Picture 3> y BACKGROUND") for x in p7b), p7b)
plan7b["tomas"][2].update(objeto="", lugar_ref="")
p7b = N.revisar_historia({"plan": plan7b, "formato": []}, receta, m7)
comprobar("un objeto o lugar que no cambia tiene que salir en alguna toma",
          "ninguna toma usa OBJECT <Picture 2>; ponlo al menos en una toma donde encaje" in p7b and
          "ninguna toma usa LOCATION <Picture 3>; ponlo al menos en una toma donde encaje" in p7b, p7b)
d7 = N.leer_toma("FRAMING: close-up\nLIGHT: neon\nACTION: drinks from the can\nCAMERA: holds still", receta, N.toma_vacia())
plan7["tomas"][2]["objeto"] = "<Picture 2>"
comprobar("la toma con objeto pide <Subject 2> en ACTION",
          "ACTION tiene que incluir el objeto con su etiqueta <Subject 2>" in N.revisar_toma(d7, receta, plan7, 3, [], set(), m7))

print("\n" + ("TODO BIEN" if not fallos else f"{len(fallos)} FALLO(S): {', '.join(fallos)}"))
sys.exit(1 if fallos else 0)
