---
name: cutscene-render
description: "Use for Cutscene's local command loop once a project exists, and for diagnosing build or render failures: lint, check, snapshot, compare, timeline, preview, doctor, and local render (draft, looks, delivery, batch). Use it when a check fails, a preview is blank or a render errors or stalls. Everything runs on this computer. Not for planning a new video (cutscene). Does NOT publish, upload or render in any cloud, and never renders a final video unless the user asks for it."
---

<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

# Cutscene render

The local command loop: scaffold, check, snapshot, preview and render, all on this computer.

- **Local only.** `cloud`, `cloudrun`, `lambda`, `publish`, `auth`, `feedback`, `usage`, `skills`
  and `upgrade` are not part of Cutscene; `cutscene` refuses them. Don't offer uploads, hosted
  links or cloud renders.
- **Never render a final video unless the user asks.** Lint, check, snapshots and the preview
  are always fine. When they ask, render with `--quality delivery` and verify the file.
- **The preview** is `cutscene preview`: Cutscene's front door on `http://127.0.0.1:3002`
  (loopback only). Stop it with `cutscene preview --stop` when the review is over.

This skill does NOT write compositions (`/cutscene-compose`), choose the look
(`/cutscene-design`) or edit footage (`/cutscene-edit`).

## How to run cutscene commands

In this skill, `cutscene <command>` is shorthand for:

```bash
node "<this skill's folder>/../cutscene/scripts/cli.mjs" <command>
```

Replace `<this skill's folder>` with the folder this SKILL.md was loaded from. Scripts named `<this skill's folder>/scripts/...` run with plain `node`. Never call the engine through `npx`, and never use cloud commands: Cutscene works on this computer only, and it never renders a final video unless the user asks.

# Cutscene CLI

Run commands as `cutscene ...` unless project instructions provide a wrapper. Obey the wrapper when present. The CLI requires Node.js 22 or newer and FFmpeg.

## Development loop

1. **Scaffold:** `cutscene init <project>` (centered blank). Or capture a site. Pass `--example=<name>` only to start from a named example.
2. **Find the move:** if the request names a sound or music, use `/cutscene-audio`; a voice or voiceover, `/cutscene-voice`. Otherwise, before authoring motion by hand, search for a primitive that already does it: `cutscene catalog --query "reveal a headline one line at a time"`. Ask for the effect you want rather than the mechanism you have in mind. Install with `cutscene add <name>` (see `/cutscene-compose`). Author by hand only once nothing fits.
3. **Author:** write the composition using `/cutscene-compose`. To know what is on a project's timeline (tracks, clips, starts, ends, what plays), run `cutscene timeline --json` instead of reading `index.html` and every sub-composition file: nested rows carry absolute main-timeline `absStart`/`absEnd` and their owning `file`, not just their local, per-sub-composition time. Prefer `--json` over the text form; it costs fewer tokens for the same or better correctness. See `references/upgrade-info-misc.md` for one-liners that answer common questions without reading the whole output.
4. **Get fast feedback while editing:** run `cutscene lint` after the first HTML pass and after structural changes.
5. **Run the final gate:** run `cutscene check`; it reruns lint before opening the browser. Do not prepend a redundant standalone lint invocation. Add `--snapshots` for annotated overview frames and finding crops.
6. **Inspect sub-compositions:** when `index.html` mounts `data-composition-src`, capture midpoint snapshots and inspect each mounted scene. Inspect the opening 30 seconds and reported problem times at full resolution; zoom into fine geometry, text, and WebGL edges rather than judging a contact sheet alone.
7. **Open the final Studio preview:** run `cutscene preview --background`, verify the URL returns HTTP 200, hand the timeline project URL to the user, and ask whether to revise or render. Keep it alive until review ends.
8. **Render only after approval:** use `--quality draft` while iterating, `--quality looks` for the first real encode (the CLI default), and `--quality delivery` for final delivery.
9. **Verify the output:** confirm the file exists and is non-empty. Read the render summary's second line (`beginframe` vs `screenshot`, GPU, stage timings). `screenshot` + `software gpu` on Linux is the slow path. `ffprobe -v error -show_format -show_streams` and compare duration (and fps if the brief set it) to the root `data-duration`. Visually inspect decoded output frames at the same times as the preview, including close-ups; a successful check or encode does not certify the pixels inside a canvas.

<!-- history (trial): remove this block together with the command -->

### Project history in your turn

Every write to the project is kept as an entry that can be undone. Use it at two moments only, never on every step:

- **Start of a turn:** `cutscene history begin --who <your-name> --label "<what you are about to do>"`, then `cutscene history --since mine --who <your-name>` to see what the person changed since your last turn. Build on their edits; never overwrite them.
- **A check failed, or the person says it got worse:** `cutscene history undo --who <your-name>` undoes your newest turn and leaves the person's edits alone. Do not hand-edit back. On a conflict it exits 2 and prints both choices.

End each turn with `cutscene history end`, so your writes read as yours, not as "Changed outside the app". While a turn is open, every write to the project counts as yours until 10 minutes pass without one; after that the turn has ended by itself.

