#!/usr/bin/env node
// Cutscene local sound engine. Written for Cutscene (Apache-2.0).
//
// The promo workflows' audio adapters (cutscene-promo/workflows/*/scripts/audio.mjs)
// call this with a neutral request and read back a neutral meta file. Upstream
// that engine fetched voices and music from a cloud service; Cutscene's version
// runs on this computer only:
//
//   tts  Kokoro through `cutscene tts` (default), or `cutscene voice speak`
//        when the request asks for provider "cutscene-voice". Word timings come
//        from `cutscene transcribe` (local Whisper / Parakeet).
//   bgm  only the user's own file (request.bgm.file). There is no music catalog:
//        any other mode is skipped and reported, never fetched.
//   sfx  the sound-effect library: keys and timings in ../sound/sfx/manifest.json; the
//        sound files themselves come from the installed engine (they are Pixabay files,
//        which may not be redistributed as a standalone library, so Cutscene does not
//        ship them). Each file is checked against ../sound/sfx/sha256.json, then copied
//        into the project's assets/sfx/.
//
// usage:
//   node sound-engine.mjs --request audio_request.json --hyperframes <project> --out meta.json
//        [--only tts,bgm,sfx] [--provider auto|kokoro|cutscene-voice] [--voice <id>]
//        [--speed 1.0] [--lang en] [--bgm-mode none|file]
//
// request: { provider?, voice?, lang?, speed?, lines: [{ id, text, sfx?: [names] }],
//            bgm?: { mode?: "none"|"file"|..., file?: "assets/music.mp3", volume? } }
// meta:    { tts_provider, voice_id, bgm, bgm_pending: false, voices: [{ id, path,
//            duration_s, words: [{ id, text, start, end }] }], sfx: [{ id, name, file,
//            source, offset_s, duration_s, volume }], total_duration_s, anomalies }

import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, openSync, readSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Env = Record<string, string | undefined>;

/** One entry of ../sound/sfx/manifest.json. */
export interface SfxEntry {
  file: string;
  duration?: number;
  description?: string;
}
export type SfxLibrary = Record<string, SfxEntry>;

/** A sound-effect cue from a request line. */
export interface SfxCue {
  id: string | number;
  name: string;
  offset_s?: number;
}

/** A resolved sound effect in the meta file. */
export interface SfxClip {
  id: string;
  name: string;
  file: string;
  source: string;
  offset_s: number;
  duration_s: number;
  volume: number;
}

export interface BgmRequest {
  mode?: string;
  file?: string;
  volume?: number;
  query?: string;
  prompt?: string;
}

export interface Bgm {
  path: string;
  volume: number;
  duration_s: number | null;
  source: string;
}

