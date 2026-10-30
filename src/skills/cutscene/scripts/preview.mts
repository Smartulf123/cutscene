#!/usr/bin/env node
// `cutscene preview`: open a video project in Cutscene Studio.
//
//   node preview.mjs [projectDir] [--port 3002] [--background | --status | --stop [--all] | --list]
//                    [--no-open] [--json]
//
// Starts the engine's Studio on a hidden loopback address and serves it through Cutscene's
// front door on http://127.0.0.1:<port> (contracts §5). The front door pins the Host header,
// accepts changes only from its own page, refuses to be framed by other sites and shows
// Cutscene's look. It never listens on anything but 127.0.0.1.
//
// Built on HyperFrames, an open-source framework by HeyGen (Apache-2.0). Cutscene is
// independent and not affiliated with HeyGen.
//
// Node built-ins only.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, appendFileSync, mkdirSync } from "node:fs";
import type { Stats } from "node:fs";
import type { Server } from "node:http";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { isNetworkPath } from "./lib/paths.mjs";
import { CutsceneError, EXIT, errorToEnvelope, exitCodeOf, printJson } from "./lib/json.mjs";
import type { CodedError } from "./lib/json.mjs";
import { writeFileAtomic } from "./lib/atomic.mjs";
import { createFrontDoor } from "./preview/frontdoor.mjs";
import type { Upstream } from "./preview/frontdoor.mjs";
import { startStudio, killChildTree, killPidTree } from "./preview/engine.mjs";
import type { Studio } from "./preview/engine.mjs";
import {
  DEFAULT_PORT,
  stateDir,
  logPathFor,
  writeState,
  readState,
  removeState,
  listStates,
  liveness,
  pidAlive,
  sameDir,
  previewUrl,
  safeOpenUrl,
  openBrowser,
} from "./preview/state.mjs";
import type { PreviewProject, PreviewState } from "./preview/state.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);
/** How many ports after the default to try when it's taken (only without --port). */
const PORT_SCAN = 10;

/** The parsed command line. */
export interface PreviewOptions {
  project: string | undefined;
  port: number;
  explicitPort: boolean;
  background: boolean;
  status: boolean;
  stop: boolean;
  list: boolean;
  all: boolean;
  open: boolean;
  json: boolean;
  help: boolean;
  serveChild: boolean;
  readyFile: string | undefined;
  instance: string | undefined;
}

/** What the preview tells users and scripts about a running preview. */
export interface PreviewInfo {
  url: string;
  pid: number;
  port: number;
  project: PreviewProject;
  mode: PreviewState["mode"];
  log: string;
  reused?: boolean;
  state?: string;
}

/** A preview whose state file is backed by a live process. */
type RunningPreview = PreviewState & { state: "running" | "starting" };

/** What the background server writes to its ready file. */
type ReadyReport = ({ ok: true } & PreviewInfo) | { ok: false; error?: { code?: string; message?: string; hint?: string } };

// ---------------------------------------------------------------------------- arguments

const USAGE = `Usage: cutscene preview [project folder] [options]

Opens the project in Cutscene Studio on http://127.0.0.1:${DEFAULT_PORT}.

Options:
  --port <n>      Port for the preview (default ${DEFAULT_PORT})
  --background    Keep it running in the background and return right away
  --status        Show whether the preview for this project is running
  --stop          Stop the preview for this project (add --all to stop every preview)
  --list          List every running preview
  --no-open       Don't open the browser
  --json          Print one JSON object instead of text`;

