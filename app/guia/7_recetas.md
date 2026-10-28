# 7 · Recipes, step by step

> Complete flows with the tool calls. The creative's choices are marked ASK. Replace the example values with theirs: these
> show the order and the shape, not an aesthetic to impose.

## A · Quick end-to-end test (22 frames, ~3 min) — tested 28 Oct ✅

Use it to check the plan cheaply before a long render, or to learn the app. It checks the pipeline, the references and the identity — **not the timing**: in
under 1 s, cuts and words came out earlier than asked in both test renders 🟢 (TETO asked at 0.50 s, seen at 0.34 s; DULCE at
0.17 s). Judge timing on a full-length render.
```
estado()                                             # GPU free? queue empty?
crear_proyecto(nombre="test_x")                      # or abrir_proyecto(<theirs>)
poner_resolucion(ancho=544, alto=960)                # quick vertical
poner_referencia(refmod="personajes/teto_primer_plano", papel="personaje", nombre="Teto", pronombre="she")
poner_referencia(refmod="objeto/piruleta", papel="objeto", nombre="lollipop")
poner_tomas(n=2, duraciones=[0.5, 0.42])             # total → 22 frames (0.917 s)
escribir_toma(k=1, momento="Teto turns her head toward the camera and smiles.", gesto="raises the lollipop next to her cheek",
              encuadre="close-up", camara="slowly pushes in on her face", conectar=["<Picture 2>"])
escribir_toma(k=2, momento="Her face fills the frame as the title lands.", encuadre="close-up",
              camara="stays locked off on a tripod at the same distance for the whole shot")
poner_texto(textos=[{"texto": "TETO", "t": 0.5, "sitio": "encima", "frase": "in huge bold white letters"}])
poner_cancion(archivo="stay_0_5s.wav", inicio_s=1.0)  # ASK: song and start
revisar_proyecto()
generar()                                            # → id
esperar(id=<id>)                                     # waits until «hecho» (call again if still running)
ver_video()                                          # frames: Teto with the lollipop, then «TETO» slams in at 0.5 s
```

## B · Edit with a character (5 s, 1 MP)

1. ASK: the character (which RefMod, or the creative uploads one in the page), the idea, the song and its start, the look.
2. `listar_refmods(buscar="<name>")` → `poner_referencia(refmod=…, papel="personaje", nombre=…, pronombre=…)`.
   Character card: what is seen (hair, eyes, clothes), one sentence; if the RefMod has none, write one or ask the creative to
   press «Describir».
3. Effects/styles they want: `poner_referencia(…, papel="efecto", ficha="<the cause, step by step>")` (Secundaria), or a text
   effect `poner_efecto_texto(frase=…)`.
4. `poner_cancion(archivo, inicio_s)` · `poner_duracion(5)` (→ 124 f) · `poner_tomas(n=5)` (cuts on the beats) or with
   `duraciones` (put one cut on the drop).
5. For each shot k: `escribir_toma(k, momento, gesto, encuadre, camara, lugar or entorno="ninguno", conectar=[effect tags])`.
   Each shot a different world; the last one a new world; close shots; held poses, moving camera.
6. Text: `poner_texto([...])` — one or two big words on the drop and the closing.
7. `revisar_proyecto()` → fix errors → tell the creative the warnings.
8. Quick test if they agree: keep the plan and lower only the resolution, `poner_resolucion(544, 960)` (5 s at 0.52 MP ≈ 7–8
   min). If the plan works, `poner_resolucion(768, 1344)` and, once they say yes, `generar(confirmado=true)` (≈16 min).
   A new resolution is a new draw: the final can differ from the test.
9. `ver_video(fotogramas=8)` → guia://revisar → seed first.

Approved shape (Ren, 20 Oct, «épico»): 5 shots in 5 s, cuts on beats with the drop at 1.60 s, every shot a close-up, each
effect «a filter on the face» with 2–3 named colours and an abstract background, words on the drop and the closing.

## C · Product edit

1. ASK: which product, the mood (commercial «glorify the product» is one of the app's preset families), the song and start.
2. **A clean shop photo of the product** works; a crop from another image does not 🟢. Role `objeto`, a short name («the
   perfume bottle»), a card of what is seen. If a person holds it, the person is `personaje`; the product becomes
   `<Subject 2>` — name it in the gesture («raises <Subject 2> toward the camera»). (Product phrasing is untested in a render:
   tell the creative.)
3. Shots: close-ups of the product in different worlds; the camera moves (orbits, push-ins), the product stays still.
4. Watch for copied logos and text from the photo: if the product's own label must stay, say so in the card; anything else
   with text, leave out.
5. As B, from step 4.

## D · Animated title copied from a clip — approved 26 Oct ✅

1. The clip of the animation is a RefMod (the creative uploads it in the page): role `efecto`, card that tells the MOTION step
   by step («a huge glowing white word slams in letter by letter, then shrinks into a pink pill-shaped tag that slides to the
   left…»).
2. Two shots, the cut on a hit of the song (2.75 s in the original). Shot 1: the movement ends inside it. Shot 2: `conectar`
   the clip, a **detailed still camera** that leaves room above the head, the action «The title animation plays in the air
   above her.»
3. `poner_texto([{"texto": "<their words>", "t": <start of shot 2>, "sitio": "encima", "letra": "<font tag, optional>",
   "frase": "<the same animation, in words>"}])`.
4. It came out at 960×544 with seed 2026102202 and not at 1344×768 with the same seed: if it fails, **change the seed first**.

## E · Copy another edit's style (the «reel method») — approved 25 Oct ✅

The whole reference reel as ONE RefMod clip in «Compressed» mode (~6,000 tokens; the creative makes it), role `efecto`, its card
naming its worlds in order; the reel's own song from 0:00; the reel's cut times as `duraciones`; one sentence per shot with
the reel's scene of that moment and the character inside, `entorno="ninguno"`, the reel connected. ~10 shots in 10 s, at 1 MP
(on a 24 GB pod).

## F · Retouch a logo (or any object) with SAM

```
listar_videos()                                      # pick the video
ver_video(video=<file>, fotogramas=8)                # find when and where the logo is
ver_mascara(video=<file>, mascara_texto="logo", inicio=1.0, fin=2.5)   # pink = what will be redone
retocar(video=<file>, mascara_texto="logo", inicio=1.0, fin=2.5,
        prompt="plain dark fabric with soft folds")  # what is there instead, without naming the logo
esperar(id=<id>) → ver_video(video=<the new retouch file>)
```
To put something specific in the zone, pass `referencias=["<RefMod name>"]` and cite it: «the red bottle from <Picture 1>».
If the pink covers too much or too little, change the text («the blue logo») or use `rectangulo={x, y, w, h}`.
