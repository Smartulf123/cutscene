<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

# Source phase (Cutscene)

Runs **only when `shot-plan.json.asset_needs` is non-empty** (the form categories never reach here).

Cutscene has no stock-media search and no image generation, so each asset need is met by one of:

- **User files.** Ask once for the logo, screenshot, photo or clip the plan needs; copy it into `assets/`.
- **A captured site.** `cutscene capture <url> -o ./capture --json`, then pick from `capture/assets/` using `capture/extracted/asset-descriptions.md`.
- **Asset-free.** If neither exists, switch the category to its asset-free layout and note it in `context.log`.

Freeze every file under `assets/` (never hot-link) and write `assets/index.md`: one row per asset with its path, source (user / capture URL) and licence. The design phase reads that index.
# Source phase (Cutscene)

Runs **only when `shot-plan.json.asset_needs` is non-empty** (the form categories never reach here).

Cutscene has no stock-media search and no image generation, so each asset need is met by one of:

- **User files.** Ask once for the logo, screenshot, photo or clip the plan needs; copy it into `assets/`.
- **A captured site.** `cutscene capture <url> -o ./capture --json`, then pick from `capture/assets/` using `capture/extracted/asset-descriptions.md`.
- **Asset-free.** If neither exists, switch the category to its asset-free layout and note it in `context.log`.

Freeze every file under `assets/` (never hot-link) and write `assets/index.md`: one row per asset with its path, source (user / capture URL) and licence. The design phase reads that index.
