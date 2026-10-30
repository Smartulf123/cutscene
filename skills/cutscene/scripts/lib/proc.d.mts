// Built from src/skills/cutscene/scripts/lib/proc.mts by `npm run build`. Edit that file, not this one.
/** Options for `run`. */
export interface RunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdin?: "inherit" | "ignore" | "pipe";
    stdout?: "inherit" | "pipe" | "ignore";
    stderr?: "inherit" | "pipe" | "ignore";
    onStdout?: (chunk: Buffer) => void;
    onStderr?: (chunk: Buffer) => void;
    input?: string;
    timeoutMs?: number;
}
/** What `run` resolves with. */
export interface RunResult {
    code: number;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    error?: Error;
}
/** What `probe` returns. */
export interface ProbeResult {
    ok: boolean;
    code: number | null;
    stdout: string;
    stderr: string;
    error?: unknown;
}
/** Stop a process and everything it started. */
export declare function killTree(pid: number | undefined, signal?: NodeJS.Signals): void;
/**
 * Run a command and wait for it. Output can be inherited, captured, or streamed to callbacks.
 * Ctrl+C (and the parent exiting) stops the whole child tree.
 */
export declare function run(command: string, args: string[], opts?: RunOptions): Promise<RunResult>;
/**
 * Run a quick command synchronously and return its output (for version probes).
 * Never throws; `ok` is false when the program is missing or fails.
 */
export declare function probe(command: string, args: string[], { timeoutMs, env, cwd }?: {
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
}): ProbeResult;
/** Find a program on PATH (like `where`/`which`), without running a shell. */
export declare function findOnPath(name: string, env?: NodeJS.ProcessEnv): string | null;
