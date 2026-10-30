# Security in Cutscene

Cutscene runs on your computer: it edits files, starts programs (the video engine, FFmpeg,
Blender, a Python voice worker) and runs a small local web server for the live preview. This page
says what it protects against, how, and what is still open. To report a problem, see
[SECURITY.md](../SECURITY.md).

## The live preview

`cutscene preview` starts the engine's Studio (the timeline editor) and shows it to you through
Cutscene's **front door** (`skills/cutscene/scripts/preview/frontdoor.mjs`), a small proxy on
`http://127.0.0.1:3002`.

**Why a front door.** The Studio is a local web server that can change your project: save files,
start renders, delete things. The Studio in engine version 0.8.162 checks where a request comes
from on only a few routes. Its other write routes (for example `POST /api/projects/:id/render`)
accept a request from any website you happen to have open: a page on the internet can send a
"cross-site" request to `127.0.0.1` and the Studio would act on it. The front door closes that.

What the front door does, for every request:

| Rule | Stops |
|---|---|
| Listens on `127.0.0.1` only, never on your network | other computers on your Wi-Fi reaching the preview |
| The `Host` header must be exactly `127.0.0.1:<port>` or `localhost:<port>` | **DNS rebinding**: a website pointing its own name at 127.0.0.1 to get around the browser's same-site rules |
| Changes (`POST`, `PUT`, `PATCH`, `DELETE`) and WebSocket upgrades must come from the preview page itself: an `Origin` of the front door, or `Sec-Fetch-Site: same-origin`/`none` | other websites changing your project (the upstream hole above). `Origin: null` (sandboxed pages, files) is refused too |
| A request another site started (`Sec-Fetch-Site: cross-site` or `same-site`) may not even read `/api/...`, however the path is spelled (`//api`, `/%61pi`, `/API`) | other websites triggering Studio actions through links or images |
| `Content-Security-Policy: frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` on every reply | other websites showing the preview in a hidden frame and tricking you into clicking (clickjacking) |
| CORS grants (`Access-Control-Allow-*`) from the Studio are removed | other websites reading replies |
| `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: same-origin` | other websites embedding preview files, and preview addresses leaking in links |
| The engine's desktop-app hand-off (`/api/open-in-desktop`) always answers "not available" | the Studio launching another program |

A program on your own computer that sends no browser headers is let through: it can already do
anything you can, so blocking it would add nothing.

**The hidden Studio.** The real Studio listens on a hidden address that only the front door
knows. On Windows and Linux every `127.x.y.z` address is your own computer, so Cutscene picks a
random one (for example `127.83.12.200`) and a random port: a website cannot find it by trying
ports on `127.0.0.1`, and DNS rebinding cannot reach it. The Studio is told to bind only there
(`HYPERFRAMES_PREVIEW_HOST`); a LAN address set for the stock preview is never passed on.

**If you don't use the front door.** Running the engine's own preview directly (`npx hyperframes
preview`, or the Studio from another tool) gives you the upstream Studio with the hole above:
while it runs, a website you visit could change or render your project. Use `cutscene preview`,
or close other browser tabs while the stock Studio is open.

## Your files

- Cutscene reads and writes only files you point to and files inside the video project. Its own
  things live in `~/.cutscene/` (or `CUTSCENE_HOME`).
- **Network paths are refused** everywhere a path comes in: `\\server\share`, `//server/share`,
  and the mixed spellings Windows also accepts (`/\server\share`, `\/server/share`). Opening one
  would make Windows contact that computer and offer it your sign-in. This covers paths you
  type, paths in 3D specs (`params.svg`, `params.model`, `font`, `lighting.hdri`, `look`) and
  source paths recorded inside transcripts and edit lists.
- **Files named in `beats.json` stay in the project.** A voice reference, a voice prompt or a voice
  line file like `"../../x.wav"` or `"C:\x.wav"` is refused, so a beat sheet can't make Cutscene
  read or overwrite files elsewhere.
- Downloaded archives are unpacked only inside their own folder (entries that would land
  outside are skipped).

## Programs Cutscene starts

- Every program is started with an argument list, never through a shell, so text in a file
  name, a spec or a voice line can't become a command. The one exception is opening your browser
  on Windows (`cmd /c start`), and the address is checked against a strict pattern first.
- Voice lines go to the voice models in a JSON job file or a text file, never on the command line.
- Text inside videos, transcripts, SVGs, websites and voice lines is **data**. Blender runs a fixed
  script (`skills/cutscene-3d/scripts/blender/run.py`) that reads the spec as values; nothing in a
  spec or an SVG is run as code. Blender starts with `--factory-startup`, so add-ons and startup
  scripts from your own Blender setup don't run.
- On Windows, stopping a job stops its whole process tree (`taskkill /T /F`).

## Voices

- **Cloning needs consent.** `cutscene voice clone` refuses to start without `--consent "<who gave
  permission>"`, refuses vague answers like "yes", and writes the consent into
  `.cutscene/project.md` before anything is generated.
