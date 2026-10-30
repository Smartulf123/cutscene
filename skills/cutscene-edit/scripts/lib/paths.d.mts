/** Network paths (\\server\share, //server/share) are refused (contracts §10). */
export declare function isNetworkPath(p: string): boolean;
/**
 * Resolve a user-given path and refuse network paths.
 * @param p
 * @param what  what the path is, for the message ("the video")
 */
export declare function userPath(p: string | undefined | null, what?: string): string;
/** A path that must exist. */
export declare function existingFile(p: string | undefined | null, what?: string): string;
/** Cutscene home: CUTSCENE_HOME or ~/.cutscene (contracts §4). */
export declare function cutsceneHome(): string;
/** The nearest folder at or above `start` that has a .cutscene/ folder, or null. */
export declare function findProjectRoot(start: string): string | null;
/**
 * The folder outputs go into: --out-dir, else <project>/.cutscene/edit for the input's project,
 * else <project>/.cutscene/edit for the current folder's project, else .cutscene/edit next to the input.
 */
export declare function outputDir(outDir: string | undefined, input: string): string;
/** "C:/x/raw-take.transcript.json" -> "raw-take" (strips our own suffixes too). */
export declare function stemOf(p: string): string;
/** Refuse to write over the input. */
export declare function assertNotSame(output: string, input: string, what?: string): void;
/** Write JSON with a trailing newline. */
export declare function writeJson(path: string, obj: unknown): string;
export declare function readJson<T = unknown>(path: string, what?: string): T;
/** A path relative to the project (forward slashes) when inside it, else absolute. */
export declare function displayPath(p: string, root: string | null): string;
/**
 * Append one line to <project>/.cutscene/project.md, the short memory of decisions and checks
 * (a pattern learned from video-use). Only when the files live in a Cutscene project.
 */
export declare function remember(anyPathInProject: string, line: string): string | null;
