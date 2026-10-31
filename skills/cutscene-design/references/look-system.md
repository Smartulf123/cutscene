# The look system: a distinct look for every video

Written for Cutscene. Every Cutscene video starts from a small style spec, `.cutscene/look.json`,
chosen or generated from this video's brief and the user's brand. It is never one house style.

## Why this exists

Agent-made videos converge on one look: a dark navy background, an indigo or violet glow, Inter
everywhere, glassy cards in the middle of the frame, and `power3.out` on every entrance. Viewers
recognise it in a second and scroll past. The cause is defaults: the same example markup, the same
palette file and the same ease, copied into every project. The look system replaces those defaults
with a per-video decision that is written down, checked, and compared with earlier videos.

## The rules

1. **Make the look after the brief is approved and before any HTML.** No `look.json`, no
   composition.
2. **Never reuse the previous video's look** unless the user asks for it ("same style as last
   time", a series, a brand template). Then copy that `look.json` on purpose and say so in
   `.cutscene/project.md`.
3. **The brand wins over the generator.** When the user has brand colours or fonts, pass them in;
   the generator keeps them (adjusting lightness only when contrast demands it, and saying so).
4. **Everything reads the look:** CSS variables, fonts, GSAP eases and durations, caption styling,
   texture overlays, and the 3D shots in `/cutscene-3d` (palette and type).
5. **Check it, then compare it.** `look check` must pass; `look compare` must not report the new
   look as too similar to an earlier video.

## Commands

The script lives in this skill: `node "<this skill's folder>/scripts/look.mjs" <command>`.

```bash
# make this video's look (deterministic: the same brief and seed give the same look)
node "<this skill's folder>/scripts/look.mjs" new --brief .cutscene/brief.md --against <folder with earlier projects>
node "<this skill's folder>/scripts/look.mjs" new --brief .cutscene/brief.md --seed 1337 --brand brand.json

# validate schema and contrast
node "<this skill's folder>/scripts/look.mjs" check .

# how different are two looks (0 = the same, 1 = nothing in common)
node "<this skill's folder>/scripts/look.mjs" diff ../launch-video .

# the same-look check for the review gate
node "<this skill's folder>/scripts/look.mjs" compare . --against .. --strict
```

