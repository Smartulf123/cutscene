// Find the user's Blender and run it headless, one fresh process per job.
// Node built-ins only. The foundation's doctor imports findBlender() from here.
//
//   import { findBlender, runBlender } from "../../cutscene-3d/scripts/lib/blender.mjs";
//   const b = await findBlender();          // {path, version, source} or null
//   const r = await runBlender(script, ["--spec", file], { timeout: 600_000 });
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIN_BLENDER = [4, 2, 0];
const here = dirname(fileURLToPath(import.meta.url));

/** "Blender 5.2.3 LTS ..." -> {major, minor, patch, text: "5.2.3", lts}; null when not Blender. */
export function parseBlenderVersion(stdout) {
  const m = /Blender\s+(\d+)\.(\d+)(?:\.(\d+))?(?:\s+(LTS|Alpha|Beta|Release Candidate))?/i.exec(String(stdout || ""));
  if (!m) return null;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
  return { major, minor, patch, text: `${major}.${minor}.${patch}`, lts: /lts/i.test(m[4] || "") };
}

/** Compare [a,b,c] version arrays or "x.y.z" strings. */
export function compareVersions(a, b) {
  const pa = Array.isArray(a) ? a : String(a).split(".").map(Number);
  const pb = Array.isArray(b) ? b : String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function versionOk(v) {
  return !!v && compareVersions([v.major, v.minor, v.patch], MIN_BLENDER) >= 0;
}

/** Version number in a folder name like "Blender 5.2" or "blender-4.2.3-windows-x64". */
export function folderVersion(name) {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : [0, 0, 0];
}

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function newestFirst(names) {
  return [...names].sort((a, b) => compareVersions(folderVersion(b), folderVersion(a)));
}

/** Steam library folders from libraryfolders.vdf ("path" entries). */
export function steamLibraries(vdfText) {
  const out = [];
  const re = /"path"\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(String(vdfText || "")))) out.push(m[1].replace(/\\\\/g, "\\"));
  return out;
}

/**
 * Every place Blender could be, in priority order. Pure apart from directory listings, so tests
 * can pass a fake `fs` ({list(dir), read(file), exists(p)}).
 * @returns {{path: string, source: string}[]}
 */
