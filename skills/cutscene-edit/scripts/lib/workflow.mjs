// The steps every cutting tool shares: load a transcript and the edit it came from, refuse to
// mix timelines, write the EDL + retimed transcript + decisions, render on --apply.
// Cutscene (Apache-2.0).
import { existsSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, extname, basename } from "node:path";
import { EditError, clock, ms } from "./cli.mjs";
import { asEdl, retimeWords, sourceTimes } from "./edl.mjs";
import { probe } from "./media.mjs";
import { assertNotSame, displayPath, findProjectRoot, readJson, remember, userPath, writeJson } from "./paths.mjs";
import { renderEdl } from "./render.mjs";
import { makeTranscript, normalizeTranscript, spokenWords } from "./transcript.mjs";

/**
 * Load a transcript and, for an edited one, the EDL that produced it.
 * @param {string} path
 */
export function loadTranscript(path) {
  const abs = userPath(path, "the transcript");
  const t = normalizeTranscript(readJson(abs, "The transcript"));
  let parent = null;
  let parentPath = null;
  if (t.timeline === "edited") {
    if (!t.edl) throw new EditError("NO_PARENT_EDL", "This transcript is on an edited timeline but does not say which edit list made it.", "Use the transcript a Cutscene edit tool wrote; it records its edit list.");
    parentPath = isAbsolute(t.edl) ? t.edl : resolve(dirname(abs), t.edl);
    parent = asEdl(readJson(parentPath, "The edit list this transcript came from"), parentPath);
  }
  return { path: abs, transcript: t, words: spokenWords(t), parent, parentPath };
}

/**
 * The original source file for a transcript: --video, else the transcript's (or its EDL's) source.
 * Checks the file matches the timeline the cuts are made on.
 * @param {ReturnType<typeof loadTranscript>} lt
 * @param {string|undefined} videoArg
 */
export function sourceMedia(lt, videoArg) {
  const recorded = lt.parent?.source ?? lt.transcript.source ?? null;
  // A path recorded in a JSON file gets the same network-path check as one the user typed.
  const file = videoArg ? userPath(videoArg, "the video") : recorded ? userPath(recorded, "the recorded source video") : null;
  if (!file) return null;
  if (!existsSync(file)) throw new EditError("FILE_NOT_FOUND", `Cannot find the source video: ${file}`, "Pass it with --video.");
  const p = probe(file);
  const expected = lt.parent ? lt.parent.source_duration : Number(lt.transcript.source_audio_duration_secs ?? lt.transcript.audio_duration_secs);
  if (Number.isFinite(expected) && expected > 0 && Math.abs(p.duration - expected) > 0.25) {
    const edited = lt.parent && Math.abs(p.duration - lt.parent.edited_duration) <= 0.25;
    throw new EditError(
      "TIMELINE_MISMATCH",
      edited
        ? `The video you passed is the already-edited cut (${p.duration.toFixed(2)} s), but Cutscene cuts from the original (${expected.toFixed(2)} s) in one pass.`
        : `The video is ${p.duration.toFixed(2)} s but the transcript's source is ${expected.toFixed(2)} s; they are not the same recording.`,
      edited ? `Pass the original with --video (${recorded ?? "the raw recording"}), or leave --video out.` : "Pass the video the transcript was made from. Never mix original and edited timestamps.",
    );
  }
  return { file, info: p };
}

/** Human summary of an EDL for decisions files. */
export function decisionsMarkdown(title, edl, extra = []) {
  const lines = [
    `# ${title}`,
    "",
    `Source: ${edl.source ?? "(transcript only)"}`,
    `Source length: ${clock(edl.source_duration)} (${edl.source_duration.toFixed(2)} s)`,
    `Edited length: ${clock(edl.edited_duration)} (${edl.edited_duration.toFixed(2)} s)`,
    `Removed: ${edl.removed.toFixed(2)} s in ${edl.delete_ranges.length} cuts (${((edl.removed / edl.source_duration) * 100).toFixed(1)}%)`,
    `Params: ${JSON.stringify(edl.params)}`,
    "",
    ...extra,
    "## Cuts (source time)",
    "",
    ...edl.delete_ranges.map((d) => `- ${clock(d.start)}–${clock(d.end)} (${(d.end - d.start).toFixed(2)} s): ${d.reasons.join("; ") || "cut"}`),
    "",
  ];
  return lines.join("\n");
}

