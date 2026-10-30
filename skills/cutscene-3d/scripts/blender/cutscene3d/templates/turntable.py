# Cutscene 3D template: turntable - a model (glTF/OBJ/FBX/STL/PLY) on a seamless spin, studio lit.
# SPDX-License-Identifier: GPL-3.0-or-later
import math

from mathutils import Vector

from .. import common, geometry, materials
from ..util import animate, new_empty


def subject(spec):
    """The user's model, normalised to ~2 m tall and standing on z=0, or the built-in can."""
    p = spec.get("params", {})
    model = p.get("model")
    height = float(p.get("height", 2.0))
    if model:
        pivot, objs, meshes = geometry.import_model(model, height=height, max_width=float(p.get("max_width", 2.6)))
        override = p.get("material_override")
        if override:
            mat = materials.make("CS3D_override", override)
            for ob in meshes:
                ob.data.materials.clear()
                ob.data.materials.append(mat)
        lo, hi = geometry.world_bounds(meshes)
        return pivot, lo, hi
    label = materials.make("CS3D_label", p.get("label") or {"preset": "glossy", "color": spec["palette"].get("accent")})
    metal = materials.make("CS3D_metal", p.get("body") or {"preset": "metal", "color": "#D5D9E0", "roughness": 0.2})
    can = geometry.builtin_can(label, metal, height=height)
    pivot = new_empty("CS3D_Model")
    can.parent = pivot
    lo, hi = geometry.world_bounds([can])
    return pivot, lo, hi


def build(spec):
    p = spec.get("params", {})
    pivot, lo, hi = subject(spec)
    size = hi - lo
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2))
    turns = float(p.get("turns", 1))
    frames = int(spec["frames"])
    start_deg = float(p.get("start_angle", -30))
    # Seamless loop: frame N+1 would equal frame 1, so the last frame stops one step short.
    animate(pivot, "rotation_euler", [
        (1, (0.0, 0.0, math.radians(start_deg)), "linear"),
        (frames + 1, (0.0, 0.0, math.radians(start_deg + 360.0 * turns)), "linear"),
    ])
    w = max(size.x, size.y) * 1.05
    contact = (max(size.x, size.y) * 0.5, max(size.x, size.y) * 0.5, float(p.get("contact_shadow", 0.55)))
    st = common.stage(spec, center, w, size.z, max(size.x, size.y), ground_z=lo.z, contact=contact)
    return {"subject": [pivot], "size": [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
            "camera_distance": round(st["distance"], 3), "turns": turns}
