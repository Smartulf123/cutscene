import type { BinaryLike } from "node:crypto";
/** One pinned download in assets/manifest.json. */
export interface ManifestItem {
    name: string;
    url: string;
    sha256: string;
    size: number;
    license: string;
    source: string;
    credit?: string;
    kind?: string;
    family?: string;
    weight?: number;
    version?: string;
    [key: string]: unknown;
}
/** A pinned font (kind "font"): always has a Fontsource family slug and a weight. */
export interface FontItem extends ManifestItem {
    family: string;
    weight: number;
}
/** assets/manifest.json. */
export interface Manifest {
    downloads: ManifestItem[];
    runtime?: unknown;
    [key: string]: unknown;
}
/** The parts of fetch() fetchAsset uses (tests pass a fake). */
export type FetchLike = (url: string) => Promise<{
    ok: boolean;
    status?: number;
    arrayBuffer(): Promise<ArrayBuffer>;
}>;
/** Which font file a shot uses, and what is missing when it falls back. */
export interface FontChoice {
    path: string;
    source: string;
    family: string;
    wanted?: string;
    missing?: string | null;
    unreadable?: string | null;
}
/** What fontFallbackWarning reads: a FontChoice, or a font chosen another way. */
export interface FontNote {
    path?: string | null;
    source?: string;
    family?: string;
    wanted?: string;
    missing?: string | null;
    unreadable?: string | null;
}
export declare const MANIFEST_PATH: string;
export declare function loadManifest(path?: string): Manifest;
export declare function sha256(buf: BinaryLike): string;
export declare function assetPath(item: {
    sha256: string;
    url: string;
}, home?: string): string;
export declare function isCached(item: {
    sha256: string;
    url: string;
}, home?: string): boolean;
export declare function findItem(name: string, manifest?: Manifest): ManifestItem | null;
/** What a download would fetch (printed before asking for consent). */
export declare function describe(item: ManifestItem): {
    name: string;
    size: number;
    license: string;
    source: string;
    url: string;
    credit: string | undefined;
};
/** Download a pinned item. Without `yes`, throws NEEDS_CONSENT describing it. */
export declare function fetchAsset(item: ManifestItem, { yes, home, fetchImpl }?: {
    yes?: boolean;
    home?: string;
    fetchImpl?: FetchLike;
}): Promise<{
    path: string;
    cached: boolean;
}>;
/** "Space Grotesk" -> "space-grotesk" (Fontsource slug). */
export declare function fontSlug(family: string | null | undefined): string;
/** The pinned font for a family and weight (nearest weight available). */
export declare function fontItemFor(family: string, weight?: number, manifest?: Manifest): FontItem | null;
export declare const FONT_FORMATS: Record<number, string[]>;
/** Score a font file name against a family + weight ("SpaceGrotesk-Bold.ttf", "space-grotesk-latin-700-normal.woff2"). */
export declare function scoreFontFile(file: string, family: string, weight?: number): number;
/**
 * Find the display font for a look: the look's own file (type.display.src) and project fonts ->
 * pinned download in the cache -> system fonts -> the bundled Geist Bold. Only formats the tier
 * can read are used (FONT_FORMATS). Returns {path, source, family}; on a fallback also
 * {wanted, missing: pinned manifest item name or null, unreadable: a project file the tier can't
 * read (a .woff2 for Tier 1) or null}.
 */
export declare function resolveFont({ family, weight, projectDir, src, tier, home, manifest, systemDirs }?: {
    family?: string;
    weight?: number;
    projectDir?: string;
    src?: string | null;
    tier?: number;
    home?: string;
    manifest?: Manifest;
    systemDirs?: string[];
}): FontChoice;
/** One plain sentence about a font fallback (or null when the look's font is used). */
export declare function fontFallbackWarning(font: FontNote | null | undefined, tier?: number): string | null;
/** Copy a file into a folder, returning the new path. */
export declare function copyInto(file: string, dir: string, name?: string): string;
