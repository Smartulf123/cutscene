// Built from src/skills/cutscene-voice/scripts/lib/util.mts by `npm run build`. Edit that file, not this one.
// Shared helpers for `cutscene voice`: errors, output, argument parsing. Node built-ins only.
export const EXIT = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2 });
export class VoiceError extends Error {
    /**
     * @param code SNAKE_CASE error code
     * @param message plain sentence
     * @param hint how to fix it
     * @param extra more fields for --json (for example a download plan)
     */
    constructor(code, message, hint = "", extra = {}) {
        super(message);
        this.code = code;
        this.hint = hint;
        this.extra = extra;
        this.exitCode = code === "USAGE" ? EXIT.USAGE : EXIT.FAIL;
    }
}
export const usage = (message, hint = "Run `cutscene voice help` to see the commands.") => new VoiceError("USAGE", message, hint);
export function envelope(err) {
    if (err instanceof VoiceError)
        return { ok: false, error: { code: err.code, message: err.message, hint: err.hint }, ...err.extra };
    return { ok: false, error: { code: "UNEXPECTED", message: String(err?.message || err), hint: "This looks like a Cutscene bug. Run the command again with --json and report the output." } };
}
/**
 * Parse `--flag value`, `--flag=value` and boolean flags against a spec.
 * spec: { name: "string" | "number" | "bool" | "list" } (list = comma separated, repeatable)
 */
export function parseFlags(argv, spec) {
    const flags = {};
    const positionals = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--") {
            positionals.push(...argv.slice(i + 1));
            break;
        }
        if (!a.startsWith("--")) {
            positionals.push(a);
            continue;
        }
        let name = a.slice(2);
        let value;
        const eq = name.indexOf("=");
        if (eq >= 0) {
            value = name.slice(eq + 1);
            name = name.slice(0, eq);
        }
        const type = spec[name];
        if (!type)
            throw usage(`Unknown option --${name}.`);
        if (type === "bool") {
            if (value !== undefined && !/^(true|false|1|0|yes|no)$/i.test(value))
                throw usage(`--${name} takes no value.`);
            flags[name] = value === undefined ? true : /^(true|1|yes)$/i.test(value);
            continue;
        }
        if (value === undefined) {
            if (i + 1 >= argv.length || (argv[i + 1].startsWith("--") && argv[i + 1].length > 2))
                throw usage(`--${name} needs a value.`);
            value = argv[++i];
        }
        if (type === "number") {
            const n = Number(value);
            if (!Number.isFinite(n))
                throw usage(`--${name} must be a number (got "${value}").`);
            flags[name] = n;
        }
        else if (type === "int") {
            const n = Number(value);
            if (!Number.isInteger(n))
                throw usage(`--${name} must be a whole number (got "${value}").`);
            flags[name] = n;
        }
        else if (type === "list") {
            flags[name] = [...(flags[name] || []), ...value.split(",").map((s) => s.trim()).filter(Boolean)];
        }
        else
            flags[name] = value;
    }
    return { flags, positionals };
}
/** Log to stderr (stdout is reserved for the one JSON object under --json). */
export function log(...parts) {
    process.stderr.write(parts.join(" ") + "\n");
}
export function fmtBytes(n) {
    if (!Number.isFinite(n))
        return "?";
    if (n >= 1e9)
        return `${(n / 1e9).toFixed(2)} GB`;
    if (n >= 1e6)
        return `${Math.round(n / 1e6)} MB`;
    if (n >= 1e3)
        return `${Math.round(n / 1e3)} KB`;
    return `${n} B`;
}
export function fmtSeconds(s) {
    if (!Number.isFinite(s))
        return "?";
    if (s < 90)
        return `${s.toFixed(s < 10 ? 1 : 0)} s`;
    return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
export const round = (x, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);
export function today() {
    return new Date().toISOString().slice(0, 10);
}
