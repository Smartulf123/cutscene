// Built from src/skills/cutscene-voice/scripts/lib/commands.mts by `npm run build`. Edit that file, not this one.
// The `cutscene voice` sub-commands: setup, status, design, clone, speak, verify, benchmark.
// Each returns a plain result object; voice.mjs prints it (human text or one JSON object).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, totalmem, version as osVersion, platform } from "node:os";
import { basename, join } from "node:path";
import { masterLine, toReferenceWav } from "./audio.mjs";
import { patchBeat, patchSheet, readBeats } from "./beatsio.mjs";
import { kokoroSpeak, kokoroStatus } from "./kokoro.mjs";
import { cutsceneHome, findProject, modelDir, projectFile, projectPaths, projectRel, readManifest, resolveUserPath, safeName, voicePaths } from "./paths.mjs";
import { checkConsent, licenseFor, recordConsent, writeLicenseFile } from "./project.mjs";
import { DEFAULT_MODELS, MODEL_IDS, describePlan, installModel, installPython, setupPlan, writeLock } from "./setup.mjs";
import { voiceStatus } from "./status.mjs";
import { describeIssue, estimateSeconds, judgeLine, parseOmniVoiceDescription, pickKokoroVoice } from "./text.mjs";
import { VoiceError, fmtBytes, fmtSeconds, log, round, today, usage } from "./util.mjs";
import * as studio from "./voicestudio.mjs";
import { runWorker } from "./worker.mjs";
import { wavInfo } from "./wav.mjs";
export const TTS_MODELS = ["omnivoice", "voxcpm2", "kokoro", "voicestudio"];
export const DEFAULT_SAMPLE = "Hi! I'm so glad you're here.";
export const DEFAULT_SEED = 42;
export const BENCH_TEXT = "Cutscene turns a short script into a finished video, one beat at a time.";
const DEFAULT_STEPS = { omnivoice: 16, voxcpm2: 10 };
const homeOf = (ctx) => ctx?.home || cutsceneHome();
function progressPrinter(prefix = "  ", verb = "speaking") {
    return (e) => {
        if (e.event === "load_done")
            log(`${prefix}model loaded in ${fmtSeconds(e.seconds)}`);
        else if (e.event === "item_start")
            log(`${prefix}${e.id}: ${verb} (${e.index + 1}/${e.total})...`);
        else if (e.event === "item_done" && e.duration !== undefined)
            log(`${prefix}${e.id}: ${fmtSeconds(e.seconds)} for ${e.duration.toFixed(1)} s of audio`);
        else if (e.event === "item_done")
            log(`${prefix}${e.id}: checked in ${fmtSeconds(e.seconds)}`);
        else if (e.event === "download_start")
            log(`${prefix}downloading ${e.file} (${fmtBytes(e.size)})...`);
        else if (e.event === "verify")
            log(`${prefix}checking ${e.file} (SHA-256)...`);
    };
}
function requireFlag(f, name, hint) {
    if (f[name] === undefined || f[name] === true || (typeof f[name] === "string" && !f[name].trim()))
        throw usage(`--${name} is required.`, hint);
    return f[name];
}
function installed(status, id) {
    return !!status.models.find((m) => m.id === id)?.installed;
}
/** Pick the speech model: the flag, else the best installed one, else VoiceStudio, else Kokoro. */
export function chooseModel(flag, status, { clone = false } = {}) {
    if (flag) {
        if (!TTS_MODELS.includes(flag))
            throw usage(`Unknown model "${flag}".`, `Use one of: ${TTS_MODELS.join(", ")}.`);
        if ((flag === "omnivoice" || flag === "voxcpm2") && !installed(status, flag)) {
            throw new VoiceError("MODEL_NOT_INSTALLED", `${flag === "omnivoice" ? "OmniVoice" : "VoxCPM2"} isn't installed.`, `Run \`cutscene voice setup --model ${flag}\` (shows size and licence, asks first), or use --model kokoro for the built-in English voice.`);
        }
        if (flag === "voicestudio" && !status.voicestudio.running)
            throw new VoiceError("VOICESTUDIO_NOT_RUNNING", "VoiceStudio isn't running.", "Start the VoiceStudio app, or pick another --model.");
        if (clone && (flag === "kokoro" || flag === "voicestudio")) {
            throw new VoiceError("CANT_CLONE", flag === "kokoro" ? "Kokoro has preset voices only; it can't clone." : "Cutscene clones with its own models; VoiceStudio clones inside its app.", flag === "kokoro" ? "Use --model omnivoice or --model voxcpm2." : "Save the voice as a profile in VoiceStudio, then: cutscene voice design --model voicestudio --voice <profile id>.");
        }
        return flag;
    }
    for (const m of ["omnivoice", "voxcpm2"])
        if (installed(status, m))
            return m;
    if (clone)
        throw new VoiceError("MODEL_NOT_INSTALLED", "Cloning needs OmniVoice or VoxCPM2, and neither is installed.", "Run `cutscene voice setup` (asks first).");
    if (status.voicestudio.running)
        return "voicestudio";
    return "kokoro";
}
async function loadSheet(project) {
    const pp = projectPaths(project);
    const sheet = await readBeats(pp.beats);
    return { pp, sheet };
}
// ---------------------------------------------------------------------------------------------
// Transcription (verify and reference checks)
export async function transcribeFiles(items, ctx, status) {
    if (installed(status, "whisper")) {
        const spec = readManifest().models.whisper;
        const res = await runWorker("whisper", { model_dir: modelDir("whisper", homeOf(ctx)), compute_type: spec.compute_type, items }, { home: homeOf(ctx), onProgress: progressPrinter("  ", "checking") });
        return { engine: "whisper", load_seconds: res.load_seconds, items: res.items };
    }
    if (status.voicestudio.running) {
        const out = [];
        for (const it of items) {
            const t0 = Date.now();
            const r = await studio.transcribe(it.path, { language: it.language });
            out.push({ id: it.id, path: it.path, words: r.words, text: r.text, seconds: (Date.now() - t0) / 1000 });
        }
        return { engine: "voicestudio", items: out };
    }
    return null;
}
// ---------------------------------------------------------------------------------------------
// Speech generation for any model
/**
 * items: [{id, text, out, seed, language, instruct?, ref_audio?, ref_text?, prompt_path?, save_prompt?, prompt_text?, preset?, voice?}]
 */
