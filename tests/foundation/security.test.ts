// Security rules in the foundation: network paths, the engine lockfile, cloud credentials kept
// from the engine, and engine downloads that must ask first (contracts §9, §10).
import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isNetworkPath, resolveUserPath, ENGINE_JSON } from "../../skills/cutscene/scripts/lib/paths.mjs";
import { CLOUD_ENV, ENGINE_LOCK, engineEnv, readEngineLock, readPin } from "../../skills/cutscene/scripts/lib/engine.mjs";
import { engineDownloadsFor } from "../../skills/cutscene/scripts/lib/engine-downloads.mjs";
import { adjustEngineArgs } from "../../skills/cutscene/scripts/cli.mjs";
import { cleanup, tempDir } from "./helpers.ts";

const roots: string[] = [];
afterAll(() => roots.forEach(cleanup));

describe("network paths", () => {
  it("refuses shares written with any mix of slashes", () => {
    for (const p of ["\\\\server\\share\\a.mp4", "//server/share/a.mp4", "/\\server\\share\\a.mp4", "\\/server/share/a.mp4", "  \\\\server\\x"]) {
      expect(isNetworkPath(p), p).toBe(true);
      expect(() => resolveUserPath(p), p).toThrow(/network paths/);
    }
    for (const p of ["C:\\videos\\a.mp4", "/home/me/a.mp4", "videos/a.mp4", "./a.mp4"]) expect(isNetworkPath(p), p).toBe(false);
  });
});

describe("engine lockfile", () => {
  it("pins every package of the engine at an exact version with a registry checksum", () => {
    const pin = readPin();
    const lock = readEngineLock(pin);
    expect(lock.lockfileVersion).toBe(3);
    const entries = Object.entries(lock.packages).filter(([k]) => k);
    expect(entries.length).toBeGreaterThan(50);
    for (const [name, p] of entries) {
      expect(p.version, name).toMatch(/^\d+\.\d+\.\d+/);
      expect(p.integrity, name).toMatch(/^sha512-/);
      expect(p.resolved, name).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    }
    expect(lock.packages["node_modules/hyperframes"].version).toBe(pin);
  });

  it("refuses a lockfile made for another engine version", () => {
    const root = tempDir();
    roots.push(root);
    const lock = JSON.parse(readFileSync(ENGINE_LOCK, "utf8"));
    lock.packages[""].dependencies.hyperframes = "0.0.1";
    const file = join(root, "engine-lock.json");
    writeFileSync(file, JSON.stringify(lock));
    expect(() => readEngineLock(readPin(), file)).toThrow(/doesn't match/);
    expect(ENGINE_LOCK.replace(/\\/g, "/")).toContain("skills/cutscene/engine-lock.json");
    expect(ENGINE_JSON.replace(/\\/g, "/")).toContain("skills/cutscene/engine.json");
  });
});

describe("engine environment", () => {
  it("never passes cloud credentials to the engine and always turns telemetry off", () => {
    const env = engineEnv({ pin: "0.8.162", home: "/tmp/cs", env: { PATH: "x", GEMINI_API_KEY: "k", openrouter_api_key: "k", HEYGEN_API_KEY: "k", FIGMA_TOKEN: "keep" } });
    for (const name of CLOUD_ENV) expect(env[name], name).toBeUndefined();
    expect(env.openrouter_api_key).toBeUndefined();
    expect(env.FIGMA_TOKEN).toBe("keep");
    expect(env.PATH).toBe("x");
    expect(env.HYPERFRAMES_NO_TELEMETRY).toBe("1");
    expect(env.DO_NOT_TRACK).toBe("1");
    expect(env.HYPERFRAMES_NO_UPDATE_CHECK).toBe("1");
    expect(env.HYPERFRAMES_SKIP_SKILLS).toBe("1");
  });
});

describe("engine downloads ask first", () => {
  const cache = () => {
    const root = tempDir();
    roots.push(root);
    return root;
  };

  it("never lets transcription install whisper.cpp itself", () => {
    expect(adjustEngineArgs("transcribe", ["a.wav", "--runtime-install"])).toEqual(["a.wav", "--no-runtime-install"]);
    expect(adjustEngineArgs("transcribe", ["a.wav", "--no-runtime-install"])).toEqual(["a.wav", "--no-runtime-install"]);
  });

  it("lists the speech model a first transcription would download", () => {
    const dir = cache();
    const plans = engineDownloadsFor("transcribe", ["a.wav", "--model", "base.en"], { cacheDir: dir });
    expect(plans.map((p) => p.id)).toEqual(["whisper-base.en"]);
    expect(plans[0]).toMatchObject({ license: expect.stringMatching(/MIT/), source: expect.stringMatching(/huggingface/) });
    expect(engineDownloadsFor("transcribe", ["words.json"], { cacheDir: dir })).toEqual([]);
    mkdirSync(join(dir, "whisper", "models"), { recursive: true });
    writeFileSync(join(dir, "whisper", "models", "ggml-small.en.bin"), "x");
    expect(engineDownloadsFor("transcribe", ["a.wav"], { cacheDir: dir })).toEqual([]);
    mkdirSync(join(dir, "parakeet", "m"), { recursive: true });
    expect(engineDownloadsFor("transcribe", ["a.wav", "-m", "large-v3"], { cacheDir: dir })).toEqual([]); // auto picks Parakeet
    expect(engineDownloadsFor("transcribe", ["a.wav", "-e", "whisper", "-m", "large-v3"], { cacheDir: dir }).map((p) => p.id)).toEqual(["whisper-large-v3"]);
  });

  it("lists the voice, cut-out and on-device models other commands would download", () => {
    const dir = cache();
    expect(engineDownloadsFor("tts", ["hi"], { cacheDir: dir }).map((p) => p.id)).toEqual(["kokoro"]);
    expect(engineDownloadsFor("remove-background", ["a.mp4"], { cacheDir: dir }).map((p) => p.id)).toEqual(["u2net", "onnxruntime"]);
    expect(engineDownloadsFor("models", ["install", "parakeet"], { cacheDir: dir }).map((p) => p.id)).toEqual(["model-parakeet"]);
    expect(engineDownloadsFor("models", ["list"], { cacheDir: dir })).toEqual([]);
    expect(engineDownloadsFor("check", ["."], { cacheDir: dir })).toEqual([]);
    expect(engineDownloadsFor("tts", ["--help"], { cacheDir: dir })).toEqual([]);
  });
});
