// Built from src/skills/cutscene-3d/scripts/lib/spec.mts by `npm run build`. Edit that file, not this one.
// Shot specs for Cutscene 3D: templates, defaults and validation. Every shot is Tier 1 (Three.js
// inside the video). A spec lives at <project>/.cutscene/3d/<shot>.json. Times are seconds.
// Node built-ins only.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = resolve(here, "..", "..");
export const BUNDLED_FONT = resolve(SKILL_DIR, "assets", "fonts", "Geist-Bold.ttf");
export const DEMO_SVG = resolve(SKILL_DIR, "templates", "tier1", "cutscene-mark.svg");
export const DEFAULT_LOOK = {
    version: 1,
    name: "cutscene default",
    palette: { bg: "#0B1020", fg: "#F4F3EE", accent: "#5B8DEF", accent2: "#FF7A45" },
    type: { display: { family: "Geist", weight: 700 }, body: { family: "Inter", weight: 500 } },
    motion: { character: "snappy", ease: "power3.out", duration_scale: 1.0 },
    seed: 1337,
};
// Material presets a spec may name. The Three.js templates draw glossy, plastic, satin, clay,
// metal, chrome, gold, glass and emissive; noise, wave and image are still accepted so older
// specs stay valid, and draw as glossy.
export const MATERIALS = ["glossy", "plastic", "satin", "clay", "metal", "chrome", "gold", "glass", "emissive", "noise", "wave", "image"];
export const COLOR_TOKENS = ["bg", "fg", "accent", "accent2"];
/**
 * The Three.js (Tier 1) templates. `params` are defaults; colour fields may be palette tokens
 * ("accent") or "#RRGGBB".
 */
export const TEMPLATES = {
    title3d: {
        summary: "3D title from text: extruded bevelled letters flip up, the word swings so light runs over it.",
        duration: 3.0,
        params: {
            text: "CUTSCENE", depth: 0.3, bevel: 0.024, tracking: 0.08, swing: 12,
            face: { preset: "glossy", color: "fg" }, sides: { preset: "metal", color: "accent", roughness: 0.22 },
        },
    },
    "logo-svg": {
        summary: "Extruded SVG logo with a spin-in reveal.",
        duration: 3.0,
        params: {
            svg: null, depth: 0.42, bevel: 0.03, keep_svg_colors: false,
            face: { preset: "glossy", color: "accent" }, sides: { preset: "chrome", color: "#C9D3E6" },
        },
    },
    turntable: {
        summary: "glTF product turntable (or a built-in can), studio reflections, seamless loop.",
        duration: 4.0,
        params: { model: null, turns: 1, label: { preset: "glossy", color: "accent" } },
    },
    shapes: {
        summary: "Abstract floating shapes and particles in the palette colours, seeded.",
        duration: 3.0,
        params: {},
    },
    flythrough: {
        summary: "Camera fly-through a tunnel of glowing rings and shapes.",
        duration: 3.0,
        params: {},
    },
};
/** Template name -> one-line summary. */
export const TIER1_TEMPLATES = Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, t.summary]));
/** Templates that draw text, so they need the look's display font (others never load a font). */
export const TEXT_TEMPLATES = ["title3d"];
export const usesText = (template) => TEXT_TEMPLATES.includes(template);
export const FORMATS = {
    landscape: [1920, 1080],
    portrait: [1080, 1920],
    square: [1080, 1080],
};
const HEX = /^#[0-9a-f]{6}$/i;
export function isHex(v) {
    return typeof v === "string" && HEX.test(v);
}
function clone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v));
}
function isPlain(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}
/** Deep merge (arrays and scalars replace). */
export function merge(base, over) {
    if (!isPlain(over))
        return over === undefined ? clone(base) : clone(over);
    const out = isPlain(base) ? clone(base) : {};
    for (const [k, v] of Object.entries(over)) {
        if (v === undefined)
            continue;
        out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : clone(v);
    }
    return out;
}
/** A new spec for `template` (what `cutscene 3d new` writes). */
export function newSpec(template, { id, text, svg, model, duration, fps = 30, width = 1920, height = 1080, beat, look = ".cutscene/look.json", seed } = {}) {
    const t = TEMPLATES[template];
    if (!t)
        throw specError(`There's no 3D template called "${template}".`, `Choose one of: ${Object.keys(TEMPLATES).join(", ")}.`);
    const params = clone(t.params);
    if (text != null)
        params.text = text;
    if (svg != null)
        params.svg = svg;
    if (model != null)
        params.model = model;
    const spec = {
        version: 1,
        id: id || template.replace(/[^a-z0-9]+/g, "-"),
        template,
        tier: 1,
        duration: duration ?? t.duration,
        fps,
        width,
        height,
        look,
        params,
    };
    if (seed != null)
        spec.seed = seed;
    if (beat)
        spec.beat = beat;
    return spec;
}
function specError(message, hint, code = "SPEC_INVALID") {
    const e = new Error(message);
    e.code = code;
    e.hint = hint;
    return e;
}
/**
 * Validate a spec. Returns a list of plain-language problems (empty = fine). Specs that ask
 * for Blender (Tier 2) are caught before this, by tier2Reasons in tier.mjs.
 */
