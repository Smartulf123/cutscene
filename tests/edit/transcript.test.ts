import { describe, expect, it } from "vitest";
import { PACES, breathFor, planSilenceCuts } from "../../skills/cutscene-edit/scripts/lib/silences.mjs";
import { capStretchedWords, expectedWordSeconds, makeTranscript, normalizeTranscript, packPhrases, packedText, refineWithSilences, spokenWords } from "../../skills/cutscene-edit/scripts/lib/transcript.mjs";

describe("normalizeTranscript", () => {
  it("reads the engine's array of words", () => {
    const t = normalizeTranscript([{ id: "w0", text: "Hey", start: 1.2, end: 1.76 }]);
    expect(t.words).toEqual([{ text: "Hey", start: 1.2, end: 1.76, type: "word" }]);
  });
  it("reads the kit shape and keeps spacing events out of the spoken words", () => {
    const t = normalizeTranscript({ audio_duration_secs: 3, words: [{ text: "Hi", start: 0, end: 0.3, type: "word" }, { text: " ", start: 0.3, end: 0.5, type: "spacing" }] });
    expect(t.audio_duration_secs).toBe(3);
    expect(spokenWords(t).map((w) => w.text)).toEqual(["Hi"]);
  });
  it("reads Whisper-style segments", () => {
    const t = normalizeTranscript({ segments: [{ words: [{ word: " hello", start: 0, end: 0.4 }] }] });
    expect(t.words[0].text).toBe("hello");
  });
  it("explains a transcript without words", () => {
    expect(() => normalizeTranscript({ text: "no timings" })).toThrow(/no words/);
  });
});

describe("refineWithSilences", () => {
  it("ends a word where the silence after it starts", () => {
    const { words, changed } = refineWithSilences([{ text: "channel.", start: 3.76, end: 6.08 }], [{ start: 3.88, end: 6.29 }]);
    expect(changed).toBe(1);
    expect(words[0]).toMatchObject({ start: 3.76, end: 3.88, refined: "end" });
  });
  it("starts a word where the silence before it ends", () => {
    const { words } = refineWithSilences([{ text: "Hey", start: 1.2, end: 1.76 }], [{ start: 0, end: 1.58 }]);
    expect(words[0]).toMatchObject({ start: 1.58, end: 1.76, refined: "start" });
  });
  it("splits off a long pause inside a word's span on the right side", () => {
    // "so" is short: a pause starting 0.5 s into its span means the word came first.
    const { words } = refineWithSilences([{ text: "so", start: 1, end: 3 }], [{ start: 1.5, end: 2.5 }]);
    expect(words[0]).toMatchObject({ start: 1, end: 1.5 });
  });
  it("moves a word placed inside a silence to just after it, sharing the next word's span", () => {
    const { words } = refineWithSilences(
      [
        { text: "AI.", start: 10.24, end: 12.4 },
        { text: "It", start: 12.4, end: 12.72 },
        { text: "is", start: 12.72, end: 12.96 },
      ],
      [{ start: 10.76, end: 12.76 }],
    );
    expect(words[0].end).toBe(10.76);
    expect(words[1].start).toBe(12.76);
    expect(words[1].end).toBeGreaterThan(12.76);
    expect(words[2].start).toBe(words[1].end);
    expect(words[2].end).toBe(12.96);
  });
  it("leaves words alone when nothing is silent", () => {
    const w = [{ text: "a", start: 0, end: 0.3 }];
    expect(refineWithSilences(w, []).words).toEqual(w);
  });
});

describe("capStretchedWords", () => {
  it("shortens a word far longer than its letters allow and marks the end as estimated", () => {
    const { words, changed } = capStretchedWords([{ text: "episode.", start: 3.2, end: 5.04 }, { text: "quick", start: 5.04, end: 5.4 }]);
    expect(changed).toBe(1);
    expect(words[0].end_estimated).toBe(true);
    expect(words[0].end).toBeCloseTo(3.2 + expectedWordSeconds("episode.") * 1.4, 3);
    expect(words[1].end).toBe(5.4);
  });
  it("trusts word edges already measured against silence", () => {
    expect(capStretchedWords([{ text: "so", start: 0, end: 2, refined: "end" }]).changed).toBe(0);
  });
});

describe("phrases", () => {
  const words = [
    { text: "Hello", start: 0, end: 0.4 },
    { text: "there.", start: 0.45, end: 0.9 },
    { text: "Next", start: 1.6, end: 2 },
  ];
  it("breaks at pauses of half a second or more", () => {
    expect(packPhrases(words).map((p) => p.text)).toEqual(["Hello there.", "Next"]);
    expect(packedText(words)).toBe("[000.00-000.90] Hello there.\n[001.60-002.00] Next");
  });
  it("builds the Cutscene transcript shape", () => {
    const t = makeTranscript(words, { audio_duration_secs: 2, source: "a.mp4" });
    expect(t).toMatchObject({ version: 1, kind: "cutscene-transcript", timeline: "source", source: "a.mp4", audio_duration_secs: 2 });
    expect(t.words[0].type).toBe("word");
  });
});

describe("planSilenceCuts (kit rules)", () => {
  const words = [
    { text: "Hello", start: 1, end: 1.4 },
    { text: "world.", start: 1.5, end: 2 },
    { text: "Next", start: 3, end: 3.4 },
    { text: "line", start: 6, end: 6.4 },
  ];
  const cuts = planSilenceCuts(words, { duration: 8 });
  it("trims head and tail to their pads", () => {
    expect(cuts[0]).toMatchObject({ start: 0, kind: "head" });
    expect(cuts[0].end).toBeCloseTo(0.78);
    expect(cuts.at(-1)).toMatchObject({ end: 8, kind: "tail" });
    expect(cuts.at(-1)!.start).toBeCloseTo(6.74);
  });
  it("keeps a breath scaled by context, biased toward the phrase before", () => {
    const sentence = cuts.find((c) => c.kind === "pause" && c.pause === 1)!;
    expect(sentence.kept).toBe(0.2);
    expect(sentence.start).toBeCloseTo(2 + 0.2 * 0.55);
    expect(sentence.end).toBeCloseTo(3 - 0.2 * 0.45);
    const long = cuts.find((c) => c.kind === "pause" && c.pause! > 2)!;
    expect(long.kept).toBe(0.24);
  });
  it("leaves pauses under the gap alone", () => {
    expect(cuts.filter((c) => c.kind === "pause")).toHaveLength(2);
  });
  it("chooses breaths of 0.14–0.24 s", () => {
    expect(breathFor(0.7, "and")).toBe(0.14);
    expect(breathFor(0.7, "first,")).toBe(0.18);
    expect(breathFor(0.7, "done.")).toBe(0.2);
    expect(breathFor(2.5, "and")).toBe(0.24);
    expect(PACES.tight).toBeLessThan(PACES.normal);
  });
});
