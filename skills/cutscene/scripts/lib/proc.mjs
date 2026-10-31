// Built from src/skills/cutscene/scripts/lib/proc.mts by `npm run build`. Edit that file, not this one.
// Running child processes the Cutscene way:
// - windowsHide on every spawn, so no console windows flash up on Windows;
// - never detached: a detached process on Windows has no console, so every grandchild it
//   starts (Chrome, FFmpeg, Python) would open its own visible terminal window;
// - whole process trees are stopped with `taskkill /T /F` on Windows.
import { spawn, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
/** Stop a process and everything it started. */
export function killTree(pid, signal = "SIGTERM") {
    if (!pid)
        return;
    if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        return;
    }
    try {
        process.kill(pid, signal);
    }
    catch {
        // already gone
    }
}
/**
 * Run a command and wait for it. Output can be inherited, captured, or streamed to callbacks.
 * Ctrl+C (and the parent exiting) stops the whole child tree.
 */
export function run(command, args, opts = {}) {
    const { cwd, env, stdin = "ignore", stdout = "pipe", stderr = "pipe", onStdout, onStderr, input, timeoutMs } = opts;
    return new Promise((resolvePromise) => {
        let child;
        try {
            child = spawn(command, args, {
                cwd,
                env,
                stdio: [input !== undefined ? "pipe" : stdin, stdout, stderr],
                windowsHide: true,
                detached: false,
                shell: false,
            });
        }
        catch (error) {
            resolvePromise({ code: 1, signal: null, stdout: "", stderr: "", timedOut: false, error: error });
            return;
        }
        const out = [];
        const err = [];
        let timedOut = false;
        let timer = null;
        const stop = () => killTree(child.pid);
        const onSignal = () => stop();
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);
        process.once("exit", stop);
        if (timeoutMs) {
            timer = setTimeout(() => {
                timedOut = true;
                stop();
            }, timeoutMs);
        }
        if (child.stdout) {
            child.stdout.on("data", (c) => {
                out.push(c);
                if (onStdout)
                    onStdout(c);
            });
        }
        if (child.stderr) {
            child.stderr.on("data", (c) => {
                err.push(c);
                if (onStderr)
                    onStderr(c);
            });
        }
        if (input !== undefined && child.stdin) {
            child.stdin.end(input);
        }
        let spawnError;
        child.on("error", (e) => {
            spawnError = e;
        });
        child.on("close", (code, signal) => {
            if (timer)
                clearTimeout(timer);
            process.removeListener("SIGINT", onSignal);
            process.removeListener("SIGTERM", onSignal);
            process.removeListener("exit", stop);
            resolvePromise({
                code: spawnError ? 1 : (code ?? (signal ? 1 : 0)),
                signal,
                stdout: Buffer.concat(out).toString("utf8"),
                stderr: Buffer.concat(err).toString("utf8"),
                timedOut,
                ...(spawnError ? { error: spawnError } : {}),
            });
        });
    });
}
/**
 * Run a quick command synchronously and return its output (for version probes).
 * Never throws; `ok` is false when the program is missing or fails.
 */
export function probe(command, args, { timeoutMs = 15_000, env, cwd } = {}) {
    try {
        const r = spawnSync(command, args, {
            encoding: "utf8",
            windowsHide: true,
            timeout: timeoutMs,
            env,
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 16 * 1024 * 1024,
        });
        if (r.error)
            return { ok: false, code: null, stdout: "", stderr: "", error: r.error };
        return { ok: r.status === 0, code: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
    }
    catch (error) {
        return { ok: false, code: null, stdout: "", stderr: "", error };
    }
}
/** Find a program on PATH (like `where`/`which`), without running a shell. */
export function findOnPath(name, env = process.env) {
    const win = process.platform === "win32";
    const dirs = (env.PATH || env.Path || "").split(win ? ";" : ":").filter(Boolean);
    const exts = win && !/\.[a-z0-9]+$/i.test(name) ? (env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
    for (const dir of dirs) {
        for (const ext of exts) {
            const candidate = join(dir.replace(/^"|"$/g, ""), name + ext.toLowerCase());
            if (isFile(candidate))
                return candidate;
        }
    }
    return null;
}
function isFile(p) {
    try {
        return statSync(p).isFile();
    }
    catch {
        return false;
    }
}
