# Cutscene 3D template: logo-svg - an SVG logo, extruded and bevelled, with a reveal.
# SPDX-License-Identifier: GPL-3.0-or-later
import math

from mathutils import Vector

from .. import common, geometry
from ..util import animate


def build(spec):
    p = spec.get("params", {})
    face, sides = common.mats(spec, "face", "sides")
    width = float(p.get("width", 3.2))
    depth = float(p.get("depth", 0.22))
    logo, parts, (w, h) = geometry.svg_logo(
        p["svg"], depth=depth, bevel=float(p.get("bevel", 0.014)), bevel_res=int(p.get("bevel_segments", 4)),
        target_width=width, materials=(face, sides), keep_colors=bool(p.get("keep_svg_colors", False)))
    center = Vector((0.0, 0.0, h * 0.5))
    f = lambda t: common.seconds_to_frame(spec, t)
    total = float(spec["frames"]) / float(spec["fps"])
    kind = p.get("reveal", "spin")
    ease = p.get("reveal_ease", "back-out")
    start = float(p.get("reveal_start", 0.1))
    dur = min(float(p.get("reveal_duration", 1.1)), max(0.3, total * 0.65))

    if kind == "spin":
        animate(logo, "rotation_euler", [(f(start), (math.radians(90), 0.0, math.radians(-110)), ease),
                                          (f(start + dur), (math.radians(90), 0.0, 0.0), "linear")])
        animate(logo, "scale", [(f(start), (0.0, 0.0, 0.0), "expo-out"),
                                (f(start + dur * 0.5), (1.0, 1.0, 1.0), "linear")])
    elif kind in ("rise", "pop", "extrude"):
        n = max(1, len(parts))
        stagger = min(float(p.get("stagger", 0.08)), (total * 0.6 - start - dur) / max(1, n - 1)) if n > 1 else 0
        stagger = max(0.0, stagger)
        for i, part in enumerate(parts):
            t0 = start + i * stagger
            a, b = f(t0), f(t0 + dur)
            base = part.location.copy()
            if kind == "extrude":
                animate(part, "scale", [(a, (1.0, 1.0, 0.02), "expo-out"), (b, (1.0, 1.0, 1.0), "linear")])
                animate(part, "location", [(a, (base.x, base.y, base.z - depth * 2), "expo-out"),
                                           (b, tuple(base), "linear")])
            else:
                animate(part, "scale", [(a, (0.0, 0.0, 0.0), "expo-out"), (f(t0 + dur * 0.5), (1.0, 1.0, 1.0), "linear")])
                if kind == "rise":
                    animate(part, "location", [(a, (base.x, base.y - h * 0.35, base.z), ease), (b, tuple(base), "linear")])
                    animate(part, "rotation_euler", [(a, (math.radians(-60), 0.0, 0.0), ease), (b, (0.0, 0.0, 0.0), "linear")])
                else:
                    animate(part, "rotation_euler", [(a, (0.0, 0.0, math.radians(-15)), ease), (b, (0.0, 0.0, 0.0), "linear")])

    swing = float(p.get("swing", 10.0))
    if swing and kind != "spin":
        last = f(total * 0.92)
        animate(logo, "rotation_euler", [(1, (math.radians(90), 0.0, math.radians(-swing)), "quart-out"),
                                          (last, (math.radians(90), 0.0, 0.0), "linear")])
    st = common.stage(spec, center, w, h, depth, ground_z=0.0 if p.get("ground", False) else None)
    return {"subject": parts, "parts": len(parts), "size": [round(w, 3), round(h, 3)],
            "camera_distance": round(st["distance"], 3)}
