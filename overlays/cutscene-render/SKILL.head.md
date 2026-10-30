# Cutscene render

The local command loop: scaffold, check, snapshot, preview and render, all on this computer.

- **Local only.** `cloud`, `cloudrun`, `lambda`, `publish`, `auth`, `feedback`, `usage`, `skills`
  and `upgrade` are not part of Cutscene; `cutscene` refuses them. Don't offer uploads, hosted
  links or cloud renders.
- **Never render a final video unless the user asks.** Lint, check, snapshots and the preview
  are always fine. When they ask, render with `--quality delivery` and verify the file.
- **The preview** is `cutscene preview`: Cutscene's front door on `http://127.0.0.1:3002`
  (loopback only). Stop it with `cutscene preview --stop` when the review is over.

This skill does NOT write compositions (`/cutscene-compose`), choose the look
(`/cutscene-design`) or edit footage (`/cutscene-edit`).
