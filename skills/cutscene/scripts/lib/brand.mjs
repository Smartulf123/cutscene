// Turn the engine's human-readable output into Cutscene wording: users see "cutscene <cmd>"
// and "Cutscene", never the engine's own name, cloud services or desktop app. File paths are
// never changed: a name next to a slash, backslash, dot or dash (".hyperframes/",
// "hyperframes.json", "C:\...\hyperframes\...") is left exactly as it is.

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** Remove terminal colour codes. */
export function stripAnsi(s) {
  return s.replace(ANSI, "");
}

// Lines about things Cutscene doesn't offer (the engine's cloud, account, desktop app, its
// website and skill updates). Dropped from human output.
const DROP = [
  /\bFramey\b/i,
  /desktop app/i,
  /\bheygen\b/i,
  /hyperframes\.dev\b/i,
  /\bskills (update|check|add)\b/i,
  /\bnpx skills\b/i,
  /\bhyperframes (open|catch-up|publish|upgrade|cloud|auth|lambda|cloudrun|feedback|telemetry)\b/i,
  /\bupdate available\b/i,
  /\bnew version\b.*\bavailable\b/i,
  /\bnpm (i|install) -g\b/i,
];

const P = String.raw`[\w./\\:@-]`; // characters before a name that make it part of a path, file or package
// After a name the same, except that a dot ending a sentence ("...with HyperFrames.") is fine.
const A = String.raw`(?:[\w/\\:@-]|\.\w)`;

const RULES = [
  // npx [--yes] hyperframes[@x.y.z] -> cutscene
  [new RegExp(String.raw`(?<!${P})npx\s+(?:--yes\s+|-y\s+)?hyperframes(?:@[\w.-]+)?(?!${A})`, "g"), "cutscene"],
  // "hyperframes init v0.8.162" (help headers) -> "cutscene init"
  [new RegExp(String.raw`(?<!${P})hyperframes(\s+[a-z][\w-]*)\s+v\d+\.\d+\.\d+(?![\w.])`, "g"), "cutscene$1"],
  // hyperframes@x.y.z -> cutscene
  [new RegExp(String.raw`(?<!${P})hyperframes@[\w.-]+(?![\w/\\])`, "g"), "cutscene"],
  // slash commands: /hyperframes, /hyperframes-cli -> /cutscene
  [/(^|[\s(`'"])\/hyperframes(?:-[a-z]+)*(?![\w/\\-]|\.\w)/g, "$1/cutscene"],
  // log tags: "hyperframes:registry skipped ..." -> "cutscene registry: skipped ..."
  [new RegExp(String.raw`(?<!${P})hyperframes:([a-z][\w-]*)(?=\s)`, "g"), "cutscene $1:"],
  // "HyperFrames by HeyGen" -> "Cutscene"
  [/HyperFrames by HeyGen/g, "Cutscene"],
  // product name
  [new RegExp(String.raw`(?<!${P})HyperFrames(?!${A})`, "g"), "Cutscene"],
  [new RegExp(String.raw`(?<!${P})HYPERFRAMES(?![\w./\\:@-])`, "g"), "CUTSCENE"],
  // bare command name: "hyperframes render" -> "cutscene render"
  [new RegExp(String.raw`(?<!${P})hyperframes(?!${A})`, "g"), "cutscene"],
];

function rebrandText(text) {
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}

/**
 * Rebrand one line of engine output. Returns null when the line should be dropped.
 * Colour codes are kept; only the visible text between them changes.
 * @param {string} line
 */
export function rebrandLine(line) {
  const plain = stripAnsi(line);
  if (DROP.some((re) => re.test(plain))) return null;
  // Work on the text between colour codes so a code ending in "m" never hides a word boundary.
  const parts = line.split(/(\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))/);
  return parts.map((p, i) => (i % 2 === 1 ? p : rebrandText(p))).join("");
}

/** Rebrand a block of text, line by line, dropping lines Cutscene doesn't show. */
export function rebrand(text) {
  const out = [];
  for (const line of text.split(/(?<=\n)/)) {
    const nl = line.endsWith("\n") ? (line.endsWith("\r\n") ? "\r\n" : "\n") : "";
    const body = nl ? line.slice(0, -nl.length) : line;
    const r = rebrandLine(body);
    if (r !== null) out.push(r + nl);
  }
  return out.join("");
}

/**
 * A streaming rebrander: feed it chunks, it writes whole lines (and `\r` progress updates) to
 * `write`. A partial line (a prompt waiting for input) is flushed after a short pause.
 * @param {(s: string) => void} write
 */
export function createRebrandStream(write, { idleMs = 120 } = {}) {
  let buf = "";
  let timer = null;
  const emit = (seg) => {
    const m = /(\r\n|\n|\r)$/.exec(seg);
    const end = m ? m[1] : "";
    const body = end ? seg.slice(0, -end.length) : seg;
    const r = rebrandLine(body);
    if (r !== null) write(r + end);
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (buf) {
      emit(buf);
      buf = "";
    }
  };
  return {
    push(chunk) {
      buf += chunk.toString("utf8");
      const parts = buf.split(/(?<=\r\n|\n|\r(?!\n))/);
      buf = "";
      for (const p of parts) {
        if (/(\r\n|\n|\r)$/.test(p)) emit(p);
        else buf += p;
      }
      if (timer) clearTimeout(timer);
      timer = buf ? setTimeout(flush, idleMs) : null;
    },
    end: flush,
  };
}
