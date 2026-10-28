# 4 · Writing for H3

> You never write the whole prompt: you write fields and the app glues them in order (guia://mapa, last section). These rules
> are about those fields. All in English. Check the result with ver_proyecto(con_prompt=true) or the line escribir_toma returns.

## The rules

1. **Simple before long.** One clear action per shot. A shot that asks for three things gets one of them, or none.
2. **The action is the main field.** «Acción / movimiento» says what happens; «Gesto» says what the body does; they must agree.
3. **The camera is explicit** and agrees with the framing. One movement per shot, finished inside the shot.
4. **Say what is seen, not what is meant.** Shapes, colours, light, materials. Not «a cool place», not «the interface of a
   program».
5. **No negations, no numbers inside motion, no small text.**
6. **Do not describe the character again** in the shots: their RefMod and card do it. Name them `<Subject 1>` (or their
   name, which the card defines).
7. **Effects: the cause, not the result.** «a flat fill that switches color on every beat», not «a colourful look».
8. **Words that can be read two ways become things** (wet red strands → red liquid). Prefer plain, physical words.
9. Spelling and pronouns count (she/her vs he/his): H3 reads them literally.

## Before → after

(✅ = that exact change was seen in a render; the others apply a rule and were not rendered as such.)

| Field | Before (what failed or is weak) | After | Why |
|---|---|---|---|
| Movimiento de cámara, shot 2 after a push-in | «holds still» | «stays locked off on a tripod at the same distance for the whole shot, keeping her entire body framed from head to sandals until the last frame» | a short still camera let H3 finish shot 1's push-in in shot 2 ✅ |
| Movimiento de cámara | «no zoom, never covering her face» | «slowly orbits around her at the same distance, her face always in view» | negations can cause exactly that |
| Lugar | «the interface of a program» | «in front of a dim, near-black scene filled with gray rectangular panels linked by thin red, blue, purple and orange lines, with a few magenta-filled boxes behind her» | the concrete place changed the background; the vague one did not ✅ |
| Encuadre + cámara | «extreme close-up» + «pulls back to a full portrait» | «close-up» + «slowly pulls back from close up to her shoulders» | framing beats camera ✅ |
| Gesto | «jumps and spins with her arms up» | «holds her chin high, barely moving, eyes on the camera» | invented athletics deform bodies; held poses + moving camera work ✅ |
| Efecto (card) | «wet red strands stuck to her cheeks» | «rain streaks crossing in front of her face under a gray-violet stormy light» | the first became red liquid twice ✅ |
| Lugar | «extreme close-up against a rain-slicked asphalt background» | «a neon-lit crosswalk at dusk behind her» | asphalt + «grounded» laid her on the floor ✅ |
| Estilo | «Cinematic city pop, photorealistic anime aesthetic» | «flat 2D anime illustration, flat painted light circles» | «photorealistic» made realistic backgrounds |
| Acción / movimiento | «she does something cool with the title» | «The title animation plays in the air above her.» (+ the clip as effect, the text item at the same time) | one action, tied to the reference that shows it ✅ |
| Sonido | «whooshes and impact hits accent each cut» | (empty) — just the music | regenerated sound effects put bangs into the song ✅ |

## A shot from an approved edit, field by field

The animated-title edit (26 Oct, approved), shot 2:
- Encuadre: `medium shot` · Estilo: `ilustration, digital painting` (the creative's text, kept as written)
- Efecto: `<Video 1>` (the title clip; its card tells the animation step by step)
- Lugar: `in front of a dim, near-black scene filled with gray rectangular panels linked by thin red, blue, purple and orange
  lines, with a few magenta-filled boxes behind her` + Fondo ref. `<Picture 2>`
- Gesto: `looks up in wide-eyed surprise as the letters slam in above her`
- Movimiento de cámara: `stays locked off on a tripod at the same distance for the whole shot, keeping her head, shoulders and
  the empty space above her head framed until the last frame` (leaves room for the letters)
- Acción / movimiento: `the title animation plays in the air above her`
- Text item at 2.75 s, «encima», font `<Picture 3>`: `slams in letter by letter as huge glowing letters, then the second part
  pops into a pink pill tag that slides left`

The reel edit (25 Oct, «muy muy bien»), one sentence per shot with the reel's scene and the character inside, «Sin entorno»,
the reel cited as effect: «<Subject 1>'s legs and sneakers walking over swirling psychedelic liquid neon…».

## Retouch prompts (step 2 «Retocar»)

- **Minimal**: one short sentence of how the masked zone must look **after**. The rest of the frame is kept by the app.
- **If you erase something, describe what is there instead, without naming the thing removed** («plain blue sky with soft
  clouds», not «remove the logo»).
- **References by number**: up to 4, cited as `<Picture 1>` … in the order you pass them («the bottle from <Picture 1> in her
  hand»).
- **Mask**: SAM text finds every object that matches («logo», «face», «phone»); a rectangle {x, y, w, h} in video pixels for
  anything SAM cannot name. Always preview it with ver_mascara: the pink must cover exactly what changes.
- **Do not chain a retouch over a retouch** (project rule): retouch the original edit again with a better mask or prompt.
- Segment: only the frames that need it (it is rounded up to 17·k+5 internally; only your range is replaced).
