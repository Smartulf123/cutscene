import type { RawTranscript } from "./transcript.mjs";
/** The JSON line the engine's `transcribe --json` prints last. */
export type EngineInfo = {
    ok?: boolean;
    transcriptPath?: string;
    error?: unknown;
    reason?: string;
    detectedLanguage?: string;
    engine?: string;
    model?: string;
    [k: string]: unknown;
};
/** The pinned engine version: CUTSCENE_ENGINE_VERSION, else skills/cutscene/engine.json. */
export declare function enginePin(): string;
/** The installed engine's entry file, or null. */
export declare function engineEntry(): string | null;
/** The engine's own node_modules folder (for puppeteer-core), or null. */
export declare function engineModules(): string | null;
/**
 * How to run an engine command: through CUTSCENE_CLI when set, else the installed engine.
 * @param direct skip the CLI (for engine commands it does not forward)
 */
export declare function engineRunner(direct?: boolean): {
    argv: string[];
    env: NodeJS.ProcessEnv;
    via: string;
} | null;
/** True when transcription can run on this computer. */
export declare function canTranscribe(): boolean;
/**
 * Transcribe a media file locally with the engine's `transcribe` (Parakeet or Whisper, on this
 * computer; no cloud).
 */
export declare function engineTranscribe(file: string, o: {
    workDir: string;
    model?: string;
    language?: string;
    asr?: string;
    timeoutMs?: number;
}): {
    raw: RawTranscript;
    info: EngineInfo;
};
/** Remove a work folder (best effort). */
export declare function cleanWork(dir: string): void;
/**
 * The Chrome the engine renders with: `browser path` (needed only for face tracking).
 */
export declare function engineChrome(): string | null;
