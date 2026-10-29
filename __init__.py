"""Nodo «Prompt del edit (LLM)»: tu idea → prompt H3, dentro del workflow, con su editor todo en uno (web/).
Planos en PLANOS.md. Este archivo solo conecta con ComfyUI (campos, GPU, barra de progreso y rutas del editor);
el trabajo está en nucleo.py y rutas.py.
Idioma: los letreros del nodo salen de web/i18n/es.json (ComfyUI los traduce con locales/, i18n.py); el informe sale en el
idioma que dejó el editor en `estado` (español si no hay); las rutas responden en el `idioma` de cada llamada.
"""
import asyncio
import gc
import importlib
import json
import time

from . import i18n, nucleo, rutas, vista_previa

t = i18n.t

WEB_DIRECTORY = "./web"


def liberar_gpu():
    """ComfyUI suelta sus modelos para que quepa Qwen (lo mismo que /free)."""
    import comfy.model_management as mm
    mm.unload_all_models()
    gc.collect()
    mm.soft_empty_cache(True)


def esperar_vram(gb=6.0, max_s=40, idioma="es"):
    """llama se duerme 5 s después de la última llamada: se espera a que suelte la VRAM antes de que cargue H3."""
    import torch
    t = time.time()
    while time.time() - t < max_s:
        libre = torch.cuda.mem_get_info()[0] / 2 ** 30
        if libre >= gb:
            return i18n.t("nodo.informe.vram_libre", idioma, gb=round(libre, 1), s=round(time.time() - t))
        time.sleep(0.5)
    return i18n.t("nodo.informe.vram_aviso", idioma, s=max_s)


class PromptDelEdit:
    CATEGORY = "edit/planeacion"
    FUNCTION = "generar"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "informe")
    DESCRIPTION = t("nodo.descripcion")   # en español; ComfyUI enseña la de locales/<idioma>/nodeDefs.json

    @classmethod
    def INPUT_TYPES(cls):
        texto = lambda ayuda: ("STRING", {"multiline": True, "default": "", "placeholder": ayuda})
        return {"required": {
            "idea": texto(t("comun.idea_ayuda")),
            "tomas": ("INT", {"default": 6, "min": 1, "max": 24}),
            "duracion_s": ("FLOAT", {"default": 5.167, "min": 1.0, "max": 12.0, "step": 0.001,
                                     "tooltip": t("nodo.duracion_s.tooltip")}),
            "palabras": texto(t("nodo.palabras.placeholder")),
            "semilla_llm": ("INT", {"default": 0, "min": 0, "max": 2 ** 31 - 1, "tooltip": t("nodo.semilla_llm.tooltip")}),
        }, "optional": {
            "audio": ("AUDIO", {"tooltip": t("nodo.audio.tooltip")}),
            "texto_bloqueado": texto(t("nodo.texto_bloqueado.placeholder")),
            "estado": ("STRING", {"default": "", "tooltip": t("nodo.estado.tooltip")}),
        }}

    def generar(self, idea, tomas, duracion_s, palabras, semilla_llm, audio=None, texto_bloqueado="", estado="", **_viejos):
        # **_viejos: un workflow de antes puede traer «receta»; ya no existe y se ignora (planos/3)
        try:
            editor = json.loads(estado) if estado.strip() else {}
        except json.JSONDecodeError:
            editor = {}
        idioma = i18n.idioma_de(editor.get("idioma"))           # el de la ventana la última vez que se guardó
        if texto_bloqueado.strip():
            return (texto_bloqueado.strip(), t("nodo.informe.bloqueado", idioma))
        if (editor.get("prompt") or "").strip():
            espera = esperar_vram(max_s=15, idioma=idioma) if time.time() - nucleo.ULTIMA_LLAMADA[0] < 20 else ""
            informe = t("nodo.informe.del_editor_a_mano" if editor.get("a_mano") else "nodo.informe.del_editor", idioma)
            return (editor["prompt"].strip(), informe + (f". {espera}" if espera else ""))
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

        # sin prompt del editor: el LLM escribe todo, con las referencias y el estilo que el editor dejara guardados (si los hay)
        try:
            prompt, informe, llamo = nucleo.planear(idea, tomas, duracion_s, palabras, semilla_llm, beats, avance, liberar_gpu,
                                                    extra=nucleo.entradas_de_estado(editor), idioma=idioma)
        except i18n.ErrorUsuario as exc:        # ComfyUI enseña el mensaje del error: en el idioma del editor
            raise RuntimeError(exc.texto(idioma)) from exc
        if llamo:
            informe += "\n" + esperar_vram(idioma=idioma)
        return (prompt, informe)


# ------------------------------------------------------------------ rutas del editor
def _registrar_rutas():
    from aiohttp import web
    from server import PromptServer
    srv = PromptServer.instance

    async def soltar_gpu():
        """Antes de llamar al LLM: nada renderizando, y ComfyUI suelta sus modelos (igual que /free)."""
        if srv.prompt_queue.get_tasks_remaining() > 0:
            raise i18n.ErrorUsuario("errores.cola_llm")
        srv.prompt_queue.set_flag("unload_models", True)
        srv.prompt_queue.set_flag("free_memory", True)
        import torch
        for _ in range(30):
            if torch.cuda.mem_get_info()[0] / 2 ** 30 >= 9:
                return
            await asyncio.sleep(0.5)

    # el preview en vivo de la app (vista_previa.py): se guarda el último del nodo Model Preview Override
    vista_previa.instalar(srv)

    @srv.routes.get("/max_editor/preview")
    async def preview(request):
        try:
            desde = int(request.query.get("desde") or 0)
        except ValueError:
            desde = 0
        return web.json_response(vista_previa.leer(desde), headers={"Cache-Control": "no-store"})

    @srv.routes.route("*", "/edit_prompt_llm/{accion}")
    async def manejar(request):
        """Una sola ruta: la acción se busca en rutas.ACCIONES, que se recarga en cada llamada (añadir una acción no
        obliga a reiniciar ComfyUI). Los errores salen en el `idioma` de la llamada: un ErrorUsuario con su texto; cualquier
        otro, con su tipo delante (son fallos del programa, de ffmpeg, PIL…: su mensaje no es nuestro y no se traduce)."""
        idioma = request.query.get("idioma", "es")
        try:
            importlib.reload(i18n)
            importlib.reload(nucleo)
            importlib.reload(rutas)
            datos = await request.json() if request.method == "POST" else {}
            idioma = i18n.idioma_de(datos.get("idioma") or idioma)
            accion = rutas.ACCIONES.get(request.match_info["accion"])
            if not accion:
                return web.json_response({"error": t("errores.accion_desconocida", idioma, accion=request.match_info["accion"])},
                                         status=404)
            funcion, usa_llm = accion
            if usa_llm:
                await soltar_gpu()
            res = await asyncio.get_running_loop().run_in_executor(None, lambda: funcion(datos))
            return web.json_response(res)
        except i18n.ErrorUsuario as exc:
            return web.json_response({"error": exc.texto(idioma), "clave": exc.clave}, status=400)
        except Exception as exc:
            return web.json_response({"error": t("errores.inesperado", idioma, tipo=type(exc).__name__, error=str(exc))}, status=400)


try:
    _registrar_rutas()
except Exception as exc:  # sin servidor (pruebas en terminal) no hay rutas
    print(f"[Prompt del edit] rutas del editor no registradas: {exc}")

NODE_CLASS_MAPPINGS = {"PromptDelEdit": PromptDelEdit}
NODE_DISPLAY_NAME_MAPPINGS = {"PromptDelEdit": t("nodo.nombre")}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
