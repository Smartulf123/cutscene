#!/usr/bin/env node
// The `cutscene` command (contracts §3). One entry point for users, skills and parts:
//   node "<skills>/cutscene/scripts/cli.mjs" <command> [args] [--json]
//
// - Engine commands run the pinned engine from <CUTSCENE_HOME>/engine/<pin> with Cutscene's
//   environment, and their output is reworded so users see "cutscene <cmd>".
// - `voice`, `3d` and `edit` run the matching part's script next to this skill.
// - `preview` runs ./preview.mjs; `doctor` and `setup` are Cutscene's own.
// Built on HyperFrames, an open-source framework by HeyGen (Apache-2.0).
// Cutscene is independent and not affiliated with HeyGen.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { isMainModule } from "./lib/main.mjs";
import { CutsceneError, EXIT, errorToEnvelope, exitCodeOf, fail, printHumanError, printJson, takeFlags, usageError } from "./lib/json.mjs";
import { CLI_PATH, CUTSCENE_VERSION, PARTS, SKILL_DIR, SKILLS_ROOT, cutsceneHome, isNetworkPath, partScript, previewScript, resolveUserPath } from "./lib/paths.mjs";
import { engineEnv, ensureEngine, engineStatus, readPin } from "./lib/engine.mjs";
import { describeDownloads, engineDownloadsFor } from "./lib/engine-downloads.mjs";
import { createRebrandStream, rebrand, stripAnsi } from "./lib/brand.mjs";
import { run } from "./lib/proc.mjs";
import type { RunResult } from "./lib/proc.mjs";

/** How an engine command handles `--json`, and whether it takes `--yes` itself. */
export interface EngineCommandSpec {
  json: boolean | "own" | "batch";
  yes?: boolean;
}

/** A finding in the engine's check or lint report. */
interface Finding {
  severity?: string;
  area?: string;
  code?: string;
  message?: unknown;
  fixHint?: unknown;
  hint?: unknown;
  fix?: unknown;
  file?: string;
  sourceFile?: string;
  line?: number;
  column?: number;
  selector?: string;
  time?: unknown;
  [key: string]: unknown;
}

/** One area of the engine's check report (lint, runtime, layout, motion, contrast). */
interface ReportSection {
  errorCount?: number;
  findings?: Finding[];
  [key: string]: unknown;
}

/** The engine's `check --json` / `lint --json` report, as far as Cutscene reads it. */
interface Report {
  ok?: unknown;
  findings?: Finding[];
  lint?: ReportSection;
  runtime?: ReportSection;
  layout?: ReportSection;
  motion?: ReportSection;
  contrast?: ReportSection;
  saved?: { report?: string };
  [key: string]: unknown;
}

/** An engine command's JSON result, as far as Cutscene reads it. */
interface EngineBody extends Report {
  error?: string | { message?: string; code?: string; hint?: string; fixHint?: string } | null;
  errorCount?: number;
}

// json: true = the engine has --json; "batch" = only together with --batch; false = no --json.
// yes: the engine command itself takes --yes, so pass it on.
export const ENGINE_COMMANDS: Record<string, EngineCommandSpec> = {
  init: { json: "own" },
  check: { json: true },
  lint: { json: true },
  snapshot: { json: false },
  render: { json: "batch" },
  transcribe: { json: true },
  tts: { json: true },
  "remove-background": { json: true },
  add: { json: true },
  catalog: { json: true, yes: true },
  timeline: { json: true },
  compare: { json: true },
  "normalize-audio": { json: true },
  // More local engine tools the Cutscene skills use.
  info: { json: true },
  compositions: { json: true },
  beats: { json: true },
  audio: { json: true },
  keyframes: { json: true },
  inspect: { json: true },
  validate: { json: true },
  models: { json: true },
  browser: { json: false },
  capture: { json: true },
  "media-treatment": { json: true },
  "grade-compare": { json: true },
  history: { json: true },
  docs: { json: false },
  benchmark: { json: true },
  clean: { json: true },
  present: { json: false },
  play: { json: false },
  figma: { json: false },
};

