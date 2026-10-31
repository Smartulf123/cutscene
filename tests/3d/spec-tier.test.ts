import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { DEMO_SVG, TEMPLATES, TIER1_TEMPLATES, newSpec, validateSpec } from "../../skills/cutscene-3d/scripts/lib/spec.mjs";
import type { ShotSpec } from "../../skills/cutscene-3d/scripts/lib/spec.mjs";
import {
  TIER2_REMOVED, decideTier, ignoredFields, ignoredWarning, refuseTier2, removedCommandError, tier2Reasons,
} from "../../skills/cutscene-3d/scripts/lib/tier.mjs";

describe("newSpec + validateSpec", () => {
  it("has exactly the five Three.js templates", () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(["flythrough", "logo-svg", "shapes", "title3d", "turntable"]);
    expect(Object.keys(TIER1_TEMPLATES)).toEqual(Object.keys(TEMPLATES));
  });
  it("every template's default spec is valid Tier 1, with no Blender-only fields", () => {
    for (const t of Object.keys(TEMPLATES)) {
      const spec = newSpec(t, { id: `shot-${t}`, text: "HELLO" });
      expect(validateSpec(spec), t).toEqual([]);
      expect(spec.tier, t).toBe(1);
      expect(ignoredFields(spec), t).toEqual([]);
      for (const k of ["engine", "quality", "samples", "view_transform", "motion_blur", "camera", "needs"]) expect(spec, `${t} ${k}`).not.toHaveProperty(k);
      expect(tier2Reasons(spec), t).toEqual([]);
    }
  });
  it("carries text, beat and duration", () => {
    const s = newSpec("title3d", { id: "logo", text: "CUTSCENE", beat: "b1", duration: 2.4 });
    expect(s).toMatchObject({ id: "logo", beat: "b1", duration: 2.4, params: { text: "CUTSCENE" } });
  });
  it("keeps the defaults the Three.js templates read", () => {
    expect(newSpec("title3d").params).toMatchObject({ depth: 0.3, bevel: 0.024, tracking: 0.08, swing: 12, face: { preset: "glossy", color: "fg" }, sides: { preset: "metal", color: "accent" } });
    expect(newSpec("logo-svg").params).toMatchObject({ svg: null, depth: 0.42, bevel: 0.03, keep_svg_colors: false, face: { color: "accent" }, sides: { preset: "chrome" } });
    expect(newSpec("turntable")).toMatchObject({ duration: 4, params: { model: null, turns: 1, label: { preset: "glossy", color: "accent" } } });
  });
  it("rejects unknown templates, the old Blender ones too", () => {
    expect(() => newSpec("teapot")).toThrow(/no 3D template/);
    expect(() => newSpec("product-shot")).toThrow(/no 3D template/);
  });
  it("explains each problem in plain words", () => {
    const bad = { version: 2, id: "bad id!", template: "title3d", tier: 3, width: 1921, height: 1080, duration: -1, params: { text: "", face: { preset: "velvet", color: "pink" } }, palette: { accent: "blue" } } as unknown as ShotSpec;
    const errs = validateSpec(bad).join("\n");
    for (const re of [/version/, /"id"/, /"tier"/, /even/, /duration/, /params.text/, /preset/, /params.face.color/, /palette.accent/]) {
      expect(errs).toMatch(re);
    }
  });
  it("rejects wrong file types", () => {
    const s = newSpec("turntable", { id: "t", model: "x.blend" });
    expect(validateSpec(s).join(" ")).toMatch(/\.glb/);
    const l = newSpec("logo-svg", { id: "l", svg: "logo.png" });
    expect(validateSpec(l).join(" ")).toMatch(/\.svg/);
  });
  it("the demo logo mark ships with the Tier 1 templates", () => {
    expect(DEMO_SVG).toMatch(/[\\/]templates[\\/]tier1[\\/]cutscene-mark\.svg$/);
    expect(existsSync(DEMO_SVG)).toBe(true);
  });
});

