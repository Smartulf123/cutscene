import type { Loudness } from "../lib/media.mjs";
import type { CutSheet, MusicGrid } from "../lib/music.mjs";
type MusicGridResult = Omit<MusicGrid, "beats"> & {
    file: string;
    beats: MusicGrid["beats"] | undefined;
    beatCount: number;
    out: string | null;
};
type SpliceResult = {
    take: string;
    out: string;
    rendered: boolean;
    period: number;
    phase: number;
    segments: [number, number][];
    length: number;
    graph: string;
    hint: string;
};
type MixPlan = {
    out: string;
    length: number;
    events: number;
    voice: boolean;
    target: {
        lufs: number;
        peak: number;
    };
};
type MixResult = (MixPlan & {
    rendered: false;
    hint: string;
}) | (MixPlan & {
    rendered: true;
    input: {
        lufs: number;
        truePeak: number;
    };
    measured: Loudness;
    hint: string;
});
export declare const musicGridCmd: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): MusicGridResult;
    human(r: MusicGridResult): string;
};
export declare const spliceMusic: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): SpliceResult;
    human: (r: SpliceResult) => string;
};
export declare const beatgrid: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): CutSheet;
    human(r: CutSheet): string;
};
export declare const mix: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): MixResult;
    human: (r: MixResult) => string;
};
export { musicGridCmd as musicGrid };
