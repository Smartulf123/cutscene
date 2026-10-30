import { describe, expect, it } from "vitest";
import { asEdl, buildEdl, complement, composeEdl, filterScript, mergeRanges, outToSource, retimeWords, snap, sourceTimes, sourceToOut } from "../../skills/cutscene-edit/scripts/lib/edl.mjs";

describe("ranges", () => {
  it("merges overlapping and touching ranges and keeps every reason", () => {
    expect(mergeRanges([{ start: 2, end: 3, reason: "b" }, { start: 0, end: 1, reason: "a" }, { start: 2.5, end: 4, reason: "c" }, { start: 4, end: 5 }])).toEqual([
      { start: 0, end: 1, reasons: ["a"] },
      { start: 2, end: 5, reasons: ["b", "c"] },
    ]);
  });
  it("drops empty and backwards ranges", () => {
    expect(mergeRanges([{ start: 3, end: 3 }, { start: 5, end: 4 }, { start: NaN, end: 1 }])).toEqual([]);
  });
  it("keeps the complement of the cuts", () => {
    expect(complement([{ start: 0, end: 1 }, { start: 3, end: 4 }], 10)).toEqual([{ start: 1, end: 3 }, { start: 4, end: 10 }]);
    expect(complement([], 5)).toEqual([{ start: 0, end: 5 }]);
  });
  it("snaps to frames", () => {
    expect(snap(1.01, 30)).toBe(1);
    expect(snap(1.02, 30)).toBe(1.033);
  });
});

describe("buildEdl", () => {
  it("puts cut edges on the frame at or before them and lays kept ranges back to back", () => {
    const edl = buildEdl({ deletes: [{ start: 1.01, end: 2.02, reason: "pause" }], duration: 5, fps: 30, tool: "t" });
    expect(edl.delete_ranges).toEqual([{ start: 1, end: 2, reasons: ["pause"] }]);
    expect(edl.keep_ranges).toEqual([
      { start: 0, end: 1, out_start: 0, out_end: 1 },
      { start: 2, end: 5, out_start: 1, out_end: 4 },
    ]);
    expect(edl.edited_duration).toBe(4);
    expect(edl.removed).toBe(1);
    expect(edl.kind).toBe("cutscene-edl");
  });
  it("lets the last cut run to the very end of the source", () => {
    const edl = buildEdl({ deletes: [{ start: 4, end: 5.267 }], duration: 5.267, fps: 30, tool: "t" });
    expect(edl.delete_ranges[0].end).toBe(5.267);
    expect(edl.edited_duration).toBe(4);
  });
  it("folds a sliver of footage between two cuts into the cut (it would flash)", () => {
    const edl = buildEdl({ deletes: [{ start: 1, end: 2 }, { start: 2.02, end: 3 }], duration: 5, fps: 100, tool: "t" });
    expect(edl.delete_ranges).toHaveLength(1);
    expect(edl.delete_ranges[0]).toMatchObject({ start: 1, end: 3 });
  });
  it("refuses cuts outside the source, backwards cuts, and cutting everything", () => {
    expect(() => buildEdl({ deletes: [{ start: 1, end: 9 }], duration: 5, tool: "t" })).toThrow(/outside the source/);
    expect(() => buildEdl({ deletes: [{ start: 2, end: 1 }], duration: 5, tool: "t" })).toThrow(/not valid/);
    expect(() => buildEdl({ deletes: [{ start: 0, end: 5 }], duration: 5, tool: "t" })).toThrow(/whole video/);
  });
  it("maps times between the source and the edit", () => {
    const edl = buildEdl({ deletes: [{ start: 1, end: 2 }], duration: 5, fps: 30, tool: "t" });
    expect(sourceToOut(edl, 2.5)).toBeCloseTo(1.5);
    expect(sourceToOut(edl, 1.5)).toBeNull();
    expect(outToSource(edl, 1.5)).toBeCloseTo(2.5);
  });
});

