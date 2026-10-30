// Built from src/skills/cutscene-voice/scripts/lib/project.mts by `npm run build`. Edit that file, not this one.
import type { LicenseFacts, VoiceSpec } from "./types.mjs";
/** What a licence note says about one voice file. */
export interface LicenseInfo {
    beatId: string;
    file: string;
    line: string;
    model: string;
    voice?: VoiceSpec;
    speaker: string;
    seed?: number | null;
}
/** A consent statement must say who gave permission; refuse empty or placeholder text. */
export declare function checkConsent(consent: unknown): string;
/** Append one line to .cutscene/project.md (created if missing). Never rewrites earlier notes. */
export declare function appendProjectNote(projectMd: string, heading: string, line: string): void;
export declare function recordConsent(projectMd: string, { speaker, source, consent, model }: {
    speaker: string;
    source: string;
    consent: string;
    model: string;
}): void;
/** Licence facts for a model id (omnivoice, voxcpm2, kokoro, voicestudio). */
export declare function licenseFor(model: string): LicenseFacts;
export declare function licenseText({ beatId, file, line, model, voice, speaker, seed }: LicenseInfo): string;
export declare function writeLicenseFile(path: string, info: LicenseInfo): void;
