// Real runs on this machine. Each block skips with a reason when Blender, FFmpeg or the engine
// isn't installed, so CI without them stays green (contracts §12).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findBlender } from "../../skills/cutscene-3d/scripts/lib/blender.mjs";
import { hasTool } from "../../skills/cutscene-3d/scripts/lib/encode.mjs";

const CLI3D = resolve("skills/cutscene-3d/scripts/3d.mjs");
const CUTSCENE = resolve("skills/cutscene/scripts/cli.mjs");
const blender = await findBlender();
const ffmpeg = hasTool("ffmpeg") && hasTool("ffprobe");
const engineCli = existsSync(CUTSCENE) ? CUTSCENE : null;

function run3d(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [CLI3D, ...args, "--json"], { cwd, encoding: "utf8", windowsHide: true, timeout: 20 * 60_000 });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* leave null */
  }
  if (!json?.ok) console.error(r.stdout, r.stderr.slice(-2000));
  return json;
}

const LONG = 25 * 60_000; // Blender renders and engine checks are slow on integrated graphics
const why = !blender ? "Blender 4.2+ not found" : !ffmpeg ? "FFmpeg/ffprobe not found" : "";

describe.skipIf(why)(`Tier 2 title: spec -> stills -> render -> transparent WebM ${why ? `(skipped: ${why})` : ""}`, () => {
  const dir = mkdtempSync(join(tmpdir(), "cs3d-e2e-"));
  mkdirSync(join(dir, ".cutscene"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!doctype html><html></html>");
  writeFileSync(join(dir, ".cutscene", "look.json"), JSON.stringify({ version: 1, palette: { bg: "#0B1020", fg: "#F4F3EE", accent: "#5B8DEF", accent2: "#FF7A45" }, motion: { character: "snappy" }, seed: 1337 }));
  writeFileSync(join(dir, ".cutscene", "beats.json"), JSON.stringify({ version: 1, fps: 30, width: 1920, height: 1080, beats: [{ id: "b1", start: 0, end: 2, label: "logo", voice: { line: "Meet Cutscene." } }] }, null, 2));
  const timings: Record<string, unknown> = {};

  it("writes and plans a spec", () => {
    const n = run3d(["new", "title3d", "--id", "e2e", "--text", "CUTSCENE", "--beat", "b1"], dir);
    expect(n.ok).toBe(true);
    const specPath = join(dir, ".cutscene", "3d", "e2e.json");
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    spec.tier = 2;
    writeFileSync(specPath, JSON.stringify(spec, null, 2));
    const p = run3d(["plan", ".cutscene/3d/e2e.json"], dir);
    expect(p).toMatchObject({ ok: true, tier: 2, engine: "BLENDER_EEVEE" });
  }, LONG);

  it("renders stills and a contact sheet", () => {
    const s = run3d(["stills", ".cutscene/3d/e2e.json", "--count", "3"], dir);
    expect(s.ok).toBe(true);
    expect(s.stills).toHaveLength(3);
    for (const f of s.stills) expect(existsSync(f)).toBe(true);
    expect(existsSync(s.contactSheet)).toBe(true);
    const pf = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=pix_fmt,width", "-of", "csv=p=0", s.stills[0]], { encoding: "utf8" }).stdout.trim();
    expect(pf).toMatch(/960,rgba|rgba,960/);
    timings.stills = s.frameSeconds;
  }, LONG);

  it("renders the full sequence (2 s at 50 %) and encodes a WebM with real alpha", () => {
    const r = run3d(["render", ".cutscene/3d/e2e.json", "--scale", "50"], dir);
    expect(r.ok).toBe(true);
    expect(r.frames).toBe(60);
    timings.render = { secondsPerFrame: r.secondsPerFrame, first: r.firstFrameSeconds, wall: r.wallSeconds };
    const e = run3d(["encode", "e2e"], dir);
    expect(e.ok).toBe(true);
    expect(e.alpha).toMatchObject({ codec: "vp9", alphaMode: true, decodedAlpha: true, transparentPixels: true, frames: 60 });
    expect(existsSync(join(dir, "assets", "3d", "e2e.webm"))).toBe(true);
    expect(existsSync(join(dir, "assets", "3d", "e2e.poster.png"))).toBe(true);
    const tags = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream_tags=alpha_mode", "-of", "default=nw=1", e.webm], { encoding: "utf8" }).stdout;
    expect(tags.toLowerCase()).toContain("alpha_mode=1");
    const beats = JSON.parse(readFileSync(join(dir, ".cutscene", "beats.json"), "utf8"));
    expect(beats.beats[0].shot3d).toEqual({ spec: ".cutscene/3d/e2e.json", tier: 2, file: "assets/3d/e2e.webm", duration: 2 });
    expect(beats.beats[0].voice).toEqual({ line: "Meet Cutscene." });
    console.log("[cutscene-3d e2e] timings", JSON.stringify(timings));
  }, LONG);
});

describe.skipIf(!blender)(`Tier 2 templates build in Blender ${blender ? "" : "(skipped: Blender not found)"}`, () => {
  for (const t of ["logo-svg", "turntable", "physics-drop"]) {
    it(`${t}: one still`, () => {
      const dir = mkdtempSync(join(tmpdir(), `cs3d-${t}-`));
      writeFileSync(join(dir, "index.html"), "");
      expect(run3d(["new", t, "--id", "s", "--duration", "1"], dir).ok).toBe(true);
      const s = run3d(["stills", ".cutscene/3d/s.json", "--frames", "30", "--scale", "25", "--no-sheet"], dir);
      expect(s.ok).toBe(true);
      expect(existsSync(s.stills[0])).toBe(true);
    }, LONG);
  }
});

describe.skipIf(!engineCli)(`Tier 1 shot passes the engine's lint and check ${engineCli ? "" : "(skipped: cutscene CLI not found)"}`, () => {
  it("title3d in a fresh project", () => {
    const root = mkdtempSync(join(tmpdir(), "cs3d-t1-"));
    const env = { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" };
    const init = spawnSync(process.execPath, [engineCli!, "init", "video", "--non-interactive"], { cwd: root, encoding: "utf8", env, timeout: 300_000, windowsHide: true });
    const dir = join(root, "video");
    if (init.status !== 0 || !existsSync(join(dir, "index.html"))) {
      console.warn("[cutscene-3d e2e] skipped: engine init failed", init.stderr.slice(-500));
      return;
    }
    expect(run3d(["new", "title3d", "--id", "hi", "--text", "HELLO", "--duration", "3"], dir).ok).toBe(true);
    const w = run3d(["tier1", "title3d", "--spec", ".cutscene/3d/hi.json"], dir);
    expect(w.ok).toBe(true);
    let html = readFileSync(join(dir, "index.html"), "utf8");
    html = html.replace(/<h1 id="title"[^\n]*\n/, "").replace(/data-duration="\d+"/, 'data-duration="3"').replace(/(\s*<\/div>\s*<script>)/, `\n      ${w.snippet}$1`);
    writeFileSync(join(dir, "index.html"), html);
    const lint = spawnSync(process.execPath, [engineCli!, "lint"], { cwd: dir, encoding: "utf8", env, timeout: 300_000, windowsHide: true });
    expect(lint.status, lint.stdout + lint.stderr).toBe(0);
    expect(lint.stdout + lint.stderr).toMatch(/0 error/);
    const check = spawnSync(process.execPath, [engineCli!, "check", "--timeout", "30000"], { cwd: dir, encoding: "utf8", env, timeout: 600_000, windowsHide: true });
    expect(check.status, (check.stdout + check.stderr).slice(-2000)).toBe(0);
    expect(check.stdout + check.stderr).toMatch(/Check passed/);
  }, LONG);
});
