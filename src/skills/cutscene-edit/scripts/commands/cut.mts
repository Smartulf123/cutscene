// `cutscene edit transcribe | read | cut-silences | find-cuts | apply-cuts`
// Cutscene (Apache-2.0). cut-silences, find-cuts and apply-cuts are adapted from Herk Edit Kit
// (see lib/silences.mjs and lib/mistakes.mjs for the credit).
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EditError, clock, log, ms, parseArgs, usageError } from "../lib/cli.mjs";
import { buildEdl, composeEdl, outToSource } from "../lib/edl.mjs";
import { cleanWork, engineTranscribe } from "../lib/engine.mjs";
import { detectSilences, noiseFloor, probe } from "../lib/media.mjs";
import { approvedRanges, findCutCandidates } from "../lib/mistakes.mjs";
import { existingFile, outputDir, readJson, remember, stemOf, userPath, writeJson } from "../lib/paths.mjs";
import { PACES, SILENCE_DEFAULTS, planSilenceCuts } from "../lib/silences.mjs";
import { capStretchedWords, makeTranscript, normalizeTranscript, packedText, refineWithSilences, spokenWords } from "../lib/transcript.mjs";
import { humanCut, loadTranscript, sourceMedia, writeEditOutputs } from "../lib/workflow.mjs";
import type { ApprovedDoc, Candidate } from "../lib/mistakes.mjs";
import type { EditSummary } from "../lib/workflow.mjs";

/** How transcribe tightened word edges. */
type Refinement = { refined: number; estimated: number; silences: number; thresholdDb: number | null; floorDb: number | null };
type TranscribeResult =
  | { cached: true; transcript: string; phrases: string; words: number; duration: number | undefined; hint: string }
  | { cached: false; transcript: string; phrases: string; words: number; duration: number; engine: { asr: string | null; model: string | null }; refinement: Refinement };
type FindCutsResult = {
  candidates: number;
  counts: Record<string, number>;
  proposedCutSeconds: number;
  list: { id: string; type: string; recommend: string; confidence: string; start: number; end: number; removes: string }[];
  outputs: { json: string; md: string; approveInto: string };
};

/** Quick content fingerprint: size, plus SHA-256 of the first and last 4 MB. */
export function fingerprint(file: string): string {
  const st = statSync(file);
  const h = createHash("sha256");
  const fd = openSync(file, "r");
  try {
    const chunk = 4 << 20;
    const buf = Buffer.alloc(Math.min(chunk, st.size));
    readSync(fd, buf, 0, buf.length, 0);
    h.update(buf);
    if (st.size > chunk) {
      const tail = Buffer.alloc(Math.min(chunk, st.size - chunk));
      readSync(fd, tail, 0, tail.length, st.size - tail.length);
      h.update(tail);
    }
  } finally {
    closeSync(fd);
  }
  return `${st.size}:${h.digest("hex").slice(0, 32)}`;
}

/** Silence threshold from the measured noise floor: well above the floor, never inside speech. */
export function silenceThreshold(floorDb: number): number {
  return Math.round(Math.max(-50, Math.min(-30, floorDb + 18)));
}

// ─── transcribe ────────────────────────────────────────────────────────────────

