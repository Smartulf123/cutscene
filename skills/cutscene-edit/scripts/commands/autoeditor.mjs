// `cutscene edit rough-cut | export | install`
// rough-cut wraps auto-editor (Unlicense, https://github.com/WyattBlue/auto-editor) for a fast
// loudness-based first pass; export hands any Cutscene edit to Premiere, Resolve, Final Cut,
// Shotcut or Kdenlive (through auto-editor) or writes FCPXML / FCP7 XML / OTIO / SRT itself.
// Cutscene (Apache-2.0).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { EditError, ms, parseArgs, usageError } from "../lib/cli.mjs";
import { asEdl, buildEdl, sourceTimes } from "../lib/edl.mjs";
import { ensureTool, pinFor, installedPath, sizeText } from "../lib/install.mjs";
import { fromAutoEditorV1, toAutoEditorV1, toFcpxml, toOtio, toSrt, toXmeml } from "../lib/interchange.mjs";
import { probe } from "../lib/media.mjs";
import { existingFile, outputDir, readJson, remember, stemOf, userPath, writeJson } from "../lib/paths.mjs";
import { normalizeTranscript, spokenWords } from "../lib/transcript.mjs";
import { humanCut, writeEditOutputs } from "../lib/workflow.mjs";

/** auto-editor's program: CUTSCENE_AUTO_EDITOR, else the pinned install (asks first). */
async function autoEditor(yes, why) {
  const own = process.env.CUTSCENE_AUTO_EDITOR;
  if (own) {
    if (!existsSync(own)) throw new EditError("FILE_NOT_FOUND", `CUTSCENE_AUTO_EDITOR points to ${own}, which does not exist.`, "Fix the variable or unset it to use Cutscene's pinned auto-editor.");
    return own;
  }
  return ensureTool("auto-editor", { yes, why });
}

function runAutoEditor(exe, args) {
  const r = spawnSync(exe, [...args, "--progress", "none"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26, timeout: 4 * 3600_000 });
  if (r.error) throw new EditError("AUTO_EDITOR_FAILED", `auto-editor could not start: ${r.error.message}.`, "Reinstall it with `cutscene edit install auto-editor --yes`.");
  if (r.status !== 0) {
    const tail = `${r.stderr ?? ""}${r.stdout ?? ""}`.trim().split(/\r?\n/).slice(-3).join(" | ");
    throw new EditError("AUTO_EDITOR_FAILED", `auto-editor stopped with an error: ${tail}`, "Check the input plays in a media player; pass --threshold or --margin values like 4% or -19dB and 0.2s.");
  }
  return r;
}

// ─── rough-cut ─────────────────────────────────────────────────────────────────

const PACE_MARGIN = { tight: "0.1s", normal: "0.2s", loose: "0.35s" };

export const roughCut = {
  name: "rough-cut",
  summary: "Fast first pass on loudness with auto-editor (no transcript needed); one download, asks first",
  usage: "cutscene edit rough-cut <video> [--pace tight|normal|loose] [--margin 0.2s] [--threshold 4%|-19dB] [--transcript t.json] [--out-dir dir] [--output out.mp4] [--apply] [--yes] [--json]",
  async run(argv) {
    const { opts, positional } = parseArgs(argv, {
      "out-dir": { type: "string" },
      output: { type: "string", alias: "o" },
      pace: { type: "string" },
      margin: { type: "string" },
      threshold: { type: "string" },
      transcript: { type: "string" },
      fade: { type: "number", default: 0.02 },
      apply: { type: "boolean" },
      yes: { type: "boolean", alias: "y" },
      memory: { type: "boolean", default: true },
    });
    if (positional.length !== 1) throw usageError("rough-cut needs one video.");
    if (opts.pace && !PACE_MARGIN[opts.pace]) throw usageError(`--pace must be tight, normal or loose, not "${opts.pace}".`);
    const file = existingFile(positional[0], "the video");
    const info = probe(file);
    const outDir = outputDir(opts.outDir, file);
    const stem = stemOf(file);
    const exe = await autoEditor(opts.yes, "The rough cut");
    const v1Path = join(outDir, `${stem}.rough.v1.json`);
    const args = [file, "--export", "v1", "-o", v1Path];
    const margin = opts.margin ?? (opts.pace ? PACE_MARGIN[opts.pace] : null);
    if (margin) args.push("--margin", /[a-z%]$/i.test(margin) ? margin : `${margin}s`);
    if (opts.threshold) args.push("--edit", `audio:threshold=${opts.threshold}`);
    runAutoEditor(exe, args);
    const v1 = JSON.parse(readFileSync(v1Path, "utf8"));
    const { fps, deletes } = fromAutoEditorV1(v1, info.fps || 30);
    const edl = buildEdl({ deletes, duration: info.duration, fps: info.fps || fps, tool: "rough-cut", source: file, params: { engine: "auto-editor", version: pinFor("auto-editor")?.version ?? "custom", margin: margin ?? "0.2s (auto-editor default)", threshold: opts.threshold ?? "auto-editor default" } });
    // A source-timeline transcript, if one exists, is retimed onto the rough cut too.
    let words = [];
    let lt = null;
    const tPath = opts.transcript ? userPath(opts.transcript) : join(outDir, `${stem}.transcript.json`);
    if (existsSync(tPath)) {
      const t = normalizeTranscript(readJson(tPath, "The transcript"));
      if (t.timeline === "edited") throw new EditError("TIMELINE_MISMATCH", "rough-cut works on the original recording, but that transcript is on an edited timeline.", "Pass the source transcript (from `cutscene edit transcribe`).");
      words = spokenWords(t);
      lt = { transcript: t };
    }
    const extra = [`Loudness pass by auto-editor; its timeline: ${v1Path}`, "", words.length ? "" : "No transcript was found, so the retimed transcript is empty. Run `cutscene edit transcribe` on the original first to get word times.", ""];
    const r = writeEditOutputs({ edl, lt, words, outDir, stem, suffix: "rough", title: "Rough cut (loudness): decisions", media: { file, info }, apply: opts.apply, output: opts.output, fade: opts.fade, extraDecisions: extra, memory: opts.memory });
    return { ...r, autoEditorTimeline: v1Path, transcriptRetimed: words.length > 0 };
  },
  human: (r) => humanCut(r) + (r.transcriptRetimed ? "" : "\nNo transcript was found: transcribe the original to get a retimed transcript."),
};

