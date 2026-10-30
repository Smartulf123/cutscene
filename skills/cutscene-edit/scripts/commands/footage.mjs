// Built from src/skills/cutscene-edit/scripts/commands/footage.mts by `npm run build`. Edit that file, not this one.
// `cutscene edit highlights | reframe | sync | clean-audio`
// Cutscene (Apache-2.0); ported from Cutscene 1 (see lib/highlights.mjs, reframe.mjs, sync.mjs, cleanup.mjs).
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { EditError, clock, ms, parseArgs, usageError } from "../lib/cli.mjs";
import { buildEdl, composeEdl } from "../lib/edl.mjs";
import { cleanupFilter } from "../lib/cleanup.mjs";
import { detectFaces, faceDetectorInstalled, faceSampleRate } from "../lib/faces.mjs";
import { findHighlights } from "../lib/highlights.mjs";
import { consentError, pinFor, sizeText } from "../lib/install.mjs";
import { decodeMono, ffmpeg, noiseFloor, probe } from "../lib/media.mjs";
import { assertNotSame, existingFile, outputDir, readJson, remember, stemOf, userPath, writeJson } from "../lib/paths.mjs";
import { chunkKeys, cropSize, cropXExpr, parseAspect, reframeKeys } from "../lib/reframe.mjs";
import { bestLag, envelope, normalizedOnsets } from "../lib/sync.mjs";
import { humanCut, loadTranscript, sourceMedia, writeEditOutputs } from "../lib/workflow.mjs";
import { humFilters } from "../lib/cleanup.mjs";
// ─── highlights ────────────────────────────────────────────────────────────────
export const highlights = {
    name: "highlights",
    summary: "Rank 20–60 s stretches that could stand alone as shorts; --make h1 turns one into an edit",
    usage: "cutscene edit highlights <transcript.json> [--min 20] [--max 60] [--count 8] [--make h1 [--video raw.mp4] [--apply]] [--out-dir dir] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { min: { type: "number", default: 20 }, max: { type: "number", default: 60 }, count: { type: "number", default: 8 }, make: { type: "string" }, video: { type: "string" }, "out-dir": { type: "string" }, output: { type: "string", alias: "o" }, apply: { type: "boolean" } });
        if (positional.length !== 1)
            throw usageError("highlights needs one transcript.");
        if (!(opts.min > 0 && opts.max > opts.min))
            throw usageError("--min and --max are seconds, min below max.");
        const lt = loadTranscript(positional[0]);
        const list = findHighlights(lt.words, { minSeconds: opts.min, maxSeconds: opts.max, count: opts.count });
        const outDir = outputDir(opts.outDir, lt.path);
        const stem = stemOf(lt.path);
        const jsonPath = join(outDir, `${stem}.highlights.json`);
        writeJson(jsonPath, { version: 1, transcript: lt.path, timeline: lt.transcript.timeline ?? "source", highlights: list });
        if (!opts.make) {
            remember(outDir, `edit highlights: ${list.length} candidates for shorts`);
            return { highlights: list.map((h) => ({ id: h.id, start: h.start, end: h.end, length: ms(h.end - h.start), score: h.score, opening: h.opening, reasons: h.reasons })), output: jsonPath, hint: "Read each candidate's text before choosing; the score only ranks. Then: --make <id>." };
        }
        const h = list.find((x) => x.id === opts.make);
        if (!h)
            throw new EditError("UNKNOWN_HIGHLIGHT", `There is no highlight ${opts.make} (have ${list.map((x) => x.id).join(", ") || "none"}).`, "Run highlights without --make to see the ids.");
        // Keep a little air around the stretch, never past neighbouring words.
        const prev = lt.words.filter((w) => w.end <= h.start + 1e-6).at(-1);
        const next = lt.words.find((w) => w.start >= h.end - 1e-6);
        const a = Math.max(prev ? prev.end : 0, h.start - 0.15);
        const inputDuration = lt.parent ? lt.parent.edited_duration : Number(lt.transcript.audio_duration_secs) || h.end + 1;
        const b = Math.min(next ? next.start : inputDuration, h.end + 0.3);
        const cuts = [{ start: 0, end: a, reason: `before highlight ${h.id}` }, { start: b, end: inputDuration, reason: `after highlight ${h.id}` }].filter((c) => c.end - c.start > 0.001);
        const media = sourceMedia(lt, opts.video);
        const fps = media?.info.fps || lt.parent?.fps || 30;
        const params = { highlight: h.id, score: h.score };
        const edl = lt.parent ? composeEdl(lt.parent, cuts, { tool: `short-${h.id}`, params, parentPath: lt.parentPath }) : buildEdl({ deletes: cuts, duration: inputDuration, fps, tool: `short-${h.id}`, source: media?.file ?? lt.transcript.source ?? null, params });
        return writeEditOutputs({ edl, lt, words: lt.words, outDir, stem, suffix: `short-${h.id}`, title: `Short ${h.id}: decisions`, media, apply: opts.apply, output: opts.output, extraDecisions: [`Opening: "${h.opening}"`, `Why: ${h.reasons.join(", ") || "dense, complete stretch"}`, ""] });
    },
    human(r) {
        if (r.tool)
            return humanCut(r);
        const lines = r.highlights.map((h) => `${h.id}  ${clock(h.start)}–${clock(h.end)} (${h.length.toFixed(0)} s) score ${h.score}  "${h.opening.slice(0, 80)}"  [${h.reasons.join(", ")}]`);
        return [...lines, `Saved: ${r.output}`, r.hint].join("\n");
    },
};
// ─── reframe ───────────────────────────────────────────────────────────────────
const SIZES = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] };
export const reframe = {
    name: "reframe",
    summary: "Vertical (or square) crop that follows the speaker's face; --center needs no download",
    usage: "cutscene edit reframe <video> [--aspect 9:16] [--center] [--faces faces.json] [--dead-zone 0.12] [--settle 0.6] [--yes] [--out-dir dir] [--output out.mp4] [--apply] [--json]",
    async run(argv) {
        const { opts, positional } = parseArgs(argv, { aspect: { type: "string", default: "9:16" }, center: { type: "boolean" }, faces: { type: "string" }, "dead-zone": { type: "number", default: 0.12 }, settle: { type: "number", default: 0.6 }, yes: { type: "boolean", alias: "y" }, "out-dir": { type: "string" }, output: { type: "string", alias: "o" }, apply: { type: "boolean" } });
        if (positional.length !== 1)
            throw usageError("reframe needs one video.");
        const file = existingFile(positional[0], "the video");
        const info = probe(file);
        if (!info.hasVideo || !info.width)
            throw new EditError("NO_VIDEO", "This file has no picture to reframe.", "Pass a video file.");
        let aspect;
        try {
            aspect = parseAspect(opts.aspect);
        }
        catch (e) {
            throw usageError(e.message);
        }
        const outDir = outputDir(opts.outDir, file);
        const stem = stemOf(file);
        const srcAspect = info.width / info.height;
        let mode = "center";
        let track = null;
        if (opts.faces) {
            track = readJson(opts.faces, "The face track");
            mode = "faces";
        }
        else if (!opts.center) {
            if (!faceDetectorInstalled() && !opts.yes) {
                const pins = ["mediapipe-tasks-vision", "face-detector-model"].map((n) => pinFor(n));
                const e = consentError({ ...pins[0], name: "face-detector", version: `${pins[0].version} + model`, size: pins[0].size + pins[1].size }, "Face-follow reframing");
                e.hint = `Ask the user, then run again with --yes (MediaPipe face detector, Apache-2.0, ${sizeText(pins[0].size + pins[1].size)}). Or pass --center for a centred crop with no download.`;
                throw e;
            }
            track = await detectFaces(file, { fps: faceSampleRate(info.duration), yes: opts.yes });
            writeJson(join(outDir, `${stem}.faces.json`), track);
            mode = "faces";
        }
        const keys = track ? reframeKeys(track, srcAspect, aspect, { deadZone: opts.deadZone, settle: opts.settle }) : [];
        const crop = cropSize(info.width, info.height, aspect);
        const travel = info.width - crop.w;
        const facesSeen = track ? track.frames.filter((f) => f.length).length / Math.max(1, track.frames.length) : null;
        const planPath = writeJson(join(outDir, `${stem}.reframe.json`), { version: 1, source: file, aspect: opts.aspect, mode, crop, sourceSize: { w: info.width, h: info.height }, keys, facesSeen });
        const [ow, oh] = SIZES[opts.aspect] ?? [crop.w, crop.h];
        const y = Math.floor((info.height - crop.h) / 2);
        const vfFor = (ks) => `crop=${crop.w}:${crop.h}:x=${travel > 0 ? cropXExpr(ks.length ? ks : [{ t: 0, p: 0.5 }], travel) : 0}:y=${y},scale=${ow}:${oh}:flags=lanczos,setsar=1`;
        const output = opts.output ? userPath(opts.output, "the output") : join(outDir, `${basename(file, extname(file))}.reframed-${opts.aspect.replace(":", "x")}.mp4`);
        assertNotSame(output, file);
        const fps = info.fps || 30;
        const windows = chunkKeys(keys, info.duration, fps);
        const result = { mode, aspect: opts.aspect, crop, keys: keys.length, passes: windows.length, facesSeen: facesSeen === null ? null : Math.round(facesSeen * 100) / 100, plan: planPath, output, rendered: false };
        if (mode === "faces" && facesSeen !== null && facesSeen < 0.5)
            result.warning = `A face was found in only ${Math.round(facesSeen * 100)}% of samples; check the framing, or use --center.`;
        if (!opts.apply)
            return { ...result, hint: "Dry run: the crop plan is saved. Check a few frames, then add --apply." };
        const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"];
        if (windows.length === 1) {
            ffmpeg(["-y", "-i", file, "-/filter:v", writeFilter(join(outDir, `${stem}.reframe-filter.txt`), vfFor(keys)), "-map", "0:v:0", "-map", "0:a?", ...enc, "-c:a", "copy", "-movflags", "+faststart", output], { what: "reframe the video" });
        }
        else {
            // Long, busy footage: render the picture in windows (one crop expression each), join them
            // without re-encoding, and lay the original sound back on once, so no join can click.
            const parts = [];
            windows.forEach((w, i) => {
                const part = join(outDir, `${stem}.reframe-part${String(i).padStart(3, "0")}.mp4`);
                const frames = Math.round((w.to - w.from) * fps);
                ffmpeg(["-y", "-ss", w.from.toFixed(6), "-i", file, "-frames:v", String(frames), "-/filter:v", writeFilter(join(outDir, `${stem}.reframe-filter-${i}.txt`), vfFor(w.keys)), "-an", ...enc, part], { what: `reframe part ${i + 1} of ${windows.length}` });
                parts.push(part);
            });
            const list = join(outDir, `${stem}.reframe-parts.txt`);
            writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
            ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-i", file, "-map", "0:v:0", "-map", "1:a?", "-c", "copy", "-shortest", "-movflags", "+faststart", output], { what: "join the reframed parts" });
            for (const p of parts)
                rmSync(p, { force: true });
        }
        remember(output, `edit reframe: ${opts.aspect} ${mode} crop (${keys.length} keyframes) -> ${output}`);
        return { ...result, rendered: true };
    },
    human: (r) => `${r.rendered ? "Reframed" : "Planned"} ${r.aspect} (${r.mode === "faces" ? `follows the face, ${r.keys} keyframes` : "centred"}): ${r.output}${r.warning ? "\n" + r.warning : ""}${r.hint ? "\n" + r.hint : ""}`,
};
function writeFilter(path, vf) {
    writeFileSync(path, vf);
    return path;
}
// ─── sync ──────────────────────────────────────────────────────────────────────
export const sync = {
    name: "sync",
    summary: "Line up two recordings of the same moment by their sound (camera + screen, two mics)",
    usage: "cutscene edit sync <a> <b> [--max-shift 30] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { "max-shift": { type: "number", default: 30 } });
        if (positional.length !== 2)
            throw usageError("sync needs two media files.");
        const [a, b] = positional.map((p, i) => existingFile(p, i ? "the second recording" : "the first recording"));
        const rate = 8000;
        const hop = 80; // 10 ms
        const ea = normalizedOnsets(envelope(decodeMono(a, { rate }), hop));
        const eb = normalizedOnsets(envelope(decodeMono(b, { rate }), hop));
        const maxLag = Math.round((opts.maxShift * rate) / hop);
        const r = bestLag(ea, eb, maxLag);
        const offset = ms((r.lag * hop) / rate);
        const sure = r.confidence >= 1.5;
        return {
            a,
            b,
            offset,
            confidence: Math.round(r.confidence * 100) / 100,
            sure,
            meaning: offset >= 0 ? `The same sound comes ${offset} s later in the second file: trim its first ${offset} s (or start the first ${offset} s later) to line them up.` : `The same sound comes ${-offset} s earlier in the second file: delay it by ${-offset} s to line them up.`,
            hint: sure ? undefined : "No clear match: the recordings may not overlap, or one has no usable sound. Try a larger --max-shift.",
        };
    },
    human: (r) => `Offset ${r.offset} s (confidence ${r.confidence}${r.sure ? "" : ", NOT sure"}).\n${r.meaning}${r.hint ? "\n" + r.hint : ""}`,
};
// ─── clean-audio ───────────────────────────────────────────────────────────────
export const cleanAudio = {
    name: "clean-audio",
    summary: "Remove mains hum and steady background noise on a copy (video untouched)",
    usage: "cutscene edit clean-audio <media> [--hum] [--noise] [--strength light|normal|strong] [--out-dir dir] [--output out.mp4] [--apply] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { hum: { type: "boolean" }, noise: { type: "boolean" }, strength: { type: "string", default: "normal" }, "out-dir": { type: "string" }, output: { type: "string", alias: "o" }, apply: { type: "boolean" } });
        if (positional.length !== 1)
            throw usageError("clean-audio needs one media file.");
        if (!["light", "normal", "strong"].includes(opts.strength))
            throw usageError("--strength is light, normal or strong.");
        const file = existingFile(positional[0], "the media file");
        const info = probe(file);
        if (!info.hasAudio)
            throw new EditError("NO_AUDIO", "This file has no audio to clean.", "Pass the recording with the sound.");
        const o = { hum: opts.hum || (!opts.hum && !opts.noise), noise: opts.noise || (!opts.hum && !opts.noise), strength: opts.strength };
        const before = noiseFloor(file);
        const floor = o.noise ? noiseFloor(file, o.hum ? humFilters().join(",") : undefined) : before;
        const filter = cleanupFilter(o, floor);
        const outDir = outputDir(opts.outDir, file);
        const ext = info.hasVideo ? ".mp4" : ".m4a";
        const output = opts.output ? userPath(opts.output, "the output") : join(outDir, `${basename(file, extname(file))}.clean-audio${ext}`);
        assertNotSame(output, file);
        const result = { input: file, output, hum: o.hum, noise: o.noise, strength: o.strength, filter, noiseFloorBefore: Math.round(before * 10) / 10, rendered: false };
        if (!opts.apply)
            return { ...result, hint: "Dry run: add --apply to write the cleaned copy. Listen to a quiet part before and after." };
        const video = info.hasVideo ? ["-map", "0:v:0", "-c:v", "copy"] : ["-vn"];
        ffmpeg(["-y", "-i", file, ...video, "-map", "0:a:0", "-af", filter, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output], { what: "clean the audio" });
        const after = noiseFloor(output);
        remember(output, `edit clean-audio: ${[o.hum && "hum", o.noise && "noise"].filter(Boolean).join(" + ")} (${o.strength}); noise floor ${before.toFixed(1)} -> ${after.toFixed(1)} dBFS`);
        return { ...result, rendered: true, noiseFloorAfter: Math.round(after * 10) / 10 };
    },
    human: (r) => `${r.rendered ? "Cleaned" : "Would clean"} ${[r.hum && "hum", r.noise && "noise"].filter(Boolean).join(" + ")} (${r.strength}) -> ${r.output}\nNoise floor ${r.noiseFloorBefore} dBFS${r.rendered ? ` -> ${r.noiseFloorAfter} dBFS` : ""}${r.hint ? "\n" + r.hint : ""}`,
};
export { existsSync };
