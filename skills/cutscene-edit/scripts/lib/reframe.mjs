// Built from src/skills/cutscene-edit/scripts/lib/reframe.mts by `npm run build`. Edit that file, not this one.
// Ported from Cutscene 1 src/lib/project/reframe.ts (Apache-2.0); plain ESM JS for Cutscene 2,
// plus an FFmpeg crop expression so the keyframes can be rendered.
//
// Auto-reframe: turn a face track into keyframes for where a narrower frame (a 9:16 short cut from
// 16:9 footage) should sit, like a calm camera operator: follow the main face, hold still while it
// stays near the middle, move smoothly when it doesn't. A keyframe's `p` is the crop position along
// x: 0 = the left edge of the source, 1 = the right edge (CSS object-position).
export const REFRAME_DEFAULTS = { deadZone: 0.12, settle: 0.6 };
/** Width of the source a frame of `frameAspect` shows (1 = everything). */
export function visibleWidth(sourceAspect, frameAspect) {
    return Math.min(1, frameAspect / sourceAspect);
}
/** "9:16" -> 0.5625 */
export function parseAspect(s) {
    const m = String(s).match(/^(\d+(?:\.\d+)?)[:/x](\d+(?:\.\d+)?)$/);
    if (m)
        return Number(m[1]) / Number(m[2]);
    const n = Number(s);
    if (Number.isFinite(n) && n > 0)
        return n;
    throw new Error(`Aspect must look like 9:16, 4:5 or 1:1 (got "${s}").`);
}
/** The main face's centre per sample (null where there is none): biggest, then nearest the last one. */
export function mainFaceCentres(track, minScore = 0.6) {
    let last = null;
    return track.frames.map((faces) => {
        const good = faces.filter((f) => f.score >= minScore);
        if (!good.length)
            return null;
        const biggest = Math.max(...good.map((f) => f.w * f.h));
        // Faces close in size to the biggest are candidates; keep following the same one.
        const candidates = good.filter((f) => f.w * f.h >= biggest * 0.6);
        const pick = last === null
            ? candidates.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b))
            : candidates.reduce((a, b) => (Math.abs(a.x + a.w / 2 - last) <= Math.abs(b.x + b.w / 2 - last) ? a : b));
        last = pick.x + pick.w / 2;
        return last;
    });
}
function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}
/**
 * Keyframes for the crop over the track's time span.
 */
export function reframeKeys(track, sourceAspect, frameAspect, opts = REFRAME_DEFAULTS) {
    const v = visibleWidth(sourceAspect, frameAspect);
    if (v >= 0.999 || track.frames.length === 0)
        return [];
    const raw = mainFaceCentres(track);
    const known = raw.findIndex((c) => c !== null);
    let hold = known >= 0 ? raw[known] : 0.5;
    const filled = raw.map((c) => (c === null ? hold : (hold = c)));
    // A one-second median removes detector jitter and single bad frames.
    const half = Math.max(1, Math.round(track.fps / 2));
    const smooth = filled.map((_, i) => median(filled.slice(Math.max(0, i - half), i + half + 1)));
    // The camera: still inside the dead zone, then an easing follow toward the face.
    const dz = opts.deadZone * v;
    const alpha = 1 - Math.exp(-1 / (track.fps * Math.max(0.05, opts.settle / 3)));
    let cam = smooth[0];
    let target = cam;
    const centres = smooth.map((c) => {
        if (Math.abs(c - cam) > dz || Math.abs(c - target) > dz)
            target = c;
        cam += (target - cam) * alpha;
        return cam;
    });
    const toP = (c) => Math.min(1, Math.max(0, (c - v / 2) / (1 - v)));
    const keys = centres.map((c, i) => ({ t: i / track.fps, p: toP(c) }));
    return simplify(keys, 0.004).map((k) => ({ t: Math.round(k.t * 1000) / 1000, p: Math.round(k.p * 10_000) / 10_000 }));
}
/** Ramer–Douglas–Peucker: drop keyframes a straight line between neighbours already explains. */
export function simplify(keys, epsilon) {
    if (keys.length <= 2)
        return keys;
    const first = keys[0];
    const last = keys.at(-1);
    let worst = 0;
    let at = 0;
    for (let i = 1; i < keys.length - 1; i++) {
        const k = keys[i];
        const span = last.t - first.t || 1;
        const expected = first.p + ((last.p - first.p) * (k.t - first.t)) / span;
        const d = Math.abs(k.p - expected);
        if (d > worst) {
            worst = d;
            at = i;
        }
    }
    if (worst <= epsilon)
        return [first, last];
    return [...simplify(keys.slice(0, at + 1), epsilon).slice(0, -1), ...simplify(keys.slice(at), epsilon)];
}
/** The crop position at time `t`, between keyframes. */
export function positionAt(keys, t) {
    if (!keys.length)
        return 0.5;
    if (t <= keys[0].t)
        return keys[0].p;
    for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1];
        const b = keys[i];
        if (t <= b.t)
            return a.p + ((b.p - a.p) * (t - a.t)) / (b.t - a.t || 1);
    }
    return keys.at(-1).p;
}
/**
 * Crop size for a target aspect inside a source frame (even numbers for H.264).
 */