const LOCAL_ONLY = "Cutscene renders on your computer only. Use `cutscene render` when the user asks for the video file.";
export const BLOCKED: Record<string, string> = {
  skills: "Cutscene's skills come with the Cutscene plugin. Update them through your agent's plugin manager.",
  upgrade: `Cutscene uses one tested engine version so videos come out the same every time. Update Cutscene itself to get a newer engine.`,
  cloud: LOCAL_ONLY,
  cloudrun: LOCAL_ONLY,
  lambda: LOCAL_ONLY,
  publish: "Cutscene doesn't upload videos anywhere. Render the video with `cutscene render` and share the file yourself.",
  auth: "Cutscene doesn't need an account; everything runs on this computer.",
  feedback: "To report a problem with Cutscene, open an issue at https://github.com/Smartulf123/cutscene/issues.",
  usage: "Cutscene runs on this computer and has no usage limits.",
  open: "Cutscene has no desktop app. Use `cutscene preview` to watch and edit the video in your browser.",
  "catch-up": "Cutscene has no desktop app, so there's nothing to catch up on.",
  telemetry: "Cutscene always turns the engine's anonymous usage statistics off. There's nothing to change.",
};

const HELP = `Cutscene ${CUTSCENE_VERSION}: make and edit videos with your AI agent.

Usage: cutscene <command> [options]
       Add --json to any command for one JSON result on stdout.

Start
  doctor               Check what's installed: engine, FFmpeg, voices
  setup                Install what's missing (asks first; --yes to agree)
  init <folder>        Make a new video project

Build and look
  preview [project]    Open the live preview in your browser (127.0.0.1 only)
  check [project]      Check for mistakes: code, layout, motion, contrast
  lint [project]       Quick check of the composition code only
  snapshot [project]   Save still frames as PNG files to look at
  timeline [project]   List the tracks and clips
  add <name>           Add a ready-made block or component
  catalog              Browse blocks and components
  compare              Put variants side by side in one image

Media
  transcribe <file>    Words with timings, made on this computer
  tts <text>           A quick voice line with the built-in voice
  remove-background    Cut out the background of a video or image
  normalize-audio      Match the loudness of two clips

Parts
  voice <command>      AI voices: design, clone, speak, verify
  3d <command>         3D shots with Three.js
  edit <command>       Footage clean-up: silences, retakes, highlights, reframe

Finish (only when the user asks for the video file)
  render [project]     Render the final video

More tools: ${Object.keys(ENGINE_COMMANDS).filter((c) => !/^(init|check|lint|snapshot|render|transcribe|tts|remove-background|add|catalog|timeline|compare|normalize-audio)$/.test(c)).join(", ")}
Run \`cutscene <command> --help\` for a command's options.
`;

// ---------------------------------------------------------------------------------------------

function partEnv(pin: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CUTSCENE_HOME: cutsceneHome(),
    CUTSCENE_CLI: CLI_PATH,
    CUTSCENE_ENGINE_VERSION: pin,
  };
}

function safePin(): string {
  try {
    return readPin();
  } catch {
    return "";
  }
}