export async function generate(model, items, ctx, { steps, fast, yes } = {}) {
    const home = homeOf(ctx);
    if (model === "omnivoice" || model === "voxcpm2") {
        const res = await runWorker(model === "omnivoice" ? "omnivoice" : "voxcpm", { model_dir: modelDir(model, home), num_step: steps || DEFAULT_STEPS[model], fast: !!fast, items }, { home, onProgress: progressPrinter("  ") });
        return { load_seconds: res.load_seconds, num_step: res.num_step, items: res.items };
    }
    const out = [];
    for (const it of items) {
        log(`  ${it.id}: speaking...`);
        let r;
        if (model === "kokoro")
            r = await kokoroSpeak({ text: it.text, out: it.out, voice: it.preset || "af_heart", home, yes });
        else
            r = await studio.speak({ text: it.text, out: it.out, voice: it.voice, instruct: it.instruct, seed: it.seed, language: it.language, engine: it.engine, numStep: steps });
        const dur = wavInfo(it.out).duration;
        log(`  ${it.id}: ${fmtSeconds(r.seconds)} for ${dur.toFixed(1)} s of audio`);
        out.push({ id: it.id, out: it.out, seed: it.seed ?? null, duration: round(dur), seconds: round(r.seconds, 2), rtf: dur ? round(r.seconds / dur) : null });
    }
    return { load_seconds: 0, items: out };
}
// ---------------------------------------------------------------------------------------------
// setup
export async function cmdSetup(f, ctx) {
    const home = homeOf(ctx);
    const models = f.model?.length ? f.model : DEFAULT_MODELS;
    for (const m of models)
        if (!MODEL_IDS.includes(m))
            throw usage(`Unknown model "${m}".`, `Use one of: ${MODEL_IDS.join(", ")} (Kokoro needs no setup).`);
    const plan = setupPlan(models, { home, repair: !!f.repair });
    if (plan.nothing_to_do) {
        return { ok: true, message: `Already set up: ${models.join(", ")}. Nothing to download.`, models, plan };
    }
    const text = describePlan(plan);
    if (f["dry-run"]) {
        const manifest = readManifest();
        const groups = plan.groups;
        const commands = [
            `python -m venv "${voicePaths(home).venv}"`,
            `pip install --require-hashes pip==${manifest.python.pip.version}`,
            `pip install --no-deps --require-hashes --index-url ${manifest.python.torch_index} ${manifest.python.torch_wheels.map((w) => `${w.name}==${w.version}`).join(" ")}`,
            `pip install --index-url ${manifest.python.index} --uploaded-prior-to ${manifest.python.uploaded_prior_to} ${manifest.python.torch_wheels.map((w) => `${w.name}==${w.version}`).join(" ")} ${groups.flatMap((g) => (manifest.python.groups[g] || []).map((p) => `${p.name}==${p.version}`)).join(" ")}`,
            ...plan.items.filter((i) => i.kind === "model").map((i) => `download ${i.what} @ ${i.revision.slice(0, 12)} from ${i.source} into ${i.where}, then check SHA-256`),
        ];
        const steps = commands.map((x) => `    ${x}`).join("\n");
        return { ok: true, dry_run: true, plan, commands, message: `Dry run. Setup would do this (nothing was downloaded or installed):\n${text}\n  Steps:\n${steps}` };
    }
    if (!f.yes) {
        throw new VoiceError("NEEDS_CONSENT", `Voice setup needs to download files. Nothing was downloaded yet.\n${text}`, `To go ahead, run: cutscene voice setup${f.model?.length ? ` --model ${models.join(",")}` : ""} --yes`, { plan });
    }
    log(`Setting up Cutscene voices (${models.join(", ")}):\n${text}`);
    const t0 = Date.now();
    const lockPatch = {};
    if (plan.items.some((i) => i.kind === "python")) {
        const pkg = await installPython(plan.groups, { home, onStep: (s) => log(`- ${s}`) });
        Object.assign(lockPatch, { packages: pkg.packages, groups: pkg.groups, python: { version: `${pkg.python.major}.${pkg.python.minor}.${pkg.python.micro}`, platform: pkg.python.platform, machine: pkg.python.machine } });
        writeLock(home, lockPatch);
    }
    const modelResults = {};
    for (const item of plan.items.filter((i) => i.kind === "model")) {
        log(`- ${item.what}: ${item.download_bytes ? "downloading" : "checking"} (${item.license})`);
        modelResults[item.id] = await installModel(item.id, { home, onProgress: progressPrinter("    ") });
        writeLock(home, { models: { [item.id]: modelResults[item.id] } });
    }
    const status = await voiceStatus({ home, voicestudio: false });
    return {
        ok: true,
        message: `Voice setup done in ${fmtSeconds((Date.now() - t0) / 1000)}. ${status.detail.replace(/\.$/, "")}. Run \`cutscene voice benchmark\` once so Cutscene can tell you how long lines take on this computer.`,
        models,
        lock: voicePaths(home).lock,
        status,
    };
}
// ---------------------------------------------------------------------------------------------
// status
export async function cmdStatus(f, ctx) {
    const status = await voiceStatus({ home: homeOf(ctx) });
    const out = { ...status, ok: true, status_ok: status.ok }; // ok: the command ran; status_ok: voices are ready
    if (f.project) {
        const { sheet } = await loadSheet(findProject(f.project));
        out.project = {
            voices: sheet.voices || {},
            lines: (sheet.beats || []).filter((b) => b.voice?.line).map((b) => ({ id: b.id, speaker: b.voice.speaker, line: b.voice.line, file: b.voice.file || null, duration: b.voice.duration ?? null, verified: b.voice.verified ?? null })),
        };
    }
    const lines = [`Cutscene voices: ${status.detail.replace(/\.$/, "")}.`];
    for (const m of status.models) {
        const b = m.benchmark;
        const speed = b?.per_line_seconds ? `, about ${Math.round(b.per_line_seconds)} s per 3 s line here` : "";
        lines.push(`  ${m.installed ? "[x]" : "[ ]"} ${m.name}: ${m.installed ? "installed" : m.on_demand ? "installs on demand" : "not installed"} (${m.size_text || fmtBytes(m.size)}, ${m.license}${m.commercial_use === false ? ", non-commercial" : ""})${speed}`);
    }
    lines.push(`  VoiceStudio: ${status.voicestudio.running ? `running at ${status.voicestudio.url}` : "not running (optional)"}`);
    if (status.fix)
        lines.push(`  Next: ${status.fix}`);
    if (out.project) {
        lines.push(`  Project voices: ${Object.keys(out.project.voices).join(", ") || "none yet"}; lines: ${out.project.lines.length} (${out.project.lines.filter((l) => l.verified).length} verified)`);
    }
    out.message = lines.join("\n");
    return out;
}
// ---------------------------------------------------------------------------------------------
// design
async function checkReference(refPath, text, lang, ctx, status) {
    const t = await transcribeFiles([{ id: "reference", path: refPath, language: lang }], ctx, status);
    if (!t)
        return { checked: false };
    const item = t.items[0];
    const verdict = judgeLine(text, item.words, { lang, duration: item.duration });
    return { checked: true, engine: t.engine, verified: verdict.verified, heard: verdict.heard, issues: verdict.issues.map(describeIssue) };
}
export async function cmdDesign(f, ctx) {
    const home = homeOf(ctx);
    const speaker = safeName(requireFlag(f, "speaker", 'For example --speaker narrator.'));
    const project = findProject(f.project);
    const { pp, sheet } = await loadSheet(project);
    if (sheet.voices?.[speaker] && !f.replace) {
        throw new VoiceError("VOICE_EXISTS", `The project already has a voice called "${speaker}".`, `Pick another --speaker, or pass --replace (then speak all of ${speaker}'s lines again so they match).`);
    }
    const status = await voiceStatus({ home });
    const model = chooseModel(f.model, status);
    const lang = f.language || "en";
    const sample = (f.sample && f.sample !== true ? f.sample : DEFAULT_SAMPLE).trim();
    const describe = typeof f.describe === "string" ? f.describe.trim() : "";
    const seed = Number.isInteger(f.seed) ? f.seed : DEFAULT_SEED;
    mkdirSync(pp.work, { recursive: true });
    const refPath = join(pp.work, `${speaker}-ref.wav`);
    const voice = { model, design: describe || null, reference: projectRel(project, refPath), reference_text: sample, seed, language: lang, license: licenseFor(model).license, created: today() };
    const notes = [];
    let instruct = null;
    if (model === "omnivoice") {
        if (!describe)
            throw usage("--describe is required for OmniVoice.", 'For example --describe "female, young adult, american accent".');
        const parsed = parseOmniVoiceDescription(describe);
        if (!parsed.ok) {
            const bad = parsed.unknown.map((u) => `"${u.item}"${u.suggestion ? ` (did you mean "${u.suggestion}"?)` : ""}`).join(", ");
            const conflict = parsed.conflicts.map((c) => c.join(" vs ")).join("; ");
            throw new VoiceError("DESCRIPTION_UNSUPPORTED", `OmniVoice designs voices from a fixed set of tags${bad ? `; it doesn't know ${bad}` : ""}${conflict ? `; these clash: ${conflict}` : ""}.`, "Use comma-separated tags: male/female; child, teenager, young adult, middle-aged, elderly; very low/low/moderate/high/very high pitch; whisper; american/british/australian/canadian/indian/chinese/korean/japanese/russian/portuguese accent. For free-text styles (\"warm, calm\") use --model voxcpm2.");
        }
        instruct = parsed.instruct;
        voice.instruct = instruct;
        voice.prompt = projectRel(project, join(pp.work, `${speaker}.omnivoice.pt`));
        voice.num_step = Number.isInteger(f.steps) ? f.steps : DEFAULT_STEPS.omnivoice;
        voice.fast = !!f.fast;
    }
    else if (model === "voxcpm2") {
        if (!describe)
            throw usage("--describe is required for VoxCPM2.", 'For example --describe "young woman, warm, calm".');
        instruct = describe.replace(/[()]/g, "");
        voice.instruct = instruct;
    }
    else if (model === "kokoro") {
        voice.preset = typeof f.preset === "string" ? f.preset : pickKokoroVoice(describe, lang);
        voice.seed = null;
        if (!readManifest().presets.kokoro.voices.includes(voice.preset))
            throw usage(`Unknown Kokoro preset "${voice.preset}".`, `Use one of: ${readManifest().presets.kokoro.voices.join(", ")}.`);
        notes.push(`Kokoro has preset voices only; using "${voice.preset}"${describe ? ` for "${describe}"` : ""}.`);
    }
    else if (model === "voicestudio") {
        voice.engine = f.engine || "omnivoice";
        voice.voice = typeof f.voice === "string" ? f.voice : "default";
        const parsed = parseOmniVoiceDescription(describe);
        instruct = voice.engine === "omnivoice" && parsed.ok ? parsed.instruct : describe || null;
        voice.instruct = instruct;
        notes.push("VoiceStudio speaks each line from the same description and seed. For a voice that never drifts, save it as a profile in VoiceStudio and pass --voice <profile id>.");
    }
    const tries = Math.max(1, Math.min(5, Number.isInteger(f.tries) ? f.tries : 3));
    const takes = [];
    let chosen = null;
    for (let attempt = 0; attempt < tries; attempt++) {
        const s = model === "kokoro" ? null : seed + attempt;
        const takePath = join(pp.work, "takes", `${speaker}-ref.s${s ?? "preset"}.wav`);
        mkdirSync(join(pp.work, "takes"), { recursive: true });
        log(`Designing "${speaker}" with ${model}${s !== null ? `, seed ${s}` : ""}...`);
        const item = { id: `${speaker}-ref`, text: sample, out: takePath, seed: s ?? 0, language: lang, instruct, preset: voice.preset, voice: voice.voice, engine: voice.engine };
        if (model === "omnivoice")
            Object.assign(item, { save_prompt: join(project, voice.prompt), prompt_text: sample });
        const gen = await generate(model, [item], ctx, { steps: voice.num_step || f.steps, fast: voice.fast, yes: !!f.yes });
        const g = gen.items[0];
        const check = await checkReference(takePath, sample, lang, ctx, status);
        takes.push({ seed: s, file: projectRel(project, takePath), seconds: g.seconds, duration: g.duration, load_seconds: gen.load_seconds, check });
        if (!check.checked || check.verified || model === "kokoro") {
            chosen = takes[takes.length - 1];
            break;
        }
        log(`  The reference didn't say the sample right (heard "${check.heard}"); trying the next seed.`);
    }
    if (!chosen) {
        throw new VoiceError("REFERENCE_FAILED", `None of ${tries} reference takes said the sample sentence correctly.`, `Listen to the takes in ${projectRel(project, join(pp.work, "takes"))}. Try a simpler --sample, another --seed, or --tries 5.`, { takes });
    }
    copyFileSync(join(project, chosen.file), refPath);
    voice.seed = chosen.seed;
    voice.reference_verified = chosen.check.checked ? chosen.check.verified : null;
    if (!chosen.check.checked)
        notes.push("The reference wasn't checked by ear-equivalent (no Whisper or VoiceStudio). Install Whisper: cutscene voice setup --model whisper.");
    await patchSheet(pp.beats, { voices: { [speaker]: voice } });
    const lic = licenseFor(model);
    if (lic.commercial_use === false)
        notes.push(`${lic.title} is ${lic.license}: non-commercial use only. For paid work, design the voice with --model voxcpm2 or --model kokoro.`);
    return {
        ok: true,
        speaker,
        model,
        voice,
        reference: voice.reference,
        takes,
        notes,
        message: [
            `Designed voice "${speaker}" (${model}${voice.seed !== null ? `, seed ${voice.seed}` : ""}): ${voice.reference}`,
            chosen.check.checked ? `  Reference check: ${chosen.check.verified ? "passed" : "FAILED"} (heard "${chosen.check.heard}")` : "",
            `  Took ${fmtSeconds(chosen.seconds)} for ${chosen.duration} s of audio${chosen.load_seconds ? ` (+${fmtSeconds(chosen.load_seconds)} to load the model)` : ""}.`,
            ...notes.map((n) => `  Note: ${n}`),
            "  Let the user listen to the reference before speaking every line with it.",
        ].filter(Boolean).join("\n"),
    };
}
// ---------------------------------------------------------------------------------------------
// clone
export async function cmdClone(f, ctx) {
    // Consent comes first: nothing is read, copied or generated without it.
    const consent = checkConsent(f.consent);
    const home = homeOf(ctx);
    const speaker = safeName(requireFlag(f, "speaker", "For example --speaker host."));
    const from = resolveUserPath(requireFlag(f, "from", "The recording of the voice (3 to 10 seconds of clear speech is best)."));
    const text = String(requireFlag(f, "text", 'The exact words spoken in the recording, for example --text "Hi, I make videos about cooking."')).trim();
    if (!existsSync(from))
        throw new VoiceError("FILE_NOT_FOUND", `The recording doesn't exist: ${from}.`, "Check the path.");
    const project = findProject(f.project);
    const { pp, sheet } = await loadSheet(project);
    if (sheet.voices?.[speaker] && !f.replace)
        throw new VoiceError("VOICE_EXISTS", `The project already has a voice called "${speaker}".`, "Pick another --speaker, or pass --replace.");
    const status = await voiceStatus({ home });
    const model = chooseModel(f.model, status, { clone: true });
    const lang = f.language || "en";
    const seed = Number.isInteger(f.seed) ? f.seed : DEFAULT_SEED;
    mkdirSync(pp.work, { recursive: true });
    const refPath = join(pp.work, `${speaker}-ref.wav`);
    await toReferenceWav(from, refPath);
    const dur = wavInfo(refPath).duration;
    const notes = [];
    if (dur < 1.5)
        throw new VoiceError("REFERENCE_TOO_SHORT", `The recording is only ${dur.toFixed(1)} s long.`, "Use 3 to 10 seconds of clear speech.");
    if (dur < 3 || dur > 12)
        notes.push(`The recording is ${dur.toFixed(1)} s; 3 to 10 s of clear speech clones best.`);
    const check = await checkReference(refPath, text, lang, ctx, status);
    if (check.checked && !check.verified && !f.force) {
        throw new VoiceError("REFERENCE_TEXT_MISMATCH", `The words you gave don't match the recording. Heard: "${check.heard}".`, `Cloning needs the exact words. Pass --text with what is really said (maybe "${check.heard}"), or --force if you're sure.`, { heard: check.heard, issues: check.issues });
    }
    recordConsent(pp.projectMd, { speaker, source: basename(from), consent, model });
    const promptRel = model === "omnivoice" ? projectRel(project, join(pp.work, `${speaker}.omnivoice.pt`)) : undefined;
    const samplePath = join(pp.work, `${speaker}-sample.wav`);
    const sampleText = typeof f.sample === "string" ? f.sample : "This is how I sound in Cutscene.";
    log(`Cloning "${speaker}" with ${model}: a short sample to listen to...`);
    const item = { id: `${speaker}-sample`, text: sampleText, out: samplePath, seed, language: lang, ref_audio: refPath, ref_text: text };
    if (promptRel)
        item.save_prompt = join(project, promptRel);
    const steps = Number.isInteger(f.steps) ? f.steps : DEFAULT_STEPS[model];
    const gen = await generate(model, [item], ctx, { steps, fast: !!f.fast, yes: !!f.yes });
    const voice = {
        model,
        num_step: steps,
        ...(model === "omnivoice" ? { fast: !!f.fast } : {}),
        cloned_from: basename(from),
        consent,
        reference: projectRel(project, refPath),
        reference_text: text,
        seed,
        language: lang,
        license: licenseFor(model).license,
        sample: projectRel(project, samplePath),
        created: today(),
    };
    if (promptRel)
        voice.prompt = promptRel;
    await patchSheet(pp.beats, { voices: { [speaker]: voice } });
    if (licenseFor(model).commercial_use === false)
        notes.push(`${licenseFor(model).title} is non-commercial (${licenseFor(model).license}).`);
    return {
        ok: true,
        speaker,
        model,
        voice,
        consent_recorded: projectRel(project, pp.projectMd),
        sample: voice.sample,
        reference_check: check,
        seconds: gen.items[0].seconds,
        notes,
        message: [
            `Cloned voice "${speaker}" from ${basename(from)} with ${model} (seed ${seed}). Consent recorded in .cutscene/project.md.`,
            `  Listen first: ${voice.sample} (${fmtSeconds(gen.items[0].seconds)} to make).`,
            check.checked ? `  Reference words: ${check.verified ? "match" : "did NOT match (forced)"}.` : "  The reference words weren't checked (no Whisper).",
            ...notes.map((n) => `  Note: ${n}`),
        ].join("\n"),
    };
}
// ---------------------------------------------------------------------------------------------
// speak
function selectBeats(sheet, ids) {
    const withLines = (sheet.beats || []).filter((b) => typeof b?.voice?.line === "string" && b.voice.line.trim());
    if (!ids?.length)
        return withLines;
    const out = [];
    for (const id of ids) {
        const b = (sheet.beats || []).find((x) => x.id === id);
        if (!b)
            throw new VoiceError("BEAT_NOT_FOUND", `There's no beat "${id}" in beats.json.`, "Check the ids with `cutscene voice status --project <dir>`.");
        if (!b.voice?.line?.trim())
            throw new VoiceError("NO_LINE", `Beat "${id}" has no voice line.`, 'Add "voice": {"speaker": "narrator", "line": "..."} to the beat first.');
        out.push(b);
    }
    return out;
}
function speakerOf(beat, sheet) {
    if (beat.voice.speaker)
        return beat.voice.speaker;
    const names = Object.keys(sheet.voices || {});
    if (names.length === 1)
        return names[0];
    throw new VoiceError("NO_SPEAKER", `Beat "${beat.id}" doesn't say which voice speaks it.`, `Set voice.speaker to one of: ${names.join(", ") || "(design a voice first)"}.`);
}
/** Estimated seconds to speak these lines, from this computer's benchmark. */
export function estimateRun(model, lines, benchmarks) {
    const b = benchmarks?.models?.[model];
    if (!b?.rtf)
        return null;
    const audio = lines.reduce((a, l) => a + estimateSeconds(l), 0);
    return Math.round((b.load_seconds || 0) + b.rtf * audio);
}
export async function cmdSpeak(f, ctx) {
    const home = homeOf(ctx);
    const project = findProject(f.project);
    const { pp, sheet } = await loadSheet(project);
    const beats = selectBeats(sheet, f.beats);
    if (!beats.length)
        throw new VoiceError("NO_LINES", "No beat in beats.json has a voice line.", 'Add "voice": {"speaker": "narrator", "line": "..."} to the beats that need narration.');
    const status = await voiceStatus({ home });
    const jobs = new Map(); // model -> [{beat, item, voice, speaker}]
    for (const b of beats) {
        const speaker = speakerOf(b, sheet);
        const voice = sheet.voices?.[speaker];
        if (!voice)
            throw new VoiceError("VOICE_NOT_FOUND", `Beat "${b.id}" uses voice "${speaker}", which isn't designed or cloned yet.`, `Run \`cutscene voice design --speaker ${speaker} --describe "..."\` first.`);
        const model = chooseModel(f.model || voice.model, status);
        const base = Number.isInteger(f.seed) ? f.seed : Number.isInteger(b.voice.seed) ? b.voice.seed : Number.isInteger(voice.seed) ? voice.seed : DEFAULT_SEED;
        const seed = f.retry ? base + 1 : base;
        const lang = voice.language || "en";
        const take = join(pp.takes, `${safeName(b.id)}.${model}.s${seed}.wav`);
        const item = { id: b.id, text: b.voice.line.trim(), out: take, seed, language: lang };
        if (model === "omnivoice" || model === "voxcpm2") {
            const ref = projectFile(project, voice.reference, `voices.${speaker}.reference`);
            const prompt = projectFile(project, voice.prompt, `voices.${speaker}.prompt`);
            if (model === "omnivoice" && prompt && existsSync(prompt) && voice.model === "omnivoice")
                item.prompt_path = prompt;
            else if (ref && existsSync(ref))
                Object.assign(item, { ref_audio: ref, ref_text: voice.reference_text, ...(model === "omnivoice" && prompt ? { save_prompt: prompt } : {}) });
            else if (voice.instruct)
                item.instruct = voice.instruct;
            else
                throw new VoiceError("REFERENCE_MISSING", `Voice "${speaker}" has no reference clip.`, `Design or clone it again: cutscene voice design --speaker ${speaker} --replace ...`);
        }
        else if (model === "kokoro")
            item.preset = voice.preset || pickKokoroVoice(voice.design || "", lang);
        else
            Object.assign(item, { voice: voice.voice, instruct: voice.instruct, engine: voice.engine });
        const steps = Number.isInteger(f.steps) ? f.steps : voice.model === model && Number.isInteger(voice.num_step) ? voice.num_step : DEFAULT_STEPS[model];
        const fast = f.fast !== undefined ? !!f.fast : voice.model === model && !!voice.fast;
        const key = `${model}|${steps ?? ""}|${fast}`;
        if (!jobs.has(key))
            jobs.set(key, { model, steps, fast, list: [] });
        jobs.get(key).list.push({ beat: b, item, voice, speaker });
    }
    const estimate = [...jobs.values()].map((j) => estimateRun(j.fast ? `${j.model}-fast` : j.model, j.list.map((x) => x.item.text), status.benchmarks)).filter((x) => x !== null);
    if (estimate.length)
        log(`Speaking ${beats.length} line(s); about ${fmtSeconds(estimate.reduce((a, b) => a + b, 0))} on this computer.`);
    else
        log(`Speaking ${beats.length} line(s)${status.benchmarks ? "" : " (run `cutscene voice benchmark` once for time estimates)"}...`);
    mkdirSync(pp.takes, { recursive: true });
    mkdirSync(pp.assets, { recursive: true });
    const lines = [];
    for (const { model, steps, fast, list } of jobs.values()) {
        const gen = await generate(model, list.map((x) => x.item), ctx, { steps, fast, yes: !!f.yes });
        for (const g of gen.items) {
            const job = list.find((x) => x.item.id === g.id);
            const b = job.beat;
            const fileAbs = join(pp.assets, `${safeName(b.id)}.wav`);
            const master = await masterLine(job.item.out, fileAbs);
            const info = wavInfo(fileAbs);
            const file = projectRel(project, fileAbs);
            writeLicenseFile(join(pp.assets, `${safeName(b.id)}.license.txt`), { beatId: b.id, file, line: job.item.text, model, voice: job.voice, speaker: job.speaker, seed: model === "kokoro" ? null : g.seed });
            const duration = round(info.duration);
            await patchBeat(pp.beats, b.id, {
                voice: {
                    speaker: job.speaker,
                    file,
                    duration,
                    model,
                    seed: model === "kokoro" ? null : g.seed,
                    take: projectRel(project, job.item.out),
                    spoken: today(),
                    verified: false,
                    words: null,
                    heard: null,
                    issues: null,
                    accepted: null,
                },
            });
            const beatLen = Number.isFinite(b.end - b.start) ? round(b.end - b.start) : null;
            lines.push({
                id: b.id,
                file,
                duration,
                seed: model === "kokoro" ? null : g.seed,
                model,
                seconds: g.seconds,
                rtf: g.rtf,
                loudness: master.normalized ? { before_lufs: master.before, after_lufs: master.after } : null,
                warning: master.note || (beatLen !== null && duration > beatLen + 0.05 ? `The line is ${duration} s but beat ${b.id} is ${beatLen} s; lengthen the beat or shorten the line.` : null),
            });
        }
        if (gen.load_seconds)
            lines.push({ load: model, seconds: gen.load_seconds });
    }
    const spoken = lines.filter((l) => l.id);
    const result = {
        ok: true,
        lines: spoken,
        load_seconds: lines.filter((l) => l.load).reduce((a, l) => a + l.seconds, 0),
        message: [
            `Spoke ${spoken.length} line(s) into assets/voice/ (not verified yet):`,
            ...spoken.map((l) => `  ${l.id}: ${l.duration} s, made in ${fmtSeconds(l.seconds)} (${l.model}${l.seed !== null ? `, seed ${l.seed}` : ""})${l.warning ? `\n      ${l.warning}` : ""}`),
        ].join("\n"),
    };
    if (f["no-verify"]) {
        result.message += "\n  Not checked. Run `cutscene voice verify` before calling any line good.";
        return result;
    }
    const v = await cmdVerify({ project, beats: spoken.map((l) => l.id), _fromSpeak: true }, ctx).catch((err) => {
        if (err instanceof VoiceError && err.code === "LINES_FAILED")
            return { failed: err.extra, err };
        if (err instanceof VoiceError && err.code === "NO_TRANSCRIBER")
            return { skipped: err.message };
        throw err;
    });
    if (v.skipped) {
        result.verified = null;
        result.message += `\n  Not checked: ${v.skipped} Never call a line good without checking it.`;
        return result;
    }
    if (v.err) {
        v.err.extra = { ...v.err.extra, spoken: spoken };
        v.err.message = `${result.message}\n${v.err.message}`;
        throw v.err;
    }
    result.verified = true;
    result.verify = v.lines;
    result.message += `\n${v.message}`;
    return result;
}
// ---------------------------------------------------------------------------------------------
// verify
function verifyMarkdown(report) {
    const rows = [`# Voice check (${report.date})`, "", `Checked with ${report.engine}. ${report.lines.filter((l) => l.verified).length} of ${report.lines.length} lines passed.`, ""];
    for (const l of report.lines) {
        rows.push(`## ${l.id}: ${l.verified ? "passed" : "FAILED"}`, "", `- Script: ${l.line}`, `- Heard: ${l.heard || "(nothing)"}`);
        for (const i of l.issues)
            rows.push(`- Problem: ${describeIssue(i)}`);
        for (const w of l.warnings)
            rows.push(`- Listen: ${w.message}`);
        rows.push("");
    }
    return rows.join("\n");
}
export async function cmdVerify(f, ctx) {
    const home = homeOf(ctx);
    const project = findProject(f.project);
    const { pp, sheet } = await loadSheet(project);
    const all = (sheet.beats || []).filter((b) => b.voice?.line?.trim());
    let targets = all.filter((b) => b.voice.file);
    if (f.beats?.length) {
        for (const id of f.beats)
            if (!all.find((b) => b.id === id))
                throw new VoiceError("BEAT_NOT_FOUND", `There's no voice line "${id}" in beats.json.`, "Check the ids with `cutscene voice status --project <dir>`.");
        targets = all.filter((b) => f.beats.includes(b.id));
    }
    if (f.accept?.length) {
        const reason = typeof f.reason === "string" ? f.reason.trim() : "";
        if (!reason)
            throw usage("--accept needs --reason.", 'Say who listened and what they heard, e.g. --reason "listened: Whisper misspelled the name, the voice says it right".');
        for (const id of f.accept) {
            const b = all.find((x) => x.id === id);
            if (!b?.voice?.file)
                throw new VoiceError("NO_FILE", `Beat "${id}" has no voice file to accept.`, "Speak it first.");
            await patchBeat(pp.beats, id, { voice: { verified: true, accepted: `by ear (${today()}): ${reason}` } });
        }
        return { ok: true, accepted: f.accept, message: `Marked ${f.accept.join(", ")} as checked by ear: ${reason}. This is the listener's call, not Whisper's.` };
    }
    if (!targets.length)
        throw new VoiceError("NO_FILES", "No voice line has been spoken yet.", "Run `cutscene voice speak --project <dir>` first.");
    // only called once the line has a file (see `missing` below), so projectFile returns a path
    const fileOf = (b) => projectFile(project, b.voice.file, `beats[${b.id}].voice.file`);
    const missing = targets.filter((b) => !b.voice.file || !existsSync(fileOf(b)));
    if (missing.length)
        throw new VoiceError("FILE_MISSING", `These lines have no audio file: ${missing.map((b) => b.id).join(", ")}.`, `Speak them: cutscene voice speak --beats ${missing.map((b) => b.id).join(",")}`);
    const status = await voiceStatus({ home });
    const langOf = (b) => sheet.voices?.[b.voice.speaker]?.language || sheet.voices?.[Object.keys(sheet.voices || {})[0]]?.language || "en";
    log(`Checking ${targets.length} line(s) by transcribing them...`);
    const t = await transcribeFiles(targets.map((b) => ({ id: b.id, path: fileOf(b), language: langOf(b) })), ctx, status);
    if (!t)
        throw new VoiceError("NO_TRANSCRIBER", "Nothing can check the lines: Whisper isn't installed and VoiceStudio isn't running.", "Run `cutscene voice setup --model whisper` (about 1.6 GB, MIT, asks first).");
    const report = { version: 1, date: new Date().toISOString(), engine: t.engine, lines: [] };
    for (const b of targets) {
        const item = t.items.find((x) => x.id === b.id);
        const others = all.filter((x) => x.id !== b.id).map((x) => ({ id: x.id, line: x.voice.line }));
        const duration = wavInfo(fileOf(b)).duration;
        const v = judgeLine(b.voice.line, item.words, { lang: langOf(b), duration, otherLines: others });
        report.lines.push({ id: b.id, file: b.voice.file, line: b.voice.line, verified: v.verified, heard: v.heard, wer: v.wer, issues: v.issues, warnings: v.warnings, words: v.words, transcribe_seconds: item.seconds });
        await patchBeat(pp.beats, b.id, {
            voice: {
                words: v.words.map((w) => (w.estimated ? { w: w.w, start: w.start, end: w.end, p: 0, estimated: true } : { w: w.w, start: w.start, end: w.end, p: w.p })),
                verified: v.verified,
                heard: v.heard,
                issues: v.issues.length ? v.issues.map(describeIssue) : null,
                accepted: null,
            },
        });
    }
    mkdirSync(pp.work, { recursive: true });
    writeFileSync(pp.verifyJson, JSON.stringify(report, null, 2) + "\n", "utf8");
    writeFileSync(pp.verifyMd, verifyMarkdown(report) + "\n", "utf8");
    const failed = report.lines.filter((l) => !l.verified);
    const summary = [
        `Voice check (${t.engine}): ${report.lines.length - failed.length} of ${report.lines.length} line(s) passed. Report: .cutscene/voice/verify.md`,
        ...report.lines.map((l) => {
            const head = `  ${l.id}: ${l.verified ? "passed" : "FAILED"}${l.verified ? "" : ` (heard "${l.heard}")`}`;
            const probs = l.issues.map((i) => `      - ${describeIssue(i)}`);
            const warns = l.warnings.map((w) => `      - listen: ${w.message}`);
            return [head, ...probs, ...warns].join("\n");
        }),
    ].join("\n");
    const lines = report.lines.map(({ words, ...rest }) => rest);
    if (failed.length) {
        const ids = failed.map((l) => l.id).join(",");
        throw new VoiceError("LINES_FAILED", `${summary}\n  ${failed.length} line(s) failed the check.`, `Speak only those again with a new seed: cutscene voice speak --project "${project}" --beats ${ids} --retry. If a listener hears the line is right (Whisper misspelled a name), use: cutscene voice verify --accept ${ids} --reason "..."`, { lines, failed: failed.map((l) => l.id), report: projectRel(project, pp.verifyJson) });
    }
    return { ok: true, all_verified: true, lines, report: projectRel(project, pp.verifyJson), message: `${summary}\n  Word timings are in beats.json (voice.words) for captions.` };
}
// ---------------------------------------------------------------------------------------------
// benchmark
export async function cmdBenchmark(f, ctx) {
    const home = homeOf(ctx);
    const vp = voicePaths(home);
    const status = await voiceStatus({ home });
    const work = join(vp.jobs, "benchmark");
    mkdirSync(work, { recursive: true });
    const prev = (() => {
        try {
            return JSON.parse(readFileSync(vp.benchmarks, "utf8"));
        }
        catch {
            return null;
        }
    })();
    const results = { ...(prev?.models || {}) };
    const only = f.model?.length ? new Set(f.model) : null;
    const want = (id) => !only || only.has(id);
    let sampleForAsr = null;
    const benchLine = estimateSeconds(BENCH_TEXT);
    for (const id of ["omnivoice", "voxcpm2"]) {
        if (!want(id) || !installed(status, id))
            continue;
        log(`Benchmarking ${id} (design a reference, then speak one line with it)...`);
        const ref = join(work, `${id}-ref.wav`);
        const line = join(work, `${id}-line.wav`);
        const steps = f.steps || DEFAULT_STEPS[id];
        const items = [
            { id: "reference", text: DEFAULT_SAMPLE, out: ref, seed: 1, language: "en", instruct: id === "omnivoice" ? "female, young adult, american accent" : "young woman, warm", ...(id === "omnivoice" ? { save_prompt: join(work, "bench.pt"), prompt_text: DEFAULT_SAMPLE } : {}) },
            { id: "line", text: BENCH_TEXT, out: line, seed: 1, language: "en", ...(id === "omnivoice" ? { prompt_path: join(work, "bench.pt") } : { ref_audio: ref, ref_text: DEFAULT_SAMPLE }) },
        ];
        const fast = id === "omnivoice" && !!f.fast;
        const res = await runWorker(id === "omnivoice" ? "omnivoice" : "voxcpm", { model_dir: modelDir(id, home), num_step: steps, fast, items }, { home, onProgress: progressPrinter("  ") });
        const l = res.items[1];
        results[fast ? `${id}-fast` : id] = { mode: "clone", num_step: res.num_step, threads: res.threads, load_seconds: res.load_seconds, design_seconds: res.items[0].seconds, seconds: l.seconds, audio_seconds: l.duration, rtf: l.rtf, per_line_seconds: round(l.rtf * 3, 1), date: today() };
        sampleForAsr = sampleForAsr || line;
    }
    if (want("kokoro") && kokoroStatus(home).available) {
        log("Benchmarking the built-in Kokoro voice...");
        const out = join(work, "kokoro.wav");
        try {
            const r = await kokoroSpeak({ text: BENCH_TEXT, out, voice: "af_heart", home, yes: !!f.yes });
            const d = wavInfo(out).duration;
            results.kokoro = { seconds: round(r.seconds, 2), audio_seconds: round(d), rtf: round(r.seconds / d), per_line_seconds: round((r.seconds / d) * 3, 1), date: today(), note: "includes starting the engine" };
            sampleForAsr = sampleForAsr || out;
        }
        catch (err) {
            results.kokoro = { error: err.message, date: today() };
        }
    }
    if (want("whisper") && installed(status, "whisper") && sampleForAsr) {
        log("Benchmarking Whisper (transcribe the benchmark line)...");
        const spec = readManifest().models.whisper;
        const res = await runWorker("whisper", { model_dir: modelDir("whisper", home), compute_type: spec.compute_type, items: [{ id: "line", path: sampleForAsr, language: "en" }] }, { home, onProgress: progressPrinter("  ") });
        const it = res.items[0];
        const v = judgeLine(BENCH_TEXT, it.words, { duration: it.duration });
        results.whisper = { load_seconds: res.load_seconds, seconds: it.seconds, audio_seconds: it.duration, rtf: round(it.seconds / it.duration), per_line_seconds: round((it.seconds / it.duration) * 3, 1), heard: it.text, benchmark_line_verified: v.verified, date: today() };
    }
    if (!Object.keys(results).length)
        throw new VoiceError("NOTHING_TO_BENCHMARK", "No voice model is installed yet.", "Run `cutscene voice setup` first.");
    const bench = {
        version: 1,
        updated: new Date().toISOString(),
        sentence: BENCH_TEXT,
        sentence_estimate_seconds: round(benchLine, 1),
        machine: { cpu: cpus()[0]?.model?.trim(), threads: cpus().length, ram_gb: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${osVersion()}` },
        models: results,
    };
    mkdirSync(vp.root, { recursive: true });
    writeFileSync(vp.benchmarks, JSON.stringify(bench, null, 2) + "\n", "utf8");
    const lines = Object.entries(results).filter(([, r]) => !r.error).map(([id, r]) => `  ${id}: ${r.rtf} s per second of audio (about ${Math.round(r.per_line_seconds)} s for a 3 s line${r.load_seconds ? `, +${Math.round(r.load_seconds)} s to load once` : ""})`);
    return { ok: true, benchmarks: bench, file: vp.benchmarks, message: `Benchmark on ${bench.machine.cpu}:\n${lines.join("\n")}` };
}
