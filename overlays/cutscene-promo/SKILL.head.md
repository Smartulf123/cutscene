# Cutscene promo

Three gated workflows that turn a source into a finished promo-style video. Pick one, then read
its `WORKFLOW.md` and follow it step by step.

| The user has | Workflow | Read |
|---|---|---|
| A product or marketing URL, a product brief or script; a launch, feature reveal, demo, or a tour of a site | product launch | [workflows/product-launch/WORKFLOW.md](workflows/product-launch/WORKFLOW.md) |
| A topic, question, article or script to explain, with no product to sell and no presenter on camera | faceless explainer | [workflows/faceless-explainer/WORKFLOW.md](workflows/faceless-explainer/WORKFLOW.md) |
| A GitHub pull request, a release or a changelog to show | PR to video | [workflows/pr-to-video/WORKFLOW.md](workflows/pr-to-video/WORKFLOW.md) |

When it is unclear which one fits, or the request is not promo-shaped at all, go back to
`/cutscene` and let the router decide. Footage edits go to `/cutscene-edit`.

Rules for every workflow:

- **The brief is approved first.** Each workflow starts from `.cutscene/brief.md` (written by the
  `/cutscene` router) and stops at its user gates. Record decisions in `.cutscene/project.md`.
- **A fresh look per video.** Step 2 picks a frame preset; before that, make this video's
  `.cutscene/look.json` with `/cutscene-design` (`look new`) and use it to choose and remix the
  preset. Run `look compare` against earlier projects so this video does not look like the last.
- **Sound is local.** Narration is Kokoro (`cutscene tts`) or a voice from `/cutscene-voice`;
  music is the user's own file; sound effects come from `/cutscene-audio`'s bundled library.
- **Scripts:** each workflow's commands name `<this skill's folder>/workflows/<name>/scripts/...`;
  run them with plain `node`.
- **No final render unless the user asks.** The last gate is the preview.

This skill does NOT edit existing footage (`/cutscene-edit`), make Blender 3D (`/cutscene-3d`),
design voices (`/cutscene-voice`) or render without the user's OK.
