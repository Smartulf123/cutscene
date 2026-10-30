import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beatsPath, readBeats, updateBeat, updateBeatSheet, validateBeats, writeBeats } from "../../skills/cutscene/scripts/lib/beats.mjs";
import { cleanup, tempDir } from "./helpers.mjs";

const SAMPLE = `{
  "version": 1,
  "fps": 30,
  "format": "landscape",
  "width": 1920,
  "height": 1080,
  "duration": 12.0,
  "x-studio": { "zoom": 1.50, "lanes": [1, 2, 3] },
  "beats": [
    {
      "id": "b1",
      "start": 0.0,
      "end": 2.4,
      "label": "logo reveal",
      "graphics": [{ "id": "g-title", "kind": "title", "text": "Cutscene" }],
      "sfx": [{ "at": 0.4, "name": "whoosh" }],
      "x-note": "keep me"
    },
    { "id": "b2", "start": 2.4, "end": 5.0, "x-tag": 7 }
  ]
}
`;

let dir;
let file;
beforeEach(() => {
  dir = tempDir();
  file = beatsPath(dir);
  writeBeats(file, JSON.parse(SAMPLE));
  writeFileSync(file, SAMPLE); // the exact text, as a person or another part wrote it
});
afterEach(() => cleanup(dir));

describe("validateBeats", () => {
  it("accepts the contract example shape", () => {
    const r = validateBeats(JSON.parse(SAMPLE));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("reports the required fields", () => {
    const r = validateBeats({ beats: [{ start: 1, end: 0.5 }] });
    const paths = r.errors.map((e) => e.path);
    expect(r.ok).toBe(false);
    expect(paths).toEqual(expect.arrayContaining(["version", "fps", "width", "height", "beats[0].id", "beats[0].end"]));
  });

  it("refuses duplicate ids, absolute and escaping paths", () => {
    const r = validateBeats({
      version: 1,
      fps: 30,
      width: 1080,
      height: 1920,
      beats: [
        { id: "a", start: 0, end: 1, voice: { file: "C:\\Users\\me\\b1.wav" } },
        { id: "a", start: 1, end: 2, shot3d: { file: "../outside.webm", tier: 3 } },
        { id: "c", start: 2, end: 3, voice: { file: "\\\\server\\share\\x.wav" } },
      ],
    });
    const msgs = r.errors.map((e) => `${e.path} ${e.message}`).join("\n");
    expect(msgs).toMatch(/used twice/);
    expect(msgs).toMatch(/absolute path/);
    expect(msgs).toMatch(/outside the project/);
    expect(msgs).toMatch(/network path/);
    expect(msgs).toMatch(/tier/);
  });

  it("warns (not errors) on overlaps, long decimals and unknown speakers", () => {
    const r = validateBeats({
      version: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      duration: 3,
      voices: { narrator: {} },
      beats: [
        { id: "a", start: 0, end: 2.12345 },
        { id: "b", start: 1.5, end: 3.5, voice: { speaker: "ghost" } },
      ],
    });
    expect(r.ok).toBe(true);
    const w = r.warnings.map((x) => x.message).join("\n");
    expect(w).toMatch(/3 decimals/);
    expect(w).toMatch(/previous beat/);
    expect(w).toMatch(/isn't listed in voices/);
    expect(w).toMatch(/after the end of the video/);
  });

  it("never throws on junk", () => {
    for (const junk of [null, 5, "x", [], { beats: "no" }]) expect(() => validateBeats(junk)).not.toThrow();
  });
});

describe("network paths in the beat sheet", () => {
  it("refuses every UNC form, mixed slashes too, with the same rule as paths.mjs", () => {
    for (const p of ["\\\\server\\share\\b1.wav", "//server/share/b1.wav", "/\\server\\share\\b1.wav", "\\/server/share/b1.wav", "  //server/share/b1.wav"]) {
      const sheet = { version: 1, fps: 30, width: 1920, height: 1080, beats: [{ id: "b1", start: 0, end: 1, voice: { file: p } }] };
      const r = validateBeats(sheet);
      expect(r.ok, p).toBe(false);
      expect(r.errors[0].message, p).toMatch(/network path/);
    }
    const ok = validateBeats({ version: 1, fps: 30, width: 1920, height: 1080, beats: [{ id: "b1", start: 0, end: 1, voice: { file: "assets/voice/b1.wav" } }] });
    expect(ok.ok).toBe(true);
  });
});

describe("updateBeat", () => {
  it("adds a part's fields and keeps every other byte", () => {
    updateBeat(file, "b1", { voice: { speaker: "narrator", line: "Meet Cutscene.", file: "assets/voice/b1.wav", duration: 1.1, verified: true } });
    const text = readFileSync(file, "utf8");
    // Untouched text is identical, including number spelling and unknown fields.
    expect(text).toContain('"duration": 12.0,');
    expect(text).toContain('"x-studio": { "zoom": 1.50, "lanes": [1, 2, 3] },');
    expect(text).toContain('"start": 0.0,');
    expect(text).toContain('"x-note": "keep me"');
    expect(text).toContain('{ "id": "b2", "start": 2.4, "end": 5.0, "x-tag": 7 }');
    const sheet = readBeats(file);
    expect(sheet.beats[0].voice.verified).toBe(true);
    expect(sheet.beats[0]["x-note"]).toBe("keep me");
    expect(sheet["x-studio"].zoom).toBe(1.5);
    // Only the new field was inserted.
    const before = SAMPLE.split('"x-note": "keep me"')[0];
    expect(text.startsWith(before)).toBe(true);
  });

  it("merges into existing objects and keeps unknown nested fields", () => {
    updateBeat(file, "b1", { voice: { line: "One.", "x-take": 3 } });
    updateBeat(file, "b1", { voice: { verified: true } });
    const v = readBeats(file).beats[0].voice;
    expect(v).toEqual({ line: "One.", "x-take": 3, verified: true });
  });

  it("works on compact one-line beats", () => {
    updateBeat(file, "b2", { shot3d: { tier: 1, file: "assets/3d/b2.webm" } });
    const text = readFileSync(file, "utf8");
    expect(text).toContain('"x-tag": 7, "shot3d": {"tier":1,"file":"assets/3d/b2.webm"} }');
    expect(readBeats(file).beats[1].shot3d.tier).toBe(1);
  });

  it("removes a field with null", () => {
    updateBeat(file, "b1", { sfx: null });
    const b = readBeats(file).beats[0];
    expect("sfx" in b).toBe(false);
    expect(b["x-note"]).toBe("keep me");
    expect(readFileSync(file, "utf8")).toContain('"duration": 12.0,');
  });

  it("removes one field and adds another in the same patch without rewriting the beat", () => {
    // Regression: { line: null, voice: {...} } used to re-serialise the whole beat (0.0 became 0,
    // inline arrays were expanded).
    const withLine = SAMPLE.replace('"label": "logo reveal",', '"label": "logo reveal",\n      "line": "Meet Cutscene.",');
    writeFileSync(file, withLine);
    updateBeat(file, "b1", { line: null, voice: { line: "Meet Cutscene.", verified: true } });
    const text = readFileSync(file, "utf8");
    expect(text).toContain('"start": 0.0,');
    expect(text).toContain('"graphics": [{ "id": "g-title", "kind": "title", "text": "Cutscene" }],');
    expect(text).toContain('"sfx": [{ "at": 0.4, "name": "whoosh" }],');
    expect(text).not.toContain('"line": "Meet Cutscene.",\n      "graphics"');
    // The only change is the removed line and the added voice.
    const expected = SAMPLE.replace('"x-note": "keep me"', '"x-note": "keep me",\n      "voice": {\n        "line": "Meet Cutscene.",\n        "verified": true\n      }');
    expect(text).toBe(expected);
    const b = readBeats(file).beats[0];
    expect("line" in b).toBe(false);
    expect(b.voice.verified).toBe(true);
  });

  it("removes the last fields, several at once, and fields on compact beats, byte for byte", () => {
    updateBeat(file, "b1", { sfx: null, "x-note": null, "x-new": 1 });
    let text = readFileSync(file, "utf8");
    expect(text).toContain('"graphics": [{ "id": "g-title", "kind": "title", "text": "Cutscene" }],\n      "x-new": 1\n    },');
    expect(text).toContain('"start": 0.0,');
    updateBeat(file, "b1", { graphics: null, label: null });
    text = readFileSync(file, "utf8");
    expect(text).toContain('"end": 2.4,\n      "x-new": 1\n    },');
    updateBeat(file, "b2", { "x-tag": null, label: "two" });
    text = readFileSync(file, "utf8");
    expect(text).toContain('{ "id": "b2", "start": 2.4, "end": 5.0, "label": "two" }');
    updateBeat(file, "b2", { label: null });
    expect(readFileSync(file, "utf8")).toContain('{ "id": "b2", "start": 2.4, "end": 5.0 }');
    expect(readFileSync(file, "utf8")).toContain('"duration": 12.0,');
  });

  it("refuses an update that would break the sheet, and writes nothing", () => {
    const before = readFileSync(file, "utf8");
    expect(() => updateBeat(file, "b1", { end: -1 })).toThrow(expect.objectContaining({ code: "BEATS_INVALID" }));
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("explains a missing beat, file or broken JSON", () => {
    expect(() => updateBeat(file, "nope", { label: "x" })).toThrow(expect.objectContaining({ code: "BEAT_NOT_FOUND" }));
    expect(() => updateBeat(join(dir, "missing.json"), "b1", {})).toThrow(expect.objectContaining({ code: "BEATS_NOT_FOUND" }));
    writeFileSync(file, "{ nope");
    expect(() => readBeats(file)).toThrow(expect.objectContaining({ code: "BEATS_INVALID_JSON" }));
  });

  it("doesn't let a part rename a beat", () => {
    expect(() => updateBeat(file, "b1", { id: "b9" })).toThrow(expect.objectContaining({ code: "BEAT_ID_CHANGE" }));
  });

  it("leaves no temp or lock files behind", () => {
    updateBeat(file, "b1", { label: "new" });
    const left = readdirSync(join(dir, ".cutscene"));
    expect(left).toEqual(["beats.json"]);
  });

  it("keeps CRLF line endings", () => {
    writeFileSync(file, SAMPLE.replace(/\n/g, "\r\n"));
    updateBeat(file, "b1", { shot3d: { tier: 2 } });
    const text = readFileSync(file, "utf8");
    expect(text.includes("\n") && !/[^\r]\n/.test(text)).toBe(true);
    expect(readBeats(file).beats[0].shot3d.tier).toBe(2);
  });
});

describe("updateBeatSheet", () => {
  it("adds top-level fields such as voices and keeps the rest", () => {
    updateBeatSheet(file, { voices: { narrator: { model: "kokoro", seed: 42 } } });
    const text = readFileSync(file, "utf8");
    expect(text).toContain('"x-studio": { "zoom": 1.50, "lanes": [1, 2, 3] },');
    expect(readBeats(file).voices.narrator.seed).toBe(42);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });
});
