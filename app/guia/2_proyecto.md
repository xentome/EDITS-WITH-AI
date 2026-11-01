# How a project becomes H3's prompt

> The structure you fill and what each part does. view_project(with_prompt=true) shows the result; check it after changes.
> Field names are write_shot's parameters; the page shows them in the creative's language.

## The shot line
Each shot is glued from its fields in this order (empty fields are left out):

`[Shot k] At 00:SS.mmm <framing>, in the style of <style>, <effect card>, like the effect in <ref>. <place> like the place
in <background_ref>: <Subject 1> <gesture>; the camera <camera>. <action>.`

So: gesture continues a sentence after <Subject 1> (a verb phrase), camera continues «the camera …», and action (page:
«Acción / movimiento») is the full sentence of what happens — the field H3 follows most.

## environment and place
- manual = your place text is used. auto = the local LLM writes it; with the LLM off, the place stays EMPTY.
  none = no place (effect-only or reel shots).
- A background reference adds «like the place in <ref>»; it works best together with a written place.
- A reference with role place already adds «in the … shown in <ref>»: write in place only what is seen, not its name
  again, or the place is said twice.

## Reference roles
| role | Reaches H3 as |
|---|---|
| character | `<Subject 1>` with its card, kept in every shot where it appears. Same name = same character. A second character with another name is `<Subject 2>` in the shots that connect it. |
| object | `<Subject N>`: a thing that must stay the same |
| place | a fixed place for the shots that use it |
| clothes / pose | only the clothes / only the posture of another picture |
| background | only the background of a shot (`like the place in <ref>`) |
| style | only the drawing style |
| effect | an example of an effect or a whole reel; its card goes after the framing |
| font | the font of a word in the text track |

- main (page: «Principal») = in every shot. Otherwise («Secundario») only where you connect it (write_shot connect).
- A pack (several photos in one RefMod, page: «grupo») arrives as <Video N>; it is still a picture reference, not motion.
- The card is what H3 reads about the image: one English sentence of what is seen. For an effect clip, its motion step by
  step.
- Inside fields, cite references by their current tag and the character as <Subject 1>.

## Text track and song
- Text items: text, start, «over» (over the image) or «beside» (beside the character), optional font_ref and a look
  sentence. The prompt ends with «No other text appears on screen».
- The text templates assume the character is in the shot («beside <Subject 1>»).
- The song and the second its segment starts are the creative's choice. With no song, cuts are even and the sound comes
  from set_sound.

## Two shots that worked (shape, not aesthetic)
- Stylised, 26 Oct: framing `medium shot` · place `in front of a dim, near-black scene filled with gray rectangular panels
  linked by thin red, blue, purple and orange lines` · gesture `looks up in wide-eyed surprise as the letters slam in above
  her` · camera `stays locked off on a tripod at the same distance for the whole shot, keeping her head, shoulders and the
  empty space above her head framed until the last frame` · action `The title animation plays in the air above her.` with
  the title clip connected as effect.
- Narrative, 31 Oct: framing `Medium shot of <Subject 1>` · place `the bare grey metal cabin of a small plane with red bucket
  seats, a red cargo net and an open side door showing an orange sunset sky` · camera `stays still at chest height` ·
  action `<Subject 1> stands inside the plane in front of the open door and looks straight at the camera.`
