// Node-side tests for `cutscene voice`: arguments, consent, beats.json updates, WAV parsing,
// loudness parsing, licence notes, setup plans, VoiceStudio absent. No models needed.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseArgs } from "../../skills/cutscene-voice/scripts/voice.mjs";
import { parseFlags, VoiceError } from "../../skills/cutscene-voice/scripts/lib/util.mjs";
import { appendProjectNote, checkConsent, licenseText, recordConsent } from "../../skills/cutscene-voice/scripts/lib/project.mjs";
import { mergePatch, patchBeat, patchSheet, readBeats } from "../../skills/cutscene-voice/scripts/lib/beatsio.mjs";
import { compareWavs, parseWav, wavInfo } from "../../skills/cutscene-voice/scripts/lib/wav.mjs";
import { loudnormFilter, parseLoudnorm } from "../../skills/cutscene-voice/scripts/lib/audio.mjs";
import { groupsFor, pinsFor, requirementsText, setupPlan, torchWheelsFor } from "../../skills/cutscene-voice/scripts/lib/setup.mjs";
import { voiceStudioHealth, voiceStudioUrl, wordsFromVerbose } from "../../skills/cutscene-voice/scripts/lib/voicestudio.mjs";
import { voiceStatus } from "../../skills/cutscene-voice/scripts/lib/status.mjs";
import { isNetworkPath, projectFile, resolveUserPath, safeName } from "../../skills/cutscene-voice/scripts/lib/paths.mjs";
import { kokoroCache, kokoroSpeak } from "../../skills/cutscene-voice/scripts/lib/kokoro.mjs";
import { chooseModel, estimateRun } from "../../skills/cutscene-voice/scripts/lib/commands.mjs";
import type { PlanItem } from "../../skills/cutscene-voice/scripts/lib/setup.mjs";

/** The one JSON object voice.mjs prints under --json (only the fields these tests read). */
type CliJson = { ok: boolean; error: { code: string; message: string; hint: string }; plan: { items: PlanItem[] }; dry_run?: boolean; commands: string[] };

const VOICE = fileURLToPath(new URL("../../skills/cutscene-voice/scripts/voice.mjs", import.meta.url));
let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "cutscene-voice-test-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Run voice.mjs as the user would, with an empty CUTSCENE_HOME. */
function cli(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [VOICE, ...args], { encoding: "utf8", env: { ...process.env, CUTSCENE_HOME: join(tmp, "home"), CUTSCENE_VOICESTUDIO_URL: "http://127.0.0.1:9", ...env } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json: (() => { try { return JSON.parse(r.stdout.trim().split(/\r?\n/).pop()!) as CliJson; } catch { return null; } })()! };
}

const SHEET = `{
    "version": 1,
    "fps": 30,
    "format": "landscape",
    "width": 1920,
    "height": 1080,
    "duration": 12.0,
    "beats": [
        { "id": "b1", "start": 0.0, "end": 2.4, "label": "logo reveal",
          "voice": { "speaker": "narrator", "line": "Meet Cutscene." },
          "shot3d": { "spec": ".cutscene/3d/logo.json", "tier": 2 } },
        { "id": "b2", "start": 2.4, "end": 6.0, "graphics": [{ "id": "g1", "kind": "title", "text": "Hi" }] }
    ]
}
`;

function makeProject(name: string) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, ".cutscene"), { recursive: true });
  writeFileSync(join(dir, ".cutscene", "beats.json"), SHEET);
  return dir;
}

/** A tiny 16-bit mono WAV with a sine tone. */
function writeTone(file: string, { seconds = 0.5, rate = 24000, freq = 440, amp = 0.3 }: { seconds?: number; rate?: number; freq?: number; amp?: number } = {}) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * 32767), 44 + i * 2);
  writeFileSync(file, buf);
  return file;
}