/** Parse the command line. Throws a usage error (exit code 2) for anything unexpected. */
export function parseArgs(argv: string[]): PreviewOptions {
  const opts: PreviewOptions = {
    project: undefined,
    port: DEFAULT_PORT,
    explicitPort: false,
    background: false,
    status: false,
    stop: false,
    list: false,
    all: false,
    open: true,
    json: false,
    help: false,
    serveChild: false,
    readyFile: undefined,
    instance: undefined,
  };
  const takeValue = (i: number, name: string): [string, number] => {
    const a = argv[i];
    if (a.includes("=")) return [a.slice(a.indexOf("=") + 1), i];
    if (i + 1 >= argv.length) throw usage(`--${name} needs a value.`);
    return [argv[i + 1], i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" || a.startsWith("--port=")) {
      let v: string;
      [v, i] = takeValue(i, "port");
      if (!/^\d{1,5}$/.test(String(v)) || Number(v) < 1024 || Number(v) > 65535) {
        throw usage(`"${v}" isn't a usable port. Pick a number from 1024 to 65535.`);
      }
      opts.port = Number(v);
      opts.explicitPort = true;
    } else if (a === "--background") opts.background = true;
    else if (a === "--status") opts.status = true;
    else if (a === "--stop") opts.stop = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--all") opts.all = true;
    else if (a === "--no-open") opts.open = false;
    else if (a === "--open") opts.open = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--serve-child") opts.serveChild = true;
    else if (a === "--ready-file" || a.startsWith("--ready-file=")) [opts.readyFile, i] = takeValue(i, "ready-file");
    else if (a === "--instance" || a.startsWith("--instance=")) [opts.instance, i] = takeValue(i, "instance");
    else if (a.startsWith("-")) throw usage(`Unknown option ${a}.`);
    else if (opts.project === undefined) opts.project = a;
    else throw usage(`Only one project folder, please (got "${opts.project}" and "${a}").`);
  }
  const actions = [opts.background, opts.status, opts.stop, opts.list].filter(Boolean).length;
  if (actions > 1) throw usage("Use only one of --background, --status, --stop and --list.");
  if (opts.all && !opts.stop) throw usage("--all only goes with --stop.");
  return opts;
}

function usage(message: string): CutsceneError {
  return new CutsceneError("USAGE", message, { hint: "Run `cutscene preview --help` to see the options.", exitCode: EXIT.USAGE });
}

/** The project folder: must be a local folder holding an engine project (index.html). */
export function resolveProject(arg: string | undefined, cwd: string = process.cwd()): PreviewProject {
  const raw = arg === undefined || arg === "" ? cwd : arg;
  if (isNetworkPath(raw)) {
    throw new CutsceneError("NETWORK_PATH", `Cutscene doesn't work with network paths (${raw}).`, {
      hint: "Copy the project to a folder on this computer and preview it from there.",
    });
  }
  const dir = resolve(cwd, raw);
  let st: Stats;
  try {
    st = statSync(dir);
  } catch {
    throw new CutsceneError("PROJECT_NOT_FOUND", `There's no folder at ${dir}.`, {
      hint: "Check the path, or make a new project with `cutscene init <name>`.",
    });
  }
  if (!st.isDirectory()) {
    throw new CutsceneError("PROJECT_NOT_FOUND", `${dir} is a file, not a project folder.`, {
      hint: "Pass the folder that holds the project's index.html.",
    });
  }
  if (!existsSync(join(dir, "index.html"))) {
    throw new CutsceneError("NOT_A_PROJECT", `${dir} isn't a Cutscene video project (it has no index.html).`, {
      hint: "Make one with `cutscene init <name>`, or pass the project folder.",
    });
  }
  return { dir, name: basename(dir) };
}

// ------------------------------------------------------------------------------- output

function say(opts: { json: boolean }, line: string = ""): void {
  if (!opts.json) process.stdout.write(line + "\n");
}

function publicInfo(state: PreviewState, extra: { reused?: boolean; state?: string } = {}): PreviewInfo {
  return {
    url: state.url,
    pid: state.pid,
    port: state.port,
    project: state.project,
    mode: state.mode,
    log: state.log,
    ...extra,
  };
}

function printStarted(opts: PreviewOptions, info: PreviewInfo): void {
  if (opts.json) return printJson({ ok: true, ...info });
  say(opts, info.reused ? "Cutscene Studio is already running for this project." : "Cutscene Studio is running.");
  say(opts, `  Project  ${info.project.name}  (${info.project.dir})`);
  say(opts, `  Open     ${info.url}`);
  if (info.mode === "background") {
    say(opts, `  Stop     cutscene preview --stop --port ${info.port}`);
  } else if (!info.reused) {
    say(opts, "Edits to the project show up live. Press Ctrl+C to stop.");
  }
}

// ---------------------------------------------------------------------- finding previews

/** Running previews (state files whose front door answers). Prunes files of dead ones. */
async function runningPreviews(env: NodeJS.ProcessEnv = process.env): Promise<RunningPreview[]> {
  const out: RunningPreview[] = [];
  for (const s of listStates(env)) {
    const live = await liveness(s);
    if (live === "gone") {
      removeState(s.port, s.instance, env);
      continue;
    }
    out.push({ ...s, state: live });
  }
  return out;
}

