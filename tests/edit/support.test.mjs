import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../../skills/cutscene-edit/scripts/lib/cli.mjs";
import { parseEbur128, parseSilences, quietestTenth } from "../../skills/cutscene-edit/scripts/lib/media.mjs";
import { isNetworkPath, stemOf } from "../../skills/cutscene-edit/scripts/lib/paths.mjs";
import { pinFor, platformKey, sizeText, untar } from "../../skills/cutscene-edit/scripts/lib/install.mjs";
import { buildReviewHtml, joinsFor, markCutWords, peaks } from "../../skills/cutscene-edit/scripts/lib/review-page.mjs";
import { buildEdl } from "../../skills/cutscene-edit/scripts/lib/edl.mjs";
import { compareWords } from "../../skills/cutscene-edit/scripts/commands/review.mjs";
import { silenceThreshold } from "../../skills/cutscene-edit/scripts/commands/cut.mjs";

describe("arguments", () => {
  const spec = { gap: { type: "number" }, apply: { type: "boolean" }, out: { type: "string", alias: "o" }, refine: { type: "boolean", default: true } };
  it("parses flags, values, aliases, negation and positionals", () => {
    const r = parseArgs(["t.json", "--gap", "0.4", "--apply", "-o", "x.mp4", "--no-refine", "--json"], spec);
    expect(r.positional).toEqual(["t.json"]);
    expect(r.opts).toMatchObject({ gap: 0.4, apply: true, out: "x.mp4", refine: false, json: true });
    expect(parseArgs(["--gap=0.3"], spec).opts.gap).toBe(0.3);
  });
  it("rejects unknown options and bad numbers as wrong usage (exit 2)", () => {
    expect(() => parseArgs(["--nope"], spec)).toThrow(/Unknown option/);
    try {
      parseArgs(["--gap", "soon"], spec);
    } catch (e) {
      expect(e.exitCode).toBe(2);
      expect(e.code).toBe("WRONG_USAGE");
    }
  });
});

describe("media parsers", () => {
  it("reads silencedetect output, closing an open silence at the end", () => {
    const s = "[silencedetect] silence_start: 0\n[silencedetect] silence_end: 1.58 | silence_duration: 1.58\n[silencedetect] silence_start: 17.7";
    expect(parseSilences(s, 19.3)).toEqual([{ start: 0, end: 1.58 }, { start: 17.7, end: 19.3 }]);
  });
  it("reads the EBU R128 summary", () => {
    const s = "  Integrated loudness:\n    I:         -14.2 LUFS\n    Threshold: -24.3 LUFS\n\n  Loudness range:\n    LRA:         0.4 LU\n\n  True peak:\n    Peak:       -1.8 dBFS";
    expect(parseEbur128("noise Summary:\n" + s)).toEqual({ integratedLufs: -14.2, rangeLu: 0.4, truePeakDbtp: -1.8 });
  });
  it("finds the noise floor as the quietest tenth and sets the silence threshold above it", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `lavfi.astats.Overall.RMS_level=${i < 2 ? -60 : -20}`).join("\n");
    expect(quietestTenth(lines)).toBe(-60);
    expect(quietestTenth("RMS_level=-inf")).toBe(-120);
    expect(silenceThreshold(-120)).toBe(-50);
    expect(silenceThreshold(-60)).toBe(-42);
    expect(silenceThreshold(-20)).toBe(-30);
  });
});

describe("paths", () => {
  it("refuses network paths", () => {
    expect(isNetworkPath("\\\\server\\share\\a.mp4")).toBe(true);
    expect(isNetworkPath("//server/share/a.mp4")).toBe(true);
    expect(isNetworkPath("C:\\videos\\a.mp4")).toBe(false);
    expect(isNetworkPath("\\\\?\\C:\\long\\path.mp4")).toBe(false);
    // Windows also reads mixed slashes as a share; a long-path share is still a share.
    expect(isNetworkPath("/\\server\\share\\a.mp4")).toBe(true);
    expect(isNetworkPath("\\/server/share/a.mp4")).toBe(true);
    expect(isNetworkPath("\\\\?\\UNC\\server\\share\\a.mp4")).toBe(true);
    expect(isNetworkPath("//?/C:/long/path.mp4")).toBe(false);
  });
  it("refuses a network source path recorded inside a transcript or edit list", async () => {
    const { sourceMedia } = await import("../../skills/cutscene-edit/scripts/lib/workflow.mjs");
    expect(() => sourceMedia({ transcript: { source: "\\\\server\\share\\take.mp4" }, parent: null })).toThrow(/network paths/);
    expect(() => sourceMedia({ transcript: {}, parent: { source: "//server/share/take.mp4" } })).toThrow(/network paths/);
  });
  it("strips Cutscene's own suffixes from names", () => {
    expect(stemOf("C:/x/raw take.mp4")).toBe("raw take");
    expect(stemOf("raw.silence-transcript.json")).toBe("raw");
    expect(stemOf("raw.mistakes-edl.json")).toBe("raw");
    expect(stemOf("raw.transcript.json")).toBe("raw");
  });
});

