// Ported from Cutscene 1's tests (Apache-2.0): src/lib/project/highlights.test.ts,
// reframe.test.ts and src/lib/media/sync-math.test.ts, plus cleanup filters.
import { describe, expect, it } from "vitest";
import { findHighlights, sentences } from "../../skills/cutscene-edit/scripts/lib/highlights.mjs";
import { KEYS_PER_PASS, chunkKeys, cropSize, cropXExpr, mainFaceCentres, parseAspect, positionAt, reframeKeys, simplify, visibleWidth } from "../../skills/cutscene-edit/scripts/lib/reframe.mjs";
import { bestLag, envelope, normalizedOnsets } from "../../skills/cutscene-edit/scripts/lib/sync.mjs";
import { cleanupFilter, humFilters } from "../../skills/cutscene-edit/scripts/lib/cleanup.mjs";

/** Sentences spoken back to back, 0.35 s a word, 0.6 s between sentences. */
function talk(lines) {
  const out = [];
  let t = 0;
  for (const line of lines) {
    for (const w of line.split(" ")) {
      out.push({ text: w, start: t, end: t + 0.3 });
      t += 0.35;
    }
    t += 0.6;
  }
  return out;
}
const filler = "and then we kind of moved on to the next part of the day which was fine.";

describe("highlights", () => {
  it("splits sentences on punctuation and long pauses", () => {
    expect(sentences(talk(["One two three.", "Four five"])).map((s) => s.text)).toEqual(["One two three.", "Four five"]);
  });
  it("ranks a stretch that opens with a hook above one that opens on filler", () => {
    const lines = [...Array(6).fill(`So ${filler}`), "Why do most people get this completely wrong?", ...Array(5).fill("The answer is that they never test the idea before they build the whole thing."), ...Array(6).fill(`Um ${filler}`)];
    const [best] = findHighlights(talk(lines), { count: 3 });
    expect(best.opening).toBe("Why do most people get this completely wrong?");
    expect(best.reasons).toContain("opens with a question or hook");
    expect(best.end - best.start).toBeGreaterThanOrEqual(20);
    expect(best.end - best.start).toBeLessThanOrEqual(60);
  });
  it("never returns overlapping candidates", () => {
    const hs = findHighlights(talk(Array(40).fill("Here is one more complete thought about editing video.")), { count: 6 });
    expect(hs.length).toBeGreaterThan(1);
    for (const a of hs) for (const b of hs) if (a !== b) expect(a.end <= b.start || b.end <= a.start).toBe(true);
  });
});

const SOURCE = 16 / 9;
const PORTRAIT = 9 / 16;
const face = (cx, size = 0.15) => ({ x: cx - size / 2, y: 0.2, w: size, h: size * 1.8, score: 0.95 });
const track = (centres, fps = 4) => ({ fps, frames: centres.map((c) => (c === null ? [] : [face(c)])) });
function inCrop(keys, centre, t) {
  const v = visibleWidth(SOURCE, PORTRAIT);
  const left = positionAt(keys, t) * (1 - v);
  return (centre - left) / v;
}

describe("auto-reframe", () => {
  it("keeps a face that walks across the frame centred in a 9:16 crop", () => {
    const centres = Array.from({ length: 80 }, (_, i) => 0.5 - 0.25 * Math.cos((2 * Math.PI * i) / 80));
    const keys = reframeKeys(track(centres), SOURCE, PORTRAIT);
    const offsets = centres.map((c, i) => Math.abs(inCrop(keys, c, i / 4) - 0.5));
    expect(offsets.filter((o) => o <= 0.15).length / offsets.length).toBeGreaterThanOrEqual(0.95);
    expect(keys.length).toBeLessThan(80);
  });
  it("holds still while the face only fidgets, and through frames with no face", () => {
    const centres = Array.from({ length: 40 }, (_, i) => (i % 9 === 0 ? null : 0.6 + 0.01 * Math.sin(i)));
    const keys = reframeKeys(track(centres), SOURCE, PORTRAIT);
    const ps = Array.from({ length: 40 }, (_, i) => positionAt(keys, i / 4));
    expect(Math.max(...ps) - Math.min(...ps)).toBeLessThan(0.02);
  });
  it("needs no keyframes when the frame already shows the whole width", () => {
    expect(reframeKeys(track([0.3, 0.7]), SOURCE, SOURCE)).toEqual([]);
  });
  it("follows the same person when another face appears", () => {
    const frames = { fps: 4, frames: [[face(0.3)], [face(0.3), face(0.8, 0.14)], [face(0.31), face(0.8, 0.15)]] };
    expect(mainFaceCentres(frames)).toEqual([0.3, 0.3, 0.31]);
  });
  it("simplifies a straight run to its ends", () => {
    const line = Array.from({ length: 10 }, (_, i) => ({ t: i, p: i / 10 }));
    expect(simplify(line, 0.001)).toEqual([line[0], line[9]]);
  });
  it("sizes the crop on even pixels and parses aspects", () => {
    expect(cropSize(1280, 720, 9 / 16)).toEqual({ w: 404, h: 720 });
    expect(cropSize(1080, 1920, 1)).toEqual({ w: 1080, h: 1080 });
    expect(parseAspect("9:16")).toBeCloseTo(0.5625);
    expect(() => parseAspect("tall")).toThrow(/9:16/);
  });
  it("writes a flat crop expression that FFmpeg can evaluate (t guarded for NaN)", () => {
    const e = cropXExpr([{ t: 0, p: 0 }, { t: 1, p: 1 }], 100);
    expect(e).toBe("lt(max(t\\,0)\\,0.000)*0.00+gte(max(t\\,0)\\,0.000)*lt(max(t\\,0)\\,1.000)*(0.00+(100.00-0.00)*(max(t\\,0)-0.000)/1.000)+gte(max(t\\,0)\\,1.000)*100.00");
    expect(cropXExpr([], 100)).toBe("50.00");
    // Evaluate it the way FFmpeg would: piecewise linear between keyframes.
    const js = (t) => Function("t", `const max=Math.max, lt=(a,b)=>+(a<b), gte=(a,b)=>+(a>=b); return ${e.replace(/\\,/g, ",")};`)(t);
    expect(js(0.5)).toBeCloseTo(50);
    expect(js(2)).toBeCloseTo(100);
  });
  it("splits many keyframes into windows that meet exactly", () => {
    const keys = Array.from({ length: 150 }, (_, i) => ({ t: i * 0.25, p: (i % 10) / 10 }));
    const w = chunkKeys(keys, 40, 30);
    expect(w.length).toBeGreaterThan(1);
    expect(w[0].from).toBe(0);
    expect(w.at(-1).to).toBe(40);
    for (let i = 1; i < w.length; i++) expect(w[i].from).toBe(w[i - 1].to);
    for (const x of w) {
      expect(x.keys.length).toBeLessThanOrEqual(KEYS_PER_PASS + 2);
      expect(x.keys[0].t).toBe(0);
      // Window-local keys reproduce the global path.
      expect(positionAt(x.keys, 0)).toBeCloseTo(positionAt(keys, x.from), 3);
    }
    expect(chunkKeys(keys.slice(0, 10), 3, 30)).toHaveLength(1);
  });
});