/** Which previews --status/--stop act on. */
async function selectTargets(opts: PreviewOptions): Promise<RunningPreview[]> {
  const running = await runningPreviews();
  if (opts.all) return running;
  if (opts.explicitPort) return running.filter((s) => s.port === opts.port);
  const dir = resolve(process.cwd(), opts.project ?? ".");
  const mine = running.filter((s) => sameDir(s.project.dir, dir));
  if (mine.length || opts.project !== undefined) return mine;
  // Run from somewhere else with no project named: if exactly one preview runs, that's the one.
  return running.length === 1 ? running : [];
}

// -------------------------------------------------------------------------- status/list/stop

async function cmdStatus(opts: PreviewOptions): Promise<void> {
  const targets = await selectTargets(opts);
  if (!targets.length) {
    if (opts.json) return printJson({ ok: true, running: false });
    say(opts, "No Cutscene preview is running for this project.");
    const others = (await runningPreviews()).length;
    if (others) say(opts, `${others} other preview${others === 1 ? " is" : "s are"} running: see \`cutscene preview --list\`.`);
    return;
  }
  const s = targets[0];
  if (opts.json) return printJson({ ok: true, running: s.state === "running", state: s.state, ...publicInfo(s) });
  say(opts, s.state === "running" ? "Cutscene Studio is running." : "Cutscene Studio is starting.");
  say(opts, `  Project  ${s.project.name}  (${s.project.dir})`);
  say(opts, `  Open     ${s.url}`);
  say(opts, `  Mode     ${s.mode} (process ${s.pid})`);
}

async function cmdList(opts: PreviewOptions): Promise<void> {
  const running = await runningPreviews();
  if (opts.json) return printJson({ ok: true, previews: running.map((s) => publicInfo(s, { state: s.state })) });
  if (!running.length) return say(opts, "No Cutscene previews are running.");
  say(opts, `${running.length} Cutscene preview${running.length === 1 ? "" : "s"} running:`);
  for (const s of running) say(opts, `  ${s.url}  ${s.project.name}  (${s.mode}, process ${s.pid})`);
}

/** Stop one preview and wait until its processes are gone. */
export async function stopPreview(s: PreviewState, { timeoutMs = 10_000 }: { timeoutMs?: number } = {}): Promise<boolean> {
  const posix = process.platform !== "win32";
  killPidTree(s.pid, { group: posix && s.mode === "background" });
  if (s.enginePid) killPidTree(s.enginePid, { group: posix });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && (pidAlive(s.pid) || (s.enginePid && pidAlive(s.enginePid)))) {
    await sleep(150);
  }
  removeState(s.port, s.instance);
  return !pidAlive(s.pid) && !(s.enginePid && pidAlive(s.enginePid));
}

async function cmdStop(opts: PreviewOptions): Promise<void> {
  const targets = await selectTargets(opts);
  const stopped: { port: number; pid: number; project: PreviewProject; stopped: boolean }[] = [];
  for (const s of targets) {
    const ok = await stopPreview(s);
    stopped.push({ port: s.port, pid: s.pid, project: s.project, stopped: ok });
  }
  const failed = stopped.filter((s) => !s.stopped);
  if (failed.length) {
    throw new CutsceneError("STOP_FAILED", `Cutscene couldn't stop the preview on port ${failed[0].port}.`, {
      hint: `End process ${failed[0].pid} in Task Manager (or with \`taskkill /T /F /PID ${failed[0].pid}\`).`,
    });
  }
  if (opts.json) return printJson({ ok: true, stopped });
  if (!stopped.length) return say(opts, "No Cutscene preview is running for this project.");
  for (const s of stopped) say(opts, `Stopped the preview of ${s.project.name} (port ${s.port}).`);
}

// --------------------------------------------------------------------------------- start

/** A preview already running for this project, or null. */
async function findReusable(project: PreviewProject): Promise<RunningPreview | null> {
  const running = await runningPreviews();
  return running.find((s) => s.state === "running" && sameDir(s.project.dir, project.dir)) || null;
}

/** Listen on 127.0.0.1 — the only interface the front door ever uses. */
function listenLoopback(server: Server, port: number): Promise<void> {
  return new Promise((resolveListen, reject) => {
    const onError = (err: Error) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port, exclusive: true });
  });
}

/**
 * Run the preview in this process: front door + Studio. Resolves once it's ready, with the
 * public info; the process then keeps serving until stopped.
 */
