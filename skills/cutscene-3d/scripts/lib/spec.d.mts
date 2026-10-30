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
    image?: string | null;
    [key: string]: unknown;
}
/** Template parameters in a spec. Templates read many more; these are the ones Node code reads. */
export interface Params {
    text?: string;
    svg?: string | null;
    model?: string | null;
    face?: MaterialSpec | null;
    sides?: MaterialSpec | null;
    label?: MaterialSpec | null;
    body?: MaterialSpec | null;
    material_override?: MaterialSpec | null;
    reveal_ease?: string | null;
    stagger?: number | null;
    letter_duration?: number | null;
    keep_svg_colors?: boolean;
    [key: string]: unknown;
}
export interface CameraSpec {
    move?: string;
    lens?: number;
    ease?: string;
    dof?: {
        fstop?: number;
    };
    drift?: number;
    [key: string]: unknown;
}
export interface LightingSpec {
    rig?: string;
    hdri?: string | null;
    rim_color?: string;
    [key: string]: unknown;
}
/** A shot spec (<project>/.cutscene/3d/<shot>.json). */
export interface ShotSpec {
    version?: number;
    id: string;
    template: string;
    tier?: "auto" | 1 | 2 | "1" | "2";
    engine?: string;
    duration?: number;
    fps?: number;
    width?: number;
    height?: number;
    quality?: string;
    look?: string;
    params?: Params;
    camera?: CameraSpec;
    lighting?: LightingSpec;
    motion_blur?: boolean | number;
    transparent?: boolean;
    needs?: string[];
    seed?: number;
    beat?: string;
    palette?: Palette;
    font?: string;
    bloom?: boolean | string;
    bloom_strength?: number;
    exposure?: number;
    samples?: number;
    view_transform?: string;
}
/** What newSpec writes: a spec with every section filled in. */
export interface NewShotSpec extends ShotSpec {
    params: Params;
    camera: CameraSpec;
    lighting: LightingSpec;
}
/** A Tier 2 template: defaults for a new spec. */
export interface TemplateDef {
    summary: string;
    tier1: string;
    duration: number;
    params: Params;
    camera: CameraSpec;
    lighting: LightingSpec;
}
export declare const DEFAULT_LOOK: Look & {
    palette: Palette;
};
/** look.json motion.character -> reveal and camera eases (Blender interpolation names). */
export declare const MOTION: Record<string, {
    reveal: string;
    camera: string;
    stagger: number;
    letter: number;
}>;
export declare const EASES: string[];
export declare const CAMERA_MOVES: string[];
export declare const MATERIALS: string[];
export declare const RIGS: string[];
export declare const COLOR_TOKENS: string[];
/**
 * Tier 2 (Blender) templates. `tier1` names the closest Three.js template for fallbacks.
 * `params` are defaults; colour fields may be palette tokens ("accent") or "#RRGGBB".
 */
export declare const TEMPLATES: Record<string, TemplateDef>;
/** Templates that draw text, so they need the look's display font (others never load a font). */
export declare const TEXT_TEMPLATES: Record<number, string[]>;
export declare const usesText: (template: string, tier: number) => boolean;
/** Tier 1 (Three.js) templates. */
export declare const TIER1_TEMPLATES: Record<string, string>;
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
/** Validate a spec. Returns a list of plain-language problems (empty = fine). */
export declare function validateSpec(spec: ShotSpec): string[];
/** Read look.json (or null). */
export declare function readLook(path: string | null | undefined): Look | null;
/** Replace palette tokens ("accent") with hex colours, deeply. */
export declare function resolveColors<T>(value: T, palette: Palette): T;
/** The spec fields that decide the render engine. */
export interface EngineChoice {
    engine?: string;
    needs?: string[];
    params?: Params;
}
/** Engine choice: "auto" picks Cycles for glass/realism, EEVEE otherwise. */
export declare function pickEngine(spec: EngineChoice): "CYCLES" | "BLENDER_EEVEE";
export declare function materialPresets(spec: {
    params?: Params;
}): (string | undefined)[];
export declare function needsCycles(spec: EngineChoice): boolean;
/** Frames for a duration at fps (at least 1). */
export declare function frameCount(duration: number, fps: number): number;
/** Pick 3-5 still frames spread over the shot: first motion, middle beats, the final hold. */
export declare function stillFrames(frames: number, count?: number): number[];
/**
 * The resolved spec the Blender script reads: look merged in, colours as hex, absolute paths,
 * eases from the motion character, frames counted, engine chosen.
 */
export declare function resolveSpec(spec: ShotSpec, { projectDir, look, fontPath }?: {
    projectDir?: string;
    look?: Look | null;
    fontPath?: string | null;
}): {
    version: number;
    id: string;
    template: string;
    engine: "BLENDER_EEVEE" | "CYCLES";
    width: number;
    height: number;
    fps: number;
    duration: number;
    frames: number;
    quality: string;
    seed: number;
    palette: Palette;
    font: string;
    params: Params;
    camera: CameraSpec;
    lighting: LightingSpec;
    motion_blur: {
        enabled: boolean;
        shutter: number;
    };
    transparent: boolean;
    view_transform: string;
    exposure: number;
    samples?: number | undefined;
};
export type ResolvedSpec = ReturnType<typeof resolveSpec>;
