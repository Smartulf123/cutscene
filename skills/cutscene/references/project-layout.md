# Project layout and the Cutscene home

## A video project

`cutscene init <folder>` makes a project:

```
<project>/
  index.html                     the main composition (root timeline)
  compositions/                  sub-compositions, including 3D shots (scene3d-<shot-id>.html)
  compositions/assets/3d/        fonts, logos and models the 3D shots use
  assets/                        images, audio, fonts
  assets/voice/<line-id>.wav     final voice lines (+ <line-id>.license.txt)
  hyperframes.json, meta.json    engine settings and project id: keep their names
  CLAUDE.md, AGENTS.md           short guide for any agent that opens the project
  .gitignore                     keeps caches and render outputs out of git (below)
  .cutscene/
    brief.md       what the user wants (approved before building)
    look.json      this video's look (palette, type, motion, texture)
    beats.json     the beat sheet (see beats.md)
    project.md     short memory: decisions, approvals, what was checked
    voice/         voice working files: references, takes, check reports
    3d/            3D shot specs (<shot-id>.json)
    edit/          transcripts, edit lists, review pages
```

- Engine files keep their names; never rename them.
- Final media goes in `assets/`; working files go in `.cutscene/`.
- Copy the user's footage into `assets/` and work on the copy; never change their originals.
- Paths inside `beats.json` and `look.json` are relative to the project folder.
- `.gitignore` lists what Cutscene, the engine and the preview rebuild on their own:
  `.hyperframes/` (snapshots and check reports live there), `.thumbnails/`, `.transcode-cache/`,
  `.cutscene/stills/`, voice takes, `renders/` and videos saved in
  the project's top folder. If the project already has a `.gitignore`, `cutscene init` only adds
  the lines it is missing.

## The Cutscene home (`~/.cutscene`)

Shared by every project. Set `CUTSCENE_HOME` to use another folder.

```
~/.cutscene/
  config.json        user settings, e.g. {"voice": {"default": "kokoro"}}
  engine/<version>/  the pinned video engine
  media/             the engine's media cache
  voice/             voice environment, model weights, benchmarks.json
  assets/            downloaded free (CC0) assets, by checksum
  logs/
```

- Scripts read and write `config.json` only through `scripts/lib/config.mjs`
  (`readConfig()`, `writeConfig(patch)`).
- Nothing Cutscene downloads goes on PATH or is installed globally.
- The engine keeps its render browser, fonts and speech models in its own cache
  (`~/.cache/hyperframes/`); `cutscene setup` says so before it downloads anything there.
