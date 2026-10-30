#!/usr/bin/env node
// Built from src/tools/build.mts by `npm run build`. Edit that file, not this one.
/** Where a source file is built to. */
export declare function outputFor(src: string): string;
/** Where a source file's declaration file is written. */
export declare function declarationFor(src: string): string;
/** The first line of a built file (after a shebang, if any). */
export declare function headerFor(src: string): string;
/** Puts the header in, right after a shebang line when there is one. */
export declare function withHeader(code: string, header: string): string;
