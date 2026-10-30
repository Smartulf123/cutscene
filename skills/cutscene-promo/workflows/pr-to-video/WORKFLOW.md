<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

> **Media:** use the user's own images, logos, footage and music when they give them (put them under `assets/`), plus what the capture step finds. Sound effects come from the bundled library in `/cutscene-audio`. Cutscene has no stock-media catalog and never downloads media on its own.

# PR to Cutscene

Use this skill to ingest a GitHub pull request, understand the change, plan a code-change explainer, and build it frame by frame in Cutscene. The input is a **code change** (read via `gh`), not a website — there is **no capture step and no real assets** beyond the contributors' avatars.

> **The front door is `/cutscene`.** You are the orchestrator. Run each step, verify its gate, and only then continue. This skill is for a **GitHub pull request** (a code change). Any other intent, a bare "make a video", or any uncertainty → read `/cutscene` first — the intent layer owns every route decision, and a fresh creation arriving here without `.cutscene/brief.md` goes through it anyway (Setup's opening rule).

You are the orchestrator. Work in the resolved external `PROJECT_DIR`, never in the caller repository by default. Run steps in order and pass each gate before continuing. User-gated steps are Step 0, Step 3, and Step 6. Read `../../../cutscene/references/upstream/references/brief-contract.md` before Step 0 — it defines the gate types and how `.cutscene/brief.md`'s `flow`/`storyboard` derive the mode that governs the Step 3/4/6 gates. Do every step yourself except Step 5, where you dispatch a bounded pool of frame workers. Do not put design or motion rules here; those live in the frame-worker sub-agent, this skill's local `../../../cutscene-animate/rules/` + `../../../cutscene-animate/blueprints/`, and `cutscene-design`.

Workflow: Step 0 setup → `hyperframes.json`; Step 1 ingest → `capture/extracted/` + `assets/<login>.png`; Step 2 design system → `frame.md`; Step 3 storyboard/script → `STORYBOARD.md` and `SCRIPT.md`; Step 3.1 audio → `audio_meta.json`; Step 4 visual design → enriched `STORYBOARD.md`; Step 5 frames → `compositions/frames/NN-*.html` and `index.html`; Step 6 final render → `renders/video.mp4`.

---

## Step 0: Setup

Goal: Enter with a confirmed brief — including the **PR reference** (a full URL, an `<owner>/<repo>#<N>` ref, or "this PR" in a checked-out repo) — create the Cutscene project, and make the brief durable. The style is always **code-editorial** (fixed at Step 2, never asked).

**The brief is confirmed by the intent layer, not by questions asked here.** Opening rule, in order: **(1)** `.cutscene/brief.md` exists → read it and ask nothing — the brief is settled, and its `flow`/`storyboard` derive the mode (brief contract § 1). **(2)** No `.cutscene/brief.md` but the project exists (`hyperframes.json` / `STORYBOARD.md` on disk) → resume from the storyboard's frontmatter and the recorded preferences; never re-interrogate a half-built project. **(3)** Neither — a fresh creation request that arrived here directly → read `/cutscene` and run its intent layer (`references/upstream/references/intent-interview.md`): it checks recipes and remembered defaults, and conducts this route's questions — including the PR-size → length doctrine, which lives whole in `../../../cutscene/references/upstream/references/routes/pr-to-video.md` — then hands back the locked brief. Edit requests skip all of this — go do the edit.

Resolve the project directory before doing any other work. Preserve a user-supplied project directory; otherwise use the durable external cache location printed by the resolver. Never create `videos/` in the caller repository:

```bash
PR="<url | owner/repo#N>"
if [ -n "${EXPLICIT_PROJECT_DIR:-}" ]; then
  PROJECT_DIR="$(node "<this skill's folder>/workflows/pr-to-video/scripts/project-dir.mjs" --pr "$PR" --project-dir "$EXPLICIT_PROJECT_DIR")"
else
  PROJECT_DIR="$(node "<this skill's folder>/workflows/pr-to-video/scripts/project-dir.mjs" --pr "$PR")"
fi
echo "PR-to-video project: $PROJECT_DIR"
node "<this skill's folder>/workflows/pr-to-video/scripts/preflight.mjs"
```

The capability preflight runs before fetch, story work, audio, or frame dispatch. If the installed CLI cannot run the validation command required by this skill, stop with its upgrade instruction rather than spending the run's context first.

Initialize only if `$PROJECT_DIR/hyperframes.json` is missing. Its basename comes from the PR, such as `acme-sdk-pr-1842`; never use the workspace name or a timestamp.

`cutscene init "$PROJECT_DIR" --non-interactive --example=blank --skill=cutscene-promo`

Every relative-path command below runs with `$PROJECT_DIR` as its working directory. Examples without an explicit subshell mean `(cd "$PROJECT_DIR" && …)`; never change the caller repository's working tree.

**Write `.cutscene/brief.md` immediately after init** (never before — `init` refuses a non-empty directory): the intent layer's locked brief, shape per `../../../cutscene/references/upstream/references/brief-format.md`. Record the brief's key decisions (route, length, style preset, voice) in `.cutscene/project.md`, so later turns don't ask again. The review gates still run.

**Sound runs locally.** Narration uses a local voice (Kokoro through `cutscene tts` by default, or a voice designed with `/cutscene-voice`), word timings come from local transcription, music is the user's own file, and sound effects come from the bundled library in `/cutscene-audio`. Nothing needs a sign-in or an API key.

**Gate:** `hyperframes.json` and `.cutscene/brief.md` exist; the PR ref is captured in the brief; the preference-backed answers were recorded (brief contract § 2).

---

## Step 1: Ingest the PR (no capture)

Goal: Fetch the PR's facts and fold them into the project as the source of information. There is **no website capture**. `fetch-pr.mjs` runs `gh` deterministically — completing the files list via paginated `gh api` so a large PR doesn't truncate at ~100 files, and writing only `capture/pr.json` + `capture/diff.patch` (no scratch dir). For MERGED PRs it also resolves a best-effort `shipped_version` (+ `version_source`) into `pr.json`, so the end card can cite a real version instead of inventing one. Then `ingest.mjs` folds that into the synthetic capture package offline.

```bash
PR="<url | owner/repo#N | N>"

# Fetch the PR deterministically: runs gh, completes the files list via paginated
# gh api (so a big PR doesn't truncate at ~100 files), writes only capture/pr.json +
# capture/diff.patch — no scratch dir. gh auth / not-found / private errors exit 1 here.
(cd "$PROJECT_DIR" && node "<this skill's folder>/workflows/pr-to-video/scripts/fetch-pr.mjs" --pr "$PR" --out-dir ./capture)

# Offline transform → capture/extracted/{tokens.json (colors:[] → code-editorial palette),
# visible-text.txt (the brief), people.json (contributors, bot-filtered, name+login,
# avatarFile=assets/<login>.png)}.
(cd "$PROJECT_DIR" && node "<this skill's folder>/workflows/pr-to-video/scripts/ingest.mjs" \
  --pr-json ./capture/pr.json --diff ./capture/diff.patch --out-dir ./capture/extracted)

# The people front's one network step — download each contributor's GitHub avatar to
# assets/<login>.png for the credits close. Best-effort; always exits 0.
(cd "$PROJECT_DIR" && node "<this skill's folder>/workflows/pr-to-video/scripts/fetch-people-avatars.mjs" \
  --people ./capture/extracted/people.json)
```

If `fetch-pr.mjs` exits 1 (gh auth / not found / private), report its stderr and stop — **do not fabricate PR contents**. If `ingest.mjs` exits 1, read its stderr (usually a malformed `pr.json`), fix, and rerun (deterministic). `fetch-people-avatars.mjs` always exits 0; missing avatars just mean no credits close to author.

`people.json` carries a `name` for whichever contributors `gh` already named (the PR author, commit authors, `mergedBy`) — `null` for the rest (reviewers/commenters/assignees, which `gh pr view` only ever gives a bare `login`). Before writing the credits close in Step 3, resolve any `null` name yourself for the 1-6 people who'll actually appear on that frame: `gh api users/<login> --jq .name` (you already have `gh` — no need to script this). If GitHub has no public name for that user either, fall back to the login on-screen and drop that person from the spoken line (see story-design.md's credits section — the voiceover must still say names, never raw handles).

