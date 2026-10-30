// Built from src/skills/cutscene-3d/scripts/lib/tier.mts by `npm run build`. Edit that file, not this one.
import type { Params, ShotSpec } from "./spec.mjs";
/** Seconds per frame by engine ("BLENDER_EEVEE", "CYCLES") and quality ("draft", "final"). */
export type PerFrame = Record<string, Record<"draft" | "final", number>>;
/** Render timings: the defaults below, or measured numbers that replace some of them. */
export interface BenchInput {
    machine?: string;
    startup?: number;
    eeveeFirstFrame?: number;
    perFrame?: Record<string, Partial<Record<"draft" | "final", number>>>;
}
/** The spec fields an estimate reads (a spec, or a resolved spec). */
export interface EstimateSpec {
    template: string;
    duration?: number;
    fps?: number;
    width?: number;
    height?: number;
    quality?: string;
    engine?: string;
    needs?: string[];
    params?: Params;
}
/** Needs that only Blender does well. */
export declare const HARD_TIER2: Record<string, string>;
export declare const SOFT_TIER2: Record<string, string>;
/**
 * Measured on the reference PC (Intel i5-13420H, Intel UHD graphics, 24 GB, Blender 5.2.3),
 * seconds per frame at 1920x1080. Updated from real renders: see references/tiers.md.
 */
export declare const BENCH: {
    machine: string;
    startup: number;
    eeveeFirstFrame: number;
    perFrame: PerFrame;
    physicsBakePerFrame: number;
    encodePerFrame: number;
};
/**
 * Decide the tier for a spec.
 */
export declare function decideTier(spec: ShotSpec, { blender, deadline }?: {
    blender?: {
        path: string;
        version: string;
    } | null;
    deadline?: boolean;
}): {
    tier: number;
    engine: "BLENDER_EEVEE" | "CYCLES" | null;
    template: string;
    reasons: string[];
    warnings: string[];
    fallback: {
        tier: number;
        template: string;
        lost: string[];
        message: string;
    } | null;
    needs: string[];
};
/**
 * Seconds to render a shot on this machine. `bench` can carry measured numbers from earlier
 * renders (`<CUTSCENE_HOME>/logs/3d-timings.json`), which beat the defaults.
 */
export declare function estimate(spec: EstimateSpec, { engine, stills, bench, scale }?: {
    engine?: string | null;
    stills?: number;
    bench?: BenchInput;
    scale?: number;
}): {
    engine: string;
    frames: number;
    secondsPerFrame: number;
    stillsSeconds: number;
    renderSeconds: number;
    encodeSeconds: number;
    human: string;
};
export declare function humanTime(s: number): string;
