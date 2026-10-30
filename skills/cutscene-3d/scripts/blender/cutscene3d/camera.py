# Cutscene 3D: camera rig with eased moves and depth of field.
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Rig: a pivot empty at the subject's centre, the camera a child of it at local (0, -dist, 0).
# Moves animate the pivot's rotation (azimuth/elevation) and the camera's distance, so arcs stay
# on a circle instead of cutting through the subject.
import math

import bpy
from mathutils import Vector

from .util import animate, link, new_empty

MOVES = {
    # name: (az0, az1, el0, el1, dist0, dist1) in degrees / multiples of the framing distance
    "static": (0, 0, 6, 6, 1.0, 1.0),
    "push-in": (-16, -12, 10, 9, 1.22, 1.0),
    "pull-out": (0, 0, 5, 7, 0.92, 1.12),
    "arc": (-30, -10, 14, 8, 1.16, 1.0),
    "arc-right": (26, 7, 13, 7, 1.16, 1.0),
    "orbit": (-35, 35, 8, 8, 1.05, 1.05),
    "crane": (0, 0, 28, 6, 1.1, 1.0),
    "dolly-left": (-10, 10, 6, 6, 1.0, 1.0),
    "hero": (-18, -9, 4, 10, 1.12, 0.98),
    "turntable": (0, 0, 14, 14, 1.0, 1.0),
}


def framing_distance(width, height, lens, aspect, margin=1.18, sensor=36.0):
    """Distance at which a box `width` x `height` fits the frame with `margin`."""
    if aspect >= 1.0:
        hfov = 2 * math.atan(sensor / 2 / lens)
        vfov = 2 * math.atan(math.tan(hfov / 2) / aspect)
    else:
        vfov = 2 * math.atan(sensor / 2 / lens)
        hfov = 2 * math.atan(math.tan(vfov / 2) * aspect)
    dw = (width / 2) / math.tan(hfov / 2)
    dh = (height / 2) / math.tan(vfov / 2)
    return max(dw, dh) * margin


def build(spec, center, size_w, size_h, depth=0.0):
    """Create the camera rig. Returns (camera_object, pivot, target)."""
    sc = bpy.context.scene
    cfg = spec.get("camera", {})
    lens = float(cfg.get("lens", 50))
    aspect = spec["width"] / spec["height"]
    dist = framing_distance(size_w, size_h, lens, aspect, float(cfg.get("margin", 1.42))) + depth / 2

    target = new_empty("CS3D_Target", tuple(center))
    pivot = new_empty("CS3D_Pivot", tuple(center))
    pivot.rotation_mode = "XYZ"

    cam_data = bpy.data.cameras.new("CS3D_Camera")
    cam_data.lens = lens
    cam_data.sensor_width = 36.0
    cam_data.sensor_fit = "AUTO"
    cam_data.clip_start = max(0.01, dist * 0.02)
    cam_data.clip_end = dist * 20 + 50
    cam = bpy.data.objects.new("CS3D_Camera", cam_data)
    link(cam)
    cam.parent = pivot
    cam.location = (0, -dist, 0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam

    dof = cfg.get("dof") or {}
    if dof.get("enabled", True) and float(dof.get("fstop", 0) or 0) > 0:
        cam_data.dof.use_dof = True
        cam_data.dof.focus_object = target
        cam_data.dof.aperture_fstop = float(dof["fstop"])
        cam_data.dof.aperture_blades = 7
        cam_data.dof.aperture_rotation = math.radians(12)

    move = cfg.get("move", "arc")
    az0, az1, el0, el1, d0, d1 = MOVES.get(move, MOVES["arc"])
    # Overrides from the spec (degrees / distance multipliers).
    az0 = float(cfg.get("azimuth_start", az0))
    az1 = float(cfg.get("azimuth_end", az1))
    el0 = float(cfg.get("elevation_start", el0))
    el1 = float(cfg.get("elevation_end", el1))
    d0 = float(cfg.get("distance_start", d0))
    d1 = float(cfg.get("distance_end", d1))

    frames = int(spec["frames"])
    f0 = 1
    f1 = max(2, int(round(frames * float(cfg.get("move_end", 0.85)))))
    ease = cfg.get("ease", "expo-out")
    if move == "turntable" or move == "static":
        pivot.rotation_euler = (math.radians(-el0), 0, math.radians(az0))
        cam.location = (0, -dist * d0, 0)
    else:
        animate(pivot, "rotation_euler", [
            (f0, (math.radians(-el0), 0.0, math.radians(az0)), ease),
            (f1, (math.radians(-el1), 0.0, math.radians(az1)), ease),
        ])
        animate(cam, "location", [
            (f0, (0.0, -dist * d0, 0.0), ease),
            (f1, (0.0, -dist * d1, 0.0), ease),
        ])
    drift = float(cfg.get("drift", 0.0))
    if drift > 0:
        _add_drift(pivot, drift, int(spec.get("seed", 0)))
    return cam, pivot, target, dist


def _add_drift(pivot, amount, seed):
    """A barely-there handheld float: noise modifiers on the pivot's rotation, seeded."""
    from .util import channelbag
    cb = channelbag(pivot)
    for i, scale in ((0, 70.0), (2, 90.0)):
        fc = cb.fcurves.ensure("rotation_euler", index=i)
        if len(fc.keyframe_points) == 0:
            fc.keyframe_points.insert(1, pivot.rotation_euler[i])
        mod = fc.modifiers.new("NOISE")
        mod.scale = scale
        mod.strength = math.radians(amount)
        mod.phase = (seed % 997) * 0.37 + i * 11.0
        mod.depth = 0
