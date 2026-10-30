// Built from src/skills/cutscene-voice/scripts/lib/status.mts by `npm run build`. Edit that file, not this one.
import type { Benchmarks, ModelBenchmark } from "./types.mjs";
/** Are all pinned files of a model present with the right sizes? */
export declare function modelFilesStatus(model: string, home?: string): {
    installed: boolean;
    present: number;
    total: number;
    bytes: number;
    size: number;
    missing: string[];
    dir: string;
};
/** One model as voiceStatus() reports it (Kokoro, the built-in voice, has fewer fields). */
export interface ModelStatus {
    id: string;
    name: string;
    kind: string;
    installed: boolean;
    license: string;
    commercial_use: boolean | null;
    size_text: string;
    benchmark: ModelBenchmark | null;
    files_present?: boolean;
    packages_installed?: boolean;
    size?: number;
    languages?: string;
    revision?: string;
    source?: string;
    on_demand?: boolean;
    verified_sha256?: boolean;
    available?: boolean;
    engine_installed?: boolean;
    model_cached?: boolean;
    note?: string;
}
export declare function voiceStatus(opts?: {
    home?: string;
    voicestudio?: boolean;
    timeoutMs?: number;
}): Promise<{
    ok: boolean;
    ready: {
        design: boolean;
        clone: boolean;
        speak: boolean;
        verify: boolean;
    };
    detail: string;
    fix: string | undefined;
    home: string;
    env: {
        exists: boolean;
        python: string;
        locked: boolean;
        python_version: string | null;
        packages: number;
        groups: string[];
    };
    models: ModelStatus[];
    voicestudio: {
        running: boolean;
        url: string;
        detail: string;
        info?: undefined;
    } | {
        detail?: undefined;
        running: boolean;
        url: string;
        info: unknown;
    } | {
        running: boolean;
        url: null;
        detail: string;
    };
    benchmarks: Benchmarks | null;
    default_model: string;
}>;
export type VoiceStatus = Awaited<ReturnType<typeof voiceStatus>>;
