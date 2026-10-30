import type { WordTiming } from "./types.mjs";
/** What the HTTP calls take besides their own fields (tests pass a fake fetch). */
type StudioOptions = {
    url?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
};
/** A word in an OpenAI-style verbose_json transcript. */
type VerboseWord = {
    word?: string;
    text?: string;
    start?: number | string;
    end?: number | string;
    probability?: number;
};
/** An OpenAI-style verbose_json transcript. */
type VerboseTranscript = {
    text?: string;
    language?: string;
    words?: VerboseWord[];
    segments?: {
        words?: VerboseWord[];
    }[];
};
export declare const DEFAULT_URL = "http://127.0.0.1:3900";
/** Only talk to VoiceStudio on this computer, so voice lines and recordings never leave it. */
export declare function voiceStudioUrl(configured?: string): string;
/** Is VoiceStudio running? Never throws. */
export declare function voiceStudioHealth({ url, timeoutMs, fetchImpl }?: StudioOptions): Promise<{
    running: boolean;
    url: string;
    detail: string;
    info?: undefined;
} | {
    detail?: undefined;
    running: boolean;
    url: string;
    info: unknown;
}>;
export declare function requireVoiceStudio(opts?: StudioOptions): Promise<string>;
/** The saved voices and engines VoiceStudio reports. */
export declare function listVoices({ url, fetchImpl }?: StudioOptions): Promise<unknown>;
/**
 * Speak one line and save it as WAV.
 */
export declare function speak(req: {
    text: string;
    out: string;
    voice?: string;
    instruct?: string | null;
    seed?: number;
    language?: string;
    engine?: string;
    numStep?: number;
}, { url, fetchImpl, timeoutMs }?: StudioOptions): Promise<{
    seconds: number;
}>;
/** Transcribe a file with word timestamps; returns words in Cutscene's {w, start, end, p} shape. */
export declare function transcribe(file: string, { url, language, fetchImpl, timeoutMs }?: StudioOptions & {
    language?: string;
}): Promise<{
    text: string;
    language?: string;
    words: WordTiming[];
}>;
/** OpenAI verbose_json -> [{w, start, end, p}] (VoiceStudio sends no word probability; p is omitted). */
export declare function wordsFromVerbose(data: VerboseTranscript | null | undefined): WordTiming[];
export {};
