import type { FlagSpec, Flags } from "./types.mjs";
export declare const EXIT: Readonly<{
    OK: 0;
    FAIL: 1;
    USAGE: 2;
}>;
export declare class VoiceError extends Error {
    code: string;
    hint: string;
    extra: Record<string, unknown>;
    exitCode: number;
    /**
     * @param code SNAKE_CASE error code
     * @param message plain sentence
     * @param hint how to fix it
     * @param extra more fields for --json (for example a download plan)
     */
    constructor(code: string, message: string, hint?: string, extra?: Record<string, unknown>);
}
export declare const usage: (message: string, hint?: string) => VoiceError;
export declare function envelope(err: unknown): {
    ok: boolean;
    error: {
        code: string;
        message: string;
        hint: string;
    };
};
/**
 * Parse `--flag value`, `--flag=value` and boolean flags against a spec.
 * spec: { name: "string" | "number" | "bool" | "list" } (list = comma separated, repeatable)
 */
export declare function parseFlags(argv: string[], spec: FlagSpec): {
    flags: Flags;
    positionals: string[];
};
/** Log to stderr (stdout is reserved for the one JSON object under --json). */
export declare function log(...parts: unknown[]): void;
export declare function fmtBytes(n: number): string;
export declare function fmtSeconds(s: number): string;
export declare const round: (x: number, d?: number) => number;
export declare function today(): string;