/** Run a part's (or the preview's) script with the same Node, passing args through untouched. */
async function dispatchScript(script: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const r = await run(process.execPath, [script, ...args], { env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  if (r.error) throw new CutsceneError("PART_FAILED_TO_START", `Cutscene couldn't start ${script}: ${r.error.message}`, { hint: "Run `cutscene doctor` to check the installation." });
  return r.code;
}

const PART_LABELS: Record<string, string> = { voice: "voice", "3d": "3D", edit: "footage editing" };

async function dispatchPart(part: string, args: string[]): Promise<number> {
  const script = partScript(part);
  if (!existsSync(script)) {
    throw new CutsceneError("PART_MISSING", `The ${PART_LABELS[part] || part} part of Cutscene isn't installed (no cutscene-${part} skill next to the cutscene skill).`, {
      hint: `Reinstall the Cutscene plugin, or install the cutscene-${part} skill in the same skills folder as cutscene (${SKILLS_ROOT}).`,
      details: { expected: script },
    });
  }
  return dispatchScript(script, args, partEnv(safePin()));
}

async function dispatchPreview(args: string[]): Promise<number> {
  const script = previewScript();
  if (!existsSync(script)) {
    throw new CutsceneError("PREVIEW_MISSING", "Cutscene's preview isn't installed in this copy of Cutscene.", {
      hint: `Reinstall the Cutscene plugin; the preview lives in ${relative(SKILLS_ROOT, script)}.`,
    });
  }
  const pin = readPin();
  return dispatchScript(script, args, { ...engineEnv({ pin }), ...partEnv(pin) });
}

// ---------------------------------------------------------------------------------------------
// Engine commands

function parseEngineJson(stdout: string): unknown {
  const text = stdout.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Some commands print a line or two before the JSON document.
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[[{]/.test(lines[i])) {
      try {
        return JSON.parse(lines.slice(i).join("\n"));
      } catch {
        // keep looking
      }
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // keep looking
    }
  }
  return undefined;
}

const TEXT_KEYS = /^(message|hint|fixHint|fix|detail|details|summary|description|note|notes|suggestion|reason|title|text)$/i;
/** Reword the engine's prose fields (never paths, ids or keys). */
export function rebrandJson(value: unknown, key: string = ""): unknown {
  if (typeof value === "string") return TEXT_KEYS.test(key) ? rebrand(value) : value;
  if (Array.isArray(value)) return value.map((v) => rebrandJson(v, key));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "_meta") continue; // engine version and update notices
      out[k] = rebrandJson(v, k);
    }
    return out;
  }
  return value;
}

function lastLines(text: string, n: number = 3): string {
  return rebrand(stripAnsi(text))
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s│◆◇┌└■▲●✖✗×⚠!]+/u, "").trim())
    .filter(Boolean)
    .slice(-n)
    .join(" ");
}

function failureCode(cmd: string): string {
  return `${cmd.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FAILED`;
}

/** Build the `--json` envelope for an engine command's result. */
export function engineEnvelope(cmd: string, code: number, data: unknown, stderr: string = ""): { ok: boolean; [key: string]: unknown } {
  const tail = lastLines(stderr);
  if (data === undefined) {
    if (code === 0) return { ok: true };
    return fail(failureCode(cmd), `cutscene ${cmd} didn't finish${tail ? `: ${tail}` : "."}`, "Run the command again without --json to see the full output, or run `cutscene doctor`.");
  }
  if (Array.isArray(data)) {
    return code === 0 ? { ok: true, items: rebrandJson(data) } : { ...fail(failureCode(cmd), `cutscene ${cmd} didn't finish.`, ""), items: rebrandJson(data) };
  }
  const body = rebrandJson(data && typeof data === "object" ? data : { result: data }) as EngineBody;
  const ok = code === 0 && body.ok !== false;
  if (ok) return { ...body, ok: true };
  let message;
  let hint = "";
  if (body.error && typeof body.error === "object") {
    message = body.error.message || body.error.code;
    hint = body.error.hint || body.error.fixHint || "";
  } else if (typeof body.error === "string") {
    message = body.error;
  }
  if (!message && cmd === "check") {
    const errs = (["lint", "runtime", "layout", "motion", "contrast"] as const).reduce((n, k) => n + ((body[k] && body[k].errorCount) || 0), 0);
    message = `The check found ${errs || "some"} problem${errs === 1 ? "" : "s"} to fix.`;
    hint = "Fix each finding, then run `cutscene check` again.";
  } else if (!message && cmd === "lint") {
    message = `The composition has ${body.errorCount || "some"} error${body.errorCount === 1 ? "" : "s"}.`;
    hint = "Fix each finding, then run `cutscene lint` again.";
  }
  if (!message) message = `cutscene ${cmd} didn't finish${tail ? `: ${tail}` : "."}`;
  const { error: _drop, ...rest } = body;
  return { ...rest, ok: false, error: { code: failureCode(cmd), message, hint: hint || "Read the details above, fix the cause, and try again." } };
}

