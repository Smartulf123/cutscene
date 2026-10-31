#!/usr/bin/env node
// `cutscene 3d <command>`: 3D shots for Cutscene videos, made with Three.js inside the video
// (Tier 1): they render with the rest of the frame and need nothing installed. Blender (Tier 2)
// was removed; specs and commands that ask for it get a TIER2_REMOVED error (lib/tier.mjs).
// Node built-ins only. Dispatched by skills/cutscene/scripts/cli.mjs (contracts §3), or run directly.
import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, fetchAsset, findItem, fontFallbackWarning, isCached, loadManifest, resolveFont } from "./lib/assets.mjs";
import {
  cutsceneError, findProject, parseArgs, readJson, specNetworkField, updateShot3d, userPath, writeJson,
} from "./lib/project.mjs";
import { TEMPLATES, newSpec, readLook, usesText, validateSpec } from "./lib/spec.mjs";
import { REMOVED_COMMANDS, REMOVED_TEMPLATES, decideTier, ignoredWarning, refuseTier2, removedCommandError, tier2Error } from "./lib/tier.mjs";
import { writeTier1 } from "./lib/tier1.mjs";
import type { BeatsFile, CutsceneError, Flags } from "./lib/project.mjs";
import type { LookFont, Look, ShotSpec } from "./lib/spec.mjs";

/** A spec loaded from disk, with its project and any warnings about it. */
interface LoadedSpec {
  spec: ShotSpec;
  path: string;
  projectDir: string;
  warnings: string[];
}

/** What each command returns: the JSON envelope and the human-readable text. */
type CommandResult = { out: unknown; human: string };

const HELP = `Cutscene 3D: 3D shots made with Three.js inside the video

  cutscene 3d doctor                         what 3D shots need (nothing to install) and the cached assets
  cutscene 3d plan <spec>                    check a spec and say how the shot will be made
  cutscene 3d new <template> [--id ID] [--text T] [--svg F] [--model F] [--duration S] [--beat B] [--out F]
                                             write a spec (.cutscene/3d/<id>.json)
  cutscene 3d tier1 <template> [--spec <spec>] [--start S] [--track N] [--beat B] [--yes]
                                             write a Three.js shot into compositions/
  cutscene 3d assets [list | fetch <name> --yes]
                                             pinned fonts and the bloom library

  Templates: ${Object.keys(TEMPLATES).join(", ")}
  Add --json for one JSON object on stdout.`;

// ---------------------------------------------------------------- loading specs

function loadSpec(specArg: string | undefined): LoadedSpec {
  if (!specArg) throw cutsceneError("USAGE", "Which spec? Pass the path to a shot spec, e.g. .cutscene/3d/logo.json.", "Make one with `cutscene 3d new <template>`.", 2);
  const path = userPath(specArg);
  if (!existsSync(path)) throw cutsceneError("SPEC_NOT_FOUND", `There's no spec at ${path}.`, "Make one with `cutscene 3d new <template>`.");
  let spec: ShotSpec;
  try {
    spec = readJson(path) as ShotSpec;
  } catch {
    throw cutsceneError("SPEC_INVALID", `${basename(path)} isn't valid JSON.`, "Fix the JSON (a missing comma or quote is the usual cause).");
  }
  const netField = specNetworkField(spec);
  if (netField) throw cutsceneError("NETWORK_PATH", `The spec field ${netField} points at a network path, which Cutscene doesn't open.`, "Copy the file into the project (for example assets/) and use that path instead.");
  // Before validation: an old Blender spec should hear that Blender is gone, not that its template is unknown.
  refuseTier2(spec);
  const problems = validateSpec(spec);
  if (problems.length) {
    const e = cutsceneError("SPEC_INVALID", `The spec has ${problems.length} problem${problems.length > 1 ? "s" : ""}: ${problems.join(" ")}`, "Fix those fields and run the command again.");
    e.details = { problems };
    throw e;
  }
  const note = ignoredWarning(spec);
  return { spec, path, projectDir: findProject(dirname(path)), warnings: note ? [note] : [] };
}

function lookFor(spec: ShotSpec, projectDir: string): Look | null {
  const lookPath = spec.look ? resolve(projectDir, spec.look) : join(projectDir, ".cutscene", "look.json");
  return readLook(lookPath);
}

function refuseRemovedTemplate(template: string): void {
  if (REMOVED_TEMPLATES[template]) throw tier2Error([`"${template}" was a Blender template`], { template });
}

// ---------------------------------------------------------------- commands

async function cmdDoctor(): Promise<CommandResult> {
  const manifest = loadManifest();
  const cached = manifest.downloads.filter((d) => isCached(d)).map((d) => d.name);
  const out = {
    ok: true,
    ready: { tier1: true },
    tier2: { removed: true },
    assets: { cached, available: manifest.downloads.map((d) => d.name) },
  };
  const human = [
    "Tier 1 (Three.js inside the video): ready, nothing to install.",
    "Blender (Tier 2) was removed; every 3D shot is made in Tier 1.",
    `Cached assets: ${cached.length ? cached.join(", ") : "none"}`,
  ].join("\n");
  return { out, human };
}

