import { describe, expect, it } from "vitest";
import {
  blenderArgs, blenderCandidates, compareVersions, findBlender, folderVersion, parseBlenderVersion, parseEvents,
  steamLibraries, versionOk,
} from "../../skills/cutscene-3d/scripts/lib/blender.mjs";

describe("parseBlenderVersion", () => {
  it("reads an LTS banner", () => {
    const v = parseBlenderVersion("Blender 5.2.3 LTS\n\tbuild date: 2026-10-22\n");
    expect(v).toMatchObject({ major: 5, minor: 2, patch: 3, text: "5.2.3", lts: true });
  });
  it("reads a two-part version", () => {
    expect(parseBlenderVersion("Blender 4.2\n")!.text).toBe("4.2.0");
  });
  it("reads alpha builds and ignores noise before the banner", () => {
    expect(parseBlenderVersion("Read prefs...\nBlender 5.3.0 Alpha\n")!.text).toBe("5.3.0");
  });
  it("returns null for other programs", () => {
    expect(parseBlenderVersion("ffmpeg version 8.1")).toBeNull();
    expect(parseBlenderVersion("")).toBeNull();
  });
});

describe("version checks", () => {
  it("compares versions", () => {
    expect(compareVersions("5.2.3", "4.2.0")).toBeGreaterThan(0);
    expect(compareVersions([4, 2, 0], [4, 2, 0])).toBe(0);
    expect(compareVersions("4.1.9", [4, 2])).toBeLessThan(0);
  });
  it("requires 4.2 or newer", () => {
    expect(versionOk(parseBlenderVersion("Blender 4.2.0 LTS"))).toBe(true);
    expect(versionOk(parseBlenderVersion("Blender 4.1.1"))).toBe(false);
    expect(versionOk(null)).toBe(false);
  });
  it("reads versions from folder names", () => {
    expect(folderVersion("Blender 5.2")).toEqual([5, 2, 0]);
    expect(folderVersion("blender-4.2.3-windows-x64")).toEqual([4, 2, 3]);
    expect(folderVersion("Blender")).toEqual([0, 0, 0]);
  });
  it("reads Steam library folders", () => {
    const vdf = '"libraryfolders"\n{\n "0"\n {\n  "path"  "C:\\\\Program Files (x86)\\\\Steam"\n }\n "1" { "path" "D:\\\\Games" }\n}';
    expect(steamLibraries(vdf)).toEqual(["C:\\Program Files (x86)\\Steam", "D:\\Games"]);
  });
});

function fakeFs(tree: Record<string, string[]>, files: Record<string, string> = {}) {
  return {
    list: (dir: string) => tree[dir] || [],
    read: (p: string) => files[p] || "",
  };
}

