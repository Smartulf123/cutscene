// Edit lists (EDLs): what to keep and what to cut, in whole frames, always measured on the
// original source; plus retiming a transcript onto the edited video.
//
// The range maths (merge, complement, "removed before", retime) follows Herk Edit Kit's
// cut-silences and apply-cuts (MIT + Herk Edit Kit Use Permission, Copyright (c) 2026 Nate Herk
// and kit contributors); frame alignment, keep-to-output mapping and composing two edits into
// one are Cutscene's. Modified for Cutscene (Apache-2.0).
import { EditError, ms } from "./cli.mjs";

export type Range = { start: number; end: number; reasons?: string[]; reason?: string };
export type Keep = { start: number; end: number; out_start: number; out_end: number };
export type Edl = {
  version: 1;
  kind: "cutscene-edl";
  tool: string;
  source: string | null;
  fps: number;
  source_duration: number;
  edited_duration: number;
  removed: number;
  params?: Record<string, unknown>;
  keep_ranges: Keep[];
  delete_ranges: { start: number; end: number; reasons: string[] }[];
  parent?: string | null;
  created?: string;
};

/** An EDL as read from a file: a Cutscene EDL, or a kit EDL that has no output positions yet. */
export type LooseEdl = {
  keep_ranges?: { start: number; end: number; out_start?: number; out_end?: number }[];
  delete_ranges?: { start: number; end: number; reasons?: string[]; reason?: string }[];
  source_duration?: unknown;
  fps?: number;
  edited_duration?: number;
  [k: string]: unknown;
};

/** A word retimed onto the edited video, with its source times kept. */
export type Retimed<W> = Omit<W, "start" | "end"> & { start: number; end: number; source_start: number; source_end: number; clipped?: boolean };

/** Snap a time to the nearest frame. */
export function snap(t: number, fps: number): number {
  return fps > 0 ? ms(Math.round(t * fps) / fps) : ms(t);
}

/**
 * Sort and merge overlapping or touching ranges, keeping every reason.
 */
export function mergeRanges(ranges: Range[], touch: number = 1e-6): { start: number; end: number; reasons: string[] }[] {
  const sorted = ranges
    .map((r) => ({ start: Number(r.start), end: Number(r.end), reasons: r.reasons ? [...r.reasons] : r.reason ? [r.reason] : [] }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; reasons: string[] }[] = [];
  for (const r of sorted) {
    const last = merged.at(-1);
    if (!last || r.start > last.end + touch) merged.push(r);
    else {
      last.end = Math.max(last.end, r.end);
      last.reasons.push(...r.reasons);
    }
  }
  return merged;
}

/**
 * The parts of [0, duration) not covered by `deletes`.
 * @param deletes merged and sorted
 */
export function complement(deletes: { start: number; end: number }[], duration: number): { start: number; end: number }[] {
  const keeps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const d of deletes) {
    if (d.start > cursor) keeps.push({ start: cursor, end: Math.min(d.start, duration) });
    cursor = Math.max(cursor, d.end);
  }
  if (cursor < duration) keeps.push({ start: cursor, end: duration });
  return keeps.filter((k) => k.end > k.start);
}

/**
 * Build a frame-aligned EDL from ranges to delete (source seconds).
 */