describe("retimeWords", () => {
  const edl = buildEdl({ deletes: [{ start: 1, end: 2 }], duration: 5, fps: 30, tool: "t" });
  it("moves kept words onto the edited timeline and remembers the source times", () => {
    const { words, dropped } = retimeWords([{ text: "a", start: 0.2, end: 0.5 }, { text: "b", start: 1.2, end: 1.5 }, { text: "c", start: 2.2, end: 2.6 }], edl);
    expect(dropped).toBe(1);
    expect(words).toEqual([
      { text: "a", start: 0.2, end: 0.5, source_start: 0.2, source_end: 0.5 },
      { text: "c", start: 1.2, end: 1.6, source_start: 2.2, source_end: 2.6 },
    ]);
  });
  it("drops a word mostly inside a cut and marks one a cut only grazes", () => {
    const { words } = retimeWords([{ text: "gone", start: 0.95, end: 1.3 }, { text: "grazed", start: 0.8, end: 1.05 }], edl);
    expect(words.map((w) => w.text)).toEqual(["grazed"]);
    expect(words[0].clipped).toBe(true);
  });
  it("reads source times from an edited transcript", () => {
    expect(sourceTimes([{ text: "x", start: 1, end: 2, source_start: 5, source_end: 6 }])[0]).toMatchObject({ start: 5, end: 6 });
  });
});

describe("composeEdl", () => {
  it("turns cuts on an edited timeline into one edit on the original", () => {
    const first = buildEdl({ deletes: [{ start: 1, end: 2 }], duration: 6, fps: 30, tool: "silences", source: "raw.mp4" });
    // On the edited video, 1.5–2.5 is source 2.5–3.5.
    const both = composeEdl(first, [{ start: 1.5, end: 2.5, reason: "stutter" }], { tool: "apply-cuts", parentPath: "x.json" });
    expect(both.delete_ranges.map((d) => [d.start, d.end])).toEqual([
      [1, 2],
      [2.5, 3.5],
    ]);
    expect(both.source).toBe("raw.mp4");
    expect(both.parent).toBe("x.json");
    expect(both.edited_duration).toBe(4);
  });
  it("splits a cut that spans an earlier cut into its source pieces", () => {
    const first = buildEdl({ deletes: [{ start: 2, end: 3 }], duration: 6, fps: 30, tool: "s" });
    const both = composeEdl(first, [{ start: 1.5, end: 2.5 }], { tool: "a" });
    expect(both.delete_ranges.map((d) => [d.start, d.end])).toEqual([[1.5, 3.5]]);
  });
  it("refuses cuts beyond the edited length (a different timeline)", () => {
    const first = buildEdl({ deletes: [{ start: 1, end: 2 }], duration: 6, fps: 30, tool: "s" });
    expect(() => composeEdl(first, [{ start: 5.5, end: 5.9 }], { tool: "a" })).toThrow(/outside the edited video/);
  });
});

describe("filterScript", () => {
  it("trims video and audio, fades the joins and concatenates", () => {
    const f = filterScript([{ start: 0, end: 1 }, { start: 2, end: 3 }], { fade: 0.02 });
    expect(f).toContain("[0:v]trim=start=0.000000:end=1.000000,setpts=PTS-STARTPTS[v0];");
    expect(f).toContain("afade=t=out:st=0.980000:d=0.02[a0]");
    expect(f).toContain("asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.02[a1]");
    expect(f.trim().endsWith("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]")).toBe(true);
  });
  it("handles audio-only sources and no fades", () => {
    const f = filterScript([{ start: 0, end: 1 }], { video: false, fade: 0 });
    expect(f).not.toContain("[0:v]");
    expect(f).not.toContain("afade");
    expect(f).toContain("concat=n=1:v=0:a=1[a]");
  });
});

describe("asEdl", () => {
  it("reads a kit-style EDL by adding output positions", () => {
    const e = asEdl({ source_duration: 5, keep_ranges: [{ start: 0, end: 1 }, { start: 2, end: 5 }], delete_ranges: [{ start: 1, end: 2, reason: "pause" }] });
    expect(e.keep_ranges[1]).toEqual({ start: 2, end: 5, out_start: 1, out_end: 4 });
    expect(e.delete_ranges[0].reasons).toEqual(["pause"]);
  });
  it("rejects something that is not an EDL", () => {
    expect(() => asEdl({ words: [] })).toThrow(/not an edit list/);
  });
  it("rejects a tool name that could point outside the folder", () => {
    const edl = { source_duration: 5, keep_ranges: [{ start: 0, end: 5 }] };
    expect(asEdl({ ...edl, tool: "cut-silences" }).tool).toBe("cut-silences");
    expect(() => asEdl({ ...edl, tool: "../../evil" })).toThrow(/plain tool name/);
    expect(() => asEdl({ ...edl, tool: 7 })).toThrow(/plain tool name/);
  });
});
