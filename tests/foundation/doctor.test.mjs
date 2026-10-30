import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blenderCandidates, checkEditTools, checkKokoro, checkNode, checkVoiceStudio, compareVersions, formatDoctor, parseVersion, summarize } from "../../skills/cutscene/scripts/doctor.mjs";
import { planSetup } from "../../skills/cutscene/scripts/setup.mjs";
import { cleanup, tempDir } from "./helpers.mjs";

let root;
beforeAll(() => {
  root = tempDir();
});
afterAll(() => cleanup(root));

describe("versions", () => {
  it("parses and compares", () => {
    expect(parseVersion("Blender 5.2.3 LTS\n\tbuild date", "Blender")).toEqual([5, 2, 3]);
    expect(parseVersion("Python 3.12.10", "Python")).toEqual([3, 12, 10]);
    expect(parseVersion("Blender 4.2", "Blender")).toEqual([4, 2, 0]);
    expect(parseVersion("nothing", "Blender")).toBeNull();
    expect(compareVersions([4, 2, 0], [4, 2, 0])).toBe(0);
    expect(compareVersions([4, 1, 9], [4, 2, 0])).toBeLessThan(0);
    expect(compareVersions([10, 0], [4, 2, 0])).toBeGreaterThan(0);
  });

  it("requires Node 22", () => {
    expect(checkNode("22.0.0").ok).toBe(true);
    expect(checkNode("20.11.1")).toMatchObject({ ok: false, status: "too old" });
  });
});

describe("Blender search order", () => {
  it("puts CUTSCENE_BLENDER, then config.json, first; newest install folder before older", () => {
    const pf = join(root, "Program Files");
    for (const v of ["Blender 4.2", "Blender 5.2", "Blender 3.6"]) mkdirSync(join(pf, "Blender Foundation", v), { recursive: true });
    const list = blenderCandidates({
      env: { CUTSCENE_BLENDER: "D:\\tools\\blender.exe", ProgramFiles: pf, "ProgramFiles(x86)": join(root, "x86"), PATH: "" },
      config: { blender: "E:\\b\\blender.exe" },
      platform: "win32",
      home: join(root, "home"),
      userHome: join(root, "user"),
    });
    expect(list[0]).toEqual({ path: "D:\\tools\\blender.exe", source: "CUTSCENE_BLENDER" });
    expect(list[1]).toEqual({ path: "E:\\b\\blender.exe", source: "config.json" });
    const installs = list.filter((c) => c.source === "Program Files").map((c) => c.path);
    expect(installs).toEqual([
      join(pf, "Blender Foundation", "Blender 5.2", "blender.exe"),
      join(pf, "Blender Foundation", "Blender 4.2", "blender.exe"),
      join(pf, "Blender Foundation", "Blender 3.6", "blender.exe"),
    ]);
    expect(list.some((c) => c.source === "Steam")).toBe(true);
  });

  it("reads extra Steam libraries", () => {
    const steam = join(root, "x86b", "Steam", "steamapps");
    mkdirSync(steam, { recursive: true });
    writeFileSync(join(steam, "libraryfolders.vdf"), '"libraryfolders" { "1" { "path" "G:\\\\SteamLibrary" } }');
    const list = blenderCandidates({ env: { "ProgramFiles(x86)": join(root, "x86b"), ProgramFiles: join(root, "none"), PATH: "" }, platform: "win32", home: root, userHome: root });
    expect(list.map((c) => c.path)).toContain(join("G:\\SteamLibrary", "steamapps", "common", "Blender", "blender.exe"));
  });
});

describe("footage tools", () => {
  it("reads cutscene-edit's pins and its install markers", () => {
    const skillsRoot = join(root, "skills-edit");
    mkdirSync(join(skillsRoot, "cutscene-edit", "assets"), { recursive: true });
    writeFileSync(
      join(skillsRoot, "cutscene-edit", "assets", "manifest.json"),
      JSON.stringify({
        pins: [
          { name: "auto-editor", version: "31.7.2", platform: "win32-x64", file: "auto-editor.exe", size: 44701696 },
          { name: "mediapipe-tasks-vision", version: "1.0.1", platform: "any", size: 10728587 },
          { name: "face-detector-model", version: "m1", platform: "any", size: 229746 },
        ],
      }),
    );
    const home = join(root, "edit-home");
    let rows = checkEditTools({ home, skillsRoot, platform: "win32-x64" });
    expect(rows.map((r) => [r.id, r.ok, r.group])).toEqual([["auto-editor", false, "optional"], ["face-detector", false, "optional"]]);
    expect(rows[0].fix).toContain("cutscene edit install auto-editor --yes");
    mkdirSync(join(home, "tools", "auto-editor", "31.7.2"), { recursive: true });
    writeFileSync(join(home, "tools", "auto-editor", "31.7.2", ".cutscene-ok"), "");
    rows = checkEditTools({ home, skillsRoot, platform: "win32-x64" });
    expect(rows[0].ok).toBe(true);
    expect(checkEditTools({ home, skillsRoot: join(root, "none") })).toEqual([]);
  });

  it("reports the built-in voice's Python", () => {
    const saved = process.env.HYPERFRAMES_PYTHON;
    delete process.env.HYPERFRAMES_PYTHON;
    try {
      expect(checkKokoro({ find: () => null })).toMatchObject({ id: "kokoro", ok: false, group: "optional" });
      expect(checkKokoro({ find: () => ({ python: "C:/py/python.exe", source: "PATH" }) }).detail).toContain("C:/py/python.exe");
    } finally {
      if (saved !== undefined) process.env.HYPERFRAMES_PYTHON = saved;
    }
  });
});

describe("report", () => {
  const checks = [
    { id: "node", name: "Node.js 22+", group: "needed", ok: true, status: "ok", detail: "22.1.0" },
    { id: "engine", name: "Video engine", group: "needed", ok: false, status: "missing", detail: "Not installed", fix: "Run `cutscene setup --yes`." },
    { id: "browser", name: "Render browser", group: "needed", ok: false, status: "missing", detail: "Needs the video engine" },
    { id: "voice", name: "AI voices", group: "optional", ok: false, status: "not set up", detail: "x", fix: "Run `cutscene voice setup`." },
  ];

  it("fails only on needed checks and says how to fix them", () => {
    expect(summarize(checks).ready).toBe(false);
    expect(summarize(checks.filter((c) => c.id !== "engine" && c.id !== "browser")).ready).toBe(true);
    const text = formatDoctor(checks, { home: "H", pin: "0.8.162" });
    expect(text).toMatch(/Needed[\s\S]*Optional/);
    expect(text).toContain("Fix: Run `cutscene setup --yes`.");
    expect(text).not.toMatch(/hyperframes/i);
  });

  it("plans only engine pieces for setup and points elsewhere for the rest", () => {
    const plan = planSetup(checks, "0.8.162");
    expect(plan.downloads.map((d) => d.id)).toContain("engine");
    expect(plan.elsewhere.map((e) => e.id)).toEqual(["voice"]);
    expect(plan.elsewhere[0].how).toContain("cutscene voice setup");
  });

  it("treats VoiceStudio as optional when it isn't running", async () => {
    const r = await checkVoiceStudio({ url: "http://127.0.0.1:9/health", timeoutMs: 500 });
    expect(r).toMatchObject({ id: "voicestudio", group: "optional", ok: false, status: "off" });
  });
});