**Gate:** `capture/pr.json`, `capture/diff.patch`, `capture/extracted/tokens.json`, `capture/extracted/visible-text.txt`, and `capture/extracted/people.json` exist; you can state the PR's change in one clear sentence. `assets/<login>.png` is best-effort — its absence is not a failure.

---

## Step 2: Design System

Goal: Adopt the code-editorial frame preset; a script turns it into this video's `frame.md` + caption skin.

The style is fixed — **code-editorial** (warm editorial; a navy code surface built for diffs). Run:

```bash
node "<this skill's folder>/workflows/pr-to-video/scripts/build-frame.mjs" --preset code-editorial --hyperframes .
```

The script copies the code-editorial preset's `FRAME.md` → `frame.md`, remixes it onto any brand tokens in `capture/extracted/tokens.json` (a PR has none → `colors:[]`/`fonts:[]` keeps code-editorial's own palette, a complete design), copies the preset's caption skin to `.hyperframes/caption-skin.html`, and self-validates (exits 1 on a broken mapping). Proceed as soon as it exits 0 — no hand-editing.

**Gate:** `build-frame.mjs` exited 0 — `frame.md` exists from the code-editorial preset, and `.hyperframes/caption-skin.html` exists as the caption skin source.

---

## Step 3: Storyboard and Script

