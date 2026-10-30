# Cutscene 3D: small helpers shared by every Blender scene script.
# SPDX-License-Identifier: GPL-3.0-or-later
# Patterns (node lookup by type, enum discovery, slotted-action keyframes) learned from
# EL4CTEO/blender-skills (MIT). Written for Cutscene.
import json
import math
import random
import sys

import bpy
from bpy_extras import anim_utils

MARK = "@@CS3D@@"


def argv():
    """Arguments after '--' (Blender ignores them)."""
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def emit(data):
    """One machine-readable line for the Node side."""
    print(MARK + json.dumps(data, separators=(",", ":")), flush=True)


def log(msg):
    print("[cutscene-3d] " + str(msg), file=sys.stderr, flush=True)


# ---------------------------------------------------------------- colour

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(value, fallback="#ffffff"):
    """'#RRGGBB' -> linear (r, g, b). Blender colour sockets are scene-linear."""
    s = str(value or fallback).strip().lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    try:
        r, g, b = (int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    except ValueError:
        return hex_rgb(fallback)
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b))


def hex_rgba(value, alpha=1.0, fallback="#ffffff"):
    return (*hex_rgb(value, fallback), alpha)


def luminance(rgb):
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# ---------------------------------------------------------------- data API

def node(tree, type_):
    """First node of `type_` (e.g. 'BSDF_PRINCIPLED'). Never look nodes up by name (localized)."""
    return next((n for n in tree.nodes if n.type == type_), None)


def set_input(n, name, value):
    """Set a socket default if the socket exists in this Blender version."""
    sock = n.inputs.get(name)
    if sock is not None:
        try:
            sock.default_value = value
        except (TypeError, ValueError):
            pass
    return sock


def set_enum(owner, prop, value, fallback=None):
    try:
        setattr(owner, prop, value)
        return True
    except (TypeError, ValueError, AttributeError):
        if fallback is not None:
            try:
                setattr(owner, prop, fallback)
            except (TypeError, ValueError, AttributeError):
                pass
        return False


def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def new_empty(name, location=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    ob.location = location
    ob.empty_display_size = 0.2
    return link(ob)


def seeded(seed):
    return random.Random(int(seed or 0))


# ---------------------------------------------------------------- animation (Blender 5 slotted actions)

_EASE = {
    "linear": ("LINEAR", "AUTO"),
    "constant": ("CONSTANT", "AUTO"),
    "smooth": ("BEZIER", "AUTO"),
    "bezier": ("BEZIER", "AUTO"),
}


def ease_mode(name):
    """'expo-out' -> ('EXPO', 'EASE_OUT'); 'back-out' -> ('BACK', 'EASE_OUT'); 'smooth' -> BEZIER."""
    name = (name or "smooth").lower()
    if name in _EASE:
        return _EASE[name]
    kind, _, direction = name.partition("-")
    interp = kind.upper()
    if interp not in {"SINE", "QUAD", "CUBIC", "QUART", "QUINT", "EXPO", "CIRC", "BACK", "BOUNCE", "ELASTIC"}:
        return _EASE["smooth"]
    easing = {"in": "EASE_IN", "out": "EASE_OUT", "inout": "EASE_IN_OUT", "in-out": "EASE_IN_OUT"}.get(
        direction.replace("_", "-"), "EASE_OUT")
    if direction in ("in-out", "inout"):
        easing = "EASE_IN_OUT"
    return interp, easing


def channelbag(id_block):
    """Channelbag for an ID's action slot, creating action + slot when needed (Blender 4.4+/5.x)."""
    ad = id_block.animation_data or id_block.animation_data_create()
    if ad.action is None:
        ad.action = bpy.data.actions.new(id_block.name + "_cs3d")
    action = ad.action
    slot = ad.action_slot
    if slot is None:
        slot = action.slots.new(id_type=id_block.id_type, name=id_block.name)
        ad.action_slot = slot
    return anim_utils.action_ensure_channelbag_for_slot(action, slot)


def animate(id_block, path, keys, index=-1, back=1.4):
    """keys: [(frame, value, ease)] where `ease` shapes the segment that starts at that key.

    index=-1 with a tuple value animates every component.
    """
    cb = channelbag(id_block)
    first_value = keys[0][1]
    components = range(len(first_value)) if index == -1 and isinstance(first_value, (tuple, list)) else [index if index >= 0 else 0]
    for i in components:
        fc = cb.fcurves.ensure(path, index=i)
        for frame, value, ease in keys:
            v = value[i] if isinstance(value, (tuple, list)) else value
            kp = fc.keyframe_points.insert(frame, v, options={"FAST"})
            interp, easing = ease_mode(ease)
            kp.interpolation = interp
            kp.easing = easing
            if interp == "BACK":
                kp.back = back
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"
        fc.update()
    return cb


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))) if e1 != e0 else 1.0
    return t * t * (3 - 2 * t)


def deg(v):
    return math.radians(v)
