// Text logic for Cutscene voices: normalising words, aligning what Whisper heard with the
// script, turning that into a verdict and caption word timings, and checking voice
// descriptions. Pure functions (no I/O), so every rule here is unit-tested.
//
// The "hear it back" idea is learned from showtime (MIT, github.com/FavioVazquez/showtime);
// this is our own implementation.

// ---------------------------------------------------------------------------------------------
// Numbers to words (English)

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
const ORDINAL_FIX = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };

function under1000(n) {
  const out = [];
  if (n >= 100) {
    out.push(ONES[Math.floor(n / 100)], "hundred");
    n %= 100;
  }
  if (n >= 20) {
    out.push(TENS[Math.floor(n / 10)]);
    if (n % 10) out.push(ONES[n % 10]);
  } else if (n > 0 || out.length === 0) out.push(ONES[n]);
  return out;
}

/** 42 -> ["forty", "two"]. Whole numbers below 10^15; larger ones are read digit by digit. */
export function integerWords(n) {
  if (!Number.isSafeInteger(n) || n < 0) return String(n).split("").filter((c) => /\d/.test(c)).map((d) => ONES[+d]);
  if (n >= 1e15) return String(n).split("").map((d) => ONES[+d]);
  if (n === 0) return ["zero"];
  const out = [];
  for (const [value, name] of SCALES) {
    if (n >= value) {
      out.push(...under1000(Math.floor(n / value)), name);
      n %= value;
    }
  }
  if (n > 0) out.push(...under1000(n));
  return out;
}

