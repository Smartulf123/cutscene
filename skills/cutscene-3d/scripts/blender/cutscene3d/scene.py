# Cutscene 3D: scene reset and render settings.
# SPDX-License-Identifier: GPL-3.0-or-later
import bpy

from .util import log, set_enum

QUALITY = {
    # samples per pixel; draft is what stills use
    # EEVEE on integrated graphics: 64 samples cost 2.3x the time of 32 for no visible gain
    # in motion (measured 8.3 s vs 3.6 s per 1080p frame on the reference PC).
    "draft": {"eevee": 16, "cycles": 24, "cycles_threshold": 0.08},
    "final": {"eevee": 32, "cycles": 64, "cycles_threshold": 0.03},
}


def reset():
    """--factory-startup still gives a cube, light and camera: remove every object and orphan."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.curves):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def configure(spec):
    sc = bpy.context.scene
    r = sc.render
    engine = spec.get("engine", "BLENDER_EEVEE")
    if not set_enum(r, "engine", engine):
        log(f"engine {engine} unavailable, using BLENDER_EEVEE")
        set_enum(r, "engine", "BLENDER_EEVEE")
    r.resolution_x = int(spec["width"])
    r.resolution_y = int(spec["height"])
    r.resolution_percentage = 100
    r.fps = int(spec["fps"])
    r.fps_base = 1.0
    sc.frame_start = 1
    sc.frame_end = max(1, int(spec["frames"]))
    r.film_transparent = bool(spec.get("transparent", True))
    r.use_persistent_data = True

    # Motion blur: gentle, and only where it helps (spec decides; default on for moving shots).
    mb = spec.get("motion_blur", {})
    r.use_motion_blur = bool(mb.get("enabled", False))
    r.motion_blur_shutter = float(mb.get("shutter", 0.35))

    q = QUALITY.get(spec.get("quality", "final"), QUALITY["final"])
    samples = spec.get("samples")
    if r.engine == "CYCLES":
        cy = sc.cycles
        cy.device = "CPU"
        cy.samples = int(samples or q["cycles"])
        cy.use_adaptive_sampling = True
        cy.adaptive_threshold = q["cycles_threshold"]
        cy.adaptive_min_samples = 0
        cy.use_denoising = True
        set_enum(cy, "denoiser", "OPENIMAGEDENOISE")
        set_enum(cy, "denoising_input_passes", "RGB_ALBEDO_NORMAL")
        set_enum(cy, "denoising_prefilter", "ACCURATE")
        cy.max_bounces = 12
        cy.diffuse_bounces = 3
        cy.glossy_bounces = 4
        cy.transmission_bounces = 10
        cy.transparent_max_bounces = 8
        cy.sample_clamp_indirect = 6.0
        cy.blur_glossy = 0.5
        cy.caustics_reflective = False
        cy.caustics_refractive = False
        cy.use_light_tree = True
        # Same noise pattern every run: renders are reproducible.
        cy.seed = int(spec.get("seed", 0)) % 2147483647
        cy.use_animated_seed = False
        # Glass stays see-through in the alpha channel (property moved between versions).
        for owner in (cy, r):
            if hasattr(owner, "film_transparent_glass"):
                owner.film_transparent_glass = True
                break
    else:
        ee = sc.eevee
        ee.taa_render_samples = int(samples or q["eevee"])
        ee.use_shadows = True
        ee.shadow_ray_count = 2
        ee.shadow_step_count = 8
        ee.use_raytracing = bool(spec.get("raytracing", True))
        ee.use_fast_gi = True
        ee.clamp_surface_indirect = 10.0
        if r.use_motion_blur:
            ee.motion_blur_steps = 1

    # Colour: Standard keeps brand hex colours exactly as specified (AgX desaturates them).
    vs = sc.view_settings
    set_enum(vs, "view_transform", spec.get("view_transform", "Standard"), "Standard")
    set_enum(vs, "look", "None")
    vs.exposure = float(spec.get("exposure", 0.0))
    vs.gamma = 1.0
    set_enum(sc.display_settings, "display_device", "sRGB")
    set_enum(sc.sequencer_colorspace_settings, "name", "sRGB")

    im = r.image_settings
    im.media_type = "IMAGE"  # Blender 5: media_type before file_format
    im.file_format = "PNG"
    im.color_mode = "RGBA" if r.film_transparent else "RGB"
    im.color_depth = "8"
    im.compression = 30
    r.use_file_extension = True
    r.use_overwrite = True
    r.use_placeholder = False
    return sc

