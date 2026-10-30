---
name: cutscene-animate
description: "Use for any motion in a Cutscene video: GSAP timelines, eases and staggers, the runtime adapters (GSAP, Lottie, Three.js, Anime.js, CSS keyframes, Web Animations, TypeGPU), atomic motion rules, multi-phase scene blueprints, scene transitions, motion blur, seek-safe keyframes for zooms, punch-ins and camera moves, auditing choreography with an animation map, kinetic type, and the motion-graphics workflow (lower thirds, charts, maps, 2D logo reveals, news, tweets). Use it when something moves wrong, too fast or too stiff. Does NOT pick the video's look (cutscene-design), make extruded 3D titles or Blender renders (cutscene-3d) or define the composition contract (cutscene-compose)."
---

<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

# Cutscene animate

All motion for a Cutscene video, in three parts:

| Need | Read |
|---|---|
| Motion rules, scene blueprints, transitions, runtime adapters (GSAP, Lottie, Three.js, Anime.js, CSS, Web Animations, TypeGPU) | this file, then `rules-index.md`, `blueprints-index.md`, `transitions/`, `adapters/` |
| Zooms, punch-ins, reframes, camera moves and other seek-safe keyframes | [keyframes/GUIDE.md](keyframes/GUIDE.md) |
| A short, unnarrated motion graphic (lower third, chart, map, kinetic type, logo reveal, news, tweet) | [motion-graphics/GUIDE.md](motion-graphics/GUIDE.md) |

**Motion character comes from the look.** Read `motion` in the project's `.cutscene/look.json`
before choosing eases and durations. Its `character` (snappy, smooth, bouncy, cinematic or
editorial) maps to concrete GSAP eases and timings in `/cutscene-design` →
`references/look-system.md`; multiply durations by `motion.duration_scale`. Using `power3.out`
on everything is the house-style trap this avoids.

This skill does NOT choose the look (`/cutscene-design`), define the composition contract
(`/cutscene-compose`), make Blender renders (`/cutscene-3d`) or place sound (`/cutscene-audio`).

## How to run cutscene commands

In this skill, `cutscene <command>` is shorthand for:

```bash
node "<this skill's folder>/../cutscene/scripts/cli.mjs" <command>
```

Replace `<this skill's folder>` with the folder this SKILL.md was loaded from. Scripts named `<this skill's folder>/scripts/...` run with plain `node`. Never call the engine through `npx`, and never use cloud commands: Cutscene works on this computer only, and it never renders a final video unless the user asks.

# Cutscene Animation

All motion knowledge in one skill: **rules** (atomic recipes), **blueprints** (multi-phase scene templates), **transitions** (scene-to-scene), **techniques** (broader motion-design patterns), and **adapters** (per-runtime APIs).

For the composition contract (data attributes, sub-compositions, determinism) see `cutscene-compose`.

## Default: compose atomic rules

Pick 2-4 rules from `rules-index.md`, glue them together with a single paused GSAP timeline, done. This is faster and produces less code than starting from a blueprint.

## Load a blueprint when

- The scene matches an existing pre-designed multi-phase template (brand-reveal, social-proof, etc.) and reusing its phase pipeline saves real authoring time
- You want runnable ground-truth code for a complex 4-5 phase choreography

Blueprints live in `blueprints-index.md`. Each entry points to `blueprints/<id>.md` (recipe). Do not read it speculatively; load it when you've already decided you need scene-level orchestration.

## Routing

