// Built from src/skills/cutscene-edit/scripts/commands/review.mts by `npm run build`. Edit that file, not this one.
// `cutscene edit review | verify | loudness`: look, listen and measure after every cut.
// Cutscene (Apache-2.0); the review page idea is from Herk Edit Kit (see lib/review-page.mjs).
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep, isAbsolute } from "node:path";
import { EditError, clock, ms, parseArgs, usageError } from "../lib/cli.mjs";
import { asEdl, sourceTimes } from "../lib/edl.mjs";
import { canTranscribe, cleanWork, engineTranscribe } from "../lib/engine.mjs";
import { decodeMono, hasFfmpeg, loudness, probe } from "../lib/media.mjs";
import { token } from "../lib/mistakes.mjs";
import { existingFile, readJson, remember, stemOf, userPath } from "../lib/paths.mjs";
import { checkRender } from "../lib/render.mjs";
import { buildReviewHtml, markCutWords, peaks } from "../lib/review-page.mjs";
import { normalizeTranscript, spokenWords } from "../lib/transcript.mjs";
const relUrl = (from, p) => {
    const r = relative(from, p);
    return (isAbsolute(r) ? "file:///" + r.replace(/\\/g, "/") : r.split(sep).join("/")).split("/").map((x, i) => (i === 0 && /^[A-Za-z]:$/.test(x) ? x : encodeURIComponent(x))).join("/");
};
// ─── review ────────────────────────────────────────────────────────────────────
export const review = {
    name: "review",
    aliases: ["build-edl-review"],
    summary: "Build the cut review page: waveform timeline, struck-through words, hear every cut",
    usage: "cutscene edit review <edl.json> [--original raw.mp4] [--edited cut.mp4] [--transcript t.json] [--candidates c.json] [--output review.html] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { original: { type: "string" }, edited: { type: "string" }, transcript: { type: "string" }, candidates: { type: "string" }, output: { type: "string", alias: "o" } });
        if (positional.length !== 1)
            throw usageError("review needs one edit list (*.edl.json).");
        const edlPath = existingFile(positional[0], "the edit list");
        const edl = asEdl(readJson(edlPath, "The edit list"), edlPath);
        const dir = dirname(edlPath);
        const stem = stemOf(edlPath);
        const out = opts.output ? userPath(opts.output, "the review page") : join(dir, `${stem}.${edl.tool}-review.html`);
        const original = opts.original ? existingFile(opts.original, "the original video") : edl.source && existsSync(userPath(edl.source, "the edit list's source video")) ? userPath(edl.source) : null;
        let edited = opts.edited ? existingFile(opts.edited, "the edited video") : null;
        if (edited) {
            const c = checkRender(edited, edl);
            if (Math.abs(c.durationDelta) > 0.25)
                throw new EditError("TIMELINE_MISMATCH", `The edited video is ${c.duration} s but this edit list makes ${edl.edited_duration} s.`, "Pass the video rendered from this edit list.");
        }
        // Words on the source timeline (EDLs are always on the source). The original transcript shows
        // the cut words too; an edited transcript only has the kept ones.
        let words = [];
        const original_t = join(dir, `${stem}.transcript.json`);
        const sibling = edlPath.replace(/-edl\.json$/, "-transcript.json");
        for (const tp of [opts.transcript ? userPath(opts.transcript) : null, original_t, sibling]) {
            if (!tp || !existsSync(tp))
                continue;
            const t = normalizeTranscript(readJson(tp, "The transcript"));
            if (t.timeline === "edited" && tp !== sibling && existsSync(original_t))
                continue;
            words = sourceTimes(spokenWords(t));
            break;
        }
        let candidates = [];
        if (opts.candidates)
            candidates = readJson(opts.candidates, "The candidates file").candidates ?? [];
        let wave = new Array(1200).fill(0.05);
        if (original && hasFfmpeg()) {
            try {
                wave = peaks(decodeMono(original, { rate: 8000 }), 1600);
            }
            catch {
                /* keep the flat placeholder */
            }
        }
        const html = buildReviewHtml({
            title: stem,
            edl,
            edlName: relative(dirname(out), edlPath) || edlPath,
            originalSrc: original ? relUrl(dirname(out), original) : null,
            editedSrc: edited ? relUrl(dirname(out), edited) : null,
            words: markCutWords(words, edl),
            peaks: wave,
            candidates,
        });
        writeFileSync(out, html);
        remember(out, `edit review: page built for ${edl.tool} (${edl.delete_ranges.length} cuts)`);
        return { review: out, cuts: edl.delete_ranges.length, removed: edl.removed, words: words.length, candidates: candidates.length, edited: !!edited, hint: "Open the page in a browser. It reads the videos from their folders, so keep them where they are." };
    },
    human: (r) => `Review page: ${r.review}\n${r.cuts} cuts, ${r.removed.toFixed(2)} s removed${r.edited ? "" : " (dry run: use “Preview the edit” to hear it)"}.\n${r.hint}`,
};
// ─── verify ────────────────────────────────────────────────────────────────────
/**
 * Compare the words heard in the rendered cut with the retimed transcript: every kept word
 * should be there, at about the same time.
 */
