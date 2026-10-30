// Built from src/skills/cutscene-edit/scripts/lib/music.mts by `npm run build`. Edit that file, not this one.
/** A beat grid measured by musicGrid. */
export type MusicGrid = {
    period: number;
    bpm: number;
    phase: number;
    fullBandPhase: number;
    kickContrast: number;
    halfBeatWarning: boolean;
    duration: number;
    bars: {
        bar: number;
        beat: number;
        t: number;
        rms_db: number;
        low_db: number;
        onset: number;
    }[];
    beats: {
        beat: number;
        t: number;
        low_db: number;
    }[];
};
/** One chapter of a cut sheet. */
export type CutSheetRow = {
    chapter: string;
    beatStart: number;
    beatEnd: number;
    start: number;
    end: number;
    frameStart: number;
    frameEnd: number;
    cuts: {
        beat: number;
        t: number;
        frame: number;
    }[];
};
/** The cut sheet beatgrid prints. */
export type CutSheet = {
    period: number;
    bpm: number;
    fps: number;
    length: number;
    frames: number;
    framesPerBeat: number;
    rows: CutSheetRow[];
};
/** FFmpeg loudnorm's measurement summary (its values are strings). */
export type LoudnormJson = {
    input_i: string;
    input_tp: string;
    input_lra: string;
    input_thresh: string;
    target_offset: string;
    [k: string]: unknown;
};
/** Mean energy per window. */
export declare function energy(x: Float32Array, hop: number, win: number): number[];
/** Positive log-energy changes: where sounds start. */
export declare function onset(e: number[]): number[];
/** Fold onsets at period P into bins: the strongest bin is the beat's phase. */
export declare function fold(o: number[], P: number, bins: number, rate: number, lead: number): {
    strength: number;
    phase: number;
    contrast: number;
};
/**
 * Beat grid from decoded audio.
 * @param full  mono samples at `sr`
 * @param low   the same audio low-passed at 120 Hz (the kick band)
 */
export declare function musicGrid(full: Float32Array, low: Float32Array, o?: {
    bpm?: number;
    sr?: number;
}): MusicGrid;
/**
 * FFmpeg filtergraph that splices beat ranges of a take, on the grid.
 */
export declare function spliceGraph(o: {
    period: number;
    phase?: number;
    segments: [number, number][];
    length?: number;
    gapBeat?: number | null;
    fade?: number;
}): string;
/** "4-28,48-56.7" -> [[4,28],[48,56.7]] */
export declare function parseSegments(s: string | undefined): [number, number][];
/**
 * Chapters on the beat grid. A chapter is "Name:beats"; "rest" fills to the length. A chapter whose
 * name starts with "Flurry" lists one cut per beat, then per half beat (the cut rate speeds up).
 */
export declare function cutSheet(o: {
    period: number;
    fps?: number;
    length?: number;
    chapters: string;
}): CutSheet;
/**
 * Premix graph: bed plus sound effects placed in seconds.
 * @returns graph ending in [m]; inputs: 0 = bed, 1..n = events in order
 */
export declare function mixGraph(o: {
    bedGain?: number;
    events: {
        t: number;
        gain?: number;
        max?: number;
    }[];
    length: number;
}): string;
/** The loudnorm summary JSON at the end of FFmpeg's stderr. */
export declare function parseLoudnormJson(stderr: string): LoudnormJson;
