// Built from src/skills/cutscene-voice/scripts/lib/worker.mts by `npm run build`. Edit that file, not this one.
import type { ProgressEvent, WorkerResult } from "./types.mjs";
/** Environment for every worker run: models stay inside <home>/voice, no telemetry, offline by default. */
export declare function workerEnv(home: string, { offline, base }?: {
    offline?: boolean;
    base?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv;
/**
 * Run one worker task.
 * @param task probe | download | omnivoice | voxcpm | whisper
 * @param job task fields
 * @returns the worker's result (ok: true)
 */
export declare function runWorker<T extends WorkerResult = WorkerResult>(task: string, job: object, opts?: {
    home?: string;
    offline?: boolean;
    onProgress?: (e: ProgressEvent) => void;
    timeoutMs?: number;
}): Promise<T>;
