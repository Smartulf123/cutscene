// Built from src/skills/cutscene-voice/scripts/lib/oneshot.mts by `npm run build`. Edit that file, not this one.
// `cutscene voice speak` in its one-shot form: one line from a text file into one WAV, no beat
// sheet needed. Used by cutscene-audio's sound engine (`--provider cutscene-voice`) and for
// quick lines.
//
//   cutscene voice speak --text-file <line.txt> --out <file.wav> [--voice <speaker or Kokoro preset>]
//     [--project <dir>] [--model ...] [--seed N] [--describe "..."] [--language en] [--no-verify] --json
//   -> {"ok":true,"file":...,"duration":...,"model":...,"license":...,"verified":...,"words":[...]}
//
// --voice picks, in order: a speaker from the project's beats.json voices, a Kokoro preset id
// (af_heart, am_michael, ...). Without --voice: the project's only voice, a --describe'd voice
// (fresh design with the seed), or Kokoro's default preset.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { masterLine } from "./audio.mjs";
import { readBeats } from "./beatsio.mjs";
import { DEFAULT_SEED, chooseModel, generate, transcribeFiles } from "./commands.mjs";
import { cutsceneHome, findProject, projectPaths, readManifest, resolveUserPath, safeName, voicePaths } from "./paths.mjs";
import { licenseFor, writeLicenseFile } from "./project.mjs";
import { voiceStatus } from "./status.mjs";
import { describeIssue, judgeLine, parseOmniVoiceDescription, pickKokoroVoice } from "./text.mjs";
import { VoiceError, fmtSeconds, round, usage } from "./util.mjs";
import { wavInfo } from "./wav.mjs";
export function isOneShot(f) {
    return !!(f["text-file"] || typeof f.text === "string" || f.out);
}
/** Decide which voice speaks a one-shot line. Pure; exported for tests. */
export function pickOneShotVoice({ wanted, voices, presets, describe, language }) {
    if (wanted && voices[wanted])
        return { speaker: wanted, voice: voices[wanted] };
    if (wanted && presets.includes(wanted))
        return { speaker: null, voice: { model: "kokoro", preset: wanted } };
    if (wanted)
        return { error: wanted };
    const names = Object.keys(voices);
    if (names.length === 1)
        return { speaker: names[0], voice: voices[names[0]] };
    if (describe)
        return { speaker: null, voice: { model: null, design: describe, seed: DEFAULT_SEED, language }, design: true };
    return { speaker: null, voice: { model: "kokoro", preset: "af_heart" } };
}
export async function cmdSpeakOne(f, ctx = {}) {
    const home = ctx.home || cutsceneHome();
    let text = typeof f.text === "string" ? f.text : "";
    if (f["text-file"]) {
        const tf = resolveUserPath(f["text-file"]);
        if (!existsSync(tf))
            throw new VoiceError("FILE_NOT_FOUND", `The text file doesn't exist: ${tf}.`, "Write the line to a .txt file first.");
        text = readFileSync(tf, "utf8");
    }
    text = text.replace(/\s+/g, " ").trim();
    if (!text)
        throw usage("The line is empty.", "Pass --text-file <file.txt> with the words to speak.");
    if (typeof f.out !== "string" || !f.out.trim())
        throw usage("--out is required.", "Where to write the WAV, e.g. --out assets/voice/line1.wav.");
    const out = resolveUserPath(f.out);
    const presets = readManifest().presets.kokoro.voices;
    // The project's voices, if there is a project (--project, else the current folder).
    let project = null;
    let voices = {};
    const candidate = f.project ? findProject(f.project) : process.cwd();
    if (existsSync(projectPaths(candidate).beats)) {
        project = candidate;
        voices = (await readBeats(projectPaths(candidate).beats)).voices || {};
    }
    else if (f.project) {
        throw new VoiceError("BEATS_NOT_FOUND", `There's no .cutscene/beats.json in ${candidate}.`, "Drop --project, or design the voice in that project first.");
    }
    const describe = typeof f.describe === "string" ? f.describe.trim() : "";
    const pick = pickOneShotVoice({ wanted: typeof f.voice === "string" ? f.voice : null, voices, presets, describe, language: f.language });
    if (pick.error) {
        throw new VoiceError("VOICE_NOT_FOUND", `There's no voice "${pick.error}"${project ? " in this project" : " (no project found)"}.`, `Use a speaker from the project's beats.json (${Object.keys(voices).join(", ") || "none yet"}), a Kokoro preset (${presets.join(", ")}), or design one first with cutscene voice design.`);
    }
    const { speaker, voice } = pick;
    const status = await voiceStatus({ home });
    const model = chooseModel(f.model || voice.model || undefined, status);
    if (pick.design) {
        if (model === "omnivoice") {
            const parsed = parseOmniVoiceDescription(describe);
            if (!parsed.ok)
                throw new VoiceError("DESCRIPTION_UNSUPPORTED", "OmniVoice can't design that description.", 'Use tags like "female, young adult, american accent" (see references/models.md), or --model voxcpm2.');
            voice.instruct = parsed.instruct;
        }
        else if (model === "kokoro")
            voice.preset = pickKokoroVoice(describe, f.language);
        else
            voice.instruct = describe.replace(/[()]/g, "");
        voice.model = model;
    }
    const lang = f.language || voice.language || "en";
    const seed = Number.isInteger(f.seed) ? f.seed : Number.isInteger(voice.seed) ? voice.seed : DEFAULT_SEED;
    const vp = voicePaths(home);
    mkdirSync(join(vp.jobs, "takes"), { recursive: true });
    const take = join(vp.jobs, "takes", `${safeName(basename(out).replace(/\.[^.]+$/, "") || "line")}.${model}.s${seed}.${process.pid}.wav`);
    const item = { id: basename(out), text, out: take, seed, language: lang };
    if (model === "omnivoice" || model === "voxcpm2") {
        const ref = project && voice.reference ? join(project, voice.reference) : null;
        const prompt = project && voice.prompt ? join(project, voice.prompt) : null;
        if (model === "omnivoice" && voice.model === "omnivoice" && prompt && existsSync(prompt))
            item.prompt_path = prompt;
        else if (ref && existsSync(ref))
            Object.assign(item, { ref_audio: ref, ref_text: voice.reference_text });
        else if (voice.instruct)
            item.instruct = voice.instruct;
        else
            throw new VoiceError("REFERENCE_MISSING", "That voice has no reference clip or description.", "Design it with cutscene voice design, or pass --describe.");
    }
    else if (model === "kokoro")
        item.preset = voice.preset || pickKokoroVoice(voice.design || "", lang);
    else
        Object.assign(item, { voice: voice.voice, instruct: voice.instruct, engine: voice.engine });
    const steps = Number.isInteger(f.steps) ? f.steps : voice.model === model && Number.isInteger(voice.num_step) ? voice.num_step : undefined;
    const fast = f.fast !== undefined ? !!f.fast : voice.model === model && !!voice.fast;
    const gen = await generate(model, [item], ctx, { steps, fast, yes: !!f.yes });
    const master = await masterLine(take, out);
    const duration = round(wavInfo(out).duration);
    const lic = licenseFor(model);
    const licenseFile = out.replace(/\.[^.\\/]+$/, "") + ".license.txt";
    writeLicenseFile(licenseFile, { beatId: basename(out), file: basename(out), line: text, model, voice, speaker: speaker || voice.preset || "default", seed: model === "kokoro" ? null : seed });
    const result = {
        ok: true,
        file: out,
        duration,
        model,
        voice: speaker || voice.preset || null,
        seed: model === "kokoro" ? null : seed,
        license: lic.license,
        commercial_use: lic.commercial_use,
        license_file: licenseFile,
        seconds: gen.items[0].seconds,
        loudness: master.normalized ? { before_lufs: master.before, after_lufs: master.after } : null,
        verified: null,
    };
    if (!f["no-verify"]) {
        const t = await transcribeFiles([{ id: "line", path: out, language: lang }], ctx, status);
        if (t) {
            const v = judgeLine(text, t.items[0].words, { lang, duration });
            Object.assign(result, { verified: v.verified, heard: v.heard, issues: v.issues.map(describeIssue), words: v.words });
        }
    }
    const check = result.verified === null ? "not checked (no Whisper)" : result.verified ? "verified" : `FAILED the check (heard "${result.heard}")`;
    result.message = `Spoke ${duration} s into ${out} with ${model}${result.voice ? ` (${result.voice})` : ""} in ${fmtSeconds(result.seconds)}; ${check}. Licence: ${lic.license}.`;
    return result;
}
