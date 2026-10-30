// Built from src/skills/cutscene-voice/scripts/lib/paths.mts by `npm run build`. Edit that file, not this one.
// Where Cutscene's voice files live, and path safety rules (contracts §4, §6, §10).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { VoiceError } from "./util.mjs";
const here = dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = resolve(here, "..");
export const SKILL_DIR = resolve(here, "..", "..");
export const WORKER = join(SCRIPTS_DIR, "py", "worker.py");
export const MANIFEST_PATH = join(SKILL_DIR, "assets", "manifest.json");
/** The foundation's lib folder, next to this skill (skills are installed side by side). */
export const FOUNDATION_LIB = resolve(SKILL_DIR, "..", "cutscene", "scripts", "lib");
export const FOUNDATION_CLI = resolve(SKILL_DIR, "..", "cutscene", "scripts", "cli.mjs");
let manifestCache = null;
export function readManifest() {
    if (!manifestCache)
        manifestCache = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    return manifestCache;
}
export function cutsceneHome(env = process.env) {
    return env.CUTSCENE_HOME ? resolve(env.CUTSCENE_HOME) : join(homedir(), ".cutscene");
}
/** Everything the voice part keeps under <CUTSCENE_HOME>/voice/. */
export function voicePaths(home = cutsceneHome()) {
    const root = join(home, "voice");
    const venv = join(root, "venv");
    const python = process.platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
    return {
        root,
        venv,
        python,
        hfHome: join(root, "hf"),
        models: join(root, "models"),
        lock: join(root, "lock.json"),
        benchmarks: join(root, "benchmarks.json"),
        jobs: join(root, "jobs"),
        logs: join(home, "logs"),
    };
}
export function modelDir(model, home = cutsceneHome()) {
    return join(voicePaths(home).models, model);
}
export function isNetworkPath(p) {
    // Any two leading slashes count, mixed ones too: Windows reads /\server\share as a share.
    return typeof p === "string" && /^[\\/]{2}/.test(p.trim());
}
/** Resolve a path the user gave us; refuse network shares. */
export function resolveUserPath(p, base = process.cwd()) {
    if (typeof p !== "string" || !p.trim())
        throw new VoiceError("USAGE", "A path is missing.", "Pass a file or folder path.");
    if (isNetworkPath(p))
        throw new VoiceError("NETWORK_PATH", `Network paths aren't allowed (${p}).`, "Copy the file to this computer first, then use the local path.");
    return isAbsolute(p) ? resolve(p) : resolve(base, p);
}
export function isInside(child, parent) {
    const rel = relative(resolve(parent), resolve(child));
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
/**
 * A file named in beats.json (voice.file, voices.<name>.reference, .prompt), as an absolute path
 * that must stay inside the project. A path like "../../x.wav" or "C:\\x.wav" is refused, so a
 * beat sheet can't make the voice part read or write files elsewhere on the computer.
 * @returns null when `rel` is empty
 */
export function projectFile(project, rel, field) {
    if (typeof rel !== "string" || !rel.trim())
        return null;
    if (isNetworkPath(rel) || isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) {
        throw new VoiceError("PATH_OUTSIDE_PROJECT", `${field} in beats.json must be a path inside the project, not ${rel}.`, "Keep voice files inside the project folder. Design or clone the voice again, or fix the path in .cutscene/beats.json.");
    }
    const abs = resolve(project, rel);
    if (!isInside(abs, project)) {
        throw new VoiceError("PATH_OUTSIDE_PROJECT", `${field} in beats.json points outside the project (${rel}).`, "Keep voice files inside the project folder. Design or clone the voice again, or fix the path in .cutscene/beats.json.");
    }
    return abs;
}
/** Project-relative path with forward slashes, as beats.json stores it. */
export function projectRel(project, file) {
    return relative(project, file).split(sep).join("/");
}
/** The project's files the voice part reads and writes (contracts §6). */
export function projectPaths(project) {
    const dot = join(project, ".cutscene");
    return {
        project,
        dot,
        beats: join(dot, "beats.json"),
        projectMd: join(dot, "project.md"),
        work: join(dot, "voice"),
        takes: join(dot, "voice", "takes"),
        verifyJson: join(dot, "voice", "verify.json"),
        verifyMd: join(dot, "voice", "verify.md"),
        assets: join(project, "assets", "voice"),
    };
}
/** Find the project: --project, else the current folder if it has .cutscene/beats.json. */
export function findProject(flag, cwd = process.cwd()) {
    const dir = flag ? resolveUserPath(flag, cwd) : cwd;
    if (!existsSync(dir))
        throw new VoiceError("PROJECT_NOT_FOUND", `The project folder doesn't exist: ${dir}.`, "Pass --project <folder> (made with `cutscene init`).");
    return dir;
}
/** A file name that is safe on every OS, from a beat id or speaker name. */
export function safeName(s) {
    const out = String(s).trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    if (!out || out === "." || out === "..")
        throw new VoiceError("USAGE", `"${s}" can't be used as a name.`, "Use letters, numbers, dashes or underscores.");
    return out;
}
