# Cutscene audio

How a Cutscene video sounds: placing the user's music and the sound-effect library, then fades,
gain, automation, ducking, voiceover carve and effects. Everything runs locally.

| Need | Use |
|---|---|
| A sound effect (whoosh, click, pop, riser, impact, glitch, chime...) | the sound-effect library (files come with the engine): [references/sound-library.md](references/sound-library.md) |
| Music | the user's own file only; Cutscene has no music catalog ([references/sound-library.md](references/sound-library.md#music)) |
| Duck music under speech as a volume lane | `node "<this skill's folder>/sound/scripts/audio-duck.mjs" --meta <audio meta or transcript> --target "#music"` |
| Narration, voice lines and the promo workflows' audio pass | `scripts/sound-engine.mjs` (Kokoro or `/cutscene-voice`, local transcription, sound-effect library) |

This skill does NOT design, clone, speak or check voices and does NOT transcribe speech (that's
`/cutscene-voice`), and does NOT cut footage (`/cutscene-edit`).
