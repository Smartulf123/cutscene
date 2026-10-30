<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

# init, capture

<!-- registry-items: allow=blank,landscape-4k,portrait-4k,square-4k,cutscene-promo,cutscene-compose,cutscene-audio -->

Scaffolding commands. Use these instead of creating files by hand — they set up the right file structure, copy media, run transcription, and install AI coding skills.

## init

```bash
cutscene init my-video                                    # centered blank (TTY: wizard)
cutscene init my-video --example warm-grain               # pick an example
cutscene init my-video --resolution portrait
cutscene init my-video --video clip.mp4                   # with video file
cutscene init my-video --audio track.mp3                  # with audio file
cutscene init my-video --tailwind                         # Tailwind v4 browser runtime
cutscene init my-video --non-interactive                  # CI — flag-only, same blank
```

**Default depends on TTY**: in a terminal, the CLI prompts for example/options (default: centered blank). Outside a TTY (CI, agents, piped output) it auto-switches to non-interactive and scaffolds that blank. Pass `--example` only to start from a named example. Pass `--non-interactive` to force flag-only mode on a TTY.

Templates: `blank`, `warm-grain`, `play-mode`, `swiss-grid`, `vignelli`, `decision-tree`, `kinetic-type`, `product-promo`, `nyt-graph`. (The closed set of `Cutscene:example` items in `registry/registry.json` plus the bundled `blank` template. `cutscene catalog` does not list examples — its `--type` takes only `block` or `component` — so this list has no live equivalent and is checked by `bun run lint:skills`.)

Other useful flags:

- `--resolution` — preset: `landscape` (1920×1080), `portrait` (1080×1920), `landscape-4k`, `portrait-4k`, `square` (1080×1080), `square-4k`. Aliases: `1080p`, `4k`, `uhd`, `1080p-square`, `4k-square`.
- `--skill=<slug>` — record the owning authoring workflow (e.g. `cutscene-promo`) in `hyperframes.json`, so every later render of this project — re-renders, `npm run render`, `--batch` — is attributed to it on anonymous telemetry without re-passing the flag. Creation workflows set this automatically; you rarely pass it by hand.
- `--skip-skills` — **temporarily ignored**: `init` always checks AI coding skills against GitHub while the skills.sh registry catches up. To opt out (CI/tests), set the `HYPERFRAMES_SKIP_SKILLS=1` env var instead.
- `--skip-transcribe` — don't auto-transcribe `--audio` / `--video` with Whisper.
- `--model`, `--language` — Whisper model / language for the auto-transcription.

When using `--tailwind`, invoke the `cutscene-compose` (Tailwind reference) skill before editing classes or theme tokens. The scaffold uses Tailwind v4 browser runtime patterns, not Studio's Tailwind v3 setup.

When `--audio` or `--video` is supplied, `init` transcribes the file with Whisper. For voice and model selection see `/cutscene-voice`.

## capture

```bash
cutscene capture https://stripe.com                  # scaffold from a website
cutscene capture https://linear.app -o linear-video  # custom output directory
cutscene capture https://example.com --json          # JSON output for agents
cutscene capture https://example.com --skip-assets   # skip image/SVG download
cutscene capture https://example.com --skip-vision   # skip optional AI captions
cutscene capture https://example.com --max-screenshots 12
cutscene capture https://example.com --timeout 60000 # page-load timeout in ms
cutscene capture https://example.com --capture-budget 90000 # post-navigation budget
```

Captures a live URL as an editable Cutscene project: screenshots become layered scenes, assets are downloaded locally, and the result is a normal project you can `lint` / `preview` / `render`. Use this when the user supplies a URL as the starting point for a video.

`--timeout` bounds page navigation; `--capture-budget` is the separate cooperative budget for work
after navigation (fonts, assets, vision, and contact sheets). The latter is not a hard wall-clock
watchdog and cannot interrupt native work already in flight. An outer caller deadline is therefore a
third, distinct timeout. An outer caller timeout leaves the capture result unknown; it does not prove
Cutscene hung or that the navigation timeout should be increased. Preserve the last phase and
classify the boundary that fired. `--skip-vision` disables only optional AI image captioning.

For agents, use `--json`. The result includes `ok`, warnings, and `lastPhase`. The command also emits
stable `HYPERFRAMES_CAPTURE_PHASE` records so a watchdog can report the last started, completed, or
degraded phase without retaining sensitive payloads.

Treat a non-zero exit, JSON `ok: false`, or an output `BLOCKED.md` as a **hard stop**. Do not render,
build, or infer brand/design data from partial files in a blocked capture. A successful capture may
degrade an optional phase within budget, but its structural output still has to satisfy the owning
workflow's gate. Exit zero and file existence alone are not semantic success: require the current
invocation's JSON `ok: true`, no `BLOCKED.md`, and artifacts usable for that workflow. Run each retry
into a fresh output directory; never merge or reuse a blocked attempt's partial output.
