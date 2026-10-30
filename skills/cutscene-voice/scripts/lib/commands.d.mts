import type { ModelStatus } from "./status.mjs";
import type { CaptionWord, LineIssue, LineWarning } from "./text.mjs";
import type { BenchmarkFlags, Benchmarks, CloneFlags, Ctx, DesignFlags, GenItem, GenResultItem, ModelBenchmark, SetupFlags, SpeakFlags, StatusFlags, TranscribeJobItem, TranscribedItem, VerifyFlags, VoiceSpec } from "./types.mjs";
/** The parts of voiceStatus() that choosing a model and a transcriber look at. */
type StatusLike = {
    models: Pick<ModelStatus, "id" | "installed">[];
    voicestudio: {
        running: boolean;
    };
};
/** What a transcription run gives back (VoiceStudio has no load time and no durations). */
type Transcription = {
    engine: string;
    load_seconds?: number;
    items: TranscribedItem[];
};
/** Whether a reference clip says its text, when something could check it. */
type ReferenceCheck = {
    checked: boolean;
    engine?: string;
    verified?: boolean;
    heard?: string;
    issues?: string[];
};
/** One reference take tried by design. */
type DesignTake = {
    seed: number | null;
    file: string;
    seconds: number;
    duration: number;
    load_seconds: number;
    check: ReferenceCheck;
};
/** One spoken line in speak's result. */
type SpokenLine = {
    id: string;
    file: string;
    duration: number;
    seed: number | null;
    model: string;
    seconds: number;
    rtf: number | null;
    loudness: {
        before_lufs?: number;
        after_lufs?: number;
    } | null;
    warning: string | null;
    load?: undefined;
};
/** One line in verify's report. */
type VerifyLine = {
    id: string;
    file: string | null | undefined;
    line: string;
    verified: boolean;
    heard: string;
    wer: number;
    issues: LineIssue[];
    warnings: LineWarning[];
    words: CaptionWord[];
    transcribe_seconds: number;
};
export declare const TTS_MODELS: string[];
export declare const DEFAULT_SAMPLE = "Hi! I'm so glad you're here.";
export declare const DEFAULT_SEED = 42;
export declare const BENCH_TEXT = "Cutscene turns a short script into a finished video, one beat at a time.";
/** Pick the speech model: the flag, else the best installed one, else VoiceStudio, else Kokoro. */
export declare function chooseModel(flag: string | null | undefined, status: StatusLike, { clone }?: {
    clone?: boolean | undefined;
}): string;
export declare function transcribeFiles(items: TranscribeJobItem[], ctx: Ctx | undefined, status: StatusLike): Promise<Transcription | null>;
/**
 * items: [{id, text, out, seed, language, instruct?, ref_audio?, ref_text?, prompt_path?, save_prompt?, prompt_text?, preset?, voice?}]
 */
export declare function generate(model: string, items: GenItem[], ctx: Ctx | undefined, { steps, fast, yes }?: {
    steps?: number;
    fast?: boolean;
    yes?: boolean;
}): Promise<{
    load_seconds: number;
    num_step?: number;
    items: GenResultItem[];
}>;
export declare function cmdSetup(f: SetupFlags, ctx?: Ctx): Promise<{
    ok: boolean;
    message: string;
    models: string[];
    plan: import("./setup.mjs").SetupPlan;
    dry_run?: undefined;
    commands?: undefined;
    lock?: undefined;
    status?: undefined;
} | {
    ok: boolean;
    dry_run: boolean;
    plan: import("./setup.mjs").SetupPlan;
    commands: string[];
    message: string;
    models?: undefined;
    lock?: undefined;
    status?: undefined;
} | {
    dry_run?: undefined;
    plan?: undefined;
    commands?: undefined;
    ok: boolean;
    message: string;
    models: string[];
    lock: string;
    status: {
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
    };
}>;
export declare function cmdStatus(f: StatusFlags, ctx?: Ctx): Promise<{
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
} & {
    status_ok: boolean;
    project?: {
        voices: Record<string, VoiceSpec>;
        lines: {
            id: string;
            speaker?: string;
            line: string;
            file: string | null;
            duration: number | null;
            verified: boolean | null;
        }[];
    };
    message?: string;
}>;
export declare function cmdDesign(f: DesignFlags, ctx?: Ctx): Promise<{
    ok: boolean;
    speaker: string;
    model: string;
    voice: VoiceSpec;
    reference: string | undefined;
    takes: DesignTake[];
    notes: string[];
    message: string;
}>;
export declare function cmdClone(f: CloneFlags, ctx?: Ctx): Promise<{
    ok: boolean;
    speaker: string;
    model: string;
    voice: VoiceSpec;
    consent_recorded: string;
    sample: string | undefined;
    reference_check: ReferenceCheck;
    seconds: number;
    notes: string[];
    message: string;
}>;
/** Estimated seconds to speak these lines, from this computer's benchmark. */
export declare function estimateRun(model: string, lines: string[], benchmarks: Benchmarks | null | undefined): number | null;
export declare function cmdSpeak(f: SpeakFlags, ctx?: Ctx): Promise<{
    ok: true;
    lines: SpokenLine[];
    load_seconds: number;
    message: string;
    verified?: boolean | null;
    verify?: Omit<VerifyLine, "words">[];
}>;
export declare function cmdVerify(f: VerifyFlags, ctx?: Ctx): Promise<{
    ok: boolean;
    accepted: string[];
    message: string;
    all_verified?: undefined;
    lines?: undefined;
    report?: undefined;
} | {
    accepted?: undefined;
    ok: boolean;
    all_verified: boolean;
    lines: {
        id: string;
        file: string | null | undefined;
        line: string;
        verified: boolean;
        heard: string;
        wer: number;
        issues: LineIssue[];
        warnings: LineWarning[];
        transcribe_seconds: number;
    }[];
    report: string;
    message: string;
}>;
export declare function cmdBenchmark(f: BenchmarkFlags, ctx?: Ctx): Promise<{
    ok: boolean;
    benchmarks: {
        version: number;
        updated: string;
        sentence: string;
        sentence_estimate_seconds: number;
        machine: {
            cpu: string;
            threads: number;
            ram_gb: number;
            os: string;
        };
        models: Record<string, ModelBenchmark>;
    };
    file: string;
    message: string;
}>;
export {};
