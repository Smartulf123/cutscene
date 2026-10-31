// `cutscene doctor`: checks everything Cutscene uses and says how to fix what's missing.
// Needed: Node.js 22+, FFmpeg, the pinned video engine and its render browser.
// Optional: VP9 alpha encoding (transparent WebM renders), Python 3.10+, the voice environment,
// and VoiceStudio on 127.0.0.1:3900.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EXIT, printJson } from "./lib/json.mjs";
import type { CutsceneError } from "./lib/json.mjs";
import { CUTSCENE_VERSION, SKILLS_ROOT, cutsceneHome } from "./lib/paths.mjs";
import { readConfig } from "./lib/config.mjs";
import { engineStatus, readPin, runEngine } from "./lib/engine.mjs";
import { findOnPath, probe } from "./lib/proc.mjs";
import { isMainModule } from "./lib/main.mjs";
import { findKokoroPython } from "./lib/python.mjs";
import type { PythonCandidate } from "./lib/python.mjs";

export const MIN_NODE = [22, 0, 0];
export const MIN_PYTHON = [3, 10, 0];
export const VOICESTUDIO_HEALTH = "http://127.0.0.1:3900/health";

/** One line of the doctor's report. */
export interface Check {
  id: string;
  name: string;
  group: "needed" | "optional";
  ok: boolean;
  status: string;
  version?: string;
  path?: string;
  detail?: string;
  fix?: string;
  installable?: boolean;
  command?: string;
  voice?: unknown;
}

/** The cutscene-voice part's status module, as far as doctor uses it. */
interface VoicePartModule {
  voiceStatus?: (opts: { home: string }) => VoiceStatus | Promise<VoiceStatus>;
}

type VoiceStatus = {
  ok?: boolean;
  ready?: boolean;
  installed?: boolean;
  models?: { installed?: boolean; ok?: boolean; name?: string; id?: string }[];
  detail?: string;
  summary?: string;
  message?: string;
  fix?: string;
  hint?: string;
} | null | undefined;

/** A pin in skills/cutscene-edit/assets/manifest.json. */
interface EditPin {
  name: string;
  version: string;
  platform: string;
  file: string;
  size: number;
}

