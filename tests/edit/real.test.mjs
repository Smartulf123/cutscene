// Real runs on the fixtures with FFmpeg, the local engine (transcription) and, when installed,
// auto-editor and the face detector. Each group skips with its reason when a tool is missing,
// so CI without them stays green. Nothing here downloads anything.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canTranscribe } from "../../skills/cutscene-edit/scripts/lib/engine.mjs";
import { installedPath, pinFor } from "../../skills/cutscene-edit/scripts/lib/install.mjs";
import { hasFfmpeg, noiseFloor, probe } from "../../skills/cutscene-edit/scripts/lib/media.mjs";
import { faceDetectorInstalled } from "../../skills/cutscene-edit/scripts/lib/faces.mjs";
import { checkXml } from "./xml.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const EDIT = join(ROOT, "skills", "cutscene-edit", "scripts", "edit.mjs");
const FX = join(ROOT, "fixtures");
const TALK = join(FX, "talking-head-sample.mp4");
const MUSIC = join(FX, "speech-over-music.mp4");
const RETAKE = join(FX, "real", "retake-demo.mp4");

const FFMPEG = hasFfmpeg();
const ENGINE = canTranscribe();
const AUTO_EDITOR = !!process.env.CUTSCENE_AUTO_EDITOR || !!(pinFor("auto-editor") && installedPath(pinFor("auto-editor")));
const FACES = faceDetectorInstalled();
const why = (ok, reason) => (ok ? "" : ` (skipped: ${reason})`);

let dir;
let out;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cutscene-edit-test-"));
  mkdirSync(join(dir, ".cutscene"), { recursive: true });
  out = join(dir, ".cutscene", "edit");
});
afterAll(() => {
  if (dir && !process.env.CUTSCENE_KEEP_TEST_OUTPUT) rmSync(dir, { recursive: true, force: true });
});

/** Run `cutscene edit` with --json; returns {code, json}. */
function edit(args, env = {}) {
  const r = spawnSync(process.execPath, [EDIT, ...args, "--json"], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env }, windowsHide: true, timeout: 600_000 });
  let json = null;
  try {
    json = JSON.parse(String(r.stdout).trim().split(/\r?\n/).at(-1));
  } catch {
    /* not JSON */
  }
  return { code: r.status, json, stderr: r.stderr };
}
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

