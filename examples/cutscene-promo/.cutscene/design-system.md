# Design system: Cutscene launch video

Shared rules for every scene in this video, so the scenes look like one piece. Read this along with
`look.json`, `beats.json` and `brief.md`.

## Structure

- `index.html` is the host. It owns the background, the grain and vignette, the cut transitions
  between scenes, the captions rail, the voice `<audio>` and the music and sound effects.
- Each beat is one sub-composition: `compositions/b1-raw.html`, `b2-prompt.html`, `b3-edit.html`,
  `b4-logo.html`, `b5-montage.html`, `b6-voice.html`, `b7-studio.html`, `b8-end.html`. Its
  composition id is the file name without `.html` (for example `b3-edit`). A Three.js shot is its
  own sub-composition (`compositions/scene3d-*.html`), mounted by the scene that uses it.
- The narrator's voice, the music and the sound effects live in `index.html`. Kasper's own sound
  plays from his footage `<video>` elements inside `b1-raw` and `b3-edit` (not muted there; every
  other video is `muted`).
- Sub-composition time starts at 0 at the beat's `start`. Its length is the beat's length.
- **Scope every class and id** with the scene's prefix (`s3-step`, `#s3-title`). All the scenes end
  up in one document, and a bare `.title` in one scene would restyle another.
- A scene's root is transparent. The host paints the background.

## Colour (from look.json; use these CSS variables)

```css
--bg: #0F0B1A;      /* violet ink: the frame */
--fg: #F4F0FF;      /* text */
--accent: #FF3D9A;  /* magenta: the "cut", the one thing to look at */
--accent2: #6CE6FF; /* ice cyan: secondary highlight, data, playheads */
--raised: #1A1430;  /* panels, cards, the chat box */
--line: #2E2550;    /* hairlines, panel borders */
--muted: #9C93B8;   /* secondary text */
```

Magenta is rationed: one magenta thing per frame, at most. Small text never sits on a magenta
fill (contrast 3.1:1); put dark `--bg` text on it, or keep it free of text.

## Type

- Display: **Space Grotesk 700**, from `assets/fonts/space-grotesk-latin-700-normal.woff2` (declare it with
  `@font-face` inside the scene's `<template>`; the path is relative to the project root, so
  from a sub-composition it is `../assets/fonts/...`). Tight tracking, -0.03em at large sizes.
- Body and UI: **Source Code Pro 400/600** (the engine provides it; no `@font-face` needed).
  Use it for labels, code, the prompt, the beat sheet.
- Sizes at 1920x1080: display 96 to 260 px, labels at least 30 px, body at least 34 px.
- Sentence case. No all-caps labels, and no letter-spaced eyebrow text over headings.

## Motion (character: cinematic)

- Entrances use `expo.out` (0.6 to 0.9 s) or `power4.out`; exits use `power3.in` (0.3 to 0.4 s).
  Whole-frame moves use `expo.inOut`.
- Masked reveals: text rises out of an `overflow: hidden` line box (yPercent 110 to 0). This is
  the video's signature for type.
- Things land on the spoken word. Use the word timings in `beats.json` (`voice.words`, relative
  to the voice file; the voice starts at the beat's start plus the offset given in the scene notes).
- A slow camera drift on most scenes: the scene's content group scales 1.0 to 1.04 over the
  beat (`sine.inOut`). It makes still frames feel filmed.
- No bouncing, no elastic, no rotation for its own sake.
- Deterministic only: no `Math.random()`, no `Date.now()`. A seeded generator (mulberry32 with a
  fixed seed) is fine.

## The cut (the recurring device)

The logo is a rounded square with one vertical bar: a cut. In this video a single magenta bar
(about 22 px wide, full height, slight 6 degree slant) sweeps across the frame at every beat change,
and the next scene is revealed behind it. `index.html` draws it. Scenes don't draw their own
transition wipe. They start fully composed by about 0.35 s and can hold their last frame.

## Footage (the real thing; this video's point)

- Real footage, not illustrations of it, carries this video. Files are in `assets/footage/`
  (1920x1080, 30 fps, already trimmed): `take-raw.mp4` (Kasper's raw take with sound, 3.6 s),
  `take-clean.mp4` (his take after Cutscene cut the pauses and the retake, with sound, 11.9 s),
  `take-vertical.mp4` (the same, reframed to 9:16 by Cutscene, 606x1080 crop scaled up, silent),
  `take-cutout.webm` (Kasper with the background removed, alpha, 3.3 s), `rain-street.mp4`,
  `coast-aerial.mp4`, `city-bokeh.mp4`, `developer.mp4` (Pexels, silent, 3.5 s each).
- Show footage big: full frame or a large panel. Never shrink it to a thumbnail for long.
- Don't fake what Cutscene did. Numbers, cut positions, captions and the vertical crop come from
  the real files in `.cutscene/edit/` and `beats.json`.
- Footage gets the look's treatment only where the scene says so (the grade shot). Otherwise
  leave Kasper's skin tones natural; the host vignette and grain sit on top of everything.

## Layout

- Safe area: 120 px from the left and right edges, 96 px from the top and bottom. Captions sit at
  the bottom in a 72 px band at y = 940 to 1012, so scenes keep their content above y = 900
  unless the notes below say otherwise.
- Left-aligned, generous negative space, one focal point per frame.
- Panels (chat box, beat sheet, preview window): `--raised` fill, 1.5 px `--line` border, 22 px
  radius, no drop shadows except a soft glow where noted.