export function cropSize(width, height, aspect) {
    const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
    if (width / height > aspect)
        return { w: even(height * aspect), h: even(height) };
    return { w: even(width), h: even(width / aspect) };
}
/** Keyframes one crop expression can carry (FFmpeg rejects expressions of about 90+ segments). */
export const KEYS_PER_PASS = 60;
/**
 * Split keyframes into time windows of at most `max` keys, each with its keys shifted to start at
 * 0 (a window is rendered on its own and its frames' t restart at 0). Window edges sit on frames.
 */
export function chunkKeys(keys, duration, fps, max = KEYS_PER_PASS) {
    if (keys.length <= max)
        return [{ from: 0, to: duration, keys }];
    const frame = (t) => Math.round(t * fps) / fps;
    const out = [];
    let i = 0;
    let from = 0;
    while (i < keys.length - 1) {
        const j = Math.min(keys.length - 1, i + max - 1);
        const last = j === keys.length - 1;
        const to = last ? duration : frame(keys[j].t);
        // Interpolated positions at the window edges, so neighbouring windows meet exactly.
        const inside = keys.slice(i, j + 1).filter((k) => k.t >= from && k.t <= to);
        const edge = (t) => ({ t, p: positionAt(keys, t) });
        const local = [edge(from), ...inside.filter((k) => k.t > from && k.t < to), edge(Math.min(to, keys.at(-1).t))].map((k) => ({ t: Math.round((k.t - from) * 1000) / 1000, p: k.p }));
        out.push({ from, to, keys: local });
        if (last)
            break;
        from = to;
        i = j;
    }
    if (out.at(-1).to < duration)
        out.at(-1).to = duration;
    return out;
}
/**
 * An FFmpeg crop x expression that follows the keyframes (piecewise linear in t). It is a flat sum
 * of gated segments, not nested if()s: FFmpeg's expression parser runs out of depth at around a
 * hundred nested calls, which a minute of face-following easily needs. Commas are escaped for a
 * filter script.
 * @param travel  source width minus crop width, in pixels
 */
export function cropXExpr(keys, travel) {
    const px = (p) => (p * travel).toFixed(2);
    if (!keys.length)
        return px(0.5);
    if (keys.length === 1)
        return px(keys[0].p);
    const t3 = (t) => t.toFixed(3);
    // crop evaluates x once with t = NaN while it configures; max(t,0) keeps that finite.
    const T = "max(t\\,0)";
    const terms = [`lt(${T}\\,${t3(keys[0].t)})*${px(keys[0].p)}`];
    for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1];
        const b = keys[i];
        const span = Math.max(1e-3, b.t - a.t);
        terms.push(`gte(${T}\\,${t3(a.t)})*lt(${T}\\,${t3(b.t)})*(${px(a.p)}+(${px(b.p)}-${px(a.p)})*(${T}-${t3(a.t)})/${span.toFixed(3)})`);
    }
    terms.push(`gte(${T}\\,${t3(keys.at(-1).t)})*${px(keys.at(-1).p)}`);
    return terms.join("+");
}
