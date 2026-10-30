---
name: cutscene-promo
description: "Use for promo-style Cutscene videos made from a product or marketing URL, a GitHub pull request, or a topic or script: product launch, feature reveal and site-tour videos, faceless explainers, and PR-to-video changelog clips. Load it after the cutscene skill (the entry point for every new video) has routed the brief here; each is a gated workflow (brief, script, storyboard, frames, sound, assembly, review). Does NOT edit existing footage (cutscene-edit), make Blender 3D (cutscene-3d), or render a final video without the user's OK."
---

<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

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

## How to run cutscene commands

In this skill, `cutscene <command>` is shorthand for:

```bash
node "<this skill's folder>/../cutscene/scripts/cli.mjs" <command>
```

Replace `<this skill's folder>` with the folder this SKILL.md was loaded from. Scripts named `<this skill's folder>/scripts/...` run with plain `node`. Never call the engine through `npx`, and never use cloud commands: Cutscene works on this computer only, and it never renders a final video unless the user asks.
