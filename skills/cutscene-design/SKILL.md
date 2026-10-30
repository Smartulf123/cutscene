---
name: cutscene-design
description: "Use when deciding how a Cutscene video looks before building it, or when the user says their videos look samey or wants another palette or font: the per-video look system (look.json with palette, background tone, type pair, motion character and texture, generated from the brief and the user's brand colours and fonts, checked for contrast and for being too close to earlier videos), frame presets, palettes, typography, visual styles, beat direction and narration planning, and optional Figma import with the user's own token. Does NOT run the brief and storyboard gates (cutscene), write motion code (cutscene-animate), compose the HTML (cutscene-compose) or make voices (cutscene-voice)."
---

<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

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

## How to run cutscene commands

In this skill, `cutscene <command>` is shorthand for:

```bash
node "<this skill's folder>/../cutscene/scripts/cli.mjs" <command>
```

Replace `<this skill's folder>` with the folder this SKILL.md was loaded from. Scripts named `<this skill's folder>/scripts/...` run with plain `node`. Never call the engine through `npx`, and never use cloud commands: Cutscene works on this computer only, and it never renders a final video unless the user asks.

# Cutscene Creative

Brand, pacing, style, narration, and composition direction. Use after the technical contract from `cutscene-compose` is in place.

For motion patterns, scene blueprints, transitions, and CSS marker effects, use `cutscene-animate` — this skill is intentionally non-animation.

> **Read these two FIRST for any non-trivial composition — they override web instincts:**
>
> - `references/house-style.md` — "interpret the prompt, generate real content," the lazy-default list, and the background/foreground layer recipe. This is what turns a literal restyle into a _concept_.
> - `references/video-composition.md` — video-medium scale, depth, and foreground detail. It explains how to avoid empty web-page layouts without imposing a universal element count.
>
> Skipping these is the single biggest cause of generic, web-page-looking output. They are not optional rows in the routing table below — for anything beyond a one-line edit, open both before you choose colors or write HTML.

## Workflow

1. Make or read this video's `.cutscene/look.json` first (the look system at the top of this file); its palette, fonts and motion character win over every preset default. If the project also has a design spec, **read it first** and treat its frontmatter tokens as brand truth (colors, fonts, spacing, tone, constraints). Which file to read (precedence `frame.md` → `design.md` → `DESIGN.md`) and how to parse it (frontmatter = normative, prose = context) are defined once in [`references/design-spec.md`](references/design-spec.md) — resolve and load per that doc.
2. If no design spec exists and the user asks for visual direction, choose a route:
   - Ready-made frame-preset (optional) → `frame-presets/` (adopt a `FRAME.md` as `frame.md`; see `references/design-spec.md`)
   - Named style or mood → `references/visual-styles.md`
   - Fast defaults → `references/house-style.md`
   - Interactive selection → `references/design-picker.md`
3. For multi-scene work, plan beats and rhythm before writing HTML → `references/beat-direction.md`. For scene transitions, jump to `cutscene-animate/transitions/`.
4. For motion-heavy work, read `references/motion-principles.md` (high-level guardrails), then go to `cutscene-animate` for atomic rules.

## Routing

| Topic                                                                                                   | Read                                           |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Adopt a ready-made frame-preset as `frame.md` (optional)                                                | `frame-presets/` · `references/design-spec.md` |
| Default palettes, motion, typography, lazy defaults to question                                         | `references/house-style.md`                    |
| Named style presets, mood-to-style routing                                                              | `references/visual-styles.md`                  |
| Palette-specific color tokens                                                                           | `palettes/*.md`                                |
| Composition patterns — PiP, text-behind-subject, title card, slide show                                 | `references/composition-patterns.md`           |
| Stats / infographic presentation                                                                        | `references/data-in-motion.md`                 |
| Structured expansion for open-ended prompts                                                             | `references/prompt-expansion.md`               |
| Video-medium density, scale, color, frame composition                                                   | `references/video-composition.md`              |
| Per-beat direction, rhythm planning, transition timing                                                  | `references/beat-direction.md`                 |
| Post-authoring spec verification (colors, type, corners, spacing, depth)                                | `references/design-adherence.md`               |
| High-level motion guardrails and GSAP-quality rules                                                     | `references/motion-principles.md`              |
| Font selection, pairings, rendered-video type guardrails                                                | `references/typography.md`                     |
| Story doctrine — hook language, value-before-evidence, storyboard-as-proposal, source-traceable visuals | `references/story-spine.md`                    |
| Script pacing, tone, openings, number pronunciation                                                     | `references/narration.md`                      |
| Precomputed audio bands mapped to motion                                                                | `references/audio-reactive.md`                 |

## Scripts

- `scripts/contrast-report.mjs` — inspect contrast warnings from rendered frames.
- `scripts/extract-audio-data.py` — pre-extract audio bands for audio-reactive compositions.
- `scripts/package-loader.mjs` — support script for bundled creative tooling.

`contrast-report.mjs` resolves helper packages from the current project first, then can bootstrap the bundled Cutscene package version. Set `HYPERFRAMES_SKILL_PKG_VERSION=<version>` only when running the skill outside the bundled CLI/skill install and you need to pin that bootstrap version explicitly.

Run with explicit paths, for example:

```bash
python "<this skill's folder>/scripts/extract-audio-data.py" <audio-file>
```

Animation analysis (`animation-map.mjs`) lives in `cutscene-animate/scripts/`.

## Boundaries

- Do not override `cutscene-compose` technical rules.
- Do not require a design system for a minimal technical composition.
- Do not add extra scenes, narration, music, captions, or transitions unless the request calls for them or you first propose the expansion.
- Keep recipe references task-specific; do not read every reference for simple edits.
