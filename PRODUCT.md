# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React in `app/ui/`, built to static files that the existing Python server (`app/servidor.py`, aiohttp, 127.0.0.1:8300) serves. The backend stays as it is: `app/servidor.py`, `app/generar.py`, `app/retocar.py`, `nucleo.py`, with ComfyUI driven through the Comfy SDK and `comfy-api-proxy`. Chosen by the user on 27 oct 2026.

## Users

- **Primary:** a creator who makes AI music edits (short vertical videos cut to a song) on their own PC with ComfyUI and MiniMax H3. They are the creative: they decide the story, the references and the look; the app gives them tools, not creative plans.
- **Secondary:** the judges of Comfy's «Open Source Higgsfield» contest (deadline: Friday 30 Oct 2026, 10:00 Mexico City time). They install it from the repo or watch a 2-minute video, and want «a standalone app, not a ComfyUI workflow; something someone else can open and use».

## Product Purpose

MAX EDITOR turns an idea, a song and a few reference images or clips into a music edit generated with MiniMax H3, entirely local. It also retouches the result: you pick a segment, mask a zone (by text with SAM or with a rectangle), give reference images of what must appear, and H3 repaints only that zone. Success: the creator makes a high-quality, artistic edit by hand, without ever seeing the ComfyUI graph.

## Positioning

- No other contest entry combines music edits, character and product references, and an inpainting retouch editor.
- The prompt comes from the user's own fields, joined by visible code phrases («the code only glues»), with an optional local LLM. It is not written by a cloud model.
- It runs on the user's PC with open weights. The Comfy SDK lets the same code run on Comfy Cloud.

## Operating Context

- The flow, in order: **References** (character that never changes + borrowed backgrounds, styles, effects, lettering) → **Story** (idea, style, sound, arc, light) → **Shots** (timeline with shots, on-screen text and song segment; per shot: action/movement, gesture, place, framing, camera movement, light, background, connected references and what each does) → **Generate** → **Retouch**.
- A video takes about 3–16 minutes on an RTX 3060 (12 GB). Retouching a 39-frame segment takes about 3–4 minutes.
- Status the creator needs: ComfyUI, the SDK proxy and the local LLM (llama.cpp, Qwen3.8), each up or down.
- Content in fields is written in English (H3 reads it as is). The interface is in Spanish, with English available (`web/i18n/es.json`, `en.json`).

## Capabilities and Constraints

- **Generate:**
  - MiniMax H3 via the Comfy SDK; valid lengths are 17n+5 frames; size in multiples of 32.
  - The seed matters a lot; «try another seed» is a first-class action.
- **References:**
  - upload a photo or video; crop it; RefMod full or compressed mode;
  - roles: character, object, clothes, pose, place, background, style, effect, lettering;
  - each one has a tag `<Picture N>` / `<Video N>`.
- **Retouch:**
  - segment of 17n+5 frames; mask by text (SAM 3.1) or rectangle;
  - up to 4 reference images, each croppable;
  - the result is spliced back into the full video with the original audio.
- **Projects:** they autosave; the example project opens as a copy.
- **Tracked in the existing app:**
  - the current window lives in `web/editor/*.js` and `app/web/*`;
  - the redesign must keep every existing function;
  - the inspiration mockup is in `maqueta/inspiracion/` (4 steps) and on the canvas https://claude.ai/artifact/QYAK6wNqK2ehUDpzmvYd6P.
- **Undecided:** the final app name stays MAX EDITOR; whether the contest video shows English or Spanish UI.

## Brand Commitments

- **Name:** MAX EDITOR. The demo title reads «MAX EDITOR for MINIMAX H3» (`input/minimax_h3/image (443).png`).
- **The user's theme direction (26–27 oct):** matte black in the top-left corner to dark violet in the bottom-right; a medium blue accent; text fields in dark blue with very light text; a dark wine-red story card; timeline shots in very dark red-to-black. The user treats this as a starting point to refine, not a lock.
- **Visual assets:** images and mockups are generated with the user's local ComfyUI using **Flux Klein** (`flux-2-klein-9b`, `flux3_image_klein`); that covers both concept comps and in-app assets.

## Evidence on Hand

- The real demo project: the girl of the demo, the animated title clip, the ComfyUI node background and the MAX EDITOR logo.
- Real generated edits: `~/Escritorio/experimentos_edit/receta_*`, `app/salidas/`.
- No testimonials, users, benchmarks or press exist; do not invent them.

## Product Principles

1. The creator is the creative: the app gives data, tools and space, never creative plans.
2. Show the step you are on: one primary action per screen, expert options folded away.
3. Nothing hidden in the prompt: every phrase the code adds can be seen and changed.
4. Fast iteration beats perfect first tries: short segments, low resolution and another seed are always one click away.
5. Local first: it works on the creator's PC with open weights.

## Accessibility & Inclusion

Contrast at least 4.5:1 for text, targets of at least 40–44 px, real labels on every field and a name on icon-only buttons (the 27 oct UI audit found these missing).
