#!/usr/bin/env node
// Built from src/tools/check-pin-ages.mts by `npm run build`. Edit that file, not this one.
export declare const MIN_DAYS = 14;
/** One download in a skill's assets/manifest.json (fields as documented above). */
export interface ManifestEntry {
    name?: string;
    version?: string | number;
    url?: string;
    source?: string;
    repo?: string;
    tag?: string;
    published?: string;
    released?: string;
    published_at?: string;
    date?: string;
    [key: string]: unknown;
}
export type PinKind = "npm" | "pypi" | "huggingface" | "github" | "url" | "invalid";
/** Where a pin's release date can be looked up. */
export interface Registry {
    kind: PinKind;
    package?: string;
    repo?: string;
    type?: string;
    revision?: string;
    tag?: string | number;
}
/** One pinned version found in the repo. */
export interface Pin extends Registry {
    name: string;
    version: string;
    file: string;
    url?: string;
    recorded?: string | null;
    problem?: string;
}
export type PinStatus = "ok" | "too-new" | "unpinned" | "unknown" | "error" | "network";
export interface PinResult {
    kind: PinKind;
    name: string;
    version: string;
    file: string;
    status: PinStatus;
    message?: string;
    published?: string;
    from?: string | null;
    ageDays?: number;
    note?: string;
}
export interface PinReport {
    ok: boolean;
    minDays: number;
    offline: boolean;
    results: PinResult[];
    unchecked: number;
}
/** The part of fetch this script uses (tests pass a fake). */
export type FetchLike = (url: string, init: {
    headers: Record<string, string>;
    signal: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;
type Env = Record<string, string | undefined>;
/** True when a version string is a single exact version (no ranges, tags or wildcards). */
export declare function isExactVersion(v: unknown): boolean;
/** Kind of registry for a manifest entry, from its source and URL. */
export declare function classify(entry: ManifestEntry): Registry;
/** Every pin in the repo. */
export declare function collectPins(root: string): Pin[];
/** A lookup that failed because the registry couldn't be reached (not an answer about the pin). */
export declare class NetworkError extends Error {
    code: string;
    constructor(message: string);
}
export interface LookupOptions {
    fetchImpl?: FetchLike;
    env?: Env;
    npmCache?: Map<string, Promise<unknown>>;
    retryDelayMs?: number;
}
export declare function publishedDate(pin: Pin, { fetchImpl, env, npmCache, retryDelayMs }?: LookupOptions): Promise<string | null>;
/** Whole and fractional days between a date and now. */
export declare function ageDays(date: string | number | Date, now?: Date): number;
export interface CheckOptions {
    root?: string;
    offline?: boolean;
    strict?: boolean;
    minDays?: number;
    now?: Date;
    fetchImpl?: FetchLike;
    env?: Env;
    retryDelayMs?: number;
}
/**
 * Check every pin.
 */
export declare function checkPins({ root, offline, strict, minDays, now, fetchImpl, env, retryDelayMs }?: CheckOptions): Promise<PinReport>;
export {};
