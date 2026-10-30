// Built from src/skills/cutscene-voice/scripts/lib/audio.mts by `npm run build`. Edit that file, not this one.
// FFmpeg steps for voice lines: two-pass loudness normalisation for finished lines, and
// conversion of a user's recording into a clean mono reference clip.
//
// Mastering chain (the -16 LUFS / two-pass idea is common practice; showtime (MIT) documents
// a similar chain): 70 Hz high-pass, then loudnorm measured first and applied linearly, so
// every line sits at the same loudness without pumping. Output: 48 kHz mono 16-bit WAV.
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { findOnPath, run } from "./proc.mjs";
import { VoiceError } from "./util.mjs";
export const LOUDNESS = Object.freeze({ lufs: -16, tp: -1.5, lra: 11 });
export function ffmpegPath(env = process.env) {
    if (env.CUTSCENE_FFMPEG && existsSync(env.CUTSCENE_FFMPEG))
        return env.CUTSCENE_FFMPEG;
    return findOnPath("ffmpeg", env);
}
/** Pull loudnorm's JSON block out of FFmpeg's log. */
export function parseLoudnorm(stderr) {
    const m = /\{[^{}]*"input_i"[^{}]*\}/s.exec(stderr || "");
    if (!m)
        return null;
    const d = JSON.parse(m[0]);
    const num = (v) => (v === "-inf" ? -Infinity : v === "inf" ? Infinity : Number(v));
    return { input_i: num(d.input_i), input_tp: num(d.input_tp), input_lra: num(d.input_lra), input_thresh: num(d.input_thresh), target_offset: num(d.target_offset) };
}
/** The second-pass filter, built from the first pass's measurement. */
export function loudnormFilter(m, t = LOUDNESS) {
    return `highpass=f=70,loudnorm=I=${t.lufs}:TP=${t.tp}:LRA=${t.lra}:measured_I=${m.input_i.toFixed(2)}:measured_TP=${m.input_tp.toFixed(2)}:measured_LRA=${m.input_lra.toFixed(2)}:measured_thresh=${m.input_thresh.toFixed(2)}:offset=${m.target_offset.toFixed(2)}:linear=true`;
}
/**
 * Master a raw take into the final line file.
 */
export async function masterLine(src, dst, { ffmpeg = ffmpegPath() } = {}) {
    mkdirSync(dirname(dst), { recursive: true });
    if (!ffmpeg) {
        copyFileSync(src, dst);
        return { normalized: false, note: "FFmpeg wasn't found, so the line is not loudness-normalised. Install FFmpeg and speak it again." };
    }
    const t = LOUDNESS;
    const measure = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", src, "-af", `highpass=f=70,loudnorm=I=${t.lufs}:TP=${t.tp}:LRA=${t.lra}:print_format=json`, "-f", "null", "-"], { timeoutMs: 120_000 });
    const m = parseLoudnorm(measure.stderr);
    const tmp = dst + ".part.wav";
    if (!m || !Number.isFinite(m.input_i) || m.input_i < -70) {
        copyFileSync(src, dst);
        return { normalized: false, note: m ? "The take is (nearly) silent; it was kept as it is." : "FFmpeg couldn't measure the loudness; the take was kept as it is." };
    }
    const out = await run(ffmpeg, ["-hide_banner", "-nostats", "-y", "-i", src, "-af", `${loudnormFilter(m)},aresample=48000`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", tmp], { timeoutMs: 120_000 });
    if (out.code !== 0 || !existsSync(tmp)) {
        rmSync(tmp, { force: true });
        throw new VoiceError("FFMPEG_FAILED", "FFmpeg couldn't normalise the voice line.", out.stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(" "));
    }
    rmSync(dst, { force: true });
    renameSync(tmp, dst);
    const check = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", dst, "-af", `loudnorm=I=${t.lufs}:TP=${t.tp}:LRA=${t.lra}:print_format=json`, "-f", "null", "-"], { timeoutMs: 120_000 });
    const after = parseLoudnorm(check.stderr);
    return { normalized: true, before: Math.round(m.input_i * 10) / 10, after: after ? Math.round(after.input_i * 10) / 10 : undefined };
}
/** Convert any audio file into a mono 24 kHz WAV reference (first 30 s at most). */
export async function toReferenceWav(src, dst, { ffmpeg = ffmpegPath(), maxSeconds = 30 } = {}) {
    if (!ffmpeg)
        throw new VoiceError("FFMPEG_MISSING", "FFmpeg is needed to read the recording.", "Install FFmpeg (https://ffmpeg.org) and run `cutscene doctor`.");
    mkdirSync(dirname(dst), { recursive: true });
    const tmp = dst + ".part.wav";
    const out = await run(ffmpeg, ["-hide_banner", "-nostats", "-y", "-i", src, "-vn", "-t", String(maxSeconds), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", tmp], { timeoutMs: 120_000 });
    if (out.code !== 0 || !existsSync(tmp)) {
        rmSync(tmp, { force: true });
        throw new VoiceError("BAD_RECORDING", "That file couldn't be read as audio.", "Use a WAV, MP3, M4A or video file with a clear voice.");
    }
    rmSync(dst, { force: true });
    renameSync(tmp, dst);
}
