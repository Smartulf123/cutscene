// Unit tests for the voice check logic: normalising, aligning, verdicts, voice descriptions.
import { describe, expect, it } from "vitest";
import {
  align,
  describeIssue,
  estimateSeconds,
  foldSpelling,
  integerWords,
  judgeLine,
  normalizeWords,
  numberWords,
  parseOmniVoiceDescription,
  pickKokoroVoice,
  tokenize,
  wordErrorRate,
} from "../../skills/cutscene-voice/scripts/lib/text.mjs";

/** Fake transcriber output: words spaced 0.3 s apart. */
const heard = (text, p = 0.95) =>
  text.split(/\s+/).filter(Boolean).map((w, i) => ({ w, start: +(i * 0.3).toFixed(3), end: +(i * 0.3 + 0.25).toFixed(3), p }));

describe("numbers", () => {
  it("reads whole numbers", () => {
    expect(integerWords(0)).toEqual(["zero"]);
    expect(integerWords(42)).toEqual(["forty", "two"]);
    expect(integerWords(115)).toEqual(["one", "hundred", "fifteen"]);
    expect(integerWords(2026).join(" ")).toBe("two thousand twenty six");
    expect(integerWords(1_000_001).join(" ")).toBe("one million one");
  });
  it("reads decimals, commas and ordinals", () => {
    expect(numberWords("3.14")).toEqual(["three", "point", "one", "four"]);
    expect(numberWords("1,200").join(" ")).toBe("one thousand two hundred");
    expect(numberWords("1st")).toEqual(["first"]);
    expect(numberWords("22nd")).toEqual(["twenty", "second"]);
    expect(numberWords("30th")).toEqual(["thirtieth"]);
    expect(numberWords("abc")).toBeNull();
  });
});

describe("normalising", () => {
  it("drops case and punctuation and keeps apostrophe words together", () => {
    expect(normalizeWords("Hi! I'm so glad you're here.")).toEqual(["hi", "im", "so", "glad", "youre", "here"]);
  });
  it("treats digits and number words the same", () => {
    expect(normalizeWords("We shipped 42 videos")).toEqual(normalizeWords("we shipped forty-two videos"));
    expect(normalizeWords("50% off")).toEqual(["fifty", "percent", "off"]);
    expect(normalizeWords("$5")).toEqual(["five", "dollars"]);
  });
  it("reads a number glued to letters as the number then the letters", () => {
    expect(normalizeWords("renders real 3D,")).toEqual(normalizeWords("renders real three D,"));
    expect(normalizeWords("4K video")).toEqual(["four", "k", "video"]);
    expect(normalizeWords("the 4th take")).toEqual(["the", "fourth", "take"]);
  });
  it("splits dashes and slashes, keeps display words", () => {
    const t = tokenize("Fast—really fast, and/or cheap");
    expect(t.display).toEqual(["Fast", "really", "fast,", "and/or", "cheap"]);
    expect(t.tokens.map((x) => x.t)).toEqual(["fast", "really", "fast", "and", "or", "cheap"]);
    expect(t.tokens[4].src).toBe(3);
  });
  it("ignores pure punctuation and stage directions", () => {
    expect(normalizeWords("Hello <!-- smile --> - world ...")).toEqual(["hello", "world"]);
  });
  it("folds harmless spelling differences", () => {
    expect(foldSpelling("colour")).toBe(foldSpelling("color"));
    expect(foldSpelling("organise")).toBe(foldSpelling("organize"));
    expect(foldSpelling("centre")).toBe(foldSpelling("center"));
    expect(foldSpelling("live")).not.toBe(foldSpelling("lift"));
  });
  it("keeps non-English letters and digits", () => {
    expect(normalizeWords("Hei, jeg heter Åse og er 42 år", "no")).toEqual(["hei", "jeg", "heter", "ase", "og", "er", "42", "ar"]);
  });
});

describe("alignment", () => {
  it("matches identical lines", () => {
    expect(align(["a", "b"], ["a", "b"]).map((o) => o.op)).toEqual(["ok", "ok"]);
  });
  it("merges split and joined words for free", () => {
    expect(align(["cut", "scene", "rocks"], ["cutscene", "rocks"]).map((o) => o.op)).toEqual(["merge", "ok"]);
    expect(align(["cutscene"], ["cut", "scene"]).map((o) => o.op)).toEqual(["merge"]);
  });
  it("finds substitutions, deletions and insertions", () => {
    const ops = align(["we", "live", "here"], ["we", "lift", "here", "now"]).map((o) => o.op);
    expect(ops).toEqual(["ok", "sub", "ok", "ins"]);
    expect(wordErrorRate(["a", "b", "c", "d"], ["a", "c", "d"])).toBe(0.25);
  });
});

