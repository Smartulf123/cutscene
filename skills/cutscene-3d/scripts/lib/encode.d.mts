// Built from src/skills/cutscene-3d/scripts/lib/encode.mts by `npm run build`. Edit that file, not this one.
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";
/** PNG RGBA sequence -> VP9 WebM with real alpha (the engine reads alpha_mode=1). */
export declare function encodeArgs({ framesDir, fps, out, crf, pattern, start }: {
    framesDir: string;
    fps: number;
    out: string;
    crf?: number;
    pattern?: string;
    start?: number;
}): string[];
/** Copy one frame as the poster PNG (keeps alpha). */
export declare function posterArgs({ frame, out }: {
    frame: string;
    out: string;
}): string[];
/**
 * Contact sheet: each still over a background colour (so transparency reads like the final video),
 * tiled 2 per row. `bg` is "#RRGGBB".
 */
export declare function contactSheetArgs({ stills, out, width, height, bg, columns }: {
    stills: string[];
    out: string;
    width: number;
    height: number;
    bg?: string;
    columns?: number;
}): string[];
/** ffprobe JSON for the first video stream. */
export declare function probeArgs(file: string): string[];
/** Decode with libvpx-vp9 (which keeps alpha) and measure the alpha plane: min < 255 = real transparency. */
export declare function alphaStatsArgs(file: string): string[];
export declare function run(cmd: string, args: string[], opts?: Partial<SpawnSyncOptionsWithStringEncoding>): {
    code: number | null;
    stdout: string;
    stderr: string;
    error: Error | undefined;
};
export declare function hasTool(cmd: string): boolean;
/** Inspect a WebM: codec, size, whether alpha_mode=1 is tagged and whether alpha decodes. */
export declare function inspectAlpha(file: string, { ffprobe, ffmpeg }?: {
    ffprobe?: string;
    ffmpeg?: string;
}): {
    codec: string | undefined;
    width: number | undefined;
    height: number | undefined;
    duration: number | null;
    alphaMode: boolean;
    decodedAlpha: boolean;
    transparentPixels: boolean;
    frames: number;
};