async function cmdPlan(pos: string[]): Promise<CommandResult> {
  const { spec, path } = loadSpec(pos[0]);
  const decision = decideTier(spec);
  const specRel = (relative(process.cwd(), path) || path).split("\\").join("/");
  const next = `cutscene 3d tier1 ${decision.template} --spec ${specRel}`;
  const out = { ok: true, id: spec.id, ...decision, next };
  const lines = [`Shot "${spec.id}": Tier 1 (Three.js in the video), template ${decision.template}.`];
  for (const r of decision.reasons) lines.push(`  because ${r}`);
  for (const w of decision.warnings) lines.push(`  note: ${w}`);
  lines.push(`Next: ${next}`);
  return { out, human: lines.join("\n") };
}

async function cmdNew(pos: string[], flags: Flags): Promise<CommandResult> {
  const template = pos[0];
  if (!template) throw cutsceneError("USAGE", "Which template?", `Choose one of: ${Object.keys(TEMPLATES).join(", ")}.`, 2);
  refuseRemovedTemplate(template);
  if (!TEMPLATES[template]) throw cutsceneError("UNKNOWN_TEMPLATE", `There's no 3D template called "${template}".`, `Choose one of: ${Object.keys(TEMPLATES).join(", ")}.`, 2);
  const projectDir = findProject(process.cwd());
  let fps = 30, width = 1920, height = 1080, duration: number | undefined;
  const beatsPath = join(projectDir, ".cutscene", "beats.json");
  if (existsSync(beatsPath)) {
    try {
      const beats = readJson(beatsPath) as BeatsFile;
      fps = beats.fps || fps;
      width = beats.width || width;
      height = beats.height || height;
      const beat = flags.beat && beats.beats?.find((b) => b.id === flags.beat);
      if (flags.beat && !beat) throw cutsceneError("BEAT_NOT_FOUND", `There's no beat "${flags.beat}" in beats.json.`, "Check the beat ids in .cutscene/beats.json.");
      if (beat) duration = Math.round((beat.end - beat.start) * 1000) / 1000;
    } catch (e) {
      if ((e as CutsceneError).code === "BEAT_NOT_FOUND") throw e;
    }
  }
  if (flags.duration) duration = Number(flags.duration);
  const id = flags.id || (flags.out ? basename(String(flags.out)).replace(/\.json$/i, "") : template.replace(/[^a-z0-9]+/g, "-"));
  // A flag given without a value is `true`; these are passed on as they are.
  const spec = newSpec(template, { id: id as string, text: flags.text as string | undefined, svg: flags.svg as string | undefined, model: flags.model as string | undefined, duration, fps, width, height, beat: flags.beat as string | undefined });
  const problems = validateSpec(spec);
  if (problems.length) throw cutsceneError("SPEC_INVALID", problems.join(" "), "Check the values you passed.");
  const out = flags.out ? userPath(String(flags.out)) : join(projectDir, ".cutscene", "3d", `${id}.json`);
  if (existsSync(out) && !flags.force) throw cutsceneError("SPEC_EXISTS", `${relative(process.cwd(), out)} already exists.`, "Edit it, pick another --id, or pass --force to replace it.");
  writeJson(out, spec);
  const rel = (relative(process.cwd(), out) || out).split("\\").join("/");
  return { out: { ok: true, spec: out, id, template, duration: spec.duration }, human: `Wrote ${rel}. Next: cutscene 3d tier1 ${template} --spec ${rel}` };
}