export const transcribe = {
  name: "transcribe",
  summary: "Word-level transcript on this computer, word edges tightened against the real audio",
  usage: "cutscene edit transcribe <video|audio> [--out-dir dir] [--model small.en] [--language en] [--asr auto|parakeet|whisper] [--silence-db -40] [--no-refine] [--force] [--json]",
  run(argv: string[]): TranscribeResult {
    const { opts, positional } = parseArgs(argv, {
      "out-dir": { type: "string" },
      out: { type: "string" },
      model: { type: "string" },
      language: { type: "string" },
      asr: { type: "string" },
      "silence-db": { type: "number" },
      refine: { type: "boolean", default: true },
      force: { type: "boolean" },
      timeout: { type: "number" },
    });
    if (positional.length !== 1) throw usageError("transcribe needs one media file.");
    const file = existingFile(positional[0], "the media file");
    const outDir = outputDir(opts.outDir, file);
    const stem = stemOf(file);
    const out = opts.out ? userPath(opts.out, "the transcript output") : join(outDir, `${stem}.transcript.json`);
    const fp = fingerprint(file);
    if (!opts.force && existsSync(out)) {
      try {
        const old = readJson<{ fingerprint?: string; engine?: { model?: string }; words?: unknown[]; audio_duration_secs?: number }>(out);
        if (old.fingerprint === fp && (!opts.model || old.engine?.model === opts.model)) {
          return { cached: true, transcript: out, phrases: out.replace(/\.transcript\.json$/, ".phrases.md"), words: (old.words ?? []).length, duration: old.audio_duration_secs, hint: "Reused the cached transcript for this exact file (pass --force to transcribe again)." };
        }
      } catch {
        /* make a new one */
      }
    }
    const info = probe(file);
    if (!info.hasAudio) throw new EditError("NO_AUDIO", "This file has no audio to transcribe.", "Pass the recording that has the speech.");
    const work = join(outDir, `.work-transcribe-${process.pid}`);
    log(`Transcribing ${file} on this computer...`);
    let result: ReturnType<typeof engineTranscribe>;
    try {
      result = engineTranscribe(file, { workDir: work, model: opts.model, language: opts.language, asr: opts.asr, timeoutMs: opts.timeout });
    } finally {
      cleanWork(work);
    }
    let words = spokenWords(normalizeTranscript(result.raw)).sort((a, b) => a.start - b.start);
    const refinement: Refinement = { refined: 0, estimated: 0, silences: 0, thresholdDb: null, floorDb: null };
    if (opts.refine) {
      const floor = noiseFloor(file);
      const thr = opts.silenceDb ?? silenceThreshold(floor);
      const sil = detectSilences(file, { noiseDb: thr, minSeconds: 0.15, duration: info.duration });
      const r = refineWithSilences(words, sil);
      const c = capStretchedWords(r.words);
      words = c.words;
      Object.assign(refinement, { refined: r.changed, estimated: c.changed, silences: sil.length, thresholdDb: thr, floorDb: Math.round(floor * 10) / 10 });
    }
    const t = makeTranscript(words, {
      timeline: "source",
      source: file,
      language_code: opts.language ?? result.info.detectedLanguage ?? undefined,
      audio_duration_secs: ms(info.duration),
      produced_by: "cutscene-edit transcribe",
      engine: { asr: result.info.engine ?? null, model: result.info.model ?? opts.model ?? null },
      fingerprint: fp,
      refinement,
    });
    writeJson(out, t);
    const phrases = out.replace(/\.json$/, "").replace(/\.transcript$/, "") + ".phrases.md";
    writeFileSync(phrases, `# Phrases: ${stem}\n\nSource time, one line per phrase (breaks at pauses of 0.5 s or more). Read this instead of watching the video.\n\n${packedText(words)}\n`);
    remember(outDir, `edit transcribe: ${words.length} words, ${info.duration.toFixed(1)} s, ${refinement.refined} word edges tightened, ${refinement.estimated} estimated (${result.info.engine ?? "engine"} ${result.info.model ?? ""})`);
    return { cached: false, transcript: out, phrases, words: words.length, duration: ms(info.duration), engine: t.engine as { asr: string | null; model: string | null }, refinement };
  },
  human(r: TranscribeResult): string {
    if (r.cached) return `Transcript (cached): ${r.transcript}\nPhrases: ${r.phrases}\n${r.hint}`;
    return [
      `Transcribed ${r.words} words (${r.duration.toFixed(1)} s) with ${r.engine.asr ?? "the local engine"} ${r.engine.model ?? ""}.`,
      `Word edges tightened against silence: ${r.refinement.refined}; ends estimated (speech over sound): ${r.refinement.estimated}.`,
      `Transcript: ${r.transcript}`,
      `Phrases:    ${r.phrases}  (read this first)`,
    ].join("\n");
  },
};

// ─── read ──────────────────────────────────────────────────────────────────────

