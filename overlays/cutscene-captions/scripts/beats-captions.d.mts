#!/usr/bin/env node
// Built from src/overlays/cutscene-captions/scripts/beats-captions.mts by `npm run build`. Edit that file, not this one.
export declare const MARKER = "Written by cutscene-captions/scripts/beats-captions.mjs";
/** A spoken word from beats.json voice.words: seconds relative to the voice file. */
export interface SpokenWord {
    w: string;
    start: number;
    end: number;
}
/** A caption word with its time. */
export interface CaptionToken {
    text: string;
    start: number;
    end: number;
}
/** One caption line: shown at `show`, hidden at `hide` (seconds on the video timeline). */
export interface CaptionLine {
    beat?: string;
    beatEnd?: number;
    show: number;
    hide: number;
    words: CaptionToken[];
}
/** The parts of .cutscene/beats.json this reads. */
export interface BeatSheet {
    version?: number;
    fps?: number;
    width?: number;
    height?: number;
    duration?: number;
    beats?: Beat[];
}
export interface Beat {
    id: string;
    start?: number;
    end?: number;
    label?: string;
    voice?: {
        file?: string;
        line?: string;
        heard?: string;
        display?: string;
        words?: SpokenWord[];
    };
}
/** The parts of .cutscene/look.json the caption rail uses. */
export interface CaptionLook {
    palette?: {
        bg?: unknown;
        fg?: unknown;
        accent?: unknown;
        accent2?: unknown;
    };
    type?: {
        display?: CaptionFont;
        body?: CaptionFont;
    };
}
export interface CaptionFont {
    family?: string;
    weight?: number;
}
export interface CaptionResult {
    lines: CaptionLine[];
    duration: number;
    placements: {
        beat: string;
        at: number;
        from: string;
    }[];
    sources: {
        beat: string;
        source: string;
    }[];
    warnings: string[];
}
/** A comparison key: lower case, letters and digits only, number words as digits ("three D" -> "3d"). */
export declare function spokenKey(text: unknown): string;
/**
 * Line up caption tokens with spoken words. Each caption token takes one or more spoken words
 * ("AI" takes "A", "I"). Returns [{text, start, end}] or null when they don't line up.
 */
export declare function alignDisplay(displayText: unknown, words: SpokenWord[]): CaptionToken[] | null;
/** Spoken words as captions: "A I" -> "AI", "three D," -> "3D,". */
export declare function tidySpoken(words: SpokenWord[]): CaptionToken[];
/** Break one beat's caption words into lines of at most maxWords, preferring punctuation. */
export declare function splitLines(tokens: CaptionToken[], maxWords?: number): CaptionToken[][];
/** Where each voice file starts in index.html: {"assets/voice/b1.wav": 0.35}. */
export declare function audioStarts(html: unknown): Record<string, number>;
/**
 * Build caption lines from a beat sheet. Pure.
 */
export declare function buildCaptions(sheet: BeatSheet | null | undefined, { html, text, maxWords }?: {
    html?: string;
    text?: string;
    maxWords?: number;
}): CaptionResult;
/** fg mixed toward bg as far as it can go while keeping `min`:1 contrast on bg. */
export declare function dimColor(fgHex: string, bgHex: string, min?: number): string;
/** The accent, moved toward fg until it reads as text (`min`:1 on bg); a look only promises 3:1. */
export declare function readableAccent(accentHex: string, fgHex: string, bgHex: string, min?: number): string;
/** The caption rail as a templated sub-composition. Pure and deterministic. */
export interface CaptionsHtmlOptions {
    id?: string;
    lines: CaptionLine[];
    duration: number;
    width?: number;
    height?: number;
    look?: CaptionLook | null;
    position?: string;
    font?: string;
}
export declare function captionsHtml({ id, lines, duration, width, height, look, position, font }: CaptionsHtmlOptions): string;
export declare function hostSnippet({ id, duration, width, height, track }: {
    id?: string;
    duration: number;
    width: number;
    height: number;
    track?: number;
}): string;
/** Where the CLI writes (tests pass their own). */
export interface CliIo {
    out: (s: string) => void;
    err: (s: string) => void;
}
export declare function runCli(argv: string[], io?: CliIo): number;
