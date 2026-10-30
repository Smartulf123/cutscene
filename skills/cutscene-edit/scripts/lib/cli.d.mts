// Built from src/skills/cutscene-edit/scripts/lib/cli.mts by `npm run build`. Edit that file, not this one.
/** An error a user can act on. `code` is SNAKE_CASE, `hint` says how to fix it. */
export declare class EditError extends Error {
    code: string;
    hint: string;
    exitCode: number;
    details: Record<string, unknown> | null;
    constructor(code: string, message: string, hint?: string, opts?: {
        exitCode?: number;
        details?: Record<string, unknown>;
    });
}
/** Wrong usage: exit code 2. */
export declare function usageError(message: string, hint?: string): EditError;
/** One option in a parseArgs spec. */
export type OptSpec = {
    type: "string" | "number" | "boolean" | "list";
    alias?: string;
    default?: unknown;
};
/** "out-dir" -> "outDir", as parseArgs names its options. */
type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
type OptBase<T extends OptSpec["type"]> = T extends "string" ? string : T extends "number" ? number : T extends "boolean" ? boolean : string[];
/** Booleans and lists always have a value; strings and numbers only with a default or when given. */
type OptValue<S extends OptSpec> = S["type"] extends "boolean" | "list" ? OptBase<S["type"]> : S extends {
    default: unknown;
} ? OptBase<S["type"]> : OptBase<S["type"]> | undefined;
/** The parsed options for a spec, by camelCase name (plus --json and --help). */
export type Opts<S extends Record<string, OptSpec>> = {
    [K in keyof S & string as Camel<K>]: OptValue<S[K]>;
} & {
    json: boolean;
    help: boolean;
};
/**
 * Parse argv against a small spec.
 */
export declare function parseArgs<S extends Record<string, OptSpec>>(argv: string[], spec: S): {
    opts: Opts<S>;
    positional: string[];
};
/** Round to milliseconds (contracts: seconds with up to 3 decimals). */
export declare function ms(n: number): number;
/** 83.4 -> "1:23.40" */
export declare function clock(seconds: number): string;
/** Log to stderr (stdout is reserved for the result). */
export declare function log(...parts: unknown[]): void;
/**
 * Print a result and set the exit code. With json, exactly one JSON object on stdout.
 */
export declare function printResult<R extends object>(json: boolean, result: R, human?: (r: R) => string): void;
/** Print an error in the contract shape and return the exit code. */
export declare function printError(json: boolean, err: unknown): number;
export {};
