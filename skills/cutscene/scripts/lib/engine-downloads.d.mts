/** One download a command would make, for the consent message. */
export interface DownloadPlan {
    id: string;
    name: string;
    size: string;
    license: string;
    source: string;
    location: string;
}
/** The engine's model cache. */
export declare function engineCacheDir(home?: string): string;
/** The value of `--name value`, `--name=value` or a short alias in an argument list. */
export declare function optionValue(args: string[], names: string[]): string | undefined;
/**
 * The downloads an engine command would make on this computer, as consent plans
 * ({id, name, size, license, source, location}). Empty when everything is already cached or the
 * command downloads nothing.
 * @param args the engine arguments
 */
export declare function engineDownloadsFor(cmd: string, args: string[], { cacheDir }?: {
    cacheDir?: string;
}): DownloadPlan[];
/** The consent sentence for a list of plans. */
export declare function describeDownloads(plans: DownloadPlan[]): string;
