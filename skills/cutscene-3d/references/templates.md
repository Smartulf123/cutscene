# 3D templates and spec fields

A spec is `.cutscene/3d/<shot>.json`. `cutscene 3d new <template>` writes one with every default.
`cutscene 3d tier1 <template> --spec <spec>` turns it into a shot. A spec can hold more fields
than the ones below; the shot uses only these.

## Fields every spec has

| Field | Default | Meaning |
|---|---|---|
| `version` | 1 | spec format |
| `id` | template name | shot name; the shot is `compositions/scene3d-<id>.html` |
| `template` | | see below |
| `tier` | `"auto"` | `"auto"` or `1` (both mean the same); `2` is refused |
| `duration` | beat length or template default | seconds; the clip's `data-duration` in `index.html` wins |
| `width`, `height` | from beats.json, else 1920 / 1080 | even numbers |
| `look` | `".cutscene/look.json"` | palette, display font, motion character, seed |
| `palette` | | optional overrides of look.json colours |
| `font` | look's display font | path to a .ttf, .otf or .woff; `title3d` only |
| `seed` | look.json `seed`, else 1337 | |
| `params` | template defaults | template fields below |
| `lighting.rim_color` | `"accent"` | colour of the rim light and the reflected back strip |
| `transparent` | true (false for `shapes`, `flythrough`) | false fills the frame with the palette `bg` |
| `bloom` | false (`"three"` for `shapes`, `flythrough`) | `false`, `"three"`, or `"postprocessing"` (see below) |
| `bloom_strength` | 0.7 (`"three"`), 1.2 (`"postprocessing"`) | |
| `exposure` | 0 | in stops: 1 is twice as bright, -1 half |
| `beat` | | beat id; `tier1` fills that beat's `shot3d` in beats.json |

Colours anywhere in `params` and `lighting` can be `"#RRGGBB"` or a palette token: `bg`, `fg`,
`accent`, `accent2`. The motion follows look.json `motion.character`.

## title3d

Extruded, bevelled letters flip up one by one; the word swings so light runs over the bevels,
then holds facing the camera. The reveal always ends well before the clip does.

| Param | Default | |
|---|---|---|
| `text` | `"CUTSCENE"` | up to 40 characters; about 12 reads best |
| `depth`, `bevel`, `tracking` | 0.3, 0.024, 0.08 | relative to the letter size |
| `stagger`, `letter_duration` | 0.07 s, 0.8 s | shortened to fit short clips |
| `swing` | 12 | degrees the word turns into place |
| `face`, `sides` | glossy `fg`, metal `accent` | materials for the letter faces and the sides/bevels |

## logo-svg

An SVG logo, extruded and bevelled, spins in and settles facing the camera.

| Param | Default | |
|---|---|---|
| `svg` | Cutscene's demo mark | filled paths only (strokes and SVG text are ignored); paths relative to the project |
| `depth`, `bevel` | 0.42, 0.03 | |
| `keep_svg_colors` | false | true keeps the SVG fills instead of `face` |
| `face`, `sides` | glossy `accent`, chrome | |

## turntable

A model turns on a seamless loop under studio reflections, with a soft contact shadow.

| Param | Default | |
|---|---|---|
| `model` | none -> built-in can | a .glb or .gltf file, scaled to fit and stood on the floor; it keeps its own materials |
| `turns` | 1 | full turns per clip (1 to 4) |
| `label` | glossy `accent` | the built-in can's label material |

## shapes, flythrough

Full-frame scenes on the palette background with bloom. `shapes`: `count` (16, from 4 to 40)
floating shapes and seeded dust, the camera drifts in. `flythrough`: rings and chrome bits along
a curved path. Set `"bloom": false` in the spec to turn bloom off, or `"bloom": "postprocessing"`
to use the pinned postprocessing library instead of three's own bloom (a 620 KB download, asked
first).

## What `tier1` writes

`cutscene 3d tier1 <template> --spec <spec>` writes `compositions/scene3d-<id>.html`, copies the
font, SVG or model and `cs3d-runtime.js` into `compositions/assets/3d/`, and returns the host clip:

```html
<div id="scene3d-logo-clip" data-composition-id="scene3d-logo" data-composition-src="compositions/scene3d-logo.html"
     data-start="0" data-duration="3" data-track-index="2" data-width="1920" data-height="1080"></div>
```

`--start` and `--track` set `data-start` and `data-track-index`. A `title3d` shot reads `text`
from per-instance variables, so `data-variable-values='{"text":"NEW"}'` on the clip changes it
without rewriting the file.