Goal: Turn the PR into an approved frame-by-frame explanation plan.

Read `../../../cutscene-design/references/story-spine.md` (hook language, value-before-evidence, storyboard-as-proposal, source-traceable visuals), `references/story-design.md`, `../../../cutscene-animate/blueprints-index.md`, `../../../cutscene/references/upstream/references/storyboard-format.md`, and `../../../cutscene/references/upstream/references/script-format.md`. Use them to write `STORYBOARD.md` and, when narration is needed, `SCRIPT.md`. Set the frontmatter `duration:` from the brief's `length` — a rough expectation; assembly reports where the cut lands against it.

Use `story-design.md` for the PR archetype (changelog / feature-reveal / fix-explainer / refactor-walkthrough), the PR-native frame types, hook, persuasion, beats, the per-frame word budget, and the credits close. The sequence comes from **narrative design, not the diff's file order** — explain the change, don't read the diff aloud. As a **soft guide**, consult the role→blueprint menu in `../../../cutscene-animate/blueprints-index.md`: for each beat, write the voiceover in the shape its candidate blueprint implies and tag that candidate `blueprint:` id when one fits (story truth still decides which beats exist — never force a beat to fit a shape). Feature 2–4 real diff hunks (from `capture/diff.patch`), each a small legible snippet; name the `code-*` block each wants in the frame's `scene`. Frames carry no `asset_candidates` except the `credits` close (1–6 `assets/<login>.png` avatars). Use the exact required fields from the storyboard and script references.

After drafting, run the review loop's plan pass — `../../../cutscene/references/upstream/references/review-loop.md` § 1: present the plan as a proposal, and ask the two questions — approve or change, and **sketches first** (recommended) or skip. Feedback arrives as a chat reply; loop until approved. This is a **checkpoint gate** (brief contract § 1): in autonomous mode there is nothing to ask — post the same summary as a heads-up and proceed; sketches collapse into the build, and the final preview with its one question comes at Step 6.

**Gate:** `STORYBOARD.md` exists, every frame has the required narrative fields, `SCRIPT.md` exists when narration is needed, and the user approved the plan (autonomous: the summary was posted as a heads-up).

---

## Step 3.1: Audio

Goal: Generate narration, word timings, music, and audio metadata from the approved script.

Start audio after Step 3 approval. Run it in the background, then continue to Step 4.

**Choose the narration voice from the user's ask before invoking.** The default is Kokoro `am_michael` (male). For another preset voice pass `--voice <id>`: `af_heart`, `af_nova`, `af_sky` (female, US), `am_adam`, `am_michael` (male, US), `bf_emma`, `bf_isabella` (female, UK), `bm_george` (male, UK); `cutscene tts --list` prints them all. For a designed or cloned voice, make the lines with `/cutscene-voice` and pass `--provider cutscene-voice`. When the user explicitly picked a voice, record it in `.cutscene/project.md`; with no preference, reuse the voice recorded there before the default, and say which one you used.

