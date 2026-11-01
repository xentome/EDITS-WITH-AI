"""Generar por partes (1 nov, planos/fases/18 Generar por partes.md): la línea de tiempo se parte en los cortes entre
tomas, cada parte se genera como un «Generar» normal (con sus tomas, sus tiempos desde 0:00 y su trozo de canción) y al
final la app las pega en un solo video. Sirve cuando el PC no llega a la duración entera a la resolución elegida (p. ej. un
RTX 3060 de 12 GB: unos 5 s a 1 MP).

Forma A del plan (la elegida): partir solo en un corte. H3 no ve la parte anterior, pero en un corte eso no se nota.

Cuentas (H3 solo hace 17·k+5 fotogramas a 24 fps):
- Cada parte empieza donde acabó la anterior (sus fotogramas, no el corte del plan): así cada toma de después sigue en su
  segundo de la canción y solo el último plano de cada parte se alarga o se acorta un poco (≤ 8 fotogramas, 0,35 s).
- La última parte es lo que queda, redondeado a 17·k+5: el total puede cambiar ≤ 8 fotogramas.
- La canción: cada parte lleva su trozo (desde su inicio, lo que dura) y, al unir, va encima la canción entera desde el
  mismo inicio, sin saltos. Sin canción (o con «audio de H3») se pega el sonido de cada parte.

Contrato:
  repartir(cortes, duracion, fotogramas_total, limite_f, partir=None) -> list[dict]   las partes (sin GPU, sin archivos)
  proyecto_de_parte(p, parte) -> Proyecto                                              el proyecto de una parte (sin montar)
  unir(foto, trabajos) -> (archivo, fila)                                              pega las partes (ffmpeg)
"""
from __future__ import annotations

import copy
import hashlib
import os
from datetime import datetime

import agente
import generar
import retocar
from generar import ErrorGenerar

FPS = 24
LIMITE_S = 5.167              # 124 fotogramas: lo que suele aguantar un PC de 12 GB a 1 MP (se cambia en la página)


def fotogramas_h3(s: float) -> int:
    return agente.fotogramas_h3(s)


