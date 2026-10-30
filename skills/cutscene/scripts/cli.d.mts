#!/usr/bin/env node
/** How an engine command handles `--json`, and whether it takes `--yes` itself. */
export interface EngineCommandSpec {
    json: boolean | "own" | "batch";
    yes?: boolean;
}
/** A finding in the engine's check or lint report. */
interface Finding {
    severity?: string;
    area?: string;
    code?: string;
    message?: unknown;
    fixHint?: unknown;
    hint?: unknown;
    fix?: unknown;
    file?: string;
    sourceFile?: string;
    line?: number;
    column?: number;
    selector?: string;
    time?: unknown;
    [key: string]: unknown;
}
/** One area of the engine's check report (lint, runtime, layout, motion, contrast). */
interface ReportSection {
    errorCount?: number;
    findings?: Finding[];
    [key: string]: unknown;
}
/** The engine's `check --json` / `lint --json` report, as far as Cutscene reads it. */
interface Report {
    ok?: unknown;
    findings?: Finding[];
    lint?: ReportSection;
    runtime?: ReportSection;
    layout?: ReportSection;
    motion?: ReportSection;
    contrast?: ReportSection;
    saved?: {
        report?: string;
    };
    [key: string]: unknown;
}
export declare const ENGINE_COMMANDS: Record<string, EngineCommandSpec>;
export declare const BLOCKED: Record<string, string>;
/** Reword the engine's prose fields (never paths, ids or keys). */
export declare function rebrandJson(value: unknown, key?: string): unknown;
/** Build the `--json` envelope for an engine command's result. */
export declare function engineEnvelope(cmd: string, code: number, data: unknown, stderr?: string): {
    ok: boolean;
    [key: string]: unknown;
};
/** Cutscene's defaults for engine commands: nothing leaves the computer, nothing touches the clipboard. */
export declare function adjustEngineArgs(cmd: string, args: string[]): string[];
export declare function formatReport(cmd: string, report: Report, projectDir: string): string;
export declare function splitInitArgs(args: string[]): {
    dir: string | undefined;
    rest: string[];
};
export declare const GITIGNORE_HEADER = "# Cutscene: caches and outputs that are rebuilt automatically";
export declare const GITIGNORE_LINES: string[];
/**
 * Write the project's .gitignore, or add the lines it is missing to an existing one (the user's
 * own lines are never changed or reordered). Returns the lines that were added.
 */
export declare function writeGitignore(dir: string): string[];
/** The block registry that matches the pinned engine (the engine's git tag, not its moving main branch). */
export declare function pinnedRegistry(pin: string): string;
/**
 * Make an engine project a Cutscene project: Cutscene guide files, a .cutscene/ folder, no
 * engine scripts, and `add`/`catalog` blocks taken from the registry of the pinned engine.
 */
export declare function finishProject(dir: string, pin?: string | null): void;
/**
 * Run the CLI. Returns the exit code.
 * @param argv arguments after the script name
 */
export declare function main(argv: string[]): Promise<number>;
export {};
