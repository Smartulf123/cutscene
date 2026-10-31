import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { configPath, mergePatch, readConfig, writeConfig } from "../../skills/cutscene/scripts/lib/config.mjs";
import { cutsceneHome, homePaths, isNetworkPath, resolveUserPath } from "../../skills/cutscene/scripts/lib/paths.mjs";
import { cleanup, tempDir } from "./helpers.ts";

let dir: string;
let saved: string | undefined;
beforeEach(() => {
  dir = tempDir();
  saved = process.env.CUTSCENE_HOME;
  process.env.CUTSCENE_HOME = dir;
});
afterEach(() => {
  if (saved === undefined) delete process.env.CUTSCENE_HOME;
  else process.env.CUTSCENE_HOME = saved;
  cleanup(dir);
});

describe("Cutscene home", () => {
  it("uses CUTSCENE_HOME when set, ~/.cutscene otherwise", () => {
    expect(cutsceneHome()).toBe(dir);
    expect(cutsceneHome({})).toBe(join(homedir(), ".cutscene"));
    expect(cutsceneHome({ CUTSCENE_HOME: "  " })).toBe(join(homedir(), ".cutscene"));
    expect(homePaths(dir).media).toBe(join(dir, "media"));
    expect(configPath()).toBe(join(dir, "config.json"));
  });

  it("refuses network paths", () => {
    expect(isNetworkPath("\\\\server\\share\\a.mp4")).toBe(true);
    expect(isNetworkPath("//server/share/a.mp4")).toBe(true);
    expect(isNetworkPath("C:\\videos\\a.mp4")).toBe(false);
    expect(() => resolveUserPath("\\\\server\\share")).toThrow(expect.objectContaining({ code: "NETWORK_PATH" }));
  });
});

describe("readConfig / writeConfig", () => {
  it("returns {} before anything is saved", () => {
    expect(readConfig()).toEqual({});
  });

  it("merges patches, deep-merges objects and removes keys with null", () => {
    writeConfig({ editor: "C:/Tools/editor.exe", voice: { default: "kokoro", seed: 1 } });
    writeConfig({ voice: { seed: 42 } });
    expect(readConfig()).toEqual({ editor: "C:/Tools/editor.exe", voice: { default: "kokoro", seed: 42 } });
    const after = writeConfig({ editor: null });
    expect(after).toEqual({ voice: { default: "kokoro", seed: 42 } });
    expect(readConfig()).toEqual(after);
  });

  it("writes atomically: valid JSON, no temp or lock files left", () => {
    for (let i = 0; i < 20; i++) writeConfig({ n: i });
    expect(JSON.parse(readFileSync(join(dir, "config.json"), "utf8"))).toEqual({ n: 19 });
    expect(readdirSync(dir)).toEqual(["config.json"]);
  });

  it("honours an explicit home over the environment", () => {
    const other = tempDir();
    try {
      writeConfig({ a: 1 }, { home: other });
      expect(readConfig({ home: other })).toEqual({ a: 1 });
      expect(readConfig()).toEqual({});
    } finally {
      cleanup(other);
    }
  });

  it("explains a broken settings file instead of crashing", () => {
    writeFileSync(join(dir, "config.json"), "{ not json");
    expect(() => readConfig()).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }));
    expect(() => writeConfig("nope" as unknown as Record<string, unknown>)).toThrow(expect.objectContaining({ code: "CONFIG_PATCH_INVALID" }));
  });

  it("reads a file saved with a byte-order mark", () => {
    writeFileSync(join(dir, "config.json"), '\uFEFF{"editor":"x"}');
    expect(readConfig()).toEqual({ editor: "x" });
  });
});

describe("mergePatch", () => {
  it("follows JSON merge patch rules", () => {
    expect(mergePatch({ a: 1, b: { c: 2, d: 3 }, e: [1] }, { b: { d: null, f: 4 }, e: [2], g: null })).toEqual({ a: 1, b: { c: 2, f: 4 }, e: [2] });
  });
});