function hasFlag(args: string[], ...names: string[]): boolean {
  return args.some((a) => names.some((n) => a === n || a.startsWith(`${n}=`)));
}

/** Cutscene's defaults for engine commands: nothing leaves the computer, nothing touches the clipboard. */
export function adjustEngineArgs(cmd: string, args: string[]): string[] {
  const out = [...args];
  if (cmd === "snapshot" && !hasFlag(out, "--describe")) out.push("--describe=false"); // no cloud frame analysis
  if (cmd === "add" && !hasFlag(out, "--clipboard", "--no-clipboard")) out.push("--no-clipboard");
  if (cmd === "preview" && !hasFlag(out, "--open", "--no-open")) out.push("--no-open");
  if (cmd === "transcribe") {
    // The engine would otherwise install whisper.cpp itself: with Homebrew (a global install) or
    // by building an unpinned copy from GitHub. Cutscene never lets it.
    const kept = out.filter((a) => a !== "--runtime-install" && !a.startsWith("--runtime-install="));
    if (!kept.includes("--no-runtime-install")) kept.push("--no-runtime-install");
    return kept;
  }
  return out;
}

async function streamEngine(cmd: string, args: string[], { cwd }: { cwd?: string } = {}): Promise<number> {
  const pin = readPin();
  const status = engineStatus({ pin });
  const color = process.stdout.isTTY ? { FORCE_COLOR: "1" } : { NO_COLOR: "1", FORCE_COLOR: "0" };
  const out = createRebrandStream((s) => process.stdout.write(s));
  const err = createRebrandStream((s) => process.stderr.write(s));
  const r = await run(process.execPath, [status.cli, cmd, ...args], {
    cwd,
    env: { ...engineEnv({ pin }), ...color },
    stdin: "inherit",
    onStdout: (c) => out.push(c),
    onStderr: (c) => err.push(c),
  });
  out.end();
  err.end();
  if (r.error) throw new CutsceneError("ENGINE_FAILED_TO_START", `Cutscene couldn't start its video engine: ${r.error.message}`, { hint: "Run `cutscene doctor`, then `cutscene setup --yes` if the engine is missing." });
  return r.code === 0 ? EXIT.OK : r.code === 2 ? EXIT.USAGE : EXIT.FAIL;
}

async function captureEngine(cmd: string, args: string[], { cwd, echoStderr = true }: { cwd?: string; echoStderr?: boolean } = {}): Promise<RunResult> {
  const pin = readPin();
  const status = engineStatus({ pin });
  const err = echoStderr ? createRebrandStream((s) => process.stderr.write(s)) : null;
  const r = await run(process.execPath, [status.cli, cmd, ...args], {
    cwd,
    env: { ...engineEnv({ pin }), NO_COLOR: "1", FORCE_COLOR: "0" },
    onStderr: err ? (c) => err.push(c) : undefined,
  });
  if (err) err.end();
  if (r.error) throw new CutsceneError("ENGINE_FAILED_TO_START", `Cutscene couldn't start its video engine: ${r.error.message}`, { hint: "Run `cutscene doctor`, then `cutscene setup --yes` if the engine is missing." });
  return r;
}

// --- check / lint for humans: run the engine in JSON mode and word the result ourselves -------

function collectFindings(report: Report): Finding[] {
  if (Array.isArray(report.findings)) return report.findings.map((f) => ({ ...f, area: "code" }));
  const out: Finding[] = [];
  for (const area of ["lint", "runtime", "layout", "motion", "contrast"] as const) {
    const sec = report[area];
    if (sec && Array.isArray(sec.findings)) for (const f of sec.findings) out.push({ ...f, area: area === "lint" ? "code" : area });
  }
  return out;
}

function where(f: Finding, projectDir: string): string {
  const file = f.file || f.sourceFile;
  const bits: string[] = [];
  if (file) {
    const abs = resolve(projectDir, file);
    let shown = relative(projectDir, abs);
    if (!shown || shown.startsWith("..")) shown = file;
    bits.push(f.line ? `${shown}:${f.line}${f.column ? `:${f.column}` : ""}` : shown);
  }
  if (f.selector) bits.push(f.selector);
  if (typeof f.time === "number") bits.push(`at ${f.time}s`);
  return bits.join(", ");
}

