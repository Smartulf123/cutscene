#!/usr/bin/env node
// `cutscene 3d <command>`: 3D shots for Cutscene videos.
//   Tier 1: Three.js inside the video (nothing to install).
//   Tier 2: Blender, headless, rendered to a transparent WebM.
// Node built-ins only. Dispatched by skills/cutscene/scripts/cli.mjs (contracts §3), or run directly.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findBlender, runBlender, RUN_PY } from "./lib/blender.mjs";
import { contactSheetArgs, encodeArgs, hasTool, inspectAlpha, posterArgs, run } from "./lib/encode.mjs";
import { describe, fetchAsset, findItem, fontFallbackWarning, isCached, loadManifest, resolveFont } from "./lib/assets.mjs";
import {
  cutsceneError, cutsceneHome, findProject, parseArgs, readJson, shotPaths, specNetworkField, updateShot3d, userPath, writeJson,
} from "./lib/project.mjs";
import {
  TEMPLATES, TIER1_TEMPLATES, newSpec, readLook, resolveSpec, stillFrames, usesText, validateSpec,
} from "./lib/spec.mjs";
import { BENCH, decideTier, estimate, humanTime } from "./lib/tier.mjs";
import { writeTier1 } from "./lib/tier1.mjs";
import type { BlenderEvent, FoundBlender } from "./lib/blender.mjs";
import type { BeatsFile, CutsceneError, Flags, ShotPaths } from "./lib/project.mjs";
import type { LookFont, Look, ResolvedSpec, ShotSpec } from "./lib/spec.mjs";

/** <CUTSCENE_HOME>/logs/3d-timings.json: measured seconds per frame on this machine. */
interface Timings {
  perFrame?: Record<string, Record<string, number>>;
  eeveeFirstFrame?: number;
  updated?: string;
  machine?: string;
}

/** Blender's "done" event after a successful job (run.py). */
interface BlenderDone extends BlenderEvent {
  files: string[];
  frame_seconds: number[];
  build_seconds: number;
}

/** A spec loaded from disk, with its project and the shot's paths. */
interface LoadedSpec {
  spec: ShotSpec;
  path: string;
  projectDir: string;
  paths: ShotPaths;
}

/** What each command returns: the JSON envelope and the human-readable text. */
type CommandResult = { out: unknown; human: string };

const HELP = `Cutscene 3D

  cutscene 3d doctor                         check Blender, FFmpeg (VP9 alpha) and fonts
  cutscene 3d plan <spec>                    Tier 1 or Tier 2, engine, and time on this PC
  cutscene 3d new <template> [--id ID] [--text T] [--svg F] [--model F] [--duration S] [--beat B] [--out F]
                                             write a spec (.cutscene/3d/<id>.json)
  cutscene 3d stills <spec> [--count 3-5] [--frames 1,30,60] [--scale 50]
                                             render a few frames + a contact sheet (always first)
  cutscene 3d render <spec> [--scale 100] [--force]
                                             full PNG RGBA sequence (after the stills look right)
  cutscene 3d encode <shot|spec> [--crf 28] [--beat B] [--no-beats]
                                             transparent VP9 WebM + poster in assets/3d/
  cutscene 3d tier1 <template> --spec <spec> [--start S] [--track N] [--yes]
                                             write a Three.js shot into compositions/
  cutscene 3d assets [list | fetch <name> --yes]
                                             pinned fonts, HDRIs, bloom library

  Tier 2 templates: ${Object.keys(TEMPLATES).join(", ")}
  Tier 1 templates: ${Object.keys(TIER1_TEMPLATES).join(", ")}
  Add --json for one JSON object on stdout.`;

const log = (...a: unknown[]) => process.stderr.write(a.join(" ") + "\n");

function timingsFile(): string {
  return join(cutsceneHome(), "logs", "3d-timings.json");
}

function readBench() {
  try {
    const t = readJson(timingsFile()) as Timings;
    return { ...BENCH, perFrame: { ...BENCH.perFrame, ...(t.perFrame || {}) }, eeveeFirstFrame: t.eeveeFirstFrame ?? BENCH.eeveeFirstFrame };
  } catch {
    return BENCH;
  }
}

