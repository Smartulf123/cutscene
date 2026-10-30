export declare const DEFAULT_PORT = 3002;
/** The project a preview shows. */
export interface PreviewProject {
    dir: string;
    name: string;
}
/** A preview state file, <CUTSCENE_HOME>/preview/<port>.json. */
export interface PreviewState {
    version: number;
    port: number;
    url: string;
    pid: number;
    instance: string;
    mode: "foreground" | "background";
    project: PreviewProject;
    ready: boolean;
    startedAt: string;
    log: string;
    enginePid?: number;
    engineHost?: string;
    enginePort?: number;
}
/** A front door's health reply. */
export interface PreviewHealth {
    ok?: boolean;
    app?: string;
    ready?: boolean;
    pid?: number;
    instance?: string;
    [key: string]: unknown;
}
/** Folder that holds one state file per running preview. */
export declare function stateDir(env?: NodeJS.ProcessEnv): string;
export declare function statePath(port: number, env?: NodeJS.ProcessEnv): string;
export declare function logPathFor(port: number, env?: NodeJS.ProcessEnv): string;
export declare function writeState(state: PreviewState, env?: NodeJS.ProcessEnv): void;
export declare function readState(port: number, env?: NodeJS.ProcessEnv): PreviewState | null;
/** Remove a state file, but only if it still belongs to `instance` (when given). */
export declare function removeState(port: number, instance?: string, env?: NodeJS.ProcessEnv): void;
export declare function listStates(env?: NodeJS.ProcessEnv): PreviewState[];
/** True while a process with this id exists. */
export declare function pidAlive(pid: number | undefined): boolean;
/** Ask a front door for its health. Resolves the parsed reply or null. */
export declare function fetchHealth(port: number, timeoutMs?: number): Promise<PreviewHealth | null>;
/**
 * Check a state file against reality. Returns "running" when its front door answers with the
 * same instance id, "starting" when the process is alive but not answering yet, else "gone".
 */
export declare function liveness(state: PreviewState | null | undefined): Promise<"running" | "starting" | "gone">;
/** Same folder? Case-insensitive on Windows and macOS. */
export declare function sameDir(a: string | null | undefined, b: string | null | undefined): boolean;
/** The address users open. The project name goes in the hash, URL-encoded. */
export declare function previewUrl(port: number, projectName?: string): string;
/**
 * A URL that's safe to hand to the operating system's opener: built only from a validated port
 * and a project name of plain characters. Anything else opens the Studio's front page.
 */
export declare function safeOpenUrl(port: number, projectName?: string): string;
/** The command that opens a URL in the default browser on each platform. */
export declare function openCommand(url: string, platform?: NodeJS.Platform): {
    cmd: string;
    args: string[];
    verbatim: boolean;
};
/** Open the default browser. Never throws; returns false when it couldn't. */
export declare function openBrowser(url: string): boolean;
