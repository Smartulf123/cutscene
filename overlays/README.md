# Overlays: Cutscene's own files on top of the synced skills

`tools/sync-hyperframes.mjs` rebuilds seven skills (`cutscene-compose`, `-animate`, `-design`,
`-captions`, `-audio`, `-render`, `-promo`) and `skills/cutscene/references/upstream/` from the
pinned engine source. Those folders are generated: **never edit them by hand**, a re-sync (or
`--check`) will undo or flag the edit. Put Cutscene's own work here instead.

The engine source is HyperFrames, an open-source framework by HeyGen (Apache-2.0). Cutscene is
independent and not affiliated with HeyGen (credits: `NOTICE.md`, `THIRD_PARTY.md`).

## How layering works

For each target in `tools/sync-map.json` (`targets.<id>`), the folder `overlays/<id>/` is laid
over the generated folder (`targets.<id>.dir`) after the upstream files are transformed:

| Overlay file | Effect |
|---|---|
| `overlays/<id>/<path>` | copied to `<dir>/<path>`; **an overlay file wins** over an upstream file at the same path (example: `overlays/cutscene-captions/scripts/hf-cli.cjs` replaces the upstream CLI locator) |
| `overlays/<id>/SKILL.head.md` | inserted at the top of the generated `SKILL.md`, after the frontmatter and attribution header and before the "How to run cutscene commands" note and the upstream body |
| `overlays/<id>/SKILL.append.md` | appended to the end of the generated `SKILL.md` |

The `SKILL.md` frontmatter (`name`, `description`) comes from `targets.<id>.name` and
`.description` in the map. Target `cutscene-upstream` maps to
`skills/cutscene/references/upstream/` (the router's reference knowledge; the router's own
`SKILL.md` belongs to foundation).

## Changing upstream text without an overlay

Small, exact changes to upstream files go in `tools/sync-map.json`, not here:

- `patches`: `{ file, find, replace }` (literal) or `{ file, regex, replace, flags }`. `file` is
  the **upstream** path (`skills/<upstream-skill>/...`, globs allowed). Patches run on the
  upstream text before the generic rewrites (`"stage": "after"` runs them after). A patch that no
  longer matches fails the sync, so upstream drift is caught; mark one `"optional": true` only
  when it is meant to match some files and not others.
- `dropSections` (`{ file, heading }`), `dropBlocks` (`{ file, start, end, keepEnd }`) and
  `dropLines` (`{ file?, match, flags? }`) remove HeyGen cloud branches and other content
  Cutscene does not ship.
- `moveSections` (`{ target, heading, to, summary, file? }`) moves one section of a target's
  generated `SKILL.md` (the heading and everything under it) into `<dir>/<to>`, with the
  attribution header and links fixed for the new folder, and leaves the heading, `summary` and a
  link behind. Use it to keep a `SKILL.md` under about 500 lines without copying upstream text
  into an overlay. A heading that no longer matches fails the sync.
- `rewrite` holds the generic rules: command rewrites (`npx hyperframes <cmd>` to
  `cutscene <cmd>`), blocked commands, skill-name mapping, engine API names that must stay as they
  are (`hyperframes.json`, `data-*`, `window.__hyperframes`, `HYPERFRAMES_*`...), and prose
  branding.

## Workflow

```bash
node tools/sync-hyperframes.mjs            # rebuild (downloads + verifies the pinned upstream once)
node tools/sync-hyperframes.mjs --check    # exit 1 if the tree differs from a fresh sync
npx vitest run tests/sync                  # determinism, branding, links, headers, look system
```

The sync prints what changed upstream since the last `tools/sync-lock.json`, the size of each
generated skill, and any residue (engine branding, broken links, unresolved script imports).
