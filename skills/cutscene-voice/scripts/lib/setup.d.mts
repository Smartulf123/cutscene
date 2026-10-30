// Built from src/skills/cutscene-voice/scripts/lib/setup.mts by `npm run build`. Edit that file, not this one.
import type { LockPackage, Manifest, ModelLock, ProgressEvent, PythonPin, VoiceLock } from "./types.mjs";
/** What a Python reports about itself. */
export interface PythonInfo {
    major: number;
    minor: number;
    micro: number;
    machine: string;
    platform: string;
    exe: string;
}
/** One thing setup would download or check. */
export interface PlanItem {
    kind: "python" | "model";
    id: string;
    what: string;
    download_bytes: number;
    disk_bytes: number;
    estimate?: boolean;
    license: string;
    commercial_use?: boolean | null;
    license_note?: string;
    source: string;
    revision?: string;
    where: string;
    action?: string;
}
export interface SetupPlan {
    models: string[];
    groups: string[];
    items: PlanItem[];
    download_bytes: number;
    nothing_to_do: boolean;
}
export declare const MODEL_IDS: string[];
export declare const DEFAULT_MODELS: string[];
/** Which manifest groups the chosen models need (always "base"). */
export declare function groupsFor(models: string[], manifest?: Manifest): string[];
/** Top-level pins for pip, e.g. ["soundfile==0.14.0", ...]. */
export declare function pinsFor(groups: string[], manifest?: Manifest): string[];
/** The pinned torch wheels that fit this Python, or null when this platform has no hashed pin yet. */
export declare function torchWheelsFor(pyInfo: Pick<PythonInfo, "platform" | "machine" | "major" | "minor">, manifest?: Manifest): import("./types.mjs").TorchWheel[] | null;
/** Plain-text requirements with hashes. */
export declare function requirementsText(entries: Pick<PythonPin, "name" | "version" | "sha256">[] | LockPackage[]): string;
/** Find a Python 3.10-3.13 to build the environment with (CUTSCENE_PYTHON wins). */
export declare function findBasePython(env?: NodeJS.ProcessEnv): Promise<PythonInfo>;
/**
 * What setup would do for these models.
 */
export declare function setupPlan(models: string[], { home, repair }?: {
    home?: string;
    repair?: boolean;
}): SetupPlan;
export declare function describePlan(plan: SetupPlan): string;
/** Install the Python side for `groups`. Returns the new lock's package list. */
export declare function installPython(groups: string[], { home, onStep }?: {
    home?: string;
    onStep?: (step: string) => void;
}): Promise<{
    packages: {
        name: string;
        version: string;
        sha256: string | null;
    }[];
    groups: string[];
    python: PythonInfo;
}>;
/** Read what's installed and record every package's version and wheel SHA-256. */
export declare function buildPackageLock({ home, python, previous, groups }: {
    home?: string;
    python: PythonInfo;
    previous: VoiceLock | null;
    groups: string[];
}): Promise<{
    packages: {
        name: string;
        version: string;
        sha256: string | null;
    }[];
    groups: string[];
    python: PythonInfo;
}>;
/** Download (or re-check) one model's pinned files and verify their SHA-256. */
export declare function installModel(id: string, { home, onProgress }?: {
    home?: string;
    onProgress?: (e: ProgressEvent) => void;
}): Promise<ModelLock>;
export declare function writeLock(home: string, patch: VoiceLock): VoiceLock;
