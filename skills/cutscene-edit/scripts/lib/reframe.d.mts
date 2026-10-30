export type FaceSample = {
    x: number;
    y: number;
    w: number;
    h: number;
    score: number;
};
export type FaceFrames = {
    fps: number;
    frames: FaceSample[][];
};
export type ReframeKey = {
    t: number;
    p: number;
};
export declare const REFRAME_DEFAULTS: {
    deadZone: number;
    settle: number;
};
/** Width of the source a frame of `frameAspect` shows (1 = everything). */
export declare function visibleWidth(sourceAspect: number, frameAspect: number): number;
/** "9:16" -> 0.5625 */
export declare function parseAspect(s: string): number;
/** The main face's centre per sample (null where there is none): biggest, then nearest the last one. */
export declare function mainFaceCentres(track: FaceFrames, minScore?: number): (number | null)[];
/**
 * Keyframes for the crop over the track's time span.
 */
export declare function reframeKeys(track: FaceFrames, sourceAspect: number, frameAspect: number, opts?: {
    deadZone: number;
    settle: number;
}): ReframeKey[];
/** Ramer–Douglas–Peucker: drop keyframes a straight line between neighbours already explains. */
export declare function simplify(keys: ReframeKey[], epsilon: number): ReframeKey[];
/** The crop position at time `t`, between keyframes. */
export declare function positionAt(keys: ReframeKey[], t: number): number;
/**
 * Crop size for a target aspect inside a source frame (even numbers for H.264).
 */
export declare function cropSize(width: number, height: number, aspect: number): {
    w: number;
    h: number;
};
/** Keyframes one crop expression can carry (FFmpeg rejects expressions of about 90+ segments). */
export declare const KEYS_PER_PASS = 60;
/**
 * Split keyframes into time windows of at most `max` keys, each with its keys shifted to start at
 * 0 (a window is rendered on its own and its frames' t restart at 0). Window edges sit on frames.
 */
export declare function chunkKeys(keys: ReframeKey[], duration: number, fps: number, max?: number): {
    from: number;
    to: number;
    keys: ReframeKey[];
}[];
/**
 * An FFmpeg crop x expression that follows the keyframes (piecewise linear in t). It is a flat sum
 * of gated segments, not nested if()s: FFmpeg's expression parser runs out of depth at around a
 * hundred nested calls, which a minute of face-following easily needs. Commas are escaped for a
 * filter script.
 * @param travel  source width minus crop width, in pixels
 */
export declare function cropXExpr(keys: ReframeKey[], travel: number): string;
