"""Nodo «Prompt del edit (LLM)»: tu idea → prompt H3, dentro del workflow, con su editor todo en uno (web/).
Planos en PLANOS.md. Este archivo solo conecta con ComfyUI (campos, GPU, barra de progreso y rutas del editor);
el trabajo está en nucleo.py y rutas.py.
"""
import asyncio
import gc
import importlib
import json
import os
import time

from . import nucleo, rutas

WEB_DIRECTORY = "./web"


def liberar_gpu():
    """ComfyUI suelta sus modelos para que quepa Qwen (lo mismo que /free)."""
    import comfy.model_management as mm
    mm.unload_all_models()
    gc.collect()
    mm.soft_empty_cache(True)


def esperar_vram(gb=6.0, max_s=40):
    """llama se duerme 5 s después de la última llamada: se espera a que suelte la VRAM antes de que cargue H3."""
    import torch
    t = time.time()
    while time.time() - t < max_s:
        libre = torch.cuda.mem_get_info()[0] / 2 ** 30
        if libre >= gb:
            return f"VRAM libre: {libre:.1f} GB a los {time.time() - t:.0f} s"
        time.sleep(0.5)
    return f"AVISO: llama no soltó la VRAM en {max_s} s"


class PromptDelEdit:
    CATEGORY = "edit/planeacion"
    FUNCTION = "generar"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "informe")
    DESCRIPTION = ("Idea → prompt H3. Con «Abrir editor…» ves y enlazas las referencias, el prompt que lee el LLM y el prompt "
                   "final. Sin editor, Qwen3.8 escribe la historia y cada toma con los campos del nodo. "
                   "Planos: custom_nodes/edit_prompt_llm/PLANOS.md")

    @classmethod
    def INPUT_TYPES(cls):
        texto = lambda ayuda: ("STRING", {"multiline": True, "default": "", "placeholder": ayuda})
        return {"required": {
            "receta": (list(nucleo.cargar_recetas()),),
            "idea": texto("Qué pasa y con qué tono, en tus palabras (manda sobre todo lo demás)"),
            "tomas": ("INT", {"default": 6, "min": 1, "max": 12}),
            "duracion_s": ("FLOAT", {"default": 5.167, "min": 1.0, "max": 12.0, "step": 0.001,
                                     "tooltip": "Fotogramas / 24; igual que la duración del Prompt Builder"}),
            "palabras": texto("Opcional · una por línea: TEXTO @ toma (o @ultima). Ej.: TO YOU @1"),
            "semilla_llm": ("INT", {"default": 0, "min": 0, "max": 2 ** 31 - 1,
                                    "tooltip": "Otra semilla = otra versión; la misma semilla = el mismo prompt, sin llamar al LLM"}),
        }, "optional": {
            "audio": ("AUDIO", {"tooltip": "El LoadAudio del workflow: los cortes caen en sus beats. Sin audio, cortes parejos."}),
            "texto_bloqueado": texto("Opcional · si pegas aquí un prompt, sale tal cual y no se llama al LLM"),
            "estado": ("STRING", {"default": "", "tooltip": "Lo guarda el editor (oculto)"}),
        }}

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # si editas recetas.json, el nodo vuelve a ejecutarse aunque los campos no cambien
        return os.path.getmtime(nucleo.RECETAS)

    def generar(self, receta, idea, tomas, duracion_s, palabras, semilla_llm, audio=None, texto_bloqueado="", estado=""):
        if texto_bloqueado.strip():
            return (texto_bloqueado.strip(), "Texto bloqueado: sale tal cual, sin LLM.")
        try:
            editor = json.loads(estado) if estado.strip() else {}
        except json.JSONDecodeError:
            editor = {}
        if (editor.get("prompt") or "").strip():
            espera = esperar_vram(max_s=15) if time.time() - nucleo.ULTIMA_LLAMADA[0] < 20 else ""
            return (editor["prompt"].strip(), "Prompt del editor" + (" (editado a mano)" if editor.get("a_mano") else "") +
                    (f". {espera}" if espera else ""))
        import comfy.model_management as mm
        import comfy.utils
        beats = None
        if audio is not None:
            onda = audio["waveform"][0].float().mean(0).cpu().numpy()
            beats = nucleo.beats_de_onda(onda, audio["sample_rate"])
        barra = comfy.utils.ProgressBar(tomas + 1)

        def avance(paso, total, texto):
            barra.update_absolute(paso, total)
            print(f"[Prompt del edit] {texto}", flush=True)
            mm.throw_exception_if_processing_interrupted()

        prompt, informe, llamo = nucleo.planear(receta, idea, tomas, duracion_s, palabras, semilla_llm, beats, avance, liberar_gpu)
        if llamo:
            informe += "\n" + esperar_vram()
        return (prompt, informe)


# ------------------------------------------------------------------ rutas del editor
def _registrar_rutas():
    from aiohttp import web
    from server import PromptServer
    srv = PromptServer.instance

    async def soltar_gpu():
        """Antes de llamar al LLM: nada renderizando, y ComfyUI suelta sus modelos (igual que /free)."""
        if srv.prompt_queue.get_tasks_remaining() > 0:
            raise RuntimeError("ComfyUI está trabajando: espera a que termine la cola para usar el LLM.")
        srv.prompt_queue.set_flag("unload_models", True)
        srv.prompt_queue.set_flag("free_memory", True)
        import torch
        for _ in range(30):
            if torch.cuda.mem_get_info()[0] / 2 ** 30 >= 9:
                return
            await asyncio.sleep(0.5)

    @srv.routes.route("*", "/edit_prompt_llm/{accion}")
    async def manejar(request):
        """Una sola ruta: la acción se busca en rutas.ACCIONES, que se recarga en cada llamada (añadir una acción no
        obliga a reiniciar ComfyUI)."""
        try:
            importlib.reload(nucleo)
            importlib.reload(rutas)
            accion = rutas.ACCIONES.get(request.match_info["accion"])
            if not accion:
                return web.json_response({"error": f"acción desconocida: {request.match_info['accion']}"}, status=404)
            funcion, usa_llm = accion
            datos = await request.json() if request.method == "POST" else {}
            if usa_llm:
                await soltar_gpu()
            res = await asyncio.get_running_loop().run_in_executor(None, lambda: funcion(datos))
            return web.json_response(res)
        except Exception as exc:
            return web.json_response({"error": f"{type(exc).__name__}: {exc}"}, status=400)


try:
    _registrar_rutas()
except Exception as exc:  # sin servidor (pruebas en terminal) no hay rutas
    print(f"[Prompt del edit] rutas del editor no registradas: {exc}")

NODE_CLASS_MAPPINGS = {"PromptDelEdit": PromptDelEdit}
NODE_DISPLAY_NAME_MAPPINGS = {"PromptDelEdit": "Prompt del edit (LLM)"}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
