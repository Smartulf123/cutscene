/** A Python to try, and where it was found. */
export interface PythonCandidate {
    python: string;
    source: string;
}
export interface PythonSearchOptions {
    home?: string;
    platform?: NodeJS.Platform;
}
/** Python executables worth trying, best first. */
export declare function pythonCandidates({ home, platform }?: PythonSearchOptions): PythonCandidate[];
/**
 * The first Python that can import kokoro_onnx, or null.
 */
export declare function findKokoroPython(opts?: PythonSearchOptions): PythonCandidate | null;
