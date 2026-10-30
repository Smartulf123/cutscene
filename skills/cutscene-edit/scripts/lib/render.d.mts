import type { Edl } from "./edl.mjs";
/** The self-check after a render. */
export type RenderCheck = {
    ok: boolean;
    duration: number;
    expected: number;
    durationDelta: number;
    avDelta: number;
    problems: string[];
};
/** What renderEdl did (or, in a dry run, would do). */
export type RenderResult = {
    rendered: boolean;
    output: string;
    filterScript: string;
    command: string;
    check?: RenderCheck;
};
/** The command line, for showing in a dry run. */
export declare function renderArgs(input: string, output: string, scriptPath: string, info: {
    hasVideo: boolean;
    hasAudio: boolean;
}): string[];
/**
 * Write the filtergraph next to the outputs and (with apply) render.
 */
export declare function renderEdl(edl: Edl, input: string, output: string, o: {
    outDir: string;
    stem: string;
    apply: boolean;
    fade?: number;
}): RenderResult;
/**
 * The self-check after every cut: the file plays, has the expected length, and its audio and
 * video end together (a drift here shows up as lips behind the voice).
 */
export declare function checkRender(output: string, edl: {
    edited_duration: number;
    fps: number;
}): RenderCheck;
