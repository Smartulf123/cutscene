# Cutscene captions

Designed, word-timed captions on talking-head or narrated video. Word timings come from local
transcription (`cutscene transcribe`) or, for a Cutscene voiceover, from the `words` that
`/cutscene-voice` writes into `.cutscene/beats.json`. Nothing is sent to a cloud service.

- **Ask before downloads.** The caption QA helpers need Puppeteer, Sharp and GSAP in the caption
  project, and matting downloads a model on first use. Say what will be downloaded and its size,
  and wait for the user's OK.
- **Fonts:** pick caption type that matches the project's `.cutscene/look.json` when there is one;
  the bundled fonts in `modes/standard/fonts/` render offline.
- **Never render the final video unless the user asks.** Previews and stills are fine.
- **Narrated motion graphics with no footage** (a Cutscene voiceover over HTML graphics): skip the
  matting pipeline below. `node "<this skill's folder>/scripts/beats-captions.mjs" <project>`
  turns the voice word timings in `.cutscene/beats.json` into a word-highlight caption rail
  (`compositions/captions.html`), showing "AI" and "3D" where the voice says "A I" and "three D".
  Recipe: [references/narrated-motion-graphics.md](references/narrated-motion-graphics.md).

This skill does NOT cut silences, retakes or filler words (`/cutscene-edit`), make or check a
voiceover (`/cutscene-voice`), or mix music (`/cutscene-audio`).
