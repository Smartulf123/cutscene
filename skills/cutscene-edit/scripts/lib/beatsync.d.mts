export declare const LEAD_MIN = -0.2;
export declare const LEAD_MAX = 1.8;
export declare const LEAD_SUGGESTED = 0.5;
/** One sub-composition entry in index.html. */
export type Beat = {
    id: string;
    src: string;
    startExpr: string;
    duration: number;
    anchor: string | null;
};
/** One line of the beat-sync report. */
export type BeatRow = {
    id: string;
    start: number | null;
    duration: number;
    src: string;
    anchor: string | null;
    wordStart: number | null;
    slack: number | null;
    status: string;
    detail: string;
};
/** Every sub-composition entry in index.html. */
export declare function parseIndex(html: string): Beat[];
/** Absolute starts: numbers, "bID" (starts when bID ends) or "bID + N" / "bID - N" (from bID's start). */
export declare function resolveStarts(beats: Beat[]): Map<string, number>;
/** The earliest word at or after minStart where the phrase begins. */
export declare function findAnchorStart(words: {
    text: string;
    start: number;
}[], phrase: string | null, minStart: number): number | null;
/** The anchor phrase inside a beat's HTML. */
export declare function anchorIn(html: string): string | null;
/**
 * Check every beat.
 * @param words  edited-timeline words
 * @param readBeat  returns the beat file's HTML, or null if missing
 */
export declare function checkBeatSync(beats: Beat[], words: {
    text: string;
    start: number;
}[], readBeat: (src: string) => string | null): BeatRow[];
