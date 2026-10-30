<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

# Cutscene entry point

## 1. Start from project state

Apply the first matching row; do not evaluate lower state rows:

| State                                                                                                                         | Action                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specific operation on an existing Cutscene project: inspect, diagnose, validate, preview, render, or batch-render | Perform only that operation. Skip intent and workflow routing; load `/cutscene-render` and any required domain skills.                                                                                                                 |
| A question, a hold, an idea with no concrete change, or a felt note on a built film, in an existing project                   | Follow `/cutscene` § 0.                                                                                                                                                                                                      |
| A new film asked for inside an existing project                                                                               | Follow `/cutscene` § 5.                                                                                                                                                                                                      |
| Specific edit to an existing project                                                                                          | Make the edit. Do not run the intent layer. To know what is on a project's timeline (tracks, clips, starts, ends, what plays), run `cutscene timeline [--json]` instead of reading `index.html` and every sub-composition file. |
| `.cutscene/brief.md` exists                                                                                                             | Read `workflow` and `flow`. Execute that workflow; `flow: companion` always executes in `/cutscene-compose`. Ask no brief questions.                                                                                                      |
| No brief, but `hyperframes.json` or `STORYBOARD.md` exists                                                                    | Resume from project files and recorded preferences. Infer the owning workflow from existing artifacts. If it cannot be determined uniquely, ask one routing-only question; do not run the intent interview.                            |
| Fresh creation                                                                                                                | Run the intent layer — `references/intent-interview.md` — then route once using § 2's table.                                                                                                                                           |

<!-- history (trial): remove this block together with the command -->

When you edit an existing project, bracket your edits with project history (`/cutscene-render`, Project history in your turn).

<!-- /history (trial) -->

If a fresh request does not identify the subject or input, ask what the video is about before routing. Check preferences and recipes before asking anything (`references/intent-interview.md`, step 1). A `figma.com` input or a named recipe changes intake, not routing — the interview's "Adapt orthogonal inputs" section handles both.

## 2. Route fresh creation

Use the first matching row. Match the requested **deliverable**, not a word or file type mentioned in passing.

| Priority | Request                                                                                                            | Workflow                   |
| -------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 3        | Add plain captions or subtitles to existing talking-head footage without changing it                               | `/cutscene-captions`       |
| 4        | Add designed graphic overlays to existing talking-head, interview, or podcast footage without changing the footage | `/cutscene-edit`      |
| 6        | Create an explicitly short, unnarrated, motion-first unit, typically under 10s                                     | `/cutscene-animate`         |
| 7        | Explain a GitHub pull request or code change from a PR reference                                                   | `/cutscene-promo`             |
| 8        | Market or showcase a website, product site, app, or company from a URL or site-specific brief                      | `/cutscene-promo`    |
| 9        | Explain a topic, article, or notes with invented visuals and no product or site capture                            | `/cutscene-promo`      |
| 10       | Any other custom video or composition                                                                              | `/cutscene-compose`           |

Before finalizing the route, read `references/routes/<workflow>.md` — one small file per route: the canonical input/output/trigger contract (available before lazy-installed workflow skills are present) plus that route's interview entry. If the candidate does not satisfy its contract, continue routing instead of forcing the match. Read only the matched route's file.

### Resolve common ambiguities

- A short animated title, logo sting, stat hit, chart hit, map hit, or standalone lower-third is `/cutscene-animate` when it is unnarrated and motion is the message. A static title card, narrated sequence, longer montage, or custom loop is `/cutscene-compose`.
- An explicitly short motion graphic may use a URL, tweet, article, or screenshot as source material. A generic "make a video from this site" request is `/cutscene-promo`.
- Existing footage with captions routes to `/cutscene-captions`; footage with designed information cards routes to `/cutscene-edit`. Retiming, reordering, recoloring, reframing, or remixing footage is a custom edit and falls through to `/cutscene-compose`.
- "I want a storyboard" changes the review process, not the workflow. With no other routing signal, use `/cutscene-compose`. A confirmed board (`boards/storyboard.html`, format in `/cutscene-design` `references/storyboard-recipe.md`) may itself be the requested deliverable; the review loop defines that stop point.
- Specialized narrative workflows support up to about 3 minutes and are strongest around 30–90s. Route a clearly longer piece to `/cutscene-compose`. Length never overrides an explicit port, deck, caption, overlay, or music-driven deliverable.

## 3. Route once, then leave

For fresh creation the intent layer (`references/intent-interview.md`) runs the full conversation — memory, triage, pitch round, must-haves, run-shape, hand-off — and **ends by writing `.cutscene/brief.md`. The brief is the only routing artifact the workflow reads**; nothing later re-opens this skill or the interview. Answer every later "what did the route require?" from `.cutscene/brief.md`.

