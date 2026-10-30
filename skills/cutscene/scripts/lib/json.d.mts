// Built from src/skills/cutscene/scripts/lib/json.mts by `npm run build`. Edit that file, not this one.
export declare const EXIT: Readonly<{
    OK: 0;
    FAIL: 1;
    USAGE: 2;
}>;
export interface CutsceneErrorOptions {
    hint?: string;
    exitCode?: number;
    details?: object;
}
/** An error as Cutscene reads it: any thrown Error, maybe with a code, a hint and details. */
export type CodedError = Error & {
    code?: string;
    hint?: string;
    exitCode?: number;
    details?: object;
};
/** `{"ok":true, ...data}` */
export interface OkEnvelope {
    ok: true;
    [key: string]: unknown;
}
/** `{"ok":false,"error":{code,message,hint}, ...extra}` */
export interface FailEnvelope {
    ok: false;
    error: {
        code: string;
        message: string;
        hint: string;
    };
    [key: string]: unknown;
}
/** An error with a stable code, a plain-language message and a hint that says how to fix it. */
export declare class CutsceneError extends Error {
    code: string;
    hint: string;
    exitCode: number;
    details?: object;
    /**
     * @param code SNAKE_CASE error code
     * @param message plain sentence
     */
    constructor(code: string, message: string, { hint, exitCode, details }?: CutsceneErrorOptions);
}
/** A wrong-usage error (exit code 2). */
export declare function usageError(message: string, hint?: string): CutsceneError;
/** `{"ok":true, ...data}` */
export declare function ok(data?: Record<string, unknown>): OkEnvelope;
/** `{"ok":false,"error":{code,message,hint}, ...extra}` */
export declare function fail(code: string, message: string, hint?: string, extra?: Record<string, unknown>): FailEnvelope;
/** Turn any thrown value into an error envelope. */
export declare function errorToEnvelope(err: unknown): FailEnvelope;
/** Exit code for a thrown value. */
export declare function exitCodeOf(err: unknown): number;
/** Print exactly one JSON object on stdout. */
export declare function printJson(obj: unknown, stream?: NodeJS.WritableStream): void;
/** Print an error for humans on stderr. */
export declare function printHumanError(err: unknown, stream?: NodeJS.WritableStream): void;
/**
 * Pull `--json` (and other boolean flags) out of an argument list.
 * Arguments after a bare `--` are left alone.
 * @param names flag names without dashes, e.g. ["json", "yes"]
 */
export declare function takeFlags(args: string[], names: string[]): {
    flags: Record<string, boolean>;
    rest: string[];
};
/** Value of `--name value` or `--name=value`, or undefined. */
export declare function flagValue(args: string[], name: string): string | undefined;
