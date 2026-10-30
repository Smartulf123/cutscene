# Cutscene 3D: material library.
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Every preset is a Principled BSDF set up for a look that holds up under the studio rig:
#   glossy, metal, chrome, gold, glass, plastic, satin, emissive, noise, wave, image, clay
# Colours arrive as '#RRGGBB' (already resolved from look.json by the Node side) and are
# converted sRGB -> linear here.
import os

import bpy

from .util import hex_rgba, node, set_input

PRESETS = {
    # roughness, metallic, coat, specular level
    "glossy": dict(roughness=0.16, metallic=0.0, coat=0.6, coat_roughness=0.04, specular=0.6),
    "plastic": dict(roughness=0.34, metallic=0.0, coat=0.0, specular=0.5),
    "satin": dict(roughness=0.55, metallic=0.0, coat=0.0, specular=0.45),
    "clay": dict(roughness=0.8, metallic=0.0, coat=0.0, specular=0.3),
    "metal": dict(roughness=0.24, metallic=1.0, coat=0.0, specular=0.5),
    "chrome": dict(roughness=0.06, metallic=1.0, coat=0.0, specular=0.5),
    "gold": dict(roughness=0.18, metallic=1.0, coat=0.0, specular=0.5, color="#E8B65A"),
    "glass": dict(roughness=0.02, metallic=0.0, coat=0.0, specular=0.5, transmission=1.0, ior=1.45),
    "emissive": dict(roughness=0.4, metallic=0.0, coat=0.0, specular=0.3, emission=6.0),
    "noise": dict(roughness=0.32, metallic=0.0, coat=0.25, specular=0.5),
    "wave": dict(roughness=0.28, metallic=0.0, coat=0.3, specular=0.5),
    "image": dict(roughness=0.4, metallic=0.0, coat=0.0, specular=0.5),
}

NEEDS_CYCLES = {"glass"}


def _principled(mat):
    nt = mat.node_tree
    bsdf = node(nt, "BSDF_PRINCIPLED")
    out = node(nt, "OUTPUT_MATERIAL")
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    if out is None:
        out = nt.nodes.new("ShaderNodeOutputMaterial")
    if not out.inputs["Surface"].is_linked:
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return nt, bsdf, out


def make(name, cfg, palette=None):
    """cfg: {"preset": "metal", "color": "#hex", "color2": "#hex", "roughness": .., "image": path,
    "scale": .., "emission_strength": ..}. Unknown presets fall back to glossy."""
    cfg = dict(cfg or {})
    preset_name = cfg.get("preset", "glossy")
    p = dict(PRESETS.get(preset_name, PRESETS["glossy"]))
    color = cfg.get("color") or p.get("color") or "#FFFFFF"
    mat = bpy.data.materials.new(name)
    nt, bsdf, out = _principled(mat)

    set_input(bsdf, "Base Color", hex_rgba(color))
    set_input(bsdf, "Roughness", float(cfg.get("roughness", p["roughness"])))
    set_input(bsdf, "Metallic", float(cfg.get("metallic", p["metallic"])))
    set_input(bsdf, "Specular IOR Level", float(p.get("specular", 0.5)))
    set_input(bsdf, "Coat Weight", float(cfg.get("coat", p.get("coat", 0.0))))
    set_input(bsdf, "Coat Roughness", float(p.get("coat_roughness", 0.08)))

    if preset_name == "glass":
        set_input(bsdf, "Transmission Weight", 1.0)
        set_input(bsdf, "IOR", float(cfg.get("ior", p["ior"])))
        # A tint, not a solid: glass reads as glass when its base colour is light.
        set_input(bsdf, "Base Color", hex_rgba(cfg.get("color") or "#F2F6FF"))
        mat.use_raytrace_refraction = True
        mat.surface_render_method = "DITHERED"
    elif preset_name == "emissive":
        set_input(bsdf, "Base Color", hex_rgba("#101014"))
        set_input(bsdf, "Emission Color", hex_rgba(color))
        set_input(bsdf, "Emission Strength", float(cfg.get("emission_strength", p["emission"])))
    elif preset_name in ("noise", "wave"):
        _procedural(nt, bsdf, preset_name, color, cfg.get("color2") or "#111111", float(cfg.get("scale", 4.0)), cfg)
    elif preset_name == "image":
        _image(nt, bsdf, cfg.get("image"))

    # Viewport colour helps anyone opening a saved .blend later.
    mat.diffuse_color = hex_rgba(color)
    mat["cs3d_preset"] = preset_name
    return mat


def _procedural(nt, bsdf, kind, c1, c2, scale, cfg):
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    if kind == "noise":
        tex = nt.nodes.new("ShaderNodeTexNoise")
        set_input(tex, "Scale", scale)
        set_input(tex, "Detail", 6.0)
        set_input(tex, "Roughness", 0.55)
        set_input(tex, "Distortion", float(cfg.get("distortion", 0.6)))
        fac = tex.outputs["Fac"]
    else:
        tex = nt.nodes.new("ShaderNodeTexWave")
        set_input(tex, "Scale", scale)
        set_input(tex, "Distortion", float(cfg.get("distortion", 3.0)))
        set_input(tex, "Detail", 2.0)
        fac = tex.outputs["Fac"]
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = hex_rgba(c2)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = hex_rgba(c1)
    nt.links.new(fac, ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    set_input(bump, "Strength", float(cfg.get("bump", 0.15)))
    nt.links.new(fac, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def _image(nt, bsdf, path):
    if not path or not os.path.isfile(path):
        return
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path, check_existing=True)
    tex.image.colorspace_settings.name = "sRGB"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if tex.image.depth in (32, 64):
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])


