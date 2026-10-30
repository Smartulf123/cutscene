# Cutscene 3D template: product-shot - hero lighting (top key, twin strip rims), shallow depth
# of field, a slow camera glide and a gentle product turn. Reflections come from the studio world.
# SPDX-License-Identifier: GPL-3.0-or-later
import math

from mathutils import Vector

from .. import common
from ..util import animate
from .turntable import subject


def build(spec):
    p = spec.get("params", {})
    pivot, lo, hi = subject(spec)
    size = hi - lo
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + size.z * 0.5))
    frames = int(spec["frames"])
    turn = float(p.get("turn", 35.0))
    start = float(p.get("start_angle", -20.0))
    animate(pivot, "rotation_euler", [
        (1, (0.0, 0.0, math.radians(start)), "sine-inout"),
        (frames, (0.0, 0.0, math.radians(start + turn)), "linear"),
    ])
    w = max(size.x, size.y) * 1.05
    contact = (max(size.x, size.y) * 0.5, max(size.x, size.y) * 0.5, float(p.get("contact_shadow", 0.55)))
    st = common.stage(spec, center, w, size.z, max(size.x, size.y), ground_z=lo.z, contact=contact)
    return {"subject": [pivot], "size": [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
            "camera_distance": round(st["distance"], 3)}