/** Speech-like bursts: noise switched on and off at random. */
function bursts(seconds, rate, seed) {
  let x = seed;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = new Float32Array(seconds * rate);
  let on = false;
  let left = 0;
  for (let i = 0; i < out.length; i++) {
    if (left-- <= 0) {
      on = !on;
      left = Math.floor((0.05 + rnd() * 0.4) * rate);
    }
    out[i] = on ? (rnd() * 2 - 1) * 0.5 : (rnd() * 2 - 1) * 0.005;
  }
  return out;
}

describe("sync two recordings", () => {
  const rate = 8000;
  const hop = 80;
  const voice = bursts(20, rate, 7);
  it("finds how much later the same sound starts in the second recording", () => {
    const shift = Math.round(1.37 * rate);
    const late = new Float32Array(voice.length);
    late.set(voice.subarray(0, voice.length - shift), shift);
    let s = 3;
    for (let i = 0; i < late.length; i++) late[i] = late[i] * 0.3 + ((s = (s * 69069 + 1) % 4294967296) / 4294967296 - 0.5) * 0.006;
    const r = bestLag(normalizedOnsets(envelope(voice, hop)), normalizedOnsets(envelope(late, hop)), 300);
    expect(r.lag * (hop / rate)).toBeCloseTo(1.37, 1);
    expect(r.confidence).toBeGreaterThan(1.5);
  });
  it("finds earlier starts too (negative shifts)", () => {
    const early = voice.slice(Math.round(0.8 * rate));
    const r = bestLag(normalizedOnsets(envelope(voice, hop)), normalizedOnsets(envelope(early, hop)), 300);
    expect(r.lag * (hop / rate)).toBeCloseTo(-0.8, 1);
  });
  it("finds a short clip inside a long one, ignoring sliver overlaps", () => {
    const clip = voice.slice(3 * rate, 9 * rate);
    const r = bestLag(normalizedOnsets(envelope(voice, hop)), normalizedOnsets(envelope(clip, hop)), 3000);
    expect(r.lag * (hop / rate)).toBeCloseTo(-3, 1);
  });
  it("has low confidence for unrelated sound", () => {
    const r = bestLag(normalizedOnsets(envelope(voice, hop)), normalizedOnsets(envelope(bursts(20, rate, 99), hop)), 300);
    expect(r.confidence).toBeLessThan(1.5);
  });
});

describe("hum and noise filters", () => {
  it("notches hum families above a high-pass", () => {
    expect(humFilters()[0]).toBe("highpass=f=80:poles=2");
    expect(cleanupFilter({ hum: true, noise: false, strength: "normal" })).toContain("bandreject=f=100:width_type=q:w=25");
  });
  it("tells the denoiser the measured floor, within limits", () => {
    expect(cleanupFilter({ hum: false, noise: true, strength: "strong" }, -60)).toBe("afftdn=nr=36:nf=-50:tn=1");
    expect(cleanupFilter({ hum: false, noise: true, strength: "light" }, -200)).toBe("afftdn=nr=12:nf=-80:tn=1");
    expect(cleanupFilter({ hum: false, noise: false, strength: "light" })).toBe("anull");
  });
});
