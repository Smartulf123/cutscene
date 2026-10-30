// Built from src/skills/cutscene/scripts/doctor.mts by `npm run build`. Edit that file, not this one.
import type { PythonCandidate } from "./lib/python.mjs";
export declare const MIN_NODE: number[];
export declare const MIN_BLENDER: number[];
export declare const MIN_PYTHON: number[];
export declare const VOICESTUDIO_HEALTH = "http://127.0.0.1:3900/health";
/** One line of the doctor's report. */
export interface Check {
    id: string;
    name: string;
    group: "needed" | "optional";
    ok: boolean;
    status: string;
    version?: string;
    path?: string;
    detail?: string;
    fix?: string;
    installable?: boolean;
    command?: string;
    voice?: unknown;
}
/** The settings doctor reads from config.json. */
type BlenderConfig = {
    blender?: string | {
        path?: string;
    };
};
/** Where to look for Blender (see `blenderCandidates`). */
export interface BlenderSearchOptions {
    env?: NodeJS.ProcessEnv;
    config?: BlenderConfig;
    platform?: NodeJS.Platform;
    home?: string;
    userHome?: string;
}
/** A Blender that was found, and its version. */
export interface FoundBlender {
    path: string;
    version: string | null;
    label: string | null | undefined;
    source: string;
    tooOld?: boolean;
}
/** Compare version arrays: negative when a < b. */
export declare function compareVersions(a: number[], b: number[]): number;
/** "Blender 5.2.3 LTS" -> [5, 2, 3] */
export declare function parseVersion(text: string | null | undefined, prefix: string): number[] | null;
export declare function checkNode(version?: string): Check;
export declare function checkFfmpeg({ env }?: {
    env?: NodeJS.ProcessEnv;
}): Check[];
export declare function checkEngine({ home }?: {
    home?: string;
}): Promise<Check[]>;
/**
 * Where Blender might be, best first: CUTSCENE_BLENDER, config.json, PATH, the usual install
 * folders (newest version first), Steam, and portable folders.
 */
export declare function blenderCandidates({ env, config, platform, home, userHome }?: BlenderSearchOptions): {
    path: string;
    source: string;
}[];
/** Run `blender --version` and read the version. */
export declare function blenderVersion(path: string): {
    version: number[];
    label: string;
} | null;
/** Find Blender ourselves (used when the cutscene-3d part isn't installed). */
export declare function findBlenderFallback(opts?: BlenderSearchOptions): FoundBlender | null;
export declare function checkBlender({ env, home }?: {
    env?: NodeJS.ProcessEnv;
    home?: string;
}): Promise<Check>;
export declare function checkPython({ platform }?: {
    platform?: NodeJS.Platform;
}): Check;
export declare function checkVoice({ home }?: {
    home?: string;
}): Promise<Check>;
export declare function checkVoiceStudio({ url, timeoutMs }?: {
    url?: string;
    timeoutMs?: number;
}): Promise<Check>;
export declare function checkKokoro({ home, find }?: {
    home?: string;
    find?: (opts: {
        home?: string;
    }) => PythonCandidate | null;
}): Check;
/**
 * auto-editor and the MediaPipe face detector, from the pins in
 * skills/cutscene-edit/assets/manifest.json. Installed means the part's own marker file
 * <home>/tools/<name>/<version>/.cutscene-ok exists.
 */
export declare function checkEditTools({ home, skillsRoot, platform }?: {
    home?: string;
    skillsRoot?: string;
    platform?: string;
}): Check[];
export declare function checkConfig({ home }?: {
    home?: string;
}): Check | null;
/** Run every check. */
export declare function collectChecks({ home, env }?: {
    home?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<Check[]>;
export declare function summarize(checks: Check[]): {
    ready: boolean;
    missing: Check[];
};
export declare function formatDoctor(checks: Check[], { home, pin }: {
    home: string;
    pin: string;
}): string;
export declare function runDoctor(args?: string[], { json }?: {
    json?: boolean;
}): Promise<number>;
export {};
