# Voice troubleshooting

Every error has a code (`--json` → `error.code`) and a hint that says how to fix it. Logs from
the Python side are in `~/.cutscene/logs/voice-<task>.log`.

| Code | What it means | Fix |
|---|---|---|
| `NEEDS_CONSENT` | Setup would download something; nothing was downloaded | Show the plan to the user; if they agree, run `cutscene voice setup --yes` |
| `PYTHON_MISSING` | No Python 3.10–3.13 found to build the environment | Install Python 3.12 from python.org, or set `CUTSCENE_PYTHON` to its python.exe |
| `VOICE_ENV_MISSING` | The voice environment isn't set up | `cutscene voice setup` |
| `PIP_FAILED` | A package install failed (often the network) | Run `cutscene voice setup --yes` again; `--repair` rebuilds from the lock |
| `CHECKSUM_MISMATCH`, `DOWNLOAD_SIZE_MISMATCH` | A model file is damaged or not the pinned one | Delete `~/.cutscene/voice/models/<model>` and run setup again; never use the file |
| `MODEL_NOT_INSTALLED` | The chosen model isn't installed | `cutscene voice setup --model <model>` (asks first), or `--model kokoro` |
| `DESCRIPTION_UNSUPPORTED` | OmniVoice doesn't know a word in `--describe` | Use its tags (see models.md), or `--model voxcpm2` for free text |
| `VOICE_EXISTS` | The speaker already has a voice | Another `--speaker`, or `--replace` and re-speak that speaker's lines |
| `REFERENCE_FAILED` | No reference take said the sample right | Simpler `--sample`, another `--seed`, or `--tries 5`; listen to `.cutscene/voice/takes/` |
| `CONSENT_REQUIRED`, `CONSENT_UNCLEAR` | Cloning without saying who gave permission | Ask the user; pass `--consent "<who, and how>"` |
| `REFERENCE_TEXT_MISMATCH` | `--text` isn't what the recording says | Use the words Whisper heard (in the message) or fix the text; `--force` only if sure |
| `REFERENCE_TOO_SHORT`, `BAD_RECORDING` | The recording is too short or not audio | 3–10 s of clear speech in WAV, MP3, M4A or a video file |
| `CANT_CLONE` | Kokoro has presets only; VoiceStudio clones in its app | `--model omnivoice` or `--model voxcpm2` |
| `BEATS_NOT_FOUND`, `BEATS_INVALID_JSON` | No beat sheet, or it's broken | Make the storyboard first (cutscene skill); fix the JSON |
| `NO_LINES`, `NO_LINE`, `NO_SPEAKER`, `VOICE_NOT_FOUND` | Beats lack `voice.line` / `voice.speaker`, or the voice isn't made | Add the fields; design or clone the speaker |
| `LINES_FAILED` | Verify found wrong, missing or extra words | `speak --beats <ids> --retry`; reword after two tries; `verify --accept` only after listening |
| `NO_TRANSCRIBER` | Neither Whisper nor VoiceStudio can check lines | `cutscene voice setup --model whisper` |
| `FFMPEG_MISSING`, `FFMPEG_FAILED` | FFmpeg not found or failed | Install FFmpeg; `cutscene doctor` |
| `KOKORO_FAILED` | The built-in voice failed | `cutscene doctor`; Kokoro needs Python with `kokoro-onnx` |
| `VOICESTUDIO_NOT_RUNNING` | `--model voicestudio` but the app is closed | Start VoiceStudio, or pick another model |
| `VOICESTUDIO_AUTH` | VoiceStudio wants credentials | Set them up in VoiceStudio; Cutscene never disables its sign-in |
| `WORKER_CRASHED`, `WORKER_FAILED`, `PACKAGE_MISSING` | The Python side failed | Read the log named in the hint; `cutscene voice setup --yes --repair` |

## Common situations

- **It's slow.** That's the CPU. OmniVoice takes about 20 s per second of speech at the default 16
  steps. Options: `--fast` for a new voice (about 2x), fewer/shorter lines, or Kokoro for drafts.
  Don't change `--steps`/`--fast` for a voice halfway through a video.
- **Whisper keeps hearing a name wrong.** Spell it the way it sounds in the line ("Niamh" →
  "Neeve" if that's how it's said), or listen and `verify --accept` with a reason.
- **Silence or noise at the end of a line** shows as a "listen" warning; re-speak with `--retry`
  if it's audible.
- **The line is longer than its beat.** `speak` warns. Lengthen the beat in the storyboard or
  shorten the line; the voice part never moves beats.
- **Lines sound like different people.** Check that all of them use the same speaker, and that
  nobody changed the seed or settings. Re-speak with the speaker's stored seed (plain `speak`).
- **Everything was set up by hand / the environment looks broken.** `cutscene voice setup --yes
  --repair` re-checks every model file's SHA-256 and reinstalls the exact locked packages.