/**
 * Write EDL, retimed transcript and decisions; render with --apply. Returns the summary.
 * @param {{edl: import("./edl.mjs").Edl, lt: ReturnType<typeof loadTranscript>|null, words: any[], outDir: string, stem: string, suffix: string, title: string, media: {file: string, info: any}|null, apply: boolean, output?: string, fade?: number, extraDecisions?: string[], memory?: boolean}} o
 */
export function writeEditOutputs(o) {
  const { edl, outDir, stem, suffix } = o;
  const edlPath = join(outDir, `${stem}.${suffix}-edl.json`);
  const tPath = join(outDir, `${stem}.${suffix}-transcript.json`);
  const decPath = join(outDir, `${stem}.${suffix}-decisions.md`);
  edl.created = new Date().toISOString();
  writeJson(edlPath, edl);
  const re = retimeWords(sourceTimes(o.words), edl);
  const t = makeTranscript(re.words, {
    timeline: "edited",
    source: edl.source,
    edl: basename(edlPath),
    language_code: o.lt?.transcript.language_code,
    audio_duration_secs: edl.edited_duration,
    source_audio_duration_secs: edl.source_duration,
    produced_by: `cutscene-edit ${edl.tool}`,
  });
  writeJson(tPath, t);
  writeFileSync(decPath, decisionsMarkdown(o.title, edl, o.extraDecisions));
  const summary = {
    tool: edl.tool,
    sourceDuration: edl.source_duration,
    editedDuration: edl.edited_duration,
    removed: edl.removed,
    removedPct: Number(((edl.removed / edl.source_duration) * 100).toFixed(1)),
    cuts: edl.delete_ranges.length,
    keepRanges: edl.keep_ranges.length,
    words: { kept: re.words.length, dropped: re.dropped, clipped: re.clipped },
    outputs: { edl: edlPath, transcript: tPath, decisions: decPath },
    dryRun: !o.apply,
  };
  if (o.media) {
    const output = resolve(o.output ?? join(outDir, `${basename(o.media.file, extname(o.media.file))}.${suffix === "silence" ? "silenced" : suffix === "mistakes" ? "clean" : suffix}${o.media.info.hasVideo ? ".mp4" : ".m4a"}`));
    assertNotSame(output, o.media.file);
    const r = renderEdl(edl, o.media.file, output, { outDir, stem, apply: o.apply, fade: o.fade });
    summary.video = r;
    if (!o.apply) summary.hint = "Dry run: nothing was cut. Review the decisions (or `cutscene edit review`), then run again with --apply.";
    else if (r.check && !r.check.ok) summary.warning = `Self-check found problems: ${r.check.problems.join("; ")}.`;
  } else if (o.apply) {
    summary.hint = "Nothing to render: no source video is known. Pass --video.";
  }
  if (o.memory !== false) {
    const root = findProjectRoot(outDir);
    const mem = remember(outDir, `edit ${edl.tool}: ${edl.removed.toFixed(2)} s removed in ${edl.delete_ranges.length} cuts (${summary.removedPct}%), ${o.apply ? "rendered" : "dry run"}; edl ${displayPath(edlPath, root)}${summary.video?.check ? `; self-check ${summary.video.check.ok ? "passed" : "FAILED"}` : ""}`);
    if (mem) summary.memory = mem;
  }
  return summary;
}

/** One-line human summary for cutting tools. */
export function humanCut(r) {
  const lines = [
    `${r.tool}: ${clock(r.sourceDuration)} -> ${clock(r.editedDuration)} (removed ${r.removed.toFixed(2)} s, ${r.removedPct}%, ${r.cuts} cuts)`,
    `Words kept ${r.words.kept}, dropped ${r.words.dropped}, clipped ${r.words.clipped}`,
    `Edit list:  ${r.outputs.edl}`,
    `Transcript: ${r.outputs.transcript} (retimed to the edited video)`,
    `Decisions:  ${r.outputs.decisions}`,
  ];
  if (r.video) lines.push(r.video.rendered ? `Video:      ${r.video.output}` : `Would render: ${r.video.output}`);
  if (r.video?.check) lines.push(`Self-check: ${r.video.check.ok ? "passed" : "FAILED: " + r.video.check.problems.join("; ")} (length ${r.video.check.duration} s, planned ${r.video.check.expected} s)`);
  if (r.warning) lines.push(r.warning);
  if (r.hint) lines.push(r.hint);
  return lines.join("\n");
}

export { ms };
