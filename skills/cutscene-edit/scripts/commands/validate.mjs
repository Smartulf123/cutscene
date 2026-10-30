// Built from src/skills/cutscene-edit/scripts/commands/validate.mts by `npm run build`. Edit that file, not this one.
// `cutscene edit validate-beat-sync | validate-plan | validate-footage`
// Cutscene (Apache-2.0); the checks are adapted from Herk Edit Kit (see lib/beatsync.mjs, lib/plan.mjs).
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { EditError, parseArgs, usageError } from "../lib/cli.mjs";
import { LEAD_MAX, LEAD_MIN, checkBeatSync, parseIndex } from "../lib/beatsync.mjs";
import { keepsFromEdl, sha256, validateFootage, validatePlan } from "../lib/plan.mjs";
import { readJson, remember, userPath } from "../lib/paths.mjs";
import { normalizeTranscript, spokenWords } from "../lib/transcript.mjs";
function projectDir(p) {
    const dir = userPath(p ?? ".", "the project folder");
    if (!existsSync(dir) || !statSync(dir).isDirectory())
        throw new EditError("FILE_NOT_FOUND", `There is no project folder at ${dir}.`, "Pass the video project's folder.");
    return dir;
}
/** The edited transcript for a project: --transcript, else assets/transcript.json, else the newest retimed one in .cutscene/edit. */
function projectTranscript(dir, given) {
    for (const p of [given && userPath(given), join(dir, "assets", "transcript.json")])
        if (p && existsSync(p))
            return p;
    throw new EditError("FILE_NOT_FOUND", "No transcript for this project.", "Pass --transcript with the retimed transcript of the edited video (e.g. .cutscene/edit/<name>.mistakes-transcript.json).");
}
export const validateBeatSync = {
    name: "validate-beat-sync",
    summary: `Check every graphic lands ${LEAD_MIN}…+${LEAD_MAX} s from the word it illustrates`,
    usage: "cutscene edit validate-beat-sync [project] [--transcript edited.json] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { transcript: { type: "string" } });
        const dir = projectDir(positional[0]);
        const index = join(dir, "index.html");
        if (!existsSync(index))
            throw new EditError("FILE_NOT_FOUND", `No index.html in ${dir}.`, "Pass the video project's folder.");
        const tPath = projectTranscript(dir, opts.transcript);
        const t = normalizeTranscript(readJson(tPath, "The transcript"));
        const note = t.timeline === "source" ? "This transcript is on the original recording's timeline; that is right only if the footage in the video was not cut." : undefined;
        let beats;
        try {
            beats = parseIndex(readFileSync(index, "utf8"));
        }
        catch (e) {
            throw new EditError("BAD_INDEX", e.message, "Fix the sub-composition attributes in index.html.");
        }
        if (!beats.length)
            throw new EditError("NO_BEATS", "index.html has no sub-compositions (data-composition-src) to check.", "Beat sync checks graphics placed as sub-compositions with data-start and data-duration.");
        const rows = checkBeatSync(beats, spokenWords(t), (src) => {
            const p = resolve(dir, src);
            if (!p.startsWith(dir + sep) || !existsSync(p))
                return null;
            return readFileSync(p, "utf8");
        });
        const bad = rows.filter((r) => r.status !== "OK");
        remember(dir, `edit validate-beat-sync: ${rows.length - bad.length}/${rows.length} beats on their words`);
        return { transcript: tPath, timeline: t.timeline ?? "source", note, window: [LEAD_MIN, LEAD_MAX], rows, failures: bad.length, passed: bad.length === 0, failMessage: bad.length ? `${bad.length} of ${rows.length} graphics are not on their words.` : undefined, failHint: "Move each listed beat's data-start to the suggested value (about 0.5 s before its word), then check again." };
    },
    human(r) {
        const lines = [`Beat sync (${r.timeline} transcript): window ${r.window[0]}…+${r.window[1]} s`];
        for (const x of r.rows)
            lines.push(`  ${x.status.padEnd(11)} ${x.id.padEnd(14)} start ${String(x.start).padStart(7)}  word ${String(x.wordStart ?? "-").padStart(7)}  ${x.anchor ? `"${x.anchor.slice(0, 28)}"` : ""} ${x.detail}`);
        lines.push(r.passed ? "All graphics land on their words." : `${r.failures} need fixing.`);
        return lines.join("\n");
    },
};
export const validatePlanCmd = {
    name: "validate-plan",
    summary: "Structural checks on a short-form plan: captions match speech, scenes tile the timeline, no dead gaps",
    usage: "cutscene edit validate-plan [project] [--plan assets/plan.json] [--transcript t.json] [--edl edit-decisions.json] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { plan: { type: "string" }, transcript: { type: "string" }, edl: { type: "string" } });
        const dir = projectDir(positional[0]);
        const plan = readJson(opts.plan ? userPath(opts.plan) : join(dir, "assets", "plan.json"), "The plan");
        const transcript = readJson(opts.transcript ? userPath(opts.transcript) : join(dir, "assets", "transcript.json"), "The transcript");
        const edl = keepsFromEdl(readJson(opts.edl ? userPath(opts.edl) : join(dir, "assets", "edit-decisions.json"), "The edit decisions"));
        const r = validatePlan(plan, transcript, edl, (p) => {
            const abs = resolve(dir, p);
            return abs.startsWith(dir + sep) && existsSync(abs);
        });
        return { ...r, passed: r.ok, failMessage: r.ok ? undefined : `The plan has ${r.errors.length} structural problems.`, failHint: "Fix the listed items. This check cannot judge taste, motion or sound; watch the render too." };
    },
    human: (r) => (r.ok ? `Plan passes: ${r.metrics.scenes} scenes, average shot ${r.metrics.averageShotSeconds.toFixed(2)} s, longest gap without a new visual ${r.metrics.maxEventGap.toFixed(2)} s.` : `Plan problems:\n- ${r.errors.join("\n- ")}`),
};
export const validateFootageCmd = {
    name: "validate-footage",
    summary: "Each B-roll scene used once: scene ids, file hashes and intervals in the footage ledger",
    usage: "cutscene edit validate-footage [project] [--plan assets/plan.json] [--ledger assets/footage-ledger.json] [--json]",
    run(argv) {
        const { opts, positional } = parseArgs(argv, { plan: { type: "string" }, ledger: { type: "string" } });
        const dir = projectDir(positional[0]);
        const plan = readJson(opts.plan ? userPath(opts.plan) : join(dir, "assets", "plan.json"), "The plan");
        const ledgerPath = opts.ledger ? userPath(opts.ledger) : join(dir, "assets", "footage-ledger.json");
        const rows = existsSync(ledgerPath) ? readJson(ledgerPath, "The footage ledger") : [];
        const result = validateFootage(rows);
        const footage = (plan.scenes ?? []).filter((s) => String(s.layout ?? "").includes("broll") || s.mode === "footage");
        for (const s of footage)
            if (rows.filter((r) => r.scene === s.id).length !== 1)
                result.errors.push(`Scene ${s.id} needs exactly one ledger row.`);
        for (const r of rows) {
            const asset = resolve(dir, r.asset ?? "");
            if (!asset.startsWith(dir + sep) || !existsSync(asset)) {
                result.errors.push(`The file for scene ${r.scene} is missing or outside the project.`);
                continue;
            }
            if (sha256(readFileSync(asset)) !== r.sha256)
                result.errors.push(`The file for scene ${r.scene} changed since it was logged (hash mismatch).`);
            if (!footage.some((s) => s.id === r.scene))
                result.errors.push(`Ledger row ${r.scene} is not a footage scene in the plan.`);
        }
        result.ok = result.errors.length === 0;
        return { ...result, passed: result.ok, failMessage: result.ok ? undefined : `The footage ledger has ${result.errors.length} problems.`, failHint: "Use each B-roll scene once; log every insert with its hash and interval." };
    },
    human: (r) => (r.ok ? `Footage passes: ${r.scenes} logged scenes, none reused.` : `Footage problems:\n- ${r.errors.join("\n- ")}`),
};
