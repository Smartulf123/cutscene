import { EditError } from "./cli.mjs";
/** One pinned download in assets/manifest.json. */
export type Pin = {
    name: string;
    version: string;
    platform: string;
    file: string;
    url: string;
    sha256: string;
    size: number;
    license: string;
    source: string;
    published?: string;
    unpack?: string;
};
/** This computer's platform key, as used in the manifest. */
export declare function platformKey(p?: string, a?: string): string;
/** The pin for a tool on this platform, or null. */
export declare function pinFor(name: string, platform?: string): Pin | null;
export declare function sizeText(bytes: number): string;
/** Folder a pinned tool lives in. */
export declare function toolDir(pin: Pin): string;
/** The installed file (or unpacked folder) for a pin, or null. */
export declare function installedPath(pin: Pin): string | null;
/** The NEEDS_CONSENT error for a download (contracts §9). */
export declare function consentError(pin: Pin, why: string): EditError;
/**
 * Minimal tar reader (ustar, as npm packs): returns [{name, data}] for regular files.
 */
export declare function untar(buf: Buffer): {
    name: string;
    data: Buffer;
}[];
/**
 * Install a pinned tool if needed. Without consent, throws NEEDS_CONSENT.
 * @returns path to the installed file or folder
 */
export declare function ensureTool(name: string, o?: {
    yes?: boolean;
    why?: string;
}): Promise<string>;
/** Remove a broken install (used by tests and `install --reinstall`). */
export declare function removeTool(name: string): void;
