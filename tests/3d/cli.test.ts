import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve("skills/cutscene-3d/scripts/3d.mjs");
const run = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", windowsHide: true, env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr, json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() };
};
const home = () => ({ CUTSCENE_HOME: mkdtempSync(join(tmpdir(), "cs3d-home-")) });

function project() {
  const dir = mkdtempSync(join(tmpdir(), "cs3d-cli-"));
  mkdirSync(join(dir, ".cutscene"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!doctype html><html></html>");
  writeFileSync(join(dir, ".cutscene", "beats.json"), JSON.stringify({ version: 1, fps: 25, width: 1080, height: 1920, beats: [{ id: "b1", start: 1, end: 3.4 }] }, null, 2));
  return dir;
}

describe("cutscene 3d CLI", () => {
  it("prints help", () => {
    const r = run(["help"], process.cwd());
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Cutscene 3D/);
    expect(r.out).not.toMatch(/hyperframes/i);
  });
  it("unknown commands are usage errors (exit 2) with a JSON envelope", () => {
    const r = run(["wobble", "--json"], process.cwd());
    expect(r.code).toBe(2);
    expect(r.json).toMatchObject({ ok: false, error: { code: "USAGE" } });
    expect(r.json.error.hint).toBeTruthy();
  });
  it("new takes size, fps and duration from beats.json, then plan says Tier 1", () => {
    const dir = project();
    const n = run(["new", "title3d", "--id", "logo", "--text", "HELLO", "--beat", "b1", "--json"], dir);
    expect(n.code).toBe(0);
    const spec = JSON.parse(readFileSync(join(dir, ".cutscene", "3d", "logo.json"), "utf8"));
    expect(spec).toMatchObject({ id: "logo", tier: 1, fps: 25, width: 1080, height: 1920, duration: 2.4, beat: "b1", params: { text: "HELLO" } });
    const again = run(["new", "title3d", "--id", "logo", "--json"], dir);
    expect(again.json.error.code).toBe("SPEC_EXISTS");
    const p = run(["plan", ".cutscene/3d/logo.json", "--json"], dir);
    expect(p.code).toBe(0);
    expect(p.json).toMatchObject({ ok: true, tier: 1, template: "title3d", warnings: [] });
    expect(p.json.next).toMatch(/^cutscene 3d tier1 title3d --spec /);
  });
  it("invalid specs list their problems", () => {
    const dir = project();
    mkdirSync(join(dir, ".cutscene", "3d"), { recursive: true });
    writeFileSync(join(dir, ".cutscene", "3d", "bad.json"), JSON.stringify({ version: 1, id: "bad", template: "title3d", width: 1921, params: { text: "" } }));
    const r = run(["plan", ".cutscene/3d/bad.json", "--json"], dir);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("SPEC_INVALID");
    expect(r.json.details.problems.length).toBeGreaterThanOrEqual(2);
  });
  it("tier1 writes a composition and fills beats.json shot3d", () => {
    const dir = project();
    run(["new", "title3d", "--id", "hi", "--beat", "b1"], dir);
    const r = run(["tier1", "title3d", "--spec", ".cutscene/3d/hi.json", "--start", "1", "--json"], dir);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "compositions", "scene3d-hi.html"))).toBe(true);
    expect(r.json.snippet).toContain('data-start="1"');
    const beats = JSON.parse(readFileSync(join(dir, ".cutscene", "beats.json"), "utf8"));
    expect(beats.beats[0].shot3d).toMatchObject({ tier: 1, file: "compositions/scene3d-hi.html", spec: ".cutscene/3d/hi.json" });
  });
  it("every Tier 1 template goes from new to tier1", () => {
    const dir = project();
    for (const t of ["title3d", "logo-svg", "turntable", "shapes", "flythrough"]) {
      expect(run(["new", t, "--id", `s-${t}`, "--json"], dir).code, t).toBe(0);
      const w = run(["tier1", t, "--spec", `.cutscene/3d/s-${t}.json`, "--json"], dir);
      expect(w.code, t).toBe(0);
      expect(existsSync(join(dir, "compositions", `scene3d-s-${t}.html`)), t).toBe(true);
    }
  });
  it("assets fetch asks for consent", () => {
    const r = run(["assets", "fetch", "font-inter-700", "--json"], process.cwd(), home());
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("NEEDS_CONSENT");
    expect(r.json.details).toMatchObject({ license: "OFL-1.1" });
  });
  it("assets list has the fonts and the bloom library, and no Blender-only HDRIs", () => {
    const r = run(["assets", "list", "--json"], process.cwd(), home());
    expect(r.code).toBe(0);
    const names: string[] = r.json.downloads.map((d: { name: string }) => d.name);
    expect(names.filter((n) => /hdri/.test(n))).toEqual([]);
    expect(names).toContain("postprocessing");
    expect(names).toContain("font-inter-700");
  });
  it("doctor: Tier 1 is ready with nothing to install, and Tier 2 is gone", () => {
    const r = run(["doctor", "--json"], process.cwd(), home());
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({ ok: true, ready: { tier1: true }, tier2: { removed: true } });
    expect(r.json).not.toHaveProperty("blender");
    expect(r.json).not.toHaveProperty("ffmpeg");
    expect(run(["doctor"], process.cwd(), home()).out).toMatch(/Tier 1 \(Three\.js inside the video\): ready, nothing to install/);
  });
});

