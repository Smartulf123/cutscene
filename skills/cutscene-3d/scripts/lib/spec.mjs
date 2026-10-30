// Shot specs for Cutscene 3D: templates, defaults, validation and resolution against look.json.
// A spec lives at <project>/.cutscene/3d/<shot>.json. Times are seconds. Node built-ins only.
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = resolve(here, "..", "..");
export const BUNDLED_FONT = resolve(SKILL_DIR, "assets", "fonts", "Geist-Bold.ttf");
export const DEMO_SVG = resolve(SKILL_DIR, "templates", "tier2", "cutscene-mark.svg");

export const DEFAULT_LOOK = {
  version: 1,
  name: "cutscene default",
  palette: { bg: "#0B1020", fg: "#F4F3EE", accent: "#5B8DEF", accent2: "#FF7A45" },
  type: { display: { family: "Geist", weight: 700 }, body: { family: "Inter", weight: 500 } },
  motion: { character: "snappy", ease: "power3.out", duration_scale: 1.0 },
  seed: 1337,
};

/** look.json motion.character -> reveal and camera eases (Blender interpolation names). */
export const MOTION = {
  snappy: { reveal: "back-out", camera: "expo-out", stagger: 0.06, letter: 0.7 },
  smooth: { reveal: "quart-out", camera: "sine-inout", stagger: 0.08, letter: 0.9 },
  bouncy: { reveal: "elastic-out", camera: "back-out", stagger: 0.07, letter: 1.0 },
  cinematic: { reveal: "quint-out", camera: "quint-inout", stagger: 0.1, letter: 1.2 },
  editorial: { reveal: "cubic-out", camera: "cubic-out", stagger: 0.05, letter: 0.6 },
};

export const EASES = ["linear", "smooth", "bezier", "constant",
  ...["sine", "quad", "cubic", "quart", "quint", "expo", "circ", "back", "bounce", "elastic"]
    .flatMap((k) => [`${k}-in`, `${k}-out`, `${k}-inout`])];
export const CAMERA_MOVES = ["static", "push-in", "pull-out", "arc", "arc-right", "orbit", "crane", "dolly-left", "hero", "turntable"];
export const MATERIALS = ["glossy", "plastic", "satin", "clay", "metal", "chrome", "gold", "glass", "emissive", "noise", "wave", "image"];
export const RIGS = ["studio", "hero", "soft", "dramatic"];
export const COLOR_TOKENS = ["bg", "fg", "accent", "accent2"];

/**
 * Tier 2 (Blender) templates. `tier1` names the closest Three.js template for fallbacks.
 * `params` are defaults; colour fields may be palette tokens ("accent") or "#RRGGBB".
 */
export const TEMPLATES = {
  title3d: {
    summary: "Extruded, bevelled text with a per-letter reveal and a camera arc.",
    tier1: "title3d",
    duration: 3.0,
    params: {
      text: "CUTSCENE", size: 1.0, depth: 0.3, bevel: 0.024, bevel_segments: 4, tracking: 0.08,
      reveal: "flip", reveal_start: 0.1, stagger: null, letter_duration: null, reveal_ease: null, swing: 12,
      face: { preset: "glossy", color: "fg" }, sides: { preset: "metal", color: "accent", roughness: 0.22 },
      ground: false,
    },
    camera: { move: "arc", lens: 50, dof: { fstop: 2.8 }, drift: 0.15 },
    lighting: { rig: "studio" },
  },
  "logo-svg": {
    summary: "An SVG logo, extruded and bevelled, with a spin, rise, pop or extrude reveal.",
    tier1: "logo-svg",
    duration: 3.0,
    params: {
      svg: null, width: 3.2, depth: 0.42, bevel: 0.03, bevel_segments: 4, reveal: "spin", reveal_start: 0.1,
      reveal_duration: 1.1, reveal_ease: null, stagger: 0.08, swing: 10, keep_svg_colors: false,
      face: { preset: "glossy", color: "accent" }, sides: { preset: "chrome", color: "#C9D3E6" }, ground: false,
    },
    camera: { move: "push-in", lens: 50, dof: { fstop: 4 }, drift: 0.15 },
    lighting: { rig: "studio" },
  },
  turntable: {
    summary: "A glTF/OBJ/FBX model (or the built-in can) on a seamless spin, studio lit, soft shadow.",
    tier1: "turntable",
    duration: 4.0,
    params: {
      model: null, turns: 1, height: 2.0, start_angle: -30, material_override: null, ground: true,
      contact_shadow: 0.55, label: { preset: "glossy", color: "accent" }, body: { preset: "metal", color: "#D5D9E0", roughness: 0.2 },
    },
    camera: { move: "turntable", lens: 70, dof: { fstop: 5.6 } },
    lighting: { rig: "studio" },
  },
  "product-shot": {
    summary: "Hero product lighting (top key, twin strip rims), reflections, shallow depth of field, slow glide.",
    tier1: "turntable",
    duration: 4.0,
    params: {
      model: null, turn: 35, start_angle: -20, height: 2.0, material_override: null, ground: true,
      contact_shadow: 0.55, label: { preset: "glossy", color: "accent" }, body: { preset: "metal", color: "#D5D9E0", roughness: 0.2 },
    },
    camera: { move: "hero", lens: 85, dof: { fstop: 2.2 } },
    lighting: { rig: "hero" },
  },
  "physics-drop": {
    summary: "Letters of a word drop and land (rigid bodies) with seeded confetti shapes tumbling around them.",
    tier1: "title3d",
    duration: 3.0,
    params: {
      text: "DROP", size: 1.0, depth: 0.45, bevel: 0.028, tracking: 0.03, drop_height: 3.2, stagger: 0.11,
      start: 0.05, bounce: 0.12, upright: true, wobble: 6, confetti: 18,
      confetti_shapes: ["sphere", "cube", "ring", "pill"], confetti_material: "glossy",
      face: { preset: "glossy", color: "fg" }, sides: { preset: "metal", color: "accent" }, ground: true, shadow: 0.6,
    },
    camera: { move: "push-in", lens: 50, dof: { fstop: 4 } },
    lighting: { rig: "studio" },
  },
};

