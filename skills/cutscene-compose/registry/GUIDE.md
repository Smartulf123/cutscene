<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

# Cutscene Registry

The registry provides reusable blocks and components installable via `cutscene add <name>`.

- **Blocks** — standalone sub-compositions (own dimensions, duration, timeline). Included via `data-composition-src` in a host composition.
- **Components** — effect snippets (no own dimensions). Pasted directly into a host composition's HTML.

## Quick reference

```bash
cutscene add data-chart              # install a block
cutscene add grain-overlay           # install a component
cutscene add captions                # install every block tagged captions
cutscene add shimmer-sweep --dir .   # target a specific project
cutscene add data-chart --json       # machine-readable output
cutscene add data-chart --no-clipboard  # skip clipboard (CI/headless)
```

After install, the CLI prints which files were written and a snippet to paste into your host composition. The snippet is a starting point — you'll need to add `data-composition-id` (must match the block's internal composition ID), `data-start`, and `data-track-index` attributes when wiring blocks.

The positional value is resolved as an exact item name first. If no item matches and the value is a tag, the command installs every block with that tag. Registry dependencies are installed before the requested item. `cutscene add` works only for blocks and components; for examples, use `cutscene init <dir> --example <name>` instead.

## Install locations

Blocks install to `compositions/<name>.html` by default. Components install to `compositions/components/<name>.html` by default.

These paths are configurable in `hyperframes.json`:

```json
{
  "paths": {
    "blocks": "compositions",
    "components": "compositions/components",
    "assets": "assets"
  }
}
```

See [install-locations.md](references/install-locations.md) for full details.

## Wiring blocks

Blocks are standalone compositions — include them via `data-composition-src` in your host `index.html`:

```html
<div
  data-composition-id="data-chart"
  data-composition-src="compositions/data-chart.html"
  data-start="2"
  data-duration="15"
  data-track-index="1"
  data-width="1920"
  data-height="1080"
></div>
```

Key attributes:

- `data-composition-src` — path to the block HTML file
- `data-composition-id` — must match the block's internal ID
- `data-start` — when the block appears in the host timeline (seconds)
- `data-duration` — how long the block plays
- `data-width` / `data-height` — block canvas dimensions
- `data-track-index` — Studio timeline row; display only. Use CSS `z-index` for layering

See [wiring-blocks.md](references/wiring-blocks.md) for full details.

## Wiring components

Components are snippets — paste their HTML into your composition's markup, their CSS into your style block, and their JS into your script (if any):

1. Read the installed file (e.g., `compositions/components/grain-overlay.html`)
2. Copy the HTML elements into your composition's `<div data-composition-id="...">`
3. Copy the `<style>` block into your composition's styles
4. Copy any `<script>` content into your composition's script (before your timeline code)
5. If the component exposes GSAP timeline integration (see the comment block in the snippet), add those calls to your timeline

See [wiring-components.md](references/wiring-components.md) for full details.

## Discovery

Use the CLI as the primary discovery surface. **Search by intent before browsing:** the registry holds more items than you can scan by eye, so listing them and matching on names or tags is the slow path, and it fails whenever the author's wording differs from yours.

```bash
# Rank the whole catalog against what the beat should do
cutscene catalog --query "reveal a headline one line at a time"
cutscene add caption-clip-wipe
```

Search is local and sends nothing. By default it ranks on vocabulary shared with the item's name, title and description, so it only finds items that reuse your words; `--on-device` ranks by meaning instead, after a one-time model download. With `--json` the envelope names which tier answered, so check that rather than assuming a ranking happened.

**Always query in English, whatever language the video is in.** The catalog is written in English and both tiers index it that way (the on-device model is English-only too). A query in another script produces no searchable terms and returns nothing at all. This is easy to get wrong on a Japanese or Chinese project, where the brief, the captions and the narration are all in that language and the query naturally follows: describe the _move_ in English, then write the on-screen copy in whatever language the video needs. If a query does come back with `No searchable words in query`, that is this rule, not a missing component, and it is not worth a gap report.

Installability is applied after ranking, not before it: a name the vectors carry but this registry cannot serve is dropped from the results and counted in `dropped`, so a non-zero `dropped` means the two are different generations. See `/cutscene-render` for the offline tier, the consent gates, and how to refresh a stale index.

To browse or filter instead of search:

```bash
cutscene catalog
cutscene catalog --type block
cutscene catalog --type component
cutscene catalog --type block --tag social
cutscene catalog --json
cutscene catalog --human-friendly
```

The normal table and `--json` modes only list matches; install a selected name with `cutscene add <name>`. `--human-friendly` opens an interactive picker and installs the selected item immediately. In CI or agent workflows, prefer `--json` followed by an explicit `add`.
