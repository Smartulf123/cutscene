// Built from src/skills/cutscene-edit/scripts/lib/silences.mts by `npm run build`. Edit that file, not this one.
// Adapted from Herk Edit Kit .claude/skills/cut-silences/scripts/cut-silences.mjs, commit 10511e5af8 (MIT + Herk Edit Kit Use Permission), Copyright (c) 2026 Nate Herk and kit contributors. Modified for Cutscene.
//
// Pause trimming from a word-level transcript: dead air before the first word and after the last,
// and pauses between words longer than a threshold, trimmed down to a natural breath rather than
// to zero. Words are never cut here; mistakes are find-cuts' job.
//
// Changes for Cutscene: a pure function (no file I/O), pace presets, a comma/colon beat, and the
// kept breath recorded on each cut so the review page can show it.
/** Pause thresholds by pace. */
export const PACES = { tight: 0.35, normal: 0.55, loose: 0.8 };
export const SILENCE_DEFAULTS = { gap: 0.55, headPad: 0.22, tailPad: 0.34 };
/**
 * The breath to keep in a pause, by context: longer for big pauses and sentence ends, a little
 * for a comma beat, short otherwise. Natural breaths stay between 0.14 and 0.24 s.
 * @param gap  the pause length in seconds
 * @param prevText  the word before the pause
 */
export function breathFor(gap, prevText) {
    if (gap >= 2)
        return 0.24;
    if (/[.!?]["')\]]?$/.test(prevText ?? ""))
        return 0.2;
    if (/[,;:]$/.test(prevText ?? ""))
        return 0.18;
    return 0.14;
}
/**
 * Ranges to delete (source seconds) for pure silence.
 * @param words  sorted spoken words
 */
export function planSilenceCuts(words, o) {
    const gapMin = o.gap ?? SILENCE_DEFAULTS.gap;
    const headPad = o.headPad ?? SILENCE_DEFAULTS.headPad;
    const tailPad = o.tailPad ?? SILENCE_DEFAULTS.tailPad;
    const duration = o.duration;
    const out = [];
    if (!words.length)
        return out;
    const headEnd = words[0].start - headPad;
    if (headEnd > 0.02)
        out.push({ start: 0, end: headEnd, reason: "dead air before the first word", kind: "head" });
    const tailStart = words.at(-1).end + tailPad;
    if (duration - tailStart > 0.02)
        out.push({ start: tailStart, end: duration, reason: "dead air after the last word", kind: "tail" });
    for (let i = 1; i < words.length; i++) {
        const prev = words[i - 1];
        const next = words[i];
        const gap = next.start - prev.end;
        if (gap < gapMin)
            continue;
        const keep = breathFor(gap, prev.text);
        // Bias the kept breath slightly toward the end of the previous phrase.
        const start = prev.end + keep * 0.55;
        const end = next.start - keep * 0.45;
        if (end > start)
            out.push({ start, end, reason: `pause ${gap.toFixed(2)} s trimmed to ${keep.toFixed(2)} s`, kind: "pause", pause: gap, kept: keep });
    }
    return out.sort((a, b) => a.start - b.start);
}
