import { existsSync } from "node:fs";
import type { EditSummary } from "../lib/workflow.mjs";
type HighlightList = {
    tool?: undefined;
    highlights: {
        id: string;
        start: number;
        end: number;
        length: number;
        score: number;
        opening: string;
        reasons: string[];
    }[];
    output: string;
    hint: string;
};
type ReframeResult = {
    mode: string;
    aspect: string;
    crop: {
        w: number;
        h: number;
    };
    keys: number;
    passes: number;
    facesSeen: number | null;
    plan: string;
    output: string;
    rendered: boolean;
    warning?: string;
    hint?: string;
};
type SyncResult = {
    a: string;
    b: string;
    offset: number;
    confidence: number;
    sure: boolean;
    meaning: string;
    hint: string | undefined;
};
type CleanAudioResult = {
    input: string;
    output: string;
    hum: boolean;
    noise: boolean;
    strength: string;
    filter: string;
    noiseFloorBefore: number;
    rendered: boolean;
    hint?: string;
    noiseFloorAfter?: number;
};
export declare const highlights: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): EditSummary | HighlightList;
    human(r: EditSummary | HighlightList): string;
};
export declare const reframe: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): Promise<ReframeResult>;
    human: (r: ReframeResult) => string;
};
export declare const sync: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): SyncResult;
    human: (r: SyncResult) => string;
};
export declare const cleanAudio: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): CleanAudioResult;
    human: (r: CleanAudioResult) => string;
};
export { existsSync };