/** Compare version arrays: negative when a < b. */
export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** "Python 3.12.4" -> [3, 12, 4] */
export function parseVersion(text: string | null | undefined, prefix: string): number[] | null {
  const m = new RegExp(`${prefix}\\s*v?(\\d+)\\.(\\d+)(?:\\.(\\d+))?`, "i").exec(text || "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

const v2s = (v: number[]) => v.join(".");

function check(id: string, name: string, group: Check["group"], ok: boolean, fields: Partial<Check> = {}): Check {
  return { id, name, group, ok, status: ok ? "ok" : "missing", ...fields };
}

// --- Node -------------------------------------------------------------------------------------

export function checkNode(version: string = process.versions.node): Check {
  const v = version.split(".").map(Number);
  const ok = compareVersions(v, MIN_NODE) >= 0;
  return check("node", "Node.js 22+", "needed", ok, {
    status: ok ? "ok" : "too old",
    version,
    detail: ok ? version : `${version} is too old`,
    fix: ok ? undefined : "Install Node.js 22 or newer from nodejs.org, then run `cutscene doctor` again.",
  });
}

// --- FFmpeg -----------------------------------------------------------------------------------

export function checkFfmpeg({ env = process.env }: { env?: NodeJS.ProcessEnv } = {}): Check[] {
  const ffmpeg = findOnPath("ffmpeg", env);
  const ffprobe = findOnPath("ffprobe", env);
  if (!ffmpeg) {
    return [
      check("ffmpeg", "FFmpeg", "needed", false, {
        detail: "Not found on PATH",
        fix: "Install FFmpeg (Windows: `winget install Gyan.FFmpeg`; macOS: `brew install ffmpeg`; Linux: your package manager), open a new terminal, then run `cutscene doctor` again.",
      }),
      check("vp9", "Transparent WebM (VP9)", "optional", false, { detail: "Needs FFmpeg", fix: "Install FFmpeg first." }),
    ];
  }
  const ver = probe(ffmpeg, ["-hide_banner", "-version"]);
  const first = (ver.stdout.split(/\r?\n/)[0] || "").trim();
  const m = /ffmpeg version (\S+)/i.exec(first);
  const version = m ? m[1].replace(/-.*$/, "") : "unknown";
  const enc = probe(ffmpeg, ["-hide_banner", "-encoders"]);
  const vp9 = /\blibvpx-vp9\b/.test(enc.stdout);
  return [
    check("ffmpeg", "FFmpeg", "needed", ver.ok && !!ffprobe, {
      version,
      path: ffmpeg,
      detail: ffprobe ? version : `${version}, but ffprobe is missing`,
      fix: ffprobe ? undefined : "Install a full FFmpeg build that includes ffprobe.",
    }),
    check("vp9", "Transparent WebM (VP9)", "optional", vp9, {
      detail: vp9 ? "libvpx-vp9 encoder ready (for transparent WebM renders)" : "This FFmpeg has no libvpx-vp9 encoder",
      fix: vp9 ? undefined : "Install a full FFmpeg build (for example the gyan.dev full build on Windows) to render transparent WebM videos.",
    }),
  ];
}

// --- Engine and its browser -------------------------------------------------------------------

export async function checkEngine({ home = cutsceneHome() }: { home?: string } = {}): Promise<Check[]> {
  let pin;
  try {
    pin = readPin();
  } catch (err) {
    return [check("engine", "Video engine", "needed", false, { detail: (err as CutsceneError).message, fix: (err as CutsceneError).hint })];
  }
  const status = engineStatus({ pin, home });
  const engine = check("engine", "Video engine", "needed", status.installed, {
    version: status.version || undefined,
    path: status.dir,
    detail: status.installed ? `${pin}` : status.version ? `Version ${status.version} found, ${pin} needed` : "Not installed",
    fix: status.installed ? undefined : "Run `cutscene setup --yes` (about 110 MB from npm).",
    installable: !status.installed,
  });
  if (!status.installed) {
    return [engine, check("browser", "Render browser", "needed", false, { detail: "Needs the video engine", fix: "Run `cutscene setup --yes`.", installable: true })];
  }
  const r = await runEngine(["browser", "path"], { pin, home, env: { ...process.env, NO_COLOR: "1" }, timeoutMs: 30_000 });
  const path = r.stdout.trim().split(/\r?\n/).pop() || "";
  const ok = r.code === 0 && !!path && existsSync(path);
  return [
    engine,
    check("browser", "Render browser", "needed", ok, {
      path: ok ? path : undefined,
      detail: ok ? "Headless Chrome ready" : "Not downloaded yet",
      fix: ok ? undefined : "Run `cutscene setup --yes` (about 270 MB, Chrome for Testing from Google).",
      installable: !ok,
    }),
  ];
}

// --- Python -----------------------------------------------------------------------------------

export function checkPython({ platform = process.platform }: { platform?: NodeJS.Platform } = {}): Check {
  const tries: [string, string[]][] = platform === "win32" ? [["py", ["-3", "--version"]], ["python", ["--version"]], ["python3", ["--version"]]] : [["python3", ["--version"]], ["python", ["--version"]]];
  let tooOld: Check | null = null;
  for (const [cmd, args] of tries) {
    const r = probe(cmd, args);
    if (!r.ok) continue;
    const v = parseVersion(`${r.stdout} ${r.stderr}`, "Python");
    if (!v) continue;
    const ok = compareVersions(v, MIN_PYTHON) >= 0;
    const fields = { version: v2s(v), detail: `${v2s(v)} (${cmd})`, command: cmd };
    if (ok) return check("python", "Python 3.10+", "optional", true, fields);
    tooOld = tooOld || check("python", "Python 3.10+", "optional", false, { ...fields, status: "too old", fix: "Install Python 3.10 or newer from python.org (needed for AI voices)." });
  }
  return tooOld || check("python", "Python 3.10+", "optional", false, { detail: "Not found (needed for AI voices)", fix: "Install Python 3.10 or newer from python.org, or run `cutscene voice setup`." });
}

async function importPart<T>(rel: string): Promise<T | null> {
  const file = join(SKILLS_ROOT, rel);
  if (!existsSync(file)) return null;
  try {
    return await import(pathToFileURL(file).href);
  } catch {
    return null;
  }
}

// --- Voices -----------------------------------------------------------------------------------

export async function checkVoice({ home = cutsceneHome() }: { home?: string } = {}): Promise<Check> {
  const mod = await importPart<VoicePartModule>(join("cutscene-voice", "scripts", "lib", "status.mjs"));
  if (!mod || typeof mod.voiceStatus !== "function") {
    return check("voice", "AI voices", "optional", false, {
      status: "not set up",
      detail: mod ? "The voice part has no status check" : "The cutscene-voice part isn't installed",
      fix: "Reinstall the Cutscene plugin to get the voice part.",
    });
  }
  try {
    const s = await mod.voiceStatus({ home });
    const ok = !!(s && (s.ok ?? s.ready ?? s.installed));
    const models = s && Array.isArray(s.models) ? s.models.filter((m) => m && (m.installed ?? m.ok)).map((m) => m.name || m.id).filter(Boolean) : [];
    const detail = (s && (s.detail || s.summary || s.message)) || (ok ? (models.length ? `Ready: ${models.join(", ")}` : "Ready") : "Not set up yet");
    return check("voice", "AI voices", "optional", ok, {
      status: ok ? "ok" : "not set up",
      detail,
      fix: ok ? undefined : (s && (s.fix || s.hint)) || "Run `cutscene voice setup` (asks before downloading anything).",
      voice: s,
    });
  } catch (err) {
    return check("voice", "AI voices", "optional", false, { status: "not set up", detail: `Couldn't read the voice status: ${(err as Error).message}`, fix: "Run `cutscene voice setup`." });
  }
}

export async function checkVoiceStudio({ url = VOICESTUDIO_HEALTH, timeoutMs = 1500 }: { url?: string; timeoutMs?: number } = {}): Promise<Check> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const ok = res.ok;
    return check("voicestudio", "VoiceStudio", "optional", ok, {
      status: ok ? "ok" : "off",
      detail: ok ? "Running on 127.0.0.1:3900" : `Answered with HTTP ${res.status}`,
    });
  } catch {
    return check("voicestudio", "VoiceStudio", "optional", false, { status: "off", detail: "Not running (optional; Cutscene's own voices don't need it)" });
  }
}

