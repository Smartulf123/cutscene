// Adapted from Herk Edit Kit .claude/skills/cut-mistakes/scripts/find-cut-candidates.mjs, commit 10511e5af8 (MIT + Herk Edit Kit Use Permission), Copyright (c) 2026 Nate Herk and kit contributors. Modified for Cutscene.
// Also merges Cutscene 1's mistakes.ts (Apache-2.0): spoken numbers are not stutters, pauses from
// the original recording still split sentences after silences were cut, and a retake's cut starts
// where the clean take's opening words were first said.
//
// Mechanical detection of spoken mistakes. It proposes; the agent and the user decide:
//   stutter      the same word twice in a row ("the the")
//   repeat       the same short phrase twice in a row ("I think I think")
//   restart      a sentence abandoned and started again with the same words (a retake)
//   retake       a later sentence that says nearly the same thing (word-overlap similarity)
//   false_start  a short attempt that restarts the same way
//   filler       um / uh; cut only when there is silence on both sides
// Emphasis ("never, never") and rhetorical doubling look the same as a stutter to a machine, so
// every candidate carries context and a recommendation, never a decision.
import { joinWords } from "./transcript.mjs";

/** Lower-case word without surrounding punctuation (the kit's tokeniser). */
export function token(text: string | null | undefined): string {
  return String(text ?? "").toLowerCase().replace(/^[^\p{L}\p{N}$%]+|[^\p{L}\p{N}$%]+$/gu, "");
}

const STOP = new Set("a an and are as at be but by for from i if in is it of on or so that this to was we with you your they their there what when where why how like um uh".split(" "));
/** Spoken numbers repeat legitimately ("twenty twenty four"). */
const NUMBER = /^(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)$/;
/** Doubles that are words, not stutters. */
const DOUBLES = new Set(["bye", "no", "yeah", "very", "really", "so", "ha", "knock", "tick", "chop", "go"]);
export const FILLERS = new Set(["um", "uh", "umm", "uhm", "erm", "er", "ah", "hmm", "mm", "mhm", "eh"]);

export type MWord = { text: string; start: number; end: number; source_start?: number; source_end?: number; pauseBefore?: number };
/** A proposed cut. `overlaps` lists other candidates it overlaps; `source_cut` is set for edited transcripts (original-recording times). */
export type Candidate = { id: string; type: string; confidence: "high" | "medium" | "low"; recommend: "cut" | "review" | "keep"; cut: { start: number; end: number }; words: number[]; removes: string; keeps: string; context: string; note: string; score?: number; overlaps?: string[]; source_cut?: { start: number; end: number } };
/** A sentence-like run of words. */
export type Segment = { first: number; last: number; start: number; end: number; text: string };
/** One entry of an approved-cuts file: a candidate id, or an explicit range. */
export type ApprovedItem = string | { start: unknown; end: unknown; reason?: string; note?: string };
/** An approved-cuts file: {"cuts":[...]}, {"approve":["c001"]}, or a bare list. */
export type ApprovedDoc = { cuts?: ApprovedItem[]; approve?: string[] } | ApprovedItem[];

type TWord = MWord & { i: number; tok: string };

/**
 * Find candidate cuts in timed words.
 * @param words  spoken words on one timeline, sorted
 */
