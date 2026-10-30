# Cutscene 3D template: title3d - extruded, bevelled text with a per-letter reveal and a camera arc.
# SPDX-License-Identifier: GPL-3.0-or-later
import math

from mathutils import Vector

from .. import common, geometry
from ..util import animate


def reveal(letters, spec, kind, start_s, stagger_s, dur_s, ease):
    f = lambda t: common.seconds_to_frame(spec, t)
    n = max(1, len(letters))
    total = float(spec["frames"]) / float(spec["fps"])
    # Reveals always finish by ~70 % of the clip, leaving a readable hold.
    budget = max(0.3, total * 0.7 - start_s - dur_s)
    stagger_s = min(stagger_s, budget / max(1, n - 1)) if n > 1 else 0.0
    for i, ob in enumerate(letters):
        t0 = start_s + i * stagger_s
        a, b = f(t0), f(t0 + dur_s)
        grow = f(t0 + dur_s * 0.45)
        base = ob.location.copy()
        if kind == "none":
            continue
        animate(ob, "scale", [(a, (0.0, 0.0, 0.0), "expo-out"), (max(a + 1, grow), (1.0, 1.0, 1.0), "linear")])
        if kind == "flip":
            animate(ob, "rotation_euler", [(a, (math.radians(-95), 0.0, 0.0), ease), (b, (0.0, 0.0, 0.0), "linear")])
            animate(ob, "location", [(a, (base.x, base.y - 0.18, base.z), ease), (b, tuple(base), "linear")])
        elif kind == "rise":
            animate(ob, "location", [(a, (base.x, base.y - 0.55, base.z), ease), (b, tuple(base), "linear")])
            animate(ob, "rotation_euler", [(a, (math.radians(-28), 0.0, 0.0), ease), (b, (0.0, 0.0, 0.0), "linear")])
        elif kind == "slide":
            animate(ob, "location", [(a, (base.x + 0.9, base.y, base.z - 0.4), ease), (b, tuple(base), "linear")])
            animate(ob, "rotation_euler", [(a, (0.0, math.radians(-70), 0.0), ease), (b, (0.0, 0.0, 0.0), "linear")])
        elif kind == "pop":
            animate(ob, "rotation_euler", [(a, (0.0, 0.0, math.radians(-12)), ease), (b, (0.0, 0.0, 0.0), "linear")])


def build(spec):
    p = spec.get("params", {})
    face, sides = common.mats(spec, "face", "sides")
    size = float(p.get("size", 1.0))
    word, letters, (w, h) = geometry.text_letters(
        p.get("text", "CUTSCENE"), spec.get("font"), size=size,
        depth=float(p.get("depth", 0.3)) * size, bevel=float(p.get("bevel", 0.024)) * size,
        bevel_res=int(p.get("bevel_segments", 4)), tracking=float(p.get("tracking", 0.02)),
        materials=(face, sides))
    cap = h
    center = Vector((0.0, 0.0, cap * 0.5))

    reveal(letters, spec, p.get("reveal", "flip"), float(p.get("reveal_start", 0.1)),
           float(p.get("stagger", 0.07)), float(p.get("letter_duration", 0.8)), p.get("reveal_ease", "back-out"))

    swing = float(p.get("swing", 12.0))
    if swing:
        last = common.seconds_to_frame(spec, float(spec["frames"]) / float(spec["fps"]) * 0.92)
        animate(word, "rotation_euler", [(1, (math.radians(90), 0.0, math.radians(-swing)), "quart-out"),
                                          (last, (math.radians(90), 0.0, 0.0), "linear")])
    depth = float(p.get("depth", 0.3)) * size
    st = common.stage(spec, center, w, h, depth, ground_z=0.0 if p.get("ground", False) else None)
    return {"subject": letters, "size": [round(w, 3), round(h, 3)], "letters": len(letters),
            "camera_distance": round(st["distance"], 3)}
