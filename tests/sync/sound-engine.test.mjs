// Tests for skills/cutscene-audio/scripts/sound-engine.mjs (from overlays/cutscene-audio).
// The offline parts (SFX library, music handling, WAV durations) always run. The voice pass
// needs Cutscene's CLI and the engine's Kokoro model; it skips with a reason when they're missing.
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { cutsceneCli, engineSfxDir, loadSfxHashes, loadSfxLibrary, main, matchSfx, resolveBgm, resolveSfxCues, wavDuration } from "../../skills/cutscene-audio/scripts/sound-engine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = () => mkdtempSync(join(tmpdir(), "cutscene-sound-"));
const sha = (b) => createHash("sha256").update(b).digest("hex");

/** A stand-in for the engine's sound folder: fake files plus their checksums. */
function fakeEngineSfx(names) {
  const dir = tmp();
  const hashes = {};
  for (const n of names) {
    const body = Buffer.from(`fake ${n}`);
    writeFileSync(join(dir, n), body);
    hashes[n] = sha(body);
  }
  return { dir, hashes };
}

function wav(path, seconds, rate = 24000) {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  writeFileSync(path, b);
}

describe("sound engine (offline parts)", () => {
  it("loads the bundled SFX library and matches cue names", () => {
    const lib = loadSfxLibrary();
    expect(Object.keys(lib).length).toBe(19);
    expect(matchSfx("whoosh", lib)).toBe("whoosh");
    expect(matchSfx("whoosh.mp3", lib)).toBe("whoosh");
    expect(matchSfx("UI Click", lib)).toBe("click");
    expect(matchSfx("Impact Bass 1", lib)).toBe("impact-bass-1");
    expect(matchSfx("glass shatter", lib)).toBe(null);
  });

  it("copies matched effects into assets/sfx, dedupes, and never overwrites a different file", () => {
    const p = tmp();
    try {
      mkdirSync(join(p, "assets", "sfx"), { recursive: true });
      writeFileSync(join(p, "assets", "sfx", "pop.mp3"), "not the bundled pop");
      const src = fakeEngineSfx(["whoosh.mp3", "pop.mp3"]);
      const { sfx, anomalies } = resolveSfxCues(
        [
          { id: "01", name: "whoosh" },
          { id: "01", name: "whoosh" },
          { id: "02", name: "pop" },
          { id: "03", name: "laser zap 9000" },
        ],
        p,
        { dir: src.dir, hashes: src.hashes },
      );
      expect(sfx.map((s) => [s.id, s.name, s.file])).toEqual([
        ["01", "whoosh", "assets/sfx/whoosh.mp3"],
        ["02", "pop", "assets/sfx/pop-2.mp3"],
      ]);
      expect(readFileSync(join(p, "assets", "sfx", "pop.mp3"), "utf8")).toBe("not the bundled pop");
      expect(existsSync(join(p, "assets", "sfx", "whoosh.mp3"))).toBe(true);
      expect(sfx.every((s) => s.volume === 0.35 && s.source === "local")).toBe(true);
      expect(anomalies.join("\n")).toMatch(/laser zap 9000/);
    } finally {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it("ships no Pixabay sound files, only names, timings and pinned checksums", () => {
    const lib = loadSfxLibrary();
    const hashes = loadSfxHashes();
    for (const entry of Object.values(lib)) {
      expect(existsSync(join(ROOT, "skills", "cutscene-audio", "sound", "sfx", entry.file))).toBe(false);
      expect(hashes[entry.file]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("skips effects (and says why) when the engine's sound files are missing or altered", () => {
    const p = tmp();
    const src = fakeEngineSfx(["whoosh.mp3"]);
    try {
      const none = resolveSfxCues([{ id: "01", name: "whoosh" }], p, { dir: null, hashes: src.hashes });
      expect(none.sfx).toEqual([]);
      expect(none.anomalies[0]).toMatch(/engine, which isn't installed/);
      const bad = resolveSfxCues([{ id: "01", name: "whoosh" }], p, { dir: src.dir, hashes: { "whoosh.mp3": "0".repeat(64) } });
      expect(bad.sfx).toEqual([]);
      expect(bad.anomalies[0]).toMatch(/checksum/);
      expect(existsSync(join(p, "assets", "sfx", "whoosh.mp3"))).toBe(false);
    } finally {
      rmSync(p, { recursive: true, force: true });
      rmSync(src.dir, { recursive: true, force: true });
    }
  });

  it("uses only the user's own music and never fetches a catalog track", () => {
    const p = tmp();
    try {
      mkdirSync(join(p, "assets", "music"), { recursive: true });
      wav(join(p, "assets", "music", "bed.wav"), 2.5);
      const ok = resolveBgm({ file: "assets/music/bed.wav" }, p);
      expect(ok.bgm).toMatchObject({ path: "assets/music/bed.wav", source: "host", duration_s: 2.5 });
      const none = resolveBgm({ mode: "none" }, p);
      expect(none).toEqual({ bgm: null, anomalies: [] });
      const mood = resolveBgm({ mode: "retrieve", query: "upbeat corporate" }, p);
      expect(mood.bgm).toBe(null);
      expect(mood.anomalies[0]).toMatch(/no music catalog/);
      expect(resolveBgm({ file: "missing.mp3" }, p).anomalies[0]).toMatch(/does not exist/);
    } finally {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it("reads WAV durations from the header", () => {
    const p = tmp();
    try {
      wav(join(p, "a.wav"), 1.25);
      expect(wavDuration(join(p, "a.wav"))).toBe(1.25);
      writeFileSync(join(p, "b.wav"), "nope");
      expect(wavDuration(join(p, "b.wav"))).toBe(null);
    } finally {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it("runs an SFX-only pass end to end and writes the neutral meta (needs the installed engine)", async (ctx) => {
    if (!engineSfxDir()) ctx.skip("the engine isn't installed here, so its sound files aren't available");
    const p = tmp();
    try {
      writeFileSync(join(p, "req.json"), JSON.stringify({ lines: [{ id: "01", sfx: ["riser", "pop"] }], bgm: { mode: "none" } }));
      const code = await main(["--request", join(p, "req.json"), "--hyperframes", p, "--out", join(p, "meta.json"), "--only", "sfx,bgm"]);
      expect(code).toBe(0);
      const meta = JSON.parse(readFileSync(join(p, "meta.json"), "utf8"));
      expect(meta.engine).toBe("cutscene-local");
      expect(meta.sfx.map((s) => s.name)).toEqual(["riser", "pop"]);
      expect(meta.bgm).toBe(null);
      expect(meta.bgm_pending).toBe(false);
    } finally {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it("refuses cloud voice providers", async () => {
    const p = tmp();
    try {
      writeFileSync(join(p, "req.json"), JSON.stringify({ provider: "heygen", lines: [{ id: "01", text: "Hi" }] }));
      expect(await main(["--request", join(p, "req.json"), "--hyperframes", p, "--out", join(p, "m.json")])).toBe(1);
    } finally {
      rmSync(p, { recursive: true, force: true });
    }
  });

  it("makes a real Kokoro line with word timings (needs Cutscene's CLI and the engine)", async (ctx) => {
    if (!cutsceneCli()) ctx.skip("skills/cutscene/scripts/cli.mjs is not built yet (foundation)");
    const p = tmp();
    try {
      writeFileSync(join(p, "req.json"), JSON.stringify({ lines: [{ id: "01", text: "Meet Cutscene." }], bgm: { mode: "none" } }));
      const code = await main(["--request", join(p, "req.json"), "--hyperframes", p, "--out", join(p, "meta.json"), "--only", "tts"]);
      expect(code).toBe(0);
      const meta = JSON.parse(readFileSync(join(p, "meta.json"), "utf8"));
      if (!meta.voices.length) ctx.skip(`the engine could not speak here: ${meta.anomalies.join("; ")}`);
      expect(meta.voices[0].path).toBe("assets/voice/01.wav");
      expect(meta.voices[0].duration_s).toBeGreaterThan(0.3);
    } finally {
      rmSync(p, { recursive: true, force: true });
    }
  }, 600_000);
});

void ROOT;
