// Built from src/skills/cutscene/scripts/lib/engine.mts by `npm run build`. Edit that file, not this one.
// The pinned video engine: where it lives, how to install it, and how to run it with
// Cutscene's settings (contracts §3). Other parts should normally go through the `cutscene`
// command (CUTSCENE_CLI); these helpers are for scripts that need finer control.
//
//   import { ensureEngine, runEngine } from "../../cutscene/scripts/lib/engine.mjs";
//   await ensureEngine();                                  // throws NEEDS_CONSENT if missing
//   const r = await runEngine(["check", dir, "--json"]);  // { code, stdout, stderr }
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CutsceneError } from "./json.mjs";
import { CUTSCENE_VERSION, ENGINE_JSON, cutsceneHome, engineDir, homePaths } from "./paths.mjs";
import { run } from "./proc.mjs";
export const ENGINE_PACKAGE = "hyperframes";
/** The engine's dependency lockfile, shipped next to engine.json. */
export const ENGINE_LOCK = join(dirname(ENGINE_JSON), "engine-lock.json");
/**
 * Cloud credentials the engine would use to send frames, images or audio to an online service
 * (vision descriptions, music or voice providers, HeyGen). Cutscene runs on this computer only,
 * so they are never passed to the engine.
 */
export const CLOUD_ENV = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "OPENROUTER_API_KEY",
    "ELEVENLABS_API_KEY",
    "HEYGEN_API_KEY",
    "HEYGEN_ACCESS_TOKEN",
    "HEYGEN_API_URL",
    "HYPERFRAMES_API_KEY",
    "HYPERFRAMES_AUDIO_API_KEY",
    "HYPERFRAMES_AUDIO_API_URL",
    "HYPERFRAMES_VERTEX_PROJECT_ID",
    "HYPERFRAMES_VERTEX_SERVICE_ACCOUNT",
    "HYPERFRAMES_PUBLISHED_PROJECTS_API_URL",
];
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
/** The pinned engine version from skills/cutscene/engine.json. */
export function readPin(file = ENGINE_JSON) {
    let data;
    try {
        data = JSON.parse(readFileSync(file, "utf8"));
    }
    catch {
        throw new CutsceneError("ENGINE_PIN_MISSING", `Cutscene can't read its engine version file (${file}).`, {
            hint: "Reinstall Cutscene; the file skills/cutscene/engine.json is part of it.",
        });
    }
    const pin = data && data[ENGINE_PACKAGE];
    if (typeof pin !== "string" || !SEMVER.test(pin)) {
        throw new CutsceneError("ENGINE_PIN_INVALID", `The engine version in ${file} must be an exact version like 0.8.162.`, {
            hint: "Restore engine.json from the Cutscene release.",
        });
    }
    return pin;
}
/**
 * The environment every engine call runs with (contracts §3 table).
 */
export function engineEnv({ pin = readPin(), home = cutsceneHome(), env = process.env } = {}) {
    const base = { ...env };
    for (const name of Object.keys(base))
        if (CLOUD_ENV.includes(name.toUpperCase()))
            delete base[name];
    return {
        ...base,
        HYPERFRAMES_SKIP_SKILLS: "1",
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
        HYPERFRAMES_NO_TELEMETRY: "1",
        DO_NOT_TRACK: "1",
        HYPERFRAMES_CLIENT: `cutscene/${CUTSCENE_VERSION}`,
        HYPERFRAMES_SKILL_PKG_VERSION: pin,
        HYPERFRAMES_PLUGIN_VERSION: pin,
        HYPERFRAMES_MEDIA_HOME: homePaths(home).media,
    };
}
/** Where the engine's command-line entry lives for a pin. */
export function engineCliPath(pin = readPin(), home = cutsceneHome()) {
    return join(engineDir(pin, home), "node_modules", ENGINE_PACKAGE, "dist", "cli.js");
}
/**
 * Is the pinned engine installed? Checks the files and the installed version.
 */
