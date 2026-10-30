// Read and update beats.json. Uses the foundation's beats.mjs when it's installed next to this
// skill (byte-for-byte splicing, file locks); otherwise a minimal updater that keeps every other
// field, its order and the file's indentation (contracts §7).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FOUNDATION_LIB } from "./paths.mjs";
import type { Beat, BeatSheet } from "./types.mjs";
import { VoiceError } from "./util.mjs";

/** The foundation's beats.mjs functions this file uses. */
interface FoundationBeats {
  readBeats(file: string): BeatSheet;
  updateBeat(file: string, id: string, patch: unknown): BeatSheet;
  updateBeatSheet?(file: string, patch: unknown): BeatSheet;
}

let foundation: FoundationBeats | null | undefined;
async function loadFoundation(): Promise<FoundationBeats | null> {
  if (process.env.CUTSCENE_VOICE_NO_FOUNDATION === "1") return null; // tests: force the fallback
  if (foundation !== undefined) return foundation;
  foundation = null;
  const file = join(FOUNDATION_LIB, "beats.mjs");
  if (existsSync(file)) {
    try {
      const mod = (await import(pathToFileURL(file).href)) as Partial<FoundationBeats>;
      if (typeof mod.updateBeat === "function" && typeof mod.readBeats === "function") foundation = mod as FoundationBeats;
    } catch {
      foundation = null;
    }
  }
  return foundation;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** RFC 7386 JSON merge patch: objects merge, null removes, everything else replaces. */
export function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isObj(patch)) return patch;
  const out = isObj(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

function detectIndent(text: string): string {
  const m = /\n([ \t]+)"/.exec(text);
  return m ? m[1] : "  ";
}

function readRaw(file: string): { text: string; obj: BeatSheet } {
  if (!existsSync(file)) throw new VoiceError("BEATS_NOT_FOUND", `There's no beat sheet at ${file}.`, "Make the storyboard first: the project needs .cutscene/beats.json with the voice lines (see the cutscene skill).");
  const text = readFileSync(file, "utf8");
  try {
    return { text, obj: JSON.parse(text) as BeatSheet };
  } catch (err) {
    throw new VoiceError("BEATS_INVALID_JSON", `beats.json isn't valid JSON: ${(err as Error).message}.`, "Fix the file (or undo the last edit) and try again.");
  }
}

function writeMinimal(file: string, text: string, obj: unknown): void {
  const indent = detectIndent(text);
  const out = JSON.stringify(obj, null, indent) + (text.endsWith("\n") ? "\n" : "");
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, out, "utf8");
  renameSync(tmp, file);
}

/** An error thrown by the foundation (its errors carry a code and a hint). */
type ForeignError = { code?: unknown; message: string; hint?: string } | null | undefined;

function rethrow(err: ForeignError): never {
  if (err instanceof VoiceError) throw err;
  if (err && err.code && typeof err.code === "string") throw new VoiceError(err.code, err.message, err.hint || "");
  throw err;
}

export async function readBeats(file: string): Promise<BeatSheet> {
  const f = await loadFoundation();
  if (f) {
    try {
      return f.readBeats(file);
    } catch (err) {
      rethrow(err as ForeignError);
    }
  }
  return readRaw(file).obj;
}

/** Merge `patch` into one beat (by id). */
export async function patchBeat(file: string, id: string, patch: unknown): Promise<BeatSheet> {
  const f = await loadFoundation();
  if (f) {
    try {
      return f.updateBeat(file, id, patch);
    } catch (err) {
      rethrow(err as ForeignError);
    }
  }
  const { text, obj } = readRaw(file);
  const beat = Array.isArray(obj.beats) ? obj.beats.find((b) => b && b.id === id) : null;
  if (!beat) throw new VoiceError("BEAT_NOT_FOUND", `There's no beat "${id}" in beats.json.`, "Check the beat ids with `cutscene voice status --project <dir>`.");
  const merged = mergePatch(beat, patch) as Beat;
  obj.beats![obj.beats!.indexOf(beat)] = merged;
  writeMinimal(file, text, obj);
  return obj;
}

/** Merge `patch` into the top level of the sheet (voice uses it for `voices`). */
export async function patchSheet(file: string, patch: unknown): Promise<unknown> {
  const f = await loadFoundation();
  if (f && typeof f.updateBeatSheet === "function") {
    try {
      return f.updateBeatSheet(file, patch);
    } catch (err) {
      rethrow(err as ForeignError);
    }
  }
  const { text, obj } = readRaw(file);
  const merged = mergePatch(obj, patch);
  writeMinimal(file, text, merged);
  return merged;
}

export async function usingFoundation(): Promise<boolean> {
  return !!(await loadFoundation());
}
