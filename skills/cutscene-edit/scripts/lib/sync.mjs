// Ported from Cutscene 1 src/lib/media/sync-math.ts (Apache-2.0); plain ESM JS for Cutscene 2.
//
// Lining up two recordings of the same moment (a screen recording with its microphone, and a
// camera clip) by their sound: compare their loudness over time and find the shift where they
// match best. The method follows BBC R&D's audio-offset-finder (cross-correlation of short-time
// energy); no code copied.

/** Loudness over time: RMS of each `hop`-sample frame, as a log curve. */
export function envelope(samples, hop) {
  const n = Math.floor(samples.length / hop);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) sum += samples[j] * samples[j];
    out[i] = Math.log10(1e-6 + Math.sqrt(sum / hop));
  }
  return out;
}

/** Changes in loudness (onsets), zero-mean and unit-variance, so mic level differences don't matter. */
export function normalizedOnsets(env) {
  const d = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) d[i] = Math.max(0, env[i] - env[i - 1]);
  let mean = 0;
  for (const v of d) mean += v;
  mean /= Math.max(1, d.length);
  let sd = 0;
  for (const v of d) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / Math.max(1, d.length)) || 1;
  for (let i = 0; i < d.length; i++) d[i] = (d[i] - mean) / sd;
  return d;
}

/**
 * The shift (in frames) that best lines `b` up with `a`: b[i + lag] ≈ a[i]. Positive lag means the
 * same sound comes later in b. `confidence` is the best match over the next best (well apart), so
 * near 1 means "no clear answer".
 * Shifts where the two overlap by less than `minOverlap` frames (default: half the shorter one)
 * are not considered: a sliver of overlap matches anything by chance.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @param {number} maxLag
 * @param {number} [minOverlap]
 */
export function bestLag(a, b, maxLag, minOverlap = Math.max(1, Math.floor(0.5 * Math.min(a.length, b.length)))) {
  const scores = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0;
    let n = 0;
    const i0 = Math.max(0, -lag);
    const i1 = Math.min(a.length, b.length - lag);
    for (let i = i0; i < i1; i++) {
      sum += a[i] * b[i + lag];
      n++;
    }
    if (n >= minOverlap) scores.push({ lag, score: sum / n });
  }
  scores.sort((x, y) => y.score - x.score);
  const best = scores[0] ?? { lag: 0, score: 0 };
  const apart = Math.max(5, Math.round(maxLag / 50));
  const second = scores.find((s) => Math.abs(s.lag - best.lag) > apart)?.score ?? 0;
  return { lag: best.lag, score: best.score, confidence: second > 0 ? best.score / second : best.score > 0 ? 10 : 0 };
}
