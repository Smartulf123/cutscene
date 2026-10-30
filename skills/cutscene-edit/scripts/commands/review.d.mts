import type { Loudness } from "../lib/media.mjs";
import type { RenderCheck } from "../lib/render.mjs";
type ReviewResult = {
    review: string;
    cuts: number;
    removed: number;
    words: number;
    candidates: number;
    edited: boolean;
    hint: string;
};
/** How many kept words were heard again in the render, and how far off. */
export type WordCheck = {
    matched: number;
    expected: number;
    heard: number;
    matchRatio: number;
    missing: {
        text: string;
        at: number;
    }[];
    medianOffset: number | null;
    worstOffset: number | null;
};
type VerifyResult = {
    file: string;
    check: RenderCheck;
    words: (WordCheck & {
        skipped?: undefined;
    }) | {
        skipped: "no local transcription installed";
        matchRatio?: undefined;
    } | null;
    loudness: Loudness | null;
    problems?: string[];
    passed?: boolean;
    failMessage?: string;
};
type LoudnessResult = Loudness & {
    file: string;
    channels: number | null;
    target: number;
    peakLimit: number;
    problems: string[];
    passed: boolean;
    failMessage: string | undefined;
    failHint: string;
};
export declare const review: {
    name: string;
    aliases: string[];
    summary: string;
    usage: string;
    run(argv: string[]): ReviewResult;
    human: (r: ReviewResult) => string;
};
/**
 * Compare the words heard in the rendered cut with the retimed transcript: every kept word
 * should be there, at about the same time.
 */
export declare function compareWords(expected: {
    text: string;
    start: number;
}[], heard: {
    text: string;
    start: number;
}[]): WordCheck;
export declare const verify: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): VerifyResult;
    human(r: VerifyResult): string;
};
export declare const loudnessCmd: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): LoudnessResult;
    human: (r: LoudnessResult) => string;
};
export {};
