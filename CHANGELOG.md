# Changelog

## Unreleased

- **TypeScript.** Cutscene's own code and tests are now TypeScript, in `src/` and `tests/`. Each
  file is built to the same `.mjs` path as before, so skills still run with plain `node` on Node 22
  and nothing changes for users.
- **Fixes.** `cutscene voice status --json` reports `"ok": true` with readiness in `status_ok`;
  voice setup explains a broken Python environment instead of crashing; captions handle a spoken
  word with a line break; `apply-cuts` refuses a transcript with no words (`NO_WORDS`); plan
  checks report an empty caption group; a `beats.json` that isn't an object is rewritten instead
  of crashing.
- **Safer edit lists.** An edit list's tool name can no longer point output files outside the
  project folder, and only numbers from a mix file reach FFmpeg.

### Removed

- **Blender 3D ("Tier 2").** A Blender shot took minutes for every second of video on a normal
  computer, and the agent spent a lot of time and tokens on stills and renders, so it wasn't worth
  it for most people. Every 3D shot is now drawn with Three.js inside the video, with nothing to
  install: 3D titles, SVG logo reveals, product turntables from a .glb model, floating shapes and
  fly-throughs. The `product-shot` and `physics-drop` templates and the Blender commands (stills,
  render, encode and setup) are gone, and `cutscene doctor` no longer looks for Blender. A shot
  spec with `"tier": 2` is refused with a message that says so. Make the shot with one of the
  templates above, or, if you already have a rendered 3D clip, add it to the video as a normal
  clip.

## 0.1.0 (2026-10-30)

First public release.

- **Planning:** brief, per-video look and beat sheet, each approved before building, with project
  memory in `.cutscene/`.
- **Composition and motion:** the `cutscene-compose` and `cutscene-animate` skills, built on the
  HyperFrames engine 0.8.162 (pinned, with a locked dependency list).
- **Looks:** 24 curated type pairs, five background tones, contrast checks and a same-look check
  against earlier videos.
- **3D:** Tier 1 with Three.js inside the video (titles, logos, turntables, physics, shapes), and
  Tier 2 with Blender 4.2+ to a transparent WebM, stills first.
- **Voices:** OmniVoice, VoxCPM2 and Kokoro on your computer, plus VoiceStudio if it is running.
  Voice design and cloning with consent, and every line checked word by word with Whisper.
- **Captions** from voice word timings, and **audio** mixing with ducking.
- **Footage editing:** silences, retakes, filler words, highlights, face-following 9:16 reframes,
  sync by sound, clean-up, and NLE hand-off.
- **Live preview** behind a local proxy that refuses requests from other websites.
- **Security:** consent before every download, pinned checksums, cloud keys removed from the
  engine's environment, and blocked cloud, publish and telemetry commands.
- **Plugin manifests** for Claude Code, Codex, Cursor and Gemini CLI.
