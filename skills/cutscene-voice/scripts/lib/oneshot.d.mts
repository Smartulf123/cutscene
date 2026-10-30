import type { CaptionWord } from "./text.mjs";
import type { Ctx, Flags, SpeakFlags, VoiceSpec } from "./types.mjs";
/** Who speaks a one-shot line; `design` = a fresh voice from --describe. */
type OneShotVoice = {
    speaker: string | null;
    voice: VoiceSpec;
    design?: boolean;
};
export declare function isOneShot(f: Flags | SpeakFlags): boolean;
/** Decide which voice speaks a one-shot line. Pure; exported for tests. */
export declare function pickOneShotVoice({ wanted, voices, presets, describe, language }: {
    wanted?: string | null;
    voices: Record<string, VoiceSpec>;
    presets: string[];
    describe?: string;
    language?: string;
}): (OneShotVoice & {
    error?: undefined;
}) | {
    error: string;
    speaker?: undefined;
    voice?: undefined;
    design?: undefined;
};
export declare function cmdSpeakOne(f: SpeakFlags, ctx?: Ctx): Promise<{
    ok: true;
    file: string;
    duration: number;
    model: string;
    voice: string | null;
    seed: number | null;
    license: string;
    commercial_use: boolean | null;
    license_file: string;
    seconds: number;
    loudness: {
        before_lufs?: number;
        after_lufs?: number;
    } | null;
    verified: boolean | null;
    heard?: string;
    issues?: string[];
    words?: CaptionWord[];
    message?: string;
}>;
export {};
