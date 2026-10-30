// Built from src/skills/cutscene-edit/scripts/lib/sync.mts by `npm run build`. Edit that file, not this one.
/** Loudness over time: RMS of each `hop`-sample frame, as a log curve. */
export declare function envelope(samples: Float32Array, hop: number): Float32Array;
/** Changes in loudness (onsets), zero-mean and unit-variance, so mic level differences don't matter. */
export declare function normalizedOnsets(env: Float32Array): Float32Array;
/**
 * The shift (in frames) that best lines `b` up with `a`: b[i + lag] ≈ a[i]. Positive lag means the
 * same sound comes later in b. `confidence` is the best match over the next best (well apart), so
 * near 1 means "no clear answer".
 * Shifts where the two overlap by less than `minOverlap` frames (default: half the shorter one)
 * are not considered: a sliver of overlap matches anything by chance.
 */
export declare function bestLag(a: Float32Array, b: Float32Array, maxLag: number, minOverlap?: number): {
    lag: number;
    score: number;
    confidence: number;
};
