export declare const STRENGTHS: Record<"light" | "normal" | "strong", number>;
/** Notch hum at the 50 and 60 Hz families; speech above 80 Hz stays. */
export declare function humFilters(): string[];
/**
 * The filter chain. `floor` is the measured noise floor in dBFS.
 */
export declare function cleanupFilter(o: {
    hum: boolean;
    noise: boolean;
    strength: "light" | "normal" | "strong";
}, floor?: number): string;
