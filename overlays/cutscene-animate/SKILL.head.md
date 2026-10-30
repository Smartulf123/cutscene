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
