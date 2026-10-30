# Sound library and music (Cutscene)

## Sound effects

Cutscene knows a small offline library of 19 sound effects. `sound/sfx/manifest.json` lists each
key with its file, duration and a placement hint. The sound files are Pixabay effects (Pixabay
Content License), which may not be shared as a standalone library, so they are not in this skill:
the sound engine copies them from the installed engine (`cutscene setup`), checked against
`sound/sfx/sha256.json` (see `sound/sfx/README.md`). Without the engine, use the user's own files:

`chime`, `click`, `click-soft`, `error`, `glitch-1`, `glitch-2`, `glitch-3`, `impact-bass-1`,
`impact-bass-2`, `key-press`, `notification`, `ping`, `pop`, `riser`, `sparkle`, `typing`,
`whoosh`, `whoosh-short`, `whoosh-cinematic`.

- **Copy, don't link.** Copy the file into the project's `assets/sfx/` and place it as an
  `<audio>` clip (see `/cutscene-compose` for clip attributes). The sound engine does this for
  you when a line carries `sfx: [...]` cues.
- **Volume about 0.35.** Effects sit under narration and music.
- **Time from the manifest.** Durations are known offline: `riser` is about 10 s, so start it at
  `climax - duration`.
- **No match, no sound.** A cue that matches nothing (or whose file is missing) is skipped and
  reported; it never blocks a render. Cutscene never generates or downloads sound effects.
- **The beat sheet:** `.cutscene/beats.json` beats can carry `"sfx": [{ "at": 0.4, "name": "whoosh" }]`
  (`at` is seconds on the final timeline). Place each one at `at`.

## Music

Cutscene has **no music catalog** and never fetches music. Use a file the user gives you:

1. Copy it into the project (`assets/music/<name>.mp3`), and ask the user to confirm they may use
   it (their own track, a licensed track, or a free-licence track they chose).
2. Place it as a bed with `data-volume` around 0.25, then shape it with the fades, automation,
   ducking and carve in this skill's `SKILL.md`.
3. In the promo workflows, list it in `audio_meta.json` as host music:
   `"bgm": { "path": "assets/music/<name>.mp3", "source": "host" }`, with `music: none` in the
   storyboard, so every audio pass keeps it.

If the user has no music, say so once and build the video without it (or with sound effects
only). Never invent a track or link one from the web.

## The local sound engine

`scripts/sound-engine.mjs` does a whole audio pass for a list of lines:

```bash
node "<this skill's folder>/scripts/sound-engine.mjs" --request audio_request.json --hyperframes <project> --out audio_engine_meta.json [--only tts,bgm,sfx] [--voice am_michael]
```

- **tts:** Kokoro through `cutscene tts` (voices: `cutscene tts --list`), or a designed or cloned
  voice with `--provider cutscene-voice`. Files go to `assets/voice/<line-id>.wav`; word timings
  come from `cutscene transcribe`.
- **bgm:** only `bgm.file` (a file in the project). Anything else is skipped with a note.
- **sfx:** cue names matched against the bundled library and copied into `assets/sfx/`.

The promo workflows call it for you through their own `scripts/audio.mjs`.