def shadow_catcher(name="CS3D_ShadowCatcher", strength=0.6, fade_radius=0.0, contact=None):
    """EEVEE shadow-only material: received light -> Shader to RGB -> darkness becomes alpha.

    Cycles uses object.is_shadow_catcher instead (true shadows); this material is ignored there
    because the object flag wins.
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    set_input(diffuse, "Color", (1, 1, 1, 1))
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    nt.links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(to_rgb.outputs["Color"], bw.inputs["Color"])
    # Lit floor ~ reference brightness -> 0 alpha; shadowed -> up to `strength` alpha.
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.interpolation_type = "LINEAR"
    nt.links.new(bw.outputs["Val"], ramp.inputs["Value"])
    set_input(ramp, "From Min", 0.5)
    ramp.inputs["From Max"].default_value = 1.0  # set per scene by set_catcher_reference
    set_input(ramp, "To Min", strength)
    set_input(ramp, "To Max", 0.0)
    fac = ramp.outputs["Result"]
    if fade_radius > 0:
        # Fade the catcher out away from the subject so uneven far-floor light never shows as a band.
        tc = nt.nodes.new("ShaderNodeTexCoord")
        length = nt.nodes.new("ShaderNodeVectorMath")
        length.operation = "LENGTH"
        nt.links.new(tc.outputs["Object"], length.inputs[0])
        fade = nt.nodes.new("ShaderNodeMapRange")
        fade.interpolation_type = "SMOOTHSTEP"
        nt.links.new(length.outputs["Value"], fade.inputs["Value"])
        fade.inputs["From Min"].default_value = fade_radius * 0.35
        fade.inputs["From Max"].default_value = fade_radius
        fade.inputs["To Min"].default_value = 1.0
        fade.inputs["To Max"].default_value = 0.0
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(fac, mul.inputs[0])
        nt.links.new(fade.outputs["Result"], mul.inputs[1])
        fac = mul.outputs[0]
    if contact:
        # Soft contact shadow under a static footprint (ellipse of half-sizes ax, ay):
        # alpha = 1 - (1 - shadow) * (1 - contact)
        ax, ay, amount = contact
        tc2 = nt.nodes.new("ShaderNodeTexCoord")
        sc2 = nt.nodes.new("ShaderNodeVectorMath")
        sc2.operation = "MULTIPLY"
        sc2.inputs[1].default_value = (1.0 / max(ax, 1e-3), 1.0 / max(ay, 1e-3), 0.0)
        nt.links.new(tc2.outputs["Object"], sc2.inputs[0])
        ln = nt.nodes.new("ShaderNodeVectorMath")
        ln.operation = "LENGTH"
        nt.links.new(sc2.outputs["Vector"], ln.inputs[0])
        blob = nt.nodes.new("ShaderNodeMapRange")
        blob.interpolation_type = "SMOOTHERSTEP"
        nt.links.new(ln.outputs["Value"], blob.inputs["Value"])
        blob.inputs["From Min"].default_value = 0.55
        blob.inputs["From Max"].default_value = 1.45
        blob.inputs["To Min"].default_value = 1.0 - amount
        blob.inputs["To Max"].default_value = 1.0
        inv = nt.nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(fac, inv.inputs[1])
        prod = nt.nodes.new("ShaderNodeMath")
        prod.operation = "MULTIPLY"
        nt.links.new(inv.outputs[0], prod.inputs[0])
        nt.links.new(blob.outputs["Result"], prod.inputs[1])
        res = nt.nodes.new("ShaderNodeMath")
        res.operation = "SUBTRACT"
        res.inputs[0].default_value = 1.0
        nt.links.new(prod.outputs[0], res.inputs[1])
        fac = res.outputs[0]
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    black = nt.nodes.new("ShaderNodeEmission")
    set_input(black, "Color", (0, 0, 0, 1))
    set_input(black, "Strength", 0.0)
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(fac, mix.inputs["Fac"])
    nt.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    nt.links.new(black.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = True
    mat["cs3d_catcher_range"] = ramp.name
    return mat


def set_catcher_reference(mat, lit_value):
    """Lit floor brightness the catcher treats as 'no shadow'."""
    rng = next((n for n in mat.node_tree.nodes if n.type == "MAP_RANGE" and n.inputs["To Max"].default_value == 0.0
                and n.inputs["To Min"].default_value < 1.0), None)
    if rng is not None:
        lit = max(0.05, float(lit_value))
        rng.inputs["From Min"].default_value = lit * 0.5   # half the light gone = full shadow
        rng.inputs["From Max"].default_value = lit * 0.97