// --- Built-in voice (the engine's Kokoro) -----------------------------------------------------

export function checkKokoro({ home = cutsceneHome(), find = findKokoroPython }: { home?: string; find?: (opts: { home?: string }) => PythonCandidate | null } = {}): Check {
  const found = process.env.HYPERFRAMES_PYTHON ? { python: process.env.HYPERFRAMES_PYTHON, source: "HYPERFRAMES_PYTHON" } : find({ home });
  const cache = join(homedir(), ".cache", "hyperframes", "tts");
  return check("kokoro", "Built-in voice (Kokoro)", "optional", !!found, {
    status: found ? "ok" : "not set up",
    path: found ? found.python : undefined,
    detail: found ? `Ready (Python with kokoro-onnx: ${found.python}); its model cache is ${cache}` : "No Python with kokoro-onnx found",
    fix: found ? undefined : "Run `cutscene voice setup`, or install kokoro-onnx into a Python 3.10+ and set HYPERFRAMES_PYTHON to it.",
  });
}

// --- Footage tools (cutscene-edit's on-demand downloads) --------------------------------------

const platformKey = (p: string = process.platform, a: string = process.arch) => `${p}-${a === "arm64" ? "arm64" : a === "x64" ? "x64" : a}`;
const sizeText = (bytes: number) => (bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(0)} MB` : `${Math.ceil(bytes / 1024)} KB`);

/**
 * auto-editor and the MediaPipe face detector, from the pins in
 * skills/cutscene-edit/assets/manifest.json. Installed means the part's own marker file
 * <home>/tools/<name>/<version>/.cutscene-ok exists.
 */
export function checkEditTools({ home = cutsceneHome(), skillsRoot = SKILLS_ROOT, platform = platformKey() }: { home?: string; skillsRoot?: string; platform?: string } = {}): Check[] {
  let pins: EditPin[];
  try {
    pins = JSON.parse(readFileSync(join(skillsRoot, "cutscene-edit", "assets", "manifest.json"), "utf8")).pins || [];
  } catch {
    return [];
  }
  const pinFor = (name: string) => pins.find((p) => p.name === name && (p.platform === platform || p.platform === "any"));
  const installed = (pin: EditPin | undefined) => !!pin && existsSync(join(home, "tools", pin.name, pin.version, ".cutscene-ok"));
  const out: Check[] = [];
  const ae = pinFor("auto-editor");
  if (ae) {
    const ok = installed(ae);
    out.push(
      check("auto-editor", `auto-editor ${ae.version}`, "optional", ok, {
        status: ok ? "ok" : "not set up",
        version: ae.version,
        path: ok ? join(home, "tools", ae.name, ae.version, ae.file) : undefined,
        detail: ok ? "Ready (fast rough cuts, exports to other editors)" : "Not downloaded (only needed for rough cuts and editor exports)",
        fix: ok ? undefined : `Run \`cutscene edit install auto-editor --yes\` when needed (${sizeText(ae.size)}, Unlicense).`,
      }),
    );
  }
  const face = ["mediapipe-tasks-vision", "face-detector-model"].map(pinFor);
  if (face.every(Boolean)) {
    const ok = face.every(installed);
    const size = face.reduce((n, p) => n + (p!.size || 0), 0);
    out.push(
      check("face-detector", "Face detector (MediaPipe)", "optional", ok, {
        status: ok ? "ok" : "not set up",
        version: face.map((p) => `${p!.name} ${p!.version}`).join(", "),
        detail: ok ? "Ready (face-follow vertical reframes)" : "Not downloaded (only needed for face-follow reframes)",
        fix: ok ? undefined : `Run \`cutscene edit install face-detector --yes\` when needed (${sizeText(size)}, Apache-2.0).`,
      }),
    );
  }
  return out;
}

