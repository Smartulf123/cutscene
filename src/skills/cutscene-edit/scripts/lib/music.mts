// Adapted from Herk Edit Kit .claude/skills/motion-showreel/scripts/music-grid.mjs, splice-music.mjs, beatgrid.mjs and mix.mjs, commit 10511e5af8 (MIT + Herk Edit Kit Use Permission), Copyright (c) 2026 Nate Herk and kit contributors. Modified for Cutscene.
//
// Music on the cut grid:
//   musicGrid   measure a track's true beat period and downbeat phase (from the kick band, so the
//               grid does not lock onto off-beat hi-hats half a beat late), plus a bar energy map
//   spliceGraph cut a track at beat-accurate points (12 ms before each grid point, 12 ms crossfades)
//   cutSheet    lay chapters on the beat grid in seconds and frames
//   mixGraph    premix the bed and beat-placed sound effects, then two-pass loudness normalisation
// Changes for Cutscene: pure functions separated from FFmpeg calls, JSON results, a -1.5 dBTP
// default true-peak ceiling and a check that the bed sits under the voice.

/** A beat grid measured by musicGrid. */
export type MusicGrid = {
  period: number;
  bpm: number;
  phase: number;
  fullBandPhase: number;
  kickContrast: number;
  halfBeatWarning: boolean;
  duration: number;
  bars: { bar: number; beat: number; t: number; rms_db: number; low_db: number; onset: number }[];
  beats: { beat: number; t: number; low_db: number }[];
};
/** One chapter of a cut sheet. */
export type CutSheetRow = { chapter: string; beatStart: number; beatEnd: number; start: number; end: number; frameStart: number; frameEnd: number; cuts: { beat: number; t: number; frame: number }[] };
/** The cut sheet beatgrid prints. */
export type CutSheet = { period: number; bpm: number; fps: number; length: number; frames: number; framesPerBeat: number; rows: CutSheetRow[] };
/** FFmpeg loudnorm's measurement summary (its values are strings). */
export type LoudnormJson = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string; [k: string]: unknown };

const db = (v: number): number => 10 * Math.log10(v + 1e-12);

/** Mean energy per window. */
export function energy(x: Float32Array, hop: number, win: number): number[] {
  const e: number[] = [];
  for (let i = 0; i + win < x.length; i += hop) {
    let s = 0;
    for (let j = 0; j < win; j++) s += x[i + j] * x[i + j];
    e.push(s / win);
  }
  return e;
}

/** Positive log-energy changes: where sounds start. */
export function onset(e: number[]): number[] {
  return e.map((v, i) => (i ? Math.max(0, Math.log(v + 1e-10) - Math.log(e[i - 1] + 1e-10)) : 0));
}

/** Fold onsets at period P into bins: the strongest bin is the beat's phase. */
export function fold(o: number[], P: number, bins: number, rate: number, lead: number): { strength: number; phase: number; contrast: number } {
  const b = new Float64Array(bins);
  o.forEach((v, i) => {
    b[Math.floor(((((i / rate + lead) % P) + P) % P / P) * bins) % bins] += v;
  });
  let k = 0;
  for (let i = 1; i < bins; i++) if (b[i] > b[k]) k = i;
  const avg = b.reduce((x, y) => x + y, 0) / bins;
  return { strength: b[k], phase: ((k + 0.5) / bins) * P, contrast: avg ? b[k] / avg : 0 };
}

/**
 * Beat grid from decoded audio.
 * @param full  mono samples at `sr`
 * @param low   the same audio low-passed at 120 Hz (the kick band)
 */
