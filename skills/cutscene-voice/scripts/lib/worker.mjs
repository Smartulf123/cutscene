// Built from src/skills/cutscene-voice/scripts/lib/worker.mts by `npm run build`. Edit that file, not this one.
// Start the Python worker inside the voice environment and collect its JSON result.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cutsceneHome, voicePaths, WORKER } from "./paths.mjs";
import { run } from "./proc.mjs";
import { VoiceError } from "./util.mjs";
/** Environment for every worker run: models stay inside <home>/voice, no telemetry, offline by default. */
export function workerEnv(home, { offline = true, base = process.env } = {}) {
    const vp = voicePaths(home);
    const env = { ...base };
    for (const k of Object.keys(env))
        if (/^PYTHON/i.test(k) || k === "VIRTUAL_ENV")
            delete env[k];
    Object.assign(env, {
        HF_HOME: vp.hfHome,
        HF_HUB_DISABLE_TELEMETRY: "1",
        HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
        HF_HUB_DISABLE_PROGRESS_BARS: "1",
        HF_HUB_OFFLINE: offline ? "1" : "0",
        TRANSFORMERS_OFFLINE: offline ? "1" : "0",
        TRANSFORMERS_NO_ADVISORY_WARNINGS: "1",
        TOKENIZERS_PARALLELISM: "false",
        GRADIO_ANALYTICS_ENABLED: "False",
        DO_NOT_TRACK: "1",
        PYTHONNOUSERSITE: "1",
    });
    return env;
}
let jobCounter = 0;
/**
 * Run one worker task.
 * @param task probe | download | omnivoice | voxcpm | whisper
 * @param job task fields
 * @returns the worker's result (ok: true)
 */
export async function runWorker(task, job, opts = {}) {
    const home = opts.home || cutsceneHome();
    const vp = voicePaths(home);
    if (!existsSync(vp.python)) {
        throw new VoiceError("VOICE_ENV_MISSING", "Cutscene's voice environment isn't set up yet.", "Run `cutscene voice setup` (it shows what it downloads and asks first).");
    }
    mkdirSync(vp.jobs, { recursive: true });
    mkdirSync(vp.logs, { recursive: true });
    const stamp = `${task}-${Date.now()}-${process.pid}-${jobCounter++}`;
    const jobFile = join(vp.jobs, `${stamp}.json`);
    const resultFile = join(vp.jobs, `${stamp}.result.json`);
    writeFileSync(jobFile, JSON.stringify({ ...job, task, result: resultFile }), "utf8");
    const logFile = join(vp.logs, `voice-${task}.log`);
    writeFileSync(logFile, `# cutscene voice worker: ${task} ${new Date().toISOString()}\n`, "utf8");
    const res = await run(vp.python, ["-I", "-X", "utf8", WORKER, jobFile], {
        env: workerEnv(home, { offline: opts.offline !== false }),
        timeoutMs: opts.timeoutMs ?? 6 * 60 * 60 * 1000,
        onStderrLine: (line) => {
            if (line.startsWith("CUTSCENE_PROGRESS ")) {
                try {
                    opts.onProgress?.(JSON.parse(line.slice(18)));
                }
                catch {
                    /* ignore a broken progress line */
                }
            }
            else if (line.trim()) {
                try {
                    appendFileSync(logFile, line + "\n");
                }
                catch {
                    /* logging is best effort */
                }
            }
        },
    });
    let result = null;
    try {
        result = JSON.parse(readFileSync(resultFile, "utf8"));
    }
    catch {
        /* no result file: the worker crashed before writing it */
    }
    rmSync(jobFile, { force: true });
    rmSync(resultFile, { force: true });
    if (res.timedOut)
        throw new VoiceError("WORKER_TIMEOUT", `The voice worker (${task}) ran too long and was stopped.`, `See ${logFile}.`);
    if (!result) {
        const tail = res.stderr.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("CUTSCENE_PROGRESS")).slice(-4).join(" | ");
        throw new VoiceError("WORKER_CRASHED", `The voice worker (${task}) stopped without a result${tail ? `: ${tail}` : "."}`, `See ${logFile}. Run \`cutscene voice setup --yes\` to repair the environment.`);
    }
    if (!result.ok) {
        const e = result.error || {};
        throw new VoiceError(e.code || "WORKER_FAILED", e.message || "The voice worker failed.", e.hint ? `${e.hint} Log: ${logFile}` : `See ${logFile}.`);
    }
    return result;
}
