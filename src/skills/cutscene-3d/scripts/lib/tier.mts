// Every 3D shot is Tier 1: Three.js inside the video. Blender (Tier 2) was removed, so a spec that
// asks for it (an old spec, or an agent that still remembers it) gets a clear TIER2_REMOVED error
// instead of a crash, and settings only Blender read are ignored with one warning.
import { cutsceneError } from "./project.mjs";
import type { CutsceneError } from "./project.mjs";
import { TEMPLATES } from "./spec.mjs";
import type { ShotSpec } from "./spec.mjs";

/** The error code for anything that needs Blender. */
export const TIER2_REMOVED = "TIER2_REMOVED";

/** Templates that only Blender made, and the Three.js template closest to each. */
export const REMOVED_TEMPLATES: Record<string, string> = { "product-shot": "turntable", "physics-drop": "title3d" };

/** Old Blender render engines a spec may name. */
export const BLENDER_ENGINES = ["cycles", "eevee"];

/** `needs` only Blender could meet, in plain words. */
export const BLENDER_ONLY_NEEDS: Record<string, string> = {
  glass: "ray-traced glass",
  liquid: "liquids",
  subsurface: "subsurface scattering",
  physics: "physics",
  simulation: "simulation",
  character: "character rigs",
  rig: "rigs",
  photoreal: "photoreal lighting",
  caustics: "caustics",
  blender: "Blender",
};

/** Spec fields only Blender read. Tier 1 ignores them (with one warning). */
export const BLENDER_ONLY_FIELDS = ["engine", "quality", "samples", "view_transform", "motion_blur", "camera", "lighting.rig", "lighting.hdri"];

const lower = (v: unknown) => String(v).toLowerCase().trim();

/** The `needs` in a spec that only Blender could meet. */
export function blenderNeeds(spec: Pick<ShotSpec, "needs">): string[] {
  return Array.isArray(spec.needs) ? [...new Set(spec.needs.map(lower).filter((n) => BLENDER_ONLY_NEEDS[n]))] : [];
}

/** Why a spec needs Blender, in plain words (empty = it can be made in Tier 1). Pure. */
export function tier2Reasons(spec: ShotSpec | null | undefined): string[] {
  if (!spec || typeof spec !== "object") return [];
  const reasons: string[] = [];
  if (spec.tier === 2 || spec.tier === "2") reasons.push('it asks for "tier": 2');
  if (typeof spec.engine === "string" && BLENDER_ENGINES.includes(lower(spec.engine))) reasons.push(`it asks for Blender's "${spec.engine}" engine`);
  if (REMOVED_TEMPLATES[spec.template]) reasons.push(`"${spec.template}" was a Blender template`);
  const needs = blenderNeeds(spec);
  if (needs.length) reasons.push(`it needs ${needs.map((n) => BLENDER_ONLY_NEEDS[n]).join(", ")}`);
  return reasons;
}

/** The TIER2_REMOVED error for a spec (or, without one, for a request that needs Blender). */
export function tier2Error(reasons: string[], spec?: Partial<ShotSpec> | null): CutsceneError {
  const steps: string[] = [];
  const replacement = spec?.template ? REMOVED_TEMPLATES[spec.template] : undefined;
  if (replacement) steps.push(`use the "${replacement}" template (\`cutscene 3d new ${replacement}\`)`);
  if (spec) {
    const needs = blenderNeeds(spec);
    const drop = [
      ...(typeof spec.engine === "string" && BLENDER_ENGINES.includes(lower(spec.engine)) ? ['"engine"'] : []),
      ...(needs.length ? [`"${needs.join('", "')}" from "needs"`] : []),
    ];
    const edits = [
      ...(spec.tier === 2 || spec.tier === "2" ? ['set "tier": 1'] : []),
      ...(drop.length ? [`remove ${drop.join(" and ")}`] : []),
    ];
    if (edits.length) steps.push(`in the spec, ${edits.join(" and ")}`);
  }
  const how = steps.length ? `Make it with Tier 1 (Three.js) instead: ${steps.join(", then ")}.` : "Make the shot with Tier 1 (Three.js) instead: `cutscene 3d new <template>`, then `cutscene 3d tier1`.";
  const e = cutsceneError(
    TIER2_REMOVED,
    `Blender (Tier 2) was removed from Cutscene, so this can't be made as it is${reasons.length ? `: ${reasons.join("; ")}` : ""}.`,
    `${how} Or, if the shot is already rendered as a video file, add that file as a normal clip.`,
  );
  e.details = { reasons, tier1Template: replacement || spec?.template || null };
  return e;
}

/** Commands that only drove Blender. */
export const REMOVED_COMMANDS = ["stills", "render", "encode", "setup"];

/** The TIER2_REMOVED error for a command that only drove Blender (`cutscene 3d stills`, ...). */
export function removedCommandError(cmd: string): CutsceneError {
  const e = cutsceneError(
    TIER2_REMOVED,
    `"cutscene 3d ${cmd}" was part of Blender (Tier 2), which was removed from Cutscene.`,
    "Make the shot with Tier 1 (Three.js) instead: `cutscene 3d new <template>`, then `cutscene 3d tier1 <template> --spec <spec>`. Or, if the shot is already rendered as a video file, add that file as a normal clip.",
  );
  e.details = { command: cmd };
  return e;
}

/** Throw TIER2_REMOVED when the spec needs Blender. */
export function refuseTier2(spec: ShotSpec): void {
  const reasons = tier2Reasons(spec);
  if (reasons.length) throw tier2Error(reasons, spec);
}

/** The Blender-only fields a spec still has (as "camera", "lighting.rig", ...). Pure. */
export function ignoredFields(spec: ShotSpec | null | undefined): string[] {
  if (!spec || typeof spec !== "object") return [];
  const lighting = spec.lighting && typeof spec.lighting === "object" ? (spec.lighting as Record<string, unknown>) : {};
  return BLENDER_ONLY_FIELDS.filter((f) => (f.startsWith("lighting.") ? lighting[f.slice(9)] !== undefined : spec[f] !== undefined));
}

/** One warning about the Blender-only fields a spec still has, or null. */
export function ignoredWarning(spec: ShotSpec | null | undefined): string | null {
  const fields = ignoredFields(spec);
  return fields.length ? `This spec has settings only Blender used (${fields.join(", ")}); Tier 1 ignores them.` : null;
}

/** What `cutscene 3d plan` reports: always Tier 1. Throws TIER2_REMOVED for a Blender spec. */
export function decideTier(spec: ShotSpec) {
  refuseTier2(spec);
  const warnings: string[] = [];
  const note = ignoredWarning(spec);
  if (note) warnings.push(note);
  const reasons = [
    TEMPLATES[spec.template] ? `"${spec.template}" is a Three.js template` : `"${spec.template}" isn't a 3D template`,
    "every 3D shot is Three.js inside the video: it renders with the rest of the frame, with nothing to install",
  ];
  return { tier: 1 as const, template: spec.template, reasons, warnings };
}
