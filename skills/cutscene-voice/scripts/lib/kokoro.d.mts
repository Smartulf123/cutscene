export declare function enginePin(env?: NodeJS.ProcessEnv): string | null;
/** How to reach the `cutscene` command: CUTSCENE_CLI from the dispatcher, else the CLI next to this skill. */
export declare function cutsceneCli(env?: NodeJS.ProcessEnv): string | null;
/** Where the engine keeps Kokoro's model after its first use (shared engine cache). */
export declare function kokoroCache(): {
    model: string;
    voices: string;
};
export declare function kokoroStatus(home?: string): {
    id: string;
    name: string;
    available: boolean;
    installed: boolean;
    engine_installed: boolean;
    model_cached: boolean;
    license: string;
    note: string;
};
/**
 * Speak a line with a Kokoro preset into `out` (WAV).
 * The text goes through a .txt file, never the command line, so it can't be read as options.
 */
export declare function kokoroSpeak({ text, out, voice, speed, home, yes }: {
    text: string;
    out: string;
    voice?: string;
    speed?: number;
    home?: string;
    yes?: boolean;
}): Promise<{
    seconds: number;
}>;