def _hasta(f: float) -> int:
    """El 17·k+5 más grande que no pasa de f (como mínimo 22)."""
    return 17 * max(1, int((f - 5) // 17)) + 5


def limite_fotogramas(limite_s) -> int:
    try:
        s = float(limite_s or LIMITE_S)
    except (TypeError, ValueError):
        raise ErrorGenerar("el límite por parte no es válido")
    return max(22, fotogramas_h3(s))


# ---------------------------------------------------------------- repartir la línea de tiempo
def _grupos(cortes: list[float], dur: float, limite_f: int, partir) -> list[list[int]]:
    n = len(cortes)
    fines = cortes[1:] + [dur]
    if partir:                                          # a mano: partir después de estas tomas (1…n-1)
        try:
            despues = sorted({int(k) for k in partir})
        except (TypeError, ValueError):
            raise ErrorGenerar("los puntos de corte no son válidos")
        if any(not 1 <= k < n for k in despues):
            raise ErrorGenerar(f"solo se puede partir después de las tomas 1 a {n - 1}")
        bordes = [0] + despues + [n]
        return [list(range(a, b)) for a, b in zip(bordes, bordes[1:])]
    grupos, actual, inicio = [], [], 0.0                # solos: cada parte con todas las tomas que quepan en el límite
    for i in range(n):
        if actual and fotogramas_h3(fines[i] - inicio) > limite_f:
            grupos.append(actual)
            inicio = cortes[i]
            actual = []
        if not actual and fotogramas_h3(fines[i] - cortes[i]) > limite_f:
            raise ErrorGenerar(f"la toma {i + 1} dura {fines[i] - cortes[i]:.2f} s, más que el límite por parte "
                               f"({limite_f / FPS:.2f} s): acórtala o pártela en dos tomas")
        actual.append(i)
    grupos.append(actual)
    return grupos


def repartir(cortes, dur: float, total_f: int, limite_f: int, partir=None) -> list[dict]:
    """Las partes: [{i, tomas (1…n), inicio, fotogramas, segundos, cortes (dentro de la parte), plan (inicio y fin en el plan),
    sobre_limite}]. `cortes`: el inicio de cada toma en el edit entero (el «cortes» del montaje)."""
    cortes = [float(x) for x in cortes or []]
    if not cortes:
        raise ErrorGenerar("el edit no tiene tomas")
    grupos = _grupos(cortes, dur, limite_f, partir)
    if len(grupos) < 2:
        raise ErrorGenerar(f"el edit entero ({total_f / FPS:.2f} s) ya cabe en una parte de {limite_f / FPS:.2f} s: usa «Generar»")
    fines = cortes[1:] + [dur]
    partes, f0 = [], 0
    for gi, g in enumerate(grupos):
        inicio = f0 / FPS
        if gi < len(grupos) - 1:
            fin = fines[g[-1]]
            f = fotogramas_h3(fin - inicio)
            if f > limite_f:                                # al redondear se pasó: el 17·k+5 de debajo
                f = _hasta(limite_f)
        else:
            f = fotogramas_h3((total_f - f0) / FPS)
        f = max(22, f)
        s = f / FPS
        if len(g) * agente.MIN_TOMA > s + 1e-6:
            raise ErrorGenerar(f"la parte {gi + 1} ({s:.2f} s) es muy corta para sus {len(g)} tomas")
        dentro = [agente.al_fotograma(max(0.0, cortes[k] - inicio)) for k in g]
        dentro[0] = 0.0
        if not agente.cortes_validos(dentro, len(g), s):      # el último plano quedó muy corto: se reparte en proporción
            largos = [fines[k] - cortes[k] for k in g]
            esc, acc, dentro = s / sum(largos), 0.0, []
            for x in largos:
                dentro.append(agente.al_fotograma(acc))
                acc += x * esc
            if not agente.cortes_validos(dentro, len(g), s):
                raise ErrorGenerar(f"la parte {gi + 1} no cabe: alguna toma quedaría por debajo de {agente.MIN_TOMA} s")
        partes.append({"i": gi + 1, "tomas": [k + 1 for k in g], "inicio": round(inicio, 3), "fotogramas": f,
                       "segundos": round(s, 3), "cortes": dentro,
                       "plan": [round(cortes[g[0]], 3), round(fines[g[-1]], 3)], "sobre_limite": f > limite_f})
        f0 += f
    return partes


# ---------------------------------------------------------------- el proyecto de una parte
def nombre_tramo(original: str, inicio: float, dur: float) -> str:
    """Nombre del trozo de canción de una parte. Empieza por «edit_tramo_»: si no está en ComfyUI/input, generar.py lo corta
    de la canción original al lanzar (_reponer_tramo, con estado.audio.inicio_s y la duración de la parte)."""
    h = hashlib.sha1(f"{original}|{inicio:.4f}|{dur:.4f}".encode()).hexdigest()[:12]
    return f"edit_tramo_p{h}.wav"


def proyecto_de_parte(p: agente.Proyecto, parte: dict) -> agente.Proyecto:
    """Una copia del proyecto con solo las tomas de la parte, sus cortes desde 0, su duración, sus textos y su trozo de
    canción. Falta montarla (cuerpo_montar → «montar» → aplicar_montaje) para tener su prompt."""
    q = agente.Proyecto(copy.deepcopy(p.datos), p.plantilla)
    e, plan = q.estado(), q.plan
    a, s = parte["inicio"], parte["segundos"]
    audio = q.audio()                                   # antes de tocar nada: la canción y su inicio en el edit entero
    plan["tomas"] = [copy.deepcopy(plan["tomas"][k - 1]) for k in parte["tomas"]]
    plan.pop("cortes", None)
    q.poner(q.edit, "tomas", len(plan["tomas"]))
    q.poner_duracion(s)
    plan["cortes"] = list(parte["cortes"])
    textos = []
    for x in plan.get("textos") or []:                  # la fila de texto: lo que empieza en la parte, con su tiempo desde 0
        t0 = float(x.get("t") or 0)
        if a - 1e-6 <= t0 < a + s - 1e-6:
            fin = x.get("fin")
            textos.append({**x, "t": agente.al_fotograma(t0 - a),
                           "fin": None if fin in (None, "") else agente.al_fotograma(min(float(fin) - a, s))})
    if isinstance(plan.get("textos"), list):
        plan["textos"] = textos
    e["toma_elegida"] = 1
    if audio:
        inicio = round(audio["inicio_s"] + a, 4)
        nombre = nombre_tramo(audio["original"], inicio, s)
        e["audio"] = {**(e.get("audio") or {}), "original": audio["original"], "inicio_s": inicio, "recorte": nombre, "tocado": True}
        nid = q.nodo(agente.T_AUDIO)
        if nid:
            q.poner(nid, "audio", nombre)
    q.guardar_estado()
    return q


# ---------------------------------------------------------------- unir
def unir(foto: dict, trabajos: list[dict]) -> tuple[str, dict]:
    """Pega los videos de las partes (en orden) en app/salidas. `foto`: {grupo, n, proyecto, semilla, audio: {original,
    inicio_s} | None, audio_salida}. Devuelve (archivo, fila del historial)."""
    if len(trabajos) != int(foto.get("n") or 0):
        raise ErrorGenerar("faltan partes de este video en la cola")
    for t in trabajos:
        if t.get("estado") != "hecho" or not t.get("video"):
            raise ErrorGenerar(f"la parte {t.get('grupo', {}).get('i', '?')} no está hecha: reinténtala y luego vuelve a unir")
    rutas = [retocar.ruta_video(t["video"]) for t in trabajos]
    infos = [retocar.info(t["video"]) for t in trabajos]
    an, al = infos[0]["ancho"], infos[0]["alto"]
    total = sum(i["fotogramas"] for i in infos)
    archivo = f"edit_{datetime.now():%Y%m%d_%H%M%S}_{foto.get('semilla')}_partes{len(rutas)}.mp4"
    destino = os.path.join(generar.SALIDAS, archivo)
    entradas = [x for r in rutas for x in ("-i", r)]
    filtros = [f"[{k}:v]scale={an}:{al},setsar=1,fps={FPS}[v{k}]" for k in range(len(rutas))]
    cancion = foto.get("audio") if foto.get("audio_salida") != "modelo" else None
    ruta_cancion = None
    if cancion:
        ruta_cancion = retocar._dentro(os.path.join(retocar.comfyui_dir(), "input"), str(cancion.get("original") or ""))
        if not ruta_cancion or not os.path.isfile(ruta_cancion):
            ruta_cancion = None                         # sin la original se pega el audio de cada parte
    con_audio = all(i["audio"] for i in infos)
    justo = f"apad,atrim=end={total / FPS:.4f}"         # el audio, tan largo como el video: ni corta un fotograma ni sobra
    if ruta_cancion:
        filtros.append("".join(f"[v{k}]" for k in range(len(rutas))) + f"concat=n={len(rutas)}:v=1:a=0[v]")
        filtros.append(f"[{len(rutas)}:a]{justo}[a]")
        args = [*entradas, "-ss", f"{float(cancion.get('inicio_s') or 0):.4f}", "-t", f"{total / FPS:.4f}", "-i", ruta_cancion,
                "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "[a]"]
    elif con_audio:
        filtros.append("".join(f"[v{k}][{k}:a]" for k in range(len(rutas))) + f"concat=n={len(rutas)}:v=1:a=1[v][a0]")
        filtros.append(f"[a0]{justo}[a]")
        args = [*entradas, "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "[a]"]
    else:
        filtros.append("".join(f"[v{k}]" for k in range(len(rutas))) + f"concat=n={len(rutas)}:v=1:a=0[v]")
        args = [*entradas, "-filter_complex", ";".join(filtros), "-map", "[v]"]
    os.makedirs(generar.SALIDAS, exist_ok=True)
    retocar._ffmpeg(*args, "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac",
                    "-b:a", "192k", "-movflags", "+faststart", destino)
    fila = {"tipo": "partes", "semilla": foto.get("semilla"), "proyecto": foto.get("proyecto"),
            "partes": {"n": len(rutas), "videos": [t["video"] for t in trabajos], "fotogramas": [i["fotogramas"] for i in infos],
                       "duracion": round(total / FPS, 3)},
            "de": trabajos[0]["video"]}
    if cancion:
        fila["audio"] = {"original": cancion.get("original"), "inicio_s": float(cancion.get("inicio_s") or 0)}
    else:
        fila["sin_cancion"] = True
    return archivo, fila