export function formatReport(cmd: string, report: Report, projectDir: string): string {
  const findings = collectFindings(report);
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const passed = report.ok !== false && errors === 0;
  const name = cmd === "lint" ? "Code check" : "Check";
  const lines: string[] = [];
  lines.push(`${name} ${passed ? "passed" : "found problems"}: ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}.`);
  const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
  for (const f of [...findings].sort((a, b) => (order[a.severity as string] ?? 3) - (order[b.severity as string] ?? 3))) {
    lines.push("");
    lines.push(`  ${(f.severity || "note").padEnd(8)}${f.area} · ${f.code || "finding"}${where(f, projectDir) ? `  (${where(f, projectDir)})` : ""}`);
    if (f.message) lines.push(`          ${rebrand(String(f.message))}`);
    const fix = f.fixHint || f.hint || f.fix;
    if (fix) lines.push(`          Fix: ${rebrand(String(fix))}`);
  }
  if (report.saved && report.saved.report) {
    lines.push("");
    lines.push(`Full report: ${report.saved.report}`);
  }
  if (!passed) {
    lines.push("");
    lines.push(`Fix the errors, then run \`cutscene ${cmd}\` again.`);
  }
  return lines.join("\n") + "\n";
}

function projectArg(args: string[]): string {
  const valueFlags = new Set(["--samples", "--range", "--components", "--at", "--max-transition-samples", "--max-issues", "--tolerance", "--timeout", "--caption-zone", "--frame-check", "--layout"]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valueFlags.has(a)) {
      i++;
      continue;
    }
    if (!a.startsWith("-")) return a;
  }
  return ".";
}

async function reportCommand(cmd: string, args: string[]): Promise<number> {
  // The engine's progress logs are noise here; they're shown only if the command fails.
  const r = await captureEngine(cmd, [...args, "--json"], { echoStderr: false });
  const data = parseEngineJson(r.stdout);
  if (!data || typeof data !== "object") {
    process.stdout.write(rebrand(r.stdout));
    if (r.code !== 0) printHumanError(new CutsceneError(failureCode(cmd), `cutscene ${cmd} didn't finish${lastLines(r.stderr) ? `: ${lastLines(r.stderr)}` : "."}`, { hint: "Run `cutscene doctor` to check the installation." }));
    return r.code === 0 ? EXIT.OK : EXIT.FAIL;
  }
  process.stdout.write(formatReport(cmd, data as Report, resolve(projectArg(args))));
  return r.code === 0 && (data as Report).ok !== false ? EXIT.OK : EXIT.FAIL;
}

// --- init -------------------------------------------------------------------------------------

const INIT_VALUE_FLAGS = new Set(["-e", "--example", "-t", "--template", "-v", "--video", "-V", "--video-legacy", "-a", "--audio", "--model", "--language", "--resolution", "--skill"]);

export function splitInitArgs(args: string[]): { dir: string | undefined; rest: string[] } {
  let dir: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (INIT_VALUE_FLAGS.has(a)) {
      rest.push(a, args[i + 1]);
      i++;
    } else if (!a.startsWith("-") && dir === undefined) dir = a;
    else rest.push(a);
  }
  return { dir, rest: rest.filter((x) => x !== undefined) };
}

const PROJECT_MEMORY = `# Project memory

Short notes the agent keeps for this video: decisions, approvals (with the date) and what was
checked. Read this before asking the user anything; never ask twice for an approval listed here.

## Approvals

## Decisions

## Checks

## Rules from the user's notes
`;

// Caches and outputs that Cutscene, the engine and the preview rebuild on their own: keep them out
// of git so a project's history holds only what someone made.
export const GITIGNORE_HEADER = "# Cutscene: caches and outputs that are rebuilt automatically";
export const GITIGNORE_LINES = [
  ".hyperframes/",
  ".thumbnails/",
  ".transcode-cache/",
  ".cutscene/stills/",
  ".cutscene/voice/takes/",
  "renders/",
  "/*.mp4",
  "/*.mov",
  "/*.webm",
  "node_modules/",
];

