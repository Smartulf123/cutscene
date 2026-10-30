// Where Cutscene keeps things: the Cutscene home (~/.cutscene), the skills folder and the
// scripts inside it. Node built-ins only.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CodedError } from "./json.mjs";

/** Cutscene's own version. Kept in step with the plugin manifests (a test checks this). */
export const CUTSCENE_VERSION = "0.1.0";

const here = dirname(fileURLToPath(import.meta.url));

/** skills/cutscene/scripts */
export const SCRIPTS_DIR = resolve(here, "..");
/** skills/cutscene */
export const SKILL_DIR = resolve(here, "..", "..");
/** skills/ (the folder that holds cutscene, cutscene-3d, cutscene-voice, ...) */
export const SKILLS_ROOT = resolve(here, "..", "..", "..");
/** Absolute path of the `cutscene` command (cli.mjs). */
export const CLI_PATH = join(SCRIPTS_DIR, "cli.mjs");
/** The engine pin file. */
export const ENGINE_JSON = join(SKILL_DIR, "engine.json");

/**
 * The Cutscene home folder: `CUTSCENE_HOME` when set, otherwise `~/.cutscene`.
 */
export function cutsceneHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CUTSCENE_HOME && env.CUTSCENE_HOME.trim();
  if (override) return resolve(override);
  return join(homedir(), ".cutscene");
}

/** Every well-known folder or file inside the Cutscene home. */
export function homePaths(home: string = cutsceneHome()) {
  return {
    home,
    config: join(home, "config.json"),
    engine: join(home, "engine"),
    media: join(home, "media"),
    voice: join(home, "voice"),
    assets: join(home, "assets"),
    logs: join(home, "logs"),
  };
}

/** Folder the pinned engine is installed into: `<home>/engine/<pin>`. */
export function engineDir(pin: string, home: string = cutsceneHome()): string {
  return join(home, "engine", pin);
}

/** The parts `cutscene <part>` dispatches to. */
export const PARTS = ["voice", "3d", "edit"];

/**
 * Entry script of a part: `skills/cutscene-<part>/scripts/<part>.mjs`, next to this skill.
 */
export function partScript(part: string, skillsRoot: string = SKILLS_ROOT): string {
  return join(skillsRoot, `cutscene-${part}`, "scripts", `${part}.mjs`);
}

/** The preview entry script (built by the preview owner). */
export function previewScript(scriptsDir: string = SCRIPTS_DIR): string {
  return join(scriptsDir, "preview.mjs");
}

/** True for Windows/UNC network paths (`\\server\share`, `//server/share`), which Cutscene refuses. */
export function isNetworkPath(p: unknown): boolean {
  if (typeof p !== "string") return false;
  // Any two leading slashes count, mixed ones too: Windows reads /\server\share as a share.
  return /^[\\/]{2}[^\\/]/.test(p.trim());
}

/**
 * Resolve a user-given path against a base folder and refuse network paths.
 * @returns absolute path
 */
export function resolveUserPath(p: string, base: string = process.cwd()): string {
  if (isNetworkPath(p)) {
    const err: CodedError = new Error(`Cutscene doesn't work with network paths (${p}).`);
    err.code = "NETWORK_PATH";
    err.hint = "Copy the files to a folder on this computer and use that path instead.";
    throw err;
  }
  return isAbsolute(p) ? resolve(p) : resolve(base, p);
}

/** True when `child` is `parent` or inside it. */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** True when a file or folder exists. */
export function exists(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}
