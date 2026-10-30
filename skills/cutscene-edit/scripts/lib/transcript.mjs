// Transcripts for editing: one shape for every source, word boundaries tightened against the
// real audio, and a phrase-level reading view for the agent.
//
// The shape is the one Herk Edit Kit's tools read ({words:[{text,start,end,type}],
// audio_duration_secs}), plus Cutscene fields: `timeline` ("source" or "edited"), `source`
// (the media file), `edl` (the edit list that produced an edited transcript) and per-word
// `source_start`/`source_end` so edited and original times never mix.
// Cutscene (Apache-2.0).
import { EditError, ms } from "./cli.mjs";

/**
 * @typedef {{text: string, start: number, end: number, type?: string, source_start?: number, source_end?: number, speaker?: string, refined?: string, end_estimated?: boolean, clipped?: boolean}} Word
 * @typedef {{version?: number, kind?: string, timeline?: "source"|"edited", source?: string|null, edl?: string|null, language_code?: string, audio_duration_secs?: number, source_audio_duration_secs?: number, produced_by?: string, words: Word[], [k: string]: any}} Transcript
 */

/**
 * Accepts the engine's transcript (an array of {text,start,end}), the kit shape
 * ({words:[...]}), Whisper-style {segments:[{words:[...]}]} or {word,start,end} items.
 * @param {any} raw
 * @returns {Transcript}
 */
export function normalizeTranscript(raw) {
  let list;
  let meta = {};
  if (Array.isArray(raw)) list = raw;
  else if (raw && Array.isArray(raw.words)) {
    list = raw.words;
    meta = raw;
  } else if (raw && Array.isArray(raw.segments)) {
    list = raw.segments.flatMap((s) => (Array.isArray(s.words) ? s.words : []));
    meta = raw;
  } else throw new EditError("BAD_TRANSCRIPT", "The transcript has no words.", "Make one with `cutscene edit transcribe <video>`; it needs word-level timings.");
  const words = list
    .map((w) => {
      const text = String(w.text ?? w.word ?? w.punctuated_word ?? "").trim();
      const out = { text, start: Number(w.start), end: Number(w.end), type: w.type ?? "word" };
      for (const k of ["source_start", "source_end", "speaker", "speaker_id", "refined", "end_estimated", "clipped"]) if (w[k] !== undefined) out[k] = w[k];
      return out;
    })
    .filter((w) => w.text || w.type !== "word");
  const { words: _w, segments: _s, ...rest } = meta;
  return { ...rest, words };
}

/** Real spoken words with numeric timing (the kit's filter: spacing and audio events go). */
export function spokenWords(t) {
  return t.words.filter((w) => (w.type ? w.type === "word" : true)).filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
}

/** Rough length of a word as spoken, from its letters (seconds). */
export function expectedWordSeconds(text) {
  const letters = String(text).replace(/[^\p{L}\p{N}]/gu, "").length;
  return Math.min(1.2, 0.08 + 0.065 * Math.max(1, letters));
}

/**
 * Tighten word boundaries against measured silence. Speech recognisers often stretch a word over
 * the pause after it (or start it early), which hides pauses from a transcript-based cutter.
 * @param {Word[]} words  sorted by start
 * @param {{start: number, end: number}[]} silences
 * @param {{minWord?: number}} [o]
 * @returns {{words: Word[], changed: number}}
 */
