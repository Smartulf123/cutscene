// Built from src/skills/cutscene-edit/scripts/lib/highlights.mts by `npm run build`. Edit that file, not this one.
export type HWord = {
    text: string;
    start: number;
    end: number;
};
export type Highlight = {
    id: string;
    start: number;
    end: number;
    text: string;
    opening: string;
    score: number;
    reasons: string[];
};
type Sentence = {
    start: number;
    end: number;
    text: string;
};
/** Sentences from timed words: split on end punctuation or a pause over 0.9 s. */
export declare function sentences(words: HWord[]): Sentence[];
/**
 * The best non-overlapping candidates, highest score first.
 */
export declare function findHighlights(words: HWord[], opts?: {
    minSeconds?: number;
    maxSeconds?: number;
    count?: number;
    target?: number;
}): Highlight[];
export {};
