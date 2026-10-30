# 3D templates and spec fields

A spec is `.cutscene/3d/<shot>.json`. `cutscene 3d new <template>` writes one with every default.

## Fields every spec has

| Field | Default | Meaning |
|---|---|---|
| `version` | 1 | spec format |
| `id` | template name | shot name; outputs are `assets/3d/<id>.webm` and `.poster.png` |
| `template` | | see below |
| `tier` | `"auto"` | `"auto"`, `1` or `2` (see tiers.md) |
| `engine` | `"auto"` | `"auto"` (Cycles for glass/realism, else EEVEE), `"eevee"`, `"cycles"` |
| `duration` | beat length or template default | seconds |
| `fps`, `width`, `height` | from beats.json, else 30 / 1920 / 1080 | |
| `quality` | `"final"` | `"draft"` or `"final"` (samples); stills always use draft |
| `look` | `".cutscene/look.json"` | palette, display font, motion character, seed |
| `palette` | | optional overrides of look.json colours |
| `font` | look's display font | path to a .ttf/.otf/.woff (Blender also reads .woff2); text templates only |
| `seed` | look.json `seed`, else 1337 | |
| `params` | template defaults | template fields below |
| `camera` | template default | `move`, `lens` (mm), `ease`, `dof.fstop`, `drift` (deg), overrides `azimuth_start/end`, `elevation_start/end`, `distance_start/end`, `move_end` (fraction of clip) |
| `lighting` | `{"rig":"studio"}` | `rig`: `studio`, `hero`, `soft`, `dramatic`; `intensity`; `world` (environment strength); `rim_color`, `rim2_color`, `key_color`, `fill_color`; `hdri` (file or pinned name) |
| `motion_blur` | true | true/false, or a shutter number (0.35 = gentle) |
| `transparent` | true | false renders the palette `bg` behind the shot |
| `beat` | | beat id to fill `shot3d` in beats.json |
| `needs` | `[]` | `glass`, `liquid`, `subsurface`, `physics`, `character`, `procedural`, `photoreal`, `blender` |
| `view_transform`, `exposure`, `samples` | Standard, 0, per quality | advanced |

Colours anywhere in `params` and `lighting` can be `"#RRGGBB"` or a palette token: `bg`, `fg`,
`accent`, `accent2`. Eases: `linear`, `smooth`, or `<sine|quad|cubic|quart|quint|expo|circ|back|bounce|elastic>-<in|out|inout>`.
Camera moves: `static`, `push-in`, `pull-out`, `arc`, `arc-right`, `orbit`, `crane`, `dolly-left`, `hero`, `turntable`.
When an ease isn't set, it follows look.json `motion.character` (snappy -> back-out letters and
expo-out camera; smooth -> quart/sine; bouncy -> elastic/back; cinematic -> quint; editorial -> cubic).

## title3d (Tier 1 and 2)

| Param | Default | |
|---|---|---|
| `text` | `"CUTSCENE"` | up to 40 characters; about 12 reads best |
| `size`, `depth`, `bevel`, `bevel_segments`, `tracking` | 1, 0.3, 0.024, 4, 0.08 | depth and bevel relative to size |
| `reveal` | `"flip"` | `flip`, `rise`, `slide`, `pop`, `none` |
| `reveal_start`, `stagger`, `letter_duration`, `reveal_ease` | 0.1 s, from motion | the reveal always ends by 70 % of the clip |
| `swing` | 12 | degrees the word turns into place |
| `face`, `sides` | glossy `fg`, metal `accent` | materials for the letter faces and the sides/bevels |
| `ground` | false | add a shadow-catching floor under the word |

Camera `arc`, 50 mm, f/2.8, drift 0.15 deg.

## logo-svg (Tier 1 and 2)

| Param | Default | |
|---|---|---|
| `svg` | demo mark | filled paths only (strokes and SVG text are ignored); paths relative to the project |
| `width`, `depth`, `bevel` | 3.2, 0.42, 0.03 | |
| `reveal` | `"spin"` | `spin`, `rise`, `pop`, `extrude` (parts grow out of the background) |
| `reveal_duration`, `stagger`, `swing` | 1.1 s, 0.08, 10 | |
| `keep_svg_colors` | false | true keeps the SVG fills instead of `face` |
| `face`, `sides` | glossy `accent`, chrome | |

Camera `push-in`, f/4.

## turntable (Tier 1 and 2)

| Param | Default | |
|---|---|---|
| `model` | none -> built-in can | Tier 1: .glb/.gltf. Tier 2: .glb .gltf .obj .fbx .stl .ply. Scaled to `height`, stood on the floor |
| `turns` | 1 | full turns per clip; the loop is seamless |
| `start_angle`, `height` | -30, 2.0 | |
| `material_override` | none | one material for the whole model |
| `label`, `body` | glossy `accent`, metal | the built-in can's materials |
| `contact_shadow` | 0.55 | soft shadow under the model |

Camera `turntable`, 70 mm, f/5.6.

## product-shot (Tier 2; Tier 1 falls back to turntable)

Same model fields as turntable, plus `turn` (35 deg over the clip). Rig `hero` (top key, twin strip
rims in `accent`/`accent2`), camera `hero` (glide), 85 mm, f/2.2. Glass materials switch to Cycles.

## physics-drop (Tier 2; Tier 1 falls back to title3d without physics)

| Param | Default | |
|---|---|---|
| `text` | `"DROP"` | |
| `drop_height`, `stagger`, `start`, `bounce` | 3.2, 0.11 s, 0.05 s, 0.12 | letters wait above the frame and fall one by one |
| `upright`, `wobble` | true, 6 | a constraint keeps letters readable (they bounce and slide but can't topple) |
| `confetti`, `confetti_shapes`, `confetti_material` | 18, sphere/cube/ring/pill, glossy | seeded shapes in the palette colours, released after the last letter |
| `face`, `sides`, `shadow` | glossy `fg`, metal `accent`, 0.6 | |

The simulation is baked to keyframes, so stills show exactly the frames of the final render.

## shapes, flythrough (Tier 1 only)

Full-frame scenes on the palette background with bloom. `shapes`: `count` (16) floating shapes and
seeded dust, camera drifts in. `flythrough`: rings and chrome bits along a curved path. Set
`"bloom": false` in the spec to turn bloom off, `"bloom": "postprocessing"` to use the pinned
postprocessing library instead of three's own bloom (needs a 620 KB download, asked first).

## Tier 1 output

`cutscene 3d tier1 <template> --spec <spec>` writes `compositions/scene3d-<id>.html`, copies the
font/SVG/model and `cs3d-runtime.js` into `compositions/assets/3d/`, and returns the host clip:

```html
<div id="scene3d-logo-clip" data-composition-id="scene3d-logo" data-composition-src="compositions/scene3d-logo.html"
     data-start="0" data-duration="3" data-track-index="2" data-width="1920" data-height="1080"></div>
```

The shot reads `text` from per-instance variables, so `data-variable-values='{"text":"NEW"}'`
on the clip changes it without rewriting the file.
