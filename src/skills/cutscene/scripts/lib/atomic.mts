// Safe file writes: write to a temp file next to the target, then rename it over the target,
// so a crash never leaves a half-written file. Plus a small lock file so two Cutscene
// processes (say voice and 3d running at once) don't overwrite each other's changes.
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { CodedError } from "./json.mjs";

const sleepCell = new Int32Array(new SharedArrayBuffer(4));
/** Block the current thread for `ms` milliseconds (keeps the helpers synchronous). */
export function sleepSync(ms: number): void {
  Atomics.wait(sleepCell, 0, 0, ms);
}

/**
 * Write `data` to `file` atomically. Creates the folder if needed.
 */
export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, typeof data === "string" ? Buffer.from(data, "utf8") : data);
    try {
      fsyncSync(fd);
    } catch {
      // fsync is best effort (some file systems don't support it)
    }
  } finally {
    closeSync(fd);
  }
  // On Windows a rename can briefly fail while another process (an antivirus scan, OneDrive,
  // a reader) has the target open. Retry for a short while before giving up.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (err) {
      lastErr = err;
      if (!["EPERM", "EACCES", "EBUSY"].includes((err as NodeJS.ErrnoException).code as string)) break;
      sleepSync(25 + attempt * 5);
    }
  }
  try {
    unlinkSync(tmp);
  } catch {
    // already gone
  }
  throw lastErr;
}

/**
 * Run `fn` while holding `<file>.lock`. Waits up to `timeoutMs` for another holder; a lock
 * older than `staleMs` is treated as left behind by a crashed process and removed.
 */
export function withFileLock<T>(file: string, fn: () => T, { timeoutMs = 10_000, staleMs = 30_000 }: { timeoutMs?: number; staleMs?: number } = {}): T {
  const lock = `${file}.lock`;
  mkdirSync(dirname(lock), { recursive: true });
  const started = Date.now();
  let fd: number | undefined;
  for (;;) {
    try {
      fd = openSync(lock, "wx");
      writeSync(fd, String(process.pid));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        const age = Date.now() - statSync(lock).mtimeMs;
        if (age > staleMs) {
          rmSync(lock, { force: true });
          continue;
        }
      } catch {
        continue; // lock vanished between the two calls; try again
      }
      if (Date.now() - started > timeoutMs) {
        const e: CodedError = new Error(`Another Cutscene process is still changing ${basename(file)}.`);
        e.code = "FILE_LOCKED";
        e.hint = `Wait for it to finish and try again. If nothing else is running, delete ${lock}.`;
        throw e;
      }
      sleepSync(50);
    }
  }
  try {
    return fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
      // ignore
    }
    rmSync(lock, { force: true });
  }
}