/** Templates that draw text, so they need the look's display font (others never load a font). */
export const TEXT_TEMPLATES = { 1: ["title3d"], 2: ["title3d", "physics-drop"] };
export const usesText = (template, tier) => (TEXT_TEMPLATES[tier] || []).includes(template);

/** Tier 1 (Three.js) templates. */
export const TIER1_TEMPLATES = {
  title3d: "3D title from text: extruded bevelled letters flip up, the word swings so light runs over it.",
  "logo-svg": "Extruded SVG logo with a spin-in reveal.",
  turntable: "glTF product turntable (or a built-in can), studio reflections, seamless loop.",
  shapes: "Abstract floating shapes and particles in the palette colours, seeded.",
  flythrough: "Camera fly-through a tunnel of glowing rings and shapes.",
};

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
  if (!isPlain(over)) return over === undefined ? clone(base) : clone(over);
  const out = isPlain(base) ? clone(base) : {};
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : clone(v);
  }
  return out;
}

/** A new spec for `template` (what `cutscene 3d new` writes). */
export function newSpec(template, { id, text, svg, model, duration, fps = 30, width = 1920, height = 1080, beat, look = ".cutscene/look.json", seed } = {}) {
  const t = TEMPLATES[template];
  if (!t) throw specError(`There's no 3D template called "${template}".`, `Choose one of: ${Object.keys(TEMPLATES).join(", ")}.`);
  const params = clone(t.params);
  if (text != null) params.text = text;
  if (svg != null) params.svg = svg;
  if (model != null) params.model = model;
  for (const k of Object.keys(params)) if (params[k] === null && !["svg", "model", "material_override"].includes(k)) delete params[k];
  const spec = {
    version: 1,
    id: id || template.replace(/[^a-z0-9]+/g, "-"),
    template,
    tier: "auto",
    engine: "auto",
    duration: duration ?? t.duration,
    fps,
    width,
    height,
    quality: "final",
    look,
    params,
    camera: clone(t.camera),
    lighting: clone(t.lighting),
    motion_blur: true,
    transparent: true,
    needs: [],
  };
  if (seed != null) spec.seed = seed;
  if (beat) spec.beat = beat;
  return spec;
}

function specError(message, hint, code = "SPEC_INVALID") {
  const e = new Error(message);
  e.code = code;
  e.hint = hint;
  return e;
}

