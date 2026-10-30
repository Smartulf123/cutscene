// Ported from Cutscene 1 src/lib/project/mistakes.test.ts (Apache-2.0), adapted to the
// cutscene-edit finder (adds restart, repeat and filler detection).
import { describe, expect, it } from "vitest";
import { approvedRanges, findCutCandidates, token } from "../../skills/cutscene-edit/scripts/lib/mistakes.mjs";
import type { Candidate, MWord } from "../../skills/cutscene-edit/scripts/lib/mistakes.mjs";

/** Words from text, 0.3 s each, with `gap` seconds of silence at each "|". */
function speak(text: string, gap: number = 1.2): MWord[] {
  const out: MWord[] = [];
  let t = 0;
  for (const part of text.split("|")) {
    for (const w of part.trim().split(/\s+/)) {
      out.push({ text: w, start: t, end: t + 0.28 });
      t += 0.3;
    }
    t += gap;
  }
  return out;
}
const find = (text: string, gap?: number, o?: { fillers?: boolean }): Candidate[] => findCutCandidates(speak(text, gap), o).candidates;

describe("spoken mistakes", () => {
  it("finds a stutter and removes the first word", () => {
    const c = find("I think the the best part is this.");
    expect(c).toEqual([expect.objectContaining({ type: "stutter", words: [2], removes: "the", recommend: "cut" })]);
    expect(c[0].cut).toEqual({ start: 0.6, end: 0.9 });
  });

  it("treats a doubled word with a comma as emphasis to review", () => {
    const [c] = find("It is never, never hands off.");
    expect(c).toMatchObject({ type: "stutter", recommend: "review", confidence: "low" });
  });

  it("finds a repeated phrase", () => {
    const c = find("So I think I think this works.");
    expect(c).toEqual([expect.objectContaining({ type: "repeat", removes: "I think", words: [1, 2] })]);
  });

  it("finds a retake after the pause was cut, and cuts only the abandoned attempt", () => {
    const words = speak("Well I told someone in the past being the first or anything like that is a huge being the first or anything like that is a huge responsibility and an honor.", 0);
    const second = words.findIndex((w, i) => i > 10 && w.text === "being");
    words[second].pauseBefore = 1.5;
    const r = findCutCandidates(words).candidates.find((m) => m.type !== "stutter")!;
    expect(r.type).toBe("restart");
    expect(r.removes).toBe("being the first or anything like that is a huge");
    expect(r.keeps).toMatch(/^being the first .* honor\.$/);
    expect(r.recommend).toBe("cut");
  });

  it("uses the original recording's pause from source times on an edited transcript", () => {
    const words = speak("Well I told someone in the past being the first or anything like that is a huge being the first or anything like that is a huge responsibility.", 0).map((w) => ({ ...w, source_start: w.start, source_end: w.end }));
    const second = words.findIndex((w, i) => i > 10 && w.text === "being");
    for (let i = second; i < words.length; i++) {
      words[i].source_start += 1.5;
      words[i].source_end += 1.5;
    }
    expect(findCutCandidates(words).candidates.some((c) => c.type === "restart")).toBe(true);
  });

  it("leaves spoken years alone", () => {
    expect(find("We go back to the moon in twenty twenty four.")).toEqual([]);
  });

  it("finds a false start and keeps the clean take", () => {
    const fs = find("Today I want to show | Today I want to show you how editing with AI works.").find((x) => x.type === "restart" || x.type === "false_start")!;
    expect(fs.words).toEqual([0, 1, 2, 3, 4]);
    expect(fs.keeps).toBe("Today I want to show you how editing with AI works.");
  });

  it("finds a retake said again later", () => {
    const m = find("The editor cuts every silence in the recording automatically for you. | Wait, let me say that again. | The editor cuts every silence in your recording automatically.");
    const r = m.find((x) => x.type === "retake" || x.type === "false_start")!;
    expect(r.removes).toMatch(/^The editor cuts every silence in the recording automatically for you\. Wait, let me say that again\.$/);
    expect(r.recommend).toBe("cut");
  });

  it("leaves clean, varied speech alone", () => {
    expect(find("Welcome back to the channel. | Today we edit a podcast with AI. | It is much faster than doing it by hand.")).toEqual([]);
  });

  it("proposes a filler with silence on both sides, keeps one that runs into the next word", () => {
    const clear = findCutCandidates([
      { text: "So,", start: 0, end: 0.3 },
      { text: "um", start: 0.6, end: 0.8 },
      { text: "today", start: 1.1, end: 1.5 },
    ]).candidates[0];
    expect(clear).toMatchObject({ type: "filler", recommend: "cut" });
    // Half of each pause stays.
    expect(clear.cut).toEqual({ start: 0.45, end: 0.95 });
    const glued = findCutCandidates([
      { text: "So", start: 0, end: 0.3 },
      { text: "um", start: 0.3, end: 0.5 },
      { text: "today", start: 0.5, end: 0.9 },
    ]).candidates[0];
    expect(glued).toMatchObject({ type: "filler", recommend: "keep" });
  });

  it("can leave fillers out and marks overlapping candidates", () => {
    expect(find("So, | um | today we start.", 0.3, { fillers: false })).toEqual([]);
    const all = find("Today I want to to | Today I want to show you how editing with AI works.");
    expect(all.some((c) => c.overlaps?.length)).toBe(true);
  });

  it("numbers candidates in time order", () => {
    const c = find("I think the the best | the the part");
    expect(c.map((x) => x.id)).toEqual(c.map((_, i) => `c${String(i + 1).padStart(3, "0")}`));
    expect(c.map((x) => x.cut.start)).toEqual([...c.map((x) => x.cut.start)].sort((a, b) => a - b));
  });

  it("tokenises without punctuation and case", () => {
    expect(token("“Hello,”")).toBe("hello");
    expect(token("$20")).toBe("$20");
  });
});

describe("approvedRanges", () => {
  const candidates = [{ id: "c001", type: "stutter", removes: "the", cut: { start: 1, end: 1.3 } }] as Candidate[];
  it("accepts approved ids", () => {
    expect(approvedRanges({ approve: ["c001"] }, candidates)).toEqual([{ start: 1, end: 1.3, reason: "stutter: the" }]);
  });
  it("accepts explicit ranges and an empty list", () => {
    expect(approvedRanges({ cuts: [{ start: 2, end: 3, reason: "x" }] })).toEqual([{ start: 2, end: 3, reason: "x" }]);
    expect(approvedRanges({ cuts: [] })).toEqual([]);
    expect(approvedRanges([])).toEqual([]);
  });
  it("refuses an id that was never proposed", () => {
    expect(() => approvedRanges({ approve: ["c999"] }, candidates)).toThrow(/c999/);
  });
});