export function musicGrid(full: Float32Array, low: Float32Array, o: { bpm?: number; sr?: number } = {}): MusicGrid {
  const BPM = o.bpm ?? 120;
  const SR = o.sr ?? 22050;
  const HOP = 256;
  const WIN = 1024;
  const fps = SR / HOP;
  const dur = full.length / SR;
  const eF = energy(full, HOP, WIN);
  const eL = energy(low, HOP, WIN);
  const oF = onset(eF);
  const SHOP = 64;
  const SWIN = 256;
  const sfps = SR / SHOP;
  const oFs = onset(energy(full, SHOP, SWIN));
  const oLs = onset(energy(low, SHOP, SWIN));
  const mean = oF.reduce((a, b) => a + b, 0) / Math.max(1, oF.length);
  const c = oF.map((v) => v - mean);
  const lo = Math.floor((fps * 60) / (BPM * 1.06));
  const hi = Math.ceil((fps * 60) / (BPM * 0.94));
  let lag = lo;
  let best = -Infinity;
  for (let L = lo; L <= hi; L++) {
    let s = 0;
    for (let i = 0; i + L < c.length; i++) s += c[i] * c[i + L];
    if (s > best) {
      best = s;
      lag = L;
    }
  }
  let P = lag / fps;
  let top = -Infinity;
  for (let k = 0; k <= 80; k++) {
    const p = (lag / fps) * (0.99 + (0.02 * k) / 80);
    const f = fold(oF, p, 64, fps, 0);
    if (f.strength > top) {
      top = f.strength;
      P = p;
    }
  }
  const fullPh = fold(oFs, P, 96, sfps, SWIN / SR);
  const kick = fold(oLs, P, 96, sfps, SWIN / SR);
  const PH = kick.phase;
  const gap = Math.abs(((((fullPh.phase - PH + P / 2) % P) + P) % P) - P / 2);
  const span = (e: number[], t0: number, t1: number): number => {
    const a = Math.floor(t0 * fps);
    const b = Math.max(a + 1, Math.floor(t1 * fps));
    let s = 0;
    for (let i = a; i < b && i < e.length; i++) s += e[i];
    return s / (b - a);
  };
  const bars: MusicGrid["bars"] = [];
  for (let b = 0; PH + (b + 1) * 4 * P <= dur; b++) {
    const t0 = PH + b * 4 * P;
    const t1 = t0 + 4 * P;
    bars.push({ bar: b, beat: b * 4, t: +t0.toFixed(3), rms_db: +db(span(eF, t0, t1)).toFixed(1), low_db: +db(span(eL, t0, t1)).toFixed(1), onset: +span(oF, t0, t1).toFixed(3) });
  }
  const beats: MusicGrid["beats"] = [];
  for (let n = 0; PH + (n + 1) * P <= dur; n++) {
    const t0 = PH + n * P;
    beats.push({ beat: n, t: +t0.toFixed(3), low_db: +db(span(eL, t0, t0 + P)).toFixed(1) });
  }
  return {
    period: +P.toFixed(5),
    bpm: +(60 / P).toFixed(2),
    phase: +PH.toFixed(4),
    fullBandPhase: +fullPh.phase.toFixed(4),
    kickContrast: +kick.contrast.toFixed(2),
    halfBeatWarning: gap > P / 4,
    duration: +dur.toFixed(3),
    bars,
    beats,
  };
}

/**
 * FFmpeg filtergraph that splices beat ranges of a take, on the grid.
 */
export function spliceGraph(o: { period: number; phase?: number; segments: [number, number][]; length?: number; gapBeat?: number | null; fade?: number }): string {
  const P = o.period;
  const PH = o.phase ?? 0;
  const LEN = o.length ?? 15;
  const fade = o.fade ?? 0.9;
  const PRE = 0.012;
  const XF = 0.012;
  const t = (beat: number): number => Math.max(0, PH + beat * P - PRE);
  const parts = o.segments.map(([a, b], i) => `[0:a]asetpts=PTS-STARTPTS,atrim=start=${t(a).toFixed(5)}:end=${(t(b) + (i < o.segments.length - 1 ? XF : 0)).toFixed(5)},asetpts=PTS-STARTPTS[s${i}]`);
  let chain = "[s0]";
  for (let i = 1; i < o.segments.length; i++) {
    parts.push(`${chain}[s${i}]acrossfade=d=${XF}:c1=qsin:c2=qsin[x${i}]`);
    chain = `[x${i}]`;
  }
  const post = [`apad=whole_dur=${LEN}`, `atrim=0:${LEN}`];
  if (o.gapBeat !== null && o.gapBeat !== undefined) {
    const g0 = (o.gapBeat - 0.5) * P;
    const g1 = o.gapBeat * P - 0.004;
    post.push(`volume=0.158:enable='between(t,${g0.toFixed(4)},${g1.toFixed(4)})'`);
  }
  if (fade > 0) post.push(`afade=t=out:st=${(LEN - fade).toFixed(3)}:d=${fade}`);
  parts.push(`${chain}${post.join(",")}[out]`);
  return parts.join(";");
}