// --- Settings ---------------------------------------------------------------------------------

export function checkConfig({ home = cutsceneHome() }: { home?: string } = {}): Check | null {
  try {
    readConfig({ home });
    return null;
  } catch (err) {
    return check("config", "Settings file", "needed", false, { status: "broken", detail: (err as CutsceneError).message, fix: (err as CutsceneError).hint });
  }
}

// ---------------------------------------------------------------------------------------------

/** Run every check. */
export async function collectChecks({ home = cutsceneHome(), env = process.env }: { home?: string; env?: NodeJS.ProcessEnv } = {}): Promise<Check[]> {
  const [engine, voice, voicestudio] = await Promise.all([
    checkEngine({ home }),
    checkVoice({ home }),
    checkVoiceStudio(),
  ]);
  const checks = [checkNode(), ...checkFfmpeg({ env }), ...engine, checkPython(), voice, checkKokoro({ home }), voicestudio, ...checkEditTools({ home })];
  const cfg = checkConfig({ home });
  if (cfg) checks.unshift(cfg);
  // Needed first, then optional, keeping the order above inside each group.
  return [...checks.filter((c) => c.group === "needed"), ...checks.filter((c) => c.group === "optional")];
}

export function summarize(checks: Check[]): { ready: boolean; missing: Check[] } {
  const missing = checks.filter((c) => c.group === "needed" && !c.ok);
  return { ready: missing.length === 0, missing };
}

export function formatDoctor(checks: Check[], { home, pin }: { home: string; pin: string }): string {
  const lines = [`Cutscene doctor · Cutscene ${CUTSCENE_VERSION} · engine ${pin || "?"}`, `Home: ${home}`];
  const width = Math.max(...checks.map((c) => c.name.length)) + 2;
  for (const [group, title] of [["needed", "Needed"], ["optional", "Optional"]]) {
    const rows = checks.filter((c) => c.group === group);
    if (!rows.length) continue;
    lines.push("", title);
    for (const c of rows) {
      lines.push(`  ${c.status.padEnd(12)}${c.name.padEnd(width)}${c.detail || ""}`);
      if (!c.ok && c.fix) lines.push(`  ${"".padEnd(12)}${"".padEnd(width)}Fix: ${c.fix}`);
    }
  }
  const { ready, missing } = summarize(checks);
  lines.push("");
  lines.push(ready ? "Everything Cutscene needs is ready." : `${missing.length} thing${missing.length === 1 ? "" : "s"} Cutscene needs ${missing.length === 1 ? "is" : "are"} missing. Run \`cutscene setup\` to install what Cutscene can install for you.`);
  return lines.join("\n") + "\n";
}

export async function runDoctor(args: string[] = [], { json = false }: { json?: boolean } = {}): Promise<number> {
  const home = cutsceneHome();
  let pin = "";
  try {
    pin = readPin();
  } catch {
    pin = "";
  }
  const checks = await collectChecks({ home });
  const { ready, missing } = summarize(checks);
  if (json) {
    const body = { cutscene: CUTSCENE_VERSION, engine: pin, home, ready, checks };
    if (ready) printJson({ ok: true, ...body });
    else {
      printJson({
        ok: false,
        error: {
          code: "MISSING_REQUIREMENTS",
          message: `Cutscene is missing ${missing.map((c) => c.name).join(", ")}.`,
          hint: missing.some((c) => c.installable) ? "Run `cutscene setup` to install the engine pieces; each check says how to fix the rest." : missing.map((c) => c.fix).filter(Boolean).join(" "),
        },
        ...body,
      });
    }
  } else {
    process.stdout.write(formatDoctor(checks, { home, pin }));
  }
  return ready ? EXIT.OK : EXIT.FAIL;
}

if (isMainModule(import.meta.url)) {
  const json = process.argv.includes("--json");
  runDoctor(process.argv.slice(2), { json }).then((code) => {
    process.exitCode = code;
  });
}

