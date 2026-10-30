export interface WavInfo {
    sampleRate: number;
    channels: number;
    bits: number;
    format: number;
    dataOffset: number;
    dataBytes: number;
    frames: number;
    duration: number;
}
/**
 * Parse a RIFF/WAVE buffer. Supports PCM 16/24/32-bit and 32-bit float.
 */
export declare function parseWav(buf: Buffer): WavInfo;
export declare function wavInfo(file: string): WavInfo;
/** Mono float samples (channels averaged). */
export declare function readSamples(file: string): {
    samples: Float32Array;
    sampleRate: number;
};
/**
 * How alike two takes are: identical, or correlation of the samples (1 = same waveform).
 */
export declare function compareWavs(a: string, b: string): {
    identical: boolean;
    sameLength: boolean;
    correlation: number;
    maxDiff: number;
    durations: number[];
};
