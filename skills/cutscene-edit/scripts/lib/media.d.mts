/** Basic facts about a media file, from FFprobe. */
export type MediaProbe = {
    duration: number;
    hasVideo: boolean;
    hasAudio: boolean;
    width?: number;
    height?: number;
    fps?: number;
    fpsRational?: string;
    sampleRate?: number;
    channels?: number;
    videoDuration?: number;
    audioDuration?: number;
};
export declare function hasFfmpeg(): boolean;
/**
 * Run ffmpeg. Throws a readable error on failure.
 */
export declare function ffmpeg(args: string[], opts?: {
    binary?: boolean;
    quiet?: boolean;
    what?: string;
}): {
    stdout: string | Buffer;
    stderr: string;
};
/**
 * Basic facts about a media file.
 */
export declare function probe(file: string): MediaProbe;
/**
 * Parse FFmpeg silencedetect output into silent intervals.
 * @param duration closes a silence still open at the end
 */
export declare function parseSilences(stderr: string, duration?: number): {
    start: number;
    end: number;
}[];
/**
 * Silent intervals in a file's audio.
 */
export declare function detectSilences(file: string, o?: {
    noiseDb?: number;
    minSeconds?: number;
    duration?: number;
}): {
    start: number;
    end: number;
}[];
/**
 * The level of the quietest tenth of 100 ms slices, in dBFS: in speech, the pauses
 * (ported from Cutscene 1 media/cleanup.ts noiseFloor).
 * @param before filters to run first
 */
export declare function noiseFloor(file: string, before?: string): number;
/** Pure part of noiseFloor, for tests. */
export declare function quietestTenth(stderr: string): number;
/**
 * Decode a file's audio to mono float samples.
 */
export declare function decodeMono(file: string, o?: {
    rate?: number;
    filter?: string;
}): Float32Array;
/**
 * Integrated loudness (LUFS), loudness range and true peak (dBTP) of a file, from EBU R128.
 */
export declare function loudness(file: string): Loudness;
/** Loudness figures from EBU R128; null where FFmpeg printed none. */
export type Loudness = {
    integratedLufs: number | null;
    rangeLu: number | null;
    truePeakDbtp: number | null;
};
/** Pure parser for the ebur128 summary block. */
export declare function parseEbur128(stderr: string): Loudness;
