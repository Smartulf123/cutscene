// Run child processes: stream or capture output, kill the whole tree on timeout (contracts §10).
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { delimiter, join } from "node:path";
import { existsSync } from "node:fs";
import type { Readable, Writable } from "node:stream";

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs?: number;
  onStderrLine?: (line: string) => void;
  onStdoutLine?: (line: string) => void;
  input?: string;
}

/** code is -1 when the program couldn't start or failed, -2 after a timeout. */
export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: unknown;
  timedOut?: boolean;
}

export function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Run a command. Resolves {code, stdout, stderr}; never rejects for a non-zero exit.
 */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    let child: ChildProcessByStdio<Writable, Readable, Readable>;
    try {
      child = spawn(cmd, args, {
        env: opts.env || process.env,
        cwd: opts.cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
    } catch (err) {
      resolvePromise({ code: -1, stdout: "", stderr: String((err as Error).message), error: err });
      return;
    }
    let stdout = "";
    let stderr = "";
    const lineSplitter = (cb: (line: string) => void) => {
      let buf = "";
      return (chunk: string) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          cb(buf.slice(0, i).replace(/\r$/, ""));
          buf = buf.slice(i + 1);
        }
      };
    };
    const outLines = opts.onStdoutLine ? lineSplitter(opts.onStdoutLine) : null;
    const errLines = opts.onStderrLine ? lineSplitter(opts.onStderrLine) : null;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      stdout += d;
      outLines?.(d);
    });
    child.stderr.on("data", (d: string) => {
      stderr += d;
      if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000);
      errLines?.(d);
    });
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, opts.timeoutMs);
    }
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ code: -1, stdout, stderr: stderr + String(err.message), error: err });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ code: timedOut ? -2 : code, stdout, stderr, timedOut });
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

/** First match of a program on PATH (with Windows extensions), or null. */
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const exts = process.platform === "win32" ? (env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (env.PATH || env.Path || "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, name + (name.toLowerCase().endsWith(ext.toLowerCase()) ? "" : ext));
      if (existsSync(p)) return p;
    }
  }
  return null;
}
