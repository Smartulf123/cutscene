// Built from src/skills/cutscene-edit/scripts/lib/cli.mts by `npm run build`. Edit that file, not this one.
// Shared command-line helpers for `cutscene edit`: argument parsing, errors and output.
// Cutscene (Apache-2.0).
/** An error a user can act on. `code` is SNAKE_CASE, `hint` says how to fix it. */
export class EditError extends Error {
    constructor(code, message, hint = "", opts = {}) {
        super(message);
        this.code = code;
        this.hint = hint;
        this.exitCode = opts.exitCode ?? 1;
        this.details = opts.details ?? null;
    }
}
/** Wrong usage: exit code 2. */
export function usageError(message, hint = "Run `cutscene edit help` to see every tool and its options.") {
    return new EditError("WRONG_USAGE", message, hint, { exitCode: 2 });
}
/**
 * Parse argv against a small spec.
 */
export function parseArgs(argv, spec) {
    const full = { json: { type: "boolean" }, help: { type: "boolean", alias: "h" }, ...spec };
    const byAlias = new Map();
    for (const [name, s] of Object.entries(full))
        if (s.alias)
            byAlias.set(s.alias, name);
    const opts = {};
    for (const [name, s] of Object.entries(full)) {
        if (s.default !== undefined)
            opts[camel(name)] = s.default;
        else if (s.type === "boolean")
            opts[camel(name)] = false;
        else if (s.type === "list")
            opts[camel(name)] = [];
    }
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--") {
            positional.push(...argv.slice(i + 1));
            break;
        }
        let name = null;
        let inline = null;
        if (a.startsWith("--")) {
            const eq = a.indexOf("=");
            name = eq > 0 ? a.slice(2, eq) : a.slice(2);
            inline = eq > 0 ? a.slice(eq + 1) : null;
            if (name.startsWith("no-") && full[name.slice(3)]?.type === "boolean") {
                opts[camel(name.slice(3))] = false;
                continue;
            }
        }
        else if (/^-[a-zA-Z]$/.test(a)) {
            name = byAlias.get(a.slice(1)) ?? null;
            if (!name)
                throw usageError(`Unknown option ${a}.`);
        }
        else {
            positional.push(a);
            continue;
        }
        const s = full[name];
        if (!s)
            throw usageError(`Unknown option --${name}.`);
        const key = camel(name);
        if (s.type === "boolean") {
            opts[key] = inline === null ? true : !/^(0|false|no|off)$/i.test(inline);
            continue;
        }
        const value = inline ?? argv[++i];
        if (value === undefined)
            throw usageError(`--${name} needs a value.`);
        if (s.type === "number") {
            const n = Number(value);
            if (!Number.isFinite(n))
                throw usageError(`--${name} must be a number, not "${value}".`);
            opts[key] = n;
        }
        else if (s.type === "list") {
            opts[key].push(value);
        }
        else {
            opts[key] = value;
        }
    }
    return { opts: opts, positional };
}
function camel(name) {
    return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}
/** Round to milliseconds (contracts: seconds with up to 3 decimals). */
export function ms(n) {
    return Math.round(n * 1000) / 1000;
}
/** 83.4 -> "1:23.40" */
export function clock(seconds) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}
/** Log to stderr (stdout is reserved for the result). */
export function log(...parts) {
    process.stderr.write(parts.join(" ") + "\n");
}
/**
 * Print a result and set the exit code. With json, exactly one JSON object on stdout.
 */
export function printResult(json, result, human) {
    if (json)
        process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
    else
        process.stdout.write((human ? human(result) : JSON.stringify(result, null, 2)) + "\n");
}
/** Print an error in the contract shape and return the exit code. */
export function printError(json, err) {
    const e = err instanceof EditError ? err : new EditError("UNEXPECTED", String(err?.message ?? err), "This looks like a bug in Cutscene; please report it with the command you ran.");
    if (json) {
        const error = { code: e.code, message: e.message, hint: e.hint };
        if (e.details)
            Object.assign(error, { details: e.details });
        process.stdout.write(JSON.stringify({ ok: false, error }) + "\n");
    }
    else {
        process.stderr.write(`Cutscene: ${e.message}\n`);
        if (e.hint)
            process.stderr.write(`How to fix: ${e.hint}\n`);
        if (e.details && e.code === "NEEDS_CONSENT") {
            const d = e.details;
            process.stderr.write(`Download: ${d.name} ${d.version}, ${d.sizeText}, licence ${d.license}, from ${d.source}\n`);
        }
        if (!(err instanceof EditError) && err?.stack && process.env.CUTSCENE_DEBUG)
            process.stderr.write(err.stack + "\n");
    }
    return e.exitCode;
}
