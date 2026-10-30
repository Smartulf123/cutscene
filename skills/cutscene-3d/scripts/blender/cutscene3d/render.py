# Cutscene 3D: render stills or the full PNG RGBA sequence, reporting per-frame timings.
# SPDX-License-Identifier: GPL-3.0-or-later
import os
import time

import bpy

from .util import emit

_state = {"t": None, "times": []}


def _pre(scene, *_):
    _state["t"] = time.perf_counter()


def _post(scene, *_):
    if _state["t"] is None:
        return
    dt = time.perf_counter() - _state["t"]
    _state["times"].append(dt)
    emit({"event": "frame", "frame": scene.frame_current, "seconds": round(dt, 3)})


def _install():
    for lst, fn in ((bpy.app.handlers.render_pre, _pre), (bpy.app.handlers.render_post, _post)):
        if fn not in lst:
            lst.append(fn)


def stills(out_dir, frames, scale=50):
    sc = bpy.context.scene
    sc.render.resolution_percentage = int(scale)
    os.makedirs(out_dir, exist_ok=True)
    _install()
    files = []
    for f in frames:
        f = max(sc.frame_start, min(sc.frame_end, int(f)))
        sc.frame_set(f)
        path = os.path.join(out_dir, f"still_{f:04d}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        files.append(path)
    return files, list(_state["times"])


def sequence(out_dir, scale=100, start=None, end=None):
    sc = bpy.context.scene
    sc.render.resolution_percentage = int(scale)
    os.makedirs(out_dir, exist_ok=True)
    if start:
        sc.frame_start = int(start)
    if end:
        sc.frame_end = int(end)
    sc.render.filepath = os.path.join(out_dir, "frame_####")
    _install()
    bpy.ops.render.render(animation=True)
    files = [os.path.join(out_dir, f"frame_{f:04d}.png") for f in range(sc.frame_start, sc.frame_end + 1)]
    return files, list(_state["times"])
