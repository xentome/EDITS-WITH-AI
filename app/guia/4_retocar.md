# Changing an existing video

> Three ways to work on a video that already exists, without regenerating the whole edit.

## Retouch (page: «Añadir o detallar»; redo a masked zone)
- The mask is SAM text (finds every match: «logo», «face») or a rectangle in video pixels. preview_mask previews it; SAM
  «face» has missed goggles and caught faces in screenshots.
- The prompt says how the zone looks AFTER, briefly. To erase something, describe what is there instead without naming it.
- Up to 4 references, cited <Picture 1…> in the order passed. A face crop of the character helps identity.
- The segment is rounded up to 17·k+5 frames internally; only your range is replaced. A mask that ends early lets the
  original reappear in the last frame (seen 30 Oct).
- Three modes: change (strength 0.40–1.0: lower keeps shape and motion) · refine (video to video at higher detail,
  denoise 0.10–0.80, canvas 384–1024; the face preset is mask «face» + the face photo + 0.30 / 768) · remove (LanPaint,
  no references, 1–4 passes; slow: ~10 min per 5 s on 12 GB). Megapixels 0.12–0.6 for change (up to 1.0).
- Retouching a retouch accumulates damage: retouch the original again instead.

## Extend (same shot, longer, no cut)
- H3 reads the video's last frames (overlap, 39 by default: the only value exact on the audio grid) and continues them;
  the app keeps only the new part. The last frame is always added as a reference.
- A new place or camera is a cut, not an extension.
- From the saved latent there is no loss; from an mp4 there is a little colour loss at the join.
- If the end is frozen, the extension continues the freeze.
- Each chained extension drifts colour and identity a bit more; adding the project's references slows it.

## Enhance (Super Resolution / HDR)
- NVIDIA RTX nodes, seconds. Last step, on the approved video. The result is a new video.

## Editing (join pieces, no GPU)
- The timeline (V2 over V1, audio tracks) belongs to the creative too: read it with view_timeline before changing it and ask
  before replacing a non-empty one. Export joins with ffmpeg.
