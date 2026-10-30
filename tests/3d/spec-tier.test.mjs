import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  BUNDLED_FONT, DEMO_SVG, TEMPLATES, frameCount, newSpec, resolveColors, resolveSpec, stillFrames, validateSpec,
} from "../../skills/cutscene-3d/scripts/lib/spec.mjs";
import { decideTier, estimate, humanTime } from "../../skills/cutscene-3d/scripts/lib/tier.mjs";

describe("newSpec + validateSpec", () => {
  it("every template's default spec is valid", () => {
    for (const t of Object.keys(TEMPLATES)) {
      const spec = newSpec(t, { id: `shot-${t}`, text: "HELLO" });
      expect(validateSpec(spec), t).toEqual([]);
      expect(spec.tier).toBe("auto");
      expect(spec.transparent).toBe(true);
    }
  });
  it("carries text, beat and duration", () => {
    const s = newSpec("title3d", { id: "logo", text: "CUTSCENE", beat: "b1", duration: 2.4 });
    expect(s).toMatchObject({ id: "logo", beat: "b1", duration: 2.4, params: { text: "CUTSCENE" } });
  });
  it("rejects unknown templates", () => {
    expect(() => newSpec("teapot")).toThrow(/no 3D template/);
  });
  it("explains each problem in plain words", () => {
    const bad = { version: 2, id: "bad id!", template: "title3d", width: 1921, height: 1080, duration: -1, params: { text: "", face: { preset: "velvet", color: "pink" } }, camera: { move: "spin", ease: "wobbly", lens: 2 }, lighting: { rig: "disco" }, palette: { accent: "blue" }, engine: "octane" };
    const errs = validateSpec(bad).join("\n");
    for (const re of [/version/, /"id"/, /even/, /duration/, /params.text/, /preset/, /params.face.color/, /camera.move/, /camera.ease/, /camera.lens/, /lighting.rig/, /palette.accent/, /engine/]) {
      expect(errs).toMatch(re);
    }
  });
  it("rejects wrong file types", () => {
    const s = newSpec("turntable", { id: "t", model: "x.blend" });
    expect(validateSpec(s).join(" ")).toMatch(/\.glb/);
    const l = newSpec("logo-svg", { id: "l", svg: "logo.png" });
    expect(validateSpec(l).join(" ")).toMatch(/\.svg/);
  });
});

describe("resolveSpec", () => {
  const look = { palette: { bg: "#000000", fg: "#FFFFFF", accent: "#112233", accent2: "#445566" }, motion: { character: "cinematic", duration_scale: 2 }, seed: 7 };
  it("turns palette tokens into hex and keeps hex as is", () => {
    const r = resolveColors({ face: { color: "accent" }, sides: { color: "#ABCDEF" }, text: "accent" }, look.palette);
    expect(r).toEqual({ face: { color: "#112233" }, sides: { color: "#ABCDEF" }, text: "accent" });
  });
  it("merges look.json: colours, eases from the motion character, seed, frames, engine", () => {
    const spec = newSpec("title3d", { id: "x", duration: 2 });
    const r = resolveSpec(spec, { projectDir: "C:/p", look });
    expect(r.params.face.color).toBe("#FFFFFF");
    expect(r.params.sides.color).toBe("#112233");
    expect(r.params.reveal_ease).toBe("quint-out");
    expect(r.camera.ease).toBe("quint-inout");
    expect(r.params.stagger).toBeCloseTo(0.2);
    expect(r.seed).toBe(7);
    expect(r.frames).toBe(60);
    expect(r.engine).toBe("BLENDER_EEVEE");
    expect(r.font).toBe(BUNDLED_FONT);
    expect(r.view_transform).toBe("Standard");
  });
  it("spec palette overrides the look", () => {
    const spec = { ...newSpec("title3d", { id: "x" }), palette: { accent: "#FF0000" } };
    expect(resolveSpec(spec, { look }).params.sides.color).toBe("#FF0000");
  });
  it("picks Cycles for glass and makes paths absolute", () => {
    const spec = newSpec("product-shot", { id: "p", model: "assets/p.glb" });
    spec.params.material_override = { preset: "glass" };
    const r = resolveSpec(spec, { projectDir: "C:/proj", look });
    expect(r.engine).toBe("CYCLES");
    expect(r.params.model).toBe(join("C:/proj", "assets/p.glb"));
  });
  it("uses the demo mark when a logo spec has no SVG", () => {
    expect(resolveSpec(newSpec("logo-svg", { id: "l" }), {}).params.svg).toBe(DEMO_SVG);
  });
  it("refuses Tier 1-only templates", () => {
    expect(() => resolveSpec({ ...newSpec("title3d", { id: "s" }), template: "shapes" }, {})).toThrow(/Tier 1 template/);
  });
});