- Every voice file gets a `.license.txt` saying which model made it and whether it may be used
  commercially (OmniVoice voices may not).
- VoiceStudio, if you run it, is used only over its local API on your computer.

## Downloads

The rule (contracts §9): **ask first, official source, exact version, checksum, own folder,
never on PATH, never global.**

- Without `--yes`, a command that would download stops with `NEEDS_CONSENT` and says what, how
  big, which licence and from where.
- **The engine** is installed with `npm ci` from `skills/cutscene/engine-lock.json`: every one of
  its ~125 packages at an exact version with a sha512 checksum from the npm registry, all
  published at least 14 days before the pin. A dependency released yesterday can't slip in.
  It goes into `~/.cutscene/engine/<version>/`.
- **Voice environment**: pip, PyTorch and the top-level packages are pinned; Python packages are
  resolved only from releases older than the cutoff in the voice manifest; on Windows (64-bit,
  Python 3.12) PyTorch is checked against pinned SHA-256s. The exact result (every package and
  its SHA-256) is written to `~/.cutscene/voice/lock.json`, and a repair reinstalls exactly that
  with `--require-hashes`. Every model file (OmniVoice, VoxCPM2, Whisper) is fetched at a pinned
  revision and checked against a SHA-256.
- **3D assets, auto-editor, MediaPipe and the face model**: pinned URL, exact version and SHA-256
  in each part's `assets/manifest.json`.
- **Models the engine fetches itself** on first use (the built-in voice, speech models for
  `cutscene transcribe`, the person cut-out model, ONNX Runtime, the render browser): Cutscene
  asks first and passes `--yes` only when you agreed. The engine is never allowed to install
  whisper.cpp itself (that would be a Homebrew install or an unpinned build from GitHub). Except
  for Parakeet, these engine downloads are not checksum-checked by the engine.
- **Caption helpers**: WhisperX through `uvx` runs only when `TRANSCRIBE_ENGINE=whisperx` is set;
  it downloads unpinned dependencies into uv's cache, so ask first. The design and animation
  report scripts can install two helper packages into a temporary folder, at the pinned engine
  version, with install scripts off, and only after a yes.
- **Sound effects** are not downloaded: they come with the engine package and are copied into a
  project only if they match their pinned SHA-256.
- **Nothing leaves your computer.** Cloud commands (`cloud`, `cloudrun`, `lambda`, `publish`,
  `auth`, `feedback`, `usage`, `upgrade`, `skills`, `telemetry`, ...) are blocked. Every engine
  call runs with `HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1`
  and `HYPERFRAMES_SKIP_SKILLS=1`, and Cutscene removes cloud keys from the engine's environment
  (`GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`,
  `HEYGEN_API_KEY` and similar), so the engine can't send frames, images or audio to an online
  service even if you have those keys set. `snapshot` runs with `--describe=false`. Commands that
  fetch what you ask for (`cutscene add` from the block registry, `cutscene capture <url>`) do
  reach the internet.

### Where things are stored

| Folder | What |
|---|---|
| `~/.cutscene/` | Cutscene's settings, the engine, voice environment and models, 3D assets, tools, logs |
| `~/.cache/hyperframes/` | **the engine's own caches, outside `~/.cutscene`**: the render browser (`chrome/`), speech models (`whisper/`, `parakeet/`), the built-in voice (`tts/`), the cut-out model (`background-removal/`), extra npm packages (`optional/`), downloaded fonts (`fonts/`) and project history (`history/`, which can hold copies of your project files) |
| `~/.cache/puppeteer/` | may hold a render browser the engine found there |

Deleting `~/.cutscene` does not remove `~/.cache/hyperframes`; delete it too to remove
everything.

## Known gaps

- **macOS has only one loopback address** (`127.0.0.1`), so the hidden Studio there sits on a
  random port of `127.0.0.1`. A website that scans local ports could find it and use the upstream
  Studio hole directly, without going through the front door. Close the preview when you're
  done (`cutscene preview --stop`). A real fix needs the Studio to check `Origin` on its own
  write routes (upstream).
- **PyTorch on macOS and Linux** installs the exact pinned version from the official index, but
  without a pinned SHA-256 (only the Windows 64-bit, Python 3.12 wheels are hashed). On every
  system, the voice environment's indirect dependencies are limited by release date on the first
  install and hash-checked only on later repairs.
- **Stopping jobs on macOS and Linux** stops the process (and, for the preview, its process
  group), but some helpers may leave a grandchild running after a crash.
- **Network drives with a letter or a mount point** (`Z:\`, `/Volumes/share`, `/mnt/nas`) look like
  local folders and can't be told apart; only `\\server` style paths are refused.
- **CDN scripts in compositions** (GSAP, three.js) load from exact versions on jsDelivr; GSAP has
  a Subresource Integrity hash, three.js ES modules (`+esm` builds) do not.
- **Engine-downloaded models** other than Parakeet are fetched by the engine without a checksum
  (see above); Cutscene only asks before they are fetched.
