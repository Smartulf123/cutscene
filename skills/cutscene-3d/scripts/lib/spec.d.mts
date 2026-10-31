// Built from src/skills/cutscene-3d/scripts/lib/spec.mts by `npm run build`. Edit that file, not this one.
export declare const SKILL_DIR: string;
export declare const BUNDLED_FONT: string;
export declare const DEMO_SVG: string;
/** Colour tokens ("bg", "fg", "accent", "accent2") to "#RRGGBB". */
export type Palette = Record<string, string>;
/** A font in look.json's type section. */
export interface LookFont {
    family?: string;
    weight?: number;
    src?: string | null;
}
/** look.json (the parts Cutscene 3D reads; the rest is kept as it is). */
export interface Look {
    version?: number;
    name?: string;
    palette?: Palette;
    type?: {
        display?: LookFont;
        body?: LookFont;
        [key: string]: unknown;
    };
    motion?: {
        character?: string;
        ease?: string;
        duration_scale?: number;
    };
    seed?: number;
    [key: string]: unknown;
}
/** A material in a spec: a preset and a colour (palette token or "#RRGGBB"). */
export interface MaterialSpec {
    preset?: string;
    color?: string;
    roughness?: number;
    [key: string]: unknown;
}
/** Template parameters in a spec (the ones the Three.js templates read). */
export interface Params {
    text?: string;
    svg?: string | null;
    model?: string | null;
    face?: MaterialSpec | null;
    sides?: MaterialSpec | null;
    label?: MaterialSpec | null;
    depth?: number;
    bevel?: number;
    tracking?: number;
    swing?: number;
    stagger?: number | null;
    letter_duration?: number | null;
    turns?: number;
    count?: number;
    keep_svg_colors?: boolean;
    [key: string]: unknown;
}
export interface LightingSpec {
    rim_color?: string;
    [key: string]: unknown;
}
/**
 * A shot spec (<project>/.cutscene/3d/<shot>.json). Specs written before Blender was removed
 * can also hold engine, quality, samples, view_transform, motion_blur, camera, lighting.rig and
 * lighting.hdri. The Three.js templates never read those, so they are ignored (tier.mjs
 * BLENDER_ONLY_FIELDS).
 */
export interface ShotSpec {
    version?: number;
    id: string;
    template: string;
    /** 1 or "auto" (both mean Tier 1). An old spec's 2 is refused with TIER2_REMOVED. */
    tier?: "auto" | 1 | "1" | 2 | "2";
    duration?: number;
    fps?: number;
    width?: number;
    height?: number;
    look?: string;
    params?: Params;
    lighting?: LightingSpec;
    transparent?: boolean;
    needs?: string[];
    seed?: number;
    beat?: string;
    palette?: Palette;
    font?: string;
    bloom?: boolean | string;
    bloom_strength?: number;
    exposure?: number;
    [key: string]: unknown;
}
/** What newSpec writes: a spec with its params filled in. */
export interface NewShotSpec extends ShotSpec {
    params: Params;
}
/** A Three.js template: what it makes, and the defaults for a new spec. */
export interface TemplateDef {
    summary: string;
    duration: number;
    params: Params;
}
export declare const DEFAULT_LOOK: Look & {
    palette: Palette;
};
export declare const MATERIALS: string[];
export declare const COLOR_TOKENS: string[];
/**
 * The Three.js (Tier 1) templates. `params` are defaults; colour fields may be palette tokens
 * ("accent") or "#RRGGBB".
 */
export declare const TEMPLATES: Record<string, TemplateDef>;
/** Template name -> one-line summary. */
export declare const TIER1_TEMPLATES: Record<string, string>;
/** Templates that draw text, so they need the look's display font (others never load a font). */
export declare const TEXT_TEMPLATES: string[];
export declare const usesText: (template: string) => boolean;
export declare const FORMATS: Record<string, [number, number]>;
export declare function isHex(v: unknown): boolean;
/** Deep merge (arrays and scalars replace). */
export declare function merge<T>(base: T, over: unknown): T;
/** Options for newSpec (`cutscene 3d new` flags and beats.json values). */
export interface NewSpecOptions {
    id?: string;
    text?: string;
    svg?: string;
    model?: string;
    duration?: number;
    fps?: number;
    width?: number;
    height?: number;
    beat?: string;
    look?: string;
    seed?: number;
}
/** A new spec for `template` (what `cutscene 3d new` writes). */
export declare function newSpec(template: string, { id, text, svg, model, duration, fps, width, height, beat, look, seed }?: NewSpecOptions): NewShotSpec;
/**
 * Validate a spec. Returns a list of plain-language problems (empty = fine). Specs that ask
 * for Blender (Tier 2) are caught before this, by tier2Reasons in tier.mjs.
 */
export declare function validateSpec(spec: ShotSpec): string[];
/** Read look.json (or null). */
export declare function readLook(path: string | null | undefined): Look | null;
