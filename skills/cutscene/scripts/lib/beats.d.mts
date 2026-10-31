// Built from src/skills/cutscene/scripts/lib/beats.mts by `npm run build`. Edit that file, not this one.
export declare const BEATS_VERSION = 1;
export declare const FORMATS: string[];
/** One word of a voice line, with its timing. */
export interface BeatWord {
    w: string;
    start: number;
    end: number;
    /** confidence, 0 to 1 */
    p?: number;
    [key: string]: unknown;
}
export interface BeatVoice {
    speaker?: string;
    line?: string;
    file?: string;
    duration?: number;
    verified?: boolean;
    words?: BeatWord[];
    [key: string]: unknown;
}
export interface BeatShot3d {
    /** 1 (Three.js). An older beat sheet may say 2 (Blender, now removed); it still validates, with a warning. */
    tier?: 1 | 2;
    spec?: string;
    file?: string;
    duration?: number;
    [key: string]: unknown;
}
export interface BeatSfx {
    at?: number;
    name?: string;
    [key: string]: unknown;
}
export interface Beat {
    id: string;
    start: number;
    end: number;
    label?: string;
    voice?: BeatVoice;
    shot3d?: BeatShot3d;
    graphics?: Record<string, unknown>[];
    sfx?: BeatSfx[];
    [key: string]: unknown;
}
export interface BeatSheet {
    version: number;
    fps: number;
    width: number;
    height: number;
    format?: string;
    duration?: number;
    voices?: Record<string, {
        reference?: string;
        [key: string]: unknown;
    }>;
    beats: Beat[];
    [key: string]: unknown;
}
/** A problem found by `validateBeats`, at a field path such as `beats[0].end`. */
export interface BeatIssue {
    path: string;
    message: string;
}
export interface BeatsValidation {
    ok: boolean;
    errors: BeatIssue[];
    warnings: BeatIssue[];
}
/** A JSON value in the text: its kind and where it starts and ends. */
export interface StringNode {
    type: "string";
    start: number;
    end: number;
}
export interface LiteralNode {
    type: "literal";
    start: number;
    end: number;
}
export interface ObjectNode {
    type: "object";
    start: number;
    end: number;
    members: ObjectMember[];
}
export interface ArrayNode {
    type: "array";
    start: number;
    end: number;
    items: SpanNode[];
}
/** One `"key": value` of an object, with where its key starts. */
export interface ObjectMember {
    key: string;
    keyStart: number;
    value: SpanNode;
}
export type SpanNode = StringNode | LiteralNode | ObjectNode | ArrayNode;
/** `<project>/.cutscene/beats.json` */
export declare function beatsPath(projectDir: string): string;
/**
 * Check a beat sheet object against contracts §7. Never throws.
 */
export declare function validateBeats(obj: unknown): BeatsValidation;
/** Read and parse a beat sheet. Throws BEATS_NOT_FOUND or BEATS_INVALID_JSON. Does not validate. */
export declare function readBeats(file: string): BeatSheet;
/** Write a whole beat sheet (for the storyboard step that creates it). Validates first. */
export declare function writeBeats(file: string, obj: BeatSheet): BeatSheet;
/**
 * Merge `patch` into the beat with this id and save. Everything else stays byte for byte.
 * Returns the updated sheet. Throws BEAT_NOT_FOUND, BEATS_INVALID (nothing is written), ...
 * @param patch JSON merge patch for the beat
 */
export declare function updateBeat(file: string, id: string, patch: Record<string, unknown>): BeatSheet;
/**
 * Merge `patch` into the top level of the sheet (for example `voices` or `duration`) and save.
 * Everything else stays byte for byte. Returns the updated sheet.
 */
export declare function updateBeatSheet(file: string, patch: Record<string, unknown>): BeatSheet;
/** Parse JSON text into a tree of nodes with their character spans. */
export declare function parseSpans(text: string): SpanNode;
/**
 * Apply a merge patch to the object at `node` by editing only the text that changes.
 * Returns the new text, or null when the result can't be verified (caller re-serializes).
 */
export declare function spliceMergePatch(text: string, node: ObjectNode, current: Record<string, unknown>, patch: Record<string, unknown>): string | null;