`node "<this skill's folder>/workflows/pr-to-video/scripts/audio.mjs" --script ./SCRIPT.md --storyboard ./STORYBOARD.md --hyperframes . --out ./audio_meta.json --voice <voice-id> &`

The audio script handles narration (a local voice), word timings (local transcription) and timing metadata, through Cutscene's local sound engine in `/cutscene-audio`. BGM mood comes from the storyboard's `music:` field, but Cutscene has no music catalog: a mood with no music file is skipped and reported, never fetched. When the user gives you a music or sound-effect file, put the file under assets/ and list it in the audio_meta.json file marked `"source": "host"`: music as `bgm` `{ "path": "assets/…", "source": "host" }` with `music: none` in the storyboard; a sound as an `sfx` entry `{ "frame": <n>, "file": "assets/…", "offset_s": 0, "duration_s": <its length>, "source": "host" }`. Every audio pass keeps these, and a frame with a host sound gets no looked-up cue.

If there is no narration and no `SCRIPT.md`, skip voice generation. BGM may still run if the storyboard has a music mood.

**The canonical fully-silent marker** (shared across the workflows that reuse this audio model): `music: none` in the STORYBOARD.md top YAML block, no `SCRIPT.md`, **and** no `sfx:` cues or host audio. That combination marks the project silent — no narration, no BGM, no SFX. `audio.mjs` recognizes it and generates nothing (it removes any stale `audio_meta.json`; an absent `audio_meta.json` is what assemble treats as silent), so this step is a clean skip. Without narration but with `sfx:` cues or host audio the film is not silent: `audio.mjs` writes the audio_meta.json file for `fetch-sfx` to fill. `music: none` with narration keeps TTS and turns only BGM off. Use exactly this spelling — don't improvise other markers.

**Gate:** audio job has started, or the project is marked silent (`music: none`, no `SCRIPT.md`, no `sfx:` cues or host audio).

---

## Step 4: Frame Visual Design

Goal: Add the visual direction, layout intent, and motion choices to each storyboard frame.

**Sketch the storyboard sheet first (collaborative only).** The moment the plan is approved, run the sketch pass — `../../../cutscene/references/upstream/references/review-loop.md` § 2 (don't wait on Step 3.1; the stills don't use timings): pose every frame yourself in its composition, mount each in `index.html` at its planned start, snapshot all the stills in one run and write the board, `boards/storyboard.html` (`../../../cutscene-design/references/storyboard-recipe.md`), mark each `built`, pause for the one layout question when every frame is `built`, and revise only the frames named until the board is confirmed. Stand-ins: for a **code beat**, a plain code panel with the filename and a few real diff lines as text — the `code-*` block wiring belongs to the workers. Only then write the visual design below onto the confirmed layouts. In autonomous mode, or when the user chose to skip sketches at Step 3, skip this pass — frames go straight from `outline` to `animated` at Step 5.

Edit `STORYBOARD.md` in place. Do not create another storyboard. Use `frame.md` as source of truth for color, type, layout feel, and style.

Read `references/visual-design.md`, `../../../cutscene-animate/blueprints-index.md`, `references/motion-language.md`, `references/code-vocabulary.md`, and `../../../cutscene-animate/rules-index.md`. Use `visual-design.md` for the method (the time-coded shot sequence, the inline Layout vocabulary, and the code-beat treatment), plus the required `## Video direction` block. Use `../../../cutscene-animate/blueprints-index.md` to pick each frame's shot shape. Use `code-vocabulary.md` to pick the right `code-*` block per code beat (diff = `code-diff`, refactor = `code-morph`, new code = `code-typing`, …). Use `motion-language.md` (the motion vocabulary + the motion doctrine) and `../../../cutscene-animate/rules-index.md` (valid rule names) for motion — do not invent motion or block/blueprint names.

**Search the live catalog before you design any named look.** `code-vocabulary.md` covers the code beats; it does not cover the rest. For every other look, effect, treatment or transition the brief names — "CRT scanlines", "glitch", "film grain", "shimmer sweep", "confetti burst" — run `cutscene catalog --query "<the look, in plain English>" --json` and read the top results BEFORE you write that look into `STORYBOARD.md`. The search needs **nothing installed**: no project, no prior `add`, no account. It ranks the whole hosted registry (~400 blocks and components) from any directory. Name the block you found here; Step 5 pre-installs every block the storyboard names. Hand-author a look only after a search for it came back with nothing that fits.

