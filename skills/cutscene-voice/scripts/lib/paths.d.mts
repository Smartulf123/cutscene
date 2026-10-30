// Built from src/skills/cutscene-voice/scripts/lib/paths.mts by `npm run build`. Edit that file, not this one.
import type { Manifest } from "./types.mjs";
export declare const SCRIPTS_DIR: string;
export declare const SKILL_DIR: string;
export declare const WORKER: string;
export declare const MANIFEST_PATH: string;
/** The foundation's lib folder, next to this skill (skills are installed side by side). */
export declare const FOUNDATION_LIB: string;
export declare const FOUNDATION_CLI: string;
export declare function readManifest(): Manifest;
export declare function cutsceneHome(env?: NodeJS.ProcessEnv): string;
/** Everything the voice part keeps under <CUTSCENE_HOME>/voice/. */
export declare function voicePaths(home?: string): {
    root: string;
    venv: string;
    python: string;
    hfHome: string;
    models: string;
    lock: string;
    benchmarks: string;
    jobs: string;
    logs: string;
};
export declare function modelDir(model: string, home?: string): string;
export declare function isNetworkPath(p: unknown): boolean;
/** Resolve a path the user gave us; refuse network shares. */
export declare function resolveUserPath(p: unknown, base?: string): string;
export declare function isInside(child: string, parent: string): boolean;
/**
 * A file named in beats.json (voice.file, voices.<name>.reference, .prompt), as an absolute path
 * that must stay inside the project. A path like "../../x.wav" or "C:\\x.wav" is refused, so a
 * beat sheet can't make the voice part read or write files elsewhere on the computer.
 * @returns null when `rel` is empty
 */
export declare function projectFile(project: string, rel: unknown, field: string): string | null;
/** Project-relative path with forward slashes, as beats.json stores it. */
export declare function projectRel(project: string, file: string): string;
/** The project's files the voice part reads and writes (contracts §6). */
export declare function projectPaths(project: string): {
    project: string;
    dot: string;
    beats: string;
    projectMd: string;
    work: string;
    takes: string;
    verifyJson: string;
    verifyMd: string;
    assets: string;
};
/** Find the project: --project, else the current folder if it has .cutscene/beats.json. */
export declare function findProject(flag: string | undefined, cwd?: string): string;
/** A file name that is safe on every OS, from a beat id or speaker name. */
export declare function safeName(s: unknown): string;
