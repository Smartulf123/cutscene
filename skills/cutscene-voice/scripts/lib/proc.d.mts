export interface RunOptions {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    timeoutMs?: number;
    onStderrLine?: (line: string) => void;
    onStdoutLine?: (line: string) => void;
    input?: string;
}
/** code is -1 when the program couldn't start or failed, -2 after a timeout. */
export interface RunResult {
    code: number | null;
    stdout: string;
    stderr: string;
    error?: unknown;
    timedOut?: boolean;
}
export declare function killTree(pid: number | undefined): void;
/**
 * Run a command. Resolves {code, stdout, stderr}; never rejects for a non-zero exit.
 */
export declare function run(cmd: string, args: string[], opts?: RunOptions): Promise<RunResult>;
/** First match of a program on PATH (with Windows extensions), or null. */
export declare function findOnPath(name: string, env?: NodeJS.ProcessEnv): string | null;
