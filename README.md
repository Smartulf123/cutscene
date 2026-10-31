# Cutscene

Make videos by describing them to your AI agent. Cutscene is a skill pack for Claude Code (and
other agents) that plans the video with you, builds it as an animated HTML composition, adds real
3D shots, speaks the narration in a voice you design, and shows you every change in a live preview.
Everything runs on your computer.

For an example, [`examples/cutscene-intro`](examples/cutscene-intro) is a 12-second intro made
with Cutscene itself: the brief, the look, the beat sheet, the 3D title and the four voice lines.
Its 3D logo is a pre-rendered video clip, placed like any other clip.

## What it does

- **Plans first.** A short brief, then a look made for this video (palette, type pair, motion
  character), then a beat sheet that times every line, shot and graphic. You approve each step
  before anything is built.
- **Animates.** GSAP motion on HTML, with the engine's rules for frame-accurate, repeatable renders.
- **Real 3D.** Extruded titles, SVG logo reveals, product turntables, floating shapes and
  fly-throughs. Cutscene draws them with Three.js inside the video, so there is nothing to install
  and you see them in the live preview straight away.
- **Voices on your computer.** Design a voice from a description ("female, young adult, British
  accent"), or clone one with the speaker's permission. Each line is spoken with a fixed seed, then
  transcribed back and checked word by word, so a misread word is caught before you hear it. The
  word timings feed the captions.
- **Captions, music and sound effects**, with ducking under the voice.
- **Footage clean-up.** Cut silences, stutters and retakes, find the best 20 to 60 seconds for a
  short, reframe 16:9 to 9:16 following the face, and hand the edit to Premiere, Resolve, Final Cut,
  Shotcut or Kdenlive. Every cut is a dry run you can review first.
- **A different look every time.** Each video gets its own palette and type pair, and Cutscene
  checks that a new look is not too close to your earlier videos.
- **Live preview.** Watch and scrub the video in your browser while the agent works. Nothing is
  rendered to a file until you ask for one.

## Install

Claude Code:

```bash
claude plugin marketplace add Smartulf123/cutscene
```

```bash
claude plugin install cutscene@cutscene
```

Other agents (Codex, Cursor, Gemini CLI and more) through [skills.sh](https://skills.sh):

```bash
npx skills add Smartulf123/cutscene
```

Then ask your agent for a video. The first time, Cutscene checks your computer and tells you what is
missing. It asks before every download.

### What you need

| | Needed for | Size |
|---|---|---|
| Node.js 22 or newer | everything | |
| FFmpeg | everything | |
| The video engine | everything; installed by `cutscene setup` into `~/.cutscene` | about 110 MB |
| Python 3.10 to 3.13 | designed and cloned voices only | |
| OmniVoice | the best voices, design and cloning (non-commercial weights) | 3.3 GB |
| VoxCPM2 | voices you may use commercially, and Norwegian | 5 GB |
| Whisper large-v3-turbo | checking every spoken word | 1.6 GB |
| Kokoro | quick English preset voices, no Python needed | 350 MB |

Voices are optional. A video without narration needs only the first three rows.

## How a video gets made

```
brief  ->  look  ->  beat sheet  ->  build  ->  check  ->  preview  ->  render (when you ask)
```

1. You describe the video. The agent writes a short brief and asks what it can't work out.
2. It proposes a look for this video and checks it against your earlier ones.
3. It writes the beat sheet: every voice line, 3D shot and graphic with its time.
4. It builds the composition, makes the 3D shots and speaks the lines.
5. It checks the result (layout, timing, contrast, each spoken word) and looks at real frames.
6. You watch it in the live preview and ask for changes.
7. When you're happy, ask for the final video and it renders it on your computer.

Project state lives in the project folder (`.cutscene/brief.md`, `look.json`, `beats.json`,
`project.md`), so you can stop and pick it up in a new session.

## The skills

| Skill | Does |
|---|---|
| `cutscene` | Starts every request: brief, look, beat sheet, setup, and sends each job to the right skill |
| `cutscene-design` | The look: palette, type pair, motion character, contrast and same-look checks |
| `cutscene-compose` | Writes the HTML composition and installs ready-made blocks |
| `cutscene-animate` | Motion: GSAP timelines, transitions, kinetic type, charts, logo reveals |
| `cutscene-3d` | 3D shots drawn with Three.js inside the video: titles, logos, turntables, shapes |
| `cutscene-voice` | Designs, clones, speaks and checks voiceover lines |
| `cutscene-captions` | Word-timed captions with themes and safe zones |
| `cutscene-audio` | Music, sound effects, fades and ducking |
| `cutscene-edit` | Cleans up recordings: silences, retakes, highlights, reframes, NLE hand-off |
| `cutscene-promo` | Promo workflows: product launches, explainers, pull-request videos |
| `cutscene-render` | The local command loop: check, snapshot, preview, render |

## Privacy and safety

- Nothing is uploaded. Cutscene blocks the engine's cloud, publish and telemetry commands, and
  removes cloud AI keys from the engine's environment.
- Every download is pinned to an exact version and checksum, and Cutscene asks before it starts.
- The live preview listens on `127.0.0.1` only, behind a proxy that refuses requests from other
  websites. Details and known limits are in [docs/security.md](docs/security.md).
- Cloning a voice needs the speaker's permission, and Cutscene asks for it every time.

Cutscene keeps its files in `~/.cutscene`. The video engine also keeps caches in
`~/.cache/hyperframes` (the render browser, speech models and project history). To remove
everything, delete both folders.

## Licences

Cutscene is Apache-2.0. It builds on the [HyperFrames](https://github.com/heygen-com/hyperframes)
engine and its skills, and adapts tools from other open-source projects; the full list with
licences is in [NOTICE.md](NOTICE.md) and [THIRD_PARTY.md](THIRD_PARTY.md).

Two things to know if you make videos commercially:

- **OmniVoice** model weights are CC-BY-NC-4.0, which means non-commercial use only. Use VoxCPM2 or
  Kokoro for commercial work.
- **GSAP** is free under Webflow's "No Charge" GSAP License, which has its own terms.

Cutscene is an independent project. It is not affiliated with or endorsed by HeyGen or the
HyperFrames project.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see
[SECURITY.md](SECURITY.md).
