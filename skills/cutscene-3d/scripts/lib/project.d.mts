/** An error with a stable code and a plain-language fix (contracts §3). */
export interface CutsceneError extends Error {
    code: string;
    hint: string;
    exitCode: number;
    details?: unknown;
}
/** Parsed command-line flags: `--key value` is a string, a bare `--key` is true. */
export type Flags = Record<string, string | true>;
/** One beat in beats.json. Only shot3d is ever changed here; everything else is kept. */
export interface Beat {
    id: string;
    start: number;
    end: number;
    shot3d?: Record<string, unknown>;
    [key: string]: unknown;
}
/** beats.json. */
export interface BeatsFile {
    beats: Beat[];
    fps?: number;
    width?: number;
    height?: number;
    [key: string]: unknown;
}
/** The spec fields that can name a file (see specNetworkField). */
export interface SpecFileFields {
    params?: {
        svg?: unknown;
        model?: unknown;
    } | null;
    font?: unknown;
    lighting?: {
        hdri?: unknown;
    } | null;
    look?: unknown;
}
export declare const FOUNDATION_LIB: string;
export declare function cutsceneHome(env?: NodeJS.ProcessEnv): string;
export declare function isNetworkPath(p: unknown): boolean;
export declare function cutsceneError(code: string, message: string, hint?: string, exitCode?: number): CutsceneError;
/**
 * The spec fields that name files Blender or the browser will open. A network path there would
 * make Windows contact another computer (and offer it the user's sign-in), so specs may not use
 * one. Returns the first offending field as "params.svg", or null.
 */
export declare function specNetworkField(spec: SpecFileFields | null | undefined): string | null;
/** Resolve a user path; refuse network paths (contracts §10). */
export declare function userPath(p: string, base?: string): string;
/** The project folder: the nearest ancestor holding `.cutscene/` or `index.html`. */
export declare function findProject(start?: string): string;
/** Paths for one shot inside a project. */
export declare function shotPaths(projectDir: string, id: string): {
    project: string;
    spec: string;
    work: string;
    resolved: string;
    stills: string;
    frames: string;
    log: string;
    sheet: string;
    webm: string;
    poster: string;
    look: string;
    beats: string;
};
export type ShotPaths = ReturnType<typeof shotPaths>;
export declare function readJson(path: string): unknown;
export declare function writeFileAtomic(path: string, text: string): void;
export declare function writeJson(path: string, obj: unknown): void;
/** Pure: return a copy of `beats` with beat `id`'s shot3d set to `shot3d`; everything else kept. */
export declare function withShot3d(beats: BeatsFile, id: string, shot3d: Record<string, unknown>): BeatsFile;
/**
 * Set beats[id].shot3d. Uses the foundation's beats.mjs (updateBeat) when it exists, otherwise a
 * small local updater that keeps every other field and the file's indentation.
 */
export declare function updateShot3d(beatsPath: string, id: string, shot3d: Record<string, unknown>): Promise<{
    via: string;
}>;
export declare function parseArgs(argv: string[]): {
    flags: Flags;
    pos: string[];
};
export declare function emit(result: unknown, { json }: {
    json?: unknown;
}): void;
