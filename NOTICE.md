# NOTICE

Cutscene
Copyright 2026 the Cutscene contributors

Cutscene is licensed under the Apache License 2.0 (`LICENSE`). This file lists the third-party
work Cutscene is built on, ships, downloads with the user's consent, or learned from.
`THIRD_PARTY.md` has the file-by-file map of the synced skills.

## Built on HyperFrames

Built on HyperFrames, an open-source framework by HeyGen (Apache-2.0,
https://github.com/heygen-com/hyperframes). **Cutscene is independent and not affiliated with
HeyGen.** HyperFrames and HeyGen are their owners' names; Cutscene uses no HeyGen or HyperFrames
logos or brand assets.

- **The engine** is the `hyperframes` npm package at the exact version in
  `skills/cutscene/engine.json`. It is not in this repository: `cutscene setup` installs it (after
  asking) with `npm ci` from `skills/cutscene/engine-lock.json`. Copyright HeyGen, Inc.,
  Apache-2.0.
- **Seven skills** (`cutscene-compose`, `-animate`, `-design`, `-captions`, `-audio`, `-render`,
  `-promo`) and `skills/cutscene/references/upstream/` are adapted from the HyperFrames skills
  (Copyright HeyGen, Inc., Apache-2.0). Every adapted file starts with an "Adapted from
  HyperFrames" header; the changes are Cutscene's.

## Code adapted from other projects

- **Herk Edit Kit** (https://github.com/nateherkai/herk-edit-kit, commit 10511e5af8),
  Copyright (c) 2026 Nate Herk and kit contributors. MIT License plus the Herk Edit Kit Use
  Permission. Several `skills/cutscene-edit/scripts/lib/` files (silences, mistakes, music,
  beat-sync, plan checks) are adapted from it; each says so in its header. The full licence and
  permission texts are in `skills/cutscene-edit/licenses/HERK-EDIT-KIT.txt`. No media, brand
  assets, fonts or examples from the kit are included.

## Shipped in this repository

| What | Where | Licence |
|---|---|---|
| Geist Bold, Copyright (c) 2023 Vercel, in collaboration with basement.studio | `skills/cutscene-3d/assets/fonts/` | SIL OFL 1.1 (`Geist-OFL.txt`) |
| EB Garamond, Inter, JetBrains Mono | `skills/cutscene-design/frame-presets/code-editorial/fonts/` | SIL OFL 1.1 (`OFL-*.txt` beside the fonts) |
| 24 caption font families from Google Fonts via Fontsource (Latin subsets) | `skills/cutscene-captions/modes/standard/fonts/` | SIL OFL 1.1 (22 families), Apache-2.0 (Permanent Marker, Special Elite); each licence with its copyright line in `licenses/` |
| Hershey script stroke fonts (Dr. A. V. Hershey, U.S. National Bureau of Standards, via "Hershey Fonts in SVG" by Marty McGuire) | `skills/cutscene-captions/assets/strokefonts/` | Hershey font use condition: free use, credit the origin |

The showcase project in `examples/cutscene-intro/` uses DM Serif Display and Space Grotesk (SIL OFL
1.1, from Fontsource) and voice lines made with OmniVoice, which are **non-commercial
(CC-BY-NC-4.0)**; each voice file has a `.license.txt` beside it.

## Downloaded only with the user's consent

Nothing below is in this repository. Each is fetched from its official source on first use, only
after the user agrees (`--yes`), into its own folder, never on PATH.

| What | Used for | Licence | Source |
|---|---|---|---|
| **postprocessing** 6.39.5 (pmndrs), Copyright Raoul van Rüschen | optional bloom in 3D shots; a copy with its `three` import pinned (marked as changed in its first line) goes into the video project | Zlib | npm / jsDelivr, SHA-256 pinned |
| **Fontsource fonts** for 3D titles (Space Grotesk, Inter, Manrope, Sora, Archivo Black, DM Serif Display, Playfair Display, Montserrat, Poppins, Syne, Unbounded, Outfit, Plus Jakarta Sans, Bricolage Grotesque, Geist Sans, Oswald, League Gothic, EB Garamond, Space Mono, JetBrains Mono, Baloo 2, Anton, Bodoni Moda, Cormorant Garamond, Chakra Petch, Fredoka, Teko, Cinzel, Shippori Mincho, Rajdhani, Bangers; Special Elite) | 3D text in the video's typeface | SIL OFL 1.1; Special Elite is Apache-2.0 | npm / jsDelivr, SHA-256 pinned |
| **OmniVoice** (k2-fsa) | voice design and cloning | code Apache-2.0; **model weights CC-BY-NC-4.0 (non-commercial)**; its audio tokenizer is under the Boson Higgs Audio 2 Community License (see below) | PyPI, huggingface.co/k2-fsa/OmniVoice at a pinned revision, SHA-256 pinned |
| **VoxCPM2** (OpenBMB) | voices, commercial use allowed | Apache-2.0 | PyPI, huggingface.co/openbmb/VoxCPM2, SHA-256 pinned |
| **Kokoro-82M** (hexgrad) via kokoro-onnx | the built-in English voice | Apache-2.0 | github.com/thewh1teagle/kokoro-onnx (fetched by the engine) |
| **Whisper large-v3-turbo** (OpenAI) through **faster-whisper** (SYSTRAN) and **CTranslate2** (OpenNMT) | checking voice lines word by word | MIT, MIT, MIT | PyPI, huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo, SHA-256 pinned |
| **PyTorch** 2.11.0 (CPU) and the voice environment's Python packages | running the voice models | BSD-style and other open-source licences, recorded per package in `~/.cutscene/voice/lock.json` | download.pytorch.org, PyPI |
| **auto-editor** 31.7.2 (WyattBlue) | fast rough cuts and editor exports | Unlicense (the release binary bundles FFmpeg and other libraries under their own licences) | github.com/WyattBlue/auto-editor releases, SHA-256 pinned |
| **MediaPipe Tasks Vision** 1.0.1 and the **BlazeFace** short-range face model (Google) | following a face when reframing | Apache-2.0 | npm, storage.googleapis.com/mediapipe-models, SHA-256 pinned |
| Engine models: whisper.cpp speech models, Parakeet TDT 0.6B v3, U2-Net person cut-out, ONNX Runtime, Chrome for Testing | engine transcription, background removal, rendering | MIT; CC-BY-4.0 (NVIDIA); Apache-2.0; MIT; Chromium BSD-3-Clause and others | fetched by the engine into `~/.cache/hyperframes/`; see `docs/security.md` |

## Loaded by compositions at preview and render time

The video's browser loads these from a pinned CDN URL (jsDelivr) when a composition uses them;
they are not in this repository.

- **GSAP** 3.14.2: Standard "No Charge" GSAP License, Copyright Webflow. Free, including for
  commercial use; not an OSI open-source licence (https://gsap.com/standard-license).
- **three.js** 0.184.0: MIT, Copyright the three.js authors. Used by the 3D shots.
- **Lottie** (lottie-web), **Anime.js**, **TypeGPU**: MIT; optional adapters in `cutscene-animate`.
- **Google Fonts** linked by a composition keep their own licences (mostly SIL OFL 1.1).

## Sound effects (Pixabay)

The sound-effect library (`whoosh`, `click`, `pop`, `riser`...) is 19 Pixabay files under the
Pixabay Content License (https://pixabay.com/service/license-summary/). That licence does not
allow sharing them as a standalone library, so **they are not in this repository**. The engine
package that `cutscene setup` installs contains them; `skills/cutscene-audio/scripts/sound-engine.mjs`
copies a file (checked against `skills/cutscene-audio/sound/sfx/sha256.json`) into a video
project only when that video uses it. Using them inside a video is allowed; no credit is required.

## OmniVoice audio tokenizer (Boson Higgs Audio 2)

OmniVoice's audio tokenizer is licensed under the Boson Higgs Audio 2 Community License, which
requires this notice:

Built with Higgs Materials licensed from Boson AI USA, Inc., Copyright Boson AI USA, Inc., All
Rights Reserved and Meta Llama 3 licensed under the Meta Llama 3 Community License, Copyright Meta
Platforms, Inc., All Rights Reserved.

Meta Llama 3 is licensed under the Meta Llama 3 Community License, Copyright © Meta Platforms,
Inc. All Rights Reserved.
Boson Higgs Audio 2 is licensed under the Boson Community License, Copyright © Boson AI USA, Inc.
All Rights Reserved.

The licence text is downloaded with the model (`audio_tokenizer/LICENSE`). Voices made with
OmniVoice are for non-commercial use; every voice file Cutscene writes gets a `.license.txt`
saying which model made it and on what terms.

## Ideas only, no code copied

- **video-use** (browser-use, MIT): transcript-first editing and a self-check after every cut.
- **showtime** (FavioVazquez, MIT): a generated voice "hears itself back" to check each line.
- **OpenMontage** (calesthio, AGPL-3.0): pipeline catalogue studied for ideas only; no code or
  text copied.
- **audio-offset-finder** (BBC R&D, Apache-2.0): the cross-correlation method for lining up two
  recordings; Cutscene's code is its own.
- **VoiceStudio** (debpalash, AGPL-3.0): used only over its local API when the user runs it;
  nothing copied.
