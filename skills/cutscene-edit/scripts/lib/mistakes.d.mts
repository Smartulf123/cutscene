// Built from src/skills/cutscene-edit/scripts/lib/mistakes.mts by `npm run build`. Edit that file, not this one.
/** Lower-case word without surrounding punctuation (the kit's tokeniser). */
export declare function token(text: string | null | undefined): string;
export declare const FILLERS: Set<string>;
export type MWord = {
    text: string;
    start: number;
    end: number;
    source_start?: number;
    source_end?: number;
    pauseBefore?: number;
};
/** A proposed cut. `overlaps` lists other candidates it overlaps; `source_cut` is set for edited transcripts (original-recording times). */
export type Candidate = {
    id: string;
    type: string;
    confidence: "high" | "medium" | "low";
    recommend: "cut" | "review" | "keep";
    cut: {
        start: number;
        end: number;
    };
    words: number[];
    removes: string;
    keeps: string;
    context: string;
    note: string;
    score?: number;
    overlaps?: string[];
    source_cut?: {
        start: number;
        end: number;
    };
};
/** A sentence-like run of words. */
export type Segment = {
    first: number;
    last: number;
    start: number;
    end: number;
    text: string;
};
/** One entry of an approved-cuts file: a candidate id, or an explicit range. */
export type ApprovedItem = string | {
    start: unknown;
    end: unknown;
    reason?: string;
    note?: string;
};
/** An approved-cuts file: {"cuts":[...]}, {"approve":["c001"]}, or a bare list. */
export type ApprovedDoc = {
    cuts?: ApprovedItem[];
    approve?: string[];
} | ApprovedItem[];
/**
 * Find candidate cuts in timed words.
 * @param words  spoken words on one timeline, sorted
 */
export declare function findCutCandidates(words: MWord[], opts?: {
    fillers?: boolean;
}): {
    candidates: Candidate[];
    segments: Segment[];
};
/**
 * Turn approved candidate ids (or explicit ranges) into cut ranges.
 * @param doc  {"cuts":[{start,end,reason}]} or {"approve":["c001"]}
 */
export declare function approvedRanges(doc: ApprovedDoc | null | undefined, candidates?: Candidate[]): {
    start: number;
    end: number;
    reason: string;
}[];
