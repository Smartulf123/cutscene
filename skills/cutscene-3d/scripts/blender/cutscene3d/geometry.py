# Cutscene 3D: geometry builders (extruded text, SVG logos, imported models, a built-in can).
# SPDX-License-Identifier: GPL-3.0-or-later
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from .util import link, log, new_empty


# ---------------------------------------------------------------- text

def load_font(path):
    if path and os.path.isfile(path):
        try:
            return bpy.data.fonts.load(path, check_existing=True)
        except RuntimeError as e:
            log(f"font {path} could not be loaded ({e}); using Blender's built-in font")
    return bpy.data.fonts.load("<builtin>", check_existing=True)


def _font_curve(body, font, size, tracking):
    cu = bpy.data.curves.new("CS3D_TextTmp", "FONT")
    cu.body = body
    cu.font = font
    cu.size = size
    cu.space_character = 1.0 + tracking
    cu.align_x = "CENTER"
    cu.align_y = "BOTTOM_BASELINE"
    ob = bpy.data.objects.new("CS3D_TextTmp", cu)
    link(ob)
    return ob


def _splines_of(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    cu = ev.to_curve(dg, apply_modifiers=False)
    data = []
    for s in cu.splines:
        pts = [(p.co.copy(), p.handle_left.copy(), p.handle_right.copy(), p.handle_left_type, p.handle_right_type)
               for p in s.bezier_points]
        data.append((pts, s.use_cyclic_u))
    ev.to_curve_clear()
    return data


def _remove(ob):
    data = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    if data is not None and data.users == 0:
        if isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)
        elif isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)


def _curve_from_splines(name, splines, depth, bevel, bevel_res):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = depth / 2.0
    cu.bevel_depth = bevel
    cu.bevel_resolution = bevel_res
    cu.resolution_u = 14
    for pts, cyclic in splines:
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(len(pts) - 1)
        for bp, (co, hl, hr, tl, tr) in zip(sp.bezier_points, pts):
            bp.co = co
            bp.handle_left_type = tl
            bp.handle_right_type = tr
            bp.handle_left = hl
            bp.handle_right = hr
        sp.use_cyclic_u = cyclic
    return cu