export function compareWords(expected, heard) {
    const a = expected.map((w) => token(w.text));
    const b = heard.map((w) => token(w.text));
    // Longest common subsequence on tokens.
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const pairs = [];
    const missing = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            pairs.push([i, j]);
            i++;
            j++;
        }
        else if (dp[i + 1][j] >= dp[i][j + 1])
            missing.push(i++);
        else
            j++;
    }
    while (i < n)
        missing.push(i++);
    const offsets = pairs.map(([x, y]) => heard[y].start - expected[x].start).sort((p, q) => p - q);
    const median = offsets.length ? offsets[Math.floor(offsets.length / 2)] : null;
    const worst = offsets.length ? Math.max(...offsets.map(Math.abs)) : null;
    return { matched: pairs.length, expected: n, heard: m, matchRatio: n ? pairs.length / n : 1, missing: missing.map((k) => ({ text: expected[k].text, at: expected[k].start })), medianOffset: median === null ? null : ms(median), worstOffset: worst === null ? null : ms(worst) };
}
export const verify = {
    name: "verify",
    summary: "Self-check a rendered cut: length, audio/video sync, every kept word still heard, loudness",
    usage: "cutscene edit verify <edited.mp4> --edl x.edl.json [--transcript retimed.json] [--no-words] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { edl: { type: "string" }, transcript: { type: "string" }, words: { type: "boolean", default: true }, model: { type: "string" } });
        if (positional.length !== 1 || !opts.edl)
            throw usageError("verify needs the rendered video and --edl.");
        const file = existingFile(positional[0], "the rendered video");
        const edlPath = existingFile(opts.edl, "the edit list");
        const edl = asEdl(readJson(edlPath, "The edit list"), edlPath);
        const check = checkRender(file, edl);
        const problems = [...check.problems];
        const result = { file, check, words: null, loudness: null };
        if (opts.words) {
            const tPath = opts.transcript ? userPath(opts.transcript) : edlPath.replace(/-edl\.json$/, "-transcript.json");
            if (!existsSync(tPath))
                throw new EditError("FILE_NOT_FOUND", `No retimed transcript at ${tPath}.`, "Pass --transcript, or --no-words to skip the word check.");
            const t = normalizeTranscript(readJson(tPath, "The retimed transcript"));
            if (Math.abs(Number(t.audio_duration_secs) - edl.edited_duration) > 0.05)
                problems.push(`the transcript says ${t.audio_duration_secs} s but the edit is ${edl.edited_duration} s`);
            if (!canTranscribe())
                result.words = { skipped: "no local transcription installed" };
            else {
                const work = join(dirname(file), `.work-verify-${process.pid}`);
                try {
                    const heard = spokenWords(normalizeTranscript(engineTranscribe(file, { workDir: work, model: opts.model }).raw));
                    const cmp = compareWords(spokenWords(t), heard);
                    result.words = cmp;
                    if (cmp.matchRatio < 0.9)
                        problems.push(`only ${(cmp.matchRatio * 100).toFixed(0)}% of kept words were heard again; listen at: ${cmp.missing.slice(0, 6).map((m) => clock(m.at)).join(", ")}`);
                    if (cmp.medianOffset !== null && Math.abs(cmp.medianOffset) > 0.12)
                        problems.push(`words are heard ${cmp.medianOffset} s away from the retimed transcript`);
                }
                finally {
                    cleanWork(work);
                }
            }
        }
        try {
            result.loudness = loudness(file);
        }
        catch {
            result.loudness = null;
        }
        result.problems = problems;
        result.passed = problems.length === 0;
        if (!result.passed)
            result.failMessage = `The rendered cut has problems: ${problems.join("; ")}.`;
        remember(file, `edit verify: ${result.passed ? "passed" : "FAILED (" + problems.join("; ") + ")"}${result.words?.matchRatio !== undefined ? `, ${(result.words.matchRatio * 100).toFixed(0)}% of words heard again` : ""}`);
        return result;
    },
    human(r) {
        const lines = [`Length ${r.check.duration} s (planned ${r.check.expected} s), audio/video difference ${r.check.avDelta} s.`];
        if (r.words?.skipped)
            lines.push(`Word check skipped: ${r.words.skipped}.`);
        else if (r.words)
            lines.push(`Words heard again: ${r.words.matched}/${r.words.expected} (${(r.words.matchRatio * 100).toFixed(0)}%), median offset ${r.words.medianOffset} s.`);
        if (r.loudness)
            lines.push(`Loudness ${r.loudness.integratedLufs} LUFS, true peak ${r.loudness.truePeakDbtp} dBTP.`);
        lines.push(r.passed ? "Self-check passed." : `Self-check FAILED: ${r.problems.join("; ")}`);
        return lines.join("\n");
    },
};
// ─── loudness ──────────────────────────────────────────────────────────────────
export const loudnessCmd = {
    name: "loudness",
    summary: "Measure integrated loudness and true peak on the final encode (default gate −14 LUFS, −1.5 dBTP)",
    usage: "cutscene edit loudness <file> [--target -14] [--tolerance 1] [--peak -1.5] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { target: { type: "number", default: -14 }, tolerance: { type: "number", default: 1 }, peak: { type: "number", default: -1.5 } });
        if (positional.length !== 1)
            throw usageError("loudness needs one file.");
        const file = existingFile(positional[0], "the file");
        const p = probe(file);
        const l = loudness(file);
        const problems = [];
        if (l.integratedLufs === null)
            problems.push("no loudness could be measured (silent file?)");
        else if (Math.abs(l.integratedLufs - opts.target) > opts.tolerance)
            problems.push(`integrated loudness ${l.integratedLufs} LUFS is outside ${opts.target} ± ${opts.tolerance}`);
        if (l.truePeakDbtp !== null && l.truePeakDbtp > opts.peak)
            problems.push(`true peak ${l.truePeakDbtp} dBTP is above ${opts.peak}`);
        if (p.channels === 1)
            problems.push("the file is mono; measure the stereo delivery (mono reads about 3 dB lower on some players)");
        return { file, ...l, channels: p.channels ?? null, target: opts.target, peakLimit: opts.peak, problems, passed: problems.length === 0, failMessage: problems.length ? `Loudness gate failed: ${problems.join("; ")}.` : undefined, failHint: "Re-mix with `cutscene edit mix` (two-pass loudness normalisation), then measure the final encode again." };
    },
    human: (r) => `${r.integratedLufs} LUFS, true peak ${r.truePeakDbtp} dBTP, range ${r.rangeLu} LU (${r.channels ?? "?"} ch). ${r.passed ? "Passes" : "Fails"} the ${r.target} LUFS / ${r.peakLimit} dBTP gate.${r.problems.length ? "\n- " + r.problems.join("\n- ") : ""}`,
};
