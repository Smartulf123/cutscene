// Built from src/skills/cutscene/scripts/lib/engine.mts by `npm run build`. Edit that file, not this one.
import type { RunOptions, RunResult } from "./proc.mjs";
export declare const ENGINE_PACKAGE = "hyperframes";
/** The engine's dependency lockfile, shipped next to engine.json. */
export declare const ENGINE_LOCK: string;
/** One package entry of the engine lockfile (npm lockfileVersion 3). */
export interface LockPackage {
    name?: string;
    version?: string;
    resolved?: string;
    integrity?: string;
    dependencies?: Record<string, string>;
    [key: string]: unknown;
}
/** The engine lockfile, skills/cutscene/engine-lock.json. */
export interface EngineLock {
    lockfileVersion?: number;
    packages: Record<string, LockPackage>;
    [key: string]: unknown;
}
/** Is the pinned engine installed, and where. */
export interface EngineStatus {
    pin: string;
    dir: string;
    cli: string;
    installed: boolean;
    version: string | null;
}
/**
 * Cloud credentials the engine would use to send frames, images or audio to an online service
 * (vision descriptions, music or voice providers, HeyGen). Cutscene runs on this computer only,
 * so they are never passed to the engine.
 */
export declare const CLOUD_ENV: string[];
/** The pinned engine version from skills/cutscene/engine.json. */
export declare function readPin(file?: string): string;
/**
 * The environment every engine call runs with (contracts §3 table).
 */
export declare function engineEnv({ pin, home, env }?: {
    pin?: string;
    home?: string;
    env?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv;
/** Where the engine's command-line entry lives for a pin. */
export declare function engineCliPath(pin?: string, home?: string): string;
/**
 * Is the pinned engine installed? Checks the files and the installed version.
 */
export declare function engineStatus({ pin, home }?: {
    pin?: string;
    home?: string;
}): EngineStatus;
/** What installing the engine downloads, for consent messages (contracts §9). */
export declare function enginePlan(pin?: string): {
    id: string;
    name: string;
    package: string;
    version: string;
    size: string;
    license: string;
    source: string;
};
/** How to run npm with the Node that runs Cutscene, without a shell. */
export declare function npmCommand(env?: NodeJS.ProcessEnv, execPath?: string): {
    command: string;
    args: string[];
};
/**
 * The engine's lockfile (skills/cutscene/engine-lock.json): every package of the engine's
 * dependency tree at an exact version with its sha512 integrity, resolved only from releases at
 * least 14 days old. `npm ci` installs exactly this tree and refuses any tarball whose checksum
 * differs, so a dependency published yesterday can never slip in.
 * @returns the parsed lockfile
 */
export declare function readEngineLock(pin?: string, file?: string): EngineLock;
/**
 * Install the pinned engine into <home>/engine/<pin> with `npm ci` from Cutscene's lockfile
 * (exact versions, checksums verified, no global install, nothing on PATH).
 */
export declare function installEngine({ pin, home, onOutput }?: {
    pin?: string;
    home?: string;
    onOutput?: (s: string) => void;
}): Promise<EngineStatus>;
/**
 * Make sure the pinned engine is installed. Without `yes`, a missing engine throws
 * NEEDS_CONSENT with what would be downloaded (contracts §9).
 */
export declare function ensureEngine({ pin, home, yes, onOutput }?: {
    pin?: string;
    home?: string;
    yes?: boolean;
    onOutput?: (s: string) => void;
}): Promise<EngineStatus>;
/**
 * Run the engine with Cutscene's environment. Never uses npx, a shell or a detached process.
 */
export declare function runEngine(args: string[], opts?: RunOptions & {
    pin?: string;
    home?: string;
}): Promise<RunResult>;
