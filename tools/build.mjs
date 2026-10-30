#!/usr/bin/env node
// Built from src/tools/build.mts by `npm run build`. Edit that file, not this one.
// Builds Cutscene's TypeScript. Every file in src/ is compiled to the same path without src/
// (src/skills/cutscene/scripts/cli.mts -> skills/cutscene/scripts/cli.mjs), because skills are
// installed straight from this repo and run with plain `node`, on any Node 22.
//
// Each built file gets a first line that points back to its source, so nobody edits the copy.
//
// Usage: node tools/build.mjs [--check] [--json]
//   --check   build, then fail if a built file changed (CI uses this to catch a forgotten build)
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
/** Compiler projects that write files, in build order. Missing ones are skipped. */
const PROJECTS = ["tsconfig.json", "tsconfig.browser.json"];
const OUT_EXT = { ".mts": ".mjs", ".cts": ".cjs", ".ts": ".js" };
const posix = (p) => p.split(sep).join("/");
/** All TypeScript sources under src/, as absolute paths (type-only .d.ts files excluded). */
function sources(dir = SRC) {
    if (!existsSync(dir))
        return [];
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory())
            out.push(...sources(p));
        else if (/\.[mc]?ts$/.test(e.name) && !/\.d\.[mc]?ts$/.test(e.name))
            out.push(p);
    }
    return out;
}
/** Where a source file is built to. */
export function outputFor(src) {
    const rel = relative(SRC, src);
    const ext = rel.match(/\.[mc]?ts$/)[0];
    return join(ROOT, rel.slice(0, -ext.length) + OUT_EXT[ext]);
}
/** The first line of a built file (after a shebang, if any). */
export function headerFor(src) {
    return `// Built from ${posix(relative(ROOT, src))} by \`npm run build\`. Edit that file, not this one.`;
}
/** Puts the header in, right after a shebang line when there is one. */
export function withHeader(code, header) {
    if (code.includes(header))
        return code;
    if (code.startsWith("#!")) {
        const nl = code.indexOf("\n");
        return `${code.slice(0, nl + 1)}${header}\n${code.slice(nl + 1)}`;
    }
    return `${header}\n${code}`;
}
function runTsc(project) {
    const pkg = createRequire(import.meta.url).resolve("typescript/package.json", { paths: [ROOT] });
    const tsc = join(dirname(pkg), "bin", "tsc");
    const r = spawnSync(process.execPath, [tsc, "-p", project, "--pretty", "false"], { cwd: ROOT, encoding: "utf8", windowsHide: true });
    return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}
function main(argv) {
    const check = argv.includes("--check");
    const json = argv.includes("--json");
    const srcs = sources();
    const before = new Map(srcs.map((s) => [s, existsSync(outputFor(s)) ? readFileSync(outputFor(s), "utf8") : null]));
    const errors = [];
    for (const p of PROJECTS) {
        if (!existsSync(join(ROOT, p)))
            continue;
        const r = runTsc(p);
        if (!r.ok)
            errors.push(`${p}:\n${r.output}`);
    }
    const missing = [];
    const changed = [];
    for (const s of srcs) {
        const out = outputFor(s);
        if (!existsSync(out)) {
            missing.push(posix(relative(ROOT, s)));
            continue;
        }
        const code = withHeader(readFileSync(out, "utf8"), headerFor(s));
        writeFileSync(out, code);
        if (before.get(s) !== code)
            changed.push(posix(relative(ROOT, out)));
    }
    const ok = errors.length === 0 && missing.length === 0 && (!check || changed.length === 0);
    if (json) {
        console.log(JSON.stringify({ ok, sources: srcs.length, changed, missing, errors }, null, 2));
    }
    else {
        for (const e of errors)
            console.error(e);
        for (const m of missing)
            console.error(`Not built: ${m} (is it in a tsconfig "include"?)`);
        if (check && changed.length) {
            console.error(`These built files were out of date. Run \`npm run build\` and commit the result:\n  ${changed.join("\n  ")}`);
        }
        if (ok)
            console.log(`Built ${srcs.length} file${srcs.length === 1 ? "" : "s"}${changed.length ? `, ${changed.length} changed` : ", nothing changed"}.`);
    }
    return ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    process.exitCode = main(process.argv.slice(2));