/** Remember measured seconds per frame (normalised to 1080p) so later estimates are real. */
function recordBench(engine: string, quality: string, frameSeconds: number[], pixelsRatio: number, firstFrame: number | null | undefined): void {
  // One frame is mostly shader compile, and small renders don't scale with pixels: skip both.
  if (frameSeconds.length < 2 || pixelsRatio < 0.24) return;
  let t: Timings = {};
  try {
    t = readJson(timingsFile()) as Timings;
  } catch {
    t = {};
  }
  const steady = frameSeconds.length > 1 ? frameSeconds.slice(1) : frameSeconds;
  const avg = steady.reduce((a, b) => a + b, 0) / steady.length / Math.max(0.01, pixelsRatio);
  t.perFrame = t.perFrame || {};
  t.perFrame[engine] = t.perFrame[engine] || {};
  const prev = t.perFrame[engine][quality];
  t.perFrame[engine][quality] = Math.round((prev ? prev * 0.5 + avg * 0.5 : avg) * 100) / 100;
  if (engine === "BLENDER_EEVEE" && firstFrame != null && frameSeconds.length > 1) t.eeveeFirstFrame = Math.round(firstFrame);
  t.updated = new Date().toISOString();
  t.machine = `${process.platform} ${process.arch}`;
  try {
    writeJson(timingsFile(), t);
  } catch {
    /* timings are a nicety */
  }
}

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
  const problems = validateSpec(spec);
  if (problems.length) {
    const e = cutsceneError("SPEC_INVALID", `The spec has ${problems.length} problem${problems.length > 1 ? "s" : ""}: ${problems.join(" ")}`, "Fix those fields and run the command again.");
    e.details = { problems };
    throw e;
  }
  const projectDir = findProject(dirname(path));
  return { spec, path, projectDir, paths: shotPaths(projectDir, spec.id) };
}

function lookFor(spec: ShotSpec, projectDir: string): Look | null {
  const lookPath = spec.look ? resolve(projectDir, spec.look) : join(projectDir, ".cutscene", "look.json");
  return readLook(lookPath);
}

