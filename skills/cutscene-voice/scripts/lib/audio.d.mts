/** loudnorm's first-pass measurement. */
export interface Loudnorm {
    input_i: number;
    input_tp: number;
    input_lra: number;
    input_thresh: number;
    target_offset: number;
}
export declare const LOUDNESS: Readonly<{
    lufs: -16;
    tp: -1.5;
    lra: 11;
}>;
export declare function ffmpegPath(env?: NodeJS.ProcessEnv): string | null;
/** Pull loudnorm's JSON block out of FFmpeg's log. */
export declare function parseLoudnorm(stderr: string | undefined): Loudnorm | null;
/** The second-pass filter, built from the first pass's measurement. */
export declare function loudnormFilter(m: Loudnorm, t?: {
    lufs: number;
    tp: number;
    lra: number;
}): string;
/**
 * Master a raw take into the final line file.
 */
export declare function masterLine(src: string, dst: string, { ffmpeg }?: {
    ffmpeg?: string | null;
}): Promise<{
    normalized: boolean;
    before?: number;
    after?: number;
    note?: string;
}>;
/** Convert any audio file into a mono 24 kHz WAV reference (first 30 s at most). */
export declare function toReferenceWav(src: string, dst: string, { ffmpeg, maxSeconds }?: {
    ffmpeg?: string | null;
    maxSeconds?: number;
}): Promise<void>;