def curve_to_mesh(ob, front_index=0, side_index=1, sharp_deg=32.0):
    """Evaluate a curve object to a mesh and split materials: caps (front/back) vs. sides + bevel."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    for poly in me.polygons:
        poly.material_index = front_index if abs(poly.normal.z) > 0.985 else side_index
        poly.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    me.update()
    return me


def text_letters(text, font_path, size=1.0, depth=0.28, bevel=0.022, bevel_res=4, tracking=0.02,
                 materials=(), name="CS3D_Word", as_mesh=True):
    """Extruded, bevelled letters, one object per glyph, standing on the XZ plane facing -Y.

    Each letter pivots at its own baseline centre, so it can flip, pop or fall on its own beat.
    Returns (parent_empty, [letter objects], (width, height)).
    """
    font = load_font(font_path)
    text = text or " "
    full = _font_curve(text, font, size, tracking)
    all_splines = _splines_of(full)
    _remove(full)

    counts = []
    for ch in text:
        if ch.isspace():
            counts.append(0)
            continue
        tmp = _font_curve(ch, font, size, tracking)
        counts.append(len(_splines_of(tmp)))
        _remove(tmp)
    if sum(counts) != len(all_splines):
        log(f"glyph split mismatch ({sum(counts)} vs {len(all_splines)}): keeping the word as one piece")
        counts = [len(all_splines)]
        chars = [text]
    else:
        chars = list(text)

    parent = new_empty(name)
    parent.rotation_euler = (math.radians(90), 0, 0)
    letters = []
    cursor = 0
    for ch, n in zip(chars, counts):
        group = all_splines[cursor:cursor + n]
        cursor += n
        if n == 0:
            continue
        xs = [co.x for pts, _ in group for co, *_ in pts]
        px = (min(xs) + max(xs)) / 2
        # move this glyph so its pivot (baseline centre) is the origin
        shifted = [([(co - Vector((px, 0, 0)), hl - Vector((px, 0, 0)), hr - Vector((px, 0, 0)), tl, tr)
                     for co, hl, hr, tl, tr in pts], cyc) for pts, cyc in group]
        cu = _curve_from_splines(f"{name}_{ch}", shifted, depth, bevel, bevel_res)
        ob = bpy.data.objects.new(f"{name}_{len(letters):02d}_{ch}", cu)
        link(ob)
        if as_mesh:
            me = curve_to_mesh(ob)
            _remove(ob)
            ob = bpy.data.objects.new(f"{name}_{len(letters):02d}_{ch}", me)
            link(ob)
        for m in materials:
            ob.data.materials.append(m)
        ob.parent = parent
        ob.location = (px, 0, 0)
        ob["cs3d_char"] = ch
        letters.append(ob)

    bpy.context.view_layer.update()
    w, h = word_size(letters)
    return parent, letters, (w, h)


def word_size(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in objs:
        for corner in ob.bound_box:
            p = ob.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return (hi.x - lo.x), (hi.z - lo.z)


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    found = False
    for ob in objs:
        if ob.type not in {"MESH", "CURVE", "FONT", "SURFACE", "META"}:
            continue
        found = True
        for corner in ob.bound_box:
            p = ob.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    if not found:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    return lo, hi


# ---------------------------------------------------------------- SVG logo

def svg_logo(path, depth=0.18, bevel=0.012, bevel_res=4, target_width=3.2, materials=(), keep_colors=False):
    """Import an SVG, extrude and bevel every path, scale it to `target_width`, stand it up.

    Returns (parent, parts, (w, h)). Parts are sorted left to right so reveals read naturally.
    """
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=path)
    curves = [ob for ob in bpy.data.objects if ob not in before and ob.type == "CURVE"]
    if not curves:
        raise RuntimeError(f"No shapes found in {path}. Use an SVG with filled paths (not just strokes or text).")
    bpy.context.view_layer.update()
    lo, hi = world_bounds(curves)
    w = max(1e-6, hi.x - lo.x)
    h = max(1e-6, hi.y - lo.y)
    s = target_width / w if w >= h else (target_width * 0.62) / h
    cx, cy = (lo.x + hi.x) / 2, lo.y
    parent = new_empty("CS3D_Logo")
    parent.rotation_euler = (math.radians(90), 0, 0)
    parts = []
    for i, ob in enumerate(sorted(curves, key=lambda o: (o.matrix_world @ Vector(o.bound_box[0])).x)):
        svg_mat = ob.data.materials[0] if ob.data.materials else None
        # Extrude/bevel in the curve's own (tiny SVG) units, then bake the fit transform into the mesh.
        fit = Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, 0)) @ ob.matrix_world
        k = max(1e-9, ob.matrix_world.to_scale().x * s)
        cu = ob.data
        cu.dimensions = "2D"
        cu.fill_mode = "BOTH"
        cu.extrude = depth / 2.0 / k
        cu.bevel_depth = bevel / k
        cu.bevel_resolution = bevel_res
        cu.resolution_u = 16
        bpy.context.view_layer.update()
        me = curve_to_mesh(ob)
        me.transform(fit)
        me.update()
        # SVG z-order: later paths sit slightly in front, so overlapping fills don't z-fight.
        name = f"CS3D_Logo_{i:02d}"
        _remove(ob)
        part = bpy.data.objects.new(name, me)
        link(part)
        me.materials.clear()
        if keep_colors and svg_mat is not None:
            me.materials.append(svg_mat)
            me.materials.append(svg_mat)
        else:
            for m in materials:
                me.materials.append(m)
        # pivot each part at its own centre
        bpy.context.view_layer.update()
        plo, phi = world_bounds([part])
        pc = (plo + phi) / 2
        me.transform(Matrix.Translation(-pc))
        part.parent = parent
        part.location = (pc.x, pc.y, pc.z + i * 0.0008)
        parts.append(part)
    bpy.context.view_layer.update()
    w2, h2 = word_size(parts)
    return parent, parts, (w2, h2)


# ---------------------------------------------------------------- models

IMPORTERS = {
    ".glb": lambda p: bpy.ops.import_scene.gltf(filepath=p),
    ".gltf": lambda p: bpy.ops.import_scene.gltf(filepath=p),
    ".obj": lambda p: bpy.ops.wm.obj_import(filepath=p),
    ".fbx": lambda p: bpy.ops.import_scene.fbx(filepath=p),
    ".stl": lambda p: bpy.ops.wm.stl_import(filepath=p),
    ".ply": lambda p: bpy.ops.wm.ply_import(filepath=p),
}


def import_model(path, height=2.0, max_width=2.6):
    """Import a model, wrap it in a pivot, scale to `height` (or `max_width`), stand it on z=0."""
    ext = os.path.splitext(path)[1].lower()
    if ext not in IMPORTERS:
        raise RuntimeError(f"Cutscene can't import {ext} models. Use .glb, .gltf, .obj, .fbx, .stl or .ply.")
    before = set(bpy.data.objects)
    IMPORTERS[ext](path)
    new = [ob for ob in bpy.data.objects if ob not in before]
    roots = [ob for ob in new if ob.parent is None or ob.parent not in new]
    bpy.context.view_layer.update()
    lo, hi = world_bounds(new)
    size = hi - lo
    if size.length < 1e-9:
        raise RuntimeError(f"{os.path.basename(path)} has no visible geometry.")
    s = min(height / max(size.z, 1e-6), max_width / max(size.x, size.y, 1e-6))
    pivot = new_empty("CS3D_Model")
    holder = new_empty("CS3D_ModelFit")
    holder.parent = pivot
    holder.scale = (s, s, s)
    holder.location = (-(lo.x + hi.x) / 2 * s, -(lo.y + hi.y) / 2 * s, -lo.z * s)
    for ob in roots:
        mw = ob.matrix_world.copy()
        ob.parent = holder
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.matrix_basis = mw
    bpy.context.view_layer.update()
    meshes = [ob for ob in new if ob.type == "MESH"]
    return pivot, new, meshes


def builtin_can(label_mat, metal_mat, radius=0.66, height=2.3):
    """A drink can turned from a profile (bmesh spin): domed base, wall, neck, rolled lip."""
    profile = [(0.0, 0.10), (0.46, 0.06), (0.60, 0.0), (0.66, 0.06), (0.67, 0.16), (0.67, 0.40),
               (0.67, 1.95), (0.67, 2.02), (0.63, 2.14), (0.56, 2.24), (0.555, 2.29), (0.575, 2.31),
               (0.56, 2.33), (0.50, 2.30), (0.0, 2.27)]
    k = radius / 0.67
    bm = bmesh.new()
    verts = [bm.verts.new((x * k, 0.0, z * (height / 2.33))) for x, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.radians(360), steps=96,
                   use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # label band = faces on the straight wall
    lo_z, hi_z = 0.42 * (height / 2.33), 1.93 * (height / 2.33)
    for f in bm.faces:
        c = f.calc_center_median()
        f.material_index = 1 if lo_z < c.z < hi_z and math.hypot(c.x, c.y) > radius * 0.97 else 0
        f.smooth = True
    me = bpy.data.meshes.new("CS3D_Can")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(metal_mat)
    me.materials.append(label_mat)
    me.set_sharp_from_angle(angle=math.radians(40))
    # UVs for the label: cylindrical
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            u = (math.atan2(v.y, v.x) / (2 * math.pi)) % 1.0
            uv.data[li].uv = (u, (v.z - lo_z) / (hi_z - lo_z))
    ob = bpy.data.objects.new("CS3D_Can", me)
    link(ob)
    return ob