function hashOf(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

function prepare(spec: ShotSpec, projectDir: string) {
  const look = lookFor(spec, projectDir);
  const display: LookFont = look?.type?.display || {};
  // Only text templates load a font; a logo or a product shot never warns about one.
  const font = !usesText(spec.template, 2) ? { path: null, source: "none" }
    : spec.font ? { path: userPath(spec.font, projectDir), source: "spec" }
    : resolveFont({ family: display.family, weight: display.weight || 700, src: display.src, tier: 2, projectDir });
  const resolved = resolveSpec(spec, { projectDir, look, fontPath: font.path });
  const warnings: string[] = [];
  const fontNote = fontFallbackWarning(font, 2);
  if (fontNote) warnings.push(fontNote);
  for (const k of ["svg", "model"] as const) {
    const f = resolved.params[k];
    if (f && !existsSync(f)) throw cutsceneError("FILE_NOT_FOUND", `The ${k === "svg" ? "SVG" : "model"} file ${f} doesn't exist.`, `Check params.${k} in the spec (paths are relative to the project folder).`);
  }
  if (resolved.lighting.hdri && !existsSync(resolved.lighting.hdri)) {
    const item = findItem(resolved.lighting.hdri.replace(/^.*[\\/]/, ""));
    if (item && isCached(item)) resolved.lighting.hdri = join(cutsceneHome(), "assets", item.sha256, basename(new URL(item.url).pathname));
    else throw cutsceneError("FILE_NOT_FOUND", `The HDRI ${resolved.lighting.hdri} doesn't exist.`, "Use a pinned one: cutscene 3d assets fetch hdri-studio-small-09 --yes, then set lighting.hdri to \"hdri-studio-small-09\".");
  }
  return { resolved, look, font, warnings };
}

async function needBlender(): Promise<FoundBlender> {
  const b = await findBlender();
  if (!b) {
    throw cutsceneError("BLENDER_MISSING", "This is a Blender (Tier 2) shot, but Cutscene couldn't find Blender 4.2 or newer.",
      "Ask the user: install Blender (`cutscene setup`, with their OK), or set CUTSCENE_BLENDER to blender.exe, or make the shot in Tier 1 with `cutscene 3d tier1`.");
  }
  return b;
}

async function blenderJob(resolved: ResolvedSpec, paths: ShotPaths, mode: string, extra: string[], { json }: { json?: unknown }) {
  mkdirSync(paths.work, { recursive: true });
  writeJson(paths.resolved, resolved);
  const blender = await needBlender();
  const est = estimate({ ...resolved, quality: resolved.quality, duration: resolved.duration }, { engine: resolved.engine, bench: readBench() });
  const timeout = Math.max(10 * 60_000, (est.renderSeconds * 4 + 600) * 1000);
  let done = 0;
  const t0 = Date.now();
  const r = await runBlender(RUN_PY, ["--spec", paths.resolved, "--mode", mode, ...extra], {
    blender: blender.path,
    timeout,
    onEvent: (ev) => {
      if (json) return;
      if (ev.event === "built") log(`Built ${ev.template} (${ev.engine === "CYCLES" ? "Cycles" : "EEVEE"}) in ${ev.seconds}s.`);
      if (ev.event === "frame") {
        done++;
        log(`  frame ${ev.frame}: ${ev.seconds}s`);
      }
    },
  });
  const done_ = r.events.find((e) => e.event === "done");
  if (!r.ok || !done_?.ok) {
    const tail = (r.stderr + r.stdout).split(/\r?\n/).filter((l) => /Error|Traceback|line \d+/.test(l)).slice(-6).join(" | ");
    if (r.timedOut) throw cutsceneError("BLENDER_TIMEOUT", `Blender ran longer than ${Math.round(timeout / 60000)} min and was stopped.`, "Render fewer frames, use --scale 50, or switch to EEVEE.");
    throw cutsceneError("BLENDER_FAILED", `Blender couldn't build the shot: ${done_?.error || tail || `exit code ${r.code}`}`, "Fix the spec (see the message) and try the stills again. Run with --json for details.");
  }
  return { blender, result: done_ as BlenderDone, built: r.events.find((e) => e.event === "built"), wallSeconds: (Date.now() - t0) / 1000 };
}

// ---------------------------------------------------------------- commands

async function cmdDoctor(): Promise<CommandResult> {
  const b = await findBlender({ detailed: true });
  const ffmpeg = hasTool("ffmpeg");
  const ffprobe = hasTool("ffprobe");
  let vp9 = false;
  if (ffmpeg) vp9 = /libvpx-vp9/.test(run("ffmpeg", ["-hide_banner", "-encoders"]).stdout);
  const manifest = loadManifest();
  const cached = manifest.downloads.filter((d) => isCached(d)).map((d) => d.name);
  const ok = Boolean(ffmpeg && ffprobe && vp9);
  const out = {
    ok: true,
    ready: { tier1: true, tier2: Boolean(b.found && ok) },
    blender: b.found ? { found: true, path: b.found.path, version: b.found.version, source: b.found.source } : { found: false, skipped: b.skipped },
    ffmpeg: { found: ffmpeg, vp9Alpha: vp9 },
    ffprobe: { found: ffprobe },
    assets: { cached, available: manifest.downloads.map((d) => d.name) },
    machine: BENCH.machine,
    timings: readBench().perFrame,
  };
  const human = [
    `Blender: ${b.found ? `${b.found.version} (${b.found.path})` : "not found (Tier 2 needs Blender 4.2+)"}`,
    `FFmpeg: ${ffmpeg ? (vp9 ? "ok, with VP9 alpha" : "found, but without libvpx-vp9") : "not found"}`,
    `Tier 1 (Three.js): ready. Tier 2 (Blender): ${out.ready.tier2 ? "ready" : "not ready"}.`,
    `Cached assets: ${cached.length ? cached.join(", ") : "none"}`,
  ].join("\n");
  return { out, human };
}

async function cmdPlan(pos: string[], flags: Flags): Promise<CommandResult> {
  const { spec } = loadSpec(pos[0]);
  const blender = await findBlender();
  const decision = decideTier(spec, { blender, deadline: !!flags.deadline });
  const bench = readBench();
  let est = null;
  if (decision.tier === 2) {
    est = estimate(spec, { engine: decision.engine, stills: 4, bench });
  }
  const out = { ok: true, id: spec.id, ...decision, blender: blender ? { path: blender.path, version: blender.version } : null, estimate: est };
  const lines = [`Shot "${spec.id}": Tier ${decision.tier} (${decision.tier === 2 ? `Blender ${decision.engine === "CYCLES" ? "Cycles" : "EEVEE"}` : "Three.js in the video"}), template ${decision.template}.`];
  for (const r of decision.reasons) lines.push(`  because ${r}`);
  for (const w of decision.warnings) lines.push(`  note: ${w}`);
  if (est) lines.push(`  time on this PC: stills ${humanTime(est.stillsSeconds)}, full render ${est.human} (${est.frames} frames at ~${est.secondsPerFrame}s), encode ${humanTime(est.encodeSeconds)}.`);
  if (decision.fallback) lines.push(`  ${decision.fallback.message}`);
  return { out, human: lines.join("\n") };
}

async function cmdNew(pos: string[], flags: Flags): Promise<CommandResult> {
  const template = pos[0];
  if (!template) throw cutsceneError("USAGE", "Which template?", `Choose one of: ${Object.keys(TEMPLATES).join(", ")} (Blender) or ${Object.keys(TIER1_TEMPLATES).join(", ")} (Three.js).`, 2);
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
  const base = TEMPLATES[template] ? template : TIER1_TEMPLATES[template] ? "title3d" : null;
  if (!base) throw cutsceneError("UNKNOWN_TEMPLATE", `There's no 3D template called "${template}".`, `Choose one of: ${[...new Set([...Object.keys(TEMPLATES), ...Object.keys(TIER1_TEMPLATES)])].join(", ")}.`, 2);
  // A flag given without a value is `true`; these are passed on as they are.
  const spec = newSpec(base, { id: id as string, text: flags.text as string | undefined, svg: flags.svg as string | undefined, model: flags.model as string | undefined, duration, fps, width, height, beat: flags.beat as string | undefined });
  if (!TEMPLATES[template]) {
    spec.template = template;
    spec.tier = 1;
    if (template !== "title3d") delete spec.params.text;
  }
  const problems = validateSpec(spec);
  if (problems.length) throw cutsceneError("SPEC_INVALID", problems.join(" "), "Check the values you passed.");
  const out = flags.out ? userPath(String(flags.out)) : join(projectDir, ".cutscene", "3d", `${id}.json`);
  if (existsSync(out) && !flags.force) throw cutsceneError("SPEC_EXISTS", `${relative(process.cwd(), out)} already exists.`, "Edit it, pick another --id, or pass --force to replace it.");
  writeJson(out, spec);
  return { out: { ok: true, spec: out, id, template, duration: spec.duration }, human: `Wrote ${relative(process.cwd(), out) || out}. Next: cutscene 3d plan ${relative(process.cwd(), out)}` };
}

async function cmdStills(pos: string[], flags: Flags): Promise<CommandResult> {
  const { spec, paths } = loadSpec(pos[0]);
  if (TIER1_TEMPLATES[spec.template] && !TEMPLATES[spec.template]) throw cutsceneError("TIER1_TEMPLATE", `"${spec.template}" is a Three.js shot.`, "Use `cutscene 3d tier1` and then `cutscene snapshot` to look at it.");
  const { resolved, warnings } = prepare(spec, paths.project);
  // Stills are for judging look and motion: draft samples keep them quick.
  if (!flags.final) resolved.quality = "draft";
  const count = Math.max(3, Math.min(5, Number(flags.count) || 4));
  const frames = flags.frames ? String(flags.frames).split(",").map(Number).filter((n) => n >= 1) : stillFrames(resolved.frames, count);
  const scale = Math.max(10, Math.min(100, Number(flags.scale) || 50));
  rmSync(paths.stills, { recursive: true, force: true });
  const job = await blenderJob(resolved, paths, "stills", ["--out", paths.stills, "--frames", frames.join(","), "--scale", String(scale)], flags);
  const stills = job.result.files.map((f) => resolve(f));
  let sheet = null;
  if (!flags["no-sheet"] && hasTool("ffmpeg")) {
    const w = Math.round((resolved.width * scale) / 100 / 2) * 2;
    const h = Math.round((resolved.height * scale) / 100 / 2) * 2;
    const r = run("ffmpeg", contactSheetArgs({ stills, out: paths.sheet, width: w, height: h, bg: resolved.palette.bg }));
    if (r.code === 0) sheet = paths.sheet;
    else warnings.push(`The contact sheet failed (${r.stderr.trim().split("\n").pop()}); look at the stills one by one.`);
  }
  const fs = job.result.frame_seconds;
  recordBench(resolved.engine, "draft", fs, (scale / 100) ** 2, fs[0]);
  writeJson(join(paths.stills, "meta.json"), { spec: hashOf(spec), frames, scale, engine: resolved.engine, at: new Date().toISOString(), frameSeconds: fs });
  const out = {
    ok: true, id: spec.id, engine: resolved.engine, frames, stills, contactSheet: sheet, frameSeconds: fs,
    buildSeconds: job.result.build_seconds, wallSeconds: Math.round(job.wallSeconds * 10) / 10, warnings,
    next: "Look at the contact sheet (and each still). If it looks right, run `cutscene 3d render`. If not, edit the spec and render the stills again.",
  };
  const human = [`Stills: ${stills.length} frames (${frames.join(", ")}) at ${scale}% in ${out.wallSeconds}s.`, sheet ? `Contact sheet: ${sheet}` : "", ...warnings.map((w) => `note: ${w}`), out.next].filter(Boolean).join("\n");
  return { out, human };
}

async function cmdRender(pos: string[], flags: Flags): Promise<CommandResult> {
  const { spec, paths } = loadSpec(pos[0]);
  const { resolved, warnings } = prepare(spec, paths.project);
  const metaPath = join(paths.stills, "meta.json");
  let stillsOk = false;
  try {
    stillsOk = (readJson(metaPath) as { spec?: string }).spec === hashOf(spec);
  } catch {
    stillsOk = false;
  }
  if (!stillsOk && !flags.force) {
    throw cutsceneError("STILLS_FIRST", "Render the stills for this exact spec and look at them before the full render.", `Run: cutscene 3d stills ${pos[0]}  (or pass --force if the user has already approved this look).`);
  }
  const scale = Math.max(10, Math.min(100, Number(flags.scale) || 100));
  rmSync(paths.frames, { recursive: true, force: true });
  const est = estimate(resolved, { engine: resolved.engine, bench: readBench(), scale: scale / 100 });
  if (!flags.json) log(`Rendering ${resolved.frames} frames with ${resolved.engine === "CYCLES" ? "Cycles (CPU)" : "EEVEE"}: ${est.human} on this PC.`);
  const job = await blenderJob(resolved, paths, "render", ["--out", paths.frames, "--scale", String(scale)], flags);
  const fs = job.result.frame_seconds;
  if (scale === 100) recordBench(resolved.engine, resolved.quality, fs, 1, fs[0]);
  const files = readdirSync(paths.frames).filter((f) => /^frame_\d+\.png$/.test(f));
  const steady = fs.length > 1 ? fs.slice(1) : fs;
  const out = {
    ok: true, id: spec.id, engine: resolved.engine, frames: files.length, framesDir: paths.frames, scale,
    secondsPerFrame: Math.round((steady.reduce((a, b) => a + b, 0) / Math.max(1, steady.length)) * 100) / 100,
    firstFrameSeconds: fs[0], wallSeconds: Math.round(job.wallSeconds * 10) / 10, warnings,
    next: `cutscene 3d encode ${spec.id}`,
  };
  return { out, human: `Rendered ${files.length} frames in ${out.wallSeconds}s (${out.secondsPerFrame}s per frame) to ${paths.frames}.\nNext: ${out.next}` };
}

function shotFromArg(arg: string | undefined): { spec: { id: string; fps?: number; beat?: string }; path: string | null; projectDir: string; paths: ShotPaths } {
  if (!arg) throw cutsceneError("USAGE", "Which shot? Pass its id (e.g. logo) or its spec path.", "", 2);
  if (/\.json$/i.test(arg)) return loadSpec(arg);
  const projectDir = findProject(process.cwd());
  const paths = shotPaths(projectDir, arg);
  if (existsSync(paths.spec)) return loadSpec(paths.spec);
  return { spec: { id: arg, fps: 30 }, path: null, projectDir, paths };
}

async function cmdEncode(pos: string[], flags: Flags): Promise<CommandResult> {
  const { spec, paths, path } = shotFromArg(pos[0]);
  if (!hasTool("ffmpeg")) throw cutsceneError("FFMPEG_MISSING", "FFmpeg isn't installed, so Cutscene can't make the WebM.", "Run `cutscene doctor` to see how to install it.");
  if (!existsSync(paths.frames)) throw cutsceneError("NO_FRAMES", `There are no rendered frames for "${spec.id}".`, `Run: cutscene 3d render .cutscene/3d/${spec.id}.json`);
  const frames = readdirSync(paths.frames).filter((f) => /^frame_\d+\.png$/.test(f)).sort();
  if (!frames.length) throw cutsceneError("NO_FRAMES", `The frames folder for "${spec.id}" is empty.`, "Render the shot again.");
  const start = Number(/(\d+)/.exec(frames[0])![1]);
  let fps = spec.fps || 30;
  try {
    fps = (readJson(paths.resolved) as { fps?: number }).fps || fps;
  } catch {
    /* use the spec */
  }
  mkdirSync(dirname(paths.webm), { recursive: true });
  const t0 = Date.now();
  const r = run("ffmpeg", encodeArgs({ framesDir: paths.frames, fps, out: paths.webm, crf: Number(flags.crf) || 28, start }));
  if (r.code !== 0) throw cutsceneError("ENCODE_FAILED", `FFmpeg couldn't encode the WebM: ${r.stderr.trim().split("\n").pop()}`, "Check that FFmpeg has libvpx-vp9 (`cutscene 3d doctor`).");
  const posterFrame = join(paths.frames, frames[frames.length - 1]);
  run("ffmpeg", posterArgs({ frame: posterFrame, out: paths.poster }));
  const check = hasTool("ffprobe") ? inspectAlpha(paths.webm) : null;
  if (check && !(check.alphaMode && check.decodedAlpha)) {
    throw cutsceneError("NO_ALPHA", "The WebM was written but its transparency didn't survive.", "Make sure the frames are RGBA PNGs (transparent: true in the spec) and FFmpeg has libvpx-vp9.");
  }
  const duration = Math.round((frames.length / fps) * 1000) / 1000;
  let beats: { via: string; beat?: string } | null = null;
  const beatId = (flags.beat || spec.beat) as string | undefined;
  if (beatId && !flags["no-beats"] && existsSync(paths.beats)) {
    const rel = (p: string) => relative(paths.project, p).split("\\").join("/");
    beats = await updateShot3d(paths.beats, beatId, { spec: path ? rel(path) : `.cutscene/3d/${spec.id}.json`, tier: 2, file: rel(paths.webm), duration });
    beats.beat = beatId;
  }
  const out = {
    ok: true, id: spec.id, webm: paths.webm, poster: paths.poster, frames: frames.length, fps, duration,
    alpha: check, encodeSeconds: Math.round((Date.now() - t0) / 100) / 10, sizeBytes: statSync(paths.webm).size, beats,
    clip: `<video id="${spec.id}-3d" class="clip" src="assets/3d/${spec.id}.webm" data-start="0" data-duration="${duration}" data-track-index="3" muted playsinline></video>`,
  };
  return { out, human: `Wrote ${paths.webm} (${(out.sizeBytes / 1024).toFixed(0)} KB, ${duration}s, alpha ${check ? (check.transparentPixels ? "ok" : "tagged") : "unchecked"}) and ${paths.poster}.${beats ? `\nUpdated beat ${beatId} in beats.json.` : ""}` };
}

async function cmdTier1(pos: string[], flags: Flags): Promise<CommandResult> {
  const template = pos[0];
  if (!template || !TIER1_TEMPLATES[template]) throw cutsceneError("USAGE", "Which Three.js template?", `Choose one of: ${Object.keys(TIER1_TEMPLATES).join(", ")}.`, 2);
  let spec: ShotSpec, projectDir: string, specPath: string | null = null;
  if (flags.spec) {
    const loaded = loadSpec(String(flags.spec));
    spec = loaded.spec;
    projectDir = loaded.projectDir;
    specPath = loaded.path;
  } else {
    projectDir = findProject(process.cwd());
    spec = newSpec("title3d", { id: (flags.id || template) as string, text: flags.text as string | undefined, duration: flags.duration ? Number(flags.duration) : undefined });
  }
  const look = lookFor(spec, projectDir);
  const display: LookFont = look?.type?.display || {};
  const font = !usesText(template, 1) ? { path: null, source: "none" }
    : spec.font ? { path: userPath(spec.font, projectDir) }
    : resolveFont({ family: display.family, weight: display.weight || 700, src: display.src, tier: 1, projectDir });
  const r = await writeTier1({ template, spec, projectDir, look, font: font.path, yes: !!flags.yes, start: Number(flags.start) || 0, track: Number(flags.track) || 2 });
  let beats: { via: string } | null = null;
  const beatId = (flags.beat || spec.beat) as string | undefined;
  const beatsPath = join(projectDir, ".cutscene", "beats.json");
  if (beatId && !flags["no-beats"] && existsSync(beatsPath)) {
    const rel = (p: string) => relative(projectDir, p).split("\\").join("/");
    beats = await updateShot3d(beatsPath, beatId, { spec: specPath ? rel(specPath) : null, tier: 1, file: rel(r.file), duration: r.config.duration });
  }
  const warnings = [...r.warnings];
  const fontNote = fontFallbackWarning(font, 1);
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

const COMMANDS: Record<string, (pos: string[], flags: Flags) => Promise<CommandResult>> = { doctor: cmdDoctor, plan: cmdPlan, new: cmdNew, stills: cmdStills, render: cmdRender, encode: cmdEncode, tier1: cmdTier1, assets: cmdAssets };

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
