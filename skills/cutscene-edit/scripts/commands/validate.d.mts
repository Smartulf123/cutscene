import { validateFootage, validatePlan } from "../lib/plan.mjs";
import type { BeatRow } from "../lib/beatsync.mjs";
type BeatSyncResult = {
    transcript: string;
    timeline: string;
    note: string | undefined;
    window: number[];
    rows: BeatRow[];
    failures: number;
    passed: boolean;
    failMessage: string | undefined;
    failHint: string;
};
type PlanResult = ReturnType<typeof validatePlan> & {
    passed: boolean;
    failMessage: string | undefined;
    failHint: string;
};
type FootageResult = ReturnType<typeof validateFootage> & {
    passed: boolean;
    failMessage: string | undefined;
    failHint: string;
};
export declare const validateBeatSync: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): BeatSyncResult;
    human(r: BeatSyncResult): string;
};
export declare const validatePlanCmd: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): PlanResult;
    human: (r: PlanResult) => string;
};
export declare const validateFootageCmd: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): FootageResult;
    human: (r: FootageResult) => string;
};
export {};