export function buildEdl(o: { deletes: Range[]; duration: number; fps?: number; tool: string; source?: string | null; params?: Record<string, unknown>; minKeep?: number; parent?: string | null }): Edl {
  const fps = o.fps && o.fps > 0 ? o.fps : 30;
  const duration = ms(o.duration);
  if (!(duration > 0)) throw new EditError("BAD_DURATION", "The source duration is unknown or zero.", "Pass --video so Cutscene can measure it, or use a transcript with audio_duration_secs.");
  const minKeep = o.minKeep ?? 0.04;
  for (const d of o.deletes) {
    if (!Number.isFinite(Number(d.start)) || !Number.isFinite(Number(d.end)) || Number(d.end) <= Number(d.start)) {
      throw new EditError("BAD_CUT", `A cut range is not valid: ${JSON.stringify({ start: d.start, end: d.end })}.`, "Every cut needs numeric start < end, in seconds.");
    }
    if (Number(d.start) < -0.001 || Number(d.end) > duration + 0.05) {
      throw new EditError("CUT_OUT_OF_RANGE", `A cut (${d.start}–${d.end} s) is outside the source (0–${duration} s).`, "Cut times must be on the same timeline as the transcript you pass; never mix original and edited times.");
    }
  }
  // Frame-align every cut edge to the frame at or before it: a cut that starts on a word starts
  // before the word (no stray onset is left), and a cut that ends where the next word begins never
  // eats into it. The last cut may run to the very end of the source.
  const floorF = (t: number): number => ms(Math.floor(t * fps + 1e-6) / fps);
  let deletes = mergeRanges(
    o.deletes.map((d) => ({ ...d, start: Math.max(0, floorF(Number(d.start))), end: Number(d.end) >= duration - 1e-3 ? duration : Math.min(duration, floorF(Number(d.end))) })),
  );
  // A sliver of footage between two cuts flashes on screen: cut it too.
  let keeps = complement(deletes, duration);
  const slivers = keeps.filter((k) => k.end - k.start < minKeep);
  if (slivers.length) {
    deletes = mergeRanges([...deletes, ...slivers.map((k) => ({ ...k, reasons: ["sliver between cuts"] }))]);
    keeps = complement(deletes, duration);
  }
  if (!keeps.length) throw new EditError("CUTS_EVERYTHING", "These cuts would remove the whole video.", "Check the cut list; at least some footage has to stay.");
  let out = 0;
  const keep_ranges = keeps.map((k) => {
    const len = ms(k.end - k.start);
    const r = { start: ms(k.start), end: ms(k.end), out_start: ms(out), out_end: ms(out + len) };
    out += len;
    return r;
  });
  const edited = ms(keep_ranges.reduce((s, k) => s + (k.end - k.start), 0));
  return {
    version: 1,
    kind: "cutscene-edl",
    tool: o.tool,
    source: o.source ?? null,
    fps,
    source_duration: duration,
    edited_duration: edited,
    removed: ms(duration - edited),
    params: o.params ?? {},
    keep_ranges,
    delete_ranges: deletes.map((d) => ({ start: ms(d.start), end: ms(d.end), reasons: [...new Set(d.reasons)] })),
    parent: o.parent ?? null,
  };
}

/**
 * An output (edited) time back on the source.
 */
export function outToSource(edl: Edl, t: number): number {
  for (const k of edl.keep_ranges) if (t <= k.out_end + 1e-9) return k.start + Math.max(0, t - k.out_start);
  const last = edl.keep_ranges.at(-1);
  return last ? last.end : t;
}

/**
 * A source time on the output, or null when it was cut.
 */
export function sourceToOut(edl: Edl, t: number): number | null {
  for (const k of edl.keep_ranges) if (t >= k.start - 1e-9 && t <= k.end + 1e-9) return k.out_start + (t - k.start);
  return null;
}

/**
 * Turn cuts made on a parent edit's OUTPUT into one EDL on the original source, so the final
 * video is cut from the original in one pass (no second encode, no drift).
 */
export function composeEdl(parent: Edl, cutsOnOutput: Range[], o: { tool: string; params?: Record<string, unknown>; parentPath?: string | null }): Edl {
  const mapped: Range[] = [];
  for (const c of cutsOnOutput) {
    const a = Number(c.start);
    const b = Number(c.end);
    if (!(b > a)) throw new EditError("BAD_CUT", `A cut range is not valid: ${JSON.stringify(c)}.`, "Every cut needs numeric start < end.");
    if (a < -0.001 || b > parent.edited_duration + 0.05) {
      throw new EditError("CUT_OUT_OF_RANGE", `A cut (${a}–${b} s) is outside the edited video (0–${parent.edited_duration} s).`, "Cut times must be on the edited timeline of the transcript you pass.");
    }
    for (const k of parent.keep_ranges) {
      const lo = Math.max(a, k.out_start);
      const hi = Math.min(b, k.out_end);
      if (hi > lo) mapped.push({ start: k.start + (lo - k.out_start), end: k.start + (hi - k.out_start), reasons: c.reasons ?? (c.reason ? [c.reason] : []) });
    }
  }
  return buildEdl({
    deletes: [...parent.delete_ranges, ...mapped],
    duration: parent.source_duration,
    fps: parent.fps,
    tool: o.tool,
    source: parent.source,
    params: o.params,
    parent: o.parentPath ?? null,
  });
}

/**
 * Retime words (source times) onto the edited video. Words fully inside a cut are dropped; a word
 * a cut boundary runs through is clipped to its kept part and marked `clipped`.
 * @param words  source-timeline words
 */
