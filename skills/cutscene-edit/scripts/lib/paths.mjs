// Where `cutscene edit` reads and writes: safe paths, the project's .cutscene/edit folder,
// Cutscene home, and the short project memory (.cutscene/project.md).
// Cutscene (Apache-2.0).
import { existsSync, mkdirSync, statSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, relative, sep } from "node:path";
import { EditError } from "./cli.mjs";

/** Network paths (\\server\share, //server/share) are refused (contracts §10). */
export function isNetworkPath(p) {
  // Any two leading slashes count, mixed ones too (/\server\share); a local long path
  // (\\?\C:\...) is fine.
  const s = String(p).trim();
  return /^[\\/]{2}[^\\/]/.test(s) && !/^[\\/]{2}\?[\\/][A-Za-z]:/.test(s);
}

/**
 * Resolve a user-given path and refuse network paths.
 * @param {string} p
 * @param {string} what  what the path is, for the message ("the video")
 */
export function userPath(p, what = "the file") {
  if (!p) throw new EditError("MISSING_PATH", `No path was given for ${what}.`, "Pass the path as an argument.", { exitCode: 2 });
  if (isNetworkPath(p)) throw new EditError("NETWORK_PATH", `Cutscene does not read or write network paths (${p}).`, "Copy the file to a local drive first.");
  return resolve(p);
}

/** A path that must exist. */
export function existingFile(p, what = "the file") {
  const abs = userPath(p, what);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new EditError("FILE_NOT_FOUND", `Cannot find ${what}: ${abs}`, "Check the path; quote it if it has spaces.");
  return abs;
}

/** Cutscene home: CUTSCENE_HOME or ~/.cutscene (contracts §4). */
export function cutsceneHome() {
  return resolve(process.env.CUTSCENE_HOME || join(homedir(), ".cutscene"));
}

/** The nearest folder at or above `start` that has a .cutscene/ folder, or null. */
export function findProjectRoot(start) {
  let dir = resolve(start);
  try {
    if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
  } catch {
    dir = dirname(dir);
  }
  const home = cutsceneHome().toLowerCase();
  for (let i = 0; i < 40; i++) {
    const marker = join(dir, ".cutscene");
    // Cutscene's own home (~/.cutscene) is not a project.
    if (existsSync(marker) && statSync(marker).isDirectory() && resolve(marker).toLowerCase() !== home) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * The folder outputs go into: --out-dir, else <project>/.cutscene/edit for the input's project,
 * else <project>/.cutscene/edit for the current folder's project, else .cutscene/edit next to the input.
 * @param {string|undefined} outDir
 * @param {string} input
 */
export function outputDir(outDir, input) {
  const dir = outDir
    ? userPath(outDir, "the output folder")
    : (() => {
        const root = findProjectRoot(input) ?? findProjectRoot(process.cwd());
        return root ? join(root, ".cutscene", "edit") : join(dirname(resolve(input)), ".cutscene", "edit");
      })();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** "C:/x/raw-take.transcript.json" -> "raw-take" (strips our own suffixes too). */
export function stemOf(p) {
  let s = basename(p, extname(p));
  s = s.replace(/\.(transcript|silence-transcript|mistakes-transcript|cuts-transcript|rough-transcript|silence-edl|mistakes-edl|cuts-edl|rough-edl|edl|cut-candidates|highlights)$/i, "");
  s = s.replace(/\.(silenced|mistakes-cut|cut|rough|clean|reframed)$/i, "");
  s = s.replace(/[-.]?(silence-|mistakes-)?transcript$/i, "");
  return s || "source";
}

/** Refuse to write over the input. */
export function assertNotSame(output, input, what = "The output") {
  if (resolve(output).toLowerCase() === resolve(input).toLowerCase()) {
    throw new EditError("SAME_PATH", `${what} would overwrite the source file.`, "Pass a different --output path. Cutscene never edits originals in place.");
  }
}

/** Write JSON with a trailing newline. */
export function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
  return path;
}

export function readJson(path, what = "the JSON file") {
  const abs = existingFile(path, what);
  try {
    return JSON.parse(readFileSync(abs, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    throw new EditError("BAD_JSON", `${what} is not valid JSON (${abs}): ${e.message}`, "Fix the file or make it again with the Cutscene tool that writes it.");
  }
}

/** A path relative to the project (forward slashes) when inside it, else absolute. */
export function displayPath(p, root) {
  if (!root) return p;
  const r = relative(root, p);
  return r && !r.startsWith("..") && !r.includes(":") ? r.split(sep).join("/") : p;
}

/**
 * Append one line to <project>/.cutscene/project.md, the short memory of decisions and checks
 * (a pattern learned from video-use). Only when the files live in a Cutscene project.
 * @param {string} anyPathInProject
 * @param {string} line
 */
export function remember(anyPathInProject, line) {
  if (process.env.CUTSCENE_NO_MEMORY === "1") return null;
  const root = findProjectRoot(anyPathInProject);
  if (!root) return null;
  const file = join(root, ".cutscene", "project.md");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (!existsSync(file)) writeFileSync(file, "# Project memory\n\nShort notes: decisions, approvals, what was checked.\n\n");
  const text = readFileSync(file, "utf8");
  const heading = "## Edit log";
  appendFileSync(file, (text.includes(heading) ? "" : `\n${heading}\n\n`) + `- ${stamp} ${line}\n`);
  return file;
}