export interface VoiceWord {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface VoiceClip {
  id: string;
  path: string;
  duration_s: number;
  words: VoiceWord[];
}

/** The request the audio adapters write (see the header). */
export interface AudioRequest {
  provider?: string;
  voice?: string;
  lang?: string;
  speed?: number;
  lines?: { id: string | number; text?: string; sfx?: unknown[] }[];
  bgm?: BgmRequest;
}

/** The meta file this writes (see the header). */
export interface AudioMeta {
  engine: string;
  tts_provider: string | null;
  voice_id: string | null;
  bgm: Bgm | null;
  bgm_pending: boolean;
  voices: VoiceClip[];
  sfx: SfxClip[];
  total_duration_s: number;
  anomalies: string[];
}

/** A word as `cutscene transcribe` writes it. */
interface TranscriptWord {
  id?: string;
  text?: string;
  word?: string;
  start?: number | string;
  end?: number | string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const SFX_DIR = resolve(HERE, "..", "sound", "sfx");
/** Where the pinned engine package keeps the same sound files (installed by `cutscene setup`). */
export const ENGINE_SFX_SUBDIR = ["node_modules", "hyperframes", "dist", "skills", "media-use", "audio", "assets", "sfx"];
export const SFX_VOLUME = 0.35;
export const BGM_VOLUME = 0.25;
export const DEFAULT_VOICE = "am_michael";

export function cutsceneCli(): string | null {
  const candidates = [process.env.CUTSCENE_CLI, resolve(HERE, "..", "..", "cutscene", "scripts", "cli.mjs")].filter(Boolean) as string[];
  return candidates.find((c) => existsSync(c)) ?? null;
}

const flag = <T,>(argv: string[], name: string, def: T): string | T => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function slug(s: unknown): string {
  return String(s)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Duration of a PCM WAV file from its header, or null. */
export function wavDuration(path: string): number | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const head = Buffer.alloc(4096);
    const n = readSync(fd, head, 0, head.length, 0);
    if (head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WAVE") return null;
    let off = 12;
    let byteRate: number | null = null;
    while (off + 8 <= n) {
      const id = head.toString("ascii", off, off + 4);
      const size = head.readUInt32LE(off + 4);
      if (id === "fmt ") byteRate = head.readUInt32LE(off + 16);
      if (id === "data" && byteRate) return r3(size / byteRate);
      off += 8 + size + (size % 2);
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function ffprobeDuration(path: string): number | null {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" });
  const d = Number(String(r.stdout ?? "").trim());
  return r.status === 0 && Number.isFinite(d) && d > 0 ? r3(d) : null;
}

export function mediaDuration(path: string): number | null {
  return extname(path).toLowerCase() === ".wav" ? (wavDuration(path) ?? ffprobeDuration(path)) : ffprobeDuration(path);
}

/** The engine version Cutscene pins (skills/cutscene/engine.json), or null. */
export function enginePin(env: Env = process.env): string | null {
  if (env.CUTSCENE_ENGINE_VERSION) return env.CUTSCENE_ENGINE_VERSION;
  try {
    return (JSON.parse(readFileSync(resolve(HERE, "..", "..", "cutscene", "engine.json"), "utf8")) as { hyperframes?: string }).hyperframes ?? null;
  } catch {
    return null;
  }
}

/** The installed engine's sound-effect folder, or null when the engine isn't installed. */
export function engineSfxDir(env: Env = process.env): string | null {
  const pin = enginePin(env);
  if (!pin) return null;
  const home = env.CUTSCENE_HOME && env.CUTSCENE_HOME.trim() ? resolve(env.CUTSCENE_HOME.trim()) : join(homedir(), ".cutscene");
  const dir = join(home, "engine", pin, ...ENGINE_SFX_SUBDIR);
  return existsSync(dir) ? dir : null;
}

/** The pinned SHA-256 of every sound file: { "whoosh.mp3": "<sha256>" }. */
export function loadSfxHashes(dir: string = SFX_DIR): Record<string, string> {
  try {
    return (JSON.parse(readFileSync(join(dir, "sha256.json"), "utf8")) as { files?: Record<string, string> }).files ?? {};
  } catch {
    return {};
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Load the SFX manifest: { key: { file, duration, description } }. */
export function loadSfxLibrary(dir: string = SFX_DIR): SfxLibrary {
  try {
    return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as SfxLibrary;
  } catch {
    return {};
  }
}

/** Match a cue name to a library key by key, file basename, or slug. */
export function matchSfx(name: unknown, library: SfxLibrary): string | null {
  const n = String(name).trim().toLowerCase();
  if (library[n]) return n;
  const s = slug(n);
  for (const [key, entry] of Object.entries(library)) {
    if (key === s || slug(entry.file) === s || entry.file.toLowerCase() === n) return key;
  }
  // "ui click" -> "click", "big whoosh" -> "whoosh": last word that is a key
  const words = s.split("-").reverse();
  for (const w of words) if (library[w]) return w;
  return null;
}

/** A project-relative path that does not overwrite a different existing file. */
function freePath(projectDir: string, rel: string, sourceFile: string): { rel: string; existed: boolean } {
  let candidate = rel;
  let i = 2;
  while (existsSync(join(projectDir, candidate))) {
    const same = sourceFile && readFileSync(join(projectDir, candidate)).equals(readFileSync(sourceFile));
    if (same) return { rel: candidate, existed: true };
    const ext = extname(rel);
    candidate = `${rel.slice(0, -ext.length)}-${i++}${ext}`;
  }
  return { rel: candidate, existed: false };
}

export interface SfxOptions {
  library?: SfxLibrary;
  dir?: string | null;
  hashes?: Record<string, string>;
}

export function resolveSfxCues(cues: SfxCue[], projectDir: string, { library = loadSfxLibrary(), dir = engineSfxDir(), hashes = loadSfxHashes() }: SfxOptions = {}): { sfx: SfxClip[]; anomalies: string[] } {
  const sfx: SfxClip[] = [];
  const anomalies: string[] = [];
  const checked = new Map<string, boolean>();
  const copied = new Map<string, string>();
  const seen = new Set<string>();
  for (const cue of cues) {
    const key = matchSfx(cue.name, library);
    if (!key) {
      anomalies.push(`sfx "${cue.name}" (line ${cue.id}): no match in the sound library, skipped`);
      continue;
    }
    const dedupe = `${cue.id}::${key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const entry = library[key];
    let rel = copied.get(key);
    if (!rel) {
      if (!dir) {
        anomalies.push(`sfx "${key}" (line ${cue.id}): the sound files come with the Cutscene engine, which isn't installed yet. Run "cutscene setup" (it asks first), or put your own ${entry.file} in assets/sfx/.`);
        continue;
      }
      const src = join(dir, entry.file);
      if (!checked.has(src)) checked.set(src, existsSync(src) && Boolean(hashes[entry.file]) && sha256File(src) === hashes[entry.file]);
      if (!checked.get(src)) {
        anomalies.push(`sfx "${key}" (line ${cue.id}): ${entry.file} is missing from the engine or didn't match its pinned checksum, skipped. Reinstall the engine with "cutscene setup --yes".`);
        continue;
      }
      const target = freePath(projectDir, `assets/sfx/${entry.file}`, src);
      if (!target.existed) {
        mkdirSync(dirname(join(projectDir, target.rel)), { recursive: true });
        copyFileSync(src, join(projectDir, target.rel));
      }
      if (target.rel !== `assets/sfx/${entry.file}`) anomalies.push(`sfx "${key}": assets/sfx/${entry.file} already held another file, used ${target.rel}`);
      rel = target.rel;
      copied.set(key, rel);
    }
    sfx.push({ id: String(cue.id), name: key, file: rel, source: "local", offset_s: Number(cue.offset_s ?? 0), duration_s: entry.duration ?? 1, volume: SFX_VOLUME });
  }
  return { sfx, anomalies };
}

export function resolveBgm(bgmReq: BgmRequest | null | undefined, projectDir: string): { bgm: Bgm | null; anomalies: string[] } {
  const anomalies: string[] = [];
  const mode = bgmReq?.mode ?? (bgmReq?.file ? "file" : "none");
  if (mode === "none" || !bgmReq) return { bgm: null, anomalies };
  if (bgmReq.file) {
    const abs = isAbsolute(bgmReq.file) ? bgmReq.file : join(projectDir, bgmReq.file);
    if (!existsSync(abs)) {
      anomalies.push(`bgm: ${bgmReq.file} does not exist, no music added`);
      return { bgm: null, anomalies };
    }
    const rel = relative(projectDir, abs).split("\\").join("/");
    if (rel.startsWith("..")) {
      anomalies.push(`bgm: ${bgmReq.file} is outside the project; copy it into assets/ first`);
      return { bgm: null, anomalies };
    }
    return { bgm: { path: rel, volume: Number(bgmReq.volume ?? BGM_VOLUME), duration_s: mediaDuration(abs), source: "host" }, anomalies };
  }
  anomalies.push(
    `bgm: Cutscene has no music catalog, so "${bgmReq.query ?? bgmReq.prompt ?? "the requested mood"}" was skipped. Ask the user for a music file, put it in assets/, and list it as host bgm.`,
  );
  return { bgm: null, anomalies };
}

function run(cli: string, args: string[], opts: Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

function transcribeWords(cli: string, wavAbs: string, lang: string): VoiceWord[] | null {
  const td = mkdtempSync(join(tmpdir(), "cutscene-words-"));
  try {
    const args = ["transcribe", wavAbs, "--dir", td, "--json"];
    if (lang && lang !== "en") args.push("--language", lang);
    const r = run(cli, args);
    const file = join(td, "transcript.json");
    if (r.status !== 0 || !existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as TranscriptWord[] | { words?: TranscriptWord[] } | null;
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.words) ? parsed.words : [];
    return arr
      .map((w, i) => ({ id: w.id ?? `w${i}`, text: String(w.text ?? w.word ?? "").trim(), start: Number(w.start), end: Number(w.end) }))
      .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end));
  } catch {
    return null;
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

interface LineToSpeak {
  provider: string;
  text: string;
  voice: string | null;
  speed: number;
  lang: string;
  wavAbs: string;
}

function synthesize(cli: string, { provider, text, voice, speed, lang, wavAbs }: LineToSpeak): { ok: true } | { ok: false; error: string } {
  const td = mkdtempSync(join(tmpdir(), "cutscene-line-"));
  try {
    const txt = join(td, "line.txt");
    writeFileSync(txt, text);
    mkdirSync(dirname(wavAbs), { recursive: true });
    let args: string[];
    if (provider === "cutscene-voice") {
      args = ["voice", "speak", "--text-file", txt, "--out", wavAbs, "--json"];
      if (voice) args.push("--voice", voice);
    } else {
      // kokoro always has a voice: main() falls back to DEFAULT_VOICE
      args = ["tts", txt, "--output", wavAbs, "--voice", voice as string, "--speed", String(speed), "--json"];
      if (lang && lang !== "en") args.push("--lang", lang);
    }
    const r = run(cli, args);
    if (r.status === 0 && existsSync(wavAbs)) return { ok: true };
    const why = (r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" ").slice(0, 300);
    return { ok: false, error: why || `exit ${r.status}` };
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const requestPath = resolve(flag(argv, "request", "audio_request.json"));
  const projectDir = resolve(flag(argv, "hyperframes", flag(argv, "project", ".")));
  const outPath = resolve(flag(argv, "out", join(projectDir, "audio_engine_meta.json")));
  const only = new Set(String(flag(argv, "only", "tts,bgm,sfx")).split(",").map((s) => s.trim()).filter(Boolean));
  if (!existsSync(requestPath)) {
    console.error(`sound engine: ${requestPath} not found`);
    return 1;
  }
  let request: AudioRequest;
  try {
    request = JSON.parse(readFileSync(requestPath, "utf8")) as AudioRequest;
  } catch (e) {
    console.error(`sound engine: ${requestPath} is not valid JSON (${(e as Error).message})`);
    return 1;
  }
  let prev: Partial<AudioMeta> = {};
  try {
    prev = JSON.parse(readFileSync(outPath, "utf8")) as Partial<AudioMeta>;
  } catch {
    prev = {};
  }
  const lines = Array.isArray(request.lines) ? request.lines : [];
  const lang = flag(argv, "lang", request.lang ?? "en");
  const speed = Number(flag(argv, "speed", request.speed ?? 1));
  let provider = flag(argv, "provider", request.provider ?? "auto");
  if (provider === "auto" || provider === "kokoro" || !provider) provider = "kokoro";
  if (!["kokoro", "cutscene-voice"].includes(provider)) {
    console.error(`sound engine: provider "${provider}" is not available in Cutscene. Use kokoro (default) or cutscene-voice.`);
    return 1;
  }
  const voice = flag(argv, "voice", request.voice ?? (provider === "kokoro" ? DEFAULT_VOICE : null));
  const anomalies: string[] = [];

  let voices = prev.voices ?? [];
  const needsCli = only.has("tts") && lines.some((l) => String(l.text ?? "").trim());
  const cli = cutsceneCli();
  if (needsCli && !cli) {
    console.error("sound engine: Cutscene's CLI was not found (../cutscene/scripts/cli.mjs). Install the whole skill pack or set CUTSCENE_CLI.");
    return 1;
  }
  if (only.has("tts")) {
    voices = [];
    for (const line of lines) {
      const id = String(line.id);
      const text = String(line.text ?? "").trim();
      if (!text) continue;
      const rel = `assets/voice/${slug(id) || id}.wav`;
      const abs = join(projectDir, rel);
      // needsCli is true here (this line has text), so cli was found above
      const res = synthesize(cli!, { provider, text, voice, speed, lang, wavAbs: abs });
      if (!res.ok) {
        anomalies.push(`line ${id}: voice failed (${res.error}), omitted`);
        continue;
      }
      const duration = mediaDuration(abs);
      if (!duration) {
        anomalies.push(`line ${id}: could not read the voice file's duration, omitted`);
        continue;
      }
      const words = transcribeWords(cli!, abs, lang);
      if (!words) anomalies.push(`line ${id}: no word timings (local transcription failed); captions for this line need cutscene transcribe`);
      voices.push({ id, path: rel, duration_s: duration, words: words ?? [] });
      console.error(`  voice ${id}: ${rel} (${duration}s, ${words?.length ?? 0} words)`);
    }
  }

  let bgm = prev.bgm ?? null;
  if (only.has("bgm")) {
    const mode = flag(argv, "bgm-mode", null);
    const req = mode ? { ...(request.bgm ?? {}), mode } : request.bgm;
    const res = resolveBgm(req, projectDir);
    bgm = res.bgm;
    anomalies.push(...res.anomalies);
  }

  let sfx = prev.sfx ?? [];
  if (only.has("sfx")) {
    const cues = lines.flatMap((l) => (Array.isArray(l.sfx) ? l.sfx : []).map((name) => ({ id: String(l.id), name: String(name).trim() })).filter((c) => c.name));
    const res = resolveSfxCues(cues, projectDir);
    sfx = res.sfx;
    anomalies.push(...res.anomalies);
  }

  const meta: AudioMeta = {
    engine: "cutscene-local",
    tts_provider: only.has("tts") ? provider : (prev.tts_provider ?? null),
    voice_id: only.has("tts") ? voice : (prev.voice_id ?? null),
    bgm,
    bgm_pending: false,
    voices,
    sfx,
    total_duration_s: r3(voices.reduce((a, v) => a + (v.duration_s || 0), 0)),
    anomalies,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(meta, null, 2) + "\n");
  console.log(`sound engine -> ${outPath}`);
  console.log(`  ran: ${[...only].join(",")}  voices: ${voices.length}  bgm: ${bgm ? bgm.path : "none"}  sfx: ${sfx.length}`);
  if (anomalies.length) {
    console.log("notes:");
    for (const a of anomalies) console.log(`  - ${a}`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