/**
 * Write the project's .gitignore, or add the lines it is missing to an existing one (the user's
 * own lines are never changed or reordered). Returns the lines that were added.
 */
export function writeGitignore(dir: string): string[] {
  const file = join(dir, ".gitignore");
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  const have = new Set(before.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !have.has(l));
  if (!missing.length) return [];
  const nl = before.includes("\r\n") ? "\r\n" : "\n";
  const lead = before === "" ? "" : before.endsWith("\n") ? nl : nl + nl;
  const header = have.has(GITIGNORE_HEADER) ? [] : [GITIGNORE_HEADER];
  writeFileSync(file, before + lead + [...header, ...missing].join(nl) + nl);
  return missing;
}

const UPSTREAM_REGISTRY = "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry";

/** The block registry that matches the pinned engine (the engine's git tag, not its moving main branch). */
export function pinnedRegistry(pin: string): string {
  return `https://raw.githubusercontent.com/heygen-com/hyperframes/v${pin}/registry`;
}

/**
 * Make an engine project a Cutscene project: Cutscene guide files, a .cutscene/ folder, no
 * engine scripts, and `add`/`catalog` blocks taken from the registry of the pinned engine.
 */
export function finishProject(dir: string, pin: string | null = safePin()): void {
  const configFile = join(dir, "hyperframes.json");
  if (pin && existsSync(configFile)) {
    try {
      const config: { registry?: string } = JSON.parse(readFileSync(configFile, "utf8"));
      if (!config.registry || config.registry === UPSTREAM_REGISTRY) {
        config.registry = pinnedRegistry(pin);
        writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
      }
    } catch {
      // leave an unexpected settings file alone
    }
  }
  const guide = readFileSync(join(SKILL_DIR, "assets", "project-guide.md"), "utf8");
  writeFileSync(join(dir, "CLAUDE.md"), guide);
  writeFileSync(join(dir, "AGENTS.md"), guide);
  const pkgFile = join(dir, "package.json");
  if (existsSync(pkgFile)) {
    try {
      const pkg: { scripts?: unknown } = JSON.parse(readFileSync(pkgFile, "utf8"));
      // The engine's scripts call the engine without Cutscene's settings (and one uploads).
      delete pkg.scripts;
      writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
    } catch {
      // leave an unexpected package.json alone
    }
  }
  const meta = join(dir, ".cutscene");
  mkdirSync(meta, { recursive: true });
  const memory = join(meta, "project.md");
  if (!existsSync(memory)) writeFileSync(memory, PROJECT_MEMORY);
  writeGitignore(dir);
}

async function initCommand(args: string[], { json }: { json: boolean }): Promise<number> {
  const { dir, rest } = splitInitArgs(args);
  if (!dir) throw usageError("Tell Cutscene where to make the project, for example: cutscene init my-video", "Run `cutscene init <folder>`.");
  if (isNetworkPath(dir)) resolveUserPath(dir); // throws NETWORK_PATH
  const abs = resolveUserPath(dir);
  if (existsSync(abs)) {
    if (!statSync(abs).isDirectory()) {
      throw new CutsceneError("PROJECT_PATH_IS_FILE", `${abs} is a file, not a folder.`, { hint: "Pick a new folder name for the project." });
    }
    if (readdirSync(abs).length > 0) {
      throw new CutsceneError("PROJECT_EXISTS", `The folder ${abs} already exists and isn't empty.`, { hint: "Pick a new folder name, or open the existing project instead of making a new one." });
    }
  }
  const engineArgs = [abs, ...rest];
  if (!engineArgs.includes("--non-interactive")) engineArgs.push("--non-interactive");
  const r = await captureEngine("init", engineArgs, { echoStderr: !json });
  if (r.code !== 0 || !existsSync(join(abs, "index.html"))) {
    const tail = lastLines(r.stderr || r.stdout);
    throw new CutsceneError("INIT_FAILED", `Cutscene couldn't make the project${tail ? `: ${tail}` : "."}`, { hint: "Check the folder name and that you can write there, then try again. `cutscene doctor` checks the engine." });
  }
  finishProject(abs);
  const files = readdirSync(abs).sort();
  const next = [
    "Write the brief with the user and save it as .cutscene/brief.md",
    `cutscene preview "${abs}"`,
    `cutscene check "${abs}"`,
  ];
  if (json) {
    printJson({ ok: true, project: abs, name: basename(abs), files, next });
  } else {
    process.stdout.write(
      `Made a Cutscene project in ${abs}\n\n` +
        files.map((f) => `  ${f}`).join("\n") +
        `\n\nNext:\n  1. Agree on the brief with the user (saved as .cutscene/brief.md).\n  2. Watch it:  cutscene preview "${abs}"\n  3. Check it:  cutscene check "${abs}"\n`,
    );
  }
  return EXIT.OK;
}

