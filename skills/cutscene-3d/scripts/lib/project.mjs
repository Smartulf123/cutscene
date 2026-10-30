// Built from src/skills/cutscene-3d/scripts/lib/project.mts by `npm run build`. Edit that file, not this one.
// Project paths, beats.json updates (shot3d only), JSON envelopes and small file helpers.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
export const FOUNDATION_LIB = resolve(here, "..", "..", "..", "cutscene", "scripts", "lib");
export function cutsceneHome(env = process.env) {
    return env.CUTSCENE_HOME && env.CUTSCENE_HOME.trim() ? resolve(env.CUTSCENE_HOME.trim()) : join(homedir(), ".cutscene");
}
export function isNetworkPath(p) {
    // Any two leading slashes count, mixed ones too: Windows reads /\server\share as a share.
    return typeof p === "string" && /^[\\/]{2}[^\\/]/.test(p.trim());
}
export function cutsceneError(code, message, hint = "", exitCode = 1) {
    const e = new Error(message);
    e.code = code;
    e.hint = hint;
    e.exitCode = exitCode;
    return e;
}
/**
 * The spec fields that name files Blender or the browser will open. A network path there would
 * make Windows contact another computer (and offer it the user's sign-in), so specs may not use
 * one. Returns the first offending field as "params.svg", or null.
 */
export function specNetworkField(spec) {
    const fields = {
        "params.svg": spec?.params?.svg,
        "params.model": spec?.params?.model,
        font: spec?.font,
        "lighting.hdri": spec?.lighting?.hdri,
        look: spec?.look,
    };
    for (const [name, value] of Object.entries(fields))
        if (isNetworkPath(value))
            return name;
    return null;
}
/** Resolve a user path; refuse network paths (contracts §10). */
export function userPath(p, base = process.cwd()) {
    if (isNetworkPath(p))
        throw cutsceneError("NETWORK_PATH", `Cutscene doesn't work with network paths (${p}).`, "Copy the files to a folder on this computer and use that path instead.");
    return isAbsolute(p) ? resolve(p) : resolve(base, p);
}
/** The project folder: the nearest ancestor holding `.cutscene/` or `index.html`. */
export function findProject(start = process.cwd()) {
    let dir = resolve(start);
    for (let i = 0; i < 40; i++) {
        if (existsSync(join(dir, ".cutscene")) || existsSync(join(dir, "index.html")))
            return dir;
        const up = dirname(dir);
        if (up === dir)
            break;
        dir = up;
    }
    return resolve(start);
}
/** Paths for one shot inside a project. */
export function shotPaths(projectDir, id) {
    const work = join(projectDir, ".cutscene", "3d");
    return {
        project: projectDir,
        spec: join(work, `${id}.json`),
        work: join(work, id),
        resolved: join(work, id, "resolved.json"),
        stills: join(work, id, "stills"),
        frames: join(work, id, "frames"),
        log: join(work, id, "render.log"),
        sheet: join(work, id, "stills", "contact-sheet.png"),
        webm: join(projectDir, "assets", "3d", `${id}.webm`),
        poster: join(projectDir, "assets", "3d", `${id}.poster.png`),
        look: join(projectDir, ".cutscene", "look.json"),
        beats: join(projectDir, ".cutscene", "beats.json"),
    };
}
export function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
}
export function writeFileAtomic(path, text) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, path);
}
export function writeJson(path, obj) {
    writeFileAtomic(path, JSON.stringify(obj, null, 2) + "\n");
}
// ---------------------------------------------------------------- beats.json (only beats[].shot3d)
/** Pure: return a copy of `beats` with beat `id`'s shot3d set to `shot3d`; everything else kept. */
export function withShot3d(beats, id, shot3d) {
    if (!beats || !Array.isArray(beats.beats))
        throw cutsceneError("BEATS_INVALID", "beats.json has no beats list.", "Make the beat sheet first (the cutscene skill does this).");
    const i = beats.beats.findIndex((b) => b && b.id === id);
    if (i < 0)
        throw cutsceneError("BEAT_NOT_FOUND", `There's no beat "${id}" in beats.json.`, `Use one of: ${beats.beats.map((b) => b.id).join(", ")}.`);
    const next = { ...beats, beats: beats.beats.slice() };
    next.beats[i] = { ...beats.beats[i], shot3d: { ...(beats.beats[i].shot3d || {}), ...shot3d } };
    return next;
}
function detectIndent(text) {
    const m = /\n([ \t]+)"/.exec(text);
    return m ? m[1] : 2;
}
/**
 * Set beats[id].shot3d. Uses the foundation's beats.mjs (updateBeat) when it exists, otherwise a
 * small local updater that keeps every other field and the file's indentation.
 */
export async function updateShot3d(beatsPath, id, shot3d) {
    const foundation = join(FOUNDATION_LIB, "beats.mjs");
    if (existsSync(foundation)) {
        const mod = (await import(pathToFileURL(foundation).href));
        if (typeof mod.updateBeat === "function") {
            const current = mod.readBeats ? await mod.readBeats(beatsPath) : readJson(beatsPath);
            const beat = current.beats?.find((b) => b.id === id);
            if (!beat)
                throw cutsceneError("BEAT_NOT_FOUND", `There's no beat "${id}" in beats.json.`, "Check the beat id in .cutscene/beats.json.");
            await mod.updateBeat(beatsPath, id, { shot3d: { ...(beat.shot3d || {}), ...shot3d } });
            return { via: "foundation" };
        }
    }
    const text = readFileSync(beatsPath, "utf8");
    const bom = text.startsWith("﻿") ? "﻿" : "";
    const beats = JSON.parse(text.slice(bom.length));
    const next = withShot3d(beats, id, shot3d);
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    let out = JSON.stringify(next, null, detectIndent(text));
    if (eol !== "\n")
        out = out.replace(/\n/g, eol);
    writeFileAtomic(beatsPath, bom + out + (text.endsWith("\n") ? eol : ""));
    return { via: "local" };
}
// ---------------------------------------------------------------- CLI output (contracts §3)
export function parseArgs(argv) {
    const flags = {};
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--") {
            pos.push(...argv.slice(i + 1));
            break;
        }
        const m = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/i.exec(a);
        if (m) {
            const key = m[1];
            if (m[2] !== undefined)
                flags[key] = m[2];
            else if (i + 1 < argv.length && !argv[i + 1].startsWith("--") && !BOOL_FLAGS.has(key))
                flags[key] = argv[++i];
            else
                flags[key] = true;
        }
        else if (a === "-y")
            flags.yes = true;
        else
            pos.push(a);
    }
    return { flags, pos };
}
const BOOL_FLAGS = new Set(["json", "yes", "force", "deadline", "keep-frames", "draft", "dry-run", "help", "update-beats", "no-beats", "no-sheet", "final"]);
export function emit(result, { json }) {
    if (json)
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
