import { describe, expect, it } from "vitest";
import { cutSheet, mixGraph, musicGrid, parseLoudnormJson, parseSegments, spliceGraph } from "../../skills/cutscene-edit/scripts/lib/music.mjs";

/** A synthetic beat: a decaying low thump on every beat, a hi-hat tick half a beat later. */
function beatTrack({ bpm = 120, seconds = 12, sr = 22050, phase = 0.1 } = {}) {
  const P = 60 / bpm;
  const full = new Float32Array(seconds * sr);
  const low = new Float32Array(seconds * sr);
  for (let b = 0; phase + b * P < seconds; b++) {
    const k0 = Math.round((phase + b * P) * sr);
    for (let i = 0; i < 0.12 * sr && k0 + i < full.length; i++) {
      const v = Math.sin((2 * Math.PI * 60 * i) / sr) * Math.exp(-i / (0.03 * sr)) * 0.8;
      full[k0 + i] += v;
      low[k0 + i] += v;
    }
    const h0 = Math.round((phase + (b + 0.5) * P) * sr);
    for (let i = 0; i < 0.02 * sr && h0 + i < full.length; i++) full[h0 + i] += Math.sin(i * 2.7) * Math.exp(-i / (0.004 * sr)) * 0.5;
  }
  return { full, low, sr, P, phase };
}

describe("music grid", () => {
  it("measures the beat period and locks the phase to the kick, not the hi-hat", () => {
    const t = beatTrack();
    const g = musicGrid(t.full, t.low, { bpm: 120, sr: t.sr });
    expect(g.bpm).toBeGreaterThan(119);
    expect(g.bpm).toBeLessThan(121);
    expect(Math.abs(g.phase - t.phase)).toBeLessThan(0.03);
    expect(g.bars.length).toBeGreaterThan(3);
    expect(g.beats[1].t - g.beats[0].t).toBeCloseTo(0.5, 2);
  });
});

describe("splice and cut sheet", () => {
  it("cuts 12 ms before each grid point with crossfades, ducks the pre-drop gap and fades out", () => {
    const g = spliceGraph({ period: 0.5, phase: 0.1, segments: [[0, 8], [16, 20]], length: 6, gapBeat: 8, fade: 0.5 });
    expect(g).toContain("atrim=start=0.08800:end=4.10000"); // beat 8 end + 12 ms crossfade
    expect(g).toContain("acrossfade=d=0.012");
    expect(g).toContain("volume=0.158:enable='between(t,3.7500,3.9960)'");
    expect(g).toContain("afade=t=out:st=5.500:d=0.5");
  });
  it("parses segments and rejects bad ones", () => {
    expect(parseSegments("4-28, 48-56.5")).toEqual([[4, 28], [48, 56.5]]);
    expect(() => parseSegments("8-4")).toThrow();
    expect(() => parseSegments("")).toThrow();
  });
  it("lays chapters on the grid with an accelerating flurry", () => {
    const s = cutSheet({ period: 0.5, fps: 30, length: 8, chapters: "Hook:4, Flurry:4, End:rest" });
    expect(s.rows.map((r) => [r.chapter, r.start, r.end, r.frameStart, r.frameEnd])).toEqual([
      ["Hook", 0, 2, 0, 60],
      ["Flurry", 2, 4, 60, 120],
      ["End", 4, 8, 120, 240],
    ]);
    expect(s.rows[1].cuts.map((c) => c.beat)).toEqual([4, 5, 6, 6.5, 7, 7.5]);
    expect(() => cutSheet({ period: 0.5, chapters: "Hook" })).toThrow(/needs a length/);
  });
});

describe("mix", () => {
  it("places effects in milliseconds and trims long ones with a fade", () => {
    const g = mixGraph({ events: [{ t: 0.4644, gain: 0.5, max: 0.5 }, { t: 1, gain: 0.2 }], length: 6 });
    expect(g).toContain("[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:0.5,afade=t=out:st=0.46:d=0.04,volume=0.5,adelay=464|464[e0]");
    expect(g).toContain("[b][e0][e1]amix=inputs=3:normalize=0:duration=first,apad=whole_dur=6,atrim=0:6[m]");
  });
  it("only lets numbers into the mix graph", () => {
    const sneaky = "1[x];movie=secret.wav" as unknown as number;
    const g = mixGraph({ bedGain: sneaky, events: [{ t: 1, gain: sneaky, max: sneaky }], length: 6 });
    expect(g).not.toContain("movie");
    expect(g).toContain("volume=0.9[b]");
    expect(g).toContain("stereo,volume=0.5,adelay=1000|1000[e0]");
  });
  it("reads FFmpeg's loudnorm summary", () => {
    const j = parseLoudnormJson('[Parsed_loudnorm_0] \n{\n "input_i" : "-17.93",\n "input_tp" : "-4.2",\n "input_lra" : "3.1",\n "input_thresh" : "-28.1",\n "target_offset" : "0.1"\n}');
    expect(j.input_i).toBe("-17.93");
  });
});
