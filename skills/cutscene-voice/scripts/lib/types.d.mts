// Built from src/skills/cutscene-voice/scripts/lib/types.mts by `npm run build`. Edit that file, not this one.
/** How parseFlags reads one option. */
export type FlagType = "string" | "number" | "int" | "bool" | "list";
/** Option name -> how to read it. */
export type FlagSpec = Record<string, FlagType>;
/** One parsed option value. */
export type FlagValue = string | number | boolean | string[];
/** Parsed options by name, before a command picks the ones it knows. */
export type Flags = Record<string, FlagValue>;
/** What every command gets besides its options (tests point `home` at a temporary folder). */
export type Ctx = {
    home?: string;
};
/** What every command returns; voice.mjs prints `message` (or the object under --json). */
export type CommandResult = {
    ok?: boolean;
    message?: string;
    [field: string]: unknown;
};
export type SetupFlags = {
    json?: boolean;
    help?: boolean;
    model?: string[];
    yes?: boolean;
    "dry-run"?: boolean;
    repair?: boolean;
};
export type StatusFlags = {
    json?: boolean;
    help?: boolean;
    project?: string;
};
export type DesignFlags = {
    json?: boolean;
    help?: boolean;
    yes?: boolean;
    project?: string;
    speaker?: string;
    describe?: string;
    /** Parsed as a string; design also guards against `true`, as requireFlag does. */
    sample?: string | true;
    seed?: number;
    language?: string;
    model?: string;
    preset?: string;
    voice?: string;
    engine?: string;
    steps?: number;
    fast?: boolean;
    tries?: number;
    replace?: boolean;
};
export type CloneFlags = {
    json?: boolean;
    help?: boolean;
    yes?: boolean;
    project?: string;
    speaker?: string;
    from?: string;
    text?: string;
    consent?: string;
    model?: string;
    seed?: number;
    language?: string;
    sample?: string;
    steps?: number;
    fast?: boolean;
    force?: boolean;
    replace?: boolean;
};
export type SpeakFlags = {
    json?: boolean;
    help?: boolean;
    yes?: boolean;
    project?: string;
    beats?: string[];
    retry?: boolean;
    seed?: number;
    model?: string;
    steps?: number;
    fast?: boolean;
    "no-verify"?: boolean;
    "text-file"?: string;
    text?: string;
    out?: string;
    voice?: string;
    describe?: string;
    language?: string;
    provider?: string;
};
export type VerifyFlags = {
    json?: boolean;
    help?: boolean;
    project?: string;
    beats?: string[];
    accept?: string[];
    reason?: string;
    /** Set when speak runs verify itself. */
    _fromSpeak?: boolean;
};
export type BenchmarkFlags = {
    json?: boolean;
    help?: boolean;
    yes?: boolean;
    model?: string[];
    steps?: number;
    fast?: boolean;
};
/** An error-like value from a catch block or another module (only the fields we read). */
export type ErrorLike = {
    message?: string;
    stack?: string;
    code?: unknown;
    hint?: string;
} | null | undefined;
/** One word with its time in the line (seconds). */
export interface WordTiming {
    w: string;
    start: number;
    end: number;
    p?: number;
    estimated?: boolean;
}
/** beats.json `voices.<speaker>`: how a voice was made and how to speak with it. */
export interface VoiceSpec {
    model?: string | null;
    design?: string | null;
    instruct?: string | null;
    preset?: string;
    reference?: string;
    reference_text?: string;
    reference_verified?: boolean | null;
    prompt?: string;
    seed?: number | null;
    language?: string;
    num_step?: number;
    fast?: boolean;
    engine?: string;
    voice?: string;
    license?: string;
    created?: string;
    cloned_from?: string;
    consent?: string;
    sample?: string;
}
/** A beat's `voice` block: the script line, and what speak and verify filled in. */
export interface BeatVoice {
    speaker?: string;
    line?: string;
    file?: string | null;
    duration?: number | null;
    model?: string;
    seed?: number | null;
    take?: string;
    spoken?: string;
    verified?: boolean | null;
    words?: WordTiming[] | null;
    heard?: string | null;
    issues?: string[] | null;
    accepted?: string | null;
}
export interface Beat {
    id: string;
    start: number;
    end: number;
    voice?: BeatVoice;
    [field: string]: unknown;
}
/** A beat that has a voice line. */
export type VoicedBeat = Beat & {
    voice: BeatVoice & {
        line: string;
    };
};
export interface BeatSheet {
    beats?: Beat[];
    voices?: Record<string, VoiceSpec>;
    [field: string]: unknown;
}
/** What a licence note needs to know about a model or preset voice. */
export interface LicenseFacts {
    title: string;
    license: string;
    commercial_use: boolean | null;
    attribution: string;
    revision?: string;
    repo?: string;
    license_note?: string;
}
export interface ModelFile {
    path: string;
    size: number;
    sha256?: string;
}
export interface ModelSpec extends LicenseFacts {
    kind: string;
    repo: string;
    repo_note?: string;
    revision: string;
    source: string;
    python_group: string;
    languages: string;
    design?: string;
    sample_rate?: number;
    compute_type?: string;
    on_demand?: boolean;
    files: ModelFile[];
}
export interface PresetSpec extends LicenseFacts {
    languages?: string;
    voices?: string[];
    url?: string;
}
/** A pinned Python package. */
export interface PythonPin {
    name: string;
    version: string;
    sha256?: string;
    url?: string;
    size?: number;
    license?: string;
    source?: string;
}
export interface TorchWheel extends PythonPin {
    sha256: string;
    platform: string;
    python: string;
}
/** Download and disk size estimates for one package group. */
export interface GroupEstimate {
    download_bytes?: number;
    disk_bytes?: number;
    estimate_only?: boolean;
}
export interface Manifest {
    version: number;
    about?: string;
    pins: unknown[];
    python: {
        requires: string;
        uploaded_prior_to: string;
        index: string;
        pip: PythonPin & {
            sha256: string;
        };
        torch_index: string;
        torch_wheels: TorchWheel[];
        groups: Record<string, PythonPin[]>;
        /** By group (the file also has an "about" note here; no group is called that). */
        estimates: Record<string, GroupEstimate>;
    };
    models: Record<string, ModelSpec>;
    presets: {
        kokoro: PresetSpec & {
            voices: string[];
        };
        voicestudio: PresetSpec & {
            url: string;
        };
        [id: string]: PresetSpec;
    };
}
export interface LockPackage {
    name: string;
    version: string;
    sha256: string | null;
}
/** A model file as the worker downloaded and hashed it. */
export interface DownloadedFile {
    path: string;
    size: number;
    sha256: string;
}
export interface ModelLock {
    repo: string;
    revision: string;
    license: string;
    files: DownloadedFile[];
    verified: boolean;
    installed_at: string;
}
export interface VoiceLock {
    version?: number;
    note?: string;
    updated?: string;
    cutoff?: string;
    groups?: string[];
    packages?: LockPackage[];
    python?: {
        version: string;
        platform: string;
        machine: string;
    };
    models?: Record<string, ModelLock>;
}
/** One model's timings on this computer. */
export interface ModelBenchmark {
    mode?: string;
    num_step?: number;
    threads?: number;
    load_seconds?: number;
    design_seconds?: number;
    seconds?: number;
    audio_seconds?: number;
    rtf?: number | null;
    per_line_seconds?: number;
    heard?: string;
    benchmark_line_verified?: boolean;
    date?: string;
    note?: string;
    error?: string;
}
export interface Benchmarks {
    version?: number;
    updated?: string;
    sentence?: string;
    sentence_estimate_seconds?: number;
    machine?: {
        cpu?: string;
        threads: number;
        ram_gb: number;
        os: string;
    };
    models?: Record<string, ModelBenchmark>;
}
/** One line to speak, for any model (the worker reads the snake_case fields). */
export interface GenItem {
    id: string;
    text: string;
    out: string;
    seed: number;
    language: string;
    instruct?: string | null;
    ref_audio?: string;
    ref_text?: string;
    prompt_path?: string;
    save_prompt?: string;
    prompt_text?: string;
    preset?: string;
    voice?: string;
    engine?: string;
}
/** One spoken line as generate() reports it. */
export interface GenResultItem {
    id: string;
    out: string;
    seed: number | null;
    duration: number;
    seconds: number;
    rtf: number | null;
    mode?: string;
    sample_rate?: number;
}
/** A file to transcribe. */
export interface TranscribeJobItem {
    id: string;
    path: string;
    language: string;
}
/** One transcribed file (VoiceStudio reports no duration). */
export interface TranscribedItem {
    id: string;
    path: string;
    words: WordTiming[];
    text: string;
    seconds: number;
    duration?: number;
    language?: string;
}
/** A progress line from the worker (`CUTSCENE_PROGRESS {...}` on stderr). */
export type ProgressEvent = {
    event: "load_start";
    model: string;
} | {
    event: "load_done";
    model: string;
    seconds: number;
} | {
    event: "item_start";
    id: string;
    index: number;
    total: number;
} | {
    event: "item_done";
    id: string;
    seconds: number;
    duration?: number;
} | {
    event: "download_skip";
    file: string;
    index: number;
    total: number;
} | {
    event: "download_start";
    file: string;
    size: number;
    index: number;
    total: number;
} | {
    event: "download_done";
    file: string;
    seconds: number;
} | {
    event: "verify";
    file: string;
};
export interface WorkerErrorInfo {
    code?: string;
    message?: string;
    hint?: string;
}
/** The worker's result file. */
export interface WorkerResult {
    ok: boolean;
    task?: string;
    seconds?: number;
    error?: WorkerErrorInfo;
}
/** omnivoice and voxcpm tasks. */
export interface TtsWorkerResult extends WorkerResult {
    model: string;
    num_step: number;
    fast?: boolean;
    threads: number;
    load_seconds: number;
    items: GenResultItem[];
}
/** The whisper task. */
export interface WhisperWorkerResult extends WorkerResult {
    model: string;
    load_seconds: number;
    items: (TranscribedItem & {
        duration: number;
        language_probability?: number;
    })[];
}
/** The download task. */
export interface DownloadWorkerResult extends WorkerResult {
    repo: string;
    revision: string;
    local_dir: string;
    files: DownloadedFile[];
}