describe("judging a line", () => {
  it("passes a line that was heard right, with caption timings in script spelling", () => {
    const v = judgeLine("Meet Cutscene.", heard("Meet cutscene."), { duration: 1.2 });
    expect(v.verified).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.words).toEqual([
      { w: "Meet", start: 0, end: 0.25, p: 0.95 },
      { w: "Cutscene.", start: 0.3, end: 0.55, p: 0.95 },
    ]);
  });
  it("catches the owner's real case: live heard as lift", () => {
    const v = judgeLine("Videos that feel alive and live.", heard("Videos that feel alive and lift."));
    expect(v.verified).toBe(false);
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0]).toMatchObject({ type: "wrong", expected: "live", heard: "lift" });
    expect(describeIssue(v.issues[0])).toContain('"live." was heard as "lift"');
  });
  it("reports missing and extra words", () => {
    const missing = judgeLine("One two three four", heard("One two four"));
    expect(missing.issues).toEqual([expect.objectContaining({ type: "missing", expected: "three" })]);
    const missingWord = missing.words.find((w) => w.w === "three");
    expect(missingWord.estimated).toBe(true);
    expect(missingWord.start).toBeGreaterThanOrEqual(missing.words[1].end);
    const extra = judgeLine("One two", heard("One two thank you"));
    expect(extra.issues).toEqual([expect.objectContaining({ type: "extra", heard: "thank you" })]);
  });
  it("accepts numbers written as digits on one side and words on the other", () => {
    expect(judgeLine("We made 42 videos.", heard("We made forty-two videos.")).verified).toBe(true);
    expect(judgeLine("We made forty two videos.", heard("We made 42 videos.")).verified).toBe(true);
  });
  it("groups a numeric expansion back onto its display word", () => {
    const v = judgeLine("Only 42 left", heard("Only forty two left"));
    expect(v.words.map((w) => w.w)).toEqual(["Only", "42", "left"]);
    expect(v.words[1]).toMatchObject({ start: 0.3, end: 0.85 });
  });
  it("warns about unsure words without failing them", () => {
    const words = heard("This is fine");
    words[2].p = 0.2;
    const v = judgeLine("This is fine", words);
    expect(v.verified).toBe(true);
    expect(v.warnings).toEqual([expect.objectContaining({ type: "unsure", word: "fine" })]);
  });
  it("spots a file that holds another beat's line (lines in the wrong order)", () => {
    const v = judgeLine("First we plan the video.", heard("Then we render it in the cloud."), {
      otherLines: [{ id: "b2", line: "Then we render it in the cloud." }, { id: "b3", line: "Finally we share it." }],
    });
    expect(v.verified).toBe(false);
    expect(v.issues.at(-1)).toMatchObject({ type: "other_line", id: "b2" });
  });
  it("warns about long silence at the end", () => {
    const v = judgeLine("Short line here", heard("Short line here"), { duration: 4 });
    expect(v.warnings.map((w) => w.type)).toContain("tail_silence");
  });
  it("fails an empty transcript", () => {
    const v = judgeLine("Something should be here", []);
    expect(v.verified).toBe(false);
    expect(v.issues[0].type).toBe("missing");
    expect(v.words).toHaveLength(4);
  });
});

describe("voice descriptions", () => {
  it("maps a description to OmniVoice's tags", () => {
    const p = parseOmniVoiceDescription("Female, young adult, American accent");
    expect(p.ok).toBe(true);
    expect(p.instruct).toBe("female, young adult, american accent");
  });
  it("understands everyday words", () => {
    expect(parseOmniVoiceDescription("woman, old, british, deep").instruct).toBe("female, elderly, british accent, low pitch");
  });
  it("rejects what OmniVoice can't do, with suggestions", () => {
    const p = parseOmniVoiceDescription("femal, warm and friendly");
    expect(p.ok).toBe(false);
    expect(p.unknown[0]).toMatchObject({ item: "femal", suggestion: "female" });
    expect(p.unknown[1].item).toBe("warm and friendly");
  });
  it("rejects clashing tags", () => {
    const p = parseOmniVoiceDescription("male, female");
    expect(p.ok).toBe(false);
    expect(p.conflicts).toEqual([["male", "female"]]);
  });
  it("picks a Kokoro preset", () => {
    expect(pickKokoroVoice("female, young adult, american accent")).toBe("af_heart");
    expect(pickKokoroVoice("male, british accent")).toBe("bm_george");
    expect(pickKokoroVoice("a man")).toBe("am_michael");
    expect(pickKokoroVoice("", "es")).toBe("ef_dora");
  });
  it("estimates line length", () => {
    expect(estimateSeconds("one two three four five six seven eight nine ten eleven twelve thirteen")).toBeCloseTo(5, 0);
  });
});
