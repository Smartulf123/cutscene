# The beat sheet (`.cutscene/beats.json`, version 1)

One file per video that holds every beat: its time, the line of voice, the 3D shot, the
graphics and the sounds. The compositions, the voice lines and the 3D shots all read it, so a
sound lands exactly when its graphic appears.

**Times are seconds on the final video timeline**, as numbers with up to 3 decimals.

## Example

```json
{
  "version": 1,
  "fps": 30,
  "format": "landscape",
  "width": 1920,
  "height": 1080,
  "duration": 12.0,
  "voices": {
    "narrator": {
      "model": "omnivoice",
      "design": "female, young adult, american accent",
      "reference": ".cutscene/voice/narrator-ref.wav",
      "reference_text": "Hi! I'm so glad you're here.",
      "seed": 42,
      "license": "CC-BY-NC-4.0"
    }
  },
  "beats": [
    {
      "id": "b1",
      "start": 0.0,
      "end": 2.4,
      "label": "logo reveal",
      "voice": {
        "speaker": "narrator",
        "line": "Meet Cutscene.",
        "file": "assets/voice/b1.wav",
        "duration": 1.1,
        "words": [{ "w": "Meet", "start": 0.0, "end": 0.32, "p": 0.98 }],
        "verified": true
      },
      "shot3d": { "spec": ".cutscene/3d/logo.json", "tier": 1, "file": "compositions/scene3d-logo.html", "duration": 2.4 },
      "graphics": [{ "id": "g-title", "kind": "title", "text": "Cutscene" }],
      "sfx": [{ "at": 0.4, "name": "whoosh" }]
    }
  ]
}
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `version` | yes | Always `1` |
| `fps` | yes | Frames per second (1–240) |
| `width`, `height` | yes | Pixels, whole numbers |
| `format` | no | `landscape`, `portrait` or `square` |
| `duration` | no | Length of the whole video in seconds |
| `voices` | no | Named voices (filled by `cutscene-voice`) |
| `beats[].id` | yes | Short unique name (`b1`, `b2`, ...) |
| `beats[].start`, `beats[].end` | yes | Seconds on the video timeline; `end` after `start` |
| `beats[].label` | no | What happens, in a few words |
| `beats[].voice` | no | The spoken line (filled by `cutscene-voice`). `words[].start/end` are relative to the start of the voice file; `beat.start` places it on the timeline |
| `beats[].shot3d` | no | The 3D shot (filled by `cutscene-3d`): its spec, its file in `compositions/`, its length, and `tier` (always 1) |
| `beats[].graphics` | no | Graphics on screen in this beat |
| `beats[].sfx` | no | Sounds; `at` is seconds on the video timeline, like every time except `voice.words` |

File paths are relative to the project folder: never absolute, never outside the project.
Any other field is allowed and is kept as it is.

## Who fills what

- The storyboard step (this skill and `cutscene-design`) writes the file and the beats.
- `cutscene-voice` fills `voices` and `beats[].voice`.
- `cutscene-3d` fills `beats[].shot3d`.
- Everyone else reads it.

A part fills only its own fields and leaves everything else exactly as it was.

## Helpers for scripts

Parts use `skills/cutscene/scripts/lib/beats.mjs` (relative to a part's script:
`../../cutscene/scripts/lib/beats.mjs`). All helpers are synchronous; `await` works too.

```js
import { beatsPath, readBeats, updateBeat, updateBeatSheet, validateBeats, writeBeats } from "../../cutscene/scripts/lib/beats.mjs";

const file = beatsPath(projectDir);            // <project>/.cutscene/beats.json
const sheet = readBeats(file);                 // parsed JSON (not validated)
const { ok, errors, warnings } = validateBeats(sheet);

updateBeat(file, "b1", { voice: { file: "assets/voice/b1.wav", duration: 1.1, verified: true } });
updateBeatSheet(file, { voices: { narrator: { model: "kokoro" } } });
updateBeat(file, "b1", { shot3d: null });       // null removes a field
writeBeats(file, newSheet);                     // the storyboard step: write the whole file
```

- Updates are JSON merge patches: objects merge field by field, `null` removes a field, and
  arrays and other values replace what was there.
- The change is spliced into the existing text, so every other field, its order, spacing and
  number spelling (`12.0` stays `12.0`) are kept byte for byte.
- Writes are atomic (temp file, then rename) and locked (`beats.json.lock`), so the voice and
  3D parts can update the same file at the same time.
- An update that would make the sheet invalid is refused with `BEATS_INVALID` and nothing is
  written. Other errors: `BEATS_NOT_FOUND`, `BEATS_INVALID_JSON`, `BEAT_NOT_FOUND`,
  `BEAT_ID_CHANGE`, `FILE_LOCKED`. Each has a `hint` that says how to fix it.