export function blenderCandidates({ env = process.env, platform = process.platform, home = homedir(), config = {}, fs } = {}) {
  const list = fs?.list ?? safeList;
  const read = fs?.read ?? ((p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } });
  const exe = platform === "win32" ? "blender.exe" : "blender";
  const pathJoin = platform === "win32" ? (...p) => p.join("\\").replace(/\\+/g, "\\") : (...p) => p.join("/").replace(/\/+/g, "/");
  const out = [];
  const add = (path, source) => { if (path && !out.some((c) => c.path.toLowerCase() === path.toLowerCase())) out.push({ path, source }); };

  if (env.CUTSCENE_BLENDER) add(env.CUTSCENE_BLENDER.trim(), "CUTSCENE_BLENDER");
  if (config && typeof config.blender === "string" && config.blender.trim()) add(config.blender.trim(), "config.json");

  const sep = platform === "win32" ? ";" : ":";
  for (const dir of String(env.PATH || env.Path || "").split(sep).filter(Boolean)) add(pathJoin(dir, exe), "PATH");

  if (platform === "win32") {
    const roots = [env.ProgramFiles || "C:\\Program Files", env["ProgramFiles(x86)"], env.ProgramW6432].filter(Boolean);
    for (const root of roots) {
      const bf = pathJoin(root, "Blender Foundation");
      for (const name of newestFirst(list(bf).filter((n) => /^blender/i.test(n)))) add(pathJoin(bf, name, exe), "Program Files");
    }
    // Steam (default library + extra libraries)
    const steamRoots = [pathJoin(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"), pathJoin(env.ProgramFiles || "C:\\Program Files", "Steam")];
    for (const sr of steamRoots) {
      add(pathJoin(sr, "steamapps", "common", "Blender", exe), "Steam");
      for (const lib of steamLibraries(read(pathJoin(sr, "steamapps", "libraryfolders.vdf")))) add(pathJoin(lib, "steamapps", "common", "Blender", exe), "Steam");
    }
    // Microsoft Store: the app alias, then the (often unreadable) WindowsApps folder
    if (env.LOCALAPPDATA) add(pathJoin(env.LOCALAPPDATA, "Microsoft", "WindowsApps", exe), "Microsoft Store");
    const wa = pathJoin(env.ProgramFiles || "C:\\Program Files", "WindowsApps");
    for (const name of newestFirst(list(wa).filter((n) => /^BlenderFoundation\.Blender/i.test(n)))) add(pathJoin(wa, name, "Blender", exe), "Microsoft Store");
    // Portable zips unpacked in Downloads / Desktop (one level, plus OneDrive Desktop)
    for (const base of [pathJoin(home, "Downloads"), pathJoin(home, "Desktop"), pathJoin(home, "OneDrive", "Desktop")]) {
      for (const name of newestFirst(list(base).filter((n) => /^blender[-_ ]?\d/i.test(n)))) {
        add(pathJoin(base, name, exe), "portable");
        add(pathJoin(base, name, name, exe), "portable");
      }
    }
  } else if (platform === "darwin") {
    for (const base of ["/Applications", pathJoin(home, "Applications")]) {
      for (const name of newestFirst(list(base).filter((n) => /^blender.*\.app$/i.test(n)))) add(pathJoin(base, name, "Contents", "MacOS", "Blender"), "Applications");
    }
    add(pathJoin(home, "Library", "Application Support", "Steam", "steamapps", "common", "Blender", "Blender.app", "Contents", "MacOS", "Blender"), "Steam");
  } else {
    for (const p of ["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender", "/var/lib/flatpak/exports/bin/org.blender.Blender", pathJoin(home, ".local", "share", "flatpak", "exports", "bin", "org.blender.Blender")]) add(p, "system");
    for (const base of ["/opt", pathJoin(home, "Downloads"), pathJoin(home, "Desktop"), pathJoin(home, "Applications")]) {
      for (const name of newestFirst(list(base).filter((n) => /^blender/i.test(n)))) add(pathJoin(base, name, "blender"), "portable");
    }
    add(pathJoin(home, ".steam", "steam", "steamapps", "common", "Blender", "blender"), "Steam");
  }
  return out;
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Run `<blender> --version` (short timeout, hidden window). */
export function probeVersion(path, timeoutMs = 30_000) {
  const r = spawnSync(path, ["--version"], { encoding: "utf8", timeout: timeoutMs, windowsHide: true, killSignal: "SIGKILL" });
  if (r.error || r.status !== 0) return null;
  return parseBlenderVersion(r.stdout);
}

async function loadConfig() {
  const cfgModule = resolve(here, "..", "..", "..", "cutscene", "scripts", "lib", "config.mjs");
  if (existsSync(cfgModule)) {
    try {
      const mod = await import(pathToFileURL(cfgModule).href);
      return mod.readConfig() || {};
    } catch {
      /* fall through to a direct read */
    }
  }
  try {
    const home = process.env.CUTSCENE_HOME || join(homedir(), ".cutscene");
    return JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Find a usable Blender (4.2 or newer). Returns {path, version, source} or null.
 * With {detailed:true} returns {found, skipped:[{path, source, reason}]}.
 */
export async function findBlender({ env = process.env, platform = process.platform, config, detailed = false, probe = probeVersion, exists = isFile } = {}) {
  const cfg = config ?? (await loadConfig());
  const skipped = [];
  let found = null;
  for (const c of blenderCandidates({ env, platform, config: cfg })) {
    if (!exists(c.path)) {
      if (c.source === "CUTSCENE_BLENDER" || c.source === "config.json") skipped.push({ ...c, reason: "file not found" });
      continue;
    }
    const v = probe(c.path);
    if (!v) {
      skipped.push({ ...c, reason: "did not report a Blender version" });
      continue;
    }
    if (!versionOk(v)) {
      skipped.push({ ...c, version: v.text, reason: `Blender ${v.text} is older than ${MIN_BLENDER.join(".")}` });
      continue;
    }
    found = { path: c.path, version: v.text, source: c.source, lts: v.lts };
    break;
  }
  return detailed ? { found, skipped } : found;
}

/** Kill a process and its children. Windows: taskkill /T /F (contracts §10). */
export function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

export const MARK = "@@CS3D@@";

/** Pull the machine-readable lines Blender printed. */
export function parseEvents(text) {
  const events = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const i = line.indexOf(MARK);
    if (i < 0) continue;
    try {
      events.push(JSON.parse(line.slice(i + MARK.length)));
    } catch {
      /* ignore partial lines */
    }
  }
  return events;
}

/** Arguments for one headless job. */
export function blenderArgs(script, args = []) {
  return ["-b", "--factory-startup", "--python-exit-code", "1", "-noaudio", "-P", script, "--", ...args];
}

/**
 * Run a Python script in a fresh, hidden, headless Blender. Never detached; the whole process tree
 * is killed on timeout. Resolves {code, ok, timedOut, ms, events, stdout, stderr}.
 */
export function runBlender(script, args = [], { blender, timeout = 30 * 60_000, onEvent, cwd, env } = {}) {
  return (async () => {
    const exe = blender || (await findBlender())?.path;
    if (!exe) {
      const err = new Error("Cutscene couldn't find Blender 4.2 or newer on this computer.");
      err.code = "BLENDER_MISSING";
      err.hint = "Install Blender from blender.org (or run `cutscene setup`), or set CUTSCENE_BLENDER to blender.exe.";
      throw err;
    }
    const t0 = Date.now();
    return await new Promise((resolvePromise, reject) => {
      const child = spawn(exe, blenderArgs(script, args), {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let buf = "";
      let timedOut = false;
      const events = [];
      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, timeout);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (d) => {
        stdout += d;
        buf += d;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          for (const ev of parseEvents(line)) {
            events.push(ev);
            if (onEvent) onEvent(ev);
          }
        }
      });
      child.stderr.on("data", (d) => {
        stderr += d;
        if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        for (const ev of parseEvents(buf)) events.push(ev);
        if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
        resolvePromise({ code, ok: code === 0 && !timedOut, timedOut, ms: Date.now() - t0, events, stdout, stderr, blender: exe });
      });
    });
  })();
}

/** Absolute path of the Blender-side entry script. */
export const RUN_PY = resolve(here, "..", "blender", "run.py");
