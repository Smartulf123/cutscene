#!/usr/bin/env node
// Built from src/overlays/cutscene-design/scripts/look.mts by `npm run build`. Edit that file, not this one.
/** A colour palette: four hex colours. */
export interface Palette {
    bg: string;
    fg: string;
    accent: string;
    accent2: string;
}
export interface LookFont {
    family: string;
    weight: number;
    /** A font file in the project, for fonts the engine doesn't resolve by itself. */
    src?: string;
}
/** .cutscene/look.json */
export interface Look {
    version: number;
    name: string;
    palette: Palette;
    type: {
        display: LookFont;
        body: LookFont;
    };
    motion: {
        character: string;
        ease: string;
        duration_scale: number;
    };
    texture?: {
        grain?: number;
        vignette?: number;
    };
    source?: string;
    seed?: number;
}
/** What --brand gives, after readBrand: hex colours and font names, or null. */
export interface Brand {
    name: string | null;
    display: string | null;
    body: string | null;
    motion: string | null;
    primary: string | null;
    secondary: string | null;
    background: string | null;
    text: string | null;
}
export interface MotionCharacter {
    ease: string;
    exit: string;
    duration_scale: number;
    enter: number;
    stagger: number;
    grain: [number, number];
    vignette: [number, number];
}
/** [display, displayWeight, body, bodyWeight, affinities] */
export type Pairing = [string, number, string, number, string[]];
/** A pinned .woff for 3D titles (cutscene-3d/assets/manifest.json). */
export interface FontPin {
    kind: string;
    name: string;
    family: string;
    weight: number;
    url: string;
    sha256: string;
    size: number;
    license: string;
}
/** An earlier project's look. */
export interface PreviousLook {
    project: string;
    path: string;
    mtime: number;
    look: Look;
}
export interface LookDiff {
    score: number;
    parts: {
        palette: number;
        type: number;
        motion: number;
        texture: number;
    };
}
export interface LookCheck {
    ok: boolean;
    errors: string[];
    warnings: string[];
    info: {
        contrast?: {
            fg_bg: number;
            accent_bg: number;
            accent2_bg: number;
            fg_on_accent: number;
            bg_on_accent: number;
        };
        textOnAccent?: string;
    };
}
type Rng = () => number;
export declare const CHARACTERS: string[];
export declare const DEFAULT_THRESHOLD = 0.3;
export declare const MOTION: Record<string, MotionCharacter>;
export declare const ENGINE_FONTS: string[];
export declare const BUNDLED_FONTS: Record<string, {
    slug: string;
    weights: number[];
}>;
export declare const GENERIC_DISPLAY: string[];
export declare const PAIRINGS: Pairing[];
export declare function seedFromText(text: unknown): number;
export declare function rng(seed: unknown): Rng;
export declare function parseHex(hex: unknown): number[] | null;
export declare const toHex: (rgb: number[]) => string;
export declare function luminance(hex: string): number;
export declare function contrast(a: string, b: string): number;
export declare function hslToHex(h: number, s: number, l: number): string;
export declare function hexToHsl(hex: string): [number, number, number];
export declare function deltaE(a: string, b: string): number;
/** Move `hex`'s lightness away from `bg` until contrast >= min (keeps hue). */
export declare function ensureContrast(hex: string, bg: string, min: number): string;
export declare function moodScores(text: unknown): Record<string, number>;
export declare function readBrand(arg: unknown): Brand | null;
export declare const TONES: string[];
/** Which tone a background colour is. */
export declare function toneOf(bg: string): string;
export declare function hueHints(text: unknown): [number, number][];
/** Build a look from brief text + seed (+ optional brand). Pure and deterministic. */
export declare function generateLook({ briefText, seed, brand }?: {
    briefText?: string;
    seed?: number;
    brand?: Brand | null;
}): Look;
/** look.json as read from disk: any part may be missing; validateLook says what is wrong. */
export type LookInput = Partial<Look>;
export declare function validateLook(look: LookInput, { projectDir }?: {
    projectDir?: string | null;
}): LookCheck;
export declare function diffLooks(a: Look, b: Look): LookDiff;
export declare function lookPathOf(target: string): string;
export declare function projectOfLook(lookPath: string): string;
export declare function readLook(target: string): {
    path: string;
    look: Look;
};
/** Previous projects' looks under dir (each <dir>/<project>/.cutscene/look.json), newest first. */
export declare function previousLooks(dir: string, { exclude, last }?: {
    exclude?: string | null;
    last?: number;
}): PreviousLook[];
export interface CompareRow extends LookDiff {
    project: string;
    name: string | null;
}
export declare function compareAgainst(look: Look, previous: PreviousLook[], threshold?: number): {
    rows: CompareRow[];
    tooSimilar: CompareRow[];
    closest: CompareRow | null;
};
export declare function fontPin3d(family: unknown, weight?: number): FontPin | null;
/**
 * Make the display font ready for 3D titles, or say up front what they will do.
 * Copies the pinned .woff into assets/fonts/ when it is already on this computer.
 */
export declare function prepare3dFont(look: Look, projectDir: string): {
    copied: string | null;
    note: string | null;
};
/** Where the CLI writes (tests pass their own). */
export interface CliIo {
    out: (s: string) => void;
    err: (s: string) => void;
}
export declare function runCli(argv: string[], io?: CliIo): number;
export {};
