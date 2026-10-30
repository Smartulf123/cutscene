// Real runs with the installed models: design a voice with OmniVoice, speak 3 lines with a fixed
// seed, verify all three with faster-whisper, speak one line again with the same seed and get the
// same audio, and check the licence notes. Skips with a reason when the models aren't installed
// (CI). Takes several minutes on a CPU. Set CUTSCENE_VOICE_REAL=0 to skip on purpose.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { voiceStatus } from "../../skills/cutscene-voice/scripts/lib/status.mjs";
import { compareWavs, wavInfo } from "../../skills/cutscene-voice/scripts/lib/wav.mjs";

const VOICE = fileURLToPath(new URL("../../skills/cutscene-voice/scripts/voice.mjs", import.meta.url));
const status = await voiceStatus({ voicestudio: false });
const has = (id) => status.models.find((m) => m.id === id)?.installed;
const ready = has("omnivoice") && has("whisper");
const skipReason = process.env.CUTSCENE_VOICE_REAL === "0" ? "CUTSCENE_VOICE_REAL=0" : !ready ? "OmniVoice and Whisper aren't installed (cutscene voice setup)" : null;
if (skipReason) console.log(`[voice real tests] skipped: ${skipReason}`);

const LINES = [
  ["b1", "Meet Cutscene, a video studio that lives in your terminal."],
  ["b2", "Design a voice once, and every line sounds like the same person."],
  ["b3", "Each line is checked by ear before it ships."],
];

let project;
afterAll(() => {
  if (project && process.env.CUTSCENE_VOICE_KEEP !== "1") rmSync(project, { recursive: true, force: true });
});

function voice(args) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [VOICE, ...args, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const json = JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
  return { code: r.status, json, seconds: (Date.now() - t0) / 1000, stderr: r.stderr };
}

describe.skipIf(!!skipReason)("real voices on this computer", () => {
  it("designs, speaks 3 lines with a fixed seed, verifies them, and repeats a line exactly", { timeout: 60 * 60 * 1000 }, () => {
    project = mkdtempSync(join(tmpdir(), "cutscene-voice-real-"));
    mkdirSync(join(project, ".cutscene"), { recursive: true });
    const sheet = {
      version: 1, fps: 30, format: "landscape", width: 1920, height: 1080, duration: 15.0,
      beats: LINES.map(([id, line], i) => ({ id, start: i * 5, end: i * 5 + 5, voice: { speaker: "narrator", line } })),
    };
    writeFileSync(join(project, ".cutscene", "beats.json"), JSON.stringify(sheet, null, 2) + "\n");

    // 1. design
    const d = voice(["design", "--project", project, "--speaker", "narrator", "--describe", "female, young adult, american accent", "--sample", "Hi! I'm so glad you're here.", "--seed", "42"]);
    console.log(`[voice real] design: ${d.seconds.toFixed(0)} s total; ${JSON.stringify(d.json.takes?.map((t) => ({ seed: t.seed, seconds: t.seconds, duration: t.duration })))}`);
    expect(d.code, d.json?.error?.message).toBe(0);
    expect(existsSync(join(project, ".cutscene", "voice", "narrator-ref.wav"))).toBe(true);
    expect(d.json.voice.reference_verified).toBe(true);

    // 2. speak all three (speak runs verify too)
    const s = voice(["speak", "--project", project]);
    console.log(`[voice real] speak+verify 3 lines: ${s.seconds.toFixed(0)} s total; per line: ${JSON.stringify((s.json.lines || s.json.spoken || []).map((l) => ({ id: l.id, seconds: l.seconds, duration: l.duration })))}`);
    expect(s.code, s.json?.error?.message).toBe(0);
    expect(s.json.verified).toBe(true);
    const after = JSON.parse(readFileSync(join(project, ".cutscene", "beats.json"), "utf8"));
    for (const [id] of LINES) {
      const b = after.beats.find((x) => x.id === id);
      expect(b.voice.verified).toBe(true);
      expect(b.voice.seed).toBe(42);
      expect(b.voice.words.length).toBeGreaterThan(5);
      expect(b.voice.duration).toBeGreaterThan(1);
      const info = wavInfo(join(project, b.voice.file));
      expect(info.sampleRate).toBeGreaterThanOrEqual(24000);
      expect(info.channels).toBe(1);
      const lic = readFileSync(join(project, "assets", "voice", `${id}.license.txt`), "utf8");
      expect(lic).toContain("CC-BY-NC-4.0");
      expect(lic).toContain("NON-COMMERCIAL");
    }
    const report = JSON.parse(readFileSync(join(project, ".cutscene", "voice", "verify.json"), "utf8"));
    expect(report.lines.every((l) => l.verified)).toBe(true);

    // 3. same seed, same line, same audio
    const take = join(project, after.beats[2].voice.take);
    const first = join(project, "first-take.wav");
    copyFileSync(take, first);
    const again = voice(["speak", "--project", project, "--beats", "b3", "--no-verify"]);
    expect(again.code, again.json?.error?.message).toBe(0);
    const cmp = compareWavs(first, take);
    console.log(`[voice real] same seed twice: identical=${cmp.identical}, correlation=${cmp.correlation.toFixed(6)}, ${again.seconds.toFixed(0)} s`);
    expect(cmp.correlation).toBeGreaterThan(0.999);
  });
});
