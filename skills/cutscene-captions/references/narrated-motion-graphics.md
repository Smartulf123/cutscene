# Captions for narrated motion graphics (no footage)

Written for Cutscene. Use this recipe when the video is HTML graphics with a Cutscene voiceover
and no camera footage: intros, explainers, promos. The rest of this skill (matting, safe zones,
embed, themes) is built around footage and is not needed here.

## What you need

- `.cutscene/beats.json` with checked voice lines: each beat's `voice.words` comes from
  `/cutscene-voice` (its check transcribes every line back and writes the word timings).
- The voice clips in `index.html` (`<audio src="assets/voice/<beat>.wav" data-start="…">`). The
  script reads where each one starts; without that, a line starts at its beat's `start`.
- Optional: `.cutscene/look.json` for colours and the font.

## Spoken text vs caption text

A voice line is often written the way it should be said: "A I", "three D", "twenty twenty six".
The caption should read "AI", "3D", "2026". The script picks each beat's caption text in this
order and uses it only when it lines up word by word with what was said:

1. `voice.display`: the caption text you set on purpose, for example
   `"display": "Tell your AI the video you want."`. Set it with the beat helper so nothing else in
   the file changes: `updateBeat(file, "b2", { voice: { display: "…" } })`.
2. `voice.heard`: what the voice check heard (usually already "AI" and "3D").
3. The spoken words, tidied: single capital letters in a row are joined ("A I" → "AI") and a
   number word before "D" becomes "3D".

Each caption word must match what is said, ignoring case and punctuation, with number words read
as digits ("3D" = "three D", "AI" = "A I", "&" = "and"). When `voice.display` doesn't line up, the
script says so and falls back; fix the display text rather than the timings. `--text line`
skips 1 and 2.

## Steps

1. Build and check the voice lines (`/cutscene-voice`), so every beat with a voice has `words`.
2. Make the rail, from the project folder:
   ```bash
   node "<this skill's folder>/scripts/beats-captions.mjs" . --dry-run   # shows the lines and timings
   node "<this skill's folder>/scripts/beats-captions.mjs" .             # writes compositions/captions.html
   ```
   Options: `--max-words 7` (words per line), `--position top`, `--font display`, `--track 9`,
   `--id captions`, `--json`.
3. Paste the host clip it prints into `index.html`, inside the root composition, on a track above
   the graphics. The root must load GSAP (it does in every Cutscene project) and declare the
   look's fonts with `@font-face`; the rail uses the look's body font and colours.
4. `cutscene check`, then `cutscene snapshot` at a few word times and look at the frames: the
   word being said is in the accent colour, words already said are full strength, words to come
   are dimmed.
5. When a voice line changes, run the script again; it replaces only the file it made (pass
   `--force` to replace a hand-made file of the same name).

## Rules

- Captions sit in the lower 15% of the frame by default; keep titles and lower thirds out of that
  band, or use `--position top` for a beat-heavy layout.
- One line at a time, at most about 7 words, broken at sentence ends and commas.
- The rail is data-driven: never retype word times by hand, and never copy the spoken text into
  the HTML yourself. Change `beats.json`, then run the script again.