async function serve(opts: PreviewOptions, project: PreviewProject, { mode }: { mode: PreviewState["mode"] }): Promise<PreviewInfo> {
  const instance = opts.instance || randomUUID();
  let upstream: Upstream | null = null;
  let logFile: string | null = null;
  const log = (line: string) => {
    if (!logFile) return;
    try {
      appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
    } catch {
      // logging is best effort
    }
  };

  // Claim the port first, so two starts can't race for it.
  const candidates = opts.explicitPort
    ? [opts.port]
    : Array.from({ length: PORT_SCAN }, (_, i) => DEFAULT_PORT + i);
  let server: Server | null = null;
  let port: number | null = null;
  for (const p of candidates) {
    const other = readState(p);
    if (other && (await liveness(other)) !== "gone") {
      if (opts.explicitPort) {
        throw new CutsceneError("PORT_IN_USE", `Port ${p} is already used by the Cutscene preview of ${other.project.name}.`, {
          hint: `Stop it with \`cutscene preview --stop --port ${p}\`, or pick another port with --port.`,
        });
      }
      continue;
    }
    const candidate = createFrontDoor({
      port: p,
      upstream: () => upstream,
      health: () => ({ instance, project: project.name }),
      log,
    });
    try {
      await listenLoopback(candidate, p);
      server = candidate;
      port = p;
      break;
    } catch (err) {
      if ((err as CodedError).code !== "EADDRINUSE" && (err as CodedError).code !== "EACCES") throw err;
      if (opts.explicitPort) {
        throw new CutsceneError("PORT_IN_USE", `Port ${p} is already in use by another program.`, {
          hint: "Close that program, or pick another port with --port (for example --port 3010).",
        });
      }
    }
  }
  if (!server) {
    throw new CutsceneError("PORT_IN_USE", `Ports ${candidates[0]}–${candidates[candidates.length - 1]} are all in use.`, {
      hint: "Stop a preview you don't need (`cutscene preview --list`), or pick a port with --port.",
    });
  }

  logFile = logPathFor(port!);
  mkdirSync(stateDir(), { recursive: true });
  const state: PreviewState = {
    version: 1,
    port: port!,
    url: previewUrl(port!, project.name),
    pid: process.pid,
    instance,
    mode,
    project,
    ready: false,
    startedAt: new Date().toISOString(),
    log: logFile,
  };
  writeState(state);
  log(`front door listening on 127.0.0.1:${port} for ${project.dir}`);

  let studio: Studio | null = null;
  let shuttingDown = false;
  const shutdown = (code: number, message?: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (message) {
      log(message);
      if (mode === "foreground" && !opts.json) process.stderr.write(message + "\n");
    }
    if (studio) killChildTree(studio.child);
    removeState(port!, instance);
    server!.close();
    setTimeout(() => process.exit(code), 200).unref();
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
    process.on(sig, () => shutdown(0, mode === "foreground" ? "Stopping Cutscene Studio." : `stopped by ${sig}`));
  }
  process.on("exit", () => {
    if (studio) killChildTree(studio.child);
    removeState(port!, instance);
  });

  try {
    studio = await startStudio({ projectDir: project.dir, logPath: logFile, log });
  } catch (err) {
    removeState(port!, instance);
    server.close();
    throw err;
  }
  upstream = { host: studio.host, port: studio.port };
  studio.child.on("exit", (code) => shutdown(1, `The Studio stopped unexpectedly (exit code ${code}). Log: ${logFile}`));

  Object.assign(state, {
    ready: true,
    enginePid: studio.pid,
    engineHost: studio.host,
    enginePort: studio.port,
  });
  writeState(state);
  log(`ready: ${state.url} (Studio pid ${studio.pid} on ${studio.host}:${studio.port})`);
  return publicInfo(state, { reused: false });
}

async function cmdStart(opts: PreviewOptions): Promise<void> {
  const project = resolveProject(opts.project);
  const existing = await findReusable(project);
  if (existing) {
    const info = publicInfo(existing, { reused: true });
    printStarted(opts, info);
    if (opts.open) openBrowser(safeOpenUrl(existing.port, existing.project.name));
    return;
  }
  const info = await serve(opts, project, { mode: "foreground" });
  printStarted(opts, info);
  if (opts.open) openBrowser(safeOpenUrl(info.port, info.project.name));
  // Keep serving until Ctrl+C or --stop.
  await new Promise(() => {});
}

