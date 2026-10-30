# Cutscene compose

The composition contract for one renderable Cutscene video project, plus two companions in this
folder:

| Need | Read |
|---|---|
| Build or fix a composition: structure, `data-*` timing, clips and tracks, sub-compositions, variables, media, determinism | this file, then `references/` |
| A video brief that is not a promo, a caption job or a footage edit | [general-video/GUIDE.md](general-video/GUIDE.md) |
| Ready-made blocks and components (`cutscene catalog`, `cutscene add`) | [registry/GUIDE.md](registry/GUIDE.md) |

Rules that come first:

- **The look is decided before the HTML.** Read the project's `.cutscene/look.json` (made with
  `/cutscene-design`) and use its palette, fonts and motion character instead of any colours or
  fonts in the examples. Copying an example's styling is how every video ends up looking the same.
- **Times come from the beat sheet.** When `.cutscene/beats.json` exists, every clip's start and
  duration comes from its beats (seconds on the final timeline), so voice lines, 3D clips and
  graphics land together.
- **Search before hand-authoring.** `cutscene catalog --query "<the move in plain English>"`
  first; author by hand only when nothing fits.

This skill does NOT pick the look (`/cutscene-design`), write motion (`/cutscene-animate`), place
music or sound effects (`/cutscene-audio`), make voices (`/cutscene-voice`), make 3D shots
(`/cutscene-3d`), edit footage (`/cutscene-edit`) or render (`/cutscene-render`).