describe("blenderCandidates (Windows)", () => {
  const env = { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local", PATH: "C:\\Tools;C:\\Bin" };
  const fs = fakeFs({
    "C:\\Program Files\\Blender Foundation": ["Blender 4.2", "Blender 5.2", "Blender 4.5", "readme.txt"],
    "C:\\Users\\u\\Downloads": ["blender-5.1.0-windows-x64", "photos"],
  }, { "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf": '"path" "E:\\\\SteamLib"' });
  const c = blenderCandidates({ env: { ...env, CUTSCENE_BLENDER: "D:\\b\\blender.exe" }, platform: "win32", home: "C:\\Users\\u", config: { blender: "E:\\cfg\\blender.exe" }, fs });
  const paths = c.map((x) => x.path);

  it("puts CUTSCENE_BLENDER first, then config.json, then PATH", () => {
    expect(c[0]).toEqual({ path: "D:\\b\\blender.exe", source: "CUTSCENE_BLENDER" });
    expect(c[1]).toEqual({ path: "E:\\cfg\\blender.exe", source: "config.json" });
    expect(c[2]).toEqual({ path: "C:\\Tools\\blender.exe", source: "PATH" });
  });
  it("lists Program Files installs newest first", () => {
    const pf = c.filter((x) => x.source === "Program Files").map((x) => x.path);
    expect(pf.slice(0, 3)).toEqual([
      "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe",
      "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe",
      "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
    ]);
  });
  it("includes Steam (with extra libraries), the Store alias and portable folders", () => {
    expect(paths).toContain("C:\\Program Files (x86)\\Steam\\steamapps\\common\\Blender\\blender.exe");
    expect(paths).toContain("E:\\SteamLib\\steamapps\\common\\Blender\\blender.exe");
    expect(paths).toContain("C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\blender.exe");
    expect(paths).toContain("C:\\Users\\u\\Downloads\\blender-5.1.0-windows-x64\\blender.exe");
    expect(paths.some((p) => p.includes("photos"))).toBe(false);
  });
  it("has no duplicates", () => {
    expect(new Set(paths.map((p) => p.toLowerCase())).size).toBe(paths.length);
  });
});

describe("blenderCandidates (macOS, Linux)", () => {
  it("finds Blender.app bundles", () => {
    const c = blenderCandidates({ env: { PATH: "/usr/bin" }, platform: "darwin", home: "/Users/u", fs: fakeFs({ "/Applications": ["Blender.app", "Safari.app"] }) });
    expect(c.map((x) => x.path)).toContain("/Applications/Blender.app/Contents/MacOS/Blender");
  });
  it("finds system, snap, flatpak and portable installs", () => {
    const c = blenderCandidates({ env: { PATH: "" }, platform: "linux", home: "/home/u", fs: fakeFs({ "/opt": ["blender-5.2.3-linux-x64"] }) });
    const p = c.map((x) => x.path);
    expect(p).toContain("/usr/bin/blender");
    expect(p).toContain("/snap/bin/blender");
    expect(p).toContain("/var/lib/flatpak/exports/bin/org.blender.Blender");
    expect(p).toContain("/opt/blender-5.2.3-linux-x64/blender");
  });
});

describe("findBlender", () => {
  it("skips missing and too-old installs and returns the first good one", async () => {
    const versions: Record<string, string> = { "C:\\old\\blender.exe": "Blender 3.6.5", "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe": "Blender 5.2.3 LTS" };
    const r = await findBlender({
      env: { CUTSCENE_BLENDER: "C:\\missing\\blender.exe", PATH: "C:\\old", ProgramFiles: "C:\\Program Files" },
      platform: "win32",
      config: {},
      detailed: true,
      exists: (p) => p in versions,
      probe: (p) => parseBlenderVersion(versions[p]),
    });
    // Program Files is listed by real directory reads; on machines without it, only the old one exists.
    expect(r.skipped.find((s) => s.source === "CUTSCENE_BLENDER")!.reason).toMatch(/not found/);
    expect(r.skipped.find((s) => s.path === "C:\\old\\blender.exe")!.reason).toMatch(/older than 4\.2/);
  });
  it("returns null when nothing usable exists", async () => {
    const r = await findBlender({ env: { PATH: "" }, platform: "linux", config: {}, exists: () => false, probe: () => null });
    expect(r).toBeNull();
  });
  it("accepts a configured path", async () => {
    const r = await findBlender({ env: { PATH: "" }, platform: "linux", config: { blender: "/x/blender" }, exists: (p) => p === "/x/blender", probe: () => parseBlenderVersion("Blender 4.2.1 LTS") });
    expect(r).toMatchObject({ path: "/x/blender", version: "4.2.1", source: "config.json" });
  });
});

describe("running Blender", () => {
  it("builds headless, factory-startup arguments with the exit code flag", () => {
    const a = blenderArgs("run.py", ["--spec", "s.json"]);
    expect(a.slice(0, 4)).toEqual(["-b", "--factory-startup", "--python-exit-code", "1"]);
    expect(a).toContain("-P");
    expect(a.slice(a.indexOf("--"))).toEqual(["--", "--spec", "s.json"]);
  });
  it("parses machine-readable lines and ignores the rest", () => {
    const ev = parseEvents('Blender 5.2\n@@CS3D@@{"event":"frame","frame":3,"seconds":1.2}\nFra:3 Mem\n@@CS3D@@{bad json\n');
    expect(ev).toEqual([{ event: "frame", frame: 3, seconds: 1.2 }]);
  });
});
