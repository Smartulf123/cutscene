// Calling the Cutscene engine (local transcription, Chrome path) through the `cutscene` CLI.
// Cutscene (Apache-2.0).
//
// Parts reach engine commands through CUTSCENE_CLI (contracts §3). When this script runs on its
// own (tests, or before the CLI is installed) it falls back to the pinned engine already
// installed under <CUTSCENE_HOME>/engine/<pin>/, with the same privacy environment.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EditError } from "./cli.mjs";
import { cutsceneHome } from "./paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The pinned engine version: CUTSCENE_ENGINE_VERSION, else skills/cutscene/engine.json. */
export function enginePin() {
  if (process.env.CUTSCENE_ENGINE_VERSION) return process.env.CUTSCENE_ENGINE_VERSION;
  const f = resolve(HERE, "../../../cutscene/engine.json");
  try {
    const j = JSON.parse(readFileSync(f, "utf8"));
    return String(j.hyperframes ?? j.engine ?? j.version ?? "0.8.162");
  } catch {
    return "0.8.162";
  }
}

/** The installed engine's entry file, or null. */
export function engineEntry() {
  const base = join(cutsceneHome(), "engine", enginePin(), "node_modules", "hyperframes");
  for (const f of [join(base, "dist", "cli.js"), join(base, "bin", "hyperframes.mjs")]) if (existsSync(f)) return f;
  return null;
}

/** The engine's own node_modules folder (for puppeteer-core), or null. */
export function engineModules() {
  const d = join(cutsceneHome(), "engine", enginePin(), "node_modules");
  return existsSync(d) ? d : null;
}

function engineEnv() {
  const pin = enginePin();
  return {
    ...process.env,
    HYPERFRAMES_SKIP_SKILLS: "1",
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_NO_TELEMETRY: "1",
    DO_NOT_TRACK: "1",
    HYPERFRAMES_CLIENT: process.env.HYPERFRAMES_CLIENT || "cutscene/0.1.0",
    HYPERFRAMES_SKILL_PKG_VERSION: pin,
    HYPERFRAMES_PLUGIN_VERSION: pin,
    HYPERFRAMES_MEDIA_HOME: join(cutsceneHome(), "media"),
  };
}

/**
 * How to run an engine command: through CUTSCENE_CLI when set, else the installed engine.
 * @param {boolean} [direct] skip the CLI (for engine commands it does not forward)
 */
export function engineRunner(direct = false) {
  const cli = process.env.CUTSCENE_CLI;
  if (!direct && cli && existsSync(cli)) return { argv: [cli], env: process.env, via: "cutscene" };
  const entry = engineEntry();
  if (entry) return { argv: [entry], env: engineEnv(), via: "engine" };
  return null;
}

/** True when transcription can run on this computer. */
export function canTranscribe() {
  return engineRunner() !== null;
}

/**
 * Transcribe a media file locally with the engine's `transcribe` (Parakeet or Whisper, on this
 * computer; no cloud).
 * @param {string} file
 * @param {{workDir: string, model?: string, language?: string, asr?: string, timeoutMs?: number}} o
 * @returns {{raw: any, info: any}}
 */
export function engineTranscribe(file, o) {
  const run = engineRunner();
  if (!run) throw new EditError("ENGINE_MISSING", "The Cutscene engine is not installed, so there is no local transcription yet.", "Run `cutscene setup` (it asks before downloading), then try again.");
  mkdirSync(o.workDir, { recursive: true });
  const args = [...run.argv, "transcribe", file, "--dir", o.workDir, "--json"];
  if (o.model) args.push("--model", o.model);
  if (o.language) args.push("--language", o.language);
  if (o.asr) args.push("--engine", o.asr);
  const r = spawnSync(process.execPath, args, { cwd: o.workDir, env: run.env, encoding: "utf8", windowsHide: true, maxBuffer: 1 << 28, timeout: o.timeoutMs ?? 3_600_000 });
  const lines = String(r.stdout ?? "").trim().split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  let info = null;
  for (const l of lines.reverse()) {
    try {
      info = JSON.parse(l);
      break;
    } catch {
      /* not JSON */
    }
  }
  const tPath = info?.transcriptPath && existsSync(info.transcriptPath) ? info.transcriptPath : join(o.workDir, "transcript.json");
  if (r.status !== 0 || !existsSync(tPath) || info?.ok === false) {
    const reason = info?.error?.message ?? info?.error ?? info?.reason ?? String(r.stderr ?? "").trim().split(/\r?\n/).slice(-2).join(" ");
    throw new EditError("TRANSCRIBE_FAILED", `Local transcription failed: ${reason || "no transcript was written"}.`, "Run `cutscene doctor` to check transcription; for a slow computer pass --model tiny.en or a longer --timeout.");
  }
  const raw = JSON.parse(readFileSync(tPath, "utf8"));
  return { raw, info: info ?? {} };
}

/** Remove a work folder (best effort). */
export function cleanWork(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * The Chrome the engine renders with: `browser path` (needed only for face tracking).
 * @returns {string|null}
 */
export function engineChrome() {
  for (const direct of [false, true]) {
    const run = engineRunner(direct);
    if (!run) continue;
    // Only ask where it is: installing the browser is a download, and that is `cutscene setup`'s job.
    const r = spawnSync(process.execPath, [...run.argv, "browser", "path"], { env: run.env, encoding: "utf8", windowsHide: true, timeout: 120_000 });
    if (r.status !== 0) continue;
    const exe = String(r.stdout).replace(/\x1b\[[0-9;]*m/g, "").trim().split(/\r?\n/).filter(Boolean).at(-1);
    if (exe && existsSync(exe.trim())) return exe.trim();
  }
  return null;
}
