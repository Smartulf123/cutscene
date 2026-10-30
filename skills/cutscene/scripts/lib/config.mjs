// The user's Cutscene settings: <CUTSCENE_HOME>/config.json (contracts §4).
// Read and write it only through these helpers. They are synchronous, so `await` works too.
//
//   import { readConfig, writeConfig } from "../../cutscene/scripts/lib/config.mjs";
//   const cfg = readConfig();                         // {} when there is no file yet
//   writeConfig({ blender: "C:\\...\\blender.exe" });   // merges, writes atomically
//   writeConfig({ voice: { default: "kokoro" } });    // nested objects merge
//   writeConfig({ blender: null });                    // null removes a setting
import { readFileSync } from "node:fs";
import { CutsceneError } from "./json.mjs";
import { cutsceneHome, homePaths } from "./paths.mjs";
import { withFileLock, writeFileAtomic } from "./atomic.mjs";

/** Path of config.json for a home folder (default: CUTSCENE_HOME or ~/.cutscene). */
export function configPath({ home, env } = {}) {
  return homePaths(home || cutsceneHome(env)).config;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * JSON merge patch (RFC 7386): objects merge key by key, `null` deletes a key, anything
 * else (including arrays) replaces. Returns a new object; inputs are not changed.
 */
export function mergePatch(target, patch) {
  if (!isPlainObject(patch)) return patch;
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (isPlainObject(v)) out[k] = mergePatch(out[k], v);
    else out[k] = v;
  }
  return out;
}

function parseConfig(text, file) {
  try {
    const value = JSON.parse(text);
    if (!isPlainObject(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new CutsceneError("CONFIG_INVALID", `Cutscene's settings file isn't valid JSON: ${file}`, {
      hint: "Fix the file by hand, or delete it to start with default settings.",
    });
  }
}

/**
 * Read the user's settings. Returns `{}` when config.json doesn't exist yet.
 * @param {{home?: string, env?: NodeJS.ProcessEnv}} [opts]
 * @returns {Record<string, any>}
 */
export function readConfig(opts = {}) {
  const file = configPath(opts);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw new CutsceneError("CONFIG_UNREADABLE", `Cutscene can't read its settings file: ${file}`, {
      hint: "Check that the file isn't locked or protected, then try again.",
    });
  }
  if (!text.trim()) return {};
  return parseConfig(text.replace(/^\uFEFF/, ""), file);
}

/**
 * Merge `patch` into the settings and save them atomically. Returns the new settings.
 * @param {Record<string, any>} patch
 * @param {{home?: string, env?: NodeJS.ProcessEnv}} [opts]
 */
export function writeConfig(patch, opts = {}) {
  if (!isPlainObject(patch)) {
    throw new CutsceneError("CONFIG_PATCH_INVALID", "Settings must be saved as an object of names and values.", {
      hint: 'Pass an object, for example writeConfig({ blender: "C:/path/to/blender.exe" }).',
    });
  }
  const file = configPath(opts);
  return withFileLock(file, () => {
    const next = mergePatch(readConfig(opts), patch);
    writeFileAtomic(file, JSON.stringify(next, null, 2) + "\n");
    return next;
  });
}
