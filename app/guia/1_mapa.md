# 1 · Map of the app

> What the creative sees, top to bottom, and which tool touches each zone. Page labels are given in Spanish / English (the page
> has an ES | EN switch). Read this first.

## How it fits together

- The page (http://127.0.0.1:8300) and you edit **the same project file** (`app/proyectos/<name>.json`). Each save raises its
  `rev`. The page checks every 2 s: if you saved and the creative has nothing half-typed, it reloads by itself; if they were
  editing, it asks them which version to keep. **Nothing you do is hidden.**
- Everything you touch gets a pink dashed border labelled «✎ agente» until the creative edits it or presses «Visto». Jobs you
  queue carry the same label in «Cola».
- Generar and Retocar never run directly: they go to the **job queue** (one GPU, one job at a time), with a frozen copy of the
  project. Editing after queueing does not change a queued job.
- Under the hood: the app builds H3's prompt from the fields («montaje»; the code only glues your text with fixed phrases),
  puts it in a ComfyUI workflow template and runs it with the Comfy SDK. You never write the final prompt by hand.

## Zones and tools

| Zone in the page | What it is | Tools |
|---|---|---|
| Header › «Proyecto» list, «Nuevo», «Guardar como» | which project is open | listar_proyectos, abrir_proyecto, crear_proyecto |
| Header › green dots ComfyUI · Proxy · LLM | services | estado |
| Header › «Semilla del video» + «Otra semilla» | the seed of the next video | poner_semilla |
| Header › «GENERAR», «Encolar ×N» | queue the edit | generar |
| Header › «Videos (n)» / «Mis videos» | the project's results | listar_videos, ver_video |
| Header › «Cola (n)» | the job queue | ver_cola, esperar, cancelar, reintentar |
| Row under the header: «✎ agente · N cambios · Visto» | your marks; a conflict notice if both edited | — |
| Editor bar › «Resolución» Ancho × Alto · MP · Girar | video size (multiples of 32) | poner_resolucion |
| Step bar «Cara A · 1 · Tomas y referencias» / «Cara B · 2 · Retocar» | the two steps | — |
| **Step 1 › Referencias**: «Principal» (in every shot) and «Secundarias» (only in shots that cite them), posters with a seal Im1 / V1, «Efectos de texto» | the RefMods sent to H3, each with a role | listar_refmods, poner_referencia, quitar_referencia, poner_efecto_texto |
| **Step 1 › Texto** row (blue bars) | words on screen with their time | poner_texto |
| **Step 1 › Línea de tiempo**: «Duración 5,167 s = 124 f», «cortes a mano», «pegar a los beats», «cortes automáticos», the shot boxes A1, A2… | length, number of shots, cuts | poner_duracion, poner_tomas, quitar_toma |
| **Step 1 › waveform** + «Cambiar canción» | the song and the segment used | listar_canciones, poner_cancion |
| **Step 1 › «Sonido»** + «Audio del video: Tu canción / Audio de H3» | the soundscape line and which audio the video keeps | poner_sonido |
| **Shot panel** (the selected shot, «Toma k»): «Acción / movimiento» (main field), «Referencias», «Efecto de la referencia» · «Encuadre», «Movimiento de cámara», «Luz», «Lugar» with «Entorno auto / manual / Sin entorno», «Gesto», «Estilo» · «Referencias que usa» | one shot's fields | escribir_toma |
| «Prompt de la toma» / «Prompt final · lo que recibe H3» | what H3 will read | ver_proyecto(con_prompt=true) |
| **Step 2 › Retocar**: a video, a frame range, a mask (rectangle or SAM text), references, a prompt | redo one zone of a video | ver_mascara, retocar |

Buttons you do not have as tools (they are the creative's): «Escribir tomas» / «Rehacer esta toma» (the local LLM writes the
shots), «Describir» (vision writes a reference card), uploading new photos or clips, drawing the mask by hand. If one of these
would help, tell the creative where it is.

## The cycle of an edit

1. **Idea** — from the creative. Ask what is missing (see guia://creativo).
2. **References** — the character or product (role personaje / objeto), plus any style, effect, background or font references.
3. **Song + duration** — the creative picks the song and where the segment starts; you set the length (17·k+5 frames).
4. **Shots** — how many and how long; then each shot panel, «Acción / movimiento» first.
5. **Text** — optional words on screen.
6. **revisar_proyecto** — fix errors, mention warnings.
7. **generar** — a quick test first (22 frames, low resolution) unless the creative says otherwise.
8. **ver_video** — judge it (guia://revisar). Adjust: seed → shot prompt → references → durations; or **retocar** a zone.

## Shot field → place in H3's prompt

The code assembles each shot like this (you can check it with ver_proyecto(con_prompt=true)):

`[Shot k] At 00:SS.mmm <Encuadre>, in the style of <Estilo>, <effect card>, like the effect in <Picture N>. <Lugar> like the
place in <Fondo ref>: <Subject 1> <Gesto>; the camera <Movimiento de cámara>. <Acción / movimiento>.`
(parts with an empty field are left out).

and each text item: `At 00:SS.mmm the huge word "TEXT" slams over the <framing> … in the lettering style of <Picture N>, <frase>.`

So: «Gesto» continues the sentence after `<Subject 1>` (write it as a verb phrase: «raises the lollipop next to her cheek»);
«Movimiento de cámara» continues `the camera …`; «Acción / movimiento» is a full sentence of what happens (start it with a
capital letter, end with a period).
