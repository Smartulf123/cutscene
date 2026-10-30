# Cutscene 3D: studio lighting and world.
# SPDX-License-Identifier: GPL-3.0-or-later
#
# The default look is a soft three-point studio: a large key softbox, a dimmer fill, a coloured
# rim from behind for the silhouette, and a top light. The world is a dark procedural studio with
# bright vertical strips, so metal and gloss always have something good to reflect (EEVEE and
# Cycles both read it, no HDRI download needed). An optional HDRI file replaces the strips.
import math
import os

import bpy
from mathutils import Vector

from .util import hex_rgb, link, set_input

RIGS = {
    # (azimuth deg from camera axis, elevation deg, distance x r, size x r, power, colour key)
    "studio": [
        ("key", -42, 34, 3.2, 2.6, 1.00, "key"),
        ("fill", 55, 12, 3.6, 3.4, 0.30, "fill"),
        ("rim", 160, 30, 3.0, 1.4, 1.25, "rim"),
        ("top", 0, 82, 3.0, 2.2, 0.35, "key"),
    ],
    "hero": [
        ("key", -30, 52, 3.0, 3.0, 1.15, "key"),
        ("fill", 70, 8, 4.0, 3.0, 0.14, "fill"),
        ("rim_l", -128, 18, 2.8, 0.9, 1.5, "rim"),
        ("rim_r", 128, 18, 2.8, 0.9, 1.5, "rim2"),
    ],
    "soft": [
        ("key", -35, 30, 3.6, 4.0, 0.9, "key"),
        ("fill", 45, 15, 3.6, 4.0, 0.55, "fill"),
        ("rim", 170, 35, 3.2, 2.0, 0.8, "rim"),
    ],
    "dramatic": [
        ("key", -70, 40, 3.0, 1.6, 1.3, "key"),
        ("rim", 150, 25, 2.8, 1.0, 1.8, "rim"),
    ],
}

BASE_POWER = 95.0  # watts for r = 1 at distance 3.2 r (white key ~0.6 of full); scaled by r^2


def add_rig(name, center, radius, cam_azimuth_deg=0.0, colors=None, intensity=1.0, collection=None):
    """Area lights around `center`, oriented at it. Azimuth 0 = the camera's side (-Y)."""
    colors = colors or {}
    lights = []
    for label, az, el, dist, size, power, ckey in RIGS.get(name, RIGS["studio"]):
        a = math.radians(az + cam_azimuth_deg)
        e = math.radians(el)
        d = dist * radius
        pos = Vector((
            center.x + d * math.cos(e) * math.sin(a),
            center.y - d * math.cos(e) * math.cos(a),
            center.z + d * math.sin(e),
        ))
        data = bpy.data.lights.new(f"CS3D_{label}", "AREA")
        data.shape = "RECTANGLE" if label.startswith("rim") else "DISK" if label == "top" else "RECTANGLE"
        data.size = size * radius
        data.size_y = size * radius * (2.4 if label.startswith("rim") else 1.0)
        data.energy = BASE_POWER * power * intensity * radius * radius * (dist / 3.2) ** 2
        data.color = hex_rgb(colors.get(ckey, "#FFFFFF"))
        data.use_shadow = label != "fill"
        data.spread = math.radians(110)
        ob = bpy.data.objects.new(f"CS3D_{label}", data)
        ob.location = pos
        direction = center - pos
        ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        link(ob, collection)
        lights.append(ob)
    return lights


def world(spec, strength=1.0, hdri=None, bg_color=None):
    """Procedural studio world (or an HDRI). If the shot is not transparent, the camera sees
    `bg_color` while lighting still comes from the studio."""
    w = bpy.data.worlds.new("CS3D_World")
    bpy.context.scene.world = w
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    set_input(bg, "Strength", strength)

    if hdri and os.path.isfile(hdri):
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri, check_existing=True)
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value[2] = math.radians(float(spec.get("hdri_rotation", 0)))
        nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    else:
        color = _studio_strips(nt)
        nt.links.new(color, bg.inputs["Color"])

    shader = bg.outputs["Background"]
    if bg_color and not spec.get("transparent", True):
        cam_bg = nt.nodes.new("ShaderNodeBackground")
        set_input(cam_bg, "Color", (*hex_rgb(bg_color), 1.0))
        set_input(cam_bg, "Strength", 1.0)
        lp = nt.nodes.new("ShaderNodeLightPath")
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
        nt.links.new(shader, mix.inputs[1])
        nt.links.new(cam_bg.outputs["Background"], mix.inputs[2])
        shader = mix.outputs["Shader"]
    nt.links.new(shader, out.inputs["Surface"])
    return w