/** `browser ensure` may download about 270 MB: allowed without --yes only when nothing is missing. */
async function browserConsent(): Promise<void> {
  const r = await captureEngine("browser", ["path"], { echoStderr: false });
  const path = r.stdout.trim().split(/\r?\n/).pop() || "";
  if (r.code === 0 && path && existsSync(path)) return;
  const { browserPlan } = await import("./setup.mjs");
  const plan = browserPlan();
  throw new CutsceneError("NEEDS_CONSENT", `Cutscene needs to download its render browser first (${plan.package}, ${plan.size}, from ${plan.source}).`, {
    hint: "Ask the user, then run `cutscene setup --yes` (or repeat the command with --yes).",
    details: { downloads: [plan] },
  });
}

async function engineCommand(cmd: string, args: string[], { json, yes }: { json: boolean; yes: boolean }): Promise<number> {
  const spec = ENGINE_COMMANDS[cmd];
  await ensureEngine({ yes, onOutput: (s) => process.stderr.write(s) });
  let engineArgs = adjustEngineArgs(cmd, args);
  if (!yes) {
    // Models the engine fetches on first use (speech, voice, cut-out): ask first (contracts §9).
    const plans = engineDownloadsFor(cmd, engineArgs);
    if (plans.length) {
      throw new CutsceneError("NEEDS_CONSENT", `\`cutscene ${cmd}\` needs a one-time download first: ${describeDownloads(plans)}.`, {
        hint: `Ask the user, then repeat the command with --yes. It is saved in the engine's cache (${plans[0].location}); nothing goes on PATH.`,
        details: { downloads: plans },
      });
    }
  }
  if (yes && spec.yes) engineArgs.push("--yes");
  if (cmd === "init") return initCommand(engineArgs, { json });
  if (cmd === "browser" && engineArgs.find((a) => !a.startsWith("-")) === "ensure" && !yes) await browserConsent();
  if (cmd === "tts" && !process.env.HYPERFRAMES_PYTHON) {
    // Point the built-in voice at a Python that has kokoro-onnx (see lib/python.mjs).
    const { findKokoroPython } = await import("./lib/python.mjs");
    const found = findKokoroPython();
    if (found) process.env.HYPERFRAMES_PYTHON = found.python;
  }

  const wantsHelp = hasFlag(engineArgs, "--help", "-h");
  if (!json) {
    if ((cmd === "check" || cmd === "lint") && !wantsHelp && !hasFlag(engineArgs, "--json")) return reportCommand(cmd, engineArgs);
    return streamEngine(cmd, engineArgs);
  }

  const supportsJson = spec.json === true || (spec.json === "batch" && hasFlag(engineArgs, "--batch"));
  if (supportsJson && !wantsHelp && !engineArgs.includes("--json")) engineArgs.push("--json");
  const r = await captureEngine(cmd, engineArgs);
  if (supportsJson && !wantsHelp) {
    const env = engineEnvelope(cmd, r.code, parseEngineJson(r.stdout), r.stderr);
    printJson(env);
    return env.ok ? EXIT.OK : EXIT.FAIL;
  }
  const output = rebrand(stripAnsi(r.stdout)).split(/\r?\n/).filter((l) => l.trim());
  const env = r.code === 0 ? { ok: true, output } : { ...engineEnvelope(cmd, r.code, undefined, r.stderr || r.stdout), output };
  printJson(env);
  return env.ok ? EXIT.OK : EXIT.FAIL;
}

