import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as doctor from "../../skills/cutscene/scripts/doctor.mjs";
import { checkEditTools, checkKokoro, checkNode, checkVoiceStudio, compareVersions, formatDoctor, parseVersion, summarize } from "../../skills/cutscene/scripts/doctor.mjs";
import type { Check } from "../../skills/cutscene/scripts/doctor.mjs";
import { planSetup } from "../../skills/cutscene/scripts/setup.mjs";
import { cleanup, tempDir } from "./helpers.ts";

let root: string;
beforeAll(() => {
  root = tempDir();
});
afterAll(() => cleanup(root));

describe("versions", () => {
  it("parses and compares", () => {
    expect(parseVersion("Python 3.12.10\n", "Python")).toEqual([3, 12, 10]);
    expect(parseVersion("Python 3.10", "Python")).toEqual([3, 10, 0]);
    expect(parseVersion("nothing", "Python")).toBeNull();
    expect(compareVersions([4, 2, 0], [4, 2, 0])).toBe(0);
    expect(compareVersions([4, 1, 9], [4, 2, 0])).toBeLessThan(0);
    expect(compareVersions([10, 0], [4, 2, 0])).toBeGreaterThan(0);
  });

  it("requires Node 22", () => {
    expect(checkNode("22.0.0").ok).toBe(true);
    expect(checkNode("20.11.1")).toMatchObject({ ok: false, status: "too old" });
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
  const checks: Check[] = [
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

  it("has no Blender check (Tier 2 was removed), and setup ignores an old report's Blender line", () => {
    expect(Object.keys(doctor).filter((k) => /blender/i.test(k))).toEqual([]);
    const old: Check[] = [...checks, { id: "blender", name: "Blender 4.2+", group: "optional", ok: false, status: "missing" }];
    expect(planSetup(old, "0.8.162").elsewhere.map((e) => e.id)).toEqual(["voice"]);
  });
  it("treats VoiceStudio as optional when it isn't running", async () => {
    const r = await checkVoiceStudio({ url: "http://127.0.0.1:9/health", timeoutMs: 500 });
    expect(r).toMatchObject({ id: "voicestudio", group: "optional", ok: false, status: "off" });
  });
});