describe("old specs: Blender (Tier 2) was removed", () => {
  // A spec as `cutscene 3d new` wrote it before Blender was removed.
  const old = (extra: Record<string, unknown> = {}): ShotSpec => ({
    version: 1, id: "logo", template: "title3d", tier: "auto", engine: "auto", duration: 3, fps: 30, width: 1920, height: 1080,
    quality: "final", look: ".cutscene/look.json", params: { text: "HI", size: 1, bevel_segments: 4, reveal: "flip", ground: false },
    camera: { move: "arc", lens: 50, dof: { fstop: 2.8 } }, lighting: { rig: "studio" }, motion_blur: true, transparent: true, needs: [],
    ...extra,
  });

  it('an old "auto" spec is still valid and means Tier 1; its Blender-only settings get one warning', () => {
    const spec = old();
    expect(validateSpec(spec)).toEqual([]);
    expect(tier2Reasons(spec)).toEqual([]);
    expect(() => refuseTier2(spec)).not.toThrow();
    expect(ignoredFields(spec)).toEqual(["engine", "quality", "motion_blur", "camera", "lighting.rig"]);
    expect(ignoredWarning(spec)).toMatch(/only Blender used \(engine, quality, motion_blur, camera, lighting.rig\); Tier 1 ignores them/);
    const d = decideTier(spec);
    expect(d).toMatchObject({ tier: 1, template: "title3d" });
    expect(d.warnings).toHaveLength(1);
  });

  it("tier 1 with samples, view_transform and an HDRI still works", () => {
    const spec = old({ tier: 1, samples: 64, view_transform: "AgX", lighting: { rig: "hero", hdri: "studio.hdr", rim_color: "accent" } });
    expect(validateSpec(spec)).toEqual([]);
    expect(decideTier(spec).tier).toBe(1);
    expect(ignoredFields(spec)).toEqual(expect.arrayContaining(["samples", "view_transform", "lighting.rig", "lighting.hdri"]));
  });

  const refused = (spec: ShotSpec) => {
    try {
      refuseTier2(spec);
    } catch (e) {
      return e as { code: string; message: string; hint: string; details: { reasons: string[]; tier1Template: string | null } };
    }
    throw new Error("expected TIER2_REMOVED");
  };

  it.each([
    ["tier: 2", { tier: 2 }, /"tier": 2/, /set "tier": 1/],
    ['tier: "2"', { tier: "2" }, /"tier": 2/, /set "tier": 1/],
    ["engine cycles", { engine: "cycles" }, /"cycles" engine/, /remove "engine"/],
    ["engine EEVEE", { engine: "EEVEE" }, /"EEVEE" engine/, /remove "engine"/],
    ["needs glass", { needs: ["glass"] }, /ray-traced glass/, /remove "glass" from "needs"/],
    ["needs physics + photoreal", { needs: ["Physics", "photoreal", "bloom"] }, /physics, photoreal lighting/, /"physics", "photoreal" from "needs"/],
  ])("refuses %s with a clear TIER2_REMOVED error", (_name, extra, why, how) => {
    const e = refused(old(extra as Record<string, unknown>));
    expect(e.code).toBe(TIER2_REMOVED);
    expect(e.message).toMatch(/^Blender \(Tier 2\) was removed from Cutscene/);
    expect(e.message).toMatch(why);
    expect(e.hint).toMatch(/Make it with Tier 1 \(Three\.js\)/);
    expect(e.hint).toMatch(how);
    expect(e.hint).toMatch(/video file, add that file as a normal clip/);
  });

  it("refuses the old Blender-only templates and names the Three.js template to use", () => {
    const shot = refused(old({ template: "product-shot", params: { model: "p.glb" } }));
    expect(shot.message).toMatch(/"product-shot" was a Blender template/);
    expect(shot.hint).toMatch(/use the "turntable" template \(`cutscene 3d new turntable`\)/);
    expect(shot.details.tier1Template).toBe("turntable");
    const drop = refused(old({ template: "physics-drop", tier: 2 }));
    expect(drop.details.reasons).toHaveLength(2);
    expect(drop.hint).toMatch(/"title3d" template.*set "tier": 1/);
  });

  it("lists every reason at once", () => {
    const e = refused(old({ tier: 2, engine: "cycles", needs: ["glass"] }));
    expect(e.details.reasons).toHaveLength(3);
    expect(e.hint).toMatch(/set "tier": 1 and remove "engine" and "glass" from "needs"/);
  });

  it("never crashes on junk", () => {
    for (const junk of [null, undefined, 5, "x", [], {}, { needs: "glass" }, { engine: 3 }]) expect(() => tier2Reasons(junk as ShotSpec)).not.toThrow();
    expect(tier2Reasons({ needs: "glass" } as unknown as ShotSpec)).toEqual([]);
  });

  it("explains the removed commands", () => {
    const e = removedCommandError("render");
    expect(e).toMatchObject({ code: TIER2_REMOVED, exitCode: 1 });
    expect(e.message).toMatch(/"cutscene 3d render" was part of Blender \(Tier 2\)/);
    expect(e.hint).toMatch(/cutscene 3d tier1/);
  });
});

describe("network paths in specs", async () => {
  const { isNetworkPath, specNetworkField } = await import("../../skills/cutscene-3d/scripts/lib/project.mjs");
  it("refuses shares in any file field, with any mix of slashes", () => {
    expect(isNetworkPath(String.raw`/\server\share\x.svg`)).toBe(true);
    expect(isNetworkPath(String.raw`\\server\share\x.svg`)).toBe(true);
    expect(isNetworkPath("C:/logos/x.svg")).toBe(false);
    const spec = newSpec("logo-svg", { id: "logo", svg: "assets/logo.svg" });
    expect(specNetworkField(spec)).toBe(null);
    expect(specNetworkField({ ...spec, params: { ...spec.params, svg: String.raw`\\attacker\share\logo.svg` } })).toBe("params.svg");
    expect(specNetworkField({ ...spec, params: { model: "//server/x.glb" } })).toBe("params.model");
    expect(specNetworkField({ ...spec, font: "//server/fonts/a.ttf" })).toBe("font");
    expect(specNetworkField({ ...spec, look: String.raw`\/server/look.json` })).toBe("look");
  });
});
