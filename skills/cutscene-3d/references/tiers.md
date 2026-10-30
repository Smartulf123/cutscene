# Tier 1 vs Tier 2

| | Tier 1: Three.js in the video | Tier 2: Blender |
|---|---|---|
| Install | nothing (three 0.184.0 from a pinned CDN URL) | the user's Blender 4.2+ (5.2 LTS recommended) |
| Output | `compositions/scene3d-<id>.html`, rendered with the video | `assets/3d/<id>.webm` (VP9 + alpha) + poster |
| Cost | the engine's normal frame time | minutes per second of video (below) |
| Change later | edit the spec, run `tier1` again, preview | stills + render + encode again |
| Good at | titles, logos, glTF turntables, abstract shapes, fly-throughs, bloom | glass, liquids, subsurface, physics, rigs, procedural materials, soft real shadows, true depth of field |

## The rule (same as SKILL.md, and `lib/tier.mjs` in code)

1. A spec with `"tier": 1` or `2` gets that tier.
2. Tier 2 when the shot **needs** glass, liquid, subsurface, physics/simulation, a character or
   rig beyond a glTF clip, photoreal lighting, or the user asked for Blender (`needs` in the spec,
   or implied: a `glass` material, the `physics-drop` template).
3. Tier 2 for detailed procedural materials (`noise`, `wave`) and for `product-shot`, unless the
   clip is over ~10 s or the deadline is tight; then Tier 1.
4. Everything else: Tier 1.
5. Tier 2 without Blender: offer setup (with consent) or the Tier 1 fallback template, and say
   what is lost.

## Time on the reference PC

Intel i5-13420H, Intel UHD integrated graphics, 24 GB, Blender 5.2.3 LTS, Windows 11. Measured
2026-10-30 with the real templates (seconds per frame at 1920x1080 unless noted):

| Render | Seconds per frame |
|---|---|
| EEVEE, final (32 samples, motion blur, ray tracing), title3d | **3.6** |
| EEVEE, 64 samples (old default, dropped: no visible gain) | 8.3-8.6 |
| EEVEE, stills (16 samples, 960x540) | 1.2-2.4 |
| EEVEE first frame of a process (shader compile) | 6-12 (35 the very first run on a machine) |
| Cycles CPU, final (64 samples, adaptive, OIDN denoise), title3d | **38** |
| Cycles CPU, final, glass product shot | **91** |
| Cycles CPU, stills (24 samples, 960x540), glass product shot | 15-23 |
| Blender start + scene build | 2-9 s per job |
| VP9 alpha encode | ~0.25 s per 1080p frame |

So a 2 s, 1080p title costs about **4 min in EEVEE** and **20 min in Cycles**; a 2 s glass product
shot about **1.5 h in Cycles**. That is why glass shots should be short or rendered at
`--scale 50` (4x faster), and why Tier 1 is the default.

Estimates come from `lib/tier.mjs` (`BENCH`) and learn from every real render on the user's
machine (`~/.cutscene/logs/3d-timings.json`), so `cutscene 3d plan` gets more accurate over time.

## Picking the engine inside Tier 2

`engine: "auto"` uses Cycles for glass, liquid, subsurface, caustics or `photoreal`, and EEVEE
for everything else. EEVEE in Blender 5 has ray-traced reflections, soft shadows, depth of field
and motion blur, which is all a title, logo, turntable or physics drop needs.
