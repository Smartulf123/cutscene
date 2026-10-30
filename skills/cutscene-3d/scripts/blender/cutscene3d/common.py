# Cutscene 3D: pieces every template shares (materials from the spec, rig, world, ground).
# SPDX-License-Identifier: GPL-3.0-or-later
import math

import bpy

from mathutils import Vector

from . import camera, lighting, materials


def mats(spec, *keys):
    """Materials named in spec['params'][key] (already resolved to hex colours by Node)."""
    p = spec.get("params", {})
    out = []
    for k in keys:
        out.append(materials.make(f"CS3D_{k}", p.get(k) or {"preset": "glossy", "color": spec["palette"].get("fg")}))
    return out


def light_colors(spec):
    pal = spec.get("palette", {})
    lt = spec.get("lighting", {})
    return {
        "key": lt.get("key_color", "#FFF4E8"),
        "fill": lt.get("fill_color", "#E4ECFF"),
        "rim": lt.get("rim_color") or pal.get("accent") or "#FFFFFF",
        "rim2": lt.get("rim2_color") or pal.get("accent2") or pal.get("accent") or "#FFFFFF",
    }


def stage(spec, center, width, height, depth=0.0, ground_z=None, contact=None):
    """Camera, lights, world and (optionally) the shadow-catcher floor around a subject."""
    lt = spec.get("lighting", {})
    cam, pivot, target, dist = camera.build(spec, center, width, height, depth)
    radius = max(width, height, depth, 0.5) * 0.5
    lights = lighting.add_rig(lt.get("rig", "studio"), Vector(center), max(radius, dist * 0.22),
                              colors=light_colors(spec), intensity=float(lt.get("intensity", 1.0)))
    lighting.world(spec, strength=float(lt.get("world", 0.8)), hdri=lt.get("hdri"),
                   bg_color=spec.get("palette", {}).get("bg"))
    ground = None
    if ground_z is not None and spec.get("params", {}).get("ground", True):
        ground = lighting.ground(z=ground_z, size=max(40.0, dist * 6), engine=spec.get("engine"),
                                 strength=float(spec.get("params", {}).get("shadow", 0.6)),
                                 center=(center[0], center[1]), fade_radius=max(width, depth, 0.5) * 1.1,
                                 contact=contact)
        # 'No shadow' = the unshadowed floor brightness next to the subject, from the actual rig.
        probe = Vector((center[0] + max(width, depth, 0.5) * 0.6, center[1], ground_z))
        bpy.context.view_layer.update()  # light matrices must be current
        # x1.25: measured against real EEVEE renders of a white floor on this rig (2026-10-29)
        ref = 1.25 * lighting.floor_brightness(lights, probe, float(lt.get("world", 0.8)))
        materials.set_catcher_reference(ground.data.materials[0], ref)
        bpy.context.scene["cs3d_catcher_ref"] = ref
    return {"camera": cam, "pivot": pivot, "target": target, "distance": dist, "lights": lights, "ground": ground}


def seconds_to_frame(spec, t):
    return 1 + int(round(float(t) * float(spec["fps"])))
