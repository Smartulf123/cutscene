/** A Blender version as `blender --version` prints it. */
export interface BlenderVersion {
    major: number;
    minor: number;
    patch: number;
    text: string;
    lts: boolean;
}
/** A place Blender could be, and how it was found. */
export interface BlenderCandidate {
    path: string;
    source: string;
}
/** A usable Blender. */
export interface FoundBlender {
    path: string;
    version: string;
    source: string;
    lts: boolean;
}
/** A candidate findBlender passed over, and why. */
export interface SkippedBlender extends BlenderCandidate {
    reason: string;
    version?: string;
}
/** Cutscene's config.json (only `blender` is read here). */
export interface BlenderConfig {
    blender?: unknown;
    [key: string]: unknown;
}
/** Directory access for blenderCandidates; tests pass a fake one. */
export interface CandidateFs {
    list?: (dir: string) => string[];
    read?: (file: string) => string;
    exists?: (p: string) => boolean;
}
export interface FindBlenderOptions {
    env?: NodeJS.ProcessEnv;
    platform?: string;
    config?: BlenderConfig;
    detailed?: boolean;
    probe?: (path: string) => BlenderVersion | null;
    exists?: (path: string) => boolean;
}
/** One machine-readable line Blender printed (`@@CS3D@@{...}`). */
export interface BlenderEvent {
    event: string;
    ok?: boolean;
    error?: string;
    template?: string;
    engine?: string;
    seconds?: number;
    frame?: number;
    [key: string]: unknown;
}
export interface RunBlenderResult {
    code: number | null;
    ok: boolean;
    timedOut: boolean;
    ms: number;
    events: BlenderEvent[];
    stdout: string;
    stderr: string;
    blender: string;
}
export declare const MIN_BLENDER: number[];
/** "Blender 5.2.3 LTS ..." -> {major, minor, patch, text: "5.2.3", lts}; null when not Blender. */
export declare function parseBlenderVersion(stdout: string | null | undefined): BlenderVersion | null;
/** Compare [a,b,c] version arrays or "x.y.z" strings. */
export declare function compareVersions(a: number[] | string, b: number[] | string): number;
export declare function versionOk(v: BlenderVersion | null | undefined): boolean;
/** Version number in a folder name like "Blender 5.2" or "blender-4.2.3-windows-x64". */
export declare function folderVersion(name: string): number[];
/** Steam library folders from libraryfolders.vdf ("path" entries). */
export declare function steamLibraries(vdfText: string): string[];
/**
 * Every place Blender could be, in priority order. Pure apart from directory listings, so tests
 * can pass a fake `fs` ({list(dir), read(file), exists(p)}).
 */
export declare function blenderCandidates({ env, platform, home, config, fs }?: {
    env?: NodeJS.ProcessEnv;
    platform?: string;
    home?: string;
    config?: BlenderConfig;
    fs?: CandidateFs;
}): BlenderCandidate[];
/** Run `<blender> --version` (short timeout, hidden window). */
export declare function probeVersion(path: string, timeoutMs?: number): BlenderVersion | null;
/**
 * Find a usable Blender (4.2 or newer). Returns {path, version, source} or null.
 * With {detailed:true} returns {found, skipped:[{path, source, reason}]}.
 */
export declare function findBlender(options: FindBlenderOptions & {
    detailed: true;
}): Promise<{
    found: FoundBlender | null;
    skipped: SkippedBlender[];
}>;
export declare function findBlender(options?: FindBlenderOptions & {
    detailed?: false;
}): Promise<FoundBlender | null>;
/** Kill a process and its children. Windows: taskkill /T /F (contracts §10). */
export declare function killTree(pid: number | undefined): void;
export declare const MARK = "@@CS3D@@";
/** Pull the machine-readable lines Blender printed. */
export declare function parseEvents(text: string | null | undefined): BlenderEvent[];
/** Arguments for one headless job. */
export declare function blenderArgs(script: string, args?: string[]): string[];
/**
 * Run a Python script in a fresh, hidden, headless Blender. Never detached; the whole process tree
 * is killed on timeout. Resolves {code, ok, timedOut, ms, events, stdout, stderr}.
 */
export declare function runBlender(script: string, args?: string[], { blender, timeout, onEvent, cwd, env }?: {
    blender?: string;
    timeout?: number;
    onEvent?: (ev: BlenderEvent) => void;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<RunBlenderResult>;
/** Absolute path of the Blender-side entry script. */
export declare const RUN_PY: string;