For every frame, write a **time-coded shot sequence** into `STORYBOARD.md` per `visual-design.md`'s method: pick the frame's blueprint (or compose), instantiate it with THIS frame's content, and pace each Scene's reveal to the voiceover so the frame develops across its full duration instead of front-loading then freezing. **For a code beat, the `code-*` block is the frame's `focal`** and the Scenes choreograph the surrounding code-editorial Code Surface (the entry of the file/header, the camera onto the hunk, the landing line) — **not** the code animation itself, which the block owns. Immediately after each code frame's fields, add a `### Source excerpt` fenced `diff` block containing only the exact real hunk the worker must render (12 lines maximum). Select it here from `capture/diff.patch`; workers are forbidden from reopening that full diff. State layout and motion **inline** per Scene (vocabularies in `visual-design.md` and `motion-language.md`). Add one video-wide `## Video direction` block.

Do not change story, script, `transition_in`, `asset_candidates`, or the PR source. Do not write HTML in this step beyond the sketch pass's poses. There is **no asset-staging step** — the only real assets are the credits avatars, already in `assets/`.

**Gate:** every frame has a time-coded shot sequence whose reveals are paced to the voiceover (no front-loading); code frames name a `code-*` block as the `focal`; `## Video direction` exists. Collaborative: the sketch sheet was confirmed.

---

## Step 5: Build Frames

Goal: Build every storyboard frame as an HTML composition and assemble the playable video.

Wait for Step 3.1 audio to finish if audio was started. Then sync durations and fetch SFX; skip both if silent.

`node "<this skill's folder>/workflows/pr-to-video/scripts/audio.mjs" sync-durations --audio-meta ./audio_meta.json --storyboard ./STORYBOARD.md`

`node "<this skill's folder>/workflows/pr-to-video/scripts/audio.mjs" fetch-sfx --storyboard ./STORYBOARD.md --hyperframes .`

Duration sync is mechanical: real voice duration wins; silent frames keep estimates; never hand-edit synced durations.

**Pre-install the registry blocks** named across `STORYBOARD.md` once, before dispatch, so parallel workers don't race on the registry:

`for b in <each registry block named in the storyboard>; do cutscene add "$b"; done`

Before dispatch, read `../../../cutscene/references/upstream/references/subagent-dispatch.md`. Build bounded packets and the worker role payload:

```bash
node "<this skill's folder>/workflows/pr-to-video/scripts/frame-packets.mjs" --project "$PROJECT_DIR" --storyboard "$PROJECT_DIR/STORYBOARD.md"
```

The packet builder hard-fails a code frame without the upstream-selected `### Source excerpt`, and hard-caps packet bytes. It also writes `_role.md` (`../../../cutscene/references/upstream/references/frame-worker-core.md` + this skill's `sub-agents/frame-worker.md`, concatenated verbatim — the complete worker role). Dispatch **at most three workers total**, balanced across the packet paths; each worker's prompt carries `_role.md` and its assigned packet paths — paste the role in full or hand its path (equivalent; the worker starts from exactly those documents) — and each worker may build multiple assigned frames sequentially, reading the role once. Workers read only their packet(s) and `frame.md`. They never open the full `STORYBOARD.md`, `capture/diff.patch`, or `capture/extracted/visible-text.txt`. Each worker writes only its assigned `compositions/frames/NN-*.html`; workers never edit `STORYBOARD.md`. When a frame has a **confirmed sketch** on disk (collaborative runs — review loop § 3), say so in that worker's dispatch context: the sketch is the existing `compositions/frames/NN-*.html`, and the worker dresses that layout rather than redrawing it (frame-worker core § When a confirmed sketch exists).

On a failed frame, re-dispatch **that frame only**, with its existing packet plus the exact validator/lint finding. One retry maximum. Do not replay a whole batch and do not retry without a concrete finding.

**Full-bleed backgrounds ride on a `class="clip"` layer, never the `#root`.** A frame's ground (color field / gradient / grid) is its own full-duration background clip — a `background` set on the `#root` / `data-composition-id` element is clip-gated to the frame's window and is not a dependable ground, so dark content can land on the black host `body` and render invisible. The video's base ground is painted by the assembler from `frame.md`'s `canvas` color onto the index `#root`. (Full rule + self-check: `../../../cutscene/references/upstream/references/frame-worker-core.md`.)

As each worker returns, mark that frame `animated` in `STORYBOARD.md`.

After audio timings exist, build captions in the background and assemble the index:

`node "<this skill's folder>/workflows/pr-to-video/scripts/captions.mjs" build --storyboard ./STORYBOARD.md --audio-meta ./audio_meta.json --hyperframes . --out ./caption_groups.json &`

`node "<this skill's folder>/workflows/pr-to-video/scripts/assemble-index.mjs" --storyboard ./STORYBOARD.md --hyperframes .`

`captions.mjs` uses the project's `.hyperframes/caption-skin.html` (code-editorial's, copied in Step 2), injecting brand tokens from `frame.md`; `captions: skipped (<reason>)` is valid. `assemble-index.mjs` stages the credits avatars from `assets/` as an idempotent backstop.