// ─── export ────────────────────────────────────────────────────────────────────

const VIA_AE = { premiere: { ex: "premiere", ext: ".xml", tag: ".premiere", app: "Adobe Premiere Pro" }, resolve: { ex: "resolve", ext: ".fcpxml", tag: ".resolve", app: "DaVinci Resolve" }, fcp: { ex: "final-cut-pro", ext: ".fcpxml", tag: ".finalcut", app: "Final Cut Pro" }, shotcut: { ex: "shotcut", ext: ".mlt", tag: "", app: "Shotcut" }, kdenlive: { ex: "kdenlive", ext: ".kdenlive", tag: "", app: "Kdenlive" } };
const NATIVE = { fcpxml: { ext: ".fcpxml", tag: "", app: "Final Cut Pro / DaVinci Resolve (FCPXML 1.8)" }, fcp7: { ext: ".xml", tag: ".fcp7", app: "Premiere Pro / Resolve (Final Cut Pro 7 XML)" }, xmeml: { ext: ".xml", tag: ".fcp7", app: "Premiere Pro / Resolve (Final Cut Pro 7 XML)" }, otio: { ext: ".otio", tag: "", app: "OpenTimelineIO" }, srt: { ext: ".srt", tag: "", app: "captions (SRT)" } };
const FALLBACK = { premiere: "fcp7", resolve: "fcpxml", fcp: "fcpxml" };

