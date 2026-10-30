// Built from src/skills/cutscene-edit/scripts/lib/silences.mts by `npm run build`. Edit that file, not this one.
/** A pause cut, with the breath it keeps. */
export type SilenceCut = {
    start: number;
    end: number;
    reason: string;
    kind: "head" | "tail" | "pause";
    pause?: number;
    kept?: number;
};
/** Pause thresholds by pace. */
export declare const PACES: Record<string, number>;
export declare const SILENCE_DEFAULTS: {
    gap: number;
    headPad: number;
    tailPad: number;
};
/**
 * The breath to keep in a pause, by context: longer for big pauses and sentence ends, a little
 * for a comma beat, short otherwise. Natural breaths stay between 0.14 and 0.24 s.
 * @param gap  the pause length in seconds
 * @param prevText  the word before the pause
 */
export declare function breathFor(gap: number, prevText: string | undefined): number;
/**
 * Ranges to delete (source seconds) for pure silence.
 * @param words  sorted spoken words
 */
export declare function planSilenceCuts(words: {
    text: string;
    start: number;
    end: number;
}[], o: {
    duration: number;
    gap?: number;
    headPad?: number;
    tailPad?: number;
}): SilenceCut[];