**Gate:** every frame is marked `animated` (collaborative: the sketch sheet was confirmed at Step 4), `index.html` exists, and captions are built or explicitly skipped.

---

## Step 6: Finalize

Goal: Verify the assembled video, get user approval, and render the final MP4.

Inject transitions, run checks, pause for review, then render.

`node "<this skill's folder>/workflows/pr-to-video/scripts/transitions.mjs" inject --storyboard ./STORYBOARD.md --hyperframes .`

`node "<this skill's folder>/workflows/pr-to-video/scripts/transitions.mjs" verify --storyboard ./STORYBOARD.md --index ./index.html`

`cutscene lint`

`cutscene check`

`cutscene snapshot --at <frame-midpoints>`

`snapshot` stitches the captured frames into one contact sheet (`.hyperframes/artifacts/snapshots/<id>/contact-sheet.jpg`; the command prints the path). Glance at it; if nothing is obviously broken, move on — don't linger here.

If a command fails, surface stderr and stop — don't pile on recovery commands. Fix it yourself: the cheapest safe edit to `compositions/frames/NN-*.html`, then rerun the failed check.

**Known false-positive — do not chase it.** `check` may report a handful of `text_box_overflow` errors of ~1–4px on the **caption** highlight words (selector `#caption-word-*` / `.caption-line`). The caption pill uses a deliberately snug `line-height` (set once in `scripts/captions.mjs`) and has **no `overflow:hidden`**, so a heavy display glyph's ink spills a few px into the pill's own padding — nothing is actually clipped. Treat these as expected and proceed. Do **not** inflate the caption `line-height` (it balloons the pill, which is worse). Only act on a `text_box_overflow` when it names a **frame** element (`#el-NN-*`), not a caption word.

After checks pass, pause for user review — the review loop's final look (`../../../cutscene/references/upstream/references/review-loop.md` § 4): one question, on the final Studio preview — render now, or what changes? (Autonomous: the same, as the one kept question — open the preview with the command below even though the user didn't ask for one.) Then deliver the MP4 with the contact sheet and the frame ids so revisions can target a single frame.

Preview: `cutscene preview "$PROJECT_DIR" --background`

Render only after user approval (autonomous mode: after the render-or-changes question):

`cutscene render --skill=cutscene-promo --quality high --output renders/video.mp4`

Do not rerun `lint`, `check`, or `snapshot` after rendering unless the user asks.

After the user is done reviewing (or after render when no more live edits are expected), stop only this project's background server: `cutscene preview "$PROJECT_DIR" --stop`. Never tear it down while waiting for review.

**Gate:** `lint` and `check` passed and the snapshots were inspected before render; user approved at the review pause (autonomous: checks passed and the delivery includes the contact sheet); `renders/video.mp4` exists. Final reply states the MP4 path and final duration.

---

## Quick Reference

**Formats:** landscape `1920x1080`; portrait `1080x1920`; square `1080x1080` — derived from the destination (brief contract § 2). Set the format once in the storyboard frontmatter.