export function validateSpec(spec) {
    const errs = [];
    if (!isPlain(spec))
        return ["The spec must be a JSON object."];
    if (spec.version !== 1)
        errs.push('"version" must be 1.');
    if (!spec.id || !/^[a-z0-9][a-z0-9-_]{0,63}$/i.test(String(spec.id)))
        errs.push('"id" must be a short name of letters, digits, - or _ (it names the output files).');
    if (!TEMPLATES[spec.template])
        errs.push(`"template" must be one of: ${Object.keys(TEMPLATES).join(", ")}.`);
    if (spec.tier != null && !["auto", 1, "1"].includes(spec.tier))
        errs.push('"tier" must be 1 (or "auto", which also means 1).');
    const num = (k, lo, hi) => {
        const v = spec[k];
        if (v == null)
            return;
        if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
            errs.push(`"${k}" must be a number from ${lo} to ${hi}.`);
    };
    num("duration", 0.1, 120);
    num("fps", 1, 120);
    num("width", 16, 7680);
    num("height", 16, 7680);
    if (spec.width % 2 || spec.height % 2)
        errs.push('"width" and "height" must be even numbers (video encoders need that).');
    const p = spec.params || {};
    if (!isPlain(p))
        errs.push('"params" must be an object.');
    if (spec.template === "title3d") {
        if (typeof p.text !== "string" || !p.text.trim())
            errs.push('"params.text" needs the words to show.');
        else if (p.text.length > 40)
            errs.push('"params.text" is too long for a 3D title (40 characters at most). Split it into two shots.');
    }
    if (spec.template === "logo-svg" && p.svg != null && !/\.svg$/i.test(String(p.svg)))
        errs.push('"params.svg" must be an .svg file.');
    // Other model formats get a clearer MODEL_FORMAT error (with how to convert) when the shot is written.
    if (spec.template === "turntable" && p.model && !/\.(glb|gltf|obj|fbx|stl|ply)$/i.test(String(p.model))) {
        errs.push('"params.model" must be a .glb or .gltf file.');
    }
    for (const key of ["face", "sides", "label"]) {
        const m = p[key];
        if (m == null)
            continue;
        if (!isPlain(m)) {
            errs.push(`"params.${key}" must be a material object like {"preset":"metal","color":"accent"}.`);
            continue;
        }
        if (m.preset && !MATERIALS.includes(m.preset))
            errs.push(`"params.${key}.preset" must be one of: ${MATERIALS.join(", ")}.`);
        if (m.color != null && !isHex(m.color) && !COLOR_TOKENS.includes(m.color))
            errs.push(`"params.${key}.color" must be "#RRGGBB" or one of ${COLOR_TOKENS.join(", ")}.`);
    }
    if (spec.palette != null) {
        if (!isPlain(spec.palette))
            errs.push('"palette" must be an object of "#RRGGBB" colours.');
        else
            for (const [k, v] of Object.entries(spec.palette))
                if (!isHex(v))
                    errs.push(`"palette.${k}" must be "#RRGGBB".`);
    }
    if (spec.needs != null && !Array.isArray(spec.needs))
        errs.push('"needs" must be a list.');
    return errs;
}
/** Read look.json (or null). */
export function readLook(path) {
    if (!path || !existsSync(path))
        return null;
    try {
        const look = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
        return isPlain(look) ? look : null;
    }
    catch {
        return null;
    }
}