/** "3.14" -> three point one four; "1,200" -> one thousand two hundred; "4th" -> fourth. */
export function numberWords(token) {
  const m = /^(\d[\d,]*)(?:\.(\d+))?$/.exec(token);
  if (m) {
    const words = integerWords(Number(m[1].replace(/,/g, "")));
    if (m[2]) words.push("point", ...m[2].split("").map((d) => ONES[+d]));
    return words;
  }
  const o = /^(\d+)(st|nd|rd|th)$/.exec(token);
  if (o) {
    const words = integerWords(Number(o[1]));
    const last = words.pop();
    words.push(ORDINAL_FIX[last] ?? (last.endsWith("y") ? last.slice(0, -1) + "ieth" : last + "th"));
    return words;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Normalisation

const SPELLING_PAIRS = new Map([
  ["ok", "okay"], ["alright", "all right"], ["percent", "percent"], ["per cent", "percent"],
]);

/** Harmless spelling differences: colour/color, organise/organize, centre/center, doubled letters. */
export function foldSpelling(w) {
  return w
    .replace(/our(s?)$/, "or$1")
    .replace(/is(e|ed|es|ing|ation)$/, "iz$1")
    .replace(/tre(s?)$/, "ter$1")
    .replace(/(.)\1+/g, "$1");
}

function stripMarks(s) {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "").normalize("NFC");
}

/**
 * Split text into display words and comparable tokens.
 * Each token is {t, src}: the normalised word and the index of the display word it came from.
 * @param {string} text
 * @param {string} [lang] ISO code; numbers become words only for English.
 */
export function tokenize(text, lang = "en") {
  const english = (lang || "en").toLowerCase().startsWith("en");
  const display = [];
  const tokens = [];
  const raw = String(text ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/[—–]|--/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const part of raw) {
    let w = part.normalize("NFKC").replace(/[‘’ʼ`]/g, "'");
    if (!/[\p{L}\p{N}&%$€£]/u.test(w)) continue; // pure punctuation
    const src = display.length;
    display.push(part);
    w = w.toLowerCase();
    // strip surrounding punctuation, keep currency and percent signs for the number rules
    w = w.replace(/^[^\p{L}\p{N}$€£&]+/u, "").replace(/[^\p{L}\p{N}%]+$/u, "");
    const pieces = [];
    const push = (...xs) => pieces.push(...xs);
    if (w === "&") push(english ? "and" : "&");
    else {
      for (let seg of w.split(/[-/]+/).filter(Boolean)) {
        let currency = null;
        const cur = /^([$€£])(.*)$/.exec(seg);
        if (cur) {
          currency = { $: "dollars", "€": "euros", "£": "pounds" }[cur[1]];
          seg = cur[2];
        }
        let percent = false;
        if (seg.endsWith("%")) {
          percent = true;
          seg = seg.slice(0, -1);
        }
        const num = english ? numberWords(seg) : null;
        const unit = english && !num ? /^(\d+)(\p{L}+)$/u.exec(seg) : null; // "3d", "4k": number then letters
        if (num) push(...num);
        else if (unit) push(...integerWords(Number(unit[1])), unit[2]);
        else if (/^\d[\d,.]*$/.test(seg)) push(seg.replace(/,/g, ""));
        else if (seg) push(seg);
        if (currency && english) push(currency);
        if (percent) push(english ? "percent" : "%");
      }
    }
    for (let p of pieces) {
      p = stripMarks(p).replace(/'/g, "").replace(/[^\p{L}\p{N}%&]/gu, "");
      if (!p) continue;
      const pair = SPELLING_PAIRS.get(p);
      if (pair) for (const x of pair.split(" ")) tokens.push({ t: x, src });
      else tokens.push({ t: p, src });
    }
  }
  return { display, tokens };
}

/** Lowercase words with punctuation removed, numbers as words: for quick comparisons. */
export function normalizeWords(text, lang = "en") {
  return tokenize(text, lang).tokens.map((x) => x.t);
}

const same = (a, b) => a === b || foldSpelling(a) === foldSpelling(b);

// ---------------------------------------------------------------------------------------------
// Alignment

/**
 * Align expected tokens with heard tokens (edit distance, plus free merges so that
 * "cut scene" and "cutscene" match). Returns ops in order:
 * {op: "ok"|"merge"|"sub"|"del"|"ins", e: [indices into expected], h: [indices into heard]}.
 * @param {string[]} exp
 * @param {string[]} heard
 */
export function align(exp, heard) {
  const n = exp.length;
  const m = heard.length;
  const INF = 1e9;
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  cost[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const c = cost[i][j];
      if (c === INF) continue;
      const relax = (ii, jj, add, op) => {
        if (ii > n || jj > m) return;
        if (c + add < cost[ii][jj]) {
          cost[ii][jj] = c + add;
          back[ii][jj] = { i, j, op };
        }
      };
      if (i < n && j < m) relax(i + 1, j + 1, same(exp[i], heard[j]) ? 0 : 1, same(exp[i], heard[j]) ? "ok" : "sub");
      if (i < n) relax(i + 1, j, 1, "del");
      if (j < m) relax(i, j + 1, 1, "ins");
      if (i + 1 < n && j < m && same(exp[i] + exp[i + 1], heard[j])) relax(i + 2, j + 1, 0, "merge");
      if (i < n && j + 1 < m && same(exp[i], heard[j] + heard[j + 1])) relax(i + 1, j + 2, 0, "merge");
    }
  }
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const b = back[i][j];
    const e = [];
    const h = [];
    for (let k = b.i; k < i; k++) e.push(k);
    for (let k = b.j; k < j; k++) h.push(k);
    ops.push({ op: b.op, e, h });
    i = b.i;
    j = b.j;
  }
  return ops.reverse();
}

/** Word error rate of heard against expected (0 = identical). */
export function wordErrorRate(exp, heard) {
  if (!exp.length) return heard.length ? 1 : 0;
  const errors = align(exp, heard).filter((o) => o.op === "sub" || o.op === "del" || o.op === "ins").length;
  return errors / exp.length;
}

// ---------------------------------------------------------------------------------------------
// Verdict

export const LOW_PROBABILITY = 0.45;

const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Compare a line's script with what Whisper heard.
 * @param {string} line the script text
 * @param {{w: string, start: number, end: number, p?: number}[]} heardWords from the transcriber
 * @param {{lang?: string, duration?: number, lowProbability?: number, otherLines?: {id: string, line: string}[]}} [opts]
 * @returns {{verified: boolean, issues: object[], warnings: object[], words: object[], heard: string, wer: number}}
 */
export function judgeLine(line, heardWords, opts = {}) {
  const lang = opts.lang || "en";
  const low = opts.lowProbability ?? LOW_PROBABILITY;
  const exp = tokenize(line, lang);
  const heardTokens = [];
  heardWords.forEach((hw, k) => {
    for (const t of tokenize(hw.w, lang).tokens) heardTokens.push({ t: t.t, k });
  });
  const ops = align(exp.tokens.map((x) => x.t), heardTokens.map((x) => x.t));

  const issues = [];
  const warnings = [];
  const timing = new Map(); // display index -> {start, end, p}
  const addTiming = (src, hk) => {
    const hw = heardWords[hk];
    const cur = timing.get(src);
    const p = hw.p ?? 1;
    if (!cur) timing.set(src, { start: hw.start, end: hw.end, p });
    else timing.set(src, { start: Math.min(cur.start, hw.start), end: Math.max(cur.end, hw.end), p: Math.min(cur.p, p) });
  };
  const expText = (es) => es.map((e) => exp.tokens[e].t).join(" ");
  const heardText = (hs) => hs.map((h) => heardTokens[h].t).join(" ");
  const displayOf = (es) => [...new Set(es.map((e) => exp.tokens[e].src))].map((s) => exp.display[s]).join(" ");
  const timeOf = (hs) => (hs.length ? round3(heardWords[heardTokens[hs[0]].k].start) : null);

  // group consecutive errors so "live here" -> "lift there" reads as one issue
  let pending = null;
  const flush = () => {
    if (!pending) return;
    const { e, h } = pending;
    const type = !h.length ? "missing" : !e.length ? "extra" : "wrong";
    const issue = { type, expected: expText(e), heard: heardText(h) };
    if (e.length) issue.script = displayOf(e);
    const at = timeOf(h);
    if (at !== null) issue.at = at;
    issues.push(issue);
    pending = null;
  };
  for (const o of ops) {
    if (o.op === "ok" || o.op === "merge") {
      flush();
      for (const e of o.e) for (const h of o.h) addTiming(exp.tokens[e].src, heardTokens[h].k);
    } else {
      pending = pending || { e: [], h: [] };
      pending.e.push(...o.e);
      pending.h.push(...o.h);
      // a wrong word still tells us roughly when the script word was said
      if (o.op === "sub") for (const e of o.e) for (const h of o.h) addTiming(exp.tokens[e].src, heardTokens[h].k);
    }
  }
  flush();

  // caption words: the script's spelling with the heard timing
  const words = [];
  for (let s = 0; s < exp.display.length; s++) {
    const t = timing.get(s);
    const w = exp.display[s];
    if (t) words.push({ w, start: round3(t.start), end: round3(t.end), p: round3(t.p) });
    else words.push({ w, start: null, end: null, p: 0, estimated: true });
  }
  // fill words that were never heard from their neighbours, so captions still flow
  for (let s = 0; s < words.length; s++) {
    if (words[s].start !== null) continue;
    let a = s - 1;
    while (a >= 0 && words[a].start === null) a--;
    let b = s + 1;
    while (b < words.length && words[b].start === null) b++;
    const from = a >= 0 ? words[a].end : 0;
    const to = b < words.length ? words[b].start : (opts.duration ?? from);
    const span = b - a - 1;
    const k = s - a;
    words[s].start = round3(from + ((to - from) * (k - 1)) / span);
    words[s].end = round3(from + ((to - from) * k) / span);
  }
  // keep times monotonic (merged or reused heard words can overlap slightly)
  for (let s = 1; s < words.length; s++) {
    if (words[s].start < words[s - 1].start) words[s].start = words[s - 1].start;
    if (words[s].end < words[s].start) words[s].end = words[s].start;
  }

  for (const w of words) {
    if (!w.estimated && w.p < low) warnings.push({ type: "unsure", word: w.w, p: w.p, at: w.start, message: `Whisper was unsure about "${w.w}" (${Math.round(w.p * 100)}%). Listen to it.` });
  }
  const spoken = words.filter((w) => !w.estimated);
  if (spoken.length >= 3) {
    const span = spoken[spoken.length - 1].end - spoken[0].start;
    const wps = span > 0 ? spoken.length / span : 0;
    if (wps > 4.6) warnings.push({ type: "fast", message: `Very fast: ${wps.toFixed(1)} words per second.` });
    if (wps > 0 && wps < 1.2) warnings.push({ type: "slow", message: `Very slow: ${wps.toFixed(1)} words per second (long pauses?).` });
  }
  if (opts.duration && spoken.length) {
    const lead = spoken[0].start;
    const tail = opts.duration - spoken[spoken.length - 1].end;
    if (lead > 1.0) warnings.push({ type: "lead_silence", message: `${lead.toFixed(1)} s of silence before the first word.` });
    if (tail > 1.5) warnings.push({ type: "tail_silence", message: `${tail.toFixed(1)} s after the last word (noise or silence).` });
  }

  const expTokens = exp.tokens.map((x) => x.t);
  const heardList = heardTokens.map((x) => x.t);
  const wer = round3(wordErrorRate(expTokens, heardList));
  const result = { verified: issues.length === 0 && expTokens.length > 0, issues, warnings, words, heard: heardWords.map((w) => w.w).join(" ").replace(/\s+([,.!?;:])/g, "$1").trim(), wer };
  if (!expTokens.length) issues.push({ type: "empty", expected: "", heard: result.heard, message: "The line has no words to check." });

  // the owner's real catch: lines that came out in the wrong order (a file holds another line)
  if (issues.length && Array.isArray(opts.otherLines)) {
    let best = null;
    for (const other of opts.otherLines) {
      const w2 = wordErrorRate(normalizeWords(other.line, lang), heardList);
      if (w2 < wer - 0.25 && (!best || w2 < best.wer)) best = { id: other.id, wer: w2 };
    }
    if (best) issues.push({ type: "other_line", id: best.id, message: `This file sounds like the line for ${best.id}. Lines may be in the wrong order.` });
  }
  return result;
}

/** One-line human summary for a judged line. */
export function describeIssue(issue) {
  switch (issue.type) {
    case "wrong":
      return `"${issue.script ?? issue.expected}" was heard as "${issue.heard}"${issue.at !== undefined ? ` at ${issue.at.toFixed(2)} s` : ""}`;
    case "missing":
      return `"${issue.script ?? issue.expected}" is missing`;
    case "extra":
      return `extra words "${issue.heard}"${issue.at !== undefined ? ` at ${issue.at.toFixed(2)} s` : ""} that aren't in the script`;
    default:
      return issue.message || issue.type;
  }
}

// ---------------------------------------------------------------------------------------------
// Voice descriptions

export const OMNIVOICE_TAGS = {
  gender: ["male", "female"],
  age: ["child", "teenager", "young adult", "middle-aged", "elderly"],
  pitch: ["very low pitch", "low pitch", "moderate pitch", "high pitch", "very high pitch"],
  style: ["whisper"],
  accent: ["american accent", "british accent", "australian accent", "chinese accent", "canadian accent", "indian accent", "korean accent", "portuguese accent", "russian accent", "japanese accent"],
};

const SYNONYMS = {
  woman: "female", girl: "female", lady: "female", feminine: "female",
  man: "male", boy: "male", guy: "male", masculine: "male",
  kid: "child", teen: "teenager", young: "young adult", "young woman": "female, young adult", "young man": "male, young adult",
  adult: "young adult", "middle aged": "middle-aged", old: "elderly", older: "elderly", senior: "elderly",
  deep: "low pitch", "deep voice": "low pitch", low: "low pitch", high: "high pitch", "high-pitched": "high pitch",
  whispering: "whisper", whispered: "whisper",
  american: "american accent", us: "american accent", "us accent": "american accent", "us english": "american accent",
  british: "british accent", uk: "british accent", english: "british accent", "english accent": "british accent", "uk accent": "british accent",
  australian: "australian accent", aussie: "australian accent", canadian: "canadian accent", indian: "indian accent",
  chinese: "chinese accent", korean: "korean accent", portuguese: "portuguese accent", russian: "russian accent", japanese: "japanese accent",
};

const ALL_TAGS = Object.values(OMNIVOICE_TAGS).flat();

function closest(word, options) {
  let best = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = editDistance(word, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return bestD <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

export function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * Turn a description into OmniVoice's voice-design tags.
 * "Female, young adult, American accent" -> "female, young adult, american accent".
 * @returns {{ok: boolean, instruct: string, tags: string[], unknown: {item: string, suggestion: string|null}[], conflicts: string[][]}}
 */
export function parseOmniVoiceDescription(describe) {
  const items = String(describe ?? "")
    .toLowerCase()
    .replace(/[，;]/g, ",")
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, " ").replace(/\s+voice$/, ""))
    .filter(Boolean);
  const tags = [];
  const unknown = [];
  for (const item of items) {
    const mapped = ALL_TAGS.includes(item) ? item : SYNONYMS[item];
    if (mapped) {
      for (const t of mapped.split(",").map((x) => x.trim())) if (!tags.includes(t)) tags.push(t);
    } else unknown.push({ item, suggestion: closest(item, [...ALL_TAGS, ...Object.keys(SYNONYMS)]) });
  }
  const conflicts = [];
  for (const [, opts] of Object.entries(OMNIVOICE_TAGS)) {
    const hits = tags.filter((t) => opts.includes(t));
    if (hits.length > 1) conflicts.push(hits);
  }
  return { ok: tags.length > 0 && unknown.length === 0 && conflicts.length === 0, instruct: tags.join(", "), tags, unknown, conflicts };
}

/** Pick a Kokoro preset that best fits a description (Kokoro has presets only, no design). */
export function pickKokoroVoice(describe = "", lang = "en") {
  const d = String(describe).toLowerCase();
  const male = /\b(male|man|boy|guy|masculine)\b/.test(d) && !/\bfemale\b/.test(d);
  const l = (lang || "en").toLowerCase();
  if (l.startsWith("es")) return "ef_dora";
  if (l.startsWith("fr")) return "ff_siwis";
  if (l.startsWith("ja")) return "jf_alpha";
  if (l.startsWith("zh")) return "zf_xiaobei";
  const british = /\b(british|uk|english accent|england)\b/.test(d) || l === "en-gb";
  if (british) return male ? "bm_george" : "bf_emma";
  return male ? "am_michael" : "af_heart";
}

/** Rough line length in seconds from its words (about 2.6 words per second). */
export function estimateSeconds(line, lang = "en") {
  const n = normalizeWords(line, lang).length;
  return Math.max(1, n / 2.6);
}