<!-- /history (trial) -->

## Mandatory creator-edit cross-references

- Before authoring or diagnosing a zoom, punch-in/punch-out, reframe, camera
  move, or any keyframe motion, read `/cutscene-animate` first.
- Before `cutscene keyframes`, read `/cutscene-animate`; the command
  surfaces animation trajectories and does not diagnose clip cuts.
- For a cut, trim, splice, reorder, or source timing edit, read
  `/cutscene-compose` and use its clip/timeline contract.
- For fade-in/fade-out, crossfade, track gain, volume automation, ducking,
  voiceover carve, or FX on placed audio, read `/cutscene-audio`. Load core
  alongside it when clip placement or picture timing also changes.
- A request naming a sound or music uses `/cutscene-audio`; a voice or voiceover uses `/cutscene-voice`.
  Copy creator edit markup from `/cutscene-compose` → `references/creator-editing-recipes.md`.

```bash
# Fast iteration check; repeat while authoring as needed.
cutscene lint

# Required final gate; includes lint.
cutscene check
cutscene preview --background
cutscene render --quality looks --output out.mp4
test -s out.mp4
ffprobe -v error -show_format -show_streams out.mp4
```

`check` runs lint first, then uses one browser session and one seek pass to audit runtime errors, failed requests, layout, `*.motion.json` assertions, and WCAG contrast. Persistent findings gate the exit code; transient entrance or exit findings are informational. Use `--strict` to gate warnings. `validate`, `inspect`, and `layout` remain aliases for compatibility but must not appear in new instructions or scripts.

## Preview before render

Open the final composition preview (`#project/<name>`) only after `check` passes, to review the assembled timeline. The plan in chat and the storyboard board (`boards/storyboard.html`, format in `cutscene-design/references/storyboard-recipe.md`) are not approval of the final video. Rendering always requires the final approval defined by `cutscene/references/upstream/references/review-loop.md`.

## Sub-composition smoke test

Static audits cannot catch every mount failure. When the project uses sub-compositions, capture at least one visible midpoint for each host slot:

```bash
cutscene snapshot --at <t1>,<t2>,<t3>
# For multiple samples within one scene or interval:
cutscene snapshot --composition <data-composition-id> --frames 8
cutscene snapshot --range 3:5 --frames 8
```

Treat tiny unstyled content, canvas-sized icons, missing hero elements, or timeline-registration timeouts as render-blocking mount defects. See `cutscene-compose/references/sub-compositions.md` for the corresponding fixes.

## Agent conventions

- **Search the catalog before writing motion by hand.** `cutscene catalog --query "<the beat, in plain English>"`. Search is entirely local: there is no hosted tier, no account, and the query text is never sent anywhere. By default it ranks on vocabulary shared with the item's name, title, description and tags, which misses any phrasing that does not reuse the catalog's own wording. Add `--on-device` to rank by meaning instead (see the offline tier below).
- **Query in English even when the video is not.** Both tiers index an English catalog, so a query in another script produces no searchable terms and returns nothing. Describe the move in English; the on-screen copy stays in whatever language the video needs. `No searchable words in query` means exactly this and is not a missing component, so do not report it as a catalog gap.
- **Read which tier answered; never infer it from results appearing.** With `--json` the envelope carries `query`, `tier` (`on-device` or `words`), `tier_detail`, `dropped`, `unindexed`, `shown`, `total` and `results`, plus `top_score` when the answering tier produces one and `warnings` when a tier was asked for and could not run, or when a search returned nothing and a better tier is still waiting on someone's consent. A weak result on `words` is expected; the same result on `on-device` is a bug. `top_score` is on-device only and has no threshold behind it: the ranker returns the whole catalog in some order for every query, so read it as evidence rather than as a pass or fail.
- **`dropped` and `unindexed` are opposite skews between the registry and the on-device index, and rewording the query fixes neither.** `dropped` counts ranked names this registry cannot install, so the strongest matches are the ones being lost. `unindexed` counts registry moves the index cannot see at all, which no query can ever return. Refreshing the registry is not the answer to either: its manifest carries a 24h TTL and heals itself, while the vectors are a separately published artifact fetched into `~/.hyperframes/catalog/`. Re-running with `--on-device` refetches that index when `unindexed` is above zero, so that is the remedy to hand the user. A pure over-coverage skew (`dropped` above zero while `unindexed` is zero) does not trigger the refetch; clearing `~/.hyperframes/catalog/` is the only way out of that one. Both counts are of names rather than of results, so either can exceed `total`.
- **Offer the offline tier; never enable it silently.** A one-time ~33 MB download (a quantized ONNX build of `bge-small-en-v1.5` plus its tokenizer, pinned to a fixed revision) and the catalog vectors from the registry, both cached under `~/.cutscene/references/upstream`, neither added to the project or any package. Once cached it ranks by meaning with nothing sent. Say the size out loud and let the person decide, then pass `--on-device` (with `-y` to skip the prompt) once they agree. The interactive offer only fires on a TTY. Under `--json` there is no prompt, but a search that found nothing puts the same ask in `warnings`, so read that array and put the decision to the user yourself.