/** Validate a spec. Returns a list of plain-language problems (empty = fine). */
export function validateSpec(spec) {
  const errs = [];
  if (!isPlain(spec)) return ["The spec must be a JSON object."];
  if (spec.version !== 1) errs.push('"version" must be 1.');
  if (!spec.id || !/^[a-z0-9][a-z0-9-_]{0,63}$/i.test(String(spec.id))) errs.push('"id" must be a short name of letters, digits, - or _ (it names the output files).');
  if (!TEMPLATES[spec.template] && !TIER1_TEMPLATES[spec.template]) errs.push(`"template" must be one of: ${[...new Set([...Object.keys(TEMPLATES), ...Object.keys(TIER1_TEMPLATES)])].join(", ")}.`);
  if (spec.tier != null && !["auto", 1, 2, "1", "2"].includes(spec.tier)) errs.push('"tier" must be "auto", 1 or 2.');
  if (spec.engine != null && !["auto", "eevee", "cycles"].includes(spec.engine)) errs.push('"engine" must be "auto", "eevee" or "cycles".');
  const num = (k, lo, hi) => {
    const v = spec[k];
    if (v == null) return;
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) errs.push(`"${k}" must be a number from ${lo} to ${hi}.`);
  };
  num("duration", 0.1, 120);
  num("fps", 1, 120);
  num("width", 16, 7680);
  num("height", 16, 7680);
  if (spec.width % 2 || spec.height % 2) errs.push('"width" and "height" must be even numbers (video encoders need that).');
  if (spec.quality != null && !["draft", "final"].includes(spec.quality)) errs.push('"quality" must be "draft" or "final".');
  const p = spec.params || {};
  if (!isPlain(p)) errs.push('"params" must be an object.');
  if (["title3d", "physics-drop"].includes(spec.template)) {
    if (typeof p.text !== "string" || !p.text.trim()) errs.push('"params.text" needs the words to show.');
    else if (p.text.length > 40) errs.push('"params.text" is too long for a 3D title (40 characters at most). Split it into two shots.');
  }
  if (spec.template === "logo-svg" && p.svg != null && !/\.svg$/i.test(String(p.svg))) errs.push('"params.svg" must be an .svg file.');
  if (["turntable", "product-shot"].includes(spec.template) && p.model && !/\.(glb|gltf|obj|fbx|stl|ply)$/i.test(String(p.model))) {
    errs.push('"params.model" must be a .glb, .gltf, .obj, .fbx, .stl or .ply file.');
  }
  for (const key of ["face", "sides", "label", "body", "material_override"]) {
    const m = p[key];
    if (m == null) continue;
    if (!isPlain(m)) { errs.push(`"params.${key}" must be a material object like {"preset":"metal","color":"accent"}.`); continue; }
    if (m.preset && !MATERIALS.includes(m.preset)) errs.push(`"params.${key}.preset" must be one of: ${MATERIALS.join(", ")}.`);
    if (m.color != null && !isHex(m.color) && !COLOR_TOKENS.includes(m.color)) errs.push(`"params.${key}.color" must be "#RRGGBB" or one of ${COLOR_TOKENS.join(", ")}.`);
  }
  const cam = spec.camera || {};
  if (cam.move && !CAMERA_MOVES.includes(cam.move)) errs.push(`"camera.move" must be one of: ${CAMERA_MOVES.join(", ")}.`);
  if (cam.ease && !EASES.includes(cam.ease)) errs.push(`"camera.ease" must be one of: ${EASES.join(", ")}.`);
  if (p.reveal_ease && !EASES.includes(p.reveal_ease)) errs.push(`"params.reveal_ease" must be one of: ${EASES.join(", ")}.`);
  if (cam.lens != null && !(cam.lens >= 10 && cam.lens <= 300)) errs.push('"camera.lens" must be 10 to 300 (mm).');
  const lt = spec.lighting || {};
  if (lt.rig && !RIGS.includes(lt.rig)) errs.push(`"lighting.rig" must be one of: ${RIGS.join(", ")}.`);
  if (spec.palette != null) {
    if (!isPlain(spec.palette)) errs.push('"palette" must be an object of "#RRGGBB" colours.');
    else for (const [k, v] of Object.entries(spec.palette)) if (!isHex(v)) errs.push(`"palette.${k}" must be "#RRGGBB".`);
  }
  if (spec.needs != null && !Array.isArray(spec.needs)) errs.push('"needs" must be a list, e.g. ["glass", "physics"].');
  return errs;
}

/** Read look.json (or null). */
export function readLook(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const look = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
    return isPlain(look) ? look : null;
  } catch {
    return null;
  }
}

/** Replace palette tokens ("accent") with hex colours, deeply. */
export function resolveColors(value, palette) {
  if (Array.isArray(value)) return value.map((v) => resolveColors(v, palette));
  if (isPlain(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (["color", "color2", "rim_color", "rim2_color", "key_color", "fill_color"].includes(k) && typeof v === "string" && palette[v]) out[k] = palette[v];
      else out[k] = resolveColors(v, palette);
    }
    return out;
  }
  return value;
}

