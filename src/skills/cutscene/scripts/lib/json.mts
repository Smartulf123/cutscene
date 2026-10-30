// The `--json` envelope every Cutscene command uses (contracts §3):
//   {"ok":true,...}  or  {"ok":false,"error":{"code":"SNAKE_CASE","message":"...","hint":"..."}}
// Exit codes: 0 success, 1 failure, 2 wrong usage.

export const EXIT = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });

export interface CutsceneErrorOptions {
  hint?: string;
  exitCode?: number;
  details?: object;
}

/** An error as Cutscene reads it: any thrown Error, maybe with a code, a hint and details. */
export type CodedError = Error & { code?: string; hint?: string; exitCode?: number; details?: object };

/** `{"ok":true, ...data}` */
export interface OkEnvelope {
  ok: true;
  [key: string]: unknown;
}

/** `{"ok":false,"error":{code,message,hint}, ...extra}` */
export interface FailEnvelope {
  ok: false;
  error: { code: string; message: string; hint: string };
  [key: string]: unknown;
}

/** An error with a stable code, a plain-language message and a hint that says how to fix it. */
export class CutsceneError extends Error {
  declare code: string;
  declare hint: string;
  declare exitCode: number;
  declare details?: object;

  /**
   * @param code SNAKE_CASE error code
   * @param message plain sentence
   */
  constructor(code: string, message: string, { hint = "", exitCode = EXIT.FAIL, details }: CutsceneErrorOptions = {}) {
    super(message);
    this.name = "CutsceneError";
    this.code = code;
    this.hint = hint;
    this.exitCode = exitCode;
    if (details) this.details = details;
  }
}

/** A wrong-usage error (exit code 2). */
export function usageError(message: string, hint: string = "Run `cutscene help` to see the commands."): CutsceneError {
  return new CutsceneError("USAGE", message, { hint, exitCode: EXIT.USAGE });
}

/** `{"ok":true, ...data}` */
export function ok(data: Record<string, unknown> = {}): OkEnvelope {
  return { ok: true, ...data };
}

/** `{"ok":false,"error":{code,message,hint}, ...extra}` */
export function fail(code: string, message: string, hint: string = "", extra: Record<string, unknown> = {}): FailEnvelope {
  return { ok: false, error: { code, message, hint }, ...extra };
}

/** Turn any thrown value into an error envelope. */
export function errorToEnvelope(err: unknown): FailEnvelope {
  if (err instanceof CutsceneError || (err && typeof (err as CodedError).code === "string" && /^[A-Z][A-Z0-9_]*$/.test((err as CodedError).code as string))) {
    return fail((err as CodedError).code as string, (err as CodedError).message, (err as CodedError).hint || "", (err as CodedError).details ? { details: (err as CodedError).details } : {});
  }
  const message = err && (err as CodedError).message ? (err as CodedError).message : String(err);
  return fail("UNEXPECTED", message, "This looks like a bug in Cutscene. Run `cutscene doctor`, and if it keeps happening, report it at https://github.com/Smartulf123/cutscene/issues.");
}

/** Exit code for a thrown value. */
export function exitCodeOf(err: unknown): number {
  return err && Number.isInteger((err as CodedError).exitCode) ? ((err as CodedError).exitCode as number) : EXIT.FAIL;
}

/** Print exactly one JSON object on stdout. */
export function printJson(obj: unknown, stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(JSON.stringify(obj, null, 2) + "\n");
}

/** Print an error for humans on stderr. */
export function printHumanError(err: unknown, stream: NodeJS.WritableStream = process.stderr): void {
  const env = errorToEnvelope(err);
  stream.write(`Error: ${env.error.message}\n`);
  if (env.error.hint) stream.write(`Fix: ${env.error.hint}\n`);
}

/**
 * Pull `--json` (and other boolean flags) out of an argument list.
 * Arguments after a bare `--` are left alone.
 * @param names flag names without dashes, e.g. ["json", "yes"]
 */
export function takeFlags(args: string[], names: string[]): { flags: Record<string, boolean>; rest: string[] } {
  const flags: Record<string, boolean> = Object.fromEntries(names.map((n) => [n, false]));
  const rest: string[] = [];
  let passthrough = false;
  for (const a of args) {
    if (passthrough) {
      rest.push(a);
      continue;
    }
    if (a === "--") {
      passthrough = true;
      rest.push(a);
      continue;
    }
    const m = /^--([a-z][a-z0-9-]*)$/.exec(a);
    if (m && names.includes(m[1])) {
      flags[m[1]] = true;
      continue;
    }
    if (a === "-y" && names.includes("yes")) {
      flags.yes = true;
      continue;
    }
    rest.push(a);
  }
  return { flags, rest };
}

/** Value of `--name value` or `--name=value`, or undefined. */
export function flagValue(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === `--${name}`) return args[i + 1];
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}
