# The example project: Jane

MAX EDITOR opens with **«ejemplo»**: a colorful 8 s vertical edit of **Jane** in five graphic-poster worlds, with the words
ICON and LUXE on the beat. Pick it in **Proyectos › Abrir el ejemplo**: the app makes your own copy («mi ejemplo»), and
the original never changes. Press **Generar** and you get a first video in about 10 min on a 12 GB RTX 3060 (480×864), or
about 3.5 min on an RTX 3090.

The project is a template. Everything that makes it look good is fixed in the shots (the poster worlds, framing, camera
moves, timing and words), and the character is only the main reference. Put any character in, and the edit follows.

## What is in this folder

| File | What it is | Where the app puts it |
|---|---|---|
| `refmods/jane.safetensors`, `refmods/jane.png` | Jane, the main reference (a RefMod for H3) | `ComfyUI/models/refmods/ejemplo/` |
| `input/velvet_rush.mp3` | the song (the edit uses 8 s from second 4) | `ComfyUI/input/` |
| `../proyectos/ejemplo.json` | the project | — |

The app copies the files when it starts (`servidor.py › poner_ejemplo`). It only adds what is missing and never deletes anything.

## Challenges

Each one shows one part of the app. Work on your copy.

1. **Your character.** In References, remove Jane and add your own photo as «Principal», with a name. Generate. If the
   style is not a stylized 3D painting, change «Estilo» in the five shots to the style of your character.
2. **Your words.** In the blue text track, change ICON and LUXE for your own words (short words come out cleaner).
3. **Another world.** Open shot 4 and rewrite «Lugar» with a poster world of your own. Change only that and generate
   with the same seed, to see what one field does.
4. **Retouch.** In step 2 «Retocar», draw a rectangle over something you do not like (a word, a hand) and redo only that zone.
5. **Make it longer.** In «Extender video», add 2 s to the end of your video: the same shot goes on, without a cut.
6. **Your montage.** In step 3 «Edición», join pieces of two of your videos on the timeline and export them.

## With your AI agent

Start the app (`app/arrancar.sh`), connect your agent to its MCP server
(`claude mcp add max-editor --transport http http://127.0.0.1:8301/mcp`) and paste:

```
Open MAX EDITOR's example project «ejemplo» as a copy and read it with ver_proyecto. Replace Jane with the character in
<path to my photo> as the main reference, keep every shot, word and timing, and adapt the style of the five shots to my
character. Run revisar_proyecto, show me what you changed in the page, then generate a quick test and tell me, shot by
shot, what you see.
```

The agent works in the same project you see in the page, and everything it touches gets a pink «✎ agente» mark.

## License of the example material

- Jane (`refmods/jane.*`) is by the author of MAX EDITOR and is shared under **CC BY 4.0**: you can use and change it,
  also in your own edits, if you credit «MAX EDITOR example (xentome)».
- The song (`input/velvet_rush.mp3`) is a royalty-free track from a music website, renamed for the example. It is not
  covered by CC BY 4.0: use it only to try the app.
- The code of the app is Apache-2.0 (see `LICENSE`).