describe("cutscene 3d after Blender (Tier 2) was removed", () => {
  // A spec as `cutscene 3d new` wrote it while Blender was still part of Cutscene.
  const oldSpec = (dir: string, extra: Record<string, unknown>) => {
    mkdirSync(join(dir, ".cutscene", "3d"), { recursive: true });
    const spec = {
      version: 1, id: "old", template: "title3d", tier: "auto", engine: "auto", duration: 2, fps: 30, width: 1920, height: 1080, quality: "final",
      params: { text: "OLD", size: 1, reveal: "flip" }, camera: { move: "arc", lens: 50 }, lighting: { rig: "studio" }, motion_blur: true, transparent: true, needs: [],
      ...extra,
    };
    writeFileSync(join(dir, ".cutscene", "3d", "old.json"), JSON.stringify(spec, null, 2));
    return ".cutscene/3d/old.json";
  };

  it("help lists only the Tier 1 commands and templates", () => {
    const r = run(["help"], process.cwd());
    for (const gone of ["stills", "render", "encode", "Blender", "product-shot", "physics-drop", "VP9", "HDRI"]) expect(r.out).not.toContain(gone);
    for (const t of ["title3d", "logo-svg", "turntable", "shapes", "flythrough"]) expect(r.out).toContain(t);
  });

  it.each(["stills", "render", "encode", "setup"])("`3d %s` says Blender was removed (TIER2_REMOVED, not a crash)", (cmd) => {
    const dir = project();
    const spec = oldSpec(dir, {});
    const r = run([cmd, spec, "--json"], dir);
    expect(r.code).toBe(1);
    expect(r.json).toMatchObject({ ok: false, error: { code: "TIER2_REMOVED" } });
    expect(r.json.error.message).toMatch(/was part of Blender \(Tier 2\), which was removed/);
    expect(r.json.error.hint).toMatch(/Tier 1/);
    const human = run([cmd, spec], dir);
    expect(human.err).toMatch(/^Error: .*Blender \(Tier 2\)/);
    expect(human.err).toMatch(/Fix: .*normal clip/);
  });

  it.each([
    ["tier 2", { tier: 2 }],
    ["engine cycles", { engine: "cycles" }],
    ["engine eevee", { engine: "eevee" }],
    ["needs glass", { needs: ["glass"] }],
    ["needs physics", { needs: ["physics"] }],
    ["needs photoreal", { needs: ["photoreal"] }],
    ["product-shot", { template: "product-shot", params: {} }],
    ["physics-drop", { template: "physics-drop" }],
  ])("plan and tier1 refuse an old %s spec with TIER2_REMOVED", (_name, extra) => {
    const dir = project();
    const spec = oldSpec(dir, extra);
    for (const args of [["plan", spec], ["tier1", "title3d", "--spec", spec]]) {
      const r = run([...args, "--json"], dir);
      expect(r.code, args.join(" ")).toBe(1);
      expect(r.json.error.code, args.join(" ")).toBe("TIER2_REMOVED");
      expect(r.json.error.message).toMatch(/^Blender \(Tier 2\) was removed from Cutscene/);
      expect(r.json.error.hint).toMatch(/Tier 1 \(Three\.js\).*normal clip/);
      expect(r.json.details.reasons.length).toBeGreaterThan(0);
    }
    expect(existsSync(join(dir, "compositions"))).toBe(false);
  });

  it("new and tier1 refuse the old Blender templates by name", () => {
    const dir = project();
    for (const [t, use] of [["product-shot", "turntable"], ["physics-drop", "title3d"]]) {
      const n = run(["new", t, "--json"], dir);
      expect(n.code).toBe(1);
      expect(n.json.error.code).toBe("TIER2_REMOVED");
      expect(n.json.error.hint).toContain(`cutscene 3d new ${use}`);
      expect(run(["tier1", t, "--json"], dir).json.error.code).toBe("TIER2_REMOVED");
    }
    expect(existsSync(join(dir, ".cutscene", "3d"))).toBe(false);
  });

  it('an old "auto" spec still plans and writes as Tier 1, with one warning about the Blender-only settings', () => {
    const dir = project();
    const spec = oldSpec(dir, { beat: "b1" });
    const p = run(["plan", spec, "--json"], dir);
    expect(p.code).toBe(0);
    expect(p.json).toMatchObject({ ok: true, tier: 1, template: "title3d" });
    expect(p.json.warnings).toHaveLength(1);
    expect(p.json.warnings[0]).toMatch(/only Blender used .*Tier 1 ignores them/);
    expect(p.json).not.toHaveProperty("engine");
    expect(p.json).not.toHaveProperty("estimate");
    const w = run(["tier1", "title3d", "--spec", spec, "--json"], dir);
    expect(w.code).toBe(0);
    expect(w.json.warnings.filter((x: string) => /only Blender used/.test(x))).toHaveLength(1);
    expect(readFileSync(join(dir, "compositions", "scene3d-old.html"), "utf8")).toContain('"text":"OLD"');
    const beats = JSON.parse(readFileSync(join(dir, ".cutscene", "beats.json"), "utf8"));
    expect(beats.beats[0].shot3d).toMatchObject({ tier: 1, file: "compositions/scene3d-old.html" });
  });

  it("new writes tier 1 and none of the Blender-only fields", () => {
    const dir = project();
    expect(run(["new", "turntable", "--id", "can", "--json"], dir).code).toBe(0);
    const spec = JSON.parse(readFileSync(join(dir, ".cutscene", "3d", "can.json"), "utf8"));
    expect(spec.tier).toBe(1);
    for (const k of ["engine", "quality", "samples", "view_transform", "motion_blur", "camera", "needs"]) expect(spec).not.toHaveProperty(k);
    expect(run(["plan", ".cutscene/3d/can.json", "--json"], dir).json.warnings).toEqual([]);
  });
});
