// Built from src/skills/cutscene-3d/scripts/lib/tier.mts by `npm run build`. Edit that file, not this one.
import type { CutsceneError } from "./project.mjs";
import type { ShotSpec } from "./spec.mjs";
/** The error code for anything that needs Blender. */
export declare const TIER2_REMOVED = "TIER2_REMOVED";
/** Templates that only Blender made, and the Three.js template closest to each. */
export declare const REMOVED_TEMPLATES: Record<string, string>;
/** Old Blender render engines a spec may name. */
export declare const BLENDER_ENGINES: string[];
/** `needs` only Blender could meet, in plain words. */
export declare const BLENDER_ONLY_NEEDS: Record<string, string>;
/** Spec fields only Blender read. Tier 1 ignores them (with one warning). */
export declare const BLENDER_ONLY_FIELDS: string[];
/** The `needs` in a spec that only Blender could meet. */
export declare function blenderNeeds(spec: Pick<ShotSpec, "needs">): string[];
/** Why a spec needs Blender, in plain words (empty = it can be made in Tier 1). Pure. */
export declare function tier2Reasons(spec: ShotSpec | null | undefined): string[];
/** The TIER2_REMOVED error for a spec (or, without one, for a request that needs Blender). */
export declare function tier2Error(reasons: string[], spec?: Partial<ShotSpec> | null): CutsceneError;
/** Commands that only drove Blender. */
export declare const REMOVED_COMMANDS: string[];
/** The TIER2_REMOVED error for a command that only drove Blender (`cutscene 3d stills`, ...). */
export declare function removedCommandError(cmd: string): CutsceneError;
/** Throw TIER2_REMOVED when the spec needs Blender. */
export declare function refuseTier2(spec: ShotSpec): void;
/** The Blender-only fields a spec still has (as "camera", "lighting.rig", ...). Pure. */
export declare function ignoredFields(spec: ShotSpec | null | undefined): string[];
/** One warning about the Blender-only fields a spec still has, or null. */
export declare function ignoredWarning(spec: ShotSpec | null | undefined): string | null;
/** What `cutscene 3d plan` reports: always Tier 1. Throws TIER2_REMOVED for a Blender spec. */
export declare function decideTier(spec: ShotSpec): {
    tier: 1;
    template: string;
    reasons: string[];
    warnings: string[];
};
