# Contributing to Cutscene

Thanks for helping. Bug reports, fixes and new recipes are all welcome.

## Set up

You need Node.js 22 or newer and FFmpeg. Python is only needed for the voice tests; those tests
skip themselves when it is missing.

```bash
npm ci
```

```bash
npm test
```

`npm test` builds the TypeScript first. Set `CUTSCENE_VOICE_REAL=0` to skip the slow test that runs
real voice models.

## TypeScript

Cutscene's own code is TypeScript, in `src/`. Skills are installed straight from this repo and
run with plain `node`, so each source file is built to the same path without `src/`, and the
built file is committed:

| You edit | Built to (committed, don't edit) |
|---|---|
| `src/skills/cutscene/scripts/cli.mts` | `skills/cutscene/scripts/cli.mjs` |
| `src/tools/sync-hyperframes.mts` | `tools/sync-hyperframes.mjs` |
| `src/overlays/cutscene-design/scripts/look.mts` | `overlays/cutscene-design/scripts/look.mjs` |

```bash
npm run build
```

Every built file starts with a line naming its source, and has a declaration file (`.d.mts`)
next to it with its types. CI fails if either is out of date. Tests are TypeScript too
(`tests/**/*.test.ts`); they import the built files, and `npm run typecheck` checks them.

The code that runs inside a 3D video, in the browser, is in `src/skills/cutscene-3d/templates/tier1/`
and builds to `.js` with browser types (`tsconfig.browser.json`). Three.js and GSAP come from the
page, so their types are small declaration files next to that code.

Some code stays in other languages on purpose: the videos and design references are HTML (that
is what the engine renders), the voice scripts are Python (the voice models only run Python), and
the generated skills keep the engine's JavaScript.

## Where things live

| Folder | What |
|---|---|
| `src/` | The TypeScript source for everything Cutscene wrote |
| `skills/cutscene/` | The router skill and the `cutscene` command (`scripts/cli.mjs`, built) |
| `skills/cutscene-3d/`, `-voice/`, `-edit/` | Cutscene's own skills; edit the `SKILL.md` (and the voice worker's Python) here, the scripts in `src/` |
| `skills/cutscene-compose/`, `-animate/`, `-design/`, `-captions/`, `-audio/`, `-render/`, `-promo/` | **Generated** from the pinned engine source; don't edit them by hand |
| `overlays/` | Cutscene's changes to the generated skills ([how it works](overlays/README.md)) |
| `tools/` | The build, the sync, the skill validator and the pin-age check (built from `src/tools/`) |
| `tests/` | Vitest tests, one folder per part |
| `examples/` | Example projects |

To change a generated skill, edit its overlay (code overlays live in `src/overlays/`; the rest in
`overlays/`), or `tools/sync-map.json` for small text changes. Then run `npm run build` and
`node tools/sync-hyperframes.mjs` to rebuild it.

## Before you open a pull request

```bash
npm test
```

```bash
npm run typecheck
```

```bash
node tools/validate-skills.mjs
```

```bash
node tools/sync-hyperframes.mjs --check --strict
```

```bash
node tools/check-pin-ages.mjs
```

## Rules for changes

- **Everything stays on the user's computer.** No uploads, cloud services or telemetry.
- **Ask before downloading.** Any new download needs an exact version, a SHA-256 checksum and a
  consent step, and must be at least 14 days old (`check-pin-ages.mjs` enforces this).
- **Licences.** New third-party code, fonts or media need a licence that allows redistribution,
  and an entry in `NOTICE.md` or `THIRD_PARTY.md`.
- **Plain language.** Skills and messages are read by people who aren't developers: short
  sentences, everyday words, and every error says how to fix it.
- **Tests.** A bug fix comes with a test that failed before the fix.

By contributing you agree that your work is licensed under Apache-2.0.