export function findCutCandidates(words: MWord[], opts: { fillers?: boolean } = {}): { candidates: Candidate[]; segments: Segment[] } {
  const w: TWord[] = words.map((x, i) => ({ ...x, i, tok: token(x.text) }));
  const n = w.length;
  const candidates: Candidate[] = [];
  const ctx = (i: number, before: number = 6, after: number = 6): string => joinWords(w.slice(Math.max(0, i - before), Math.min(n, i + after)));
  const r3 = (t: number): number => Math.round(t * 1000) / 1000;
  /** Pause before word i: the original recording's pause when known (cut silences don't hide a retake). */
  const pauseBefore = (i: number): number => {
    if (i === 0) return 0;
    if (Number.isFinite(w[i].pauseBefore)) return w[i].pauseBefore as number;
    if (Number.isFinite(w[i].source_start) && Number.isFinite(w[i - 1].source_end)) return (w[i].source_start as number) - (w[i - 1].source_end as number);
    return w[i].start - w[i - 1].end;
  };
  const push = (c: Candidate): number => candidates.push(c);
  const taken = new Set<number>();

  // 1) Repeated phrases and words said twice in a row, longest first.
  for (let len = 6; len >= 1; len--) {
    for (let i = 0; i + 2 * len <= n; i++) {
      let same = true;
      for (let k = 0; k < len && same; k++) same = w[i + k].tok !== "" && w[i + k].tok === w[i + len + k].tok;
      if (!same) continue;
      const span = Array.from({ length: 2 * len }, (_, k) => i + k);
      if (span.some((k) => taken.has(k))) continue;
      const first = w.slice(i, i + len);
      const gap = w[i + len].start - w[i + len - 1].end;
      if (gap > (len === 1 ? 0.5 : 1.0)) continue;
      if (len === 1 && (NUMBER.test(w[i].tok) || FILLERS.has(w[i].tok))) continue;
      if (len === 1 && w[i].tok.length === 0) continue;
      // A comma after the first one ("never, never") reads as emphasis.
      const emphatic = /[,!]$/.test(first.at(-1)!.text) || (len === 1 && DOUBLES.has(w[i].tok));
      const rest = len === 1 && first[0].tok.length <= 1 && !/^[ai]$/.test(first[0].tok);
      if (rest) continue;
      push({
        id: "",
        type: len === 1 ? "stutter" : "repeat",
        confidence: emphatic ? "low" : "high",
        recommend: emphatic ? "review" : "cut",
        cut: { start: r3(w[i].start), end: r3(w[i + len].start) },
        words: first.map((x) => x.i),
        removes: joinWords(first),
        keeps: joinWords(w.slice(i + len, i + 2 * len)),
        context: ctx(i),
        note: emphatic ? `"${joinWords(first)}" twice; the punctuation suggests emphasis` : `"${joinWords(first)}" said twice in a row`,
      });
      for (const k of span.slice(0, len)) taken.add(k);
    }
  }

  // 2) Sentences: split on long pauses (from the original recording when known), sentence ends
  //    after a while, or very long runs (the kit's segmentation).
  const segments: Segment[] = [];
  let first = 0;
  for (let i = 1; i <= n; i++) {
    const prev = w[i - 1];
    const elapsed = prev.end - w[first].start;
    const end = i === n || pauseBefore(i) > 0.85 || (/[.!?]$/.test(prev.text) && elapsed >= 7.5) || elapsed >= 16;
    if (end) {
      segments.push({ first, last: i - 1, start: w[first].start, end: prev.end, text: joinWords(w.slice(first, i)) });
      first = i;
    }
  }

  // 3) Restarts: a sentence that begins with words the previous one trailed off on.
  const restartPairs = new Set<string>();
  for (let j = 1; j < segments.length; j++) {
    const b = segments[j];
    for (const i of [j - 1, j - 2]) {
      if (i < 0) continue;
      const a = segments[i];
      if (b.start - a.end > 30) continue;
      let best: { p: number; k: number } | null = null;
      for (let p = a.first; p <= a.last; p++) {
        let k = 0;
        while (p + k <= a.last && b.first + k <= b.last && w[p + k].tok && w[p + k].tok === w[b.first + k].tok) k++;
        const tailLeft = a.last - (p + k - 1);
        if (k >= 3 && tailLeft <= 2 && (!best || k > best.k)) best = { p, k };
      }
      if (!best) continue;
      const from = best.p;
      const to = b.first;
      restartPairs.add(`${i}:${j}`);
      push({
        id: "",
        type: "restart",
        confidence: best.k >= 4 ? "high" : "medium",
        recommend: best.k >= 4 ? "cut" : "review",
        cut: { start: r3(w[from].start), end: r3(w[to].start) },
        words: w.slice(from, to).map((x) => x.i),
        removes: joinWords(w.slice(from, to)),
        keeps: b.text,
        context: ctx(from, 4, to - from + 6),
        note: `the take restarts with the same ${best.k} words; the later take is kept`,
        score: best.k,
      });
      break;
    }
  }

  // 4) Retakes and false starts by word overlap (the kit's Jaccard rule on content words).
  const sig = (s: Segment): string[] => s.text.toLowerCase().replace(/[^\p{L}\p{N}\s$%]/gu, " ").split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)).slice(0, 18);
  const sigs = segments.map(sig);
  const jaccard = (a: string[], b: string[]): number => {
    const as = new Set(a);
    const bs = new Set(b);
    let overlap = 0;
    for (const x of as) if (bs.has(x)) overlap++;
    return overlap / Math.max(1, new Set([...as, ...bs]).size);
  };
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < Math.min(segments.length, i + 9); j++) {
      const a = segments[i];
      const b = segments[j];
      if (b.start - a.end > 75) break;
      if (restartPairs.has(`${i}:${j}`)) continue;
      const score = jaccard(sigs[i], sigs[j]);
      const sameOpening = sigs[i].slice(0, 4).filter((t, k) => t === sigs[j][k]).length >= 2;
      if (score >= 0.34 || (score >= 0.24 && sameOpening)) {
        const isFalseStart = sameOpening && a.end - a.start < 6 && b.start - a.end < 12;
        const from = attemptStart(w, a, b.first);
        push({
          id: "",
          type: isFalseStart ? "false_start" : "retake",
          confidence: score >= 0.45 ? "high" : score >= 0.34 ? "medium" : "low",
          recommend: score >= 0.34 ? "cut" : "review",
          score: Math.round(score * 1000) / 1000,
          cut: { start: r3(w[from].start), end: r3(b.start) },
          words: w.slice(from, b.first).map((x) => x.i),
          removes: joinWords(w.slice(from, b.first)),
          keeps: b.text,
          context: ctx(from),
          note: `sentence ${i + 1} ~ sentence ${j + 1} (overlap ${score.toFixed(2)}${sameOpening ? ", same opening" : ""})`,
        });
      }
    }
  }

  // 5) Fillers. Cutting one that runs straight into the next word clips the words around it,
  //    so those are proposed as "keep".
  if (opts.fillers !== false) {
    for (let i = 0; i < n; i++) {
      if (!FILLERS.has(w[i].tok)) continue;
      const before = i > 0 ? w[i].start - w[i - 1].end : 1;
      const after = i < n - 1 ? w[i + 1].start - w[i].end : 1;
      const clear = before >= 0.08 && after >= 0.08;
      const start = i > 0 ? w[i - 1].end + before / 2 : w[i].start;
      const end = i < n - 1 ? w[i].end + after / 2 : w[i].end;
      push({
        id: "",
        type: "filler",
        confidence: clear ? "medium" : "low",
        recommend: clear ? "cut" : "keep",
        cut: { start: r3(start), end: r3(end) },
        words: [i],
        removes: w[i].text,
        keeps: "",
        context: ctx(i),
        note: clear ? "filler with a pause on both sides; half of each pause stays" : "filler runs into the next word; cutting it would clip the words around it",
      });
    }
  }

  candidates.sort((a, b) => a.cut.start - b.cut.start || b.cut.end - a.cut.end);
  candidates.forEach((c, k) => (c.id = `c${String(k + 1).padStart(3, "0")}`));
  // Mark overlaps so the reviewer approves one of them, not both by accident.
  for (const c of candidates) {
    const o = candidates.filter((d) => d !== c && d.cut.start < c.cut.end && c.cut.start < d.cut.end).map((d) => d.id);
    if (o.length) c.overlaps = o;
  }
  return { candidates, segments };
}

