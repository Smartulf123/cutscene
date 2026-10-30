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
  it("new takes size, fps and duration from beats.json, then plan decides the tier", () => {
    const dir = project();
    const n = run(["new", "title3d", "--id", "logo", "--text", "HELLO", "--beat", "b1", "--json"], dir);
    expect(n.code).toBe(0);
    const spec = JSON.parse(readFileSync(join(dir, ".cutscene", "3d", "logo.json"), "utf8"));
    expect(spec).toMatchObject({ id: "logo", fps: 25, width: 1080, height: 1920, duration: 2.4, beat: "b1", params: { text: "HELLO" } });
    const again = run(["new", "title3d", "--id", "logo", "--json"], dir);
    expect(again.json.error.code).toBe("SPEC_EXISTS");
    const p = run(["plan", ".cutscene/3d/logo.json", "--json"], dir);
    expect(p.code).toBe(0);
    expect(p.json).toMatchObject({ ok: true, tier: 1, template: "title3d" });
  });
  it("plan explains a Blender shot and its time", () => {
    const dir = project();
    run(["new", "physics-drop", "--id", "drop", "--duration", "2"], dir);
    const p = run(["plan", ".cutscene/3d/drop.json", "--json"], dir);
    expect(p.json.tier).toBe(2);
    expect(p.json.reasons.join(" ")).toMatch(/physics/);
    if (p.json.blender) expect(p.json.estimate.frames).toBe(50);
  });
  it("invalid specs list their problems", () => {
    const dir = project();
    mkdirSync(join(dir, ".cutscene", "3d"), { recursive: true });
    writeFileSync(join(dir, ".cutscene", "3d", "bad.json"), JSON.stringify({ version: 1, id: "bad", template: "title3d", params: { text: "" }, camera: { move: "zoomies" } }));
    const r = run(["stills", ".cutscene/3d/bad.json", "--json"], dir);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("SPEC_INVALID");
    expect(r.json.details.problems.length).toBeGreaterThanOrEqual(2);
  });
  it("render refuses without stills first", () => {
    const dir = project();
    run(["new", "title3d", "--id", "t"], dir);
    const r = run(["render", ".cutscene/3d/t.json", "--json"], dir);
    expect(r.json.error.code).toBe("STILLS_FIRST");
  });
  it("encode explains missing frames", () => {
    const dir = project();
    const r = run(["encode", "nothing", "--json"], dir);
    expect(r.json.error.code).toMatch(/NO_FRAMES|FFMPEG_MISSING/);
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
  it("assets fetch asks for consent", () => {
    const r = run(["assets", "fetch", "hdri-studio-small-09", "--json"], process.cwd(), { CUTSCENE_HOME: mkdtempSync(join(tmpdir(), "cs3d-home-")) });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("NEEDS_CONSENT");
    expect(r.json.details).toMatchObject({ license: "CC0-1.0" });
  });
});
