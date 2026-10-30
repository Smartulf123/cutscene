# Blender 5.x API pitfalls (what the Cutscene scripts handle)

Verified against Blender 5.2.3 LTS on Windows. Several rules learned from EL4CTEO/blender-skills
(MIT), `blender-core/references/api-changes-5x.md`; written here in our own words.

| Pitfall | Old / wrong | What Cutscene does |
|---|---|---|
| EEVEE engine id | `BLENDER_EEVEE_NEXT` (4.2-4.5) | `BLENDER_EEVEE`, assigned in `try/except` with a fallback (`scene.py`) |
| F-curves | `action.fcurves.new(...)` | slotted actions: `anim_utils.action_ensure_channelbag_for_slot(action, slot)` then `channelbag.fcurves.ensure(...)` (`util.animate`) |
| Image output | `file_format = "PNG"` alone | `image_settings.media_type = "IMAGE"` **before** `file_format` |
| Node lookup | `nodes["Principled BSDF"]` (localized names) | by type: `n.type == "BSDF_PRINCIPLED"` (`util.node`) |
| Principled inputs | `Specular`, `Transmission`, `Clearcoat`, `Emission` | `Specular IOR Level`, `Transmission Weight`, `Coat Weight`, `Emission Color`; set only if the socket exists (`util.set_input`) |
| `material.use_nodes = True` | needed before 5.0 | not used: new materials already have Principled + Output |
| Colour management | AgX default desaturates brand colours | `view_transform = "Standard"`, look `None`, sRGB display |
| Hex colours | used as-is | converted sRGB -> linear (`util.hex_rgb`) |
| Factory scene | default cube, light, camera | `--factory-startup`, then every object removed (`scene.reset`) |
| Auto smooth | `mesh.use_auto_smooth` | `mesh.set_sharp_from_angle(angle=...)` + smooth faces |
| Shader node names | `SHADER_TO_RGB` | the type is `SHADERTORGB`; look up by `bl_idname` when unsure |
| Rigid body bake | `bpy.ops.rigidbody.bake_to_keyframes` needs a UI | step frames in order, record `matrix_world`, remove the sim, key the transforms (`physics_drop.py`) |
| Rigid body constraints | default `disable_collisions = True` | set `False` on the "stay upright" constraint, or letters fall through the floor |
| Rigid bodies + parents | parented bodies simulate wrongly | letters are un-parented (world matrix kept) before the sim |
| SVG import scale | curves arrive ~0.05 m wide | extrude/bevel set in curve units, the fit transform baked into the mesh afterwards |
| Light matrices | `matrix_world` stale right after creation | `view_layer.update()` before using light positions |
| EEVEE in background | needs a GPU context | works on Intel UHD (OpenGL); first frame of each process compiles shaders (5-35 s) |
| Cycles device | GPU assumed | `cycles.device = "CPU"`; Intel UHD isn't a Cycles GPU (no oneAPI on Xe-LP) |
| Determinism | random noise per run | `cycles.seed` from the spec, `use_animated_seed = False`, Python `random.Random(seed)` |
| Render progress | parse Blender's log | `render_pre`/`render_post` handlers print `@@CS3D@@{json}` lines |

## Shadow catcher in EEVEE

EEVEE has no `is_shadow_catcher`. Cutscene's floor material is Diffuse -> Shader to RGB ->
brightness, mapped so the unshadowed floor is fully transparent and shadowed floor turns into
black with alpha (`materials.shadow_catcher`). The "unshadowed" brightness is computed from the
actual light rig (`lighting.floor_brightness`, x1.25 measured against real renders), and the
catcher fades out away from the subject so uneven far-floor light never shows as a band. Cycles
uses the real `is_shadow_catcher`.

## When something new breaks

`dir(obj)`, `T.bl_rna.properties.keys()` and assigning an enum inside `try/except TypeError`
(the error lists valid values) answer most questions faster than the docs. Run
`blender -b --factory-startup --python-exit-code 1 -P probe.py` with a tiny probe script.