def _math(nt, op, a=None, b=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = float(v)
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def _smooth(nt, value, lo, hi):
    n = nt.nodes.new("ShaderNodeMapRange")
    n.interpolation_type = "SMOOTHSTEP"
    nt.links.new(value, n.inputs["Value"])
    n.inputs["From Min"].default_value = lo
    n.inputs["From Max"].default_value = hi
    return n.outputs["Result"]


def _studio_strips(nt):
    """Dark gradient studio with three soft vertical strip boxes and a top panel."""
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    x, y, z = sep.outputs["X"], sep.outputs["Y"], sep.outputs["Z"]
    # horizontal length for azimuth cosine
    hx2 = _math(nt, "MULTIPLY", x, x)
    hy2 = _math(nt, "MULTIPLY", y, y)
    hlen = _math(nt, "SQRT", _math(nt, "ADD", hx2, hy2))
    hlen = _math(nt, "MAXIMUM", hlen, 1e-4)
    total = None
    strips = [  # azimuth deg (0 = toward camera side -Y), half-width deg, z lo, z hi, power
        (-45, 9, -0.15, 0.75, 7.0),
        (60, 6, -0.1, 0.6, 3.0),
        (165, 5, -0.05, 0.7, 6.0),
        (-150, 4, 0.0, 0.6, 4.0),
        # broad soft panel just left of the camera: a sheen that runs across flat faces as the
        # camera moves (the "light sweeping over the logo" look)
        (-12, 14, 0.02, 0.45, 1.1),
    ]
    for az, half, zlo, zhi, power in strips:
        a = math.radians(az)
        # direction toward the strip in world XY: camera side is -Y
        dx, dy = math.sin(a), -math.cos(a)
        dot = _math(nt, "ADD", _math(nt, "MULTIPLY", x, dx), _math(nt, "MULTIPLY", y, dy))
        cosang = _math(nt, "DIVIDE", dot, hlen)
        c_in, c_out = math.cos(math.radians(half * 0.6)), math.cos(math.radians(half))
        horiz = _smooth(nt, cosang, c_out, c_in)
        vert = _math(nt, "MULTIPLY", _smooth(nt, z, zlo, zlo + 0.12), _smooth(nt, _math(nt, "MULTIPLY", z, -1.0), -zhi, -zhi + 0.12))
        strip = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", horiz, vert), power)
        total = strip if total is None else _math(nt, "ADD", total, strip)
    # top softbox
    top = _math(nt, "MULTIPLY", _smooth(nt, z, 0.86, 0.95), 2.2)
    total = _math(nt, "ADD", total, top)
    # base gradient: dark floor, slightly lifted horizon/ceiling so nothing reflects pure black
    # (a light-grey studio floor below the horizon keeps the undersides of metal from going black)
    floor = _math(nt, "MULTIPLY", _smooth(nt, _math(nt, "MULTIPLY", z, -1.0), -0.05, 0.25), 0.11)
    grad = _math(nt, "ADD", _math(nt, "MULTIPLY", _smooth(nt, z, -0.1, 0.7), 0.05), 0.015)
    grad = _math(nt, "ADD", grad, floor)
    total = _math(nt, "ADD", total, grad)
    rgb = nt.nodes.new("ShaderNodeCombineColor")
    for ch in ("Red", "Green", "Blue"):
        nt.links.new(total, rgb.inputs[ch])
    return rgb.outputs["Color"]


def ground(z=0.0, size=40.0, engine="BLENDER_EEVEE", strength=0.6, catcher_mat=None, center=(0, 0), fade_radius=0.0,
           contact=None):
    """Invisible floor that only keeps shadows (shadow catcher)."""
    from .materials import shadow_catcher
    me = bpy.data.meshes.new("CS3D_Ground")
    h = size / 2
    me.from_pydata([(-h, -h, z), (h, -h, z), (h, h, z), (-h, h, z)], [], [(0, 1, 2, 3)])
    me.update()
    ob = bpy.data.objects.new("CS3D_Ground", me)
    ob.location = (center[0], center[1], 0.0)
    link(ob)
    mat = catcher_mat or shadow_catcher(strength=strength, fade_radius=fade_radius, contact=contact)
    me.materials.append(mat)
    if engine == "CYCLES":
        ob.is_shadow_catcher = True
    # The floor must never show up in reflections as a dark plane.
    ob.visible_glossy = False
    ob.visible_transmission = False
    return ob


def floor_brightness(lights, point, world_strength=0.8):
    """Unshadowed brightness of a white diffuse floor at `point` (what the shadow catcher treats as
    'no shadow'). Small-source approximation: E = (P/pi) cos_l cos_f / d^2, outgoing = E / pi."""
    total = 0.0
    up = Vector((0, 0, 1))
    for ob in lights:
        d = ob.data
        if d.type != "AREA":
            continue
        to_p = Vector(point) - ob.matrix_world.translation
        dist2 = max(1e-6, to_p.length_squared)
        dirn = to_p.normalized()
        normal = (ob.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
        cos_l = max(0.0, normal.dot(dirn))
        cos_f = max(0.0, up.dot(-dirn))
        lum = 0.2126 * d.color[0] + 0.7152 * d.color[1] + 0.0722 * d.color[2]
        total += (d.energy / math.pi) * cos_l * cos_f / dist2 / math.pi * lum
    return total + 0.06 * world_strength
