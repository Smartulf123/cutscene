#!/usr/bin/env node
// beats-captions.mjs: a word-highlight caption rail for narrated motion graphics (no footage),
// made from the voice word timings in .cutscene/beats.json. Written for Cutscene (Apache-2.0).
// Node built-ins only.
//
//   node beats-captions.mjs <project> [--text auto|line] [--max-words 7] [--id captions]
//        [--track 9] [--position bottom|top] [--font body|display] [--out compositions/<id>.html]
//        [--force] [--dry-run] [--json]
//
// What it reads (all inside the project):
//   .cutscene/beats.json  beats[].voice.words (times relative to the voice file), .line, .heard,
//                         and an optional .display: the caption text as it should read
//   .cutscene/look.json   colours and the body (or display) font, when there is one
//   index.html            where each voice file starts (<audio src="assets/voice/b1.wav"
//                         data-start="0.35">); without one, a line starts at its beat's start
//
// Spoken text and caption text differ: a voice says "A I" and "three D", the caption shows "AI"
// and "3D". Each beat's caption text is, in order: voice.display, then voice.heard (what the
// check heard), each used only when it lines up word by word with the spoken words; otherwise the
// spoken words, with spelled-out letters joined ("A I" -> "AI") and "<number> D" written as "3D".
//
// It writes compositions/<id>.html (a sub-composition) and prints the host clip to paste into
// index.html. Exit codes: 0 done, 1 failed, 2 wrong usage.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isNetworkPath } from "../../cutscene/scripts/lib/paths.mjs";

export const MARKER = "Written by cutscene-captions/scripts/beats-captions.mjs";

/** A spoken word from beats.json voice.words: seconds relative to the voice file. */
export interface SpokenWord {
  w: string;
  start: number;
  end: number;
}

/** A caption word with its time. */
export interface CaptionToken {
  text: string;
  start: number;
  end: number;
}

/** One caption line: shown at `show`, hidden at `hide` (seconds on the video timeline). */
export interface CaptionLine {
  beat?: string;
  beatEnd?: number;
  show: number;
  hide: number;
  words: CaptionToken[];
}

/** The parts of .cutscene/beats.json this reads. */
export interface BeatSheet {
  version?: number;
  fps?: number;
  width?: number;
  height?: number;
  duration?: number;
  beats?: Beat[];
}

export interface Beat {
  id: string;
  start?: number;
  end?: number;
  label?: string;
  voice?: {
    file?: string;
    line?: string;
    heard?: string;
    display?: string;
    words?: SpokenWord[];
  };
}

/** The parts of .cutscene/look.json the caption rail uses. */
export interface CaptionLook {
  palette?: { bg?: unknown; fg?: unknown; accent?: unknown; accent2?: unknown };
  type?: { display?: CaptionFont; body?: CaptionFont };
}

export interface CaptionFont {
  family?: string;
  weight?: number;
}

export interface CaptionResult {
  lines: CaptionLine[];
  duration: number;
  placements: { beat: string; at: number; from: string }[];
  sources: { beat: string; source: string }[];
  warnings: string[];
}

// ---------------------------------------------------------------------------------------------
// Matching caption text to spoken words

const NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const SYMBOLS: Record<string, string> = { "&": " and ", "%": " percent ", "+": " plus ", "@": " at " };

