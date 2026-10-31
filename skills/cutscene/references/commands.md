# The `cutscene` command

```bash
node "<cutscene skill folder>/scripts/cli.mjs" <command> [args] [--json]
```

From another Cutscene skill: `node "<that skill's folder>/../cutscene/scripts/cli.mjs" ...`.
Run it in the user's project folder or pass the project path.

## Results

- Without `--json`: plain sentences for people.
- With `--json`: exactly one JSON object on stdout; progress and logs go to stderr.
  - Success: `{"ok": true, ...}`
  - Failure: `{"ok": false, "error": {"code": "SNAKE_CASE", "message": "...", "hint": "how to fix"}}`
- Exit codes: `0` done, `1` failed, `2` wrong usage.

## Cutscene's own commands

| Command | What it does |
|---|---|
| `cutscene doctor` | Checks Node.js 22+, FFmpeg, the engine and its render browser, Python 3.10+, the voice environment and VoiceStudio. Fails only when something *needed* is missing |
| `cutscene setup` | Lists what it would download and stops with `NEEDS_CONSENT`. `cutscene setup --yes` installs the engine and its browser |
| `cutscene init <folder>` | Makes a project with `.cutscene/` (see project-layout.md). JSON: `{"ok":true,"project":"<abs path>","name","files":[...]}` |
| `cutscene preview [project]` | Opens the live preview on `127.0.0.1` (default port 3002). Agents always use `--background`; `--status` checks it, `--stop` ends it (do that when the session ends). `--port N`. JSON: `{"ok":true,"url":"http://127.0.0.1:3002/#project/<name>","pid":...}` |
| `cutscene voice <command>` | The voice part (`cutscene-voice` skill) |
| `cutscene 3d <command>` | The 3D part (`cutscene-3d` skill) |
| `cutscene edit <command>` | The footage part (`cutscene-edit` skill) |
| `cutscene --version` | Cutscene and engine versions |

## Engine commands

These run the pinned engine. Add `--help` to any of them for its options.

| Command | Use |
|---|---|
| `check [project]` | The full check: code, runtime errors, layout, motion, contrast. Run after every change |
| `lint [project]` | Code check only (fast) |
| `snapshot [project]` | PNG stills (`--at 1.5,4,7.25` or `--frames 5`) to look at |
| `timeline [project]` | Tracks and clips, without reading every file |
| `render [project]` | The final video. **Only when the user asks** |
| `transcribe <file>` | Word timings, on this computer |
| `tts <text>` | A quick line with the built-in voice (Kokoro) |
| `remove-background <file>` | Transparent cut-out of a video or image |
| `add <name>`, `catalog` | Ready-made blocks and components |
| `compare`, `normalize-audio` | Side-by-side variants; matching loudness |
| `play [project]` | A light player for a quick look (the preview is the main way to review) |
| `figma asset\|tokens\|component` | Import from Figma (needs the user's own Figma token) |
| `info`, `compositions`, `beats`, `audio`, `keyframes`, `inspect`, `validate`, `models`, `browser`, `capture`, `media-treatment`, `grade-compare`, `history`, `docs`, `benchmark`, `clean`, `present` | More engine tools, used by the other Cutscene skills |

Projects made by `cutscene init` take ready-made blocks (`add`, `catalog`) from the block
registry of the pinned engine version, so a block always matches the engine that renders it.

Cutscene's defaults, so nothing leaves the computer unasked:
- `snapshot` never sends frames to an online vision service (`--describe=false` unless you
  pass `--describe`).
- `add` doesn't touch the clipboard (`--no-clipboard` unless you pass `--clipboard`).
- The engine runs with its update checks, telemetry and skill installs turned off.

If the engine isn't installed, an engine command answers `NEEDS_CONSENT`. Ask the user, then
run `cutscene setup --yes` (or repeat the command with `--yes`).

## Not part of Cutscene

`skills`, `upgrade`, `cloud`, `cloudrun`, `lambda`, `publish`, `auth`, `feedback`, `usage`,
`open`, `catch-up` and `telemetry` answer `COMMAND_NOT_AVAILABLE` (exit 2) with a short reason.
Cutscene renders locally, uses one tested engine version, has no account and no desktop app.

## Common error codes

| Code | Meaning |
|---|---|
| `NEEDS_CONSENT` | Something must be downloaded first; the result lists what (size, licence, source) |
| `MISSING_REQUIREMENTS` | `doctor`/`setup`: something needed is missing; each check has a `fix` |
| `PART_MISSING` | `voice`, `3d` or `edit` isn't installed next to this skill |
| `PREVIEW_MISSING` | The preview isn't installed in this copy of Cutscene |
| `COMMAND_NOT_AVAILABLE` | A command Cutscene doesn't offer |
| `USAGE` | Wrong arguments (exit 2) |
| `PROJECT_EXISTS` | `init` into a folder that isn't empty |
| `NETWORK_PATH` | A `\\server\share` path; use a local folder |
| `<COMMAND>_FAILED` | An engine command failed, e.g. `CHECK_FAILED`; the result has the details |
| `ENGINE_INSTALL_FAILED` | npm couldn't install the engine (usually no internet) |

## For part scripts

`cutscene voice|3d|edit ...` runs `skills/cutscene-<part>/scripts/<part>.mjs` with the same
Node and these variables:

| Variable | Value |
|---|---|
| `CUTSCENE_HOME` | the Cutscene home folder |
| `CUTSCENE_CLI` | absolute path of `cli.mjs`; run engine commands through it |
| `CUTSCENE_ENGINE_VERSION` | the pinned engine version |

With `--json`, the part gets `--json` too and prints its own envelope.