**PR deltas vs a captured-asset workflow:** no Step 1 capture (the `gh` CLI ingests the PR into a synthetic `capture/extracted/` package — `tokens.json` + `visible-text.txt` + `people.json`); the only real assets are the contributors' `assets/<login>.png` avatars (the credits close); no `asset-descriptions.md`, no asset-staging step. Code beats are rendered by the `code-*` registry blocks on code-editorial's navy Code Surface; the style is always **code-editorial**.

**Background scripts:** the workflow ships these under `scripts/`: `fetch-pr` (PR → `capture/pr.json` + `diff.patch` via `gh`; large-PR-safe, no scratch), `ingest` (→ synthetic capture package; offline), and `fetch-people-avatars` (contributor avatars → `assets/`); plus the shared engine — `build-frame` (adopt + brand-remix a preset into `frame.md` + caption skin), `audio` (TTS, BGM, SFX, duration sync), `captions`, `transitions` (inject + verify), and `assemble-index`. Everything else is the `Cutscene` CLI. Code blocks install via `cutscene add <name>`.

The reusable, domain-agnostic shot shapes live in `../../../cutscene-animate/blueprints/` (indexed by `../../../cutscene-animate/blueprints-index.md`); the `code-*` registry blocks are the code-beat vocabulary (`references/code-vocabulary.md`).

| Read                                                                                                                                                        | When                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `[../../../cutscene/references/upstream/references/brief-contract.md](../../../cutscene/references/upstream/references/brief-contract.md)`                                                                | Gate types, mode derivation from `.cutscene/brief.md`, field semantics.                                            |
| `[../../../cutscene-design/references/story-spine.md](../../../cutscene-design/references/story-spine.md)`                                                    | Step 3: story doctrine — hook language, value-before-evidence, proposal shape, source-traceable visuals. |
| `[references/story-design.md](references/story-design.md)`                                                                                                  | Step 3: plan the PR explanation.                                                                         |
| `[../../../cutscene-animate/blueprints-index.md](../../../cutscene-animate/blueprints-index.md)`                                                              | Step 3: role→blueprint menu. Step 4: pick the shot shape.                                                |
| `[../../../cutscene/references/upstream/references/storyboard-format.md](../../../cutscene/references/upstream/references/storyboard-format.md)`                                                          | Step 3: write `STORYBOARD.md`.                                                                           |
| `[../../../cutscene/references/upstream/references/script-format.md](../../../cutscene/references/upstream/references/script-format.md)`                                                                  | Step 3: write `SCRIPT.md`.                                                                               |
| `[references/visual-design.md](references/visual-design.md)`                                                                                                | Step 4: write the frame's shot sequence (+ Layout vocabulary).                                           |
| `[references/code-vocabulary.md](references/code-vocabulary.md)`                                                                                            | Step 4 + 5: pick + fill the `code-*` block for a code beat.                                              |
| `[references/motion-language.md](references/motion-language.md)`                                                                                            | Step 4: the motion vocabulary + the motion doctrine.                                                     |
| `[references/cut-catalog.md](references/cut-catalog.md)`                                                                                                    | Step 4-5: the cut catalog (worker builds within-frame seams).                                            |
| `[../../../cutscene-animate/rules-index.md](../../../cutscene-animate/rules-index.md)` + `[../../../cutscene-animate/rules/](../../../cutscene-animate/rules)` | Step 5: local rule recipe bodies for the cited motions.                                                  |
| `[../../../cutscene/references/upstream/references/frame-worker-core.md](../../../cutscene/references/upstream/references/frame-worker-core.md)`                                                          | Step 5: the shared worker contract (packet builder prepends it to the delta).                            |
| `[sub-agents/frame-worker.md](sub-agents/frame-worker.md)`                                                                                                  | Step 5: the workflow's frame-worker delta.                                                               |
| `[../../../cutscene/references/upstream/references/subagent-dispatch.md](../../../cutscene/references/upstream/references/subagent-dispatch.md)`                                                          | Step 5: dispatch sub-agents safely.                                                                      |
| `[../../../cutscene-design/frame-presets/code-editorial/FRAME.md](../../../cutscene-design/frame-presets/code-editorial/FRAME.md)`                            | Step 2: the code-editorial preset (fixed style).                                                         |
