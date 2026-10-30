// Built from src/skills/cutscene/scripts/lib/config.mts by `npm run build`. Edit that file, not this one.
/** Where the settings live: an explicit home folder, or the environment's CUTSCENE_HOME. */
export interface ConfigOptions {
    home?: string;
    env?: NodeJS.ProcessEnv;
}
/** Path of config.json for a home folder (default: CUTSCENE_HOME or ~/.cutscene). */
export declare function configPath({ home, env }?: ConfigOptions): string;
/**
 * JSON merge patch (RFC 7386): objects merge key by key, `null` deletes a key, anything
 * else (including arrays) replaces. Returns a new object; inputs are not changed.
 */
export declare function mergePatch(target: unknown, patch: unknown): unknown;
/**
 * Read the user's settings. Returns `{}` when config.json doesn't exist yet.
 */
export declare function readConfig(opts?: ConfigOptions): Record<string, unknown>;
/**
 * Merge `patch` into the settings and save them atomically. Returns the new settings.
 */
export declare function writeConfig(patch: Record<string, unknown>, opts?: ConfigOptions): Record<string, unknown>;
