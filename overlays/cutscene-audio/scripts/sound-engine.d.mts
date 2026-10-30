#!/usr/bin/env node
// Built from src/overlays/cutscene-audio/scripts/sound-engine.mts by `npm run build`. Edit that file, not this one.
type Env = Record<string, string | undefined>;
/** One entry of ../sound/sfx/manifest.json. */
export interface SfxEntry {
    file: string;
    duration?: number;
    description?: string;
}
export type SfxLibrary = Record<string, SfxEntry>;
/** A sound-effect cue from a request line. */
export interface SfxCue {
    id: string | number;
    name: string;
    offset_s?: number;
}
/** A resolved sound effect in the meta file. */
export interface SfxClip {
    id: string;
    name: string;
    file: string;
    source: string;
    offset_s: number;
    duration_s: number;
    volume: number;
}
export interface BgmRequest {
    mode?: string;
    file?: string;
    volume?: number;
    query?: string;
    prompt?: string;
}
export interface Bgm {
    path: string;
    volume: number;
    duration_s: number | null;
    source: string;
}
export interface VoiceWord {
    id: string;
    text: string;
    start: number;
    end: number;
}
export interface VoiceClip {
    id: string;
    path: string;
    duration_s: number;
    words: VoiceWord[];
}
/** The request the audio adapters write (see the header). */
export interface AudioRequest {
    provider?: string;
    voice?: string;
    lang?: string;
    speed?: number;
    lines?: {
        id: string | number;
        text?: string;
        sfx?: unknown[];
    }[];
    bgm?: BgmRequest;
}
/** The meta file this writes (see the header). */
export interface AudioMeta {
    engine: string;
    tts_provider: string | null;
    voice_id: string | null;
    bgm: Bgm | null;
    bgm_pending: boolean;
    voices: VoiceClip[];
    sfx: SfxClip[];
    total_duration_s: number;
    anomalies: string[];
}
export declare const SFX_DIR: string;
/** Where the pinned engine package keeps the same sound files (installed by `cutscene setup`). */
export declare const ENGINE_SFX_SUBDIR: string[];
export declare const SFX_VOLUME = 0.35;
export declare const BGM_VOLUME = 0.25;
export declare const DEFAULT_VOICE = "am_michael";
export declare function cutsceneCli(): string | null;
export declare function slug(s: unknown): string;
/** Duration of a PCM WAV file from its header, or null. */
export declare function wavDuration(path: string): number | null;
export declare function mediaDuration(path: string): number | null;
/** The engine version Cutscene pins (skills/cutscene/engine.json), or null. */
export declare function enginePin(env?: Env): string | null;
/** The installed engine's sound-effect folder, or null when the engine isn't installed. */
export declare function engineSfxDir(env?: Env): string | null;
/** The pinned SHA-256 of every sound file: { "whoosh.mp3": "<sha256>" }. */
export declare function loadSfxHashes(dir?: string): Record<string, string>;
/** Load the SFX manifest: { key: { file, duration, description } }. */
export declare function loadSfxLibrary(dir?: string): SfxLibrary;
/** Match a cue name to a library key by key, file basename, or slug. */
export declare function matchSfx(name: unknown, library: SfxLibrary): string | null;
export interface SfxOptions {
    library?: SfxLibrary;
    dir?: string | null;
    hashes?: Record<string, string>;
}
export declare function resolveSfxCues(cues: SfxCue[], projectDir: string, { library, dir, hashes }?: SfxOptions): {
    sfx: SfxClip[];
    anomalies: string[];
};
export declare function resolveBgm(bgmReq: BgmRequest | null | undefined, projectDir: string): {
    bgm: Bgm | null;
    anomalies: string[];
};
export declare function main(argv?: string[]): Promise<number>;
export {};