/** A comparison key: lower case, letters and digits only, number words as digits ("three D" -> "3d"). */
export function spokenKey(text: unknown): string {
  let t = String(text ?? "").toLowerCase().replace(/[’']/g, "");
  for (const [sym, word] of Object.entries(SYMBOLS)) t = t.split(sym).join(word);
  return t
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((x) => (x in NUMBERS ? String(NUMBERS[x]) : x))
    .join("");
}

/**
 * Line up caption tokens with spoken words. Each caption token takes one or more spoken words
 * ("AI" takes "A", "I"). Returns [{text, start, end}] or null when they don't line up.
 */
export function alignDisplay(displayText: unknown, words: SpokenWord[]): CaptionToken[] | null {
  const tokens = String(displayText ?? "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !words.length) return null;
  const out: CaptionToken[] = [];
  let j = 0;
  for (const tok of tokens) {
    const k = spokenKey(tok);
    if (!k) {
      // a dash or other mark with nothing spoken: keep it with the previous word
      if (out.length) out[out.length - 1].text += ` ${tok}`;
      continue;
    }
    const j0 = j;
    let acc = "";
    while (j < words.length && acc.length < k.length) acc += spokenKey(words[j++].w);
    if (acc !== k || j === j0) return null;
    out.push({ text: tok, start: words[j0].start, end: words[j - 1].end });
  }
  while (j < words.length && !spokenKey(words[j].w)) j++;
  return j === words.length ? out : null;
}

/** Spoken words as captions: "A I" -> "AI", "three D," -> "3D,". */
export function tidySpoken(words: SpokenWord[]): CaptionToken[] {
  const out: CaptionToken[] = [];
  // s flag: a word with a line break in it still splits (without it, exec gives null)
  const split = (w: unknown): string[] => /^(.*?)([.,;:!?…"”)\]]*)$/s.exec(String(w))!.slice(1);
  for (let i = 0; i < words.length; i++) {
    const [core, punct] = split(words[i].w);
    const next = words[i + 1] && split(words[i + 1].w);
    // a number word then the letter D: "three D" -> "3D"
    if (next && spokenKey(core) in NUMBERS_BY_DIGIT && /^[dD]$/.test(next[0]) && !punct) {
      out.push({ text: `${spokenKey(core)}D${next[1]}`, start: words[i].start, end: words[i + 1].end });
      i++;
      continue;
    }
    // two or more single capital letters in a row: "A I" -> "AI"
    if (/^[A-Z]$/.test(core) && !punct) {
      let k = i + 1;
      let letters = core;
      let tail = "";
      while (k < words.length) {
        const [c, p] = split(words[k].w);
        if (!/^[A-Z]$/.test(c)) break;
        letters += c;
        tail = p;
        k++;
        if (p) break;
      }
      if (letters.length >= 2) {
        out.push({ text: letters + tail, start: words[i].start, end: words[k - 1].end });
        i = k - 1;
        continue;
      }
    }
    out.push({ text: String(words[i].w), start: words[i].start, end: words[i].end });
  }
  return out;
}
const NUMBERS_BY_DIGIT = Object.fromEntries(Object.values(NUMBERS).map((n) => [String(n), true]));

/** Break one beat's caption words into lines of at most maxWords, preferring punctuation. */
export function splitLines(tokens: CaptionToken[], maxWords = 7): CaptionToken[][] {
  const lines: CaptionToken[][] = [];
  let cur: CaptionToken[] = [];
  const flush = () => {
    if (cur.length) lines.push(cur);
    cur = [];
  };
  for (const t of tokens) {
    cur.push(t);
    const endsSentence = /[.!?…]["”)]*$/.test(t.text);
    if (endsSentence && cur.length >= 2) flush();
    else if (cur.length >= maxWords) {
      // break after the line's last comma (keeping at least two words before it), if there is one
      let cut = -1;
      for (let i = cur.length - 2; i >= 1; i--) if (/[,;:—]$/.test(cur[i].text)) { cut = i; break; }
      if (cut >= 0) {
        const rest = cur.slice(cut + 1);
        cur = cur.slice(0, cut + 1);
        flush();
        cur = rest;
      } else flush();
    }
  }
  flush();
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Placement and timing

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const normPath = (p: unknown): string => String(p ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");

/** Where each voice file starts in index.html: {"assets/voice/b1.wav": 0.35}. */
export function audioStarts(html: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of String(html ?? "").matchAll(/<audio\b[^>]*>/gi)) {
    const attr = (name: string): RegExpExecArray | null => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(m[0]);
    const src = attr("src");
    const start = attr("data-start");
    if (!src || !start) continue;
    const at = Number(start[2] ?? start[3]);
    if (Number.isFinite(at)) out[normPath(src[2] ?? src[3])] = at;
  }
  return out;
}

/**
 * Build caption lines from a beat sheet. Pure.
 */
export function buildCaptions(sheet: BeatSheet | null | undefined, { html = "", text = "auto", maxWords = 7 }: { html?: string; text?: string; maxWords?: number } = {}): CaptionResult {
  const starts = audioStarts(html);
  const warnings: string[] = [];
  const placements: CaptionResult["placements"] = [];
  const sources: CaptionResult["sources"] = [];
  const lines: CaptionLine[] = [];
  const beats = Array.isArray(sheet?.beats) ? sheet.beats : [];
  for (const b of beats) {
    const v = b?.voice;
    if (!v) continue;
    const words = Array.isArray(v.words) ? v.words.filter((w) => w && typeof w.w === "string" && Number.isFinite(w.start) && Number.isFinite(w.end)) : [];
    if (!words.length) {
      warnings.push(`Beat ${b.id} has a voice line but no word timings; check the line with cutscene-voice (verify writes voice.words), then run this again.`);
      continue;
    }
    const file = normPath(v.file);
    const at = file && file in starts ? starts[file] : Number(b.start) || 0;
    placements.push({ beat: b.id, at, from: file && file in starts ? "index.html" : "beat.start" });
    let tokens: CaptionToken[] | null = null;
    let source = "spoken";
    if (text !== "line") {
      for (const [name, value] of [["display", v.display], ["heard", v.heard]] as const) {
        if (typeof value !== "string" || !value.trim()) continue;
        tokens = alignDisplay(value, words);
        if (tokens) {
          source = name;
          break;
        }
        if (name === "display") warnings.push(`Beat ${b.id}: voice.display doesn't line up with the spoken words, so the caption uses the spoken words. Make each caption word match what is said ("AI" for "A I", "3D" for "three D").`);
      }
    }
    tokens ??= tidySpoken(words);
    sources.push({ beat: b.id, source });
    for (const group of splitLines(tokens, maxWords)) {
      // show and hide are set just below, once every line is known
      lines.push({ beat: b.id, beatEnd: Number(b.end), words: group.map((t) => ({ text: t.text, start: round3(at + t.start), end: round3(at + t.end) })) } as CaptionLine);
    }
  }
  // Show each line a moment before its first word; hide it after its last word, before the next.
  lines.forEach((line, i) => {
    const first = line.words[0].start;
    const last = line.words[line.words.length - 1].end;
    const prevHide = i > 0 ? lines[i - 1].hide : 0;
    line.show = round3(Math.max(0, prevHide, first - 0.12));
    const nextFirst = i + 1 < lines.length ? lines[i + 1].words[0].start : Infinity;
    line.hide = round3(Math.max(last, Math.min(last + 0.45, nextFirst - 0.14)));
    delete line.beatEnd;
  });
  const lastBeatEnd = Math.max(0, ...beats.map((b) => Number(b?.end) || 0));
  const duration = round3(Number(sheet?.duration) || Math.max(lastBeatEnd, ...lines.map((l) => l.hide + 0.3)));
  return { lines, duration, placements, sources, warnings };
}

// ---------------------------------------------------------------------------------------------
// The sub-composition

// Colour helpers for the dimmed (not yet said) words: as faint as possible while still readable.
const rgbOf = (hex: unknown): number[] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
};
const lum = (rgb: number[]): number => {
  const l = rgb.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a: number[], b: number[]): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** fg mixed toward bg as far as it can go while keeping `min`:1 contrast on bg. */
export function dimColor(fgHex: string, bgHex: string, min = 3.2): string {
  const fg = rgbOf(fgHex);
  const bg = rgbOf(bgHex);
  if (!fg || !bg) return fgHex;
  for (let t = 0.6; t > 0; t -= 0.02) {
    const mix = fg.map((v, i) => Math.round(v + (bg[i] - v) * t));
    if (ratio(mix, bg) >= min) return "#" + mix.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  return fgHex;
}

/** The accent, moved toward fg until it reads as text (`min`:1 on bg); a look only promises 3:1. */
export function readableAccent(accentHex: string, fgHex: string, bgHex: string, min = 4.5): string {
  const a = rgbOf(accentHex);
  const fg = rgbOf(fgHex);
  const bg = rgbOf(bgHex);
  if (!a || !fg || !bg) return accentHex;
  for (let t = 0; t <= 1.001; t += 0.05) {
    const mix = a.map((v, i) => Math.round(v + (fg[i] - v) * t));
    if (ratio(mix, bg) >= min) return "#" + mix.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  return fgHex;
}

const esc = (s: unknown): string => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// look.json is project data: only plain hex colours and font names reach the CSS and script.
const cssFamily = (f: unknown): string => `"${String(f).replace(/[^A-Za-z0-9 -]/g, "").trim()}"`;
const hexOr = (v: unknown, fallback: string): string => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
/** JSON for an inline <script>: `<` escaped so a value can never close the tag. */
const scriptJson = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c");

/** The caption rail as a templated sub-composition. Pure and deterministic. */
export interface CaptionsHtmlOptions {
  id?: string;
  lines: CaptionLine[];
  duration: number;
  width?: number;
  height?: number;
  look?: CaptionLook | null;
  position?: string;
  font?: string;
}

export function captionsHtml({ id = "captions", lines, duration, width = 1920, height = 1080, look = null, position = "bottom", font = "body" }: CaptionsHtmlOptions): string {
  const pal: NonNullable<CaptionLook["palette"]> = look?.palette || {};
  const fg = hexOr(pal.fg, "#F4F3EE");
  const bg = hexOr(pal.bg, "#0B0D12");
  const accent = readableAccent(hexOr(pal.accent, fg), fg, bg);
  const dim = dimColor(fg, bg);
  const t: CaptionFont = (font === "display" ? look?.type?.display : look?.type?.body) || {};
  const family = t.family && cssFamily(t.family) !== '""' ? `${cssFamily(t.family)}, ` : "";
  const weight = Number.isInteger(t.weight) ? Math.max(t.weight as number, 500) : 600;
  const short = Math.min(width, height);
  const size = Math.max(44, Math.round(short * 0.046));
  const edge = Math.round(height * (position === "top" ? 0.08 : 0.075));
  const data = lines.map((l) => ({ show: l.show, hide: l.hide, words: l.words.map((w) => [w.start, w.end]) }));
  const rows = lines
    .map((l, i) => `        <div class="cs-line" id="${id}-l${i}">${l.words.map((w, k) => `<span class="cs-w" id="${id}-l${i}-w${k}">${esc(w.text)}</span>`).join(" ")}</div>`)
    .join("\n");
  return `<!doctype html>
<!--
  Cutscene captions: a word-highlight rail for narrated video, from the voice word timings in
  .cutscene/beats.json. ${MARKER}; run it again after a voice line changes.
-->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${esc(id)}</title>
  </head>
  <body>
    <template>
      <style>
        #root {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          font-family: ${family}var(--font-body, sans-serif), sans-serif;
          font-weight: ${weight};
        }
        #root .cs-line {
          position: absolute;
          left: 8%;
          right: 8%;
          ${position === "top" ? "top" : "bottom"}: ${edge}px;
          text-align: center;
          font-size: ${size}px;
          line-height: 1.25;
          color: ${fg};
          opacity: 0;
          text-shadow: 0 2px 14px ${bg}cc, 0 0 2px ${bg};
        }
        #root .cs-w { color: ${dim}; }
      </style>
      <div id="root" data-composition-id="${esc(id)}" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}">
${rows}
      </div>
      <script>
        (function () {
          // Times are seconds on the video timeline (beats.json voice.words placed where each voice file starts).
          var LINES = ${scriptJson(data)};
          var ID = ${scriptJson(id)};
          var FG = ${scriptJson(fg)};
          var ACCENT = ${scriptJson(accent)};
          var DIM = ${scriptJson(dim)};
          if (typeof gsap === "undefined") {
            console.error("[cutscene-captions] GSAP is missing: load it in index.html.");
            return;
          }
          var tl = gsap.timeline({ paused: true });
          LINES.forEach(function (line, i) {
            var row = document.getElementById(ID + "-l" + i);
            tl.fromTo(row, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }, line.show);
            tl.to(row, { opacity: 0, duration: 0.16, ease: "power2.in" }, line.hide);
            line.words.forEach(function (w, k) {
              var el = document.getElementById(ID + "-l" + i + "-w" + k);
              // the word lights up in the accent while it is said, then stays at full strength
              tl.fromTo(el, { color: DIM }, { color: ACCENT, duration: 0.04, ease: "none", immediateRender: false }, w[0]);
              tl.to(el, { color: FG, duration: 0.04, ease: "none" }, Math.max(w[1], w[0] + 0.04));
            });
          });
          tl.set({}, {}, ${duration});
          window.__timelines = window.__timelines || {};
          window.__timelines[ID] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;
}

export function hostSnippet({ id = "captions", duration, width, height, track = 9 }: { id?: string; duration: number; width: number; height: number; track?: number }): string {
  return `<div id="${id}-clip" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-track-kind="captions" data-start="0" data-duration="${duration}" data-track-index="${track}" data-width="${width}" data-height="${height}"></div>`;
}

// ---------------------------------------------------------------------------------------------
// CLI

interface CliArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

function parse(argv: string[]): CliArgs {
  const args: CliArgs = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (["json", "force", "dry-run"].includes(key)) args[key] = true;
      else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) args[key] = true;
      else args[key] = argv[++i];
    } else args._.push(a);
  }
  return args;
}

const USAGE = "usage: node beats-captions.mjs <project> [--text auto|line] [--max-words 7] [--id captions] [--track 9] [--position bottom|top] [--font body|display] [--out compositions/<id>.html] [--force] [--dry-run] [--json]";

/** Where the CLI writes (tests pass their own). */
export interface CliIo {
  out: (s: string) => void;
  err: (s: string) => void;
}

export function runCli(argv: string[], io: CliIo = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }): number {
  const args = parse(argv);
  const json = !!args.json;
  const fail = (code: string, message: string, hint: string, exit = 1): number => {
    if (json) io.out(JSON.stringify({ ok: false, error: { code, message, hint } }) + "\n");
    else io.err(`${message}\n${hint}\n`);
    return exit;
  };
  const project = resolve(args._[0] ?? ".");
  if (isNetworkPath(String(args._[0] ?? ""))) return fail("NETWORK_PATH", "Cutscene doesn't work on network folders.", "Copy the project to this computer first.", 2);
  const id = typeof args.id === "string" ? args.id : "captions";
  if (!/^[a-z][a-z0-9-]*$/.test(id)) return fail("USAGE", `--id must be a short name in lower case, like captions (got "${id}").`, USAGE, 2);
  const maxWords = args["max-words"] === undefined ? 7 : Number(args["max-words"]);
  if (!Number.isInteger(maxWords) || maxWords < 2 || maxWords > 14) return fail("USAGE", "--max-words must be a whole number from 2 to 14.", USAGE, 2);
  const text = args.text === undefined ? "auto" : String(args.text);
  if (!["auto", "line"].includes(text)) return fail("USAGE", "--text must be auto or line.", USAGE, 2);
  const beatsFile = join(project, ".cutscene", "beats.json");
  if (!existsSync(beatsFile)) return fail("BEATS_NOT_FOUND", `There's no beat sheet at ${beatsFile}.`, "Make the storyboard and the voice lines first.");
  let sheet: BeatSheet;
  try {
    sheet = JSON.parse(readFileSync(beatsFile, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    return fail("BEATS_INVALID_JSON", `The beat sheet isn't valid JSON (${(e as Error).message}).`, "Fix the JSON, then run this again.");
  }
  let look: CaptionLook | null = null;
  const lookFile = join(project, ".cutscene", "look.json");
  if (existsSync(lookFile)) {
    try {
      look = JSON.parse(readFileSync(lookFile, "utf8")) as CaptionLook;
    } catch {
      look = null;
    }
  }
  const indexFile = join(project, "index.html");
  const html = existsSync(indexFile) ? readFileSync(indexFile, "utf8") : "";
  const built = buildCaptions(sheet, { html, text, maxWords });
  if (!built.lines.length) return fail("NO_WORDS", "No beat has voice word timings to caption.", built.warnings[0] ?? "Make and check the voice lines with cutscene-voice first.");
  const width = Number.isInteger(sheet.width) ? (sheet.width as number) : 1920;
  const height = Number.isInteger(sheet.height) ? (sheet.height as number) : 1080;
  const out = resolve(project, typeof args.out === "string" ? args.out : join("compositions", `${id}.html`));
  const rel = relative(project, out);
  if (isAbsolute(String(args.out ?? "")) || !rel || rel.startsWith("..") || isAbsolute(rel)) return fail("OUTSIDE_PROJECT", "The caption file must go inside the project.", "Leave out --out, or give a path inside the project folder.", 2);
  const page = captionsHtml({ id, lines: built.lines, duration: built.duration, width, height, look, position: args.position === "top" ? "top" : "bottom", font: args.font === "display" ? "display" : "body" });
  const snippet = hostSnippet({ id, duration: built.duration, width, height, track: Number(args.track) || 9 });
  if (!args["dry-run"]) {
    if (existsSync(out) && !readFileSync(out, "utf8").includes(MARKER) && !args.force) {
      return fail("FILE_EXISTS", `${out} exists and wasn't made by this script.`, "Pick another --id, or pass --force to replace it.");
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, page);
  }
  const result = { ok: true, file: args["dry-run"] ? null : out, compositionId: id, snippet, duration: built.duration, lines: built.lines, placements: built.placements, sources: built.sources, warnings: built.warnings };
  if (json) io.out(JSON.stringify(result) + "\n");
  else {
    io.out(
      [
        args["dry-run"] ? `Captions (dry run, nothing written): ${built.lines.length} lines` : `Wrote ${out}: ${built.lines.length} caption lines, ${built.duration}s`,
        ...built.lines.map((l) => `  ${l.show.toFixed(2)}-${l.hide.toFixed(2)}  ${l.words.map((w) => w.text).join(" ")}`),
        `Caption text: ${built.sources.map((s) => `${s.beat} ${s.source}`).join(", ")}`,
        "Add this clip to index.html inside the root composition (on a track above the graphics):",
        `  ${snippet}`,
        ...built.warnings.map((w) => `note: ${w}`),
        "Then: cutscene check, cutscene snapshot.",
      ].join("\n") + "\n",
    );
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