export function engineStatus({ pin = readPin(), home = cutsceneHome() } = {}) {
    const dir = engineDir(pin, home);
    const cli = engineCliPath(pin, home);
    let version = null;
    try {
        version = JSON.parse(readFileSync(join(dir, "node_modules", ENGINE_PACKAGE, "package.json"), "utf8")).version || null;
    }
    catch {
        version = null;
    }
    return { pin, dir, cli, installed: version === pin && existsSync(cli), version };
}
/** What installing the engine downloads, for consent messages (contracts §9). */
export function enginePlan(pin = readPin()) {
    return {
        id: "engine",
        name: "Video engine",
        package: `${ENGINE_PACKAGE}@${pin}`,
        version: pin,
        size: "about 110 MB",
        license: "Apache-2.0",
        source: "npm registry (registry.npmjs.org)",
    };
}
/** How to run npm with the Node that runs Cutscene, without a shell. */
export function npmCommand(env = process.env, execPath = process.execPath) {
    const candidates = [
        env.npm_execpath && /npm-cli\.js$/.test(env.npm_execpath) ? env.npm_execpath : null,
        join(dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js"),
        join(dirname(execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    ].filter(Boolean);
    const cli = candidates.find((p) => existsSync(p));
    if (cli)
        return { command: execPath, args: [cli] };
    if (process.platform !== "win32")
        return { command: "npm", args: [] };
    throw new CutsceneError("NPM_NOT_FOUND", "Cutscene can't find npm next to Node.js.", {
        hint: "Install Node.js 22 or newer from nodejs.org (it includes npm), then try again.",
    });
}
/**
 * The engine's lockfile (skills/cutscene/engine-lock.json): every package of the engine's
 * dependency tree at an exact version with its sha512 integrity, resolved only from releases at
 * least 14 days old. `npm ci` installs exactly this tree and refuses any tarball whose checksum
 * differs, so a dependency published yesterday can never slip in.
 * @returns the parsed lockfile
 */
export function readEngineLock(pin = readPin(), file = ENGINE_LOCK) {
    let lock;
    try {
        lock = JSON.parse(readFileSync(file, "utf8"));
    }
    catch {
        throw new CutsceneError("ENGINE_LOCK_MISSING", `Cutscene can't read its engine lockfile (${file}).`, {
            hint: "Reinstall Cutscene; the file skills/cutscene/engine-lock.json is part of it.",
        });
    }
    const root = lock && lock.packages && lock.packages[""];
    const top = lock && lock.packages && lock.packages[`node_modules/${ENGINE_PACKAGE}`];
    if (!root || !root.dependencies || root.dependencies[ENGINE_PACKAGE] !== pin || !top || top.version !== pin) {
        throw new CutsceneError("ENGINE_LOCK_MISMATCH", `The engine lockfile doesn't match the engine version ${pin}.`, {
            hint: "Restore engine.json and engine-lock.json from the same Cutscene release.",
        });
    }
    return lock;
}
/**
 * Install the pinned engine into <home>/engine/<pin> with `npm ci` from Cutscene's lockfile
 * (exact versions, checksums verified, no global install, nothing on PATH).
 */
export async function installEngine({ pin = readPin(), home = cutsceneHome(), onOutput } = {}) {
    const lock = readEngineLock(pin);
    const dir = engineDir(pin, home);
    mkdirSync(dir, { recursive: true });
    const root = lock.packages[""];
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: root.name || "cutscene-engine", private: true, dependencies: root.dependencies }, null, 2) + "\n");
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
    const npm = npmCommand();
    const args = [
        ...npm.args,
        "ci",
        "--prefix",
        dir,
        "--no-audit",
        "--no-fund",
        "--no-update-notifier",
        "--loglevel=error",
    ];
    const r = await run(npm.command, args, {
        cwd: dir,
        env: { ...engineEnv({ pin, home }), npm_config_global: "false" },
        onStdout: onOutput ? (c) => onOutput(c.toString("utf8")) : undefined,
        onStderr: onOutput ? (c) => onOutput(c.toString("utf8")) : undefined,
    });
    const status = engineStatus({ pin, home });
    if (r.code !== 0 || !status.installed) {
        const tail = (r.stderr || r.stdout || (r.error && r.error.message) || "").trim().split(/\r?\n/).slice(-3).join(" ");
        throw new CutsceneError("ENGINE_INSTALL_FAILED", `Cutscene couldn't install its video engine${tail ? `: ${tail}` : "."}`, {
            hint: "Check your internet connection and that npm works (npm --version), then run `cutscene setup --yes` again.",
        });
    }
    return status;
}
/**
 * Make sure the pinned engine is installed. Without `yes`, a missing engine throws
 * NEEDS_CONSENT with what would be downloaded (contracts §9).
 */
export async function ensureEngine({ pin = readPin(), home = cutsceneHome(), yes = false, onOutput } = {}) {
    const status = engineStatus({ pin, home });
    if (status.installed)
        return status;
    if (!yes) {
        const plan = enginePlan(pin);
        throw new CutsceneError("NEEDS_CONSENT", `Cutscene needs to download its video engine first (${plan.package}, ${plan.size}, ${plan.license}, from the ${plan.source}).`, { hint: "Ask the user, then run `cutscene setup --yes` (or repeat the command with --yes).", details: { downloads: [plan] } });
    }
    return installEngine({ pin, home, onOutput });
}
/**
 * Run the engine with Cutscene's environment. Never uses npx, a shell or a detached process.
 */
export async function runEngine(args, opts = {}) {
    const { pin = readPin(), home = cutsceneHome(), env = process.env, ...rest } = opts;
    const status = engineStatus({ pin, home });
    if (!status.installed)
        await ensureEngine({ pin, home, yes: false });
    return run(process.execPath, [status.cli, ...args], { ...rest, env: engineEnv({ pin, home, env }) });
}
