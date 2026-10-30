// Built from src/skills/cutscene-3d/scripts/lib/encode.mts by `npm run build`. Edit that file, not this one.
// FFmpeg argument builders for Cutscene 3D: transparent VP9 WebM, poster, contact sheet, alpha check.
import { spawnSync } from "node:child_process";
/** PNG RGBA sequence -> VP9 WebM with real alpha (the engine reads alpha_mode=1). */
export function encodeArgs({ framesDir, fps, out, crf = 28, pattern = "frame_%04d.png", start = 1 }) {
    return [
        "-y", "-hide_banner", "-loglevel", "error",
        "-framerate", String(fps),
        "-start_number", String(start),
        "-i", `${framesDir.replace(/[\\/]+$/, "")}/${pattern}`,
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0",
        "-b:v", "0", "-crf", String(crf),
        "-deadline", "good", "-cpu-used", "2", "-row-mt", "1",
        "-metadata:s:v:0", "alpha_mode=1",
        "-an",
        out,
    ];
}
/** Copy one frame as the poster PNG (keeps alpha). */
export function posterArgs({ frame, out }) {
    return ["-y", "-hide_banner", "-loglevel", "error", "-i", frame, "-frames:v", "1", "-c:v", "png", out];
}
/**
 * Contact sheet: each still over a background colour (so transparency reads like the final video),
 * tiled 2 per row. `bg` is "#RRGGBB".
 */
export function contactSheetArgs({ stills, out, width, height, bg = "#1B1D22", columns = 2 }) {
    const n = stills.length;
    if (!n)
        throw new Error("No stills to put on the contact sheet.");
    const c = String(bg).replace("#", "0x");
    const inputs = stills.flatMap((s) => ["-i", s]);
    let fc = `color=c=${c}:s=${width}x${height}:d=1,split=${n}${Array.from({ length: n }, (_, i) => `[b${i}]`).join("")};`;
    for (let i = 0; i < n; i++)
        fc += `[${i}]scale=${width}:${height}[s${i}];[b${i}][s${i}]overlay=format=auto[v${i}];`;
    if (n === 1) {
        fc += `[v0]null[out]`;
    }
    else {
        const layout = [];
        for (let i = 0; i < n; i++) {
            const col = i % columns;
            const row = Math.floor(i / columns);
            const x = col === 0 ? "0" : Array.from({ length: col }, () => "w0").join("+");
            const y = row === 0 ? "0" : Array.from({ length: row }, () => "h0").join("+");
            layout.push(`${x}_${y}`);
        }
        fc += `${Array.from({ length: n }, (_, i) => `[v${i}]`).join("")}xstack=inputs=${n}:layout=${layout.join("|")}:fill=0x2A2D33[out]`;
    }
    return ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", fc, "-map", "[out]", "-frames:v", "1", out];
}
/** ffprobe JSON for the first video stream. */
export function probeArgs(file) {
    return ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames:stream_tags:format=duration", "-of", "json", file];
}
/** Decode with libvpx-vp9 (which keeps alpha) and measure the alpha plane: min < 255 = real transparency. */
export function alphaStatsArgs(file) {
    return ["-hide_banner", "-c:v", "libvpx-vp9", "-i", file, "-vf", "alphaextract,signalstats,metadata=print:key=lavfi.signalstats.YMIN", "-f", "null", "-"];
}
export function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opts });
    return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "", error: r.error };
}
export function hasTool(cmd) {
    const r = spawnSync(cmd, ["-version"], { encoding: "utf8", windowsHide: true });
    return !r.error && r.status === 0;
}
/** Inspect a WebM: codec, size, whether alpha_mode=1 is tagged and whether alpha decodes. */
export function inspectAlpha(file, { ffprobe = "ffprobe", ffmpeg = "ffmpeg" } = {}) {
    const p = run(ffprobe, probeArgs(file));
    let stream = {};
    let duration = null;
    try {
        const j = JSON.parse(p.stdout);
        stream = j.streams?.[0] || {};
        duration = j.format?.duration ? Number(j.format.duration) : null;
    }
    catch {
        /* leave empty */
    }
    const tags = Object.fromEntries(Object.entries(stream.tags || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const a = run(ffmpeg, alphaStatsArgs(file));
    const mins = [...(a.stderr + a.stdout).matchAll(/YMIN=(\d+)/g)].map((m) => Number(m[1]));
    return {
        codec: stream.codec_name,
        width: stream.width,
        height: stream.height,
        duration,
        alphaMode: tags.alpha_mode === "1",
        decodedAlpha: mins.length > 0,
        transparentPixels: mins.length > 0 && Math.min(...mins) < 255,
        frames: mins.length,
    };
}