export const read = {
  name: "read",
  summary: "Print the transcript as timed phrases, the way the agent should read footage",
  usage: "cutscene edit read <transcript.json> [--gap 0.5] [--json]",
  run(argv: string[]): { timeline: string; words: number; text: string } {
    const { opts, positional } = parseArgs(argv, { gap: { type: "number", default: 0.5 } });
    if (positional.length !== 1) throw usageError("read needs one transcript.");
    const lt = loadTranscript(positional[0]);
    return { timeline: lt.transcript.timeline ?? "source", words: lt.words.length, text: packedText(lt.words, { gap: opts.gap }) };
  },
  human: (r: { timeline: string; words: number; text: string }): string => `Timeline: ${r.timeline} (${r.words} words)\n${r.text}`,
};

// ─── cut-silences ──────────────────────────────────────────────────────────────

export const cutSilences = {
  name: "cut-silences",
  summary: "Trim dead air and long pauses to natural breaths (dry run unless --apply)",
  usage: "cutscene edit cut-silences <transcript.json> [--video raw.mp4] [--pace tight|normal|loose] [--gap 0.55] [--head-pad 0.22] [--tail-pad 0.34] [--fade 0.02] [--out-dir dir] [--output out.mp4] [--apply] [--json]",
  run(argv: string[]): EditSummary {
    const { opts, positional } = parseArgs(argv, {
      video: { type: "string" },
      "out-dir": { type: "string" },
      output: { type: "string", alias: "o" },
      pace: { type: "string" },
      gap: { type: "number" },
      "head-pad": { type: "number", default: SILENCE_DEFAULTS.headPad },
      "tail-pad": { type: "number", default: SILENCE_DEFAULTS.tailPad },
      fade: { type: "number", default: 0.02 },
      apply: { type: "boolean" },
      memory: { type: "boolean", default: true },
    });
    if (positional.length !== 1) throw usageError("cut-silences needs one transcript.");
    if (opts.pace && !PACES[opts.pace]) throw usageError(`--pace must be tight, normal or loose, not "${opts.pace}".`);
    const gap = opts.gap ?? (opts.pace ? PACES[opts.pace] : SILENCE_DEFAULTS.gap);
    if (!(gap > 0)) throw usageError("--gap must be a positive number of seconds.");
    const lt = loadTranscript(positional[0]);
    if (!lt.words.length) throw new EditError("NO_WORDS", "The transcript has no timed words.", "Transcribe the recording with `cutscene edit transcribe`.");
    const media = sourceMedia(lt, opts.video);
    const inputDuration = lt.parent ? lt.parent.edited_duration : Number(lt.transcript.audio_duration_secs) || media?.info.duration || lt.words.at(-1)!.end + opts.tailPad;
    const cuts = planSilenceCuts(lt.words, { duration: inputDuration, gap, headPad: opts.headPad, tailPad: opts.tailPad });
    const params = { gap, headPad: opts.headPad, tailPad: opts.tailPad, pace: opts.pace ?? null, fade: opts.fade };
    const fps = media?.info.fps || lt.parent?.fps || 30;
    const edl = lt.parent
      ? composeEdl(lt.parent, cuts, { tool: "cut-silences", params, parentPath: lt.parentPath })
      : buildEdl({ deletes: cuts, duration: inputDuration, fps, tool: "cut-silences", source: media?.file ?? lt.transcript.source ?? null, params });
    const outDir = outputDir(opts.outDir, lt.path);
    const pauses = cuts.filter((c) => c.kind === "pause").sort((a, b) => b.end - b.start - (a.end - a.start));
    const extra = ["## Largest pauses trimmed", "", ...pauses.slice(0, 15).map((c) => `- ${clock(c.start)}: ${c.reason}`), ""];
    const estimated = lt.words.filter((w) => w.end_estimated).length;
    if (estimated) extra.push(`Note: ${estimated} word ends were estimated (speech over music or noise, no clean silence). Check those joins on the review page.`, "");
    return writeEditOutputs({ edl, lt, words: lt.words, outDir, stem: stemOf(lt.path), suffix: "silence", title: "Cut silences: decisions", media, apply: opts.apply, output: opts.output, fade: opts.fade, extraDecisions: extra, memory: opts.memory });
  },
  human: humanCut,
};

// ─── find-cuts ─────────────────────────────────────────────────────────────────

