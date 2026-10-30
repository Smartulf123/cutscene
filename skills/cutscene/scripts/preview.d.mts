#!/usr/bin/env node
// Built from src/skills/cutscene/scripts/preview.mts by `npm run build`. Edit that file, not this one.
import type { PreviewProject, PreviewState } from "./preview/state.mjs";
/** The parsed command line. */
export interface PreviewOptions {
    project: string | undefined;
    port: number;
    explicitPort: boolean;
    background: boolean;
    status: boolean;
    stop: boolean;
    list: boolean;
    all: boolean;
    open: boolean;
    json: boolean;
    help: boolean;
    serveChild: boolean;
    readyFile: string | undefined;
    instance: string | undefined;
}
/** What the preview tells users and scripts about a running preview. */
export interface PreviewInfo {
    url: string;
    pid: number;
    port: number;
    project: PreviewProject;
    mode: PreviewState["mode"];
    log: string;
    reused?: boolean;
    state?: string;
}
/** Parse the command line. Throws a usage error (exit code 2) for anything unexpected. */
export declare function parseArgs(argv: string[]): PreviewOptions;
/** The project folder: must be a local folder holding an engine project (index.html). */
export declare function resolveProject(arg: string | undefined, cwd?: string): PreviewProject;
/** Stop one preview and wait until its processes are gone. */
export declare function stopPreview(s: PreviewState, { timeoutMs }?: {
    timeoutMs?: number;
}): Promise<boolean>;
export declare function main(argv?: string[]): Promise<number>;