/** Engine choice: "auto" picks Cycles for glass/realism, EEVEE otherwise. */
export function pickEngine(spec) {
  if (spec.engine === "cycles") return "CYCLES";
  if (spec.engine === "eevee") return "BLENDER_EEVEE";
  return needsCycles(spec) ? "CYCLES" : "BLENDER_EEVEE";
}

export function materialPresets(spec) {
  const p = spec.params || {};
  return ["face", "sides", "label", "body", "material_override"].map((k) => p[k]?.preset).filter(Boolean);
}

export function needsCycles(spec) {
  const needs = (spec.needs || []).map((n) => String(n).toLowerCase());
  return materialPresets(spec).includes("glass") || needs.some((n) => ["glass", "liquid", "subsurface", "photoreal", "caustics"].includes(n));
}

/** Frames for a duration at fps (at least 1). */
export function frameCount(duration, fps) {
  return Math.max(1, Math.round(Number(duration) * Number(fps)));
}

/** Pick 3-5 still frames spread over the shot: first motion, middle beats, the final hold. */
export function stillFrames(frames, count = 4) {
  const n = Math.max(1, Math.min(5, count));
  if (frames <= n) return Array.from({ length: frames }, (_, i) => i + 1);
  const picks = new Set();
  const marks = n === 3 ? [0.2, 0.5, 1] : n === 4 ? [0.15, 0.35, 0.6, 1] : [0.1, 0.25, 0.45, 0.7, 1];
  for (const m of marks) picks.add(Math.max(1, Math.min(frames, Math.round(m * frames))));
  return [...picks].sort((a, b) => a - b);
}

/**
 * The resolved spec the Blender script reads: look merged in, colours as hex, absolute paths,
 * eases from the motion character, frames counted, engine chosen.
 */
export function resolveSpec(spec, { projectDir, look, fontPath } = {}) {
  const t = TEMPLATES[spec.template];
  if (!t) throw specError(`"${spec.template}" is a Tier 1 template; Blender can't render it.`, "Use `cutscene 3d tier1` for it, or pick a Tier 2 template.");
  const lk = merge(DEFAULT_LOOK, look || {});
  const palette = merge(lk.palette, spec.palette || {});
  const motion = MOTION[lk.motion?.character] || MOTION.snappy;
  const scale = Number(lk.motion?.duration_scale) || 1;
  const params = resolveColors(merge(t.params, spec.params || {}), palette);
  const abs = (p) => (p ? (isAbsolute(p) ? p : resolve(projectDir || process.cwd(), p)) : p);
  if (params.svg !== undefined) params.svg = abs(params.svg) || DEMO_SVG;
  if (params.model) params.model = abs(params.model);
  for (const k of ["face", "sides", "label", "body", "material_override"]) if (params[k]?.image) params[k].image = abs(params[k].image);
  params.reveal_ease ??= motion.reveal;
  params.stagger ??= motion.stagger * scale;
  params.letter_duration ??= motion.letter * scale;
  for (const k of Object.keys(params)) if (params[k] === null) delete params[k];
  const camera = merge(t.camera, spec.camera || {});
  camera.ease ??= motion.camera;
  const lighting = resolveColors(merge(t.lighting, spec.lighting || {}), palette);
  if (lighting.hdri) lighting.hdri = abs(lighting.hdri);
  const fps = spec.fps || 30;
  const duration = spec.duration || t.duration;
  return {
    version: 1,
    id: spec.id,
    template: spec.template,
    engine: pickEngine(spec),
    width: spec.width || 1920,
    height: spec.height || 1080,
    fps,
    duration,
    frames: frameCount(duration, fps),
    quality: spec.quality || "final",
    seed: Number.isInteger(spec.seed) ? spec.seed : Number.isInteger(lk.seed) ? lk.seed : 1337,
    palette,
    font: abs(spec.font) || fontPath || BUNDLED_FONT,
    params,
    camera,
    lighting,
    motion_blur: { enabled: spec.motion_blur !== false, shutter: typeof spec.motion_blur === "number" ? spec.motion_blur : 0.35 },
    transparent: spec.transparent !== false,
    view_transform: spec.view_transform || "Standard",
    exposure: spec.exposure || 0,
    ...(spec.samples ? { samples: spec.samples } : {}),
  };
}