describe("arguments", () => {
  it("parses flags, lists and booleans", () => {
    const { flags } = parseFlags(["--beats", "b1,b2", "--beats=b3", "--retry", "--seed", "7", "--describe=female, young adult"], { beats: "list", retry: "bool", seed: "int", describe: "string" });
    expect(flags).toEqual({ beats: ["b1", "b2", "b3"], retry: true, seed: 7, describe: "female, young adult" });
  });
  it("rejects unknown flags, missing values and bad numbers as usage errors", () => {
    expect(() => parseArgs(["speak", "--nope"])).toThrow(/Unknown option --nope/);
    expect(() => parseArgs(["design", "--speaker"])).toThrow(/needs a value/);
    expect(() => parseArgs(["design", "--seed", "x"])).toThrow(/whole number/);
    expect(() => parseArgs(["fly"])).toThrow(/Unknown voice command/);
  });
  it("lets status take the project as a plain argument", () => {
    expect(parseArgs(["status", "my-video"]).flags.project).toBe("my-video");
  });
  it("prints help and exits 2 on wrong usage, with one JSON object under --json", () => {
    expect(cli(["help"]).code).toBe(0);
    const bad = cli(["speak", "--bogus", "--json"]);
    expect(bad.code).toBe(2);
    expect(bad.json).toMatchObject({ ok: false, error: { code: "USAGE" } });
  });
});

describe("paths", () => {
  it("refuses network paths and odd names", () => {
    expect(isNetworkPath("\\\\server\\share\\a.wav")).toBe(true);
    expect(isNetworkPath("//server/share")).toBe(true);
    expect(() => resolveUserPath("\\\\server\\x.wav")).toThrow(VoiceError);
    expect(safeName("narrator")).toBe("narrator");
    expect(safeName("b 1/../x")).toBe("b-1-..-x");
    expect(() => safeName("..")).toThrow();
  });

  it("refuses shares written with mixed slashes", () => {
    expect(isNetworkPath("/\\server\\share\\a.wav")).toBe(true);
    expect(isNetworkPath("\\/server/share/a.wav")).toBe(true);
    expect(() => resolveUserPath("/\\server\\x.wav")).toThrow(VoiceError);
  });

  it("keeps beats.json file fields inside the project", () => {
    const project = join(tmp, "contained");
    expect(projectFile(project, ".cutscene/voice/narrator-ref.wav", "ref")).toBe(join(project, ".cutscene", "voice", "narrator-ref.wav"));
    expect(projectFile(project, "", "ref")).toBe(null);
    expect(projectFile(project, undefined, "ref")).toBe(null);
    for (const bad of ["../../secret.wav", "assets/../../x.wav", "C:\\Windows\\x.wav", "/etc/passwd", "\\\\server\\share\\x.wav", "//server/x.pt"]) {
      expect(() => projectFile(project, bad, "voices.narrator.prompt"), bad).toThrow(/inside the project|outside the project/);
    }
  });
});

describe("built-in voice download", () => {
  it("asks before Kokoro's first download", async (ctx) => {
    const c = kokoroCache();
    if (existsSync(c.model) && existsSync(c.voices)) ctx.skip("Kokoro is already downloaded on this computer, so nothing would be asked");
    await expect(kokoroSpeak({ text: "Hi", out: join(tmp, "k.wav"), home: tmp })).rejects.toMatchObject({ code: "NEEDS_CONSENT" });
  });
});

