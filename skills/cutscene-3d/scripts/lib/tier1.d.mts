import type { Look, Palette, ShotSpec } from "./spec.mjs";
/** The config baked into a Tier 1 shot (read by templates/tier1/_boot.js and cs3d-runtime.js). */
export interface Tier1Config {
    template: string;
    id: string;
    width: number;
    height: number;
    duration: number;
    seed: number;
    motion: string;
    palette: Palette;
    transparent: boolean;
    bloom: boolean | string;
    bloomStrength?: number;
    exposure: number;
    vars: Record<string, unknown>;
    vendor?: {
        postprocessing: string;
    };
    [key: string]: unknown;
}
/** A Studio-editable variable (data-composition-variables). */
export interface Tier1Variable {
    id: string;
    type: string;
    role: string;
    label: string;
    default: unknown;
    maxLength: number;
}
export declare const TIER1_DIR: string;
export declare const THREE_VERSION = "0.184.0";
/** Composition id for a shot ("logo" -> "3d-logo"). */
export declare function compositionId(id: string): string;
/** Safe to drop inside <script>: no "</script" and no U+2028/2029. */
export declare function scriptJson(obj: unknown): string;
/** Safe inside a single-quoted HTML attribute. */
export declare function attrJson(obj: unknown): string;
/** Studio-editable variables for each template (the rest is baked config). */
export declare function variablesFor(template: string, config: {
    vars?: Record<string, unknown>;
}): Tier1Variable[];
/** Build the baked config object for a Tier 1 template. Pure. */
export declare function tier1Config(template: string, spec: ShotSpec, { look, assets }?: {
    look?: Look | null;
    assets?: Record<string, unknown>;
}): Tier1Config;
/** Fill the template text. Pure (given template sources). */
export declare function renderTemplate({ html, boot, common, id, config, variables }: {
    html: string;
    boot: string;
    common: string;
    id: string;
    config: {
        width: number;
        height: number;
        duration: number;
        [key: string]: unknown;
    };
    variables: unknown;
}): string;
/** Rewrite postprocessing's bare `three` imports to the pinned three ESM build. */
export declare function pinThreeImports(js: string, version?: string): string;
/**
 * Write the shot. Returns {file, compositionId, snippet, copied:[...], warnings:[...]}.
 */
export declare function writeTier1({ template, spec, projectDir, look, font, yes, start, track }: {
    template: string;
    spec: ShotSpec;
    projectDir: string;
    look?: Look | null;
    font?: string | null;
    yes?: boolean;
    start?: number;
    track?: number;
}): Promise<{
    file: string;
    compositionId: string;
    snippet: string;
    copied: string[];
    warnings: string[];
    config: Tier1Config;
}>;
/** The clip to paste into index.html (inside the root composition). */
export declare function hostSnippet({ id, config, start, track }: {
    id: string;
    config: {
        duration: number;
        width: number;
        height: number;
    };
    start?: number;
    track?: number;
}): string;
