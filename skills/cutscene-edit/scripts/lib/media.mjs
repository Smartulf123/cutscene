// Built from src/skills/cutscene-edit/scripts/lib/media.mts by `npm run build`. Edit that file, not this one.
// FFmpeg and FFprobe: finding them, probing media, detecting silence, decoding audio,
// measuring loudness. Cutscene (Apache-2.0).
import { spawnSync } from "node:child_process";
import { EditError } from "./cli.mjs";
const bin = (name) => process.env[`CUTSCENE_${name.toUpperCase()}`] || name;
export function hasFfmpeg() {
    try {
        const r = spawnSync(bin("ffmpeg"), ["-hide_banner", "-version"], { windowsHide: true, encoding: "utf8" });
        const p = spawnSync(bin("ffprobe"), ["-hide_banner", "-version"], { windowsHide: true, encoding: "utf8" });
        return r.status === 0 && p.status === 0;
    }
    catch {
        return false;
    }
}
function needFfmpeg(r, tool) {
    if (r.error && r.error.code === "ENOENT") {
        throw new EditError("FFMPEG_MISSING", `${tool} is not installed or not on PATH.`, "Install FFmpeg (https://ffmpeg.org/download.html), or set CUTSCENE_FFMPEG and CUTSCENE_FFPROBE to its programs. `cutscene doctor` checks it.");
    }
}
/**
 * Run ffmpeg. Throws a readable error on failure.
 */
export function ffmpeg(args, opts = {}) {
    const r = spawnSync(bin("ffmpeg"), ["-hide_banner", "-nostdin", ...args], {
        windowsHide: true,
        maxBuffer: 2 ** 31,
        encoding: opts.binary ? "buffer" : "utf8",
    });
    needFfmpeg(r, "FFmpeg");
    const stderr = opts.binary ? String(r.stderr ?? "") : r.stderr ?? "";
    if (r.status !== 0) {
        const tail = stderr.trim().split(/\r?\n/).slice(-4).join(" | ");
        throw new EditError("FFMPEG_FAILED", `FFmpeg could not ${opts.what ?? "process the media"}: ${tail}`, "Check that the file plays in a media player. Run the same command with CUTSCENE_DEBUG=1 for details.");
    }
    return { stdout: r.stdout, stderr };
}
/**
 * Basic facts about a media file.
 */
export function probe(file) {
    const r = spawnSync(bin("ffprobe"), ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,duration", "-of", "json", file], { windowsHide: true, encoding: "utf8" });
    needFfmpeg(r, "FFprobe");
    if (r.status !== 0)
        throw new EditError("PROBE_FAILED", `Cannot read the media file ${file}: ${(r.stderr || "").trim().split(/\r?\n/).pop()}`, "Check that the file exists and plays in a media player.");
    const j = JSON.parse(r.stdout);
    const v = (j.streams ?? []).find((s) => s.codec_type === "video");
    const a = (j.streams ?? []).find((s) => s.codec_type === "audio");
    const rate = (s) => {
        const [n, d] = String(s ?? "0/1").split("/").map(Number);
        return d ? n / d : 0;
    };
    const fps = v ? rate(v.avg_frame_rate) || rate(v.r_frame_rate) : undefined;
    return {
        duration: Number(j.format?.duration) || Number(v?.duration) || Number(a?.duration) || 0,
        hasVideo: !!v,
        hasAudio: !!a,
        width: v ? Number(v.width) : undefined,
        height: v ? Number(v.height) : undefined,
        fps: fps ? Math.round(fps * 1000) / 1000 : undefined,
        fpsRational: v ? (rate(v.r_frame_rate) ? v.r_frame_rate : v.avg_frame_rate) : undefined,
        sampleRate: a ? Number(a.sample_rate) : undefined,
        channels: a ? Number(a.channels) : undefined,
        videoDuration: v?.duration ? Number(v.duration) : undefined,
        audioDuration: a?.duration ? Number(a.duration) : undefined,
    };
}
/**
 * Parse FFmpeg silencedetect output into silent intervals.
 * @param duration closes a silence still open at the end
 */
export function parseSilences(stderr, duration) {
    const out = [];
    let open = null;
    for (const m of String(stderr).matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
        const t = Math.max(0, Number(m[2]));
        if (m[1] === "start")
            open = t;
        else if (open !== null) {
            out.push({ start: open, end: t });
            open = null;
        }
    }
    if (open !== null && Number.isFinite(duration) && duration > open)
        out.push({ start: open, end: duration });
    return out;
}
/**
 * Silent intervals in a file's audio.
 */
export function detectSilences(file, o = {}) {
    const noise = o.noiseDb ?? -35;
    const d = o.minSeconds ?? 0.12;
    const r = ffmpeg(["-i", file, "-vn", "-af", `silencedetect=n=${noise}dB:d=${d}`, "-f", "null", "-"], { what: "listen for silence" });
    return parseSilences(r.stderr, o.duration);
}
/**
 * The level of the quietest tenth of 100 ms slices, in dBFS: in speech, the pauses
 * (ported from Cutscene 1 media/cleanup.ts noiseFloor).
 * @param before filters to run first
 */
export function noiseFloor(file, before) {
    const chain = [before, "aresample=48000,asetnsamples=n=4800:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level"].filter(Boolean).join(",");
    const r = ffmpeg(["-i", file, "-vn", "-af", chain, "-f", "null", "-"], { what: "measure the noise floor" });
    return quietestTenth(r.stderr);
}
/** Pure part of noiseFloor, for tests. */
export function quietestTenth(stderr) {
    const levels = [...String(stderr).matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1]))).filter((v) => Number.isFinite(v));
    if (!levels.length)
        return -120;
    levels.sort((a, b) => a - b);
    const quiet = levels.slice(0, Math.max(1, Math.floor(levels.length / 10)));
    return quiet.reduce((s, v) => s + v, 0) / quiet.length;
}
/**
 * Decode a file's audio to mono float samples.
 */
export function decodeMono(file, o = {}) {
    const rate = o.rate ?? 16000;
    const args = ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(rate)];
    if (o.filter)
        args.push("-af", o.filter);
    const r = ffmpeg([...args, "-f", "s16le", "-"], { binary: true, what: "decode the audio" });
    const buf = r.stdout;
    const s = new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
    const out = new Float32Array(s.length);
    for (let i = 0; i < s.length; i++)
        out[i] = s[i] / 32768;
    return out;
}
/**
 * Integrated loudness (LUFS), loudness range and true peak (dBTP) of a file, from EBU R128.
 */
export function loudness(file) {
    const r = ffmpeg(["-i", file, "-vn", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], { what: "measure loudness" });
    return parseEbur128(r.stderr);
}
/** Pure parser for the ebur128 summary block. */
export function parseEbur128(stderr) {
    const text = String(stderr);
    const summary = text.slice(text.lastIndexOf("Summary:"));
    const num = (re) => {
        const m = summary.match(re);
        return m ? Number(m[1]) : null;
    };
    return {
        integratedLufs: num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/),
        rangeLu: num(/LRA:\s+(-?[\d.]+)\s+LU/),
        truePeakDbtp: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/),
    };
}