// ---------------------------------------------------------------------------------------------

/** Add --json for a part (once, and before a bare `--`). */
function withJson(args: string[]): string[] {
  if (args.includes("--json")) return args;
  const dd = args.indexOf("--");
  return dd < 0 ? [...args, "--json"] : [...args.slice(0, dd), "--json", ...args.slice(dd)];
}

/**
 * Run the CLI. Returns the exit code.
 * @param argv arguments after the script name
 */
export async function main(argv: string[]): Promise<number> {
  // `--json` and `--yes` are Cutscene's own flags anywhere before `--`; parts get args untouched.
  const firstPositional = argv.findIndex((a) => !a.startsWith("-"));
  const command = firstPositional >= 0 ? argv[firstPositional] : undefined;
  const before = firstPositional >= 0 ? argv.slice(0, firstPositional) : argv;
  const after = firstPositional >= 0 ? argv.slice(firstPositional + 1) : [];
  const global = takeFlags(before, ["json", "yes", "help", "version"]);
  if (before.includes("-h")) global.flags.help = true;
  if (before.includes("-v")) global.flags.version = true;
  let json = global.flags.json;

  try {
    if (global.rest.some((a) => a.startsWith("-") && a !== "-h" && a !== "-v")) {
      throw usageError(`Unknown option: ${global.rest.find((a) => a.startsWith("-") && a !== "-h" && a !== "-v")}`);
    }
    if (global.flags.version && !command) {
      const pin = safePin();
      if (json) printJson({ ok: true, version: CUTSCENE_VERSION, engine: pin });
      else process.stdout.write(`cutscene ${CUTSCENE_VERSION} (engine ${pin})\n`);
      return EXIT.OK;
    }
    if (!command || command === "help" || (global.flags.help && !command)) {
      if (json) printJson({ ok: true, version: CUTSCENE_VERSION, commands: ["doctor", "setup", "preview", ...PARTS, ...Object.keys(ENGINE_COMMANDS)] });
      else process.stdout.write(HELP);
      return command || global.flags.help ? EXIT.OK : argv.length ? EXIT.USAGE : EXIT.OK;
    }

    const dd = after.indexOf("--");
    if ((dd < 0 ? after : after.slice(0, dd)).includes("--json")) json = true;
    if (PARTS.includes(command)) return await dispatchPart(command, json ? withJson(after) : after);
    if (command === "preview") return await dispatchPreview(json ? withJson(after) : after);

    const local = takeFlags(after, ["json", "yes"]);
    json = json || local.flags.json;
    const yes = global.flags.yes || local.flags.yes;

    if (command in BLOCKED) {
      throw new CutsceneError("COMMAND_NOT_AVAILABLE", `\`cutscene ${command}\` isn't part of Cutscene. ${BLOCKED[command]}`, { hint: "Run `cutscene help` to see what Cutscene can do.", exitCode: EXIT.USAGE });
    }
    if (command === "doctor") {
      const { runDoctor } = await import("./doctor.mjs");
      return await runDoctor(local.rest, { json });
    }
    if (command === "setup") {
      const { runSetup } = await import("./setup.mjs");
      return await runSetup(local.rest, { json, yes });
    }
    if (command in ENGINE_COMMANDS) return await engineCommand(command, local.rest, { json, yes });

    throw usageError(`Cutscene has no command called "${command}".`);
  } catch (err) {
    if (json) printJson(errorToEnvelope(err));
    else printHumanError(err);
    return exitCodeOf(err);
  }
}

if (isMainModule(import.meta.url)) {
  // A reader that stops early (`cutscene catalog | head`) isn't an error.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EPIPE") process.exit(process.exitCode ?? EXIT.OK);
      throw err;
    });
  }
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      printHumanError(err);
      process.exitCode = EXIT.FAIL;
    },
  );
}