describe(`talking head: transcribe, cut silences, retime${why(FFMPEG && ENGINE, "needs FFmpeg and the local engine")}`, () => {
  it.skipIf(!FFMPEG || !ENGINE)("dry run writes the plan but no video; --apply renders a cut whose retimed transcript matches it (±50 ms)", () => {
    const t = edit(["transcribe", TALK, "--out-dir", out]);
    expect(t.code, t.stderr).toBe(0);
    expect(t.json.words).toBeGreaterThan(20);
    expect(existsSync(t.json.phrases)).toBe(true);
    // Cached on the second call.
    expect(edit(["transcribe", TALK, "--out-dir", out]).json.cached).toBe(true);

    const dry = edit(["cut-silences", t.json.transcript]);
    expect(dry.code, dry.stderr).toBe(0);
    expect(dry.json.dryRun).toBe(true);
    expect(dry.json.video.rendered).toBe(false);
    expect(existsSync(dry.json.video.output)).toBe(false);
    expect(dry.json.removed).toBeGreaterThan(2);

    const run = edit(["cut-silences", t.json.transcript, "--apply"]);
    expect(run.code, run.stderr).toBe(0);
    expect(run.json.video.check.ok).toBe(true);
    const retimed = read(run.json.outputs.transcript);
    expect(retimed.timeline).toBe("edited");
    const p = probe(run.json.video.output);
    expect(Math.abs(p.duration - retimed.audio_duration_secs)).toBeLessThanOrEqual(0.05);
    expect(retimed.words.at(-1).end).toBeLessThanOrEqual(p.duration);
    expect(retimed.words.length).toBe(t.json.words);

    const v = edit(["verify", run.json.video.output, "--edl", run.json.outputs.edl]);
    expect(v.code, JSON.stringify(v.json)).toBe(0);
    expect(v.json.words.matchRatio).toBeGreaterThanOrEqual(0.9);

    const page = edit(["review", run.json.outputs.edl, "--edited", run.json.video.output]);
    expect(page.code, page.stderr).toBe(0);
    const html = readFileSync(page.json.review, "utf8");
    expect(html).toContain("Cutscene");
    expect(html).toContain("<video id=\"edit\"");
    expect(page.json.words).toBeGreaterThan(20);

    // The project memory got a line for each step.
    expect(readFileSync(join(dir, ".cutscene", "project.md"), "utf8")).toMatch(/edit cut-silences: .* rendered/);
  });

  it.skipIf(!FFMPEG || !ENGINE)("refuses to cut the already-cut video with original times (TIMELINE_MISMATCH)", () => {
    const tr = join(out, "talking-head-sample.silence-transcript.json");
    writeFileSync(join(out, "none.json"), JSON.stringify({ cuts: [] }));
    const r = edit(["apply-cuts", tr, "--cuts", join(out, "none.json"), "--video", join(out, "talking-head-sample.silenced.mp4")]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("TIMELINE_MISMATCH");
  });

  it.skipIf(!FFMPEG || !ENGINE)("exports FCPXML, FCP7 XML, OTIO and SRT without any download, all structurally valid", () => {
    const edl = join(out, "talking-head-sample.silence-edl.json");
    const fcpxml = edit(["export", edl, "--to", "fcpxml"]);
    expect(fcpxml.code, fcpxml.stderr).toBe(0);
    const x = checkXml(readFileSync(fcpxml.json.output, "utf8"));
    expect(x.ok, x.error).toBe(true);
    expect(x.root).toBe("fcpxml");
    expect(x.tags["asset-clip"]).toBe(read(edl).keep_ranges.length);
    const fcp7 = checkXml(readFileSync(edit(["export", edl, "--to", "fcp7"]).json.output, "utf8"));
    expect(fcp7.ok && fcp7.root === "xmeml").toBe(true);
    expect(JSON.parse(readFileSync(edit(["export", edl, "--to", "otio"]).json.output, "utf8")).OTIO_SCHEMA).toBe("Timeline.1");
    expect(readFileSync(edit(["export", edl, "--to", "srt"]).json.output, "utf8")).toMatch(/^1\r?\n00:00:00,\d{3} --> /);
  });
});

describe(`retake demo: find and apply mistakes${why(FFMPEG && ENGINE && existsSync(RETAKE), "needs FFmpeg, the local engine and fixtures/real/retake-demo.mp4 (local only)")}`, () => {
  it.skipIf(!FFMPEG || !ENGINE || !existsSync(RETAKE))("finds the stutter and the retake, applies the approved ones from the original in one pass", () => {
    const t = edit(["transcribe", RETAKE, "--out-dir", out]);
    expect(t.code, t.stderr).toBe(0);
    const s = edit(["cut-silences", t.json.transcript]);
    expect(s.code, s.stderr).toBe(0);
    const f = edit(["find-cuts", s.json.outputs.transcript]);
    expect(f.code, f.stderr).toBe(0);
    const types = f.json.list.map((c) => c.type);
    expect(types).toContain("stutter");
    const retake = f.json.list.find((c) => c.type === "restart" || c.type === "retake");
    expect(retake, JSON.stringify(f.json.list)).toBeTruthy();
    expect(retake.removes).toMatch(/being the first or anything like that is a huge/);

    const approve = join(out, "retake-demo.approved-cuts.json");
    writeFileSync(approve, JSON.stringify({ approve: f.json.list.filter((c) => c.recommend === "cut").map((c) => c.id) }));
    const a = edit(["apply-cuts", s.json.outputs.transcript, "--cuts", approve, "--apply"]);
    expect(a.code, a.stderr).toBe(0);
    const edl = read(a.json.outputs.edl);
    expect(edl.source.toLowerCase()).toBe(RETAKE.toLowerCase()); // cut from the original
    const retimed = read(a.json.outputs.transcript);
    const text = retimed.words.map((w) => w.text).join(" ");
    expect(text.match(/being the first/g)).toHaveLength(1);
    expect(text).toMatch(/responsibility/);
    const p = probe(a.json.video.output);
    expect(Math.abs(p.duration - retimed.audio_duration_secs)).toBeLessThanOrEqual(0.05);
    const v = edit(["verify", a.json.video.output, "--edl", a.json.outputs.edl]);
    expect(v.code, JSON.stringify(v.json?.problems)).toBe(0);

    const page = edit(["review", a.json.outputs.edl, "--edited", a.json.video.output, "--candidates", f.json.outputs.json]);
    expect(page.code).toBe(0);
    expect(readFileSync(page.json.review, "utf8")).toContain("Copy approved list");
  });
});

describe(`speech over music${why(FFMPEG && ENGINE, "needs FFmpeg and the local engine")}`, () => {
  it.skipIf(!FFMPEG || !ENGINE)("finds the pauses a loudness cutter cannot, without clipping words", () => {
    const t = edit(["transcribe", MUSIC, "--out-dir", out]);
    expect(t.code, t.stderr).toBe(0);
    expect(t.json.refinement.estimated).toBeGreaterThan(0);
    const s = edit(["cut-silences", t.json.transcript, "--apply"]);
    expect(s.code, s.stderr).toBe(0);
    expect(s.json.cuts).toBeGreaterThanOrEqual(2);
    const v = edit(["verify", s.json.video.output, "--edl", s.json.outputs.edl]);
    expect(v.json.words.matchRatio).toBeGreaterThanOrEqual(0.9);
  });
});

describe(`downloads ask first`, () => {
  it.skipIf(!FFMPEG)("rough-cut without auto-editor installed stops with NEEDS_CONSENT and downloads nothing", () => {
    const home = mkdtempSync(join(tmpdir(), "cutscene-home-"));
    try {
      const r = edit(["rough-cut", TALK, "--out-dir", out], { CUTSCENE_HOME: home, CUTSCENE_AUTO_EDITOR: "" });
      expect(r.code).toBe(1);
      expect(r.json.error.code).toBe("NEEDS_CONSENT");
      expect(r.json.error.details).toMatchObject({ name: "auto-editor", version: "31.7.2" });
      expect(existsSync(join(home, "tools"))).toBe(false);
      const f = edit(["reframe", TALK, "--out-dir", out], { CUTSCENE_HOME: home });
      expect(f.json.error.code).toBe("NEEDS_CONSENT");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe(`auto-editor rough cut and editor exports${why(FFMPEG && AUTO_EDITOR, "auto-editor is not installed (cutscene edit install auto-editor --yes)")}`, () => {
  it.skipIf(!FFMPEG || !AUTO_EDITOR)("cuts on loudness, renders, and writes a valid Premiere XML and Resolve FCPXML", () => {
    const r = edit(["rough-cut", TALK, "--out-dir", out, "--apply"]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.json.cuts).toBeGreaterThan(0);
    expect(r.json.video.check.ok).toBe(true);
    const premiere = edit(["export", r.json.outputs.edl, "--to", "premiere"]);
    expect(premiere.code, premiere.stderr).toBe(0);
    const x = checkXml(readFileSync(premiere.json.output, "utf8"));
    expect(x.ok, x.error).toBe(true);
    expect(x.root).toBe("xmeml");
    expect(x.tags.clipitem).toBeGreaterThan(0);
    const resolveX = checkXml(readFileSync(edit(["export", r.json.outputs.edl, "--to", "resolve"]).json.output, "utf8"));
    expect(resolveX.ok && resolveX.root === "fcpxml").toBe(true);
    for (const to of ["shotcut", "kdenlive"]) expect(checkXml(readFileSync(edit(["export", r.json.outputs.edl, "--to", to]).json.output, "utf8")).ok).toBe(true);
  });
  it.skipIf(!FFMPEG || !AUTO_EDITOR)("finds no pauses under constant music (why transcript cutting exists)", () => {
    const r = edit(["rough-cut", MUSIC, "--out-dir", out]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.json.cuts).toBeLessThanOrEqual(1);
  });
});

describe(`framing, sync and sound${why(FFMPEG, "needs FFmpeg")}`, () => {
  it.skipIf(!FFMPEG)("reframes to 9:16 with a centred crop, same length", () => {
    const r = edit(["reframe", TALK, "--center", "--out-dir", out, "--apply"]);
    expect(r.code, r.stderr).toBe(0);
    const p = probe(r.json.output);
    expect([p.width, p.height]).toEqual([1080, 1920]);
    expect(Math.abs(p.duration - probe(TALK).duration)).toBeLessThan(0.1);
  });
  it.skipIf(!FFMPEG || !FACES || !existsSync(RETAKE))(`follows the face${why(FACES, "face detector not installed")}`, () => {
    const r = edit(["reframe", RETAKE, "--out-dir", out, "--apply"]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.json.mode).toBe("faces");
    expect(r.json.facesSeen).toBeGreaterThan(0.8);
  });
  it.skipIf(!FFMPEG)("lines up two recordings by sound", () => {
    const a = join(dir, "a.wav");
    const b = join(dir, "b.wav");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-i", TALK, "-vn", "-ac", "1", a]);
    spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", "2", "-i", TALK, "-vn", "-ac", "1", "-t", "12", b]);
    const r = edit(["sync", a, b]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.json.offset).toBeCloseTo(-2, 1);
    expect(r.json.sure).toBe(true);
  });
  it.skipIf(!FFMPEG)("removes hum and hiss on a copy (noise floor drops)", () => {
    const src = join(FX, "hum-noise.m4a");
    const r = edit(["clean-audio", src, "--out-dir", out, "--apply"]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.json.noiseFloorAfter).toBeLessThan(r.json.noiseFloorBefore - 3);
    expect(noiseFloor(src)).toBeCloseTo(r.json.noiseFloorBefore, 0);
  });
  it.skipIf(!FFMPEG)("measures a 120 BPM track, splices it and mixes to −14 LUFS", () => {
    const g = edit(["music-grid", join(FX, "beat-120bpm.m4a"), "--bpm", "120", "--out", join(out, "grid.json")]);
    expect(g.code, g.stderr).toBe(0);
    expect(g.json.bpm).toBeGreaterThan(119);
    expect(g.json.bpm).toBeLessThan(121);
    const bed = join(out, "bed.wav");
    expect(edit(["splice-music", join(FX, "beat-120bpm.m4a"), "--grid", join(out, "grid.json"), "--segments", "0-8,16-24", "--length", "8", "--out", bed, "--apply"]).code).toBe(0);
    const tap = join(dir, "tap.wav");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=1200:d=0.15", tap]);
    writeFileSync(join(dir, "events.json"), JSON.stringify([{ t: 0.5, file: tap, gain: 0.5 }]));
    const m = edit(["mix", "--bed", bed, "--events", join(dir, "events.json"), "--out", join(out, "master.wav"), "--length", "8", "--apply"]);
    expect(m.code, m.stderr).toBe(0);
    expect(Math.abs(m.json.measured.integratedLufs + 14)).toBeLessThanOrEqual(1);
    expect(m.json.measured.truePeakDbtp).toBeLessThanOrEqual(-1.4);
    expect(edit(["loudness", join(out, "master.wav")]).code).toBe(0);
  });
});