## 4. Install and enter the workflow

Before reading the selected workflow, install or refresh it and the core domain skills:

Use the bare name without `/`. If the command fails, surface the error; do not reconstruct the workflow from memory. Everything else about installation — the core-vs-lazy split, what `init` refreshes, diagnosis, CI opt-out, and the no-CLI fallback — lives in `references/skill-lifecycle.md`.

## 5. Load domain skills on demand

| Need                                                                                                                                        | Skill                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Composition structure, timing attributes, tracks, variables, determinism                                                                    | `/cutscene-compose`      |
| Motion rules, scene blueprints, transitions, runtime adapters                                                                               | `/cutscene-animate` |
| Seek-safe GSAP, CSS, Anime.js, WAAPI, FLIP, paths, masks, SVG, 3D keyframes, or `cutscene keyframes` diagnostics                         | `/cutscene-animate` |
| Design specs, concept, palette, typography, narration, beat planning                                                                        | `/cutscene-design`  |
| Images, icons, logos, audio, captions, grades, LUTs, reusable media                                                                         | `/cutscene-audio`             |
| Voiceover carve, audio effect chains, automation envelopes, or one chain/fader across several tracks (submix bus)                           | `/cutscene-audio`     |
| Init, lint, check, snapshots, compare, batch render, Studio, render, or diagnostics                                                | `/cutscene-render`       |
| Registry blocks and components                                                                                                              | `/cutscene-compose`  |
| A named look, effect, treatment, or transition — CRT scanlines, glitch, film grain, shimmer sweep, confetti burst — BEFORE hand-building it | `/cutscene-compose`  |
| Figma assets, tokens, components, or storyboard frames as reconstructed motion                                                              | `/cutscene-design (Figma guide)`                 |

Creator edit phrases are cross-domain requests. Load every skill named in the matching row:

| Creator request                                                                                                    | Required domains                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “cut this footage”, hard cut, trim, splice, reorder, or use a source range                                         | `/cutscene-compose` + `/cutscene-compose`; core owns `data-start`, `data-duration`, `data-media-start`, and track layout.                                                            |
| zoom in here, punch-in / punch-out, smooth multi-state zoom or reframe, Ken Burns, or camera move                  | `/cutscene-compose` + `/cutscene-compose` + `/cutscene-animate`; animate the inner visual/crop wrapper, not the timed clip.                                                     |
| match cut or whip pan camera transition                                                                            | `/cutscene-compose` + `/cutscene-animate` + `/cutscene-animate` + `/cutscene-compose`; search/install a transition primitive before hand-authoring.                    |
| fade, crossfade, track gain/volume, automation, duck/carve, audio effects, or one effect across several tracks     | `/cutscene-compose` + `/cutscene-compose` + `/cutscene-audio`; core places clips, audio mixes placed tracks — including a submix bus over a group of them.                        |
| picture and sound edits that combine cuts with camera motion or mixing                                             | `/cutscene-compose` + `/cutscene-compose` + `/cutscene-animate` when there is visual motion + `/cutscene-audio` when sound is faded, mixed, ducked, automated, or processed. |
| lay out a project so it reads well in Studio: caption track, tracks per element kind, sub-compositions, safe zones | `/cutscene` + `/cutscene-compose`; studio owns the layout conventions, core owns each edit.                                                                             |
| source or generate media, or preprocess an unsupported mid-source freeze                                           | `/cutscene-audio`; sourcing/generation/preprocessing only, never placed-track mixing.                                                                                                  |

Constant `data-playback-rate` is render-safe for picture and pitch-preserved
sound. Speed ramps are a `rate` lane in `data-automation`.
For copyable edit contracts, load `/cutscene-compose` → `references/creator-editing-recipes.md`.

Broad feedback about how photographic media looks or behaves also routes to
`/cutscene-audio`, even when the user never says “color grading” or “effect”: fix
dark/flat/boring footage, stylize a clip, hide a face, or improve a media
reveal. Read `../media-use/references/media-treatments.md` before editing a
treatment; it governs how footage is treated, never whether media may be used.
Do not substitute a generic LUT, CSS filter/overlay, or opacity tween for an
existing canonical treatment primitive. Keep text/layout/motion-only edits in
their owning domain.
During a build with important photographic media, include one grounded
media-polish scan in the final quality pass; leaving suitable media unchanged is
a valid result.

Domain skills never take ownership of the end-to-end deliverable. Load only what the active workflow needs.