/** --background: start a hidden copy of this script that serves, wait until it's ready. */
async function cmdBackground(opts: PreviewOptions): Promise<void> {
  const project = resolveProject(opts.project);
  const existing = await findReusable(project);
  if (existing) {
    const info = publicInfo(existing, { reused: true });
    printStarted(opts, info);
    if (opts.open) openBrowser(safeOpenUrl(existing.port, existing.project.name));
    return;
  }
  const instance = randomUUID();
  mkdirSync(stateDir(), { recursive: true });
  const readyFile = join(stateDir(), `.start-${instance}.json`);
  const args = [THIS_FILE, project.dir, "--serve-child", "--ready-file", readyFile, "--instance", instance];
  if (opts.explicitPort) args.push("--port", String(opts.port));
  // Windows: `detached` is required, or Node's kill-on-close job object ends the server the
  // moment this launcher exits. A detached process has no console, which is only a problem for
  // console programs it starts without windowsHide: the server starts exactly two (the engine
  // and taskkill), both with windowsHide and no inherited handles, so Windows gives them a
  // hidden console and nothing they start shows a window. macOS/Linux: its own session.
  const child = spawn(process.execPath, args, {
    cwd: project.dir,
    stdio: "ignore",
    windowsHide: true,
    detached: true,
  });
  child.on("error", () => {});
  child.unref();

  const deadline = Date.now() + 150_000;
  let result: ReadyReport | null = null;
  while (Date.now() < deadline) {
    if (existsSync(readyFile)) {
      try {
        result = JSON.parse(readFileSync(readyFile, "utf8"));
        break;
      } catch {
        // still being written
      }
    }
    if (child.exitCode !== null || (child.pid && !pidAlive(child.pid))) {
      await sleep(300);
      if (existsSync(readyFile)) continue;
      throw new CutsceneError("STUDIO_START_FAILED", "The background preview stopped before it was ready.", {
        hint: `Run \`cutscene preview\` without --background to see what goes wrong. Logs are in ${stateDir()}.`,
      });
    }
    await sleep(200);
  }
  rmSync(readyFile, { force: true });
  if (!result) {
    killPidTree(child.pid, { group: process.platform !== "win32" });
    throw new CutsceneError("STUDIO_TIMEOUT", "The background preview took too long to start.", {
      hint: `Try again. Logs are in ${stateDir()}.`,
    });
  }
  if (!result.ok) {
    const e = result.error || {};
    throw new CutsceneError(e.code || "STUDIO_START_FAILED", e.message || "The background preview couldn't start.", {
      hint: e.hint || "",
    });
  }
  const { ok: _ok, ...info } = result;
  printStarted(opts, info);
  if (opts.open) openBrowser(safeOpenUrl(info.port, info.project.name));
}

/** The hidden background server: serve, report through the ready file, keep running. */
async function cmdServeChild(opts: PreviewOptions): Promise<void> {
  const report = (obj: unknown) => {
    if (opts.readyFile) writeFileAtomic(opts.readyFile, JSON.stringify(obj));
  };
  try {
    const project = resolveProject(opts.project);
    const info = await serve(opts, project, { mode: "background" });
    report({ ok: true, ...info });
  } catch (err) {
    report(errorToEnvelope(err));
    process.exit(exitCodeOf(err));
  }
  await new Promise(() => {});
}

// ---------------------------------------------------------------------------------- main

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let opts: PreviewOptions | { json: boolean; help?: undefined } = { json: argv.includes("--json") };
  try {
    opts = parseArgs(argv);
    if (opts.help) {
      process.stdout.write(USAGE + "\n");
      return EXIT.OK;
    }
    if (opts.serveChild) await cmdServeChild(opts);
    else if (opts.list) await cmdList(opts);
    else if (opts.status) await cmdStatus(opts);
    else if (opts.stop) await cmdStop(opts);
    else if (opts.background) await cmdBackground(opts);
    else await cmdStart(opts);
    return EXIT.OK;
  } catch (err) {
    if (opts.json) printJson(errorToEnvelope(err));
    else {
      const env = errorToEnvelope(err);
      process.stderr.write(`Error: ${env.error.message}\n`);
      if (env.error.hint) process.stderr.write(`Fix: ${env.error.hint}\n`);
      if (err && (err as CodedError).code === "USAGE") process.stderr.write("\n" + USAGE + "\n");
    }
    return exitCodeOf(err);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  main().then((code) => {
    process.exitCode = code;
  });
}