export const findCuts = {
  name: "find-cuts",
  aliases: ["find-cut-candidates"],
  summary: "Propose stutters, repeats, restarts, retakes, false starts and fillers for review",
  usage: "cutscene edit find-cuts <transcript.json> [--no-fillers] [--out-dir dir] [--json]",
  run(argv: string[]): FindCutsResult {
    const { opts, positional } = parseArgs(argv, { "out-dir": { type: "string" }, fillers: { type: "boolean", default: true } });
    if (positional.length !== 1) throw usageError("find-cuts needs one transcript.");
    const lt = loadTranscript(positional[0]);
    if (!lt.words.length) throw new EditError("NO_WORDS", "The transcript has no timed words.", "Transcribe the recording with `cutscene edit transcribe`.");
    const { candidates, segments } = findCutCandidates(lt.words, { fillers: opts.fillers });
    // Times stay on the transcript's own timeline; the original-recording times ride along for the
    // review page, which always plays the original.
    if (lt.parent) for (const c of candidates) c.source_cut = { start: ms(outToSource(lt.parent, c.cut.start)), end: ms(outToSource(lt.parent, c.cut.end)) };
    const counts = candidates.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {} as Record<string, number>);
    const proposed = candidates.filter((c) => c.recommend === "cut").reduce((s, c) => s + (c.cut.end - c.cut.start), 0);
    const outDir = outputDir(opts.outDir, lt.path);
    const stem = stemOf(lt.path);
    const jsonPath = join(outDir, `${stem}.cut-candidates.json`);
    const mdPath = join(outDir, `${stem}.cut-candidates.md`);
    const approvedPath = join(outDir, `${stem}.approved-cuts.json`);
    writeJson(jsonPath, {
      version: 1,
      kind: "cutscene-cut-candidates",
      transcript: lt.path,
      timeline: lt.transcript.timeline ?? "source",
      word_count: lt.words.length,
      segment_count: segments.length,
      counts,
      proposed_cut_seconds: ms(proposed),
      candidates,
    });
    const md = [
      "# Cut candidates",
      "",
      `Transcript: ${lt.path} (${lt.transcript.timeline ?? "source"} timeline) · ${lt.words.length} words · ${segments.length} sentences`,
      `Found ${candidates.length} candidates (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}).`,
      `Recommended cuts total ${proposed.toFixed(1)} s. Nothing is cut until you approve: write the ids you approve to`,
      `${approvedPath} as {"approve": ["c001", ...]} and run apply-cuts.`,
      "",
      "A machine cannot tell emphasis (\"never, never\") from a stutter. Read each one in context.",
      "Zero candidates does not mean a clean take: read the phrases file too.",
      "",
      ...candidates.map((c) =>
        [
          `## ${c.id} · ${c.type} · ${c.confidence} · recommend: ${c.recommend}`,
          `cut ${clock(c.cut.start)}–${clock(c.cut.end)} (${(c.cut.end - c.cut.start).toFixed(2)} s): ${c.note}${c.overlaps ? ` (overlaps ${c.overlaps.join(", ")}: approve one)` : ""}`,
          "",
          `- removes: ${c.removes}`,
          c.keeps ? `- keeps:   ${c.keeps}` : null,
          `- context: …${c.context}…`,
          "",
        ]
          .filter((x) => x !== null)
          .join("\n"),
      ),
    ].join("\n");
    writeFileSync(mdPath, md);
    remember(outDir, `edit find-cuts: ${candidates.length} candidates (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}), awaiting review`);
    return { candidates: candidates.length, counts, proposedCutSeconds: ms(proposed), list: candidates.map((c) => ({ id: c.id, type: c.type, recommend: c.recommend, confidence: c.confidence, start: c.cut.start, end: c.cut.end, removes: c.removes })), outputs: { json: jsonPath, md: mdPath, approveInto: approvedPath } };
  },
  human(r: FindCutsResult): string {
    const lines = [`Found ${r.candidates} candidates (${Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}); recommended cuts ${r.proposedCutSeconds} s.`];
    for (const c of r.list) lines.push(`  ${c.id} ${c.type.padEnd(11)} ${c.recommend.padEnd(6)} ${clock(c.start)}–${clock(c.end)}  "${c.removes.slice(0, 70)}"`);
    lines.push(`Details: ${r.outputs.md}`, `Approve: write {"approve": ["c001", ...]} to ${r.outputs.approveInto}, then run apply-cuts.`);
    return lines.join("\n");
  },
};

