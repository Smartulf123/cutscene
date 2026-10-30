// Built from src/skills/cutscene-edit/scripts/lib/plan.mts by `npm run build`. Edit that file, not this one.
import type { Keep } from "./edl.mjs";
export type PlanScene = {
    id: string;
    start: number;
    end: number;
    anchor?: string;
    anchorTime?: number;
    layout?: string;
    kind?: string;
    holdReason?: string;
    mode?: string;
};
export type PlanEvent = {
    time: number;
    visual: string;
};
export type PlanCaptionGroup = {
    start: number;
    end: number;
    words: {
        text: string;
        start: number;
        end: number;
    }[];
};
/** A short-form edit plan (assets/plan.json). */
export type Plan = {
    fps: number;
    duration: number;
    scenes: PlanScene[];
    events?: PlanEvent[];
    captions?: PlanCaptionGroup[];
};
export type PlanWord = {
    text: string;
    start: number;
    end: number;
    type?: string;
    sourceStart?: number;
    sourceEnd?: number;
    source_start?: number;
    source_end?: number;
};
export type PlanKeep = {
    sourceStart: number;
    sourceEnd: number;
    start: number;
    end: number;
};
/** The plan validator's view of the edit: kept ranges with their source and output times. */
export type PlanKeeps = {
    duration?: number;
    fps?: number;
    keeps: PlanKeep[];
};
/** One row of the footage ledger (assets/footage-ledger.json). */
export type FootageRow = {
    scene: string;
    sourceSceneId?: string;
    sha256?: string;
    sourceStart: number;
    sourceEnd: number;
    asset?: string;
};
/**
 * @param transcript  edited timeline, words with sourceStart/sourceEnd (or source_start/source_end)
 */
export declare function validatePlan(plan: Plan, transcript: {
    words?: PlanWord[];
}, edl: {
    keeps: PlanKeep[];
}, exists?: (p: string) => boolean): {
    ok: boolean;
    errors: string[];
    metrics: {
        duration: number;
        retainedWords: number;
        scenes: number;
        averageShotSeconds: number;
        visualEvents: number;
        maxEventGap: number;
        speakerShare: number;
    };
};
/**
 * Each B-roll scene once per video: a scene id, a file hash and an interval for every row; no
 * scene twice, and no overlapping intervals of the same file.
 */
export declare function validateFootage(rows: FootageRow[]): {
    ok: boolean;
    errors: string[];
    scenes: number;
};
/** SHA-256 of a buffer, hex. */
export declare function sha256(buf: Buffer | string): string;
/** A Cutscene EDL as the plan validator's keeps ({sourceStart, sourceEnd, start, end}). */
export declare function keepsFromEdl(edl: {
    keeps?: PlanKeep[];
    edited_duration?: number;
    fps?: number;
    keep_ranges?: Keep[];
}): PlanKeeps;
