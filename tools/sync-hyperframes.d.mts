#!/usr/bin/env node
// Built from src/tools/sync-hyperframes.mts by `npm run build`. Edit that file, not this one.
/** Globs or a single glob, as the map writes them. */
type Globs = string | string[];
/** One upstream skill folder that feeds a target. */
export interface SyncSource {
    from: string;
    prefix?: string;
    /** "body": the upstream SKILL.md becomes the target's SKILL.md body; a path: it becomes that guide. */
    skillMd?: string;
    kept?: string;
    include?: string[];
    exclude?: string[];
    rename?: Record<string, string>;
}
/** One generated Cutscene folder. */
export interface SyncTarget {
    dir: string;
    name: string;
    description: string;
    skillMd?: boolean;
    runNote?: boolean;
    sources: SyncSource[];
}
export interface RewriteRule {
    find: string;
    replace: string;
    flags?: string;
    file?: Globs;
}
export interface SyncRewrite {
    skillNames: Record<string, string>;
    slashOnlyNames: string[];
    notInV1Text: string;
    cliCommands: string[];
    blockedCommands: string[];
    engineApi: string[];
    beforeNames?: RewriteRule[];
    prose: RewriteRule[];
    code?: RewriteRule[];
}
export interface SyncPatch {
    file: Globs;
    find?: string;
    regex?: string;
    flags?: string;
    replace: string;
    stage?: "before" | "after";
    optional?: boolean;
}
export interface DropSection {
    file: Globs;
    heading: Globs;
}
export interface DropBlock {
    file?: Globs;
    start: string;
    end: string;
    keepEnd?: boolean;
    inclusiveEnd?: boolean;
    sameLine?: boolean;
    optional?: boolean;
}
export interface DropLine {
    file?: Globs;
    match: Globs;
    flags?: string;
}
export interface MoveSection {
    target: string;
    heading: string;
    to: string;
    summary: string;
    file?: Globs;
}
export interface SyncUpstream {
    repo: string;
    tag: string;
    commit: string;
    version: string;
    extract?: string[];
}
/** The shape of tools/sync-map.json. */
export interface SyncMap {
    upstream: SyncUpstream;
    headers: {
        markdown: string;
        code: string;
        hash: string;
        html: string;
        css: string;
    };
    runNote: string;
    exclude?: string[];
    excludeUpstream?: string[];
    verbatim?: string[];
    targets: Record<string, SyncTarget>;
    linkTargets?: Record<string, string>;
    rewrite: SyncRewrite;
    patches?: SyncPatch[];
    dropSections?: DropSection[];
    dropBlocks?: DropBlock[];
    dropLines?: DropLine[];
    moveSections?: MoveSection[];
    residue: {
        markdown: string[];
        code: string[];
        allow?: string[];
        skipFiles?: string[];
    };
    thirdParty: {
        intro: string;
        notSynced?: {
            from: string;
            why: string;
        }[];
        bundled: {
            files: Globs;
            origin: string;
            license: string;
            notes?: string;
        }[];
        runtime?: string[];
        ideasOnly?: string[];
    };
}
/** One file in tools/sync-lock.json. A generated SKILL.md lists every source it was made from. */
export interface LockEntry {
    from: string | string[];
    sourceSha256?: string | string[];
    sha256?: string;
}
export interface LockJson {
    note: string;
    upstream: {
        repo: string;
        tag: string;
        commit: string;
    };
    enginePin: string;
    files: Record<string, LockEntry>;
}
export interface SyncOptions {
    check?: boolean;
    strict?: boolean;
    json?: boolean;
    quiet?: boolean;
    source?: string;
    cache?: string;
    help?: boolean;
    bad?: string;
    mapPath?: string;
    repoRoot?: string;
}
export interface Residue {
    file: string;
    line: number;
    match: string;
    text: string;
}
export interface BrokenLink {
    file: string;
    line: number;
    href: string;
}
export interface MissingDep {
    file: string;
    spec: string;
    target: string;
    external: boolean;
}
export interface BuildResult {
    map: SyncMap;
    plan: Map<string, Buffer>;
    lockBuf: Buffer;
    lockJson: LockJson;
    ownedDirs: string[];
    problems: string[];
    residue: Residue[];
    links: BrokenLink[];
    deps: MissingDep[];
    repoRoot: string;
}
export declare const REPO_ROOT: string;
export declare function matchGlob(path: string, glob: string): boolean;
/** One entry of a tar archive. */
export interface TarEntry {
    path: string;
    type: string;
    data: Buffer;
}
/**
 * Stream a .tar.gz and call onEntry({path, type, data}) for every entry.
 * Handles ustar prefixes and pax ('x' per-entry, 'g' global) headers.
 * Returns { globalPax }.
 */
export declare function readTarGz(file: string, onEntry: (entry: TarEntry) => void): Promise<{
    globalPax: Record<string, string>;
}>;
/**
 * Move one section (a heading and everything under it) out of a SKILL.md body into a reference
 * file, leaving the heading and a short summary behind. Used to keep SKILL.md under ~500 lines.
 * Returns {text, moved} or null when the heading isn't there (upstream drift; the caller fails).
 */
export declare function moveSectionOut(text: string, { heading, to, summary }: {
    heading: string;
    to: string;
    summary: string;
}): {
    text: string;
    moved: string;
} | null;
export declare const debugDrops: () => string[] | null;
export declare function residueScan(files: Map<string, Buffer>, map: SyncMap): Residue[];
export declare function linkScan(files: Map<string, Buffer>, repoRoot?: string): BrokenLink[];
export declare function scriptDepScan(files: Map<string, Buffer>, repoRoot?: string, ownedDirs?: string[]): MissingDep[];
export declare function build(opts?: SyncOptions): Promise<BuildResult>;
export declare function diffTree(result: BuildResult): {
    changed: string[];
    missing: string[];
    extra: string[];
};
export declare function writeTree(result: BuildResult): {
    written: number;
    removed: number;
};
export interface UpstreamChanges {
    fromCommit: string | undefined;
    toCommit: string;
    changed: string[];
    added: string[];
    removed: string[];
}
export declare function upstreamChanges(result: BuildResult): UpstreamChanges | null;
export declare function sizeReport(result: BuildResult): Record<string, {
    dir: string;
    files: number;
    bytes: number;
}>;
export {};
