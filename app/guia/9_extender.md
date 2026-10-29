# 9 · Extend a video («Extender video»)

> Make a video longer by continuing the SAME shot from its last frames, with no cut. Page: step «Retocar» › tab «Extender
> video» (next to «Inpainting / detalle»). Tools: ver_extension (plan, no GPU) and extender (queues it).

## What it does (and what it does not)

- H3 looks at the **end of the video** (the «solape», 39 frames ≈ 1.6 s by default) and continues it: same motion, same
  camera, same character, and the same sound. The app throws the re-rendered overlap away and glues only the new part after
  the original. Under the hood: the end is planted at the start of an empty latent and frozen with a noise mask (the
  drozbay/ablejones method, node «😺NKD AV Latent Extend»; ComfyUI core treats frozen rows as clean context).
- It is **not** a new shot. A camera change, a new place or a jump in time is a cut: plan it as a shot in a new edit
  (guia://organizar). Extend is for «a bit more of this».
- The result is a normal video in «Mis videos» (type extension) and **can be extended again**.

## The settings

| Setting (page) | Values | What to choose |
|---|---|---|
| «Cuánto se alarga» · `nuevos` | steps of 17 frames: 17 (0.71 s), 34, 51, 68 (2.8 s, default) … 204 (8.5 s) | What the creative asks. H3 renders solape + nuevos, so a long one costs memory (see below). |
| «Cuánto del original ve H3» · `solape` | 22 · **39** · 56 · 73 frames | Keep **39**: it is the only one exact on the audio grid (39 f = 65 audio steps). 22 = faster but follows the motion less; 56/73 = more memory of the motion, slower. |
| «Calidad» · `calidad` | rapida (~0.25 MP) · media (~0.5 MP) · **original** | rapida to check the motion quickly (the new part looks softer); original for the final. Only «original» can use the saved latent. |
| «Audio» · `audio` | **entrada** · modelo | «entrada»: the song the video was made with carries on from the exact second the video ends (the original keeps its sound). «modelo»: H3 makes the new part's sound from the video's own audio. Keep «entrada» unless the creative asks for H3's sound. |
| «Qué pasa después» · `prompt` | optional, short English | Empty = same action, same camera. Write only what happens next: «she keeps looking up at the logo and breathes softly». |
| References · `referencias` | up to 4, cited as <Picture N> | The project's character / product / logo: they keep colour and identity from drifting. The app ALWAYS adds the video's last frame as one more reference, after yours (so yours keep their numbers) and cites it in the prompt itself. |

## Where the end comes from: latent or mp4

- Every video the app generates (Generar and Extender, since 28 Oct) saves its **latent**. With «original» quality the
  extension continues from it: no loss. ver_extension says «from its SAVED LATENT».
- Otherwise (an outside mp4, an older video, another quality, or a retouch that changed the end) it continues from the
  **mp4**, encoded again: it loses **a little colour** at the join. Still usable; say it to the creative.
- A retouch that did NOT touch the end uses the latent of the video it came from.

## Audio, exactly

- Video from a project **with a song**: the song carries on right where it was (it guides H3), and at the end the song is
  laid on top untouched from its start. If the song is shorter than the new length, the rest is silent: ver_extension warns.
- Videos without a noted song (older than 28 Oct) use the project's song **as it is now**: if the creative changed it, use
  audio=«modelo».
- **No known song** (outside mp4, or a video made with H3's audio): the original keeps its sound and H3 continues the sound
  of its last seconds.

## Before you run it

1. ver_video on the **last second** of the video (desde = length − 1): what is moving? Is it **frozen**? H3 often reaches its
   last frame early and freezes; continuing a frozen end continues a freeze. If it is frozen, tell the creative (a shorter
   solape will not fix it; retouching or regenerating the end is their call).
2. ver_extension → tell the creative where the end comes from, the audio and the time; ask before anything long.
3. Time on the RTX 3060: about 3–4 min per 39 frames rendered at 960×544; «rapida» is about half. A window longer than ~5 s
   at ~1 MP may not fit in 12 GB: use «media» or fewer frames.

## After: what to look at

- ver_video around the join (desde = original length − 1 s, hasta = + 1.5 s): does the motion carry on without a jump?
- The end of the new part: **colour drift** (it gets more contrasted or redder; measured: logo going from magenta to red in
  3 s), **identity** (the face changes a little), small background details that change (numbers, letters), a **freeze**.
- What to change first: 1) add the project's references (the logo, the character) · 2) another seed · 3) a clearer prompt
  of what happens next · 4) a shorter extension. Chaining many extensions adds drift: other users see it grow after the 4th–6th.

## Why the last frame is always a reference

- Measured on 28 Oct: an outside mp4 extended with an EMPTY prompt and no references → the overlap was kept, but the new part
  was a different scene (another body, no face). With the last frame as a reference and the prompt citing it («same subject,
  same clothes, same place»), it continues the shot. Never remove it; if you write a prompt, describe only what happens next.

## Known limits

- SPEED cannot be used here (it refuses noise masks); Extend runs Singularity + VDN turbo, 8 steps, like Retocar.
- The last ~5 frames before the join were decoded without «future» frames (VAE window): a very slight seam is possible.
  The fix (decode the original's latent with the next 5 new tokens) is noted for later, not built.
- An extension recovered after a server restart does not note its latent: extending it again goes through the mp4.