| Want to…                                                                       | Read                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| Pick an atomic motion pattern by trigger / tag                                 | `rules-index.md`                                    |
| Read one rule's full HTML / CSS / GSAP recipe                                  | `rules/<name>.md`                                   |
| Pick a multi-phase scene template                                              | `blueprints-index.md`                               |
| Read one blueprint's full recipe                                               | `blueprints/<id>.md`                                |
| Author a scene transition (CSS-driven, between two clips)                      | `transitions/overview.md`, `transitions/catalog.md` |
| Look up a broader motion-design technique                                      | `techniques.md`                                     |
| Motion blur — shutter smear on an element, and when not to use it              | `references/motion-blur.md`                         |
| Analyze an existing composition's animation map                                | `scripts/animation-map.mjs`                         |
| GSAP API — timeline / tweens / position parameters                             | `adapters/gsap.md`                                  |
| GSAP — drop-in effect recipes                                                  | `rules/gsap-effects.md`                             |
| GSAP — transforms / perf                                                       | `adapters/gsap-transforms-and-perf.md`              |
| GSAP — eases / stagger                                                         | `adapters/gsap-easing-and-stagger.md`               |
| GSAP — timeline / labels                                                       | `adapters/gsap-timeline-and-labels.md`              |
| Lottie / dotLottie (After Effects exports, `window.__hfLottie`)                | `adapters/lottie.md`                                |
| Character animation (walk cycle, mascot, jointed puppet, gestures)             | `adapters/lottie.md` → Characters                   |
| Three.js / WebGL (3D scenes, `AnimationMixer`, `hf-seek`)                      | `adapters/three.md`                                 |
| Anime.js (`window.__hfAnime`)                                                  | `adapters/animejs.md`                               |
| CSS keyframes (`animation-delay` / `play-state` / `fill-mode`)                 | `adapters/css-animations.md`                        |
| Web Animations API (`element.animate()`, `currentTime` seek)                   | `adapters/waapi.md`                                 |
| TypeGPU / WebGPU (`navigator.gpu`, WGSL, compute pipelines)                    | `adapters/typegpu.md`                               |
| HTML-as-texture + WebGL/GLSL post-fx (capture live DOM via `drawElementImage`) | `adapters/html-in-canvas-patterns.md`               |
| Named text-animation effects (24 IDs via external `animate-text` skill)        | `adapters/animate-text.md`                          |

## Picking a runtime

- **GSAP** is the default for 95% of motion work — covers timeline orchestration, transforms, easing, stagger. All atomic rules in this skill are GSAP-based.
- **Lottie** when an asset has its own pre-baked timeline (typically After Effects exports), including characters that walk, gesture or react.
- **Three.js** for 3D scenes, camera motion, shader-driven visuals.
- **Anime.js** for lightweight tweening when GSAP is overkill.
- **CSS** for simple repeated motifs, decoration, shimmer — no JavaScript animation cost.
- **WAAPI** for native browser keyframes without a GSAP dependency.
- **TypeGPU / WebGPU** for GPU-rendered canvases (particles, liquid glass, custom shaders).

Multiple runtimes can coexist in one composition. Each registers its instances on the runtime-specific global so Cutscene can seek all of them in one pass.

## Critical Constraints

**Prerequisite: `cutscene-compose` → One paused timeline + Non-negotiable rules** (single paused timeline, `data-duration` governs length, no `Math.random` / `Date.now` / `performance.now`, no `repeat: -1` without a finite root `data-duration`, no page-load `gsap.set` on later-scene clips, no `display` or raw `visibility` tweens, and register the timeline only after it is fully built, including when the build runs inside an async callback such as `document.fonts.ready`). GSAP `autoAlpha` and zero-duration visibility sets at explicit timeline boundaries remain allowed by core. Use those exceptions only on non-clip elements or wrappers inside a clip; the framework owns `.clip` lifecycle. Don't restate the full contract here.

Animation-craft additions on top of core's contract:

- **Pre-calculated layout constants** — never derive positions from `getBoundingClientRect()` at tween time. Tween-time DOM measurements desync because the renderer samples in parallel; compute coordinates once at composition setup and reuse.
- **Spatial motion uses GSAP transform aliases only** (`x`, `y`, `scale`, `rotation`). Core's allowlist also permits `opacity` / `color` / `backgroundColor` / `borderRadius` for non-spatial property tweens — but never `width` / `height` / `top` / `left` for layout changes.

## Scripts

```bash
node "<this skill's folder>/scripts/animation-map.mjs" <composition-dir> \
  --out <composition-dir>/.hyperframes/anim-map
```

Reads every GSAP timeline registered on `window.__timelines`, enumerates tweens, samples bboxes, computes flags, outputs `animation-map.json`. Use it to audit choreography (dead zones, stagger consistency, lifecycle warnings) after authoring.

`animation-map.mjs` resolves helper packages from the current project first, then can bootstrap the bundled Cutscene package version. Set `HYPERFRAMES_SKILL_PKG_VERSION=<version>` only when running the skill outside the bundled CLI/skill install and you need to pin that bootstrap version explicitly.

## See Also

- `cutscene-compose` — composition structure, data attributes, sub-compositions, deterministic render contract
- `cutscene-design` — palettes, typography, narration, beat planning (non-animation creative direction)
- `cutscene-render` — `cutscene lint / check / snapshot / preview / render`
