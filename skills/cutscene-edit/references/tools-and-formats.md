# Tools and formats

All tools: `cutscene edit <tool> [options] [--json]`. Exit code 0 on success, 1 on failure
(including a check that found problems), 2 on wrong usage. With `--json`, one object on stdout:
`{"ok":true,...}` or `{"ok":false,"error":{"code","message","hint"}}`. Outputs go to
`<project>/.cutscene/edit/` unless `--out-dir` is given. Nothing is cut or rendered without
`--apply`.

## Transcripts

`transcribe <media> [--model small.en] [--language en] [--asr auto|parakeet|whisper] [--silence-db -40] [--no-refine] [--force]`

Runs the engine's local speech recognition (Parakeet when installed, else Whisper; no cloud),
then tightens word edges against measured silence: recognisers often stretch a word over the
pause after it, which would hide that pause from the silence cutter. Where nothing is silent
(music under speech), stretched word ends are shortened and marked `end_estimated: true`. Cached
by file fingerprint; `--force` transcribes again.

Shape (Herk Edit Kit's transcript shape plus Cutscene fields):

```json
{
  "version": 1,
  "kind": "cutscene-transcript",
  "timeline": "source",
  "source": "C:/videos/raw.mp4",
  "edl": null,
  "audio_duration_secs": 412.08,
  "source_audio_duration_secs": 412.08,
  "words": [
    { "type": "word", "text": "Welcome", "start": 1.546, "end": 1.9 },
    { "type": "word", "text": "back.", "start": 1.9, "end": 2.31, "refined": "end" }
  ]
}
```

An **edited** transcript (written by every cutting tool) has `"timeline": "edited"`, `"edl"`
naming the edit list that made it, `audio_duration_secs` equal to the edited length, and on each
word `start`/`end` on the edited video plus `source_start`/`source_end` on the original. A word
a cut runs through keeps only its kept part and is marked `clipped`; a word mostly inside a cut
is dropped.

`read <transcript> [--gap 0.5]` prints phrases with their time ranges. `transcribe` also writes
the same view to `<name>.phrases.md`.

## Edit lists (EDL)

Every EDL is measured on the **original recording**, in whole frames:

```json
{
  "version": 1,
  "kind": "cutscene-edl",
  "tool": "cut-silences",
  "source": "C:/videos/raw.mp4",
  "fps": 30,
  "source_duration": 19.267,
  "edited_duration": 12.8,
  "removed": 6.467,
  "params": { "gap": 0.55, "headPad": 0.22, "tailPad": 0.34 },
  "keep_ranges": [{ "start": 1.333, "end": 4.033, "out_start": 0, "out_end": 2.7 }],
  "delete_ranges": [{ "start": 0, "end": 1.333, "reasons": ["dead air before the first word"] }],
  "parent": null
}
```

`out_start`/`out_end` place each kept range on the edited video. Cuts made on an edited
transcript are composed onto the original (`parent` names the earlier edit list), so the video
is always cut from the original in one pass. Kit-style EDLs (without `out_*`) are read too.

Cut edges snap to the frame at or before them, so a cut that starts on a word starts before it
and a cut that ends where the next word begins never eats into it. Footage slivers under 0.04 s
between two cuts are folded into the cut. Each join gets a 20 ms audio fade (`--fade`, 0 to
turn off) so cuts don't click.

## Cutting

| Tool | Options | Notes |
|---|---|---|
| `cut-silences <transcript>` | `--video`, `--pace tight\|normal\|loose`, `--gap`, `--head-pad 0.22`, `--tail-pad 0.34`, `--fade`, `--output`, `--apply` | Pauses over the gap are trimmed to a breath of 0.14–0.24 s by context (0.24 after a pause of 2 s or more, 0.20 after a sentence, 0.18 after a comma, else 0.14), biased toward the end of the phrase before |
| `find-cuts <transcript>` | `--no-fillers` | Types: `stutter`, `repeat`, `restart`, `retake`, `false_start`, `filler`; each with `recommend` (cut / review / keep), `confidence`, `removes`, `keeps`, `context`, `overlaps` |
| `apply-cuts <transcript> --cuts approved.json` | `--candidates`, `--video`, `--fade`, `--output`, `--apply` | `approved.json` is `{"approve": ["c001","c004"]}` (ids from find-cuts) or `{"cuts": [{"start": 3.1, "end": 3.4, "reason": "..."}]}` on the transcript's timeline; `[]` is valid |
| `rough-cut <video>` | `--pace`, `--margin 0.2s`, `--threshold 4%\|-19dB`, `--transcript`, `--apply`, `--yes` | auto-editor's loudness pass; no transcript needed; good first pass for long recordings; cannot find pauses under music |
| `highlights <transcript>` | `--min 20 --max 60 --count 8`, `--make h1 [--apply]` | Sentence-bounded stretches scored for a hook, a strong claim early, density and a finished ending |

Renders: H.264 CRF 18 + AAC 192 kb/s, fast start; audio-only sources give `.m4a`.

## Checking

| Tool | What it checks |
|---|---|
| `review <edl> [--original] [--edited] [--transcript] [--candidates]` | Builds a self-contained HTML page: waveform with kept and cut regions, the transcript with cut words struck through, click a cut to hear it, "hear the join" on the edited video, "preview the edit" (plays the original skipping the cuts, before rendering), a candidate checklist that copies the approved list. Keys: Space, N/P, E |
| `verify <cut.mp4> --edl <edl>` | Length within a frame of the plan, audio and video end together, the retimed transcript's length matches, the render re-transcribed hears ≥ 90% of kept words with a median offset under 0.12 s, loudness reported |
| `loudness <file> [--target -14 --tolerance 1 --peak -1.5]` | EBU R128 integrated loudness and true peak on the file you deliver; warns on mono |
| `validate-beat-sync [project] --transcript <edited>` | Each sub-composition in `index.html` with `data-start`, `data-duration` and a `data-anchor` phrase (on the element or inside its file) lands −0.2…+1.8 s from that phrase's first word; failures suggest a `data-start` 0.5 s before the word |
| `validate-plan [project]` | `assets/plan.json` + `assets/transcript.json` + `assets/edit-decisions.json` (or a Cutscene EDL): captions equal the retained words and their timing, scenes tile the timeline on frames and cut near their anchor, no unexplained gap over 2.2 s without a visual event |
| `validate-footage [project]` | `assets/footage-ledger.json`: every B-roll scene once, SHA-256 of each file, no overlapping intervals of the same file |

Plan schema (`assets/plan.json`, seconds on the edited video):

```json
{
  "duration": 10, "fps": 30,
  "scenes": [{ "id": "s00", "start": 0, "end": 10, "layout": "face", "kind": "hook", "anchor": "First three words", "anchorTime": 0.1 }],
  "events": [{ "time": 0, "type": "tap", "visual": "s00" }],
  "captions": [{ "start": 0.1, "end": 0.8, "words": [{ "text": "First", "start": 0.1, "end": 0.3 }] }]
}
```

Layouts: `face`, `split`, `broll`, `broll-split` (and any of your own). A long hold carries a
`holdReason`. Footage ledger rows: `{scene, sourceSceneId, asset, sha256, sourceStart, sourceEnd}`.

## Framing and sound

| Tool | Notes |
|---|---|
| `reframe <video> [--aspect 9:16\|4:5\|1:1] [--center] [--faces f.json] [--dead-zone 0.12] [--settle 0.6] [--apply] [--yes]` | Follows the main face like a calm camera operator (holds still inside a dead zone, eases when the face leaves it). Face detection is MediaPipe's BlazeFace in the engine's own browser: a 10.5 MB pinned download, asked for first. `--center` needs nothing. Writes the keyframes to `<name>.reframe.json` |
| `sync <a> <b> [--max-shift 30]` | Offset between two recordings of the same moment from their loudness onsets, with a confidence (under 1.5 means no clear answer) |
| `clean-audio <media> [--hum] [--noise] [--strength light\|normal\|strong]` | Notches 50/60 Hz hum and harmonics with a gentle high-pass; denoises steady hiss using the measured noise floor; video copied untouched |
| `music-grid <track> [--bpm 120] [--out grid.json]` | Beat period, downbeat phase from the kick band (the full band can lock onto hi-hats half a beat off), and a bar energy map to find intro, build, drop and break |
| `splice-music <take> --grid grid.json --segments "4-28,48-56" --out bed.wav [--length 15] [--gap 16] [--fade 0.9] [--apply]` | Joins source beat ranges on the grid, 12 ms before each beat with 12 ms crossfades; `--gap` dips the half beat before an output beat |
| `beatgrid --bpm 120 --chapters "Hook:8, Build:16, Flurry:4, End:rest"` | The cut sheet in seconds and frames; a chapter named Flurry… lists accelerating cuts |
| `mix --bed bed.wav --events events.json --out master.wav [--voice v.wav] [--lufs -14] [--peak -1.5] [--apply]` | Places effects (`[{"t": 0.46, "file": "sfx/tap.wav", "gain": 0.5, "max": 0.5}]`), ducks the bed under an optional voice, two-pass loudness normalisation, then measures the result |

## Handing off to editors

`export <edl> --to <target> [--video original.mp4] [--transcript retimed.json] [--output file] [--yes]`

| Target | File | Made by |
|---|---|---|
| `premiere` | `.premiere.xml` (FCP7 XML) | auto-editor |
| `resolve` | `.resolve.fcpxml` | auto-editor |
| `fcp` | `.finalcut.fcpxml` | auto-editor |
| `shotcut` | `.mlt` | auto-editor |
| `kdenlive` | `.kdenlive` | auto-editor |
| `fcpxml` | `.fcpxml` (FCPXML 1.8: Final Cut Pro, Resolve) | Cutscene, no download |
| `fcp7` | `.fcp7.xml` (Premiere Pro, Resolve) | Cutscene, no download |
| `otio` | `.otio` (OpenTimelineIO) | Cutscene, no download |
| `srt` | `.srt` captions from the retimed transcript | Cutscene, no download |

Exports point at the **original** recording with the kept ranges laid back to back in whole
frames; keep the original where it is. Titles, graphics and caption styling are not carried;
send captions as SRT.

## auto-editor

[auto-editor](https://github.com/WyattBlue/auto-editor) (Unlicense) by WyattBlue: loudness-based
"first pass" cuts and exports to five editors. Cutscene pins **31.7.2** (official GitHub release
binaries, SHA-256 checked, per platform; see `assets/manifest.json`) and installs it into
`<CUTSCENE_HOME>/tools/auto-editor/31.7.2/` only after the user agrees
(`cutscene edit install auto-editor --yes`, about 43 MB on Windows x64). It is never put on PATH.
To use your own copy, set `CUTSCENE_AUTO_EDITOR` to its program. Cutscene talks to it through
its stable v1 timeline JSON (`[startFrame, endFrame, speed]` chunks, 99999 = cut).

## Errors you may see

| Code | Meaning |
|---|---|
| `NEEDS_CONSENT` | A download is needed; ask the user, then rerun with `--yes` |
| `TIMELINE_MISMATCH` | A transcript, cut list or video from different timelines; pass the matching one |
| `ENGINE_MISSING` | No local transcription yet; run `cutscene setup` |
| `FFMPEG_MISSING` | FFmpeg is not installed or not found; `cutscene doctor` |
| `CHECK_FAILED` | A check ran and found problems; they are listed |
| `NETWORK_PATH` | Network paths are refused; copy the file locally |