/** Where, inside segment `a`, the clean take's first two words are first said; else a's start. */
function attemptStart(w: TWord[], a: Segment, takeFirst: number): number {
  const t0 = w[takeFirst]?.tok;
  const t1 = w[takeFirst + 1]?.tok;
  if (!t0 || !t1) return a.first;
  for (let k = a.first; k < a.last; k++) if (w[k].tok === t0 && w[k + 1].tok === t1) return k;
  return a.first;
}

/**
 * Turn approved candidate ids (or explicit ranges) into cut ranges.
 * @param doc  {"cuts":[{start,end,reason}]} or {"approve":["c001"]}
 */
export function approvedRanges(doc: ApprovedDoc | null | undefined, candidates: Candidate[] = []): { start: number; end: number; reason: string }[] {
  const out: { start: number; end: number; reason: string }[] = [];
  const list = Array.isArray(doc) ? doc : doc?.cuts ?? [];
  for (const c of list) {
    if (typeof c === "string") {
      const cand = candidates.find((x) => x.id === c);
      if (!cand) throw new Error(`No candidate ${c}`);
      out.push({ start: cand.cut.start, end: cand.cut.end, reason: `${cand.type}: ${cand.removes}` });
    } else out.push({ start: Number(c.start), end: Number(c.end), reason: c.reason ?? c.note ?? "approved cut" });
  }
  for (const id of (!Array.isArray(doc) && doc?.approve) || []) {
    const cand = candidates.find((x) => x.id === id);
    if (!cand) throw new Error(`No candidate ${id}`);
    out.push({ start: cand.cut.start, end: cand.cut.end, reason: `${cand.type}: ${cand.removes}` });
  }
  return out;
}
