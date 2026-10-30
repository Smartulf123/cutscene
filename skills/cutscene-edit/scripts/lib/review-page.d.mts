// Built from src/skills/cutscene-edit/scripts/lib/review-page.mts by `npm run build`. Edit that file, not this one.
import type { Edl } from "./edl.mjs";
import type { Candidate } from "./mistakes.mjs";
/** A word on the review page: text, start, end, and 1 when it falls inside a cut. */
export type ReviewWord = {
    t: string;
    s: number;
    e: number;
    c: number;
};
/**
 * Peaks for the waveform: `bins` values in 0..1 from mono samples.
 */
export declare function peaks(samples: Float32Array, bins?: number): number[];
/**
 * Where each cut lands in the edited video (the join), from the EDL.
 */
export declare function joinsFor(edl: Edl): {
    start: number;
    end: number;
    reasons: string[];
    out: number;
}[];
/** Mark words whose middle falls inside a cut. */
export declare function markCutWords(words: {
    text: string;
    start: number;
    end: number;
}[], edl: Edl): ReviewWord[];
export declare function buildReviewHtml(d: {
    title: string;
    edl: Edl;
    edlName: string;
    originalSrc: string | null;
    editedSrc: string | null;
    words: ReviewWord[];
    peaks: number[];
    candidates?: Candidate[];
}): string;
