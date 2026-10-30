// Built from src/skills/cutscene-edit/scripts/lib/transcript.mts by `npm run build`. Edit that file, not this one.
export type Word = {
    text: string;
    start: number;
    end: number;
    type?: string;
    source_start?: number;
    source_end?: number;
    speaker?: string;
    refined?: string;
    end_estimated?: boolean;
    clipped?: boolean;
    in_silence?: boolean;
};
export type Transcript = {
    version?: number;
    kind?: string;
    timeline?: "source" | "edited";
    source?: string | null;
    edl?: string | null;
    language_code?: string;
    audio_duration_secs?: number;
    source_audio_duration_secs?: number;
    produced_by?: string;
    words: Word[];
    [k: string]: unknown;
};
/** A word as some transcriber wrote it, before normalizeTranscript. */
export type RawWord = {
    text?: unknown;
    word?: unknown;
    punctuated_word?: unknown;
    start?: unknown;
    end?: unknown;
    type?: string;
    [k: string]: unknown;
};
/** Any transcript shape normalizeTranscript accepts. */
export type RawTranscript = RawWord[] | {
    words?: RawWord[];
    segments?: {
        words?: RawWord[];
    }[];
    [k: string]: unknown;
} | null | undefined;
/**
 * Accepts the engine's transcript (an array of {text,start,end}), the kit shape
 * ({words:[...]}), Whisper-style {segments:[{words:[...]}]} or {word,start,end} items.
 */
export declare function normalizeTranscript(raw: RawTranscript): Transcript;
/** Real spoken words with numeric timing (the kit's filter: spacing and audio events go). */
export declare function spokenWords(t: Transcript): Word[];
/** Rough length of a word as spoken, from its letters (seconds). */
export declare function expectedWordSeconds(text: string): number;
/**
 * Tighten word boundaries against measured silence. Speech recognisers often stretch a word over
 * the pause after it (or start it early), which hides pauses from a transcript-based cutter.
 * @param words  sorted by start
 */
export declare function refineWithSilences(words: Word[], silences: {
    start: number;
    end: number;
}[], o?: {
    minWord?: number;
}): {
    words: Word[];
    changed: number;
};
/**
 * Where no silence could be measured (speech over music), a word far longer than its letters
 * allow has probably swallowed the pause after it. Shorten it and mark the end as estimated.
 */
export declare function capStretchedWords(words: Word[], o?: {
    factor?: number;
    minSeconds?: number;
}): {
    words: Word[];
    changed: number;
};
/**
 * A transcript in Cutscene's editing shape.
 */
export declare function makeTranscript(words: Word[], meta: Partial<Transcript>): Transcript;
/**
 * Phrase-level reading view (the "packed transcript" idea from video-use): one line per phrase,
 * broken at pauses of `gap` seconds or more, each with its time range. Agents read this
 * instead of watching frames.
 */
export declare function packPhrases(words: {
    text: string;
    start: number;
    end: number;
}[], o?: {
    gap?: number;
}): {
    start: number;
    end: number;
    text: string;
    words: number;
}[];
/** Words to readable text, punctuation tucked in. */
export declare function joinWords(ws: {
    text: string;
}[]): string;
/** The packed view as text lines: "[002.52-005.36] Ninety percent of ..." */
export declare function packedText(words: {
    text: string;
    start: number;
    end: number;
}[], o?: {
    gap?: number;
}): string;