describe("consent", () => {
  it("refuses to clone without consent, before touching anything", () => {
    const project = makeProject("consent");
    const r = cli(["clone", "--project", project, "--speaker", "host", "--from", join(tmp, "missing.wav"), "--text", "hello there", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("CONSENT_REQUIRED");
    expect(existsSync(join(project, ".cutscene", "voice"))).toBe(false);
    expect(readFileSync(join(project, ".cutscene", "beats.json"), "utf8")).toBe(SHEET);
  });
  it("refuses placeholder consent", () => {
    expect(() => checkConsent("")).toThrow(/permission/);
    expect(() => checkConsent("yes")).toThrow(/who gave permission/);
    expect(checkConsent("Maya, it is my own voice")).toBe("Maya, it is my own voice");
  });
  it("records consent in project.md without rewriting earlier notes", () => {
    const md = join(tmp, "notes", "project.md");
    mkdirSync(join(tmp, "notes"), { recursive: true });
    writeFileSync(md, "# Project notes\n\n- brief approved\n");
    recordConsent(md, { speaker: "host", source: "me.wav", consent: "Maya, my own voice", model: "omnivoice" });
    appendProjectNote(md, "Voice consent", "second note");
    const text = readFileSync(md, "utf8");
    expect(text.startsWith("# Project notes\n\n- brief approved\n")).toBe(true);
    expect(text.match(/## Voice consent/g)).toHaveLength(1);
    expect(text).toMatch(/cloned voice "host" from me\.wav with omnivoice\. Permission: Maya, my own voice/);
    expect(text.trim().endsWith("- second note")).toBe(true);
  });
});

describe("beats.json updates", () => {
  it("merge patches like RFC 7386", () => {
    expect(mergePatch({ a: 1, b: { c: 2, d: 3 } }, { b: { c: null, e: 4 }, f: [1] })).toEqual({ a: 1, b: { d: 3, e: 4 }, f: [1] });
  });
  for (const mode of ["foundation", "fallback"]) {
    it(`fills only voice fields and keeps the rest (${mode})`, async () => {
      if (mode === "fallback") process.env.CUTSCENE_VOICE_NO_FOUNDATION = "1";
      try {
        const mod = { patchBeat, patchSheet };
        const project = makeProject(`beats-${mode}`);
        const file = join(project, ".cutscene", "beats.json");
        await mod.patchSheet(file, { voices: { narrator: { model: "omnivoice", seed: 42, reference: ".cutscene/voice/narrator-ref.wav" } } });
        await mod.patchBeat(file, "b1", { voice: { file: "assets/voice/b1.wav", duration: 1.1, verified: false, words: null } });
        await mod.patchBeat(file, "b1", { voice: { verified: true, words: [{ w: "Meet", start: 0, end: 0.3, p: 0.9 }] } });
        const after = readFileSync(file, "utf8");
        const sheet = JSON.parse(after);
        expect(sheet.beats[0].voice).toEqual({ speaker: "narrator", line: "Meet Cutscene.", file: "assets/voice/b1.wav", duration: 1.1, verified: true, words: [{ w: "Meet", start: 0, end: 0.3, p: 0.9 }] });
        expect(sheet.beats[0].shot3d).toEqual({ spec: ".cutscene/3d/logo.json", tier: 2 });
        expect(sheet.beats[1]).toEqual(JSON.parse(SHEET).beats[1]);
        expect(sheet.voices.narrator.seed).toBe(42);
        if (mode === "foundation") {
          // the foundation splices text: other fields keep their exact spelling
          expect(after).toContain('"duration": 12.0');
          expect(after).toContain('"start": 2.4, "end": 6.0, "graphics": [{ "id": "g1", "kind": "title", "text": "Hi" }]');
        } else {
          expect(after).toMatch(/\n {4}"version": 1/); // indentation kept
        }
        await expect(mod.patchBeat(file, "nope", { voice: {} })).rejects.toThrow();
      } finally {
        delete process.env.CUTSCENE_VOICE_NO_FOUNDATION;
      }
    });
  }
  it("says how to fix a missing beat sheet", async () => {
    await expect(readBeats(join(tmp, "nowhere", "beats.json"))).rejects.toMatchObject({ code: "BEATS_NOT_FOUND" });
  });
});

describe("WAV and loudness", () => {
  it("reads WAV headers and compares takes", () => {
    const a = writeTone(join(tmp, "a.wav"), { seconds: 0.5 });
    const b = writeTone(join(tmp, "b.wav"), { seconds: 0.5 });
    const c = writeTone(join(tmp, "c.wav"), { seconds: 0.5, freq: 300 });
    expect(wavInfo(a)).toMatchObject({ sampleRate: 24000, channels: 1, bits: 16, frames: 12000, duration: 0.5 });
    expect(compareWavs(a, b)).toMatchObject({ identical: true, correlation: 1 });
    expect(compareWavs(a, c).identical).toBe(false);
    expect(compareWavs(a, c).correlation).toBeLessThan(0.5);
    expect(() => parseWav(Buffer.from("nope"))).toThrow(/Not a WAV/);
  });
  it("parses loudnorm's measurement and builds the linear second pass", () => {
    const log = `[Parsed_loudnorm_1 @ 0x1]\n{\n\t"input_i" : "-27.31",\n\t"input_tp" : "-9.02",\n\t"input_lra" : "3.10",\n\t"input_thresh" : "-37.6",\n\t"output_i" : "-16.1",\n\t"target_offset" : "0.12"\n}\n`;
    const m = parseLoudnorm(log);
    expect(m).toMatchObject({ input_i: -27.31, input_tp: -9.02, target_offset: 0.12 });
    expect(loudnormFilter(m!)).toContain("measured_I=-27.31");
    expect(loudnormFilter(m!)).toContain("linear=true");
    expect(parseLoudnorm("no json here")).toBeNull();
  });
});

describe("licence notes", () => {
  it("writes model, licence and attribution, and flags non-commercial", () => {
    const t = licenseText({ beatId: "b1", file: "assets/voice/b1.wav", line: "Meet Cutscene.", model: "omnivoice", speaker: "narrator", voice: { design: "female, young adult, american accent" }, seed: 42 });
    expect(t).toContain("Licence: CC-BY-NC-4.0 (NON-COMMERCIAL");
    expect(t).toContain("k2-fsa/OmniVoice");
    expect(t).toContain("Attribution:");
    expect(t).toContain("seed 42");
    const k = licenseText({ beatId: "b2", file: "x.wav", line: "Hi", model: "kokoro", speaker: "n", voice: { preset: "af_heart" } });
    expect(k).toContain("Licence: Apache-2.0");
    expect(k).not.toContain("NON-COMMERCIAL");
    const c = licenseText({ beatId: "b3", file: "x.wav", line: "Hi", model: "voxcpm2", speaker: "host", voice: { cloned_from: "me.wav", consent: "Maya" }, seed: 1 });
    expect(c).toContain("cloned from me.wav (permission: Maya)");
  });
});

describe("setup", () => {
  it("plans without downloading and refuses without --yes (NEEDS_CONSENT)", () => {
    const r = cli(["setup", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("NEEDS_CONSENT");
    expect(r.json.plan.items.map((i) => i.id)).toEqual(["environment", "omnivoice", "whisper"]);
    const om = r.json.plan.items.find((i) => i.id === "omnivoice")!;
    expect(om).toMatchObject({ license: "CC-BY-NC-4.0", commercial_use: false });
    expect(om.download_bytes).toBeGreaterThan(3e9);
    expect(existsSync(join(tmp, "home", "voice", "venv"))).toBe(false);
  });
  it("VoxCPM2 installs on demand: the dry run shows the exact steps and installs nothing", () => {
    const r = cli(["setup", "--model", "voxcpm2", "--dry-run", "--yes", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.dry_run).toBe(true);
    expect(r.json.commands.join("\n")).toMatch(/voxcpm==2\.0\.3/);
    expect(r.json.commands.join("\n")).toMatch(/--uploaded-prior-to 2026-10-15T00:00:00Z/);
    expect(r.json.commands.join("\n")).toMatch(/openbmb\/VoxCPM2/);
    expect(existsSync(join(tmp, "home", "voice"))).toBe(false);
  });
  it("pins, groups and hashed requirement lines", () => {
    expect(groupsFor(["omnivoice", "whisper"])).toEqual(["base", "omnivoice", "whisper"]);
    expect(pinsFor(["whisper"])).toEqual(["faster-whisper==1.2.1"]);
    expect(requirementsText([{ name: "pip", version: "26.2.1", sha256: "ab" }])).toBe("pip==26.2.1 --hash=sha256:ab\n");
    expect(torchWheelsFor({ platform: "win32", machine: "AMD64", major: 3, minor: 12 })).toHaveLength(2);
    expect(torchWheelsFor({ platform: "linux", machine: "x86_64", major: 3, minor: 12 })).toBeNull();
    const plan = setupPlan(["whisper"], { home: join(tmp, "plan-home") });
    expect(plan.items.map((i) => i.kind)).toEqual(["python", "model"]);
  });
});

describe("VoiceStudio absent", () => {
  it("reports cleanly when nothing answers", async () => {
    const h = await voiceStudioHealth({ url: "http://127.0.0.1:9", timeoutMs: 500 });
    expect(h.running).toBe(false);
    expect(h.detail).toMatch(/Not running/);
  });
  it("only talks to VoiceStudio on this computer", () => {
    expect(voiceStudioUrl("http://127.0.0.1:3900/")).toBe("http://127.0.0.1:3900");
    expect(() => voiceStudioUrl("http://example.com:3900")).toThrow(/only uses VoiceStudio on this computer/);
  });
  it("gives a clean message when VoiceStudio is chosen but not running", () => {
    const project = makeProject("vs");
    const r = cli(["design", "--project", project, "--speaker", "n", "--describe", "female", "--model", "voicestudio", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("VOICESTUDIO_NOT_RUNNING");
    expect(r.json.error.hint).toMatch(/Start the VoiceStudio app/);
  });
  it("reads OpenAI-style verbose transcripts", () => {
    expect(wordsFromVerbose({ words: [{ word: " Hi", start: 0, end: 0.2 }] })).toEqual([{ w: "Hi", start: 0, end: 0.2 }]);
    expect(wordsFromVerbose({ segments: [{ words: [{ word: "Yo", start: 1, end: 1.1, probability: 0.8 }] }] })).toEqual([{ w: "Yo", start: 1, end: 1.1, p: 0.8 }]);
  });
  it("status works with nothing installed and says how to fix it", async () => {
    const s = await voiceStatus({ home: join(tmp, "empty-home"), timeoutMs: 300 });
    expect(s.ok).toBe(false);
    expect(s.fix).toMatch(/cutscene voice setup/);
    expect(s.models.map((m) => m.id)).toEqual(["omnivoice", "whisper", "voxcpm2", "kokoro"]);
    expect(s.voicestudio.running).toBe(false);
  });
});

describe("model choice", () => {
  const status = (installed: string[], vs = false) => ({ models: ["omnivoice", "whisper", "voxcpm2"].map((id) => ({ id, installed: installed.includes(id) })), voicestudio: { running: vs } });
  it("prefers installed local models, then VoiceStudio, then Kokoro", () => {
    expect(chooseModel(undefined, status(["omnivoice"]))).toBe("omnivoice");
    expect(chooseModel(undefined, status(["voxcpm2"]))).toBe("voxcpm2");
    expect(chooseModel(undefined, status([], true))).toBe("voicestudio");
    expect(chooseModel(undefined, status([]))).toBe("kokoro");
  });
  it("explains what to install", () => {
    const hintOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (err) {
        return `${(err as VoiceError).message} ${(err as VoiceError).hint}`;
      }
      return "";
    };
    expect(hintOf(() => chooseModel("omnivoice", status([])))).toMatch(/voice setup --model omnivoice/);
    expect(() => chooseModel("kokoro", status([]), { clone: true })).toThrow(/preset voices only/);
    expect(() => chooseModel(undefined, status([]), { clone: true })).toThrow(/OmniVoice or VoxCPM2/);
  });
  it("estimates run time from the benchmark", () => {
    expect(estimateRun("omnivoice", ["a b c d e f g h"], { models: { omnivoice: { rtf: 20, load_seconds: 10 } } })).toBeGreaterThan(60);
    expect(estimateRun("omnivoice", ["x"], null)).toBeNull();
  });
});

describe("one-shot speak (sound engine form)", async () => {
  const { pickOneShotVoice, isOneShot } = await import("../../skills/cutscene-voice/scripts/lib/oneshot.mjs");
  const presets = ["af_heart", "am_michael"];
  it("is chosen by --text-file / --out", () => {
    expect(isOneShot({ "text-file": "a.txt", out: "a.wav" })).toBe(true);
    expect(isOneShot({ project: "x" })).toBe(false);
  });
  it("picks a project speaker, then a Kokoro preset, then defaults", () => {
    const voices = { narrator: { model: "omnivoice", seed: 42 } };
    expect(pickOneShotVoice({ wanted: "narrator", voices, presets }).speaker).toBe("narrator");
    expect(pickOneShotVoice({ wanted: "am_michael", voices, presets }).voice).toEqual({ model: "kokoro", preset: "am_michael" });
    expect(pickOneShotVoice({ wanted: "nobody", voices, presets }).error).toBe("nobody");
    expect(pickOneShotVoice({ voices, presets }).speaker).toBe("narrator");
    expect(pickOneShotVoice({ voices: {}, presets, describe: "male" }).design).toBe(true);
    expect(pickOneShotVoice({ voices: {}, presets }).voice!.preset).toBe("af_heart");
  });
  it("needs --out and a non-empty line", () => {
    const r = cli(["speak", "--text-file", join(tmp, "nope.txt"), "--out", join(tmp, "x.wav"), "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("FILE_NOT_FOUND");
  });
});
