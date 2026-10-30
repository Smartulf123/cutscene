# Cutscene 3D template: physics-drop - the letters of a word drop one by one onto an invisible
# floor (rigid bodies), with seeded confetti shapes tumbling around them. The simulation is baked
# to keyframes, so any frame can be rendered on its own (stills first) and motion blur works.
# SPDX-License-Identifier: GPL-3.0-or-later
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from .. import common, geometry, materials
from ..util import link, log, seeded


def _rigid(ob, kind="ACTIVE", shape="CONVEX_HULL", mass=1.0, friction=0.7, bounce=0.2, margin=0.004):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob],
                                   selected_editable_objects=[ob]):
        bpy.ops.rigidbody.object_add(type=kind)
    rb = ob.rigid_body
    rb.collision_shape = shape
    rb.mass = mass
    rb.friction = friction
    rb.restitution = bounce
    rb.use_margin = True
    rb.collision_margin = margin
    rb.linear_damping = 0.08
    rb.angular_damping = 0.2
    return rb


def _upright(ob, floor, wobble_deg):
    empty = link(bpy.data.objects.new(f"{ob.name}_upright", None))
    empty.location = ob.matrix_world.translation
    with bpy.context.temp_override(object=empty, active_object=empty, selected_objects=[empty],
                                   selected_editable_objects=[empty]):
        bpy.ops.rigidbody.constraint_add(type="GENERIC")
    c = empty.rigid_body_constraint
    c.object1 = floor
    c.object2 = ob
    c.disable_collisions = False  # the letter must still land on the floor
    lim = math.radians(wobble_deg)
    c.use_limit_ang_x = True
    c.limit_ang_x_lower, c.limit_ang_x_upper = -lim, lim
    c.use_limit_ang_y = True
    c.limit_ang_y_lower, c.limit_ang_y_upper = -lim, lim
    c.use_limit_ang_z = True
    c.limit_ang_z_lower, c.limit_ang_z_upper = -lim * 2, lim * 2
    return empty


def _shape(kind, size, rng):
    bm = bmesh.new()
    if kind == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=size * 0.5)
    elif kind == "cube":
        bmesh.ops.create_cube(bm, size=size * 0.8)
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=size * 0.12, segments=3, affect="EDGES",
                        profile=0.5)
    elif kind == "ring":
        r_major, r_minor = size * 0.42, size * 0.13
        segs, rings = 40, 14
        verts = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            row = []
            for j in range(rings):
                b = 2 * math.pi * j / rings
                x = (r_major + r_minor * math.cos(b)) * math.cos(a)
                y = (r_major + r_minor * math.cos(b)) * math.sin(a)
                z = r_minor * math.sin(b)
                row.append(bm.verts.new((x, y, z)))
            verts.append(row)
        for i in range(segs):
            for j in range(rings):
                bm.faces.new((verts[i][j], verts[(i + 1) % segs][j], verts[(i + 1) % segs][(j + 1) % rings],
                              verts[i][(j + 1) % rings]))
    else:  # capsule-ish pill
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=size * 0.32)
        for v in bm.verts:
            v.co.x *= 1.9
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(f"CS3D_{kind}")
    bm.to_mesh(me)
    bm.free()
    return me


