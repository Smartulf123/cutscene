// Built from src/skills/cutscene-voice/scripts/lib/text.mts by `npm run build`. Edit that file, not this one.
/** A word as the transcriber heard it (p = its probability, when known). */
export type HeardWord = {
    w: string;
    start: number;
    end: number;
    p?: number;
};
/** One comparable token: the normalised word and the index of the display word it came from. */
export type Token = {
    t: string;
    src: number;
};
export type AlignOp = "ok" | "merge" | "sub" | "del" | "ins";
export type AlignStep = {
    op: AlignOp;
    e: number[];
    h: number[];
};
/** What's wrong with a line (or, for "other_line", which line it sounds like). */
export interface LineIssue {
    type: "wrong" | "missing" | "extra" | "empty" | "other_line";
    expected?: string;
    heard?: string;
    script?: string;
    at?: number;
    id?: string;
    message?: string;
}
/** Something to listen to; it doesn't fail the line. */
export interface LineWarning {
    type: "unsure" | "fast" | "slow" | "lead_silence" | "tail_silence";
    message: string;
    word?: string;
    p?: number;
    at?: number | null;
}
/**
 * A caption word: the script's spelling with the heard timing. Words that were never heard get
 * estimated times; start and end are null only while judgeLine is still filling them in.
 */
export interface CaptionWord {
    w: string;
    start: number | null;
    end: number | null;
    p: number;
    estimated?: boolean;
}
export interface LineVerdict {
    verified: boolean;
    issues: LineIssue[];
    warnings: LineWarning[];
    words: CaptionWord[];
    heard: string;
    wer: number;
}
/** 42 -> ["forty", "two"]. Whole numbers below 10^15; larger ones are read digit by digit. */
export declare function integerWords(n: number): string[];
/** "3.14" -> three point one four; "1,200" -> one thousand two hundred; "4th" -> fourth. */
export declare function numberWords(token: string): string[] | null;
/** Harmless spelling differences: colour/color, organise/organize, centre/center, doubled letters. */
export declare function foldSpelling(w: string): string;
/**
 * Split text into display words and comparable tokens.
 * Each token is {t, src}: the normalised word and the index of the display word it came from.
 * @param lang ISO code; numbers become words only for English.
 */
export declare function tokenize(text: string | null | undefined, lang?: string): {
    display: string[];
    tokens: Token[];
};
/** Lowercase words with punctuation removed, numbers as words: for quick comparisons. */
export declare function normalizeWords(text: string, lang?: string): string[];
/**
 * Align expected tokens with heard tokens (edit distance, plus free merges so that
 * "cut scene" and "cutscene" match). Returns ops in order:
 * {op: "ok"|"merge"|"sub"|"del"|"ins", e: [indices into expected], h: [indices into heard]}.
 */
export declare function align(exp: string[], heard: string[]): AlignStep[];
/** Word error rate of heard against expected (0 = identical). */
export declare function wordErrorRate(exp: string[], heard: string[]): number;
export declare const LOW_PROBABILITY = 0.45;
/**
 * Compare a line's script with what Whisper heard.
 * @param line the script text
 * @param heardWords from the transcriber
 */
export declare function judgeLine(line: string, heardWords: HeardWord[], opts?: {
    lang?: string;
    duration?: number;
    lowProbability?: number;
    otherLines?: {
        id: string;
        line: string;
    }[];
}): LineVerdict;
/** One-line human summary for a judged line. */
export declare function describeIssue(issue: LineIssue): string;
export declare const OMNIVOICE_TAGS: {
    gender: string[];
    age: string[];
    pitch: string[];
    style: string[];
    accent: string[];
};
export declare function editDistance(a: string, b: string): number;
/**
 * Turn a description into OmniVoice's voice-design tags.
 * "Female, young adult, American accent" -> "female, young adult, american accent".
 */
export declare function parseOmniVoiceDescription(describe: string | null | undefined): {
    ok: boolean;
    instruct: string;
    tags: string[];
    unknown: {
        item: string;
        suggestion: string | null;
    }[];
    conflicts: string[][];
};
/** Pick a Kokoro preset that best fits a description (Kokoro has presets only, no design). */
export declare function pickKokoroVoice(describe?: string, lang?: string): string;
/** Rough line length in seconds from its words (about 2.6 words per second). */
export declare function estimateSeconds(line: string, lang?: string): number;
