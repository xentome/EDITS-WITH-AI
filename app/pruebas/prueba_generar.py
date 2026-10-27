"""Prueba de app/generar.py por línea de comandos: un edit corto (22 fotogramas, casi 1 s) con un prompt escrito a mano.

Toma el prompt y las referencias del workflow que salió bien el 26 oct (~/comfy/max_editor_app/pruebas/wf_h3_api.json);
esos RefMods existen en el ComfyUI local, pero no van en la plantilla.

  ~/comfy/max_editor_app/.venv/bin/python app/pruebas/prueba_generar.py           # prueba sin GPU y render
  ~/comfy/max_editor_app/.venv/bin/python app/pruebas/prueba_generar.py --seco    # solo la prueba sin GPU

Antes de lanzar mira la cola de ComfyUI: si hay algo corriendo o pendiente, espera (nunca interrumpe).
"""
import json
import os
import sys
import time
import urllib.request

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP)
import generar  # noqa: E402

ORIGEN = os.path.expanduser("~/comfy/max_editor_app/pruebas/wf_h3_api.json")


def valores_de_prueba() -> dict:
    wf = json.load(open(ORIGEN, encoding="utf-8"))
    prompt = json.loads(wf["74"]["inputs"]["estado"])["prompt"]
    return {
        "74": {"estado": json.dumps({"v": 4, "prompt": prompt}), "abrir_editor": "no se copia"},
        "7": {"stack_state": wf["7"]["inputs"]["stack_state"]},
        "72": {"audio": wf["72"]["inputs"]["audio"]},
        "9": {"length": 22, "mods": ["99", 0]},  # el enlace que llega en valores se ignora
        "999": {"x": 1},                          # nodo desconocido: se ignora
    }


def prueba_seca() -> None:
    v = valores_de_prueba()
    g = generar.preparar(v, {"semilla": 123, "prefijo": "max_editor/prueba_generar"})
    tipos = {n["class_type"] for n in g.values()}
    assert "PromptDelEdit" not in tipos and "PreviewAny" not in tipos, tipos
    assert all(not (generar.es_enlace(x) and x[0] not in g) for n in g.values() for x in n["inputs"].values()), "enlace roto"
    b = next(n for n in g.values() if n["class_type"] == "MiniMaxH3PromptBuilder")
    assert b["inputs"]["prompt_text"].startswith("subject_definitions"), b["inputs"]["prompt_text"][:40]
    assert b["inputs"]["audio_1"] == ["72", 0]
    assert g["9"]["inputs"]["length"] == 22 and g["9"]["inputs"]["mods"] == ["8", 20]
    assert g["33"]["inputs"]["noise_seed"] == 123
    assert g["21"]["inputs"]["filename_prefix"] == "max_editor/prueba_generar"
    sin_semilla = generar.preparar(v, {"semilla": None})
    assert sin_semilla["33"]["inputs"]["noise_seed"] == generar.plantilla()["33"]["inputs"]["noise_seed"]
    # la plantilla sola no tiene prompt: error claro, sin excepción hacia fuera
    tid = generar.iniciar({}, {})
    e = generar.estado(tid)
    assert e["estado"] == "error" and "no hay prompt" in e["mensaje"], e
    assert generar.estado("nada")["estado"] == "error"
    print("prueba seca: bien")


def cola_libre() -> bool:
    url = generar.config()["comfyui_url"] + "/queue"
    with urllib.request.urlopen(url, timeout=5) as r:
        q = json.load(r)
    return not q.get("queue_running") and not q.get("queue_pending")


def render() -> None:
    while not cola_libre():
        print("ComfyUI está ocupado; espero 30 s…", flush=True)
        time.sleep(30)
    tid = generar.iniciar(valores_de_prueba(), {"semilla": None, "prefijo": "max_editor/prueba_generar"})
    antes = None
    while True:
        e = generar.estado(tid)
        linea = f"{e['segundos']:6.1f} s  {e['estado']:<10} {e['avance']:.0%}  paso {e['paso']}/{e['pasos']}  {e['nodo']}  {e['mensaje']}"
        if linea[9:] != antes:
            print(linea, flush=True)
            antes = linea[9:]
        if e["estado"] in ("listo", "error"):
            break
        time.sleep(1)
    if e["estado"] != "listo":
        sys.exit(f"falló: {e['mensaje']}")
    ruta = os.path.join(generar.SALIDAS, e["video"])
    assert os.path.getsize(ruta) > 10_000, ruta
    print("video:", ruta, f"({e['segundos']} s)")
    print("historial:", generar.historial()[-1])


if __name__ == "__main__":
    prueba_seca()
    if "--seco" not in sys.argv:
        render()
