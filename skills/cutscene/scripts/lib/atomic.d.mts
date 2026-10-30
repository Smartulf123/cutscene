// Built from src/skills/cutscene/scripts/lib/atomic.mts by `npm run build`. Edit that file, not this one.
/** Block the current thread for `ms` milliseconds (keeps the helpers synchronous). */
export declare function sleepSync(ms: number): void;
/**
 * Write `data` to `file` atomically. Creates the folder if needed.
 */
export declare function writeFileAtomic(file: string, data: string | Uint8Array): void;
/**
 * Run `fn` while holding `<file>.lock`. Waits up to `timeoutMs` for another holder; a lock
 * older than `staleMs` is treated as left behind by a crashed process and removed.
 */
export declare function withFileLock<T>(file: string, fn: () => T, { timeoutMs, staleMs }?: {
    timeoutMs?: number;
    staleMs?: number;
}): T;
