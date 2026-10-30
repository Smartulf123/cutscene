// Built from src/skills/cutscene/scripts/preview/engine.mts by `npm run build`. Edit that file, not this one.
// Starts the engine's Studio on a hidden loopback address for the preview front door.
// Node built-ins only.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, createWriteStream, mkdirSync } from "node:fs";
import net from "node:net";
import http from "node:http";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import { cutsceneHome } from "../lib/paths.mjs";
import { readPin, engineCliPath as foundationEngineCliPath, engineEnv as foundationEngineEnv } from "../lib/engine.mjs";
import { CutsceneError } from "../lib/json.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const WATCHDOG = join(HERE, "watchdog.mjs");
/** The pinned engine version (skills/cutscene/engine.json), or null when it can't be read. */
export function enginePin() {
    try {
        return readPin();
    }
    catch {
        return null;
    }
}
/** Absolute path of the pinned engine's CLI entry (`dist/cli.js`), or null when it isn't installed. */
export function engineCliPath(env = process.env) {
    const pin = enginePin();
    if (!pin)
        return null;
    const cli = foundationEngineCliPath(pin, cutsceneHome(env));
    return existsSync(cli) ? cli : null;
}
/** The engine environment from contracts §3, plus the hidden bind address. */
export function engineEnv({ env = process.env, bindHost, watchPid } = {}) {
    const home = cutsceneHome(env);
    const out = foundationEngineEnv({ pin: enginePin() || "", home, env });
    out.CUTSCENE_HOME = home;
    // Never pass on a LAN bind someone set for the stock preview.
    delete out.HYPERFRAMES_PREVIEW_HOST;
    if (bindHost)
        out.HYPERFRAMES_PREVIEW_HOST = bindHost;
    if (watchPid)
        out.CUTSCENE_PREVIEW_WATCH_PID = String(watchPid);
    return out;
}
/** Try to listen on host:port (0 = any). Resolves the bound port, or null when it can't. */
export function tryListen(host, port) {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.unref();
        srv.once("error", () => resolve(null));
        srv.listen({ host, port, exclusive: true }, () => {
            const p = srv.address().port;
            srv.close(() => resolve(p));
        });
    });
}
/**
 * A hidden loopback address for the Studio. On Windows and Linux every 127.x.y.z address is
 * loopback, so a random one plus a random port means a web page can't find the Studio by
 * scanning 127.0.0.1, and DNS rebinding can't reach it. macOS only has 127.0.0.1.
 */
export async function pickHiddenAddress({ platform = process.platform } = {}) {
    if (platform !== "darwin") {
        for (let i = 0; i < 8; i++) {
            const host = `127.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(2, 255)}`;
            const port = await tryListen(host, 0);
            if (port)
                return { host, port };
        }
    }
    const port = await tryListen("127.0.0.1", 0);
    if (!port)
        throw new CutsceneError("NO_FREE_PORT", "Cutscene couldn't find a free port for the Studio.", {
            hint: "Close other local servers and try again.",
        });
    return { host: "127.0.0.1", port };
}
/** GET a path on the Studio with the Host header it expects. Resolves {status, body} or null. */
export function probe(host, port, path = "/__hyperframes_config", timeoutMs = 2000) {
    return new Promise((resolve) => {
        const req = http.get({ host, port, path, headers: { host: `${host}:${port}` }, timeout: timeoutMs, agent: false }, (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (c) => {
                if (body.length < 64 * 1024)
                    body += c;
            });
            res.on("end", () => resolve({ status: res.statusCode, body }));
            res.on("error", () => resolve(null));
        });
        req.on("error", () => resolve(null));
        req.on("timeout", () => {
            req.destroy();
            resolve(null);
        });
    });
}
/**
 * Start the engine's Studio for `projectDir` on a hidden loopback address.
 *
 * The engine runs with `windowsHide` and piped output, so on Windows it gets its own hidden
 * console: nothing it starts later (browsers for thumbnails, FFmpeg) can pop up a window.
 * A small watchdog preloaded into it ends it if this process dies.
 */
