# Materials

Any material slot in a spec (`face`, `sides`, `label`) is

```json
{ "preset": "metal", "color": "accent", "roughness": 0.2 }
```

`color` is a palette token or `#RRGGBB`. Optional: `roughness` (0 is a mirror, 1 is matte) and,
for `emissive`, `emission_strength`.

| Preset | Look |
|---|---|
| `glossy` | lacquered, with a clear coat (roughness 0.18); the default |
| `plastic` | soft plastic, roughness 0.34 |
| `satin` | low sheen, roughness 0.55 |
| `clay` | matte, roughness 0.8 |
| `metal` | brushed-ish metal, roughness 0.24 |
| `chrome` | mirror, roughness 0.08 |
| `gold` | warm metal (#E8B65A unless `color` is set) |
| `emissive` | glows in `color`, strength 2.5; brightest in `shapes` and `flythrough`, which have bloom |

Good pairings for titles and logos (face / sides):
- glossy `fg` / metal `accent`: the default, crisp and branded
- chrome / chrome with a coloured `lighting.rim_color`: classic "movie trailer"
- satin `accent` / gold: warm premium
- emissive `accent` / metal `#202024`: neon sign (best on a dark background)

Reflections: metals and gloss reflect Cutscene's own studio (soft light strips and a top panel,
with the back strip in `lighting.rim_color`), so they never look flat grey.