- `new` writes `.cutscene/look.json` next to the brief and refuses to overwrite an existing look
  (pass `--force` only when the user asked for a new look). With `--against <dir>` it tries seeds
  until the look is different enough from the last five looks found in `<dir>/*/.cutscene/`,
  preferring a background tone other than the newest earlier video's and a display font none of
  them used (a brand's background or font always wins).
  Without `--seed`, the seed comes from the brief's text, so a different brief gives a different
  look and a re-run gives the same one.
- `check` exits 1 on schema errors or failing contrast and prints notes for weaker problems.
- `compare` prints a score per earlier project; scores under the threshold (default 0.3) are
  "too similar". With `--strict` it exits 1 then, which is what the review gate uses.
- Every command takes `--json` and prints one JSON object (`{"ok":true,...}` or
  `{"ok":false,"error":{...}}`).

### Brand input

`--brand` takes a JSON file or inline JSON:

```json
{
  "name": "Acme",
  "colors": { "primary": "#FF5A1F", "secondary": "#1F8FFF", "background": "#FFF8F2", "text": "#1A1410" },
  "fonts": { "display": "Poppins", "body": "Lato" },
  "motion": "snappy"
}
```

Every field is optional. `colors` may also be an ordered list (most used first), so a captured
site's `capture/extracted/tokens.json` works as is: the most vivid colours become the accents, and
a near-white or near-black at the top of the list becomes the background.

## look.json

```json
{
  "version": 1,
  "name": "midnight signal",
  "palette": { "bg": "#0B1020", "fg": "#F4F3EE", "accent": "#5B8DEF", "accent2": "#FF7A45" },
  "type": {
    "display": { "family": "Space Grotesk", "weight": 700, "src": "assets/fonts/space-grotesk-latin-700-normal.woff2" },
    "body": { "family": "Inter", "weight": 500 }
  },
  "motion": { "character": "snappy", "ease": "power3.out", "duration_scale": 1.0 },
  "texture": { "grain": 0.06, "vignette": 0.2 },
  "source": "brief",
  "seed": 1337
}
```

| Field | Meaning |
|---|---|
| `palette.bg` / `fg` | canvas and main text colour |
| `palette.accent` / `accent2` | the two accent colours: highlights, shapes, key words, data |
| `type.display` / `body` | headline and body family + weight; `src` only for fonts the engine does not supply (below) |
| `motion.character` | `snappy`, `smooth`, `bouncy`, `cinematic` or `editorial` (table below) |
| `motion.ease` | the main entrance ease (a GSAP ease string) |
| `motion.duration_scale` | multiply every duration in the motion table by this |
| `texture.grain` / `vignette` | 0 to 1; how much film grain and edge darkening the frame gets |
| `source` | `brief`, `brand`, or `user` when the user dictated it |
| `seed` | the seed that produced it, so it can be rebuilt |

## Applying the look

Put the palette and fonts in one place at the top of the root composition and use only the
variables below it:

```css
:root {
  --bg: #0b1020;
  --fg: #f4f3ee;
  --accent: #5b8def;
  --accent2: #ff7a45;
  --font-display: "Space Grotesk", "Inter", sans-serif;
  --font-body: "Inter", sans-serif;
}
@font-face {
  font-family: "Space Grotesk";
  font-weight: 700;
  src: url("assets/fonts/space-grotesk-latin-700-normal.woff2") format("woff2");
}
```

In GSAP, read the ease and scale once and derive the rest:

```js
const LOOK = { ease: "power3.out", exit: "power2.in", scale: 1.0 }; // from look.json + the table below
const d = (s) => s * LOOK.scale;
tl.from(".title", { y: 40, opacity: 0, duration: d(0.45), ease: LOOK.ease }, 0.2);
```

In the promo workflows, Step 2 remixes a frame preset onto brand tokens. When the capture found
no brand colours, put the look's palette and fonts into `capture/extracted/tokens.json` before
running `build-frame.mjs`: `"colors": [bg, fg, accent, accent2]`, `"fonts": [display, body]`.
Choose the preset whose structure fits the brief; the look decides its colours and type.

## Motion characters

Durations are for 1080p at 30 fps, before `duration_scale`. Pick holds so text stays readable:
at least 1.2 s plus 0.25 s per word on screen.

| Character | Main ease | Exit ease | Entrance | Stagger | Overshoot | Transitions | Camera |
|---|---|---|---|---|---|---|---|
| **snappy** | `power3.out`, `power4.out`, `expo.out` | `power2.in` | 0.35 to 0.5 s | 0.03 to 0.05 s | none | hard cuts, quick pushes and wipes (0.25 to 0.4 s) | small fast punch-ins |
| **smooth** | `sine.inOut`, `power1.inOut`, `power2.out` | `sine.in` | 0.8 to 1.2 s | 0.08 to 0.12 s | none | crossfades and soft blurs (0.6 to 1 s) | slow drifts, no shake |
| **bouncy** | `back.out(1.7)`, `back.out(2.2)`, `elastic.out(1, 0.5)` for pops | `back.in(1.4)` | 0.5 to 0.7 s | 0.05 to 0.07 s | yes, one bounce | scale pops and squash (0.4 s) | playful tilts |
| **cinematic** | `expo.inOut`, `power4.inOut` | `power3.in` | 1.2 to 2 s | 0.1 to 0.15 s | none | long dissolves, light leaks, push-ins through black (1 to 1.5 s) | slow dolly and parallax, depth of field |
| **editorial** | `power2.inOut`, `circ.inOut`, `steps(6)` for type-on | `power2.in` | 0.5 to 0.7 s | 0.04 to 0.06 s | none | grid wipes, column slides, cuts on the beat (0.3 to 0.5 s) | static frames, lock-offs |

Mixing: one character per video. A second ease is fine for one hero moment (a bouncy logo in a
snappy promo), never as the default. The animation rules and blueprints in `/cutscene-animate`
name their own eases; swap them for the character's eases unless the rule says the ease is
essential.

## Typography

**Fonts the engine renders with no setup** (its auto-resolved list): Inter, Montserrat, Outfit,
Nunito, Oswald, League Gothic, Archivo Black, Space Mono, IBM Plex Mono, JetBrains Mono,
EB Garamond, Playfair Display, Source Code Pro, Noto Sans JP, Roboto, Open Sans, Lato, Poppins.
Common system names map onto them (Helvetica and Arial render as Inter, Georgia as EB Garamond,
Courier as JetBrains Mono, Bebas Neue as League Gothic).

**Any other family needs an `@font-face` with a local file**, or the lint rule
`font_family_without_font_face` fails and the text falls back to a generic font. Cutscene bundles
OFL fonts in `/cutscene-captions` (`modes/standard/fonts/files/`): Space Grotesk, Sora, Anton,
Bodoni Moda, Cormorant Garamond, Chakra Petch, Rajdhani, Teko, Fredoka, Orbitron, Baloo 2, Cinzel
and more. When `look new` picks one, it copies the `.woff2` into `assets/fonts/` and records it in
`type.*.src`; declare it with `@font-face` as above. A brand font the user supplies works the same
way (copy the file into `assets/fonts/`, set `src`).

Pairings the generator uses (display + body). They are curated so each one has a clear voice;
the most common UI fonts (Inter, Poppins, Open Sans, Roboto) are never the generated display face,
only when the brand asks for one (`look check` notes it otherwise).

| Display | Body | Feels | Characters |
|---|---|---|---|
| Archivo Black 400 | Space Grotesk 400 * | heavy, graphic | snappy, bouncy |
| Montserrat 800 | IBM Plex Mono 400 | geometric meets technical | snappy, editorial |
| Oswald 600 | Lato 400 | condensed, urgent | snappy, cinematic |
| League Gothic 400 | Sora 400 * | poster, headline | snappy, editorial, cinematic |
| Playfair Display 700 | Space Grotesk 400 * | magazine meets product | editorial, smooth |
| EB Garamond 600 | IBM Plex Mono 400 | literary, archival | editorial, smooth |
| Space Mono 700 | IBM Plex Mono 400 | terminal, dev | snappy, editorial |
| JetBrains Mono 700 | Sora 400 * | developer tool | snappy |
| Outfit 700 | Nunito 400 | friendly | bouncy, smooth |
| Baloo 2 700 * | Nunito 400 | soft, rounded | bouncy, smooth |
| Playfair Display 800 | Source Code Pro 400 | editorial meets tech | editorial, cinematic |
| Space Grotesk 700 * | Source Code Pro 400 | modern product | snappy, editorial |
| Sora 700 * | Lato 400 | clean, airy | smooth, snappy |
| Anton 400 * | Space Grotesk 400 * | impact headline | cinematic, snappy |
| Bodoni Moda 700 * | Lato 400 | fashion, luxury | editorial, cinematic |
| Cormorant Garamond 700 * | Sora 400 * | elegant, filmic | cinematic, smooth, editorial |
| Chakra Petch 700 * | Space Grotesk 400 * | tech, sci-fi | snappy, cinematic |
| Fredoka 700 * | Nunito 400 | playful, kids | bouncy |
| Teko 700 * | Sora 400 * | sport, stats | snappy, cinematic |
| Cinzel 700 * | EB Garamond 400 | epic, title card | cinematic, editorial |
| Shippori Mincho 700 * | Lato 400 | quiet, refined | smooth, editorial |
| Rajdhani 700 * | Lato 400 | sport, tech | snappy |
| Special Elite 400 * | EB Garamond 400 | typewriter, documentary | editorial, cinematic |
| Bangers 400 * | Nunito 400 | comic, loud | bouncy |

\* bundled font: needs `@font-face` (copied by `look new`).

A brand's display font is kept; its body comes from the brand, else from the curated pair with the
same display face, else from a pair that suits the motion character.

**Fonts in 3D shots.** `/cutscene-3d` extrudes the look's display font, but it needs a file it can
read: .ttf, .otf or .woff, not .woff2. Every display face in the table above has a pinned .woff in
`/cutscene-3d`'s `assets/manifest.json`. When that file is already on this computer, `look new`
copies it into `assets/fonts/` next to the .woff2 (the .woff is for 3D titles; declare only the
.woff2 with `@font-face`). When it isn't, `look new` prints a note with the command that gets it
(`cutscene 3d assets fetch font-<family>-<weight> --yes`, after asking the user). Without it, a
3D title falls back to Geist Bold and says so; 3D shots without text (logos, products, shapes)
never need a font.

Sizes at 1920x1080 (scale with the frame's short side): display 72 to 180 px, body at least
32 px, captions at least 44 px. Two families at most; a third only for code.

## Palettes

Four roles: `bg`, `fg`, `accent`, `accent2`. The generator picks a hue (or takes the brand's), a
scheme for the second accent (complement, split complement, triad, analogous, or one pop colour),
and a background tone by character, then fixes contrast and keeps the two accents clearly apart.

| Tone | Background | Leans toward |
|---|---|---|
| ink | near-black | cinematic, snappy |
| deep | a dark, saturated colour: forest, oxblood, plum (never deep navy or indigo) | cinematic, smooth |
| paper | near-white | editorial, smooth |
| tinted | a light colour you can name: butter, blush, sage, mint | smooth, bouncy |
| vivid | a bold colour field with dark type, accents from the opposite hue (poster) | bouncy, snappy |

Without tones every light look was near-white and every dark look near-black, so different videos
read as one template with different fonts. A brand background decides the tone; a brand primary
never becomes a vivid field (it stays the accent).

Colour words in the brief steer the main hue: warm, cozy, autumn (oranges); trust, finance,
fintech, bank (teals and greens); fresh, nature, eco (greens); calm, ocean, sleep (blue-greens);
luxury, premium, gold (golds); fashion, beauty (rose); energy, fitness, sport (reds). Calm motion
characters (smooth, editorial, cinematic) get softer accents.

| Pair | Required | Target | Why |
|---|---|---|---|
| `fg` on `bg` | 4.5:1 (WCAG AA) | 7:1 | body text must survive phone screens and compression |
| `accent` on `bg` | 3:1 | 4.5:1 | shapes, key words and large text |
| `accent2` on `bg` | 3:1 for anything that carries meaning | | decoration may go lower |
| text on an `accent` fill | 4.5:1 | | `look check` says whether `fg` or `bg` reads better on it |

The engine's `cutscene check` audits WCAG contrast on rendered frames too; the look check catches
it before anything is built.

Avoid, unless the brand asks for it:

- a near-black blue background with an indigo or violet accent (the generic AI-video look;
  `look check` notes it, and the generator steps out of that hue band on dark backgrounds);
- pure `#000000` / `#FFFFFF` (tint them toward the background hue);
- two accents of nearly the same colour (`look check` notes it);
- Inter, Poppins, Open Sans or Roboto as the display face (`look check` notes it);
- gradients as the main idea; one flat accent used with intent reads more designed.

## Texture

- `grain` 0 to 0.12: an SVG-noise or noise-PNG overlay at that opacity, above everything, static
  or re-seeded per frame with a deterministic seed (never `Math.random()` at render time; see the
  determinism rules in `/cutscene-compose`).
- `vignette` 0 to 0.45: a radial-gradient overlay darkening the corners by that alpha.
- Snappy and bouncy looks stay nearly clean; cinematic looks carry the most.
- On real footage, prefer the engine's own media treatments over hand-made overlays.

## Same-look check (review gate)

Before the final preview, run:

```bash
node "<this skill's folder>/scripts/look.mjs" compare . --against .. --strict
```

`..` is the folder that holds the user's other Cutscene projects (often `videos/`). If it fails,
tell the user which earlier video it resembles and offer a new look (`look new --force --against ..`)
before building further. Record the result in `.cutscene/project.md`.
