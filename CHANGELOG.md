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
