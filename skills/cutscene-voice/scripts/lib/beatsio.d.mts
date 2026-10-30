import type { BeatSheet } from "./types.mjs";
/** RFC 7386 JSON merge patch: objects merge, null removes, everything else replaces. */
export declare function mergePatch(target: unknown, patch: unknown): unknown;
export declare function readBeats(file: string): Promise<BeatSheet>;
/** Merge `patch` into one beat (by id). */
export declare function patchBeat(file: string, id: string, patch: unknown): Promise<BeatSheet>;
/** Merge `patch` into the top level of the sheet (voice uses it for `voices`). */
export declare function patchSheet(file: string, patch: unknown): Promise<unknown>;
export declare function usingFoundation(): Promise<boolean>;