export function retimeWords<W extends { text: string; start: number; end: number }>(words: W[], edl: Edl): { words: Retimed<W>[]; dropped: number; clipped: number } {
  const out: Retimed<W>[] = [];
  let dropped = 0;
  let clipped = 0;
  for (const w of words) {
    let best: { k: Keep; lo: number; hi: number } | null = null;
    let bestLen = 0;
    for (const k of edl.keep_ranges) {
      const lo = Math.max(w.start, k.start);
      const hi = Math.min(w.end, k.end);
      const len = hi - lo;
      if (len > bestLen || (len === 0 && bestLen === 0 && w.start === w.end && w.start >= k.start && w.start <= k.end)) {
        best = { k, lo, hi };
        bestLen = len;
      }
      if (k.start > w.end) break;
    }
    // A word mostly inside a cut is gone; a sliver of it left at a join is not a word.
    if (!best || (w.end > w.start && bestLen < 0.5 * (w.end - w.start))) {
      dropped++;
      continue;
    }
    const { k, lo, hi } = best;
    const isClipped = lo > w.start + 0.02 || hi < w.end - 0.02;
    if (isClipped) clipped++;
    const { start: _s, end: _e, ...rest } = w;
    out.push({
      ...rest,
      start: ms(k.out_start + (lo - k.start)),
      end: ms(k.out_start + (hi - k.start)),
      source_start: ms(w.start),
      source_end: ms(w.end),
      ...(isClipped ? { clipped: true } : {}),
    });
  }
  return { words: out, dropped, clipped };
}

/**
 * Source-timeline words from any transcript: edited transcripts carry source_start/source_end.
 */
export function sourceTimes<W extends { start: number; end: number; source_start?: number; source_end?: number }>(words: W[]): W[] {
  return words.map((w) => (Number.isFinite(w.source_start) && Number.isFinite(w.source_end) ? { ...w, start: w.source_start as number, end: w.source_end as number } : { ...w }));
}

/**
 * FFmpeg filtergraph: trim each kept range, short audio fades at every join (no clicks), concat.
 */
export function filterScript(keeps: { start: number; end: number }[], o: { video?: boolean; audio?: boolean; fade?: number } = {}): string {
  const video = o.video !== false;
  const audio = o.audio !== false;
  const fade = o.fade ?? 0.02;
  const lines: string[] = [];
  keeps.forEach((r, i) => {
    const s = r.start.toFixed(6);
    const e = r.end.toFixed(6);
    if (video) lines.push(`[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${i}];`);
    if (audio) {
      const len = r.end - r.start;
      const fades: string[] = [];
      if (fade > 0 && len > fade * 3) {
        if (i > 0) fades.push(`afade=t=in:st=0:d=${fade}`);
        if (i < keeps.length - 1) fades.push(`afade=t=out:st=${(len - fade).toFixed(6)}:d=${fade}`);
      }
      lines.push(`[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS${fades.length ? "," + fades.join(",") : ""}[a${i}];`);
    }
  });
  const ins = keeps.map((_, i) => `${video ? `[v${i}]` : ""}${audio ? `[a${i}]` : ""}`).join("");
  lines.push(`${ins}concat=n=${keeps.length}:v=${video ? 1 : 0}:a=${audio ? 1 : 0}${video ? "[v]" : ""}${audio ? "[a]" : ""}`);
  return lines.join("\n");
}

/** Validate that a JSON object is a Cutscene EDL (or a kit EDL we can read). */
export function asEdl(obj: LooseEdl | null | undefined, path: string = "the edit list"): Edl {
  if (!obj || !Array.isArray(obj.keep_ranges) || !Number.isFinite(Number(obj.source_duration))) {
    throw new EditError("BAD_EDL", `${path} is not an edit list (it needs keep_ranges and source_duration).`, "Use an *.edl.json written by a Cutscene edit tool.");
  }
  // The tool name becomes part of output file names, so it must not carry a path.
  if (obj.tool !== undefined && !(typeof obj.tool === "string" && /^[\w-]{1,40}$/.test(obj.tool))) {
    throw new EditError("BAD_EDL", `${path} names its tool as ${JSON.stringify(obj.tool)}, which isn't a plain tool name.`, "Use an *.edl.json written by a Cutscene edit tool.");
  }
  if (obj.keep_ranges.length && obj.keep_ranges[0].out_start === undefined) {
    // A kit EDL: add the output positions.
    let out = 0;
    obj.keep_ranges = obj.keep_ranges.map((k) => {
      const r = { start: k.start, end: k.end, out_start: ms(out), out_end: ms(out + k.end - k.start) };
      out += k.end - k.start;
      return r;
    });
    obj.delete_ranges = (obj.delete_ranges ?? []).map((d) => ({ start: d.start, end: d.end, reasons: d.reasons ?? (d.reason ? [d.reason] : []) }));
    obj.fps = obj.fps ?? 30;
    obj.edited_duration = obj.edited_duration ?? ms(out);
  }
  return obj as Edl;
}