describe("downloads", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../skills/cutscene-edit/assets/manifest.json", import.meta.url), "utf8"));
  it("pins every download exactly, with a SHA-256, size, licence and source (contracts §9)", () => {
    for (const p of manifest.pins) {
      expect(p.version).toMatch(/^[\w.+-]+$/);
      expect(p.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(p.size).toBeGreaterThan(0);
      expect(p.url).toMatch(/^https:\/\//);
      expect(p.license).toBeTruthy();
      expect(p.source).toBeTruthy();
    }
  });
  it("only pins versions at least 14 days old", () => {
    const today = new Date("2026-10-29T00:00:00Z").getTime();
    for (const p of manifest.pins) expect((today - new Date(p.published).getTime()) / 86_400_000).toBeGreaterThanOrEqual(14);
  });
  it("has auto-editor for every common platform", () => {
    for (const k of ["win32-x64", "win32-arm64", "darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]) expect(pinFor("auto-editor", k)?.version).toBe("31.7.2");
    expect(platformKey("win32", "x64")).toBe("win32-x64");
    expect(sizeText(44701696)).toBe("42.6 MB");
  });
  it("unpacks an npm-style tarball", () => {
    const header = (name, size) => {
      const h = Buffer.alloc(512);
      h.write(name, 0);
      h.write("0000644\0", 100);
      h.write(size.toString(8).padStart(11, "0") + "\0", 124);
      h.write("0", 156);
      h.write("ustar\0", 257);
      return h;
    };
    const body = Buffer.from("hello");
    const tar = Buffer.concat([header("package/a.txt", body.length), body, Buffer.alloc(512 - body.length), Buffer.alloc(1024)]);
    const files = untar(gunzipSync(gzipSync(tar)));
    expect(files).toEqual([{ name: "package/a.txt", data: body }]);
  });
});

describe("review page", () => {
  const edl = buildEdl({ deletes: [{ start: 1, end: 2, reason: "pause 1.20 s" }], duration: 4, fps: 30, tool: "cut-silences" });
  it("places each join on the edited video and marks cut words", () => {
    expect(joinsFor(edl)[0].out).toBe(1);
    expect(markCutWords([{ text: "a", start: 0.2, end: 0.5 }, { text: "b", start: 1.2, end: 1.5 }], edl).map((w) => w.c)).toEqual([0, 1]);
  });
  it("normalises waveform peaks", () => {
    const p = peaks(new Float32Array([0, 0.5, -1, 0.25]), 2);
    expect(p).toEqual([0.616, 1]);
  });
  it("builds one self-contained, Cutscene-branded page that escapes text", () => {
    const html = buildReviewHtml({ title: "take</script>", edl, edlName: "take.edl.json", originalSrc: "raw.mp4", editedSrc: null, words: [{ t: "<b>hi</b>", s: 0, e: 0.4, c: 0 }], peaks: [0.1, 0.5], candidates: [] });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Cutscene");
    expect(html).not.toMatch(/hyperframes|heygen|montserrat|abril/i);
    expect(html).not.toMatch(/<script src=|<link [^>]*href="http/);
    expect(html).toContain("take&lt;/script&gt;");
    expect(html).not.toContain("<b>hi</b>");
    expect(html).toContain("Not rendered yet");
  });
});

describe("verify word comparison", () => {
  it("matches the heard words to the retimed transcript and lists missing ones", () => {
    const exp = ["Hello", "there,", "general", "Kenobi."].map((t, i) => ({ text: t, start: i * 0.5 }));
    const heard = ["hello", "there", "Kenobi"].map((t, i) => ({ text: t, start: [0, 0.52, 1.49][i] }));
    const r = compareWords(exp, heard);
    expect(r.matched).toBe(3);
    expect(r.missing).toEqual([{ text: "general", at: 1 }]);
    expect(r.medianOffset).toBe(0);
  });
});
