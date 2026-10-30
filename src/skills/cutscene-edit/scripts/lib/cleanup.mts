// Ported from Cutscene 1 src/lib/media/cleanup.ts (Apache-2.0); plain ESM JS for Cutscene 2.
//
// Audio repair with FFmpeg filters, written to a copy (video copied untouched):
// - hum: mains hum (50 Hz in Europe, 60 Hz in the Americas) and its harmonics, removed with narrow
//   notches plus a gentle high-pass under the voice;
// - noise: steady hiss and rumble, reduced with FFmpeg's FFT denoiser (afftdn), told how loud the
//   noise really is (measured from the pauses).

export const STRENGTHS: Record<"light" | "normal" | "strong", number> = { light: 12, normal: 24, strong: 36 };

/** Notch hum at the 50 and 60 Hz families; speech above 80 Hz stays. */
export function humFilters(): string[] {
  const notches = [100, 120, 150, 180, 200, 240, 250, 300].map((f) => `bandreject=f=${f}:width_type=q:w=25`);
  // Fundamentals (50/60 Hz) sit below speech: a high-pass takes them and low rumble.
  return ["highpass=f=80:poles=2", ...notches];
}

/**
 * The filter chain. `floor` is the measured noise floor in dBFS.
 */
export function cleanupFilter(o: { hum: boolean; noise: boolean; strength: "light" | "normal" | "strong" }, floor: number = -50): string {
  const parts: string[] = [];
  if (o.hum) parts.push(...humFilters());
  if (o.noise) {
    const nr = STRENGTHS[o.strength] ?? STRENGTHS.normal;
    // afftdn's floor is per band; the overall level in quiet slices sits about 10 dB under it, and
    // set too low the denoiser takes the noise for signal and leaves it.
    const nf = Math.round(Math.max(-80, Math.min(-20, floor + 10)));
    parts.push(`afftdn=nr=${nr}:nf=${nf}:tn=1`);
  }
  return parts.join(",") || "anull";
}