export function refineWithSilences(words, silences, o = {}) {
  const minWord = o.minWord ?? 0.05;
  const eps = 0.01;
  const sil = [...silences].sort((a, b) => a.start - b.start);
  let changed = 0;
  const out = words.map((w0) => {
    const w = { ...w0 };
    if (w.type && w.type !== "word") return w;
    for (const s of sil) {
      if (s.end <= w.start + eps) continue;
      if (s.start >= w.end - eps) break;
      const coversStart = s.start <= w.start + eps;
      const coversEnd = s.end >= w.end - eps;
      if (coversStart && coversEnd) {
        w.in_silence = true;
        continue;
      }
      if (!coversStart && coversEnd) {
        const end = Math.max(w.start + minWord, s.start);
        if (end < w.end - eps) {
          w.end = end;
          w.refined = "end";
          changed++;
        }
      } else if (coversStart && !coversEnd) {
        const start = Math.min(w.end - minWord, s.end);
        if (start > w.start + eps) {
          w.start = start;
          w.refined = w.refined ? "both" : "start";
          changed++;
        }
      } else if (s.end - s.start >= 0.25) {
        // A pause inside the word's span: the word sits on one side of it.
        if (s.start - w.start >= expectedWordSeconds(w.text) * 0.6) {
          w.end = s.start;
          w.refined = w.refined ? "both" : "end";
        } else {
          w.start = s.end;
          w.refined = w.refined ? "both" : "start";
        }
        changed++;
      }
    }
    w.start = ms(w.start);
    w.end = ms(w.end);
    return w;
  });
  // A word placed wholly inside a silence that ends just before the next word was really said
  // after the silence, together with that next word: share the next word's span between them.
  for (let i = 0; i < out.length - 1; i++) {
    const w = out[i];
    const next = out[i + 1];
    if (!w.in_silence) continue;
    const s = sil.find((x) => x.start <= w.start + eps && x.end >= w.end - eps);
    if (!s || s.end - w.end > 0.6 || next.start > s.end + 0.05) continue;
    const from = Math.max(s.end, w.start);
    const span = next.end - from;
    if (span < 3 * minWord) continue;
    const share = expectedWordSeconds(w.text) / (expectedWordSeconds(w.text) + expectedWordSeconds(next.text));
    w.start = ms(from);
    w.end = ms(from + span * share);
    next.start = w.end;
    w.refined = "moved";
    delete w.in_silence;
    changed++;
  }
  return { words: out, changed };
}

/**
 * Where no silence could be measured (speech over music), a word far longer than its letters
 * allow has probably swallowed the pause after it. Shorten it and mark the end as estimated.
 * @param {Word[]} words
 * @param {{factor?: number, minSeconds?: number}} [o]
 * @returns {{words: Word[], changed: number}}
 */
export function capStretchedWords(words, o = {}) {
  const factor = o.factor ?? 2.2;
  const minSeconds = o.minSeconds ?? 0.6;
  let changed = 0;
  const out = words.map((w0, i) => {
    const w = { ...w0 };
    if ((w.type && w.type !== "word") || w.refined) return w;
    const exp = expectedWordSeconds(w.text);
    const dur = w.end - w.start;
    if (dur > Math.max(minSeconds, factor * exp)) {
      w.end = ms(w.start + exp * 1.4);
      w.end_estimated = true;
      changed++;
    }
    return w;
  });
  return { words: out, changed };
}

/**
 * A transcript in Cutscene's editing shape.
 * @param {Word[]} words
 * @param {Partial<Transcript>} meta
 * @returns {Transcript}
 */
export function makeTranscript(words, meta) {
  return {
    version: 1,
    kind: "cutscene-transcript",
    timeline: meta.timeline ?? "source",
    source: meta.source ?? null,
    edl: meta.edl ?? null,
    language_code: meta.language_code ?? undefined,
    audio_duration_secs: meta.audio_duration_secs,
    source_audio_duration_secs: meta.source_audio_duration_secs ?? meta.audio_duration_secs,
    produced_by: meta.produced_by ?? "cutscene-edit",
    ...(meta.engine ? { engine: meta.engine } : {}),
    ...(meta.fingerprint ? { fingerprint: meta.fingerprint } : {}),
    ...(meta.refinement ? { refinement: meta.refinement } : {}),
    words: words.map((w) => ({ type: "word", ...w })),
  };
}

/**
 * Phrase-level reading view (the "packed transcript" idea from video-use): one line per phrase,
 * broken at pauses of `gap` seconds or more, each with its time range. Agents read this
 * instead of watching frames.
 * @param {Word[]} words
 * @param {{gap?: number}} [o]
 */
export function packPhrases(words, o = {}) {
  const gap = o.gap ?? 0.5;
  const phrases = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    phrases.push({ start: cur[0].start, end: cur.at(-1).end, text: joinWords(cur), words: cur.length });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    if (cur.length && words[i].start - cur.at(-1).end >= gap) flush();
    cur.push(words[i]);
  }
  flush();
  return phrases;
}

/** Words to readable text, punctuation tucked in. */
export function joinWords(ws) {
  return ws.map((w) => w.text).join(" ").replace(/\s+([,.!?;:])/g, "$1");
}

/** The packed view as text lines: "[002.52-005.36] Ninety percent of ..." */
export function packedText(words, o = {}) {
  const pad = (n) => n.toFixed(2).padStart(6, "0");
  return packPhrases(words, o).map((p) => `[${pad(p.start)}-${pad(p.end)}] ${p.text}`).join("\n");
}
