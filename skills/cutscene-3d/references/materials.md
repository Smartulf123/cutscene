# Materials

Any material slot in a spec (`face`, `sides`, `label`, `body`, `material_override`) is

```json
{ "preset": "metal", "color": "accent", "roughness": 0.2 }
```

`color` is a palette token or `#RRGGBB`. Optional: `roughness`, `metallic`, `coat`, `ior`,
`emission_strength`, `color2`, `scale`, `distortion`, `bump`, `image`.

| Preset | Look | Tier 2 engine | Tier 1 equivalent |
|---|---|---|---|
| `glossy` | lacquered: coat 0.6, roughness 0.16 | EEVEE | MeshPhysical clearcoat |
| `plastic` | soft plastic, roughness 0.34 | EEVEE | MeshPhysical |
| `satin` | low sheen, roughness 0.55 | EEVEE | MeshStandard |
| `clay` | matte, roughness 0.8 | EEVEE | MeshStandard |
| `metal` | brushed-ish metal, roughness 0.24 | EEVEE | MeshStandard metal |
| `chrome` | mirror, roughness 0.06 | EEVEE | MeshStandard metal 0.08 |
| `gold` | warm metal (#E8B65A unless `color`) | EEVEE | MeshStandard |
| `glass` | transmission 1, IOR 1.45, light tint | **Cycles** (CPU) | MeshPhysical transmission (approximate) |
| `emissive` | glows in `color`, strength 6 | EEVEE | emissive (bloom in Tier 1 scenes) |
| `noise` | procedural noise between `color` and `color2`, with bump | EEVEE | (Tier 2 only; Tier 1 uses glossy) |
| `wave` | procedural bands between `color` and `color2`, with bump | EEVEE | (Tier 2 only) |
| `image` | `image` file as base colour (alpha used if present) | EEVEE | (Tier 2 only) |

Good pairings for titles and logos (face / sides):
- glossy `fg` / metal `accent`: the default, crisp and branded
- chrome / chrome with a coloured `rim_color`: classic "movie trailer"
- satin `accent` / gold: warm premium
- emissive `accent` / metal `#202024`: neon sign (best on a dark opaque background)
- glass / glass on a coloured video: only when the shot is short (Cycles cost)

Reflections: metals and gloss reflect Cutscene's procedural studio (soft vertical strips and a
top panel), so they never look flat grey. A pinned HDRI (`lighting.hdri`, see assets.md) gives
a photographic studio instead.
