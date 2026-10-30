# The voice workflow, step by step

This is the loop the owner tested and liked: design a voice from a description, keep its sample
as the reference, clone every line from that reference with one fixed seed, then check every
line by transcribing it back.

`cutscene voice` below means `node "<this skill's folder>/../cutscene/scripts/cli.mjs" voice`.

## 1. Before: the beat sheet

The storyboard step (cutscene skill) writes `.cutscene/beats.json`. Each beat that speaks has a
`voice` with a speaker and a line:

```json
{
  "version": 1, "fps": 30, "width": 1920, "height": 1080, "duration": 12.0,
  "beats": [
    { "id": "b1", "start": 0.0, "end": 4.0, "voice": { "speaker": "narrator", "line": "Meet Cutscene, a video studio that lives in your terminal." } },
    { "id": "b2", "start": 4.0, "end": 8.0, "voice": { "speaker": "narrator", "line": "Design a voice once, and every line sounds like the same person." } }
  ]
}
```

Write lines as they are said: numbers, dates, symbols and abbreviations in words.

## 2. Status and setup

```bash
cutscene voice status --project my-video
cutscene voice setup                 # shows the plan, stops with NEEDS_CONSENT
cutscene voice setup --yes           # only after the user agreed
cutscene voice benchmark             # once, so Cutscene can estimate times
```

## 3. Design (or clone) the voice

```bash
cutscene voice design --project my-video --speaker narrator \
  --describe "female, young adult, american accent" \
  --sample "Hi! I'm so glad you're here." --seed 42
```

What happens:
1. The model speaks the sample in the described voice (seed 42).
2. Whisper transcribes it. If it didn't say the sample right, the next seed is tried (up to
   `--tries 3`).
3. The take becomes `.cutscene/voice/narrator-ref.wav`, plus a reusable prompt
   `.cutscene/voice/narrator.omnivoice.pt`, and beats.json gets:

```json
"voices": {
  "narrator": {
    "model": "omnivoice", "design": "female, young adult, american accent",
    "instruct": "female, young adult, american accent",
    "reference": ".cutscene/voice/narrator-ref.wav", "reference_text": "Hi! I'm so glad you're here.",
    "prompt": ".cutscene/voice/narrator.omnivoice.pt",
    "seed": 42, "num_step": 16, "fast": false, "language": "en",
    "license": "CC-BY-NC-4.0", "reference_verified": true, "created": "2026-10-29"
  }
}
```

Let the user listen to the reference. If they want a different voice:
`design ... --replace --seed 7` (any seed; each gives a different person).

Clone instead, only with permission:

```bash
cutscene voice clone --project my-video --speaker host --from "D:/recordings/me.m4a" \
  --text "Hi, I make videos about cooking and I talk way too fast." \
  --consent "Maya: it's my own voice"
```

- Without `--consent` it refuses (`CONSENT_REQUIRED`) and touches nothing.
- The recording is converted to a 24 kHz mono reference (3–10 s of clear speech is best).
- Whisper checks that `--text` matches the recording; a mismatch is refused
  (`REFERENCE_TEXT_MISMATCH`) because cloning needs the exact words.
- The consent goes into `.cutscene/project.md` under "Voice consent".
- A short sample, `.cutscene/voice/host-sample.wav`, is made to listen to.

## 4. Speak

```bash
cutscene voice speak --project my-video            # every line
cutscene voice speak --project my-video --beats b2  # just one
```

For each line: a raw take in `.cutscene/voice/takes/<id>.<model>.s<seed>.wav`, the mastered file
`assets/voice/<id>.wav` (70 Hz high-pass, two-pass loudness to -16 LUFS, -1.5 dBTP, 48 kHz mono
16-bit), its `assets/voice/<id>.license.txt`, and in beats.json:

```json
"voice": { "speaker": "narrator", "line": "...", "file": "assets/voice/b1.wav", "duration": 3.42,
           "model": "omnivoice", "seed": 42, "take": ".cutscene/voice/takes/b1.omnivoice.s42.wav",
           "spoken": "2026-10-29", "verified": false }
```

Re-speaking a line clears its old `words`, `heard` and `verified`, because they described the
old audio. `--no-verify` skips the automatic check (then say the lines are unchecked).

## 5. Verify

```bash
cutscene voice verify --project my-video
```

Whisper large-v3-turbo transcribes each file without being shown the script (so it can't "hear"
what we hoped for). The words are compared with the line after normalising case, punctuation,
apostrophes, harmless spellings (colour/color) and numbers ("42" = "forty-two"). It reports:

- **wrong**: "live" heard as "lift" (fails)
- **missing**: a script word wasn't heard (fails)
- **extra**: words that aren't in the script, often noise at the end (fails)
- **other line**: the file sounds like a different beat's line, e.g. lines in the wrong order (fails)
- **listen** warnings (don't fail): Whisper was unsure about a word, very fast or slow speech,
  long silence before or after

Results: `.cutscene/voice/verify.json` (full detail) and `.cutscene/voice/verify.md` (for
people), and in beats.json each line gets `verified`, `heard`, `issues` and `words`. The command
exits 1 with `LINES_FAILED` when any line failed and prints the retry command.

## 6. Fix failures

1. `cutscene voice speak --project my-video --beats b2 --retry` (seed + 1, recorded in the beat).
2. Still wrong after two tries? Reword the line (simpler words, spell out names phonetically).
3. Whisper misspells a name the voice says right? Let the user listen, then:
   `cutscene voice verify --project my-video --accept b2 --reason "listened: says Maya right"`.
   That sets `verified: true` with `accepted: "by ear (...)"`, so everyone can see a person made
   the call.

## 7. Captions hand-off

Verified lines carry word timings for cutscene-captions:

```json
"words": [ { "w": "Meet", "start": 0.12, "end": 0.38, "p": 0.98 }, { "w": "Cutscene,", "start": 0.38, "end": 0.95, "p": 0.91 } ]
```

- `w` is the **script's** spelling (with its punctuation), timed by what Whisper heard.
- `start`/`end` are seconds from the start of the voice file; add `beat.start` for the video
  timeline: `timelineStart = beat.start + word.start`.
- A word Whisper never heard (only in a failed line) has `estimated: true` and a time spread
  between its neighbours.
- `p` is Whisper's confidence (0–1).

## 8. Reporting to the user

Say what's real: which lines passed, their actual durations from beats.json, the time it took,
and the licence ("OmniVoice: non-commercial use only"). Never say a line is good if it wasn't
verified or accepted by ear.
