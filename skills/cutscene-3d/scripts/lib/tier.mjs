// Built from src/skills/cutscene-3d/scripts/lib/tier.mts by `npm run build`. Edit that file, not this one.
// Tier 1 (Three.js inside the video) vs Tier 2 (Blender) decision, and render-time estimates.
// The rule is written out in SKILL.md and references/tiers.md; this is the same rule as code.
import { TEMPLATES, TIER1_TEMPLATES, frameCount, materialPresets, pickEngine } from "./spec.mjs";
/** Needs that only Blender does well. */
export const HARD_TIER2 = {
    glass: "glass or transparent materials need ray-traced refraction (Blender Cycles)",
    liquid: "liquids need Blender",
    subsurface: "subsurface scattering (skin, wax, jade) needs Blender",
    physics: "physics and simulation need Blender's rigid bodies",
    simulation: "physics and simulation need Blender's rigid bodies",
    character: "characters and rigs beyond playing a glTF clip need Blender",
    rig: "characters and rigs beyond playing a glTF clip need Blender",
    photoreal: "photoreal lighting needs Blender",
    blender: "you asked for Blender",
};
export const SOFT_TIER2 = {
    procedural: "detailed procedural materials look best in Blender",
    caustics: "caustics need Blender Cycles",
};
/**
 * Measured on the reference PC (Intel i5-13420H, Intel UHD graphics, 24 GB, Blender 5.2.3),
 * seconds per frame at 1920x1080. Updated from real renders: see references/tiers.md.
 */
export const BENCH = {
    machine: "i5-13420H + Intel UHD, Blender 5.2.3",
    startup: 9, // Blender boot + scene build
    eeveeFirstFrame: 12, // EEVEE shader compile in a fresh process (35 s the very first time)
    perFrame: {
        // measured 2026-10-30: title3d EEVEE 32 spp 3.6 s; Cycles 64 spp: title 38 s, glass product 91 s
        BLENDER_EEVEE: { draft: 2.0, final: 3.7 },
        CYCLES: { draft: 45, final: 90 },
    },
    physicsBakePerFrame: 0.02,
    encodePerFrame: 0.12,
};
function needsOf(spec) {
    const out = new Set((spec.needs || []).map((n) => String(n).toLowerCase().trim()));
    const presets = materialPresets(spec);
    if (presets.includes("glass"))
        out.add("glass");
    if (presets.includes("noise") || presets.includes("wave"))
        out.add("procedural");
    if (spec.template === "physics-drop")
        out.add("physics");
    return out;
}
/**
 * Decide the tier for a spec.
 */
export function decideTier(spec, { blender = undefined, deadline = false } = {}) {
    const reasons = [];
    const warnings = [];
    const needs = needsOf(spec);
    const hard = [...needs].filter((n) => HARD_TIER2[n]);
    const soft = [...needs].filter((n) => SOFT_TIER2[n]);
    const duration = Number(spec.duration) || TEMPLATES[spec.template]?.duration || 3;
    const has1 = Boolean(TIER1_TEMPLATES[spec.template]);
    const has2 = Boolean(TEMPLATES[spec.template]);
    const forced = spec.tier === 1 || spec.tier === "1" ? 1 : spec.tier === 2 || spec.tier === "2" ? 2 : null;
    let tier;
    if (forced) {
        tier = forced;
        reasons.push(`the spec asks for Tier ${forced}`);
    }
    else if (!has2) {
        tier = 1;
        reasons.push(`"${spec.template}" is a Three.js template`);
    }
    else if (!has1 && spec.template === "physics-drop") {
        tier = 2;
        reasons.push(HARD_TIER2.physics);
    }
    else if (hard.length) {
        tier = 2;
        for (const n of hard)
            reasons.push(HARD_TIER2[n]);
    }
    else if (soft.length && duration <= 10 && !deadline) {
        tier = 2;
        for (const n of soft)
            reasons.push(SOFT_TIER2[n]);
    }
    else if (spec.template === "product-shot") {
        tier = duration > 10 || deadline ? 1 : 2;
        reasons.push(tier === 2 ? "a product shot wants Blender's reflections and depth of field" : "long or rushed product shot: the Three.js turntable is much faster");
    }
    else {
        tier = 1;
        reasons.push("no realism, physics or rigs needed: Three.js inside the video renders with the rest of the frame, nothing to install");
    }
    if (tier === 2 && duration > 10)
        warnings.push(`This is a ${duration} s Blender shot; on this PC that is slow. Consider Tier 1 or a shorter shot.`);
    if (tier === 2 && deadline && !hard.length) {
        tier = 1;
        reasons.push("tight deadline: Tier 1 instead");
    }
    const tier1Template = has1 ? spec.template : TEMPLATES[spec.template]?.tier1 || "title3d";
    let fallback = null;
    if (tier === 2 && blender === null) {
        fallback = {
            tier: 1,
            template: tier1Template,
            lost: hard.length ? hard.map((n) => n) : ["Blender lighting quality"],
            message: `Blender isn't installed. Ask the user: set up Blender (download, with their OK), or make it in Three.js (Tier 1, "${tier1Template}") without ${hard.length ? hard.join(", ") : "Blender's realism"}.`,
        };
    }
    if (tier === 1 && !has1) {
        warnings.push(`There is no Three.js "${spec.template}"; Tier 1 uses "${tier1Template}" instead${spec.template === "physics-drop" ? " (no physics)" : ""}.`);
    }
    const engine = tier === 2 ? pickEngine(spec) : null;
    return { tier, engine, template: tier === 1 ? tier1Template : spec.template, reasons, warnings, fallback, needs: [...needs] };
}
/**
 * Seconds to render a shot on this machine. `bench` can carry measured numbers from earlier
 * renders (`<CUTSCENE_HOME>/logs/3d-timings.json`), which beat the defaults.
 */
export function estimate(spec, { engine, stills = 0, bench = BENCH, scale = 1 } = {}) {
    const eng = engine || pickEngine(spec);
    const quality = spec.quality === "draft" ? "draft" : "final";
    const frames = frameCount(spec.duration || TEMPLATES[spec.template]?.duration || 3, spec.fps || 30);
    const pixels = ((spec.width || 1920) * (spec.height || 1080)) / (1920 * 1080);
    const perFrame = (bench.perFrame?.[eng]?.[quality] ?? BENCH.perFrame[eng][quality]) * pixels * scale * scale;
    const startup = bench.startup ?? BENCH.startup;
    const compile = eng === "BLENDER_EEVEE" ? (bench.eeveeFirstFrame ?? BENCH.eeveeFirstFrame) : 0;
    const bake = spec.template === "physics-drop" ? frames * BENCH.physicsBakePerFrame : 0;
    const full = startup + compile + bake + frames * perFrame;
    const stillsDraft = (bench.perFrame?.[eng]?.draft ?? BENCH.perFrame[eng].draft) * pixels * 0.25;
    const stillsTotal = stills ? startup + compile + bake + stills * stillsDraft : 0;
    return {
        engine: eng,
        frames,
        secondsPerFrame: round(perFrame),
        stillsSeconds: round(stillsTotal),
        renderSeconds: round(full),
        encodeSeconds: round(frames * BENCH.encodePerFrame * pixels),
        human: humanTime(full),
    };
}
function round(x) {
    return Math.round(x * 10) / 10;
}
export function humanTime(s) {
    if (s < 90)
        return `about ${Math.max(1, Math.round(s))} s`;
    if (s < 3600)
        return `about ${Math.round(s / 60)} min`;
    return `about ${(s / 3600).toFixed(1)} h`;
}
