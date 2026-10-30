import { humanCut } from "../lib/workflow.mjs";
import type { EditSummary } from "../lib/workflow.mjs";
/** How transcribe tightened word edges. */
type Refinement = {
    refined: number;
    estimated: number;
    silences: number;
    thresholdDb: number | null;
    floorDb: number | null;
};
type TranscribeResult = {
    cached: true;
    transcript: string;
    phrases: string;
    words: number;
    duration: number | undefined;
    hint: string;
} | {
    cached: false;
    transcript: string;
    phrases: string;
    words: number;
    duration: number;
    engine: {
        asr: string | null;
        model: string | null;
    };
    refinement: Refinement;
};
type FindCutsResult = {
    candidates: number;
    counts: Record<string, number>;
    proposedCutSeconds: number;
    list: {
        id: string;
        type: string;
        recommend: string;
        confidence: string;
        start: number;
        end: number;
        removes: string;
    }[];
    outputs: {
        json: string;
        md: string;
        approveInto: string;
    };
};
/** Quick content fingerprint: size, plus SHA-256 of the first and last 4 MB. */
export declare function fingerprint(file: string): string;
/** Silence threshold from the measured noise floor: well above the floor, never inside speech. */
export declare function silenceThreshold(floorDb: number): number;
export declare const transcribe: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): TranscribeResult;
    human(r: TranscribeResult): string;
};
export declare const read: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): {
        timeline: string;
        words: number;
        text: string;
    };
    human: (r: {
        timeline: string;
        words: number;
        text: string;
    }) => string;
};
export declare const cutSilences: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): EditSummary;
    human: typeof humanCut;
};
export declare const findCuts: {
    name: string;
    aliases: string[];
    summary: string;
    usage: string;
    run(argv: string[]): FindCutsResult;
    human(r: FindCutsResult): string;
};
export declare const applyCuts: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): EditSummary;
    human: typeof humanCut;
};
export {};