// ─── apply-cuts ────────────────────────────────────────────────────────────────

export const applyCuts = {
  name: "apply-cuts",
  summary: "Apply only the approved cuts; renders from the original in one pass with --apply",
  usage: "cutscene edit apply-cuts <transcript.json> --cuts approved.json [--candidates x.cut-candidates.json] [--video raw.mp4] [--fade 0.02] [--out-dir dir] [--output out.mp4] [--apply] [--json]",
  run(argv: string[]): EditSummary {
    const { opts, positional } = parseArgs(argv, {
      cuts: { type: "string" },
      candidates: { type: "string" },
      video: { type: "string" },
      "out-dir": { type: "string" },
      output: { type: "string", alias: "o" },
      fade: { type: "number", default: 0.02 },
      apply: { type: "boolean" },
      memory: { type: "boolean", default: true },
    });
    if (positional.length !== 1) throw usageError("apply-cuts needs one transcript.");
    if (!opts.cuts) throw usageError("apply-cuts needs --cuts with the approved cuts.", 'Write {"approve": ["c001"]} or {"cuts": [{"start": 1.2, "end": 1.5, "reason": "stutter"}]}. An empty list is valid.');
    const lt = loadTranscript(positional[0]);
    const doc = readJson<ApprovedDoc>(opts.cuts, "The approved cuts file");
    const outDir = outputDir(opts.outDir, lt.path);
    const candPath = opts.candidates ? resolve(opts.candidates) : join(outDir, `${stemOf(lt.path)}.cut-candidates.json`);
    const needsCandidates = (Array.isArray(doc) ? doc : doc.cuts ?? []).some((c) => typeof c === "string") || ((doc as { approve?: string[] }).approve ?? []).length > 0;
    let candidates: Candidate[] = [];
    if (needsCandidates) {
      if (!existsSync(candPath)) throw new EditError("NO_CANDIDATES", "The approved list names candidate ids but the candidates file was not found.", `Run find-cuts first, or pass --candidates (looked for ${candPath}).`);
      const cd = readJson<{ transcript?: string; candidates?: Candidate[] }>(candPath, "The candidates file");
      if (cd.transcript && resolve(cd.transcript).toLowerCase() !== lt.path.toLowerCase()) {
        throw new EditError("TIMELINE_MISMATCH", "Those candidates were found on a different transcript, so their times are on another timeline.", `Run apply-cuts on ${cd.transcript}, or find-cuts again on this one.`);
      }
      candidates = cd.candidates ?? [];
    }
    let cuts: ReturnType<typeof approvedRanges>;
    try {
      cuts = approvedRanges(doc, candidates);
    } catch (e) {
      throw new EditError("UNKNOWN_CANDIDATE", `${(e as Error).message} in the candidates file.`, "Use ids from the latest find-cuts run.");
    }
    const media = sourceMedia(lt, opts.video);
    const params = { approved: cuts.length, fade: opts.fade };
    const inputDuration = lt.parent ? lt.parent.edited_duration : Number(lt.transcript.audio_duration_secs) || media?.info.duration || lt.words.at(-1)!.end + 0.2;
    const fps = media?.info.fps || lt.parent?.fps || 30;
    const edl = lt.parent
      ? composeEdl(lt.parent, cuts, { tool: "apply-cuts", params, parentPath: lt.parentPath })
      : buildEdl({ deletes: cuts, duration: inputDuration, fps, tool: "apply-cuts", source: media?.file ?? lt.transcript.source ?? null, params });
    const extra = ["## Approved cuts (input timeline)", "", ...cuts.map((c) => `- ${clock(c.start)}–${clock(c.end)}: ${c.reason}`), ""];
    return writeEditOutputs({ edl, lt, words: lt.words, outDir, stem: stemOf(lt.path), suffix: "mistakes", title: "Apply cuts: decisions", media, apply: opts.apply, output: opts.output, fade: opts.fade, extraDecisions: extra, memory: opts.memory });
  },
  human: humanCut,
};