async function cmdTier1(pos: string[], flags: Flags): Promise<CommandResult> {
  const template = pos[0];
  if (template) refuseRemovedTemplate(template);
  if (!template || !TEMPLATES[template]) throw cutsceneError("USAGE", "Which Three.js template?", `Choose one of: ${Object.keys(TEMPLATES).join(", ")}.`, 2);
  let spec: ShotSpec, projectDir: string, specPath: string | null = null;
  const warnings: string[] = [];
  if (flags.spec) {
    const loaded = loadSpec(String(flags.spec));
    spec = loaded.spec;
    projectDir = loaded.projectDir;
    specPath = loaded.path;
    warnings.push(...loaded.warnings);
  } else {
    projectDir = findProject(process.cwd());
    spec = newSpec("title3d", { id: (flags.id || template) as string, text: flags.text as string | undefined, duration: flags.duration ? Number(flags.duration) : undefined });
  }
  const look = lookFor(spec, projectDir);
  const display: LookFont = look?.type?.display || {};
  const font = !usesText(template) ? { path: null, source: "none" }
    : spec.font ? { path: userPath(spec.font, projectDir) }
    : resolveFont({ family: display.family, weight: display.weight || 700, src: display.src, projectDir });
  const r = await writeTier1({ template, spec, projectDir, look, font: font.path, yes: !!flags.yes, start: Number(flags.start) || 0, track: Number(flags.track) || 2 });
  let beats: { via: string } | null = null;
  const beatId = (flags.beat || spec.beat) as string | undefined;
  const beatsPath = join(projectDir, ".cutscene", "beats.json");
  if (beatId && !flags["no-beats"] && existsSync(beatsPath)) {
    const rel = (p: string) => relative(projectDir, p).split("\\").join("/");
    beats = await updateShot3d(beatsPath, beatId, { spec: specPath ? rel(specPath) : null, tier: 1, file: rel(r.file), duration: r.config.duration });
  }
  warnings.push(...r.warnings);
  const fontNote = fontFallbackWarning(font);
  if (fontNote) warnings.push(fontNote);
  const out = { ok: true, file: r.file, compositionId: r.compositionId, snippet: r.snippet, copied: r.copied, beats, warnings, next: "Paste the snippet into index.html inside the root composition, then run `cutscene check` and `cutscene snapshot`." };
  return { out, human: `Wrote ${r.file}.\nAdd this clip to index.html:\n  ${r.snippet}\n${warnings.map((w) => `note: ${w}`).join("\n")}\nThen: cutscene check, cutscene snapshot.` };
}

async function cmdAssets(pos: string[], flags: Flags): Promise<CommandResult> {
  const manifest = loadManifest();
  const sub = pos[0] || "list";
  if (sub === "list") {
    const items = manifest.downloads.map((d) => ({ ...describe(d), cached: isCached(d) }));
    return { out: { ok: true, downloads: items, runtime: manifest.runtime }, human: items.map((i) => `${i.cached ? "*" : " "} ${i.name}  ${Math.round(i.size / 1024)} KB  ${i.license}  ${i.source}`).join("\n") };
  }
  if (sub === "fetch") {
    const name = pos[1];
    const item = name && findItem(name, manifest);
    if (!item) throw cutsceneError("ASSET_UNKNOWN", `There's no pinned asset called "${name || ""}".`, "Run `cutscene 3d assets list` to see them.", 2);
    const got = await fetchAsset(item, { yes: !!flags.yes });
    return { out: { ok: true, name, path: got.path, cached: got.cached, credit: item.credit }, human: `${got.cached ? "Already had" : "Downloaded"} ${name}: ${got.path}\nCredit: ${item.credit}` };
  }
  throw cutsceneError("USAGE", `Unknown assets command "${sub}".`, "Use `cutscene 3d assets list` or `cutscene 3d assets fetch <name> --yes`.", 2);
}

const COMMANDS: Record<string, (pos: string[], flags: Flags) => Promise<CommandResult>> = { doctor: cmdDoctor, plan: cmdPlan, new: cmdNew, tier1: cmdTier1, assets: cmdAssets };

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { flags, pos } = parseArgs(argv);
  const cmd = pos.shift();
  const json = !!flags.json;
  if (!cmd || cmd === "help" || flags.help) {
    if (json) process.stdout.write(JSON.stringify({ ok: true, help: HELP }) + "\n");
    else process.stdout.write(HELP + "\n");
    return 0;
  }
  const fn = COMMANDS[cmd];
  try {
    if (!fn && REMOVED_COMMANDS.includes(cmd)) throw removedCommandError(cmd);
    if (!fn) throw cutsceneError("USAGE", `"cutscene 3d ${cmd}" isn't a command.`, "Run `cutscene 3d help` to see the commands.", 2);
    const { out, human } = await fn(pos, flags);
    if (json) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    else process.stdout.write(human + "\n");
    return 0;
  } catch (caught) {
    const err = caught as Partial<CutsceneError>;
    const code = typeof err.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(err.code) ? err.code : "UNEXPECTED";
    const env: { ok: false; error: { code: string; message: string | undefined; hint: string }; details?: unknown } = { ok: false, error: { code, message: err.message, hint: err.hint || (code === "UNEXPECTED" ? "This looks like a bug in Cutscene 3D. Run `cutscene 3d doctor`." : "") } };
    if (err.details) env.details = err.details;
    if (json) process.stdout.write(JSON.stringify(env, null, 2) + "\n");
    else {
      process.stderr.write(`Error: ${env.error.message}\n`);
      if (env.error.hint) process.stderr.write(`Fix: ${env.error.hint}\n`);
      if (code === "UNEXPECTED" && process.env.CUTSCENE_DEBUG) process.stderr.write(String(err.stack) + "\n");
    }
    return err.exitCode === 2 ? 2 : 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  main().then((code) => process.exit(code));
}