describe("frames", () => {
  it("counts frames", () => {
    expect(frameCount(2.4, 30)).toBe(72);
    expect(frameCount(0.01, 30)).toBe(1);
  });
  it("spreads 3-5 stills and always includes the last frame", () => {
    expect(stillFrames(60, 4)).toEqual([9, 21, 36, 60]);
    expect(stillFrames(90, 3)).toEqual([18, 45, 90]);
    expect(stillFrames(120, 5).at(-1)).toBe(120);
    expect(stillFrames(2, 4)).toEqual([1, 2]);
    expect(stillFrames(100, 9)).toHaveLength(5);
  });
});

describe("decideTier", () => {
  const spec = (t, extra = {}) => ({ ...newSpec(t, { id: "s" }), ...extra });
  it("plain titles, logos and turntables go to Tier 1", () => {
    for (const t of ["title3d", "logo-svg", "turntable"]) expect(decideTier(spec(t)).tier).toBe(1);
  });
  it("glass, physics, characters and asking for Blender go to Tier 2", () => {
    const glass = spec("title3d");
    glass.params.face = { preset: "glass" };
    expect(decideTier(glass)).toMatchObject({ tier: 2, engine: "CYCLES" });
    expect(decideTier(spec("physics-drop")).tier).toBe(2);
    expect(decideTier(spec("turntable", { needs: ["character"] })).tier).toBe(2);
    expect(decideTier(spec("title3d", { needs: ["blender"] })).tier).toBe(2);
  });
  it("procedural materials go to Tier 2 only for short shots without a deadline", () => {
    const s = spec("title3d");
    s.params.face = { preset: "noise" };
    expect(decideTier(s).tier).toBe(2);
    expect(decideTier({ ...s, duration: 14 }).tier).toBe(1);
    expect(decideTier(s, { deadline: true }).tier).toBe(1);
  });
  it("product shots prefer Tier 2 unless long or rushed", () => {
    expect(decideTier(spec("product-shot")).tier).toBe(2);
    const long = decideTier(spec("product-shot", { duration: 15 }));
    expect(long).toMatchObject({ tier: 1, template: "turntable" });
  });
  it("warns about long Blender shots but keeps hard needs in Tier 2", () => {
    const d = decideTier(spec("physics-drop", { duration: 14 }), { deadline: true });
    expect(d.tier).toBe(2);
    expect(d.warnings.join(" ")).toMatch(/slow/);
  });
  it("honours an explicit tier", () => {
    expect(decideTier(spec("title3d", { tier: 2 })).tier).toBe(2);
    expect(decideTier(spec("product-shot", { tier: 1 }))).toMatchObject({ tier: 1, template: "turntable" });
  });
  it("offers a fallback when Blender is missing", () => {
    const d = decideTier(spec("physics-drop"), { blender: null });
    expect(d.fallback).toMatchObject({ tier: 1, template: "title3d" });
    expect(d.fallback.message).toMatch(/Ask the user/);
  });
  it("Tier 1-only templates stay Tier 1", () => {
    expect(decideTier(spec("title3d", { template: "shapes" }))).toMatchObject({ tier: 1, template: "shapes" });
  });
});

describe("estimate", () => {
  it("scales with frames, pixels and engine", () => {
    const s = newSpec("title3d", { id: "s", duration: 2 });
    const e = estimate(s, { engine: "BLENDER_EEVEE" });
    const c = estimate(s, { engine: "CYCLES" });
    const half = estimate({ ...s, width: 960, height: 540 }, { engine: "BLENDER_EEVEE" });
    expect(e.frames).toBe(60);
    expect(c.renderSeconds).toBeGreaterThan(e.renderSeconds * 5);
    expect(half.secondsPerFrame).toBeCloseTo(e.secondsPerFrame / 4, 1);
    expect(e.human).toMatch(/min|s$/);
  });
  it("uses measured timings when given", () => {
    const s = newSpec("title3d", { id: "s", duration: 1 });
    const e = estimate(s, { engine: "BLENDER_EEVEE", bench: { perFrame: { BLENDER_EEVEE: { final: 1 } }, startup: 0, eeveeFirstFrame: 0 } });
    expect(e.renderSeconds).toBe(30);
  });
  it("formats times", () => {
    expect(humanTime(12)).toBe("about 12 s");
    expect(humanTime(600)).toBe("about 10 min");
    expect(humanTime(7200)).toBe("about 2.0 h");
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
    expect(specNetworkField({ ...spec, font: "//server/fonts/a.ttf" })).toBe("font");
    expect(specNetworkField({ ...spec, lighting: { hdri: String.raw`\/server/x.hdr` } })).toBe("lighting.hdri");
  });
});
