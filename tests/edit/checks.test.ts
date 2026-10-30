// Beat-sync, plan and footage validators (adapted from Herk Edit Kit), with negative controls:
// a caption shifted by 0.3 s, a one-frame scene gap and an omitted word must each fail.
import { describe, expect, it } from "vitest";
import { checkBeatSync, findAnchorStart, parseIndex, resolveStarts } from "../../skills/cutscene-edit/scripts/lib/beatsync.mjs";
import { keepsFromEdl, validateFootage, validatePlan } from "../../skills/cutscene-edit/scripts/lib/plan.mjs";
import { buildEdl } from "../../skills/cutscene-edit/scripts/lib/edl.mjs";

const words = [
  { text: "Today", start: 0.2, end: 0.5 },
  { text: "we", start: 0.5, end: 0.6 },
  { text: "build", start: 0.6, end: 0.9 },
  { text: "the", start: 3.0, end: 3.1 },
  { text: "pipeline.", start: 3.1, end: 3.6 },
];

describe("beat sync", () => {
  const html = `<div id="b1" data-composition-src="c/b1.html" data-start="0" data-duration="2"></div>
    <div data-duration="2" data-composition-src="c/b2.html" id="b2" data-start="b1"></div>
    <template id="b3" data-composition-src="c/b3.html" data-start="b1 + 0.5" data-duration="1" data-anchor="pipeline"></template>`;
  it("parses beats in any attribute order and resolves chained starts", () => {
    const beats = parseIndex(html);
    expect(beats.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
    const s = resolveStarts(beats);
    expect(s.get("b2")).toBe(2); // "b1" = when b1 ends
    expect(s.get("b3")).toBe(0.5); // "b1 + 0.5" = from b1's start
  });
  it("flags late, early, missing and good anchors", () => {
    const files: Record<string, string> = { "c/b1.html": '<div data-anchor="today we">', "c/b2.html": '<div data-anchor="build">' };
    const rows = checkBeatSync(parseIndex(html), words, (src) => files[src] ?? null);
    expect(rows.map((r) => r.status)).toEqual(["OK", "LATE", "EARLY"]);
    expect(rows[1].detail).toMatch(/data-start="0\.10"/);
    expect(rows[2].slack).toBe(2.6);
  });
  it("fails a graphic shifted 0.3 s late (negative control)", () => {
    const rows = checkBeatSync(parseIndex('<div id="g" data-composition-src="g.html" data-start="3.4" data-duration="1" data-anchor="the pipeline"></div>'), words, () => "");
    expect(rows[0].status).toBe("LATE");
  });
  it("reports missing files, missing anchors, circular starts", () => {
    const rows = checkBeatSync(parseIndex('<div id="a" data-composition-src="x.html" data-start="0" data-duration="1"></div>'), words, () => null);
    expect(rows[0].status).toBe("ERROR");
    expect(checkBeatSync(parseIndex('<div id="a" data-composition-src="x.html" data-start="0" data-duration="1"></div>'), words, () => "<div>")[0].status).toBe("NO-ANCHOR");
    expect(() => resolveStarts(parseIndex('<div id="a" data-composition-src="x" data-start="b" data-duration="1"></div><div id="b" data-composition-src="y" data-start="a" data-duration="1"></div>'))).toThrow(/Circular/);
  });
  it("finds multi-word anchors in punctuated text", () => {
    expect(findAnchorStart(words, "the pipeline", 0)).toBe(3.0);
    expect(findAnchorStart(words, "nowhere", 0)).toBeNull();
  });
});

function goodPlan() {
  const edl = buildEdl({ deletes: [{ start: 1, end: 3 }], duration: 5, fps: 30, tool: "t" });
  const transcript = {
    words: [
      { text: "Hello", start: 0.2, end: 0.5, source_start: 0.2, source_end: 0.5 },
      { text: "world", start: 1.2, end: 1.6, source_start: 3.2, source_end: 3.6 },
    ],
  };
  const plan = {
    fps: 30,
    duration: 3,
    scenes: [
      { id: "s0", start: 0, end: 1, layout: "face", anchor: "Hello", anchorTime: 0.2 },
      { id: "s1", start: 1, end: 3, layout: "split", anchor: "world", anchorTime: 1.2, holdReason: "conviction beat" },
    ],
    events: [{ time: 0, visual: "s0" }, { time: 1, visual: "s1" }],
    captions: [
      { start: 0.2, end: 0.6, words: [{ text: "Hello", start: 0.2, end: 0.5 }] },
      { start: 1.2, end: 1.7, words: [{ text: "world", start: 1.2, end: 1.6 }] },
    ],
  };
  return { plan, transcript, edl: keepsFromEdl(edl) };
}

describe("validate-plan", () => {
  it("passes a consistent plan", () => {
    const { plan, transcript, edl } = goodPlan();
    const r = validatePlan(plan, transcript, edl);
    expect(r.errors).toEqual([]);
    expect(r.metrics.scenes).toBe(2);
  });
  it("fails a caption shifted by 0.3 s", () => {
    const { plan, transcript, edl } = goodPlan();
    plan.captions[1].words[0].start += 0.3;
    expect(validatePlan(plan, transcript, edl).errors.join(" ")).toMatch(/timed differently/);
  });
  it("fails a one-frame gap between scenes", () => {
    const { plan, transcript, edl } = goodPlan();
    plan.scenes[1].start += 1 / 30;
    expect(validatePlan(plan, transcript, edl).errors.join(" ")).toMatch(/gap or overlap/);
  });
  it("fails an omitted word", () => {
    const { plan, transcript, edl } = goodPlan();
    plan.captions.pop();
    expect(validatePlan(plan, transcript, edl).errors.join(" ")).toMatch(/Captions have 1 words but the edit keeps 2/);
  });
  it("fails a word mapped to the wrong source time", () => {
    const { plan, transcript, edl } = goodPlan();
    transcript.words[1].source_start = 2.5;
    transcript.words[1].source_end = 2.9;
    expect(validatePlan(plan, transcript, edl).ok).toBe(false);
  });
  it("fails a long stretch with nothing new and no reason", () => {
    const { plan, transcript, edl } = goodPlan();
    delete plan.scenes[1].holdReason;
    plan.duration = 3;
    plan.events = [{ time: 0, visual: "s0" }];
    expect(validatePlan(plan, transcript, edl).errors.join(" ")).toMatch(/Nothing new happens/);
  });
  it("reports a caption group with no words instead of crashing", () => {
    const { plan, transcript, edl } = goodPlan();
    plan.captions.push({ start: 2, end: 2.5, words: [] });
    const r = validatePlan(plan, transcript, edl);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("Caption group 2 has no words.");
  });
});

describe("validate-footage", () => {
  const h = (c: string): string => c.repeat(64);
  it("passes unique scenes", () => {
    expect(validateFootage([{ scene: "s1", sourceSceneId: "a", sha256: h("a"), sourceStart: 0, sourceEnd: 1 }, { scene: "s2", sourceSceneId: "b", sha256: h("a"), sourceStart: 1, sourceEnd: 2 }]).ok).toBe(true);
  });
  it("fails a reused scene, overlapping footage and a missing hash", () => {
    const r = validateFootage([
      { scene: "s1", sourceSceneId: "a", sha256: h("a"), sourceStart: 0, sourceEnd: 1 },
      { scene: "s2", sourceSceneId: "a", sha256: h("a"), sourceStart: 0.5, sourceEnd: 1.5 },
      { scene: "s3", sourceSceneId: "c", sourceStart: 0, sourceEnd: 1 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/used twice/);
    expect(r.errors.join(" ")).toMatch(/overlapping footage/);
    expect(r.errors.join(" ")).toMatch(/no SHA-256/);
  });
});
