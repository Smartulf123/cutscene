// Built from src/skills/cutscene/scripts/doctor.mts by `npm run build`. Edit that file, not this one.
import type { PythonCandidate } from "./lib/python.mjs";
export declare const MIN_NODE: number[];
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
/** Compare version arrays: negative when a < b. */
export declare function compareVersions(a: number[], b: number[]): number;
/** "Python 3.12.4" -> [3, 12, 4] */
export declare function parseVersion(text: string | null | undefined, prefix: string): number[] | null;
export declare function checkNode(version?: string): Check;
export declare function checkFfmpeg({ env }?: {
    env?: NodeJS.ProcessEnv;
}): Check[];
export declare function checkEngine({ home }?: {
    home?: string;
}): Promise<Check[]>;
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
