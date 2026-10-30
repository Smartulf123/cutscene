import { ms } from "./cli.mjs";
import type { Edl } from "./edl.mjs";
import type { MediaProbe } from "./media.mjs";
import type { RenderResult } from "./render.mjs";
import type { Transcript, Word } from "./transcript.mjs";
/** A transcript loaded for cutting, with the edit it came from when it is on an edited timeline. */
export type LoadedTranscript = {
    path: string;
    transcript: Transcript;
    words: Word[];
    parent: Edl | null;
    parentPath: string | null;
};
/** What every cutting tool returns. */
export type EditSummary = {
    tool: string;
    sourceDuration: number;
    editedDuration: number;
    removed: number;
    removedPct: number;
    cuts: number;
    keepRanges: number;
    words: {
        kept: number;
        dropped: number;
        clipped: number;
    };
    outputs: {
        edl: string;
        transcript: string;
        decisions: string;
    };
    dryRun: boolean;
    video?: RenderResult;
    hint?: string;
    warning?: string;
    memory?: string;
};
/**
 * Load a transcript and, for an edited one, the EDL that produced it.
 */
export declare function loadTranscript(path: string): LoadedTranscript;
/**
 * The original source file for a transcript: --video, else the transcript's (or its EDL's) source.
 * Checks the file matches the timeline the cuts are made on.
 */
export declare function sourceMedia(lt: LoadedTranscript, videoArg: string | undefined): {
    file: string;
    info: MediaProbe;
} | null;
/** Human summary of an EDL for decisions files. */
export declare function decisionsMarkdown(title: string, edl: Edl, extra?: string[]): string;
/**
 * Write EDL, retimed transcript and decisions; render with --apply. Returns the summary.
 */
export declare function writeEditOutputs(o: {
    edl: Edl;
    lt: Pick<LoadedTranscript, "transcript"> | null;
    words: Word[];
    outDir: string;
    stem: string;
    suffix: string;
    title: string;
    media: {
        file: string;
        info: MediaProbe;
    } | null;
    apply: boolean;
    output?: string;
    fade?: number;
    extraDecisions?: string[];
    memory?: boolean;
}): EditSummary;
/** One-line human summary for cutting tools. */
export declare function humanCut(r: EditSummary): string;
export { ms };
