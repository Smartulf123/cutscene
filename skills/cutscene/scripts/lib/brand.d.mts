/** Remove terminal colour codes. */
export declare function stripAnsi(s: string): string;
/**
 * Rebrand one line of engine output. Returns null when the line should be dropped.
 * Colour codes are kept; only the visible text between them changes.
 */
export declare function rebrandLine(line: string): string | null;
/** Rebrand a block of text, line by line, dropping lines Cutscene doesn't show. */
export declare function rebrand(text: string): string;
/** A chunk of output: a Buffer from a child process, or a string. */
export interface TextChunk {
    toString(encoding: "utf8"): string;
}
/** What `createRebrandStream` returns. */
export interface RebrandStream {
    push(chunk: TextChunk): void;
    end: () => void;
}
/**
 * A streaming rebrander: feed it chunks, it writes whole lines (and `\r` progress updates) to
 * `write`. A partial line (a prompt waiting for input) is flushed after a short pause.
 */
export declare function createRebrandStream(write: (s: string) => void, { idleMs }?: {
    idleMs?: number;
}): RebrandStream;
