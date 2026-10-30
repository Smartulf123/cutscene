#!/usr/bin/env node
/** Where a source file is built to. */
export declare function outputFor(src: string): string;
/** The first line of a built file (after a shebang, if any). */
export declare function headerFor(src: string): string;
/** Puts the header in, right after a shebang line when there is one. */
export declare function withHeader(code: string, header: string): string;
