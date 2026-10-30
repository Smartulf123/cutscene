/** Cutscene's own version. Kept in step with the plugin manifests (a test checks this). */
export declare const CUTSCENE_VERSION = "0.1.0";
/** skills/cutscene/scripts */
export declare const SCRIPTS_DIR: string;
/** skills/cutscene */
export declare const SKILL_DIR: string;
/** skills/ (the folder that holds cutscene, cutscene-3d, cutscene-voice, ...) */
export declare const SKILLS_ROOT: string;
/** Absolute path of the `cutscene` command (cli.mjs). */
export declare const CLI_PATH: string;
/** The engine pin file. */
export declare const ENGINE_JSON: string;
/**
 * The Cutscene home folder: `CUTSCENE_HOME` when set, otherwise `~/.cutscene`.
 */
export declare function cutsceneHome(env?: NodeJS.ProcessEnv): string;
/** Every well-known folder or file inside the Cutscene home. */
export declare function homePaths(home?: string): {
    home: string;
    config: string;
    engine: string;
    media: string;
    voice: string;
    assets: string;
    logs: string;
};
/** Folder the pinned engine is installed into: `<home>/engine/<pin>`. */
export declare function engineDir(pin: string, home?: string): string;
/** The parts `cutscene <part>` dispatches to. */
export declare const PARTS: string[];
/**
 * Entry script of a part: `skills/cutscene-<part>/scripts/<part>.mjs`, next to this skill.
 */
export declare function partScript(part: string, skillsRoot?: string): string;
/** The preview entry script (built by the preview owner). */
export declare function previewScript(scriptsDir?: string): string;
/** True for Windows/UNC network paths (`\\server\share`, `//server/share`), which Cutscene refuses. */
export declare function isNetworkPath(p: unknown): boolean;
/**
 * Resolve a user-given path against a base folder and refuse network paths.
 * @returns absolute path
 */
export declare function resolveUserPath(p: string, base?: string): string;
/** True when `child` is `parent` or inside it. */
export declare function isInside(child: string, parent: string): boolean;
/** True when a file or folder exists. */
export declare function exists(p: string): boolean;
