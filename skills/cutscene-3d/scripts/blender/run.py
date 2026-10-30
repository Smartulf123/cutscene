# Cutscene 3D entry point, run by Cutscene inside Blender (one fresh process per job):
#
#   blender -b --factory-startup --python-exit-code 1 -P run.py -- \
#       --spec resolved.json --mode stills|render|build --out <dir> [--frames 1,24,48] [--scale 50]
#       [--save scene.blend]
#
# The spec is the *resolved* spec written by scripts/3d.mjs: look.json colours merged in, the
# font path found, defaults filled. This script never reads user text as instructions: the
# title text is only ever used as geometry.
#
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
import importlib
import json
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from cutscene3d import render, scene  # noqa: E402
from cutscene3d.util import argv, emit, log  # noqa: E402

TEMPLATES = {
    "title3d": "cutscene3d.templates.title3d",
    "logo-svg": "cutscene3d.templates.logo_svg",
    "turntable": "cutscene3d.templates.turntable",
    "product-shot": "cutscene3d.templates.product_shot",
    "physics-drop": "cutscene3d.templates.physics_drop",
}


def main():
    ap = argparse.ArgumentParser(description="Cutscene 3D scene builder")
    ap.add_argument("--spec", required=True)
    ap.add_argument("--mode", choices=["stills", "render", "build"], default="stills")
    ap.add_argument("--out", required=False, default=None)
    ap.add_argument("--frames", default="")
    ap.add_argument("--scale", type=int, default=100)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--end", type=int, default=0)
    ap.add_argument("--save", default=None)
    args = ap.parse_args(argv())

    with open(args.spec, "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    template = spec.get("template")
    if template not in TEMPLATES:
        raise ValueError(f"Unknown template {template!r}. Choose one of: {', '.join(TEMPLATES)}")

    t0 = time.perf_counter()
    scene.reset()
    sc = scene.configure(spec)
    mod = importlib.import_module(TEMPLATES[template])
    info = mod.build(spec) or {}
    info.pop("subject", None)
    build_s = time.perf_counter() - t0
    emit({"event": "built", "template": template, "engine": sc.render.engine, "seconds": round(build_s, 3),
          "frames": sc.frame_end, "info": info})

    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save), copy=True)

    files, times = [], []
    if args.mode == "stills":
        frames = [int(x) for x in args.frames.split(",") if x.strip()] or [1, sc.frame_end // 2, sc.frame_end]
        files, times = render.stills(args.out, frames, args.scale)
    elif args.mode == "render":
        files, times = render.sequence(args.out, args.scale, args.start or None, args.end or None)
    emit({"event": "done", "ok": True, "mode": args.mode, "files": files, "engine": sc.render.engine,
          "build_seconds": round(build_s, 3), "frame_seconds": [round(t, 3) for t in times],
          "total_seconds": round(time.perf_counter() - t0, 3)})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # report plainly; the Node side turns this into an error envelope
        traceback.print_exc()
        emit({"event": "done", "ok": False, "error": f"{type(e).__name__}: {e}"})
        sys.exit(1)
