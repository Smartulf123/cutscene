// Adapted from Herk Edit Kit scripts/validate-beat-sync.mjs, commit 10511e5af8 (MIT + Herk Edit Kit Use Permission), Copyright (c) 2026 Nate Herk and kit contributors. Modified for Cutscene.
//
// Graphics must land on the words they illustrate. For every sub-composition in index.html this
// resolves its absolute start, reads the anchor phrase it illustrates (data-anchor), finds that
// phrase in the edited transcript, and checks -0.2 s <= (word start - graphic start) <= 1.8 s.
// Changes for Cutscene: pure functions, Cutscene transcript shapes, and anchors may also be set on
// the index.html element itself.

export const LEAD_MIN = -0.2; // a graphic may arrive up to 0.2 s after its word (barely tolerable)
export const LEAD_MAX = 1.8; // and up to 1.8 s before it (more reads as disconnected)
export const LEAD_SUGGESTED = 0.5;

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];

/** Every sub-composition entry in index.html. */
export function parseIndex(html) {
  const re = /<(?:div|template|section)\b[^>]*\bdata-composition-src\s*=\s*["'][^"']+["'][^>]*>/gi;
  const beats = [];
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const id = attr(tag, "id");
    const src = attr(tag, "data-composition-src");
    const startExpr = attr(tag, "data-start");
    const duration = Number(attr(tag, "data-duration"));
    if (!id || startExpr == null || !Number.isFinite(duration) || duration <= 0) throw new Error(`Every sub-composition needs an id, data-start and a positive data-duration (at: ${tag.slice(0, 120)})`);
    if (beats.some((b) => b.id === id)) throw new Error(`Duplicate beat id: ${id}`);
    beats.push({ id, src, startExpr: startExpr.trim(), duration, anchor: attr(tag, "data-anchor") ?? null });
  }
  return beats;
}

/** Absolute starts: numbers, "bID" (starts when bID ends) or "bID + N" / "bID - N" (from bID's start). */
export function resolveStarts(beats) {
  const byId = new Map(beats.map((b) => [b.id, b]));
  const resolved = new Map();
  const one = (id, stack = new Set()) => {
    if (resolved.has(id)) return resolved.get(id);
    if (stack.has(id)) throw new Error(`Circular data-start reference at ${id}`);
    stack.add(id);
    const b = byId.get(id);
    if (!b) throw new Error(`Unknown beat id referenced: ${id}`);
    const expr = b.startExpr;
    let v;
    if (/^-?\d+(\.\d+)?$/.test(expr)) v = parseFloat(expr);
    else {
      const ref = expr.match(/^([a-z][a-z0-9_-]*?)\s*([+-]\s*\d+(?:\.\d+)?)?$/i);
      if (!ref) throw new Error(`Cannot parse data-start="${expr}" on ${id}`);
      const refStart = one(ref[1], stack);
      v = ref[2] == null ? refStart + byId.get(ref[1]).duration : refStart + parseFloat(ref[2].replace(/\s+/g, ""));
    }
    resolved.set(id, v);
    return v;
  };
  for (const b of beats) one(b.id);
  return resolved;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9/.\-]/g, " ").replace(/\s+/g, " ").trim();

/** The earliest word at or after minStart where the phrase begins. */
export function findAnchorStart(words, phrase, minStart) {
  if (!phrase) return null;
  const needle = norm(phrase);
  const n = needle.split(" ").filter(Boolean).length;
  if (!n) return null;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start < minStart) continue;
    const joined = norm(words.slice(i, i + n).map((w) => w.text).join(" "));
    if (joined.startsWith(needle)) return words[i].start;
    if (n === 1) {
      const w = norm(words[i].text).replace(/\s/g, "");
      if (needle && w.includes(needle.replace(/\s/g, ""))) return words[i].start;
    }
  }
  return null;
}

/** The anchor phrase inside a beat's HTML. */
export function anchorIn(html) {
  return html.match(/data-anchor\s*=\s*["']([^"']*)["']/)?.[1]?.trim() ?? null;
}

/**
 * Check every beat.
 * @param {{id: string, src: string, startExpr: string, duration: number, anchor: string|null}[]} beats
 * @param {{text: string, start: number}[]} words  edited-timeline words
 * @param {(src: string) => string|null} readBeat  returns the beat file's HTML, or null if missing
 */
export function checkBeatSync(beats, words, readBeat) {
  const starts = resolveStarts(beats);
  const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
  return beats.map((b) => {
    const start = starts.get(b.id);
    const row = { id: b.id, start: r2(start), duration: b.duration, src: b.src, anchor: b.anchor, wordStart: null, slack: null, status: "OK", detail: "" };
    if (!row.anchor) {
      const html = readBeat(b.src);
      if (html === null) return { ...row, status: "ERROR", detail: `missing file: ${b.src}` };
      row.anchor = anchorIn(html);
    }
    if (!row.anchor) return { ...row, status: "NO-ANCHOR", detail: "no data-anchor on the beat; add the spoken phrase it illustrates" };
    const ws = findAnchorStart(words, row.anchor, Math.max(0, start - 10));
    if (ws == null) return { ...row, status: "ANCHOR-MISS", detail: `"${row.anchor}" is not said within 10 s before the beat or after it` };
    const slack = ws - start;
    row.wordStart = r2(ws);
    row.slack = r2(slack);
    if (slack < LEAD_MIN) return { ...row, status: "LATE", detail: `arrives ${(LEAD_MIN - slack).toFixed(2)} s too late; set data-start="${Math.max(0, ws - LEAD_SUGGESTED).toFixed(2)}"` };
    if (slack > LEAD_MAX) return { ...row, status: "EARLY", detail: `leads its word by ${slack.toFixed(2)} s (max ${LEAD_MAX}); set data-start="${Math.max(0, ws - LEAD_SUGGESTED).toFixed(2)}"` };
    return row;
  });
}