- Prefer `--json` for agent and CI calls. Server-mode `render`, `preview`, and `play` do not provide ordinary JSON output; `preview --selection --json` and `preview --context --json` are query-mode exceptions.
- `doctor --json` always exits zero. Gate on its payload:

  ```bash
  cutscene doctor --json | jq -e '.ok' >/dev/null
  ```

- Non-TTY mode is automatic and scaffolds the centered blank. Pass `--example` only to start from a named example. Use `--non-interactive` to force flag-only mode on a TTY.
- Use one `HYPERFRAMES_RUN_ID` for all commands in the same verification loop.
- When disk is tight, run `cutscene clean` (`--dry-run` to list first); it removes what dead renders left and idle caches that rebuild themselves, never outputs, sources or anything a running render uses. Write disposable QC frames to a temp dir, then remove only that owned directory. Managed snapshot runs retain the newest 10 plus current/latest/rendered evidence; active captures and runs younger than 24 hours are protected. Copy intentional before/after evidence outside managed storage before it ages out. Never delete `.hyperframes` wholesale: it also holds project history.
- Use `--strict`, `--strict-all`, and `--strict-variables` when the corresponding warnings, variables, or CI conditions must gate the render.
- For `shader_unbounded_cosine_pow`, clamp the cosine to `[0, 1]` before `pow(1 - cosine, exponent)`; a lower-only `max` is insufficient. Follow `/cutscene-animate` → `adapters/three.md` for the source fix and affected-GPU preview/export verification. Lint only recognizes static shader expressions, and software rendering can miss hardware-specific invalid pixels.
- JSON paths redact the home directory as `$HOME`; do not try to reverse the redaction.
- Never render merely because checks pass. Pause at the final preview and wait for approval.

## Studio-directed edits

When the user refers to “this element” or the current selection, query Studio instead of guessing:

```bash
cutscene preview --context --json --context-fields selection
```

Use `selection.target.hfId` when available, otherwise its selector and source file. If the result reports `no-selection`, ask the user to click the element and rerun. Request only the context slices you need; use `--context-detail full` only for computed styles or editable text metadata. Full behavior and failure codes live in `references/preview-render.md`.

## Render choices

| Need                                     | Command                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Fast local iteration                     | `cutscene render --quality draft`                                      |
| First real encode                        | `cutscene render --quality looks --output out.mp4`                     |
| Final local delivery                     | `cutscene render --quality delivery --output out.mp4`                  |
| Reproducible container render            | `cutscene render --docker --strict --output out.mp4`                   |
| Local variable-driven batch render       | `cutscene render --batch rows.json --output "renders/{name}.mp4"`      |

A render stops when whatever started it stops, so a Ctrl-C or a closed terminal never leaves Chrome running. If your tool kills its whole process group when a command times out or ends, a long render dies with it. Start such a render in its own process group with `HYPERFRAMES_RENDER_DETACHED=1`, for example `bash -c 'set -m; HYPERFRAMES_RENDER_DETACHED=1 cutscene render --output out.mp4 < /dev/null > render.log 2>&1 &'` (works on macOS and Linux), then check the log and the output file instead of waiting on the command.

## Read the matching reference before running a command

The following references and owning skills are mandatory command contracts, not optional background reading. Before running a command in the table, read its matching row.

| Need                                                                                               | Reference                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `init`, `capture`                                                                                  | `references/init-and-scaffold.md`     |
| `lint`, `check`, motion sidecars, `snapshot`                                                       | `references/lint-validate-inspect.md` |
| `compare`, `grade-compare`, variable-driven `render --batch`                                       | `references/compare-and-batch.md`     |
| `beats` for an existing project's Studio beat grid                                                 | `references/beats.md`                 |
| `preview`, `play`, `render`, Studio context                                   | `references/preview-render.md`        |
| `doctor`, browser management                                                                       | `references/doctor-browser.md`        |
| `info`, `compositions`, `timeline`, `docs`, `benchmark`, media preprocessing | `references/upgrade-info-misc.md`     |

For composition variables, also read `/cutscene-compose` → `references/variables-and-media.md`. For `cutscene add` and `cutscene catalog`, use `/cutscene-compose`. Before `cutscene keyframes`, read `/cutscene-animate`. For TTS and transcription choices, use `/cutscene-voice`; for captions, `/cutscene-captions`.

The specialized commands are deliberately documented by their owning workflows:

```bash
cutscene beats <project-dir> --json
cutscene keyframes <project-dir> --json
cutscene media-treatment --capabilities
cutscene figma asset KEY:10-20
```

`beats` is the standalone Studio beat-grid utility defined in `references/beats.md`. `keyframes` surfaces seek-safe animation and motion-path diagnostics. `media-treatment` discovers, applies, and clears deterministic looks on local footage — start with `--capabilities` for the overview and `--capability <name>` for one family; `figma` imports over the REST API with the `asset`, `tokens`, and `component` subcommands and needs `FIGMA_TOKEN`; motion and shader import have no REST endpoint and are agent-only, so `/cutscene-design (Figma guide)` owns those.
