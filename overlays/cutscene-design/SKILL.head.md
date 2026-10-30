# Cutscene design

How a Cutscene video looks, decided before anything is built.

## Step 1, every video: make its look

Each video gets its own `.cutscene/look.json` (palette, type pair, motion character, texture),
generated from the approved brief and the user's brand. **Never reuse the previous video's look
unless the user asks for it.** Full guide: [references/look-system.md](references/look-system.md).

```bash
node "<this skill's folder>/scripts/look.mjs" new --brief .cutscene/brief.md --against <folder with earlier projects> [--brand brand.json]
node "<this skill's folder>/scripts/look.mjs" check .
```

Gate: `look check` passes, and `look new --against` (or `look compare --strict`) found no earlier
video that looks the same. Show the user the look's name, palette and fonts in one line, and
record it in `.cutscene/project.md`.

## Then

| Need | Read |
|---|---|
| Frame presets, palettes, typography, visual styles, beat direction, narration, storyboards | this file, then `references/`, `frame-presets/`, `palettes/` |
| Remembered preferences and frozen recipes (local memory across videos) | [memory/references/memory.md](memory/references/memory.md) |
| Importing a Figma design (optional; the user sets their own `FIGMA_TOKEN`, never pasted into chat) | [figma/GUIDE.md](figma/GUIDE.md) |

The presets and palettes below are starting points, not house styles: remix every one onto this
video's `look.json`.

This skill does NOT write motion code (`/cutscene-animate`), compose the HTML
(`/cutscene-compose`), design or speak voices (`/cutscene-voice`), or make 3D renders
(`/cutscene-3d`).
