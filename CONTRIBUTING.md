# Contributing to Cutscene

Thanks for helping. Bug reports, fixes and new recipes are all welcome.

## Set up

You need Node.js 22 or newer and FFmpeg. Blender and Python are only needed for the 3D and voice
tests; those tests skip themselves when the tool is missing.

```bash
npm ci
```

```bash
npm test
```

Set `CUTSCENE_VOICE_REAL=0` to skip the slow test that runs real voice models.

## Where things live

| Folder | What |
|---|---|
| `skills/cutscene/` | The router skill and the `cutscene` command (`scripts/cli.mjs`) |
| `skills/cutscene-3d/`, `-voice/`, `-edit/` | Cutscene's own skills; edit them directly |
| `skills/cutscene-compose/`, `-animate/`, `-design/`, `-captions/`, `-audio/`, `-render/`, `-promo/` | **Generated** from the pinned engine source; don't edit them by hand |
| `overlays/` | Cutscene's changes to the generated skills ([how it works](overlays/README.md)) |
| `tools/` | The sync, the skill validator and the pin-age check |
| `tests/` | Vitest tests, one folder per part |
| `examples/` | Example projects |

To change a generated skill, edit its overlay (or `tools/sync-map.json` for small text changes),
then run `node tools/sync-hyperframes.mjs` to rebuild it.

## Before you open a pull request

```bash
npm test
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
