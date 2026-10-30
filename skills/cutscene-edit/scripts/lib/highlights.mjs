// Ported from Cutscene 1 src/lib/project/highlights.ts (Apache-2.0); plain ESM JS for Cutscene 2.
//
// Highlight candidates for shorts: stretches of 20–60 s that start and end on sentence boundaries,
// scored on what makes a short work (a reason to keep watching in the first seconds, one complete
// thought, a payoff). Scores only rank candidates; the agent reads the text and chooses.

/**
 * @typedef {{text: string, start: number, end: number}} HWord
 * @typedef {{id: string, start: number, end: number, text: string, opening: string, score: number, reasons: string[]}} Highlight
 */

/** Sentences from timed words: split on end punctuation or a pause over 0.9 s. */
export function sentences(words) {
  const out = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next || /[.!?]["')]?$/.test(w.text) || next.start - w.end > 0.9) {
      out.push({ start: cur[0].start, end: w.end, text: cur.map((x) => x.text).join(" ") });
      cur = [];
    }
  });
  return out;
}

const HOOK = /^(why|how|what|the (secret|truth|problem|reason|mistake)|here'?s|stop|never|nobody|most people|if you|imagine|the (one|biggest|best|worst))\b/i;
const STRONG = /\b(never|always|everyone|nobody|secret|mistake|biggest|best|worst|surprising|actually|truth|wrong|crazy|incredible|first|only)\b/i;
const FILLER = /^(so|um|uh|and|but|like|okay|ok|yeah|well|you know)\b[,]?/i;

function scoreWindow(s, words, target) {
  const start = s[0].start;
  const end = s.at(-1).end;
  const length = end - start;
  const spoken = words.filter((w) => w.start >= start && w.end <= end).reduce((t, w) => t + (w.end - w.start), 0);
  const density = spoken / Math.max(0.001, length);
  const opening = s[0].text;
  const reasons = [];
  let score = density * 3; // mostly talking, few long pauses
  if (HOOK.test(opening) || /\?$/.test(opening)) {
    score += 2;
    reasons.push("opens with a question or hook");
  }
  if (/\d/.test(opening)) {
    score += 1;
    reasons.push("a number in the first line");
  }
  if (STRONG.test(s.slice(0, 2).map((x) => x.text).join(" "))) {
    score += 0.8;
    reasons.push("a strong claim early");
  }
  if (FILLER.test(opening)) {
    score -= 1.2;
    reasons.push("starts on a filler word");
  }
  if (/[.!]["')]?$/.test(s.at(-1).text)) {
    score += 0.6;
    reasons.push("ends on a finished thought");
  }
  score -= Math.abs(length - target) / 25;
  return { score: Math.round(score * 100) / 100, reasons };
}

/**
 * The best non-overlapping candidates, highest score first.
 * @param {HWord[]} words
 * @param {{minSeconds?: number, maxSeconds?: number, count?: number, target?: number}} [opts]
 * @returns {Highlight[]}
 */
export function findHighlights(words, opts = {}) {
  const min = opts.minSeconds ?? 20;
  const max = opts.maxSeconds ?? 60;
  const target = opts.target ?? Math.min(max, Math.max(min, 38)); // shorts land best around 30–45 s
  const sents = sentences(words);
  const all = [];
  for (let i = 0; i < sents.length; i++) {
    for (let j = i; j < sents.length; j++) {
      const length = sents[j].end - sents[i].start;
      if (length > max) break;
      if (length < min) continue;
      const window = sents.slice(i, j + 1);
      const { score, reasons } = scoreWindow(window, words, target);
      all.push({ id: "", start: sents[i].start, end: sents[j].end, text: window.map((x) => x.text).join(" "), opening: sents[i].text, score, reasons });
    }
  }
  all.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const h of all) {
    if (picked.length >= (opts.count ?? 8)) break;
    if (picked.some((p) => h.start < p.end && p.start < h.end)) continue;
    picked.push({ ...h, id: `h${picked.length + 1}` });
  }
  return picked;
}