def build(spec):
    p = spec.get("params", {})
    sc = bpy.context.scene
    rng = seeded(spec.get("seed", 0))
    fps = float(spec["fps"])
    frames = int(spec["frames"])
    face, sides = common.mats(spec, "face", "sides")
    size = float(p.get("size", 1.0))
    word, letters, (w, h) = geometry.text_letters(
        p.get("text", "DROP"), spec.get("font"), size=size, depth=float(p.get("depth", 0.45)) * size,
        bevel=float(p.get("bevel", 0.028)) * size, tracking=float(p.get("tracking", 0.03)), materials=(face, sides))
    bpy.context.view_layer.update()

    # Rigid bodies can't be parented: bake the word's stand-up rotation into each letter.
    for ob in letters:
        mw = ob.matrix_world.copy()
        ob.parent = None
        ob.matrix_world = mw
    bpy.data.objects.remove(word, do_unlink=True)

    with bpy.context.temp_override(scene=sc):
        if sc.rigidbody_world is None:
            bpy.ops.rigidbody.world_add()
    rbw = sc.rigidbody_world
    rbw.substeps_per_frame = 12
    rbw.solver_iterations = 20
    rbw.point_cache.frame_start = 1
    rbw.point_cache.frame_end = frames
    rbw.time_scale = float(p.get("time_scale", 1.0))
    if rbw.collection is None:
        rbw.collection = bpy.data.collections.new("CS3D_RigidBodies")

    # Floor collider (invisible to the camera: the shadow catcher is added by common.stage).
    floor_me = bpy.data.meshes.new("CS3D_Floor")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(floor_me)
    bm.free()
    floor = link(bpy.data.objects.new("CS3D_Floor", floor_me))
    floor.scale = (60, 60, 1)
    floor.location = (0, 0, -0.5)
    floor.hide_render = True
    _rigid(floor, "PASSIVE", "BOX", friction=0.9, bounce=0.25)

    # Letters wait above the frame until released, so nothing pops in.
    drop = float(p.get("drop_height", 3.2)) * size
    stagger = float(p.get("stagger", 0.11))
    start = float(p.get("start", 0.05))
    total = frames / fps
    stagger = min(stagger, max(0.0, total * 0.45 - start) / max(1, len(letters) - 1))
    for i, ob in enumerate(letters):
        ob.location.z += drop
        _rigid(ob, "ACTIVE", "CONVEX_HULL", mass=6.0, friction=1.0, bounce=float(p.get("bounce", 0.12)))
        # Letters must land standing: heavy, damped spin, barely bouncy.
        ob.rigid_body.angular_damping = 0.85
        # hold each letter still until its turn (kinematic), then let gravity take it
        t_release = start + i * stagger
        f_rel = max(1, int(round(t_release * fps)) + 1)
        ob.rigid_body.kinematic = True
        ob.rigid_body.keyframe_insert("kinematic", frame=1)
        ob.rigid_body.keyframe_insert("kinematic", frame=f_rel)
        ob.rigid_body.kinematic = False
        ob.rigid_body.keyframe_insert("kinematic", frame=f_rel + 1)
        if p.get("upright", True):
            # Keep letters readable: a generic constraint to the floor allows falling, bouncing,
            # sliding and a little wobble, but no toppling.
            _upright(ob, floor, float(p.get("wobble", 6.0)))
    last_release = start + max(0, len(letters) - 1) * stagger

    pal = spec.get("palette", {})
    colors = [c for c in (pal.get("accent"), pal.get("accent2"), pal.get("fg")) if c] or ["#FFFFFF"]
    conf_mats = [materials.make(f"CS3D_conf{i}", {"preset": p.get("confetti_material", "glossy"), "color": c})
                 for i, c in enumerate(colors)]
    shapes = p.get("confetti_shapes", ["sphere", "cube", "ring", "pill"])
    confetti = []
    for i in range(int(p.get("confetti", 18))):
        kind = shapes[i % len(shapes)]
        csize = size * rng.uniform(0.16, 0.3)
        ob = link(bpy.data.objects.new(f"CS3D_confetti_{i:02d}", _shape(kind, csize, rng)))
        ob.data.materials.append(conf_mats[i % len(conf_mats)])
        ob.location = (rng.uniform(-w * 0.62, w * 0.62), rng.uniform(-0.9, 0.9) * size,
                       drop + size * (1.6 + i * 0.35) + rng.uniform(0, 0.3))
        ob.rotation_euler = (rng.uniform(0, 6.28), rng.uniform(0, 6.28), rng.uniform(0, 6.28))
        shape = "SPHERE" if kind == "sphere" else "CONVEX_HULL"
        _rigid(ob, "ACTIVE", shape, mass=0.3, friction=0.6, bounce=0.45)
        # Confetti waits (kinematic, above the frame) until the last letter is on its way down.
        f_go = int(round((last_release + 0.12 + rng.uniform(0, 0.5)) * fps)) + 1
        ob.rigid_body.kinematic = True
        ob.rigid_body.keyframe_insert("kinematic", frame=1)
        ob.rigid_body.keyframe_insert("kinematic", frame=f_go)
        ob.rigid_body.kinematic = False
        ob.rigid_body.keyframe_insert("kinematic", frame=f_go + 1)
        confetti.append(ob)

    # Bake: step every frame in order, record transforms, then replace the sim with keyframes.
    movers = letters + confetti
    track = {ob.name: [] for ob in movers}
    for f in range(1, frames + 1):
        sc.frame_set(f)
        for ob in movers:
            track[ob.name].append(ob.matrix_world.copy())
    for ob in [o for o in bpy.data.objects if o.rigid_body_constraint]:
        bpy.data.objects.remove(ob, do_unlink=True)
    for ob in movers + [floor]:
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.rigidbody.object_remove()
    with bpy.context.temp_override(scene=sc):
        bpy.ops.rigidbody.world_remove()
    for ob in movers:
        if ob.animation_data:
            ob.animation_data_clear()
        ob.rotation_mode = "QUATERNION"
        for f, m in enumerate(track[ob.name], start=1):
            loc, rot, scl = m.decompose()
            ob.location, ob.rotation_quaternion, ob.scale = loc, rot, scl
            ob.keyframe_insert("location", frame=f)
            ob.keyframe_insert("rotation_quaternion", frame=f)
            ob.keyframe_insert("scale", frame=f)
        ad = ob.animation_data
        if ad and ad.action:
            from ..util import channelbag
            for fc in channelbag(ob).fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"

    settle = [m.to_translation().z for ms in track.values() for m in ms[-1:]]
    center = (0.0, 0.0, h * 0.55)
    st = common.stage(spec, center, w * 1.25, h * 1.6, size, ground_z=0.0)
    return {"subject": movers, "letters": len(letters), "confetti": len(confetti),
            "min_z": round(min(settle), 4) if settle else 0, "camera_distance": round(st["distance"], 3)}
