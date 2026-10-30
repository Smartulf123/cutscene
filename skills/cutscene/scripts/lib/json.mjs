// Built from src/skills/cutscene/scripts/lib/json.mts by `npm run build`. Edit that file, not this one.
// The `--json` envelope every Cutscene command uses (contracts §3):
//   {"ok":true,...}  or  {"ok":false,"error":{"code":"SNAKE_CASE","message":"...","hint":"..."}}
// Exit codes: 0 success, 1 failure, 2 wrong usage.
export const EXIT = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });
/** An error with a stable code, a plain-language message and a hint that says how to fix it. */
export class CutsceneError extends Error {
    /**
     * @param code SNAKE_CASE error code
     * @param message plain sentence
     */
    constructor(code, message, { hint = "", exitCode = EXIT.FAIL, details } = {}) {
        super(message);
        this.name = "CutsceneError";
        this.code = code;
        this.hint = hint;
        this.exitCode = exitCode;
        if (details)
            this.details = details;
    }
}
/** A wrong-usage error (exit code 2). */
export function usageError(message, hint = "Run `cutscene help` to see the commands.") {
    return new CutsceneError("USAGE", message, { hint, exitCode: EXIT.USAGE });
}
/** `{"ok":true, ...data}` */
export function ok(data = {}) {
    return { ok: true, ...data };
}
/** `{"ok":false,"error":{code,message,hint}, ...extra}` */
export function fail(code, message, hint = "", extra = {}) {
    return { ok: false, error: { code, message, hint }, ...extra };
}
/** Turn any thrown value into an error envelope. */
export function errorToEnvelope(err) {
    if (err instanceof CutsceneError || (err && typeof err.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(err.code))) {
        return fail(err.code, err.message, err.hint || "", err.details ? { details: err.details } : {});
    }
    const message = err && err.message ? err.message : String(err);
    return fail("UNEXPECTED", message, "This looks like a bug in Cutscene. Run `cutscene doctor`, and if it keeps happening, report it at https://github.com/Smartulf123/cutscene/issues.");
}
/** Exit code for a thrown value. */
export function exitCodeOf(err) {
    return err && Number.isInteger(err.exitCode) ? err.exitCode : EXIT.FAIL;
}
/** Print exactly one JSON object on stdout. */
export function printJson(obj, stream = process.stdout) {
    stream.write(JSON.stringify(obj, null, 2) + "\n");
}
/** Print an error for humans on stderr. */
export function printHumanError(err, stream = process.stderr) {
    const env = errorToEnvelope(err);
    stream.write(`Error: ${env.error.message}\n`);
    if (env.error.hint)
        stream.write(`Fix: ${env.error.hint}\n`);
}
/**
 * Pull `--json` (and other boolean flags) out of an argument list.
 * Arguments after a bare `--` are left alone.
 * @param names flag names without dashes, e.g. ["json", "yes"]
 */
export function takeFlags(args, names) {
    const flags = Object.fromEntries(names.map((n) => [n, false]));
    const rest = [];
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
export function flagValue(args, name) {
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === `--${name}`)
            return args[i + 1];
        if (a.startsWith(`--${name}=`))
            return a.slice(name.length + 3);
    }
    return undefined;
}