export async function startStudio({ projectDir, logPath, env = process.env, timeoutMs = 120_000, log = () => { } }) {
    const cli = engineCliPath(env);
    if (!cli) {
        throw new CutsceneError("ENGINE_MISSING", "The Cutscene engine isn't installed yet.", {
            hint: "Run `cutscene setup` (or `cutscene doctor` to see what's missing), then try again.",
        });
    }
    const hidden = await pickHiddenAddress();
    const args = [
        "--import",
        pathToFileURL(WATCHDOG).href,
        cli,
        "preview",
        projectDir,
        "--port",
        String(hidden.port),
        "--no-open",
        "--foreground",
        "--force-new",
        "--json",
    ];
    let logStream = null;
    if (logPath) {
        mkdirSync(dirname(logPath), { recursive: true });
        logStream = createWriteStream(logPath, { flags: "a" });
        logStream.write(`\n--- ${new Date().toISOString()} starting Studio for ${projectDir} on ${hidden.host}\n`);
    }
    const child = spawn(process.execPath, args, {
        cwd: projectDir,
        env: engineEnv({ env, bindHost: hidden.host, watchPid: process.pid }),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        // POSIX: its own process group, so stopping the preview can end everything it started.
        detached: process.platform !== "win32",
    });
    if (logStream) {
        child.stderr.pipe(logStream, { end: false });
    }
    else {
        child.stderr.resume();
    }
    return await new Promise((resolve, reject) => {
        let settled = false;
        let buffer = "";
        const finish = (err, value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (err) {
                killChildTree(child);
                reject(err);
            }
            else
                resolve(value);
        };
        const timer = setTimeout(() => {
            finish(new CutsceneError("STUDIO_TIMEOUT", "The Studio took too long to start.", {
                hint: `Try again. If it keeps happening, look at the log: ${logPath || "(no log)"}`,
            }));
        }, timeoutMs);
        timer.unref();
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", async (chunk) => {
            if (logStream)
                logStream.write(chunk);
            if (settled)
                return;
            buffer += chunk;
            let nl;
            while ((nl = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                const ready = parseReadyLine(line);
                if (!ready)
                    continue;
                if (!ready.ok) {
                    finish(new CutsceneError("STUDIO_START_FAILED", `The Studio couldn't start: ${ready.message}`, {
                        hint: `Check that the folder is a Cutscene project (made with \`cutscene init\`). Log: ${logPath || "(no log)"}`,
                    }));
                    return;
                }
                // Make sure it answers where we think it is.
                const port = ready.port || hidden.port;
                for (let i = 0; i < 40 && !settled; i++) {
                    const res = await probe(hidden.host, port);
                    if (res && res.status === 200) {
                        log(`Studio answering on ${hidden.host}:${port}`);
                        return finish(null, { child, host: hidden.host, port, pid: child.pid });
                    }
                    await new Promise((r) => setTimeout(r, 250));
                }
                return finish(new CutsceneError("STUDIO_START_FAILED", "The Studio started but doesn't answer.", {
                    hint: `Try again. Log: ${logPath || "(no log)"}`,
                }));
            }
        });
        child.on("error", (err) => finish(new CutsceneError("STUDIO_START_FAILED", `The Studio couldn't start: ${err.message}`, {
            hint: "Run `cutscene doctor` to check the engine.",
        })));
        child.on("exit", (code) => finish(new CutsceneError("STUDIO_START_FAILED", `The Studio stopped while starting (exit code ${code}).`, {
            hint: `Check that the folder is a Cutscene project. Log: ${logPath || "(no log)"}`,
        })));
    });
}
/**
 * Read the engine's `--json` lifecycle line. Returns {ok:true, port} for a started server,
 * {ok:false, message} for a failure, or null for any other line.
 */
export function parseReadyLine(line) {
    if (!line || line[0] !== "{")
        return null;
    let obj;
    try {
        obj = JSON.parse(line);
    }
    catch {
        return null;
    }
    if (!obj || obj.operation !== "start")
        return null;
    if (obj.ok === true && obj.result && (obj.result.ready === true || obj.result.state === "started")) {
        const port = Number(obj.result.port);
        return { ok: true, port: Number.isInteger(port) ? port : null };
    }
    if (obj.ok === false) {
        const msg = (obj.error && (obj.error.message || obj.error.code)) || "unknown error";
        return { ok: false, message: String(msg) };
    }
    return null;
}
/** End a child process and everything it started. */
export function killChildTree(child) {
    if (!child || !child.pid)
        return;
    killPidTree(child.pid, { group: process.platform !== "win32" });
}
/**
 * End a process and all its descendants. Windows: `taskkill /T /F`. POSIX: the process group
 * when `group` is set (the process was started detached), else just the process.
 */
export function killPidTree(pid, { group = false } = {}) {
    if (!Number.isInteger(pid) || pid <= 0)
        return;
    if (process.platform === "win32") {
        try {
            spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore", windowsHide: true, timeout: 15_000 });
        }
        catch {
            // already gone, or taskkill missing
        }
        return;
    }
    try {
        process.kill(group ? -pid : pid, "SIGTERM");
    }
    catch {
        // already gone
    }
    const t = setTimeout(() => {
        try {
            process.kill(group ? -pid : pid, "SIGKILL");
        }
        catch {
            // already gone
        }
    }, 3000);
    t.unref();
}
