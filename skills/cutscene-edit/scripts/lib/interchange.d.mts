// Built from src/skills/cutscene-edit/scripts/lib/interchange.mts by `npm run build`. Edit that file, not this one.
import type { Edl } from "./edl.mjs";
export type MediaInfo = {
    path: string;
    name: string;
    width?: number;
    height?: number;
    hasVideo?: boolean;
    hasAudio?: boolean;
    channels?: number;
    sampleRate?: number;
    duration?: number;
};
/** A kept range placed on the sequence, in frames. */
export type PlacedClip = {
    start: number;
    inFrame: number;
    frames: number;
};
/** A timed word, as captions need it. */
type CaptionWord = {
    text: string;
    start: number;
    end: number;
};
export declare function escapeXml(s: string): string;
/** file:///C:/Users/... with each path part percent-encoded. */
export declare function fileUrl(absolute: string, localhost?: boolean): string;
/** Frame rate as a rational: 29.97 -> {num: 30000, den: 1001, ntsc: true, timebase: 30}. */
export declare function rational(fps: number): {
    num: number;
    den: number;
    ntsc: boolean;
    timebase: number;
};
/**
 * Kept ranges as whole frames on the sequence.
 */
export declare function placedClips(edl: Edl): {
    fps: number;
    clips: PlacedClip[];
    total: number;
    sourceFrames: number;
};
/**
 * FCPXML 1.8 (the widest support: Resolve reads 1.8 to 1.11, Final Cut Pro reads it).
 */
export declare function toFcpxml(edl: Edl, m: MediaInfo, name?: string): string;
/**
 * Final Cut Pro 7 XML (xmeml v5): Premiere Pro's import format.
 */
export declare function toXmeml(edl: Edl, m: MediaInfo, name?: string): string;
/**
 * OpenTimelineIO JSON.
 */
export declare function toOtio(edl: Edl, m: MediaInfo, name?: string): string;
/**
 * Caption groups from timed words: short lines, broken at sentence ends, pauses and a word cap.
 */
export declare function captionGroups(words: CaptionWord[], o?: {
    maxWords?: number;
    maxSeconds?: number;
    pause?: number;
    hold?: number;
}): {
    start: number;
    end: number;
    words: CaptionWord[];
}[];
/** SRT text from timed words (edited timeline). */
export declare function toSrt(words: CaptionWord[], o?: {
    maxWords?: number;
    maxSeconds?: number;
    pause?: number;
    hold?: number;
}): string;
/** auto-editor's v1 timeline file. */
export type AutoEditorV1 = {
    version: string;
    source: string;
    timebase: string;
    chunks: [number, number, number][];
};
/**
 * auto-editor's v1 timeline: [startFrame, endFrame, speed] chunks; 99999 means cut.
 */
export declare function toAutoEditorV1(edl: Edl, sourcePath: string): AutoEditorV1;
/**
 * auto-editor's v1 timeline back to cut ranges in seconds.
 */
export declare function fromAutoEditorV1(v1: {
    timebase?: string;
    chunks: [number, number, number][];
}, fallbackFps?: number): {
    fps: number;
    deletes: {
        start: number;
        end: number;
        reason: string;
    }[];
    frames: number;
};
export {};