/** "4-28,48-56.7" -> [[4,28],[48,56.7]] */
export function parseSegments(s: string | undefined): [number, number][] {
  const segs = String(s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.split("-").map(Number));
  if (!segs.length || segs.some((p) => p.length !== 2 || !p.every(Number.isFinite) || p[1] <= p[0])) throw new Error('Segments look like "4-28,48-56": source beat ranges, start before end.');
  return segs as [number, number][];
}

/**
 * Chapters on the beat grid. A chapter is "Name:beats"; "rest" fills to the length. A chapter whose
 * name starts with "Flurry" lists one cut per beat, then per half beat (the cut rate speeds up).
 */
export function cutSheet(o: { period: number; fps?: number; length?: number; chapters: string }): CutSheet {
  const P = o.period;
  const fps = o.fps ?? 30;
  const length = o.length ?? 15;
  const fr = (t: number): number => Math.round(t * fps);
  const rows: CutSheetRow[] = [];
  let b = 0;
  for (const part of o.chapters.split(",").map((c) => c.trim()).filter(Boolean)) {
    const k = part.lastIndexOf(":");
    if (k < 0) throw new Error(`Chapter "${part}" needs a length: "Name:8" or "Name:rest".`);
    const name = part.slice(0, k).trim();
    const n = part.slice(k + 1).trim();
    const nb = n === "rest" ? length / P - b : Number(n);
    if (!Number.isFinite(nb) || nb <= 0) throw new Error(`Chapter "${name}" has no beats left.`);
    const t0 = b * P;
    const t1 = n === "rest" ? length : (b + nb) * P;
    const row: CutSheetRow = { chapter: name, beatStart: +b.toFixed(2), beatEnd: +(b + nb).toFixed(2), start: +t0.toFixed(3), end: +t1.toFixed(3), frameStart: fr(t0), frameEnd: fr(t1), cuts: [] };
    if (name.toLowerCase().startsWith("flurry")) {
      for (let s = 0; s < nb - 1e-6; s += s < nb / 2 ? 1 : 0.5) row.cuts.push({ beat: +(b + s).toFixed(2), t: +((b + s) * P).toFixed(3), frame: fr((b + s) * P) });
    }
    rows.push(row);
    b += nb;
  }
  return { period: P, bpm: +(60 / P).toFixed(2), fps, length, frames: fr(length), framesPerBeat: +(P * fps).toFixed(2), rows };
}

/**
 * Premix graph: bed plus sound effects placed in seconds.
 * @returns graph ending in [m]; inputs: 0 = bed, 1..n = events in order
 */
export function mixGraph(o: { bedGain?: number; events: { t: number; gain?: number; max?: number }[]; length: number }): string {
  // Values come from JSON files, so only finite numbers reach the filter graph; anything else gets the default.
  const num = (v: unknown, fallback: number): number => (Number.isFinite(Number(v ?? fallback)) ? Number(v ?? fallback) : fallback);
  const length = num(o.length, 0);
  const parts = [`[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=${num(o.bedGain, 0.9)}[b]`];
  const labels = ["[b]"];
  o.events.forEach((e, i) => {
    const max = num(e.max, 0);
    const trim = max ? `atrim=0:${max},afade=t=out:st=${Math.max(0, max - 0.04)}:d=0.04,` : "";
    const msT = Math.max(0, Math.round(num(e.t, 0) * 1000));
    parts.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,${trim}volume=${num(e.gain, 0.5)},adelay=${msT}|${msT}[e${i}]`);
    labels.push(`[e${i}]`);
  });
  parts.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=first,apad=whole_dur=${length},atrim=0:${length}[m]`);
  return parts.join(";");
}

/** The loudnorm summary JSON at the end of FFmpeg's stderr. */
export function parseLoudnormJson(stderr: string): LoudnormJson {
  const s = String(stderr);
  const j = s.slice(s.lastIndexOf("{"), s.lastIndexOf("}") + 1);
  return JSON.parse(j) as LoudnormJson;
}
