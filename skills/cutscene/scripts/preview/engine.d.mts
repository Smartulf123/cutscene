// Built from src/skills/cutscene/scripts/preview/engine.mts by `npm run build`. Edit that file, not this one.
import type { ChildProcess } from "node:child_process";
/** A running Studio and where it answers. */
export interface Studio {
    child: ChildProcess;
    host: string;
    port: number;
    pid: number | undefined;
}
/** What `parseReadyLine` makes of the engine's `--json` lifecycle line. */
export type ReadyLine = {
    ok: true;
    port: number | null;
} | {
    ok: false;
    message: string;
};
/** The pinned engine version (skills/cutscene/engine.json), or null when it can't be read. */
export declare function enginePin(): string | null;
/** Absolute path of the pinned engine's CLI entry (`dist/cli.js`), or null when it isn't installed. */
export declare function engineCliPath(env?: NodeJS.ProcessEnv): string | null;
/** The engine environment from contracts §3, plus the hidden bind address. */
export declare function engineEnv({ env, bindHost, watchPid }?: {
    env?: NodeJS.ProcessEnv;
    bindHost?: string;
    watchPid?: number;
}): NodeJS.ProcessEnv;
/** Try to listen on host:port (0 = any). Resolves the bound port, or null when it can't. */
export declare function tryListen(host: string, port: number): Promise<number | null>;
/**
 * A hidden loopback address for the Studio. On Windows and Linux every 127.x.y.z address is
 * loopback, so a random one plus a random port means a web page can't find the Studio by
 * scanning 127.0.0.1, and DNS rebinding can't reach it. macOS only has 127.0.0.1.
 */
export declare function pickHiddenAddress({ platform }?: {
    platform?: NodeJS.Platform;
}): Promise<{
    host: string;
    port: number;
}>;
/** GET a path on the Studio with the Host header it expects. Resolves {status, body} or null. */
export declare function probe(host: string, port: number, path?: string, timeoutMs?: number): Promise<{
    status: number | undefined;
    body: string;
} | null>;
/**
 * Start the engine's Studio for `projectDir` on a hidden loopback address.
 *
 * The engine runs with `windowsHide` and piped output, so on Windows it gets its own hidden
 * console: nothing it starts later (browsers for thumbnails, FFmpeg) can pop up a window.
 * A small watchdog preloaded into it ends it if this process dies.
 */
export declare function startStudio({ projectDir, logPath, env, timeoutMs, log }: {
    projectDir: string;
    logPath?: string | null;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    log?: (line: string) => void;
}): Promise<Studio>;
/**
 * Read the engine's `--json` lifecycle line. Returns {ok:true, port} for a started server,
 * {ok:false, message} for a failure, or null for any other line.
 */
export declare function parseReadyLine(line: string): ReadyLine | null;
/** End a child process and everything it started. */
export declare function killChildTree(child: ChildProcess | null | undefined): void;
/**
 * End a process and all its descendants. Windows: `taskkill /T /F`. POSIX: the process group
 * when `group` is set (the process was started detached), else just the process.
 */
export declare function killPidTree(pid: number | undefined, { group }?: {
    group?: boolean;
}): void;
