// Built from src/skills/cutscene-edit/scripts/commands/music.mts by `npm run build`. Edit that file, not this one.
// `cutscene edit music-grid | splice-music | beatgrid | mix`
// Cutscene (Apache-2.0); the music maths is adapted from Herk Edit Kit (see lib/music.mjs).
import { EditError, parseArgs, usageError } from "../lib/cli.mjs";
import { decodeMono, ffmpeg, loudness, probe } from "../lib/media.mjs";
import { cutSheet, mixGraph, musicGrid, parseLoudnormJson, parseSegments, spliceGraph } from "../lib/music.mjs";
import { assertNotSame, existingFile, readJson, remember, userPath, writeJson } from "../lib/paths.mjs";
export const musicGridCmd = {
    name: "music-grid",
    summary: "Measure a music track's beat period, downbeat phase (kick band) and bar energy map",
    usage: "cutscene edit music-grid <track> [--bpm 120] [--out grid.json] [--beats] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { bpm: { type: "number", default: 120 }, out: { type: "string" }, beats: { type: "boolean" } });
        if (positional.length !== 1)
            throw usageError("music-grid needs one audio file.");
        const file = existingFile(positional[0], "the music track");
        const sr = 22050;
        const full = decodeMono(file, { rate: sr });
        const low = decodeMono(file, { rate: sr, filter: "lowpass=f=120,lowpass=f=120" });
        if (full.length < sr * 2)
            throw new EditError("TOO_SHORT", "The track is shorter than 2 seconds; there is no beat to measure.", "Use a longer music take.");
        const g = musicGrid(full, low, { bpm: opts.bpm, sr });
        if (opts.out)
            writeJson(userPath(opts.out, "the grid file"), g);
        return { file, ...g, beats: opts.beats ? g.beats : undefined, beatCount: g.beats.length, out: opts.out ?? null };
    },
    human(r) {
        const lines = [`period ${r.period} s · ${r.bpm} BPM · kick phase ${r.phase} s (contrast ${r.kickContrast}) · full-band phase ${r.fullBandPhase} s · ${r.duration} s`];
        if (r.halfBeatWarning)
            lines.push("Warning: the full band sits about half a beat off the kick (hi-hats dominate); splice on the kick phase.");
        for (const b of r.bars)
            lines.push(`bar ${String(b.bar).padStart(3)} beat ${String(b.beat).padStart(3)} t ${b.t.toFixed(2).padStart(7)}  rms ${b.rms_db.toFixed(1).padStart(6)}  low ${b.low_db.toFixed(1).padStart(6)}  ${"#".repeat(Math.max(0, Math.round(b.rms_db + 40)))}`);
        if (r.out)
            lines.push(`Grid saved: ${r.out}`);
        return lines.join("\n");
    },
};
export const spliceMusic = {
    name: "splice-music",
    summary: "Splice a music take onto the cut grid, beat-accurate (dry run unless --apply)",
    usage: 'cutscene edit splice-music <take> --period 0.5 --phase 0.07 --segments "4-28,48-56" [--length 15] [--gap 16] [--fade 0.9] --out bed.wav [--apply] [--json]',
    run(argv) {
        const { opts, positional } = parseArgs(argv, { period: { type: "number" }, phase: { type: "number", default: 0 }, segments: { type: "string" }, length: { type: "number", default: 15 }, gap: { type: "number" }, fade: { type: "number", default: 0.9 }, out: { type: "string" }, grid: { type: "string" }, apply: { type: "boolean" } });
        if (positional.length !== 1 || !opts.segments || !opts.out)
            throw usageError("splice-music needs a take, --segments and --out (and --period or --grid).");
        const take = existingFile(positional[0], "the music take");
        // A missing period fails the check below.
        let { period, phase } = opts;
        if (opts.grid)
            ({ period, phase } = readJson(opts.grid, "The grid file"));
        if (!(period > 0))
            throw usageError("Pass --period (from music-grid) or --grid grid.json.");
        let segments;
        try {
            segments = parseSegments(opts.segments);
        }
        catch (e) {
            throw usageError(e.message);
        }
        const out = userPath(opts.out, "the output");
        assertNotSame(out, take);
        const graph = spliceGraph({ period, phase, segments, length: opts.length, gapBeat: opts.gap ?? null, fade: opts.fade });
        if (opts.apply)
            ffmpeg(["-v", "error", "-y", "-i", take, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", out], { what: "splice the music" });
        return { take, out, rendered: !!opts.apply, period, phase, segments, length: opts.length, graph, hint: opts.apply ? "Re-measure the bed with music-grid: its kick phase should be close to 0." : "Dry run: add --apply to write the bed." };
    },
    human: (r) => `${r.rendered ? "Wrote" : "Would write"} ${r.out}: source beats ${r.segments.map(([a, b]) => `${a}-${b}`).join(" + ")}, ${r.length} s.\n${r.hint}`,
};
export const beatgrid = {
    name: "beatgrid",
    summary: "Lay chapters on the beat grid and print the cut sheet in seconds and frames",
    usage: 'cutscene edit beatgrid (--period 0.5 | --bpm 120) [--fps 30] [--length 15] --chapters "Hook:8, Build:16, Flurry:4, End:rest" [--json]',
    run(argv) {
        const { opts } = parseArgs(argv, { period: { type: "number" }, bpm: { type: "number" }, fps: { type: "number", default: 30 }, length: { type: "number", default: 15 }, chapters: { type: "string" } });
        const period = opts.period ?? (opts.bpm ? 60 / opts.bpm : null);
        if (!period || !opts.chapters)
            throw usageError("beatgrid needs --period or --bpm, and --chapters.");
        try {
            return cutSheet({ period, fps: opts.fps, length: opts.length, chapters: opts.chapters });
        }
        catch (e) {
            throw usageError(e.message);
        }
    },
    human(r) {
        const lines = [`beat ${r.period.toFixed(4)} s (${r.bpm} BPM), ${r.fps} fps, ${r.framesPerBeat} frames a beat`, ""];
        for (const c of r.rows) {
            lines.push(`${c.chapter.padEnd(22)} beats ${`${c.beatStart}-${c.beatEnd}`.padEnd(11)} ${c.start.toFixed(3).padStart(8)}–${c.end.toFixed(3).padEnd(8)} frames ${c.frameStart}-${c.frameEnd}`);
            for (const x of c.cuts)
                lines.push(`${"  cut".padEnd(22)} beat ${String(x.beat).padEnd(12)} ${x.t.toFixed(3).padStart(8)}  frame ${x.frame}`);
        }
        lines.push("", `total ${r.length} s = ${r.frames} frames`);
        return lines.join("\n");
    },
};
export const mix = {
    name: "mix",
    summary: "Premix bed + beat-placed sound effects (+ optional voice with ducking), two-pass to −14 LUFS / −1.5 dBTP",
    usage: "cutscene edit mix --bed bed.wav --events events.json --out master.wav [--voice voice.wav] [--length 15] [--lufs -14] [--peak -1.5] [--bed-gain 0.9] [--apply] [--json]",
    run(argv) {
        const { opts } = parseArgs(argv, { bed: { type: "string" }, events: { type: "string" }, voice: { type: "string" }, out: { type: "string" }, length: { type: "number" }, lufs: { type: "number", default: -14 }, peak: { type: "number", default: -1.5 }, "bed-gain": { type: "number", default: 0.9 }, apply: { type: "boolean" } });
        if (!opts.bed || !opts.out)
            throw usageError("mix needs --bed and --out (and usually --events).");
        const bed = existingFile(opts.bed, "the music bed");
        const events = opts.events ? readJson(opts.events, "The events file") : [];
        if (!Array.isArray(events) || events.some((e) => !Number.isFinite(Number(e.t)) || !e.file))
            throw usageError('events.json is a list like [{"t": 0.46, "file": "sfx/tap.wav", "gain": 0.5, "max": 0.5}].');
        const files = events.map((e) => existingFile(e.file, `the sound effect ${e.file}`));
        const out = userPath(opts.out, "the output");
        assertNotSame(out, bed);
        const voice = opts.voice ? existingFile(opts.voice, "the voice") : null;
        const length = opts.length ?? (voice ? Number(ffprobeDuration(voice)) : Number(ffprobeDuration(bed)));
        let graph = mixGraph({ bedGain: opts.bedGain, events: events.map((e) => ({ t: Number(e.t), gain: e.gain, max: e.max })), length });
        const inputs = ["-i", bed, ...files.flatMap((f) => ["-i", f])];
        if (voice) {
            // Duck the premix under the voice, then lay the voice on top.
            const vi = files.length + 1;
            inputs.push("-i", voice);
            graph += `;[${vi}:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[vk][vv];[m][vk]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[md];[vv][md]amix=inputs=2:normalize=0:duration=first,apad=whole_dur=${length},atrim=0:${length}[m2]`;
        }
        const last = voice ? "[m2]" : "[m]";
        const result = { out, length, events: events.length, voice: !!voice, target: { lufs: opts.lufs, peak: opts.peak }, rendered: false };
        if (!opts.apply)
            return { ...result, hint: "Dry run: add --apply to write the master." };
        const run = (tail, extra) => ffmpeg(["-hide_banner", ...inputs, "-filter_complex", graph + tail, ...extra], { what: "mix the audio" });
        const m = run(`;${last}loudnorm=I=${opts.lufs}:TP=${opts.peak}:LRA=11:print_format=json[o]`, ["-map", "[o]", "-f", "null", "-"]);
        const js = parseLoudnormJson(m.stderr);
        const limit = Math.pow(10, (opts.peak - 0.3) / 20).toFixed(3);
        const af = `loudnorm=I=${opts.lufs}:TP=${opts.peak}:LRA=11:measured_I=${js.input_i}:measured_TP=${js.input_tp}:measured_LRA=${js.input_lra}:measured_thresh=${js.input_thresh}:offset=${js.target_offset}:linear=true,alimiter=limit=${limit}:level=false,aresample=48000`;
        run(`;${last}${af}[o]`, ["-v", "error", "-y", "-map", "[o]", "-t", String(length), "-c:a", "pcm_s24le", out]);
        const measured = loudness(out);
        remember(out, `edit mix: ${events.length} cues${voice ? " + voice" : ""} -> ${measured.integratedLufs} LUFS, ${measured.truePeakDbtp} dBTP (${out})`);
        return { ...result, rendered: true, input: { lufs: Number(js.input_i), truePeak: Number(js.input_tp) }, measured, hint: "Measure again on the final video encode with `cutscene edit loudness`; encoders shift loudness." };
    },
    human: (r) => (r.rendered ? `Mixed ${r.out}: ${r.events} cues${r.voice ? " + voice" : ""}, ${r.input.lufs} -> ${r.measured.integratedLufs} LUFS, true peak ${r.measured.truePeakDbtp} dBTP.\n${r.hint}` : `Would mix ${r.out} (${r.events} cues${r.voice ? " + voice" : ""}, ${r.length} s) to ${r.target.lufs} LUFS / ${r.target.peak} dBTP.\n${r.hint}`),
};
function ffprobeDuration(file) {
    return probe(file).duration;
}
export { musicGridCmd as musicGrid };
