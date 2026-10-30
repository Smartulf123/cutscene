export type Range = {
    start: number;
    end: number;
    reasons?: string[];
    reason?: string;
};
export type Keep = {
    start: number;
    end: number;
    out_start: number;
    out_end: number;
};
export type Edl = {
    version: 1;
    kind: "cutscene-edl";
    tool: string;
    source: string | null;
    fps: number;
    source_duration: number;
    edited_duration: number;
    removed: number;
    params?: Record<string, unknown>;
    keep_ranges: Keep[];
    delete_ranges: {
        start: number;
        end: number;
        reasons: string[];
    }[];
    parent?: string | null;
    created?: string;
};
/** An EDL as read from a file: a Cutscene EDL, or a kit EDL that has no output positions yet. */
export type LooseEdl = {
    keep_ranges?: {
        start: number;
        end: number;
        out_start?: number;
        out_end?: number;
    }[];
    delete_ranges?: {
        start: number;
        end: number;
        reasons?: string[];
        reason?: string;
    }[];
    source_duration?: unknown;
    fps?: number;
    edited_duration?: number;
    [k: string]: unknown;
};
/** A word retimed onto the edited video, with its source times kept. */
export type Retimed<W> = Omit<W, "start" | "end"> & {
    start: number;
    end: number;
    source_start: number;
    source_end: number;
    clipped?: boolean;
};
/** Snap a time to the nearest frame. */
export declare function snap(t: number, fps: number): number;
/**
 * Sort and merge overlapping or touching ranges, keeping every reason.
 */
export declare function mergeRanges(ranges: Range[], touch?: number): {
    start: number;
    end: number;
    reasons: string[];
}[];
/**
 * The parts of [0, duration) not covered by `deletes`.
 * @param deletes merged and sorted
 */
export declare function complement(deletes: {
    start: number;
    end: number;
}[], duration: number): {
    start: number;
    end: number;
}[];
/**
 * Build a frame-aligned EDL from ranges to delete (source seconds).
 */
export declare function buildEdl(o: {
    deletes: Range[];
    duration: number;
    fps?: number;
    tool: string;
    source?: string | null;
    params?: Record<string, unknown>;
    minKeep?: number;
    parent?: string | null;
}): Edl;
/**
 * An output (edited) time back on the source.
 */
export declare function outToSource(edl: Edl, t: number): number;
/**
 * A source time on the output, or null when it was cut.
 */
export declare function sourceToOut(edl: Edl, t: number): number | null;
/**
 * Turn cuts made on a parent edit's OUTPUT into one EDL on the original source, so the final
 * video is cut from the original in one pass (no second encode, no drift).
 */
export declare function composeEdl(parent: Edl, cutsOnOutput: Range[], o: {
    tool: string;
    params?: Record<string, unknown>;
    parentPath?: string | null;
}): Edl;
/**
 * Retime words (source times) onto the edited video. Words fully inside a cut are dropped; a word
 * a cut boundary runs through is clipped to its kept part and marked `clipped`.
 * @param words  source-timeline words
 */
export declare function retimeWords<W extends {
    text: string;
    start: number;
    end: number;
}>(words: W[], edl: Edl): {
    words: Retimed<W>[];
    dropped: number;
    clipped: number;
};
/**
 * Source-timeline words from any transcript: edited transcripts carry source_start/source_end.
 */
export declare function sourceTimes<W extends {
    start: number;
    end: number;
    source_start?: number;
    source_end?: number;
}>(words: W[]): W[];
/**
 * FFmpeg filtergraph: trim each kept range, short audio fades at every join (no clicks), concat.
 */
export declare function filterScript(keeps: {
    start: number;
    end: number;
}[], o?: {
    video?: boolean;
    audio?: boolean;
    fade?: number;
}): string;
/** Validate that a JSON object is a Cutscene EDL (or a kit EDL we can read). */
export declare function asEdl(obj: LooseEdl | null | undefined, path?: string): Edl;
