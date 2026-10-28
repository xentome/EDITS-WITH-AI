# 3 · How to organise a video that works

> Shots, their fields, references, text and song. Examples are real fields from edits the creative approved (recipes in
> `~/Escritorio/experimentos_edit/receta_*`). Use them to learn the SHAPE, not to copy their aesthetic.

## The plan before the fields

- **Ask the creative for the idea, then translate it** into shots. If the idea is realistic, ask for the person's **role**
  (who they are and what they do): in realism the role and its story make the edit, not the effects (every realistic test
  without a role failed; «Vera» as a racing-street fashion icon was «excelso»).
- The creative's four criteria of a good stylised edit (confirmed by them): **each shot is a different visual world**,
  **typography is a protagonist**, **the effect transforms the character** (not a photo with an overlay), **graphic, saturated
  style**. Mention them as questions, not as decisions.
- Variety comes from **concrete things** (a named place, a pose with an object, different clothes per shot, one effect per
  scene), not from adjectives («casual», «city pop») ✅.
- **The closing shot is a new world**, not a return to the first (with «return», H3 repeated shot 1).

## Shots and durations

- 5 s (124 f) with 4–6 shots, or 10 s (243 f) with ~10 shots, are the tested shapes. Every shot ≥ 0.4 s; aim for 0.5–2 s; a
  movement with a pause and then an accelerating push-in needs 4–5 s to be seen.
- **Without durations**, poner_tomas puts the cuts on the song's beats (automatic). **With durations** the cuts are «by hand».
  To copy another edit's rhythm, use its cut times (reel recipe: 0 · 0.417 · 1.000 · 3.250 · 4.708 · 5.583 · 6.542 · 7.000 ·
  8.125 · 9.500 s in 10.125 s).
- Put a cut on the song's strongest hit: H3 cuts there anyway.
- **Longer than ~5 s on 12 GB**: plan the whole thing as one story in **two halves, each with its own events** (the second half
  cannot be «keeps falling»), generate them as two clips cut on a shot change and join them: the cut does not show ✅. The
  creative joins them today; «Continuar» (extend a video) is coming soon.

## The shot panel, field by field (all in English)

| Field (page label) | What goes there | Real example |
|---|---|---|
| **Acción / movimiento** (momento) — MAIN | one sentence: what happens in the scene | «The title animation plays in the air above her.» |
| Gesto | what `<Subject 1>` does with the body; continues «<Subject 1> …» | «looks up in wide-eyed surprise as the letters slam in above her» |
| Encuadre | extreme close-up · close-up · medium shot · full shot, or your own | «medium shot» |
| Movimiento de cámara | continues «the camera …»; one movement that ends inside the shot | «starts hidden behind her open palm, which slides away to reveal her surprised face, then gently pushes in a little closer on her face» |
| Luz (optional) | the light | «warm sunset light with pink neon reflections» |
| Lugar + Entorno | the place, by what is SEEN (shapes, colours, light); «manual» when you write it, «auto» lets the LLM choose, «Sin entorno» for effect-only or reel shots | «in front of a dim, near-black scene filled with gray rectangular panels linked by thin red, blue, purple and orange lines» |
| Estilo | the drawing style of this shot; empty = the style references | «flat 2D anime illustration» |
| Efecto de la referencia (efecto_frase) | overrides the effect reference's card in this shot | — |
| Fondo ref. / Referencias | which references this shot uses (conectar) | `<Picture 2>` |

Lessons that decide these fields:
- **The written place beats the background reference's card** ✅: the background changed as soon as shot 2's place described
  it concretely; the name or the card did not.
- **Framing and camera must ask for the same thing** ✅. A camera move with an end («accelerates into an extreme close-up of her
  eyes») can spill into the next shot: end it inside its own shot, and describe a still next shot in detail.
- **Poses held, camera moving** works; invented athletic actions do not.
- Only **close shots** read the character well; far shots lose them.
- Write **without negations**, without numbers inside the motion («turns 90 degrees» → «turns her head toward the camera»).

## References: roles and how to cite them

| Role (papel) | Side | Use | How it reaches H3 |
|---|---|---|---|
| personaje | Principal (default) | who it is: name, pronoun, card; same name = same character | defined as `<Subject 1>`, kept the same in every shot ✅ |
| objeto | either | a product that does not change; give it a name | becomes `<Subject 2>`; name it in the gesture («raises <Subject 2>») 💡 untested in a render |
| lugar | either | a fixed place for the shots that use it | «in the … shown in <Picture N>» (one render) |
| ropa | Secundaria | only the clothes of another photo | «wearing the red racing jacket from <Picture 1>» ✅ |
| pose | Secundaria | only the posture (faces blurred, strength 0.3 worked) | «in the pose of <Picture 5>» ✅ |
| fondo | Secundaria | only the background of a shot | «like the place in <Picture 10>» |
| estilo | Secundaria | only the visual style | in the style line |
| efecto | Secundaria | an example of an effect, or a whole reel compressed | its card goes right after the framing: «Close-up, <card>, like the effect in <Picture 1>.» ✅ |
| letra | Secundaria | the font of a word in the text track | «in the lettering style of <Picture 5>» |

- **Principal** = goes in every shot (the character starts there). **Secundaria** = only where you connect it
  (escribir_toma(conectar=[…])). One shot carries an outfit OR borrowed clothes, never both; a shot in a fixed place has no
  background reference.
- **The card (ficha) is what H3 reads** about the image: one English sentence of what is seen. For an **effect clip, tell its
  motion step by step**: «a motion-graphics title: a huge glowing white word slams in letter by letter, then shrinks into a pink
  pill-shaped tag that slides to the left while a second bold word pops in beside it, and a thin subtitle types out
  underneath» ✅. Do not re-describe the character's looks in shots: their RefMod and card already do it.
- Inside any text field, cite references as `<Picture N>` / `<Video N>` and the character as `<Subject 1>`. Tags can shift when
  references are added or removed: always read the current tags from the tool answer or ver_proyecto.
- **Text-only effects** (E1, E2…): a sentence with no image, for drawing changes («face redrawn as clean line art with a flat
  fill that switches color every beat»).

## Text track

- Few, big words; each with its time, «encima» (over the image) or «al_lado» (beside the face), optionally a font reference
  (role letra) and a sentence of how it looks or moves.
- **Animated title** ✅: the text starts with the shot that cites the animation clip (role efecto), goes «encima», its sentence
  repeats the same animation, and that shot has a detailed still camera with room for the letters.
- A **font reference photo copies its own text as a watermark** at high strength or 1 MP 🟢 → use a picture with only the
  letters, or describe the font in words.
- The prompt ends with «No other text appears on screen.»: do not ask for small text (labels, notes, barcodes): it comes out as
  garbage.

## Song

- **The creative chooses the song and where the segment starts. The app does not pick «the best moment», and neither do you.**
  Ask: which song (listar_canciones) and from which second. Then poner_cancion. If they want, suggest putting a cut on the drop.
- The segment lasts as long as the edit; changing the duration rewrites the cut for you.
- Keep «Audio del video» on «Tu canción» (the song as is): H3's regenerated audio added bangs ✅. «Sonido» empty = only the
  music, the safest.