export const exportCmd = {
  name: "export",
  summary: "Hand the edit to Premiere, Resolve, Final Cut, Shotcut, Kdenlive, or write FCPXML / FCP7 XML / OTIO / SRT",
  usage: "cutscene edit export <edl.json> --to premiere|resolve|fcp|shotcut|kdenlive|fcpxml|fcp7|otio|srt [--video raw.mp4] [--transcript retimed.json] [--output file] [--name title] [--yes] [--json]",
  async run(argv) {
    const { opts, positional } = parseArgs(argv, { to: { type: "string" }, video: { type: "string" }, transcript: { type: "string" }, output: { type: "string", alias: "o" }, name: { type: "string" }, yes: { type: "boolean", alias: "y" } });
    if (positional.length !== 1 || !opts.to) throw usageError("export needs an edit list and --to.");
    const to = opts.to.toLowerCase();
    if (!VIA_AE[to] && !NATIVE[to]) throw usageError(`--to must be one of ${[...Object.keys(VIA_AE), ...Object.keys(NATIVE)].join(", ")}.`);
    const edlPath = existingFile(positional[0], "the edit list");
    const edl = asEdl(readJson(edlPath, "The edit list"), edlPath);
    const stem = stemOf(edlPath);
    const dir = dirname(edlPath);
    const target = VIA_AE[to] ?? NATIVE[to];
    const out = opts.output ? userPath(opts.output, "the export file") : join(dir, `${stem}.${edl.tool}${target.tag}${target.ext}`);
    const name = opts.name ?? `${stem} (${edl.tool})`;

    if (to === "srt") {
      const tPath = opts.transcript ? userPath(opts.transcript) : edlPath.replace(/-edl\.json$/, "-transcript.json");
      if (!existsSync(tPath)) throw new EditError("FILE_NOT_FOUND", `No retimed transcript at ${tPath}.`, "Pass --transcript with the transcript the edit tool wrote.");
      const t = normalizeTranscript(readJson(tPath, "The transcript"));
      if (t.timeline !== "edited" && edl.delete_ranges.length) throw new EditError("TIMELINE_MISMATCH", "Captions for the edited video need the retimed transcript, not the original one.", `Pass ${edlPath.replace(/-edl\.json$/, "-transcript.json")}.`);
      if (Math.abs(Number(t.audio_duration_secs) - edl.edited_duration) > 0.05) throw new EditError("TIMELINE_MISMATCH", "That transcript is not retimed to this edit list.", "Use the transcript written next to the edit list.");
      writeFileSync(out, toSrt(spokenWords(t)));
      return { to, output: out, app: target.app, captions: true };
    }

    const sourcePath = opts.video ? existingFile(opts.video, "the source video") : edl.source ? userPath(edl.source, "the edit list's source video") : null;
    if (!sourcePath || !existsSync(sourcePath)) throw new EditError("FILE_NOT_FOUND", "The edit list's source video was not found.", "Pass the original recording with --video.");
    const info = probe(sourcePath);
    if (Math.abs(info.duration - edl.source_duration) > 0.25) throw new EditError("TIMELINE_MISMATCH", `That video is ${info.duration.toFixed(2)} s but the edit list was made on a ${edl.source_duration.toFixed(2)} s source.`, "Pass the original recording the edit list cuts.");
    const media = { path: resolve(sourcePath), name: basename(sourcePath, extname(sourcePath)), width: info.width, height: info.height, hasVideo: info.hasVideo, hasAudio: info.hasAudio, channels: info.channels, sampleRate: info.sampleRate };

    let used = to;
    if (VIA_AE[to]) {
      let exe = null;
      try {
        exe = await autoEditor(opts.yes, `Export to ${target.app}`);
      } catch (e) {
        if (e.code === "NEEDS_CONSENT" && FALLBACK[to]) {
          e.hint = `${e.hint} Or use --to ${FALLBACK[to]}, which ${target.app} also opens and needs no download.`;
        }
        throw e;
      }
      const v1Path = join(dir, `${stem}.${edl.tool}.v1.json`);
      writeJson(v1Path, toAutoEditorV1(edl, media.path));
      const want = out.endsWith(target.ext) ? out : out + target.ext;
      runAutoEditor(exe, [v1Path, "--export", target.ex, "-o", want]);
      if (!existsSync(want)) throw new EditError("AUTO_EDITOR_FAILED", `auto-editor finished but did not write ${want}.`, "Run the export again with CUTSCENE_DEBUG=1.");
      remember(want, `edit export: ${edl.tool} edit -> ${target.app} (${basename(want)})`);
      return { to, output: want, app: target.app, via: "auto-editor", timeline: v1Path, clips: edl.keep_ranges.length };
    }
    const text = to === "fcpxml" ? toFcpxml(edl, media, name) : to === "otio" ? toOtio(edl, media, name) : toXmeml(edl, media, name);
    writeFileSync(out, text);
    remember(out, `edit export: ${edl.tool} edit -> ${target.app} (${basename(out)})`);
    return { to: used, output: out, app: target.app, via: "cutscene", clips: edl.keep_ranges.length };
  },
  human: (r) => `Exported for ${r.app}: ${r.output}${r.via === "auto-editor" ? " (via auto-editor)" : ""}\nOpen it in the editor; it points at the original recording, so keep that file where it is.`,
};

// ─── install ───────────────────────────────────────────────────────────────────

export const install = {
  name: "install",
  summary: "Install an optional tool (auto-editor, face-detector) after the user agrees",
  usage: "cutscene edit install auto-editor|face-detector [--yes] [--json]",
  async run(argv) {
    const { opts, positional } = parseArgs(argv, { yes: { type: "boolean", alias: "y" } });
    const what = positional[0];
    const names = { "auto-editor": ["auto-editor"], "face-detector": ["mediapipe-tasks-vision", "face-detector-model"] }[what];
    if (!names) throw usageError("install needs auto-editor or face-detector.");
    const pins = names.map((n) => pinFor(n)).filter(Boolean);
    const installed = pins.map((p) => installedPath(p));
    if (installed.every(Boolean)) return { tool: what, installed: true, paths: installed, already: true };
    if (!opts.yes) {
      const total = pins.reduce((s, p) => s + p.size, 0);
      throw new EditError("NEEDS_CONSENT", `Installing ${what} downloads ${sizeText(total)}: ${pins.map((p) => `${p.name} ${p.version} (${p.license}, from ${p.source})`).join("; ")}.`, "Ask the user, then run again with --yes.", { details: { name: what, version: pins.map((p) => p.version).join(" + "), size: total, sizeText: sizeText(total), license: pins.map((p) => p.license).join("; "), source: pins.map((p) => p.source).join("; "), url: pins.map((p) => p.url).join(" ") } });
    }
    const paths = [];
    for (const n of names) paths.push(await ensureTool(n, { yes: true }));
    return { tool: what, installed: true, paths };
  },
  human: (r) => `${r.tool} is ${r.already ? "already " : ""}installed:\n${r.paths.join("\n")}`,
};

export { ms };
