// Preview state files (<CUTSCENE_HOME>/preview/<port>.json), liveness checks and opening the
// browser. Node built-ins only.
import { readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { cutsceneHome } from "../lib/paths.mjs";
import { writeFileAtomic } from "../lib/atomic.mjs";

export const DEFAULT_PORT = 3002;

/** The project a preview shows. */
export interface PreviewProject {
  dir: string;
  name: string;
}

/** A preview state file, <CUTSCENE_HOME>/preview/<port>.json. */
export interface PreviewState {
  version: number;
  port: number;
  url: string;
  pid: number;
  instance: string;
  mode: "foreground" | "background";
  project: PreviewProject;
  ready: boolean;
  startedAt: string;
  log: string;
  enginePid?: number;
  engineHost?: string;
  enginePort?: number;
}

/** A front door's health reply. */
export interface PreviewHealth {
  ok?: boolean;
  app?: string;
  ready?: boolean;
  pid?: number;
  instance?: string;
  [key: string]: unknown;
}

/** Folder that holds one state file per running preview. */
export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(cutsceneHome(env), "preview");
}

export function statePath(port: number, env: NodeJS.ProcessEnv = process.env): string {
  return join(stateDir(env), `${port}.json`);
}

export function logPathFor(port: number, env: NodeJS.ProcessEnv = process.env): string {
  return join(stateDir(env), `${port}.log`);
}

export function writeState(state: PreviewState, env: NodeJS.ProcessEnv = process.env): void {
  mkdirSync(stateDir(env), { recursive: true });
  writeFileAtomic(statePath(state.port, env), JSON.stringify(state, null, 2) + "\n");
}

export function readState(port: number, env: NodeJS.ProcessEnv = process.env): PreviewState | null {
  try {
    const s: PreviewState | null = JSON.parse(readFileSync(statePath(port, env), "utf8"));
    return s && s.version === 1 && Number.isInteger(s.port) ? s : null;
  } catch {
    return null;
  }
}

/** Remove a state file, but only if it still belongs to `instance` (when given). */
export function removeState(port: number, instance?: string, env: NodeJS.ProcessEnv = process.env): void {
  const s = readState(port, env);
  if (instance && s && s.instance !== instance) return;
  rmSync(statePath(port, env), { force: true });
}

export function listStates(env: NodeJS.ProcessEnv = process.env): PreviewState[] {
  let names: string[] = [];
  try {
    names = readdirSync(stateDir(env));
  } catch {
    return [];
  }
  return names
    .map((n) => /^(\d+)\.json$/.exec(n))
    .filter(Boolean)
    .map((m) => readState(Number(m![1]), env))
    .filter(Boolean)
    .sort((a, b) => a!.port - b!.port) as PreviewState[];
}

/** True while a process with this id exists. */
export function pidAlive(pid: number | undefined): boolean {
  if (!Number.isInteger(pid) || pid! <= 0) return false;
  try {
    process.kill(pid!, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Ask a front door for its health. Resolves the parsed reply or null. */
export function fetchHealth(port: number, timeoutMs: number = 1500): Promise<PreviewHealth | null> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/__cutscene/health", headers: { host: `127.0.0.1:${port}` }, timeout: timeoutMs, agent: false },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          if (body.length < 16 * 1024) body += c;
        });
        res.on("end", () => {
          try {
            const j: PreviewHealth | null = JSON.parse(body);
            resolve(res.statusCode === 200 && j && j.app === "cutscene-preview" ? j : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Check a state file against reality. Returns "running" when its front door answers with the
 * same instance id, "starting" when the process is alive but not answering yet, else "gone".
 */
export async function liveness(state: PreviewState | null | undefined): Promise<"running" | "starting" | "gone"> {
  if (!state) return "gone";
  const h = await fetchHealth(state.port);
  if (h && h.instance === state.instance) return h.ready ? "running" : "starting";
  if (pidAlive(state.pid) && !h) return "starting";
  return "gone";
}

/** Same folder? Case-insensitive on Windows and macOS. */
export function sameDir(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\\/g, "/");
  return process.platform === "linux" ? norm(a) === norm(b) : norm(a).toLowerCase() === norm(b).toLowerCase();
}

/** The address users open. The project name goes in the hash, URL-encoded. */
export function previewUrl(port: number, projectName?: string): string {
  const base = `http://127.0.0.1:${port}/`;
  return projectName ? `${base}#project/${encodeURIComponent(projectName)}` : base;
}

/**
 * A URL that's safe to hand to the operating system's opener: built only from a validated port
 * and a project name of plain characters. Anything else opens the Studio's front page.
 */
export function safeOpenUrl(port: number, projectName?: string): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("bad port");
  if (typeof projectName === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(projectName)) {
    return `http://127.0.0.1:${port}/#project/${projectName}`;
  }
  return `http://127.0.0.1:${port}/`;
}

/** The command that opens a URL in the default browser on each platform. */
export function openCommand(url: string, platform: NodeJS.Platform = process.platform): { cmd: string; args: string[]; verbatim: boolean } {
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/(#project\/[A-Za-z0-9._-]{1,128})?$/.test(url)) {
    throw new Error("Refusing to open an unexpected URL.");
  }
  if (platform === "win32") {
    return { cmd: "cmd.exe", args: ["/d", "/s", "/c", `start "" "${url}"`], verbatim: true };
  }
  if (platform === "darwin") return { cmd: "open", args: [url], verbatim: false };
  return { cmd: "xdg-open", args: [url], verbatim: false };
}

/** Open the default browser. Never throws; returns false when it couldn't. */
export function openBrowser(url: string): boolean {
  try {
    const { cmd, args, verbatim } = openCommand(url);
    // detached: a browser started from here must outlive this process (on Windows, Node's
    // kill-on-close job object would otherwise take it down when we exit).
    const child = spawn(cmd, args, {
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
      detached: true,
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
