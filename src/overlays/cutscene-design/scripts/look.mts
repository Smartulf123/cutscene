#!/usr/bin/env node
// look.mjs: Cutscene's per-video look system (.cutscene/look.json, contracts §8).
// Written for Cutscene (Apache-2.0). Node built-ins only.
//
//   node look.mjs new --brief .cutscene/brief.md [--seed N] [--brand <file.json|json>]
//                     [--out .cutscene/look.json] [--against <dir>] [--force] [--json]
//   node look.mjs check <project|look.json> [--json]
//   node look.mjs diff <a> <b> [--json]
//   node look.mjs compare <project> --against <dir> [--last 5] [--threshold 0.3] [--strict] [--json]
//
// Exit codes: 0 ok, 1 failed check (or too similar with --strict), 2 wrong usage.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A colour palette: four hex colours. */
export interface Palette {
  bg: string;
  fg: string;
  accent: string;
  accent2: string;
}

export interface LookFont {
  family: string;
  weight: number;
  /** A font file in the project, for fonts the engine doesn't resolve by itself. */
  src?: string;
}

/** .cutscene/look.json */
export interface Look {
  version: number;
  name: string;
  palette: Palette;
  type: { display: LookFont; body: LookFont };
  motion: { character: string; ease: string; duration_scale: number };
  texture?: { grain?: number; vignette?: number };
  source?: string;
  seed?: number;
}

/** What --brand gives, after readBrand: hex colours and font names, or null. */
export interface Brand {
  name: string | null;
  display: string | null;
  body: string | null;
  motion: string | null;
  primary: string | null;
  secondary: string | null;
  background: string | null;
  text: string | null;
}

/** A brand file as written: colours as a map or a list, fonts as a map or a list. */
interface RawBrand {
  name?: string;
  title?: string;
  motion?: string;
  fonts?: RawFont[] | { display?: RawFont; body?: RawFont };
  colors?: (string | { hex?: string; value?: string } | null)[] | Record<string, string | undefined>;
}
type RawFont = string | { family?: string; name?: string } | null | undefined;

export interface MotionCharacter {
  ease: string;
  exit: string;
  duration_scale: number;
  enter: number;
  stagger: number;
  grain: [number, number];
  vignette: [number, number];
}

/** [display, displayWeight, body, bodyWeight, affinities] */
export type Pairing = [string, number, string, number, string[]];

/** A pinned .woff for 3D titles (cutscene-3d/assets/manifest.json). */
export interface FontPin {
  kind: string;
  name: string;
  family: string;
  weight: number;
  url: string;
  sha256: string;
  size: number;
  license: string;
}

/** An earlier project's look. */
export interface PreviousLook {
  project: string;
  path: string;
  mtime: number;
  look: Look;
}

export interface LookDiff {
  score: number;
  parts: { palette: number; type: number; motion: number; texture: number };
}

export interface LookCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  info: {
    contrast?: { fg_bg: number; accent_bg: number; accent2_bg: number; fg_on_accent: number; bg_on_accent: number };
    textOnAccent?: string;
  };
}

type Rng = () => number;

const HERE = dirname(fileURLToPath(import.meta.url));
export const CHARACTERS = ["snappy", "smooth", "bouncy", "cinematic", "editorial"];
export const DEFAULT_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// motion characters -> concrete GSAP choices (documented in references/look-system.md)

export const MOTION: Record<string, MotionCharacter> = {
  snappy: { ease: "power3.out", exit: "power2.in", duration_scale: 0.8, enter: 0.45, stagger: 0.04, grain: [0.02, 0.06], vignette: [0.05, 0.2] },
  smooth: { ease: "sine.inOut", exit: "sine.in", duration_scale: 1.25, enter: 0.9, stagger: 0.08, grain: [0, 0.04], vignette: [0, 0.15] },
  bouncy: { ease: "back.out(1.7)", exit: "back.in(1.4)", duration_scale: 1.0, enter: 0.6, stagger: 0.06, grain: [0, 0.03], vignette: [0, 0.1] },
  cinematic: { ease: "expo.inOut", exit: "power3.in", duration_scale: 1.5, enter: 1.4, stagger: 0.12, grain: [0.06, 0.12], vignette: [0.25, 0.45] },
  editorial: { ease: "power2.inOut", exit: "power2.in", duration_scale: 1.0, enter: 0.6, stagger: 0.05, grain: [0.03, 0.08], vignette: [0.05, 0.2] },
};
const ALT_EASES: Record<string, string[]> = {
  snappy: ["power3.out", "power4.out", "expo.out", "circ.out"],
  smooth: ["sine.inOut", "power1.inOut", "power2.out", "sine.out"],
  bouncy: ["back.out(1.7)", "back.out(2.2)", "elastic.out(1, 0.5)", "back.out(1.4)"],
  cinematic: ["expo.inOut", "power4.inOut", "power3.inOut", "expo.out"],
  editorial: ["power2.inOut", "power2.out", "circ.inOut", "steps(6)"],
};

// ---------------------------------------------------------------------------
// fonts the engine renders without setup (its auto-resolved list), plus the
// OFL fonts bundled in cutscene-captions (need @font-face; look new copies them)

export const ENGINE_FONTS = [
  "Inter", "Montserrat", "Outfit", "Nunito", "Oswald", "League Gothic", "Archivo Black", "Space Mono",
  "IBM Plex Mono", "JetBrains Mono", "EB Garamond", "Playfair Display", "Source Code Pro", "Noto Sans JP",
  "Roboto", "Open Sans", "Lato", "Poppins",
];
const BUNDLED_DIR = resolve(HERE, "..", "..", "cutscene-captions", "modes", "standard", "fonts", "files");
export const BUNDLED_FONTS: Record<string, { slug: string; weights: number[] }> = {
  "Space Grotesk": { slug: "space-grotesk", weights: [400, 700] },
  Sora: { slug: "sora", weights: [400, 700] },
  Anton: { slug: "anton", weights: [400] },
  "Bodoni Moda": { slug: "bodoni-moda", weights: [400, 700] },
  "Cormorant Garamond": { slug: "cormorant-garamond", weights: [400, 700] },
  "Chakra Petch": { slug: "chakra-petch", weights: [500, 700] },
  Rajdhani: { slug: "rajdhani", weights: [500, 700] },
  Teko: { slug: "teko", weights: [400, 700] },
  Fredoka: { slug: "fredoka", weights: [400, 700] },
  Orbitron: { slug: "orbitron", weights: [400, 700] },
  "Baloo 2": { slug: "baloo-2", weights: [400, 700] },
  Cinzel: { slug: "cinzel", weights: [400, 700] },
  "Shippori Mincho": { slug: "shippori-mincho", weights: [400, 700] },
  "Special Elite": { slug: "special-elite", weights: [400] },
  Bangers: { slug: "bangers", weights: [400] },
};

// The most common UI fonts. They read as "default" on screen, so the generator never makes
// them the display face; a brand that uses one keeps it.
export const GENERIC_DISPLAY = ["Inter", "Poppins", "Open Sans", "Roboto"];

// [display, displayWeight, body, bodyWeight, affinities]. Curated so each pair has a clear voice;
// every display face here also has a pinned .woff for 3D titles (cutscene-3d/assets/manifest.json).
export const PAIRINGS: Pairing[] = [
  ["Archivo Black", 400, "Space Grotesk", 400, ["snappy", "bouncy"]],
  ["Montserrat", 800, "IBM Plex Mono", 400, ["snappy", "editorial"]],
  ["Oswald", 600, "Lato", 400, ["snappy", "cinematic"]],
  ["League Gothic", 400, "Sora", 400, ["snappy", "editorial", "cinematic"]],
  ["Playfair Display", 700, "Space Grotesk", 400, ["editorial", "smooth"]],
  ["EB Garamond", 600, "IBM Plex Mono", 400, ["editorial", "smooth"]],
  ["Space Mono", 700, "IBM Plex Mono", 400, ["snappy", "editorial"]],
  ["JetBrains Mono", 700, "Sora", 400, ["snappy"]],
  ["Outfit", 700, "Nunito", 400, ["bouncy", "smooth"]],
  ["Baloo 2", 700, "Nunito", 400, ["bouncy", "smooth"]],
  ["Playfair Display", 800, "Source Code Pro", 400, ["editorial", "cinematic"]],
  ["Space Grotesk", 700, "Source Code Pro", 400, ["snappy", "editorial"]],
  ["Sora", 700, "Lato", 400, ["smooth", "snappy"]],
  ["Anton", 400, "Space Grotesk", 400, ["cinematic", "snappy"]],
  ["Bodoni Moda", 700, "Lato", 400, ["editorial", "cinematic"]],
  ["Cormorant Garamond", 700, "Sora", 400, ["cinematic", "smooth", "editorial"]],
  ["Chakra Petch", 700, "Space Grotesk", 400, ["snappy", "cinematic"]],
  ["Fredoka", 700, "Nunito", 400, ["bouncy"]],
  ["Teko", 700, "Sora", 400, ["snappy", "cinematic"]],
  ["Cinzel", 700, "EB Garamond", 400, ["cinematic", "editorial"]],
  ["Shippori Mincho", 700, "Lato", 400, ["smooth", "editorial"]],
  ["Rajdhani", 700, "Lato", 400, ["snappy"]],
  ["Special Elite", 400, "EB Garamond", 400, ["editorial", "cinematic"]],
  ["Bangers", 400, "Nunito", 400, ["bouncy"]],
];

// ---------------------------------------------------------------------------
// deterministic randomness

export function seedFromText(text: unknown): number {
  return createHash("sha256").update(String(text)).digest().readUInt32BE(0) % 1_000_000;
}
export function rng(seed: unknown): Rng {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length];
const between = (r: Rng, [lo, hi]: [number, number]): number => lo + (hi - lo) * r();
const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// colour maths (sRGB, WCAG 2.x contrast, CIE Lab distance)

export function parseHex(hex: unknown): number[] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const toHex = (rgb: number[]): string => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();

// The colour maths below takes valid hex colours (callers check with parseHex first).
export function luminance(hex: string): number {
  const rgb = parseHex(hex)!;
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return round((l1 + 0.05) / (l2 + 0.05), 2);
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex)!.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function toLab(hex: string): [number, number, number] {
  const lin = parseHex(hex)!.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const X = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const Y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
  const Z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Move `hex`'s lightness away from `bg` until contrast >= min (keeps hue). */
export function ensureContrast(hex: string, bg: string, min: number): string {
  if (contrast(hex, bg) >= min) return hex;
  const [h, s, l0] = hexToHsl(hex);
  const goLighter = luminance(bg) < 0.18;
  for (let i = 1; i <= 100; i++) {
    const l = goLighter ? l0 + ((1 - l0) * i) / 100 : l0 - (l0 * i) / 100;
    const c = hslToHex(h, s, l);
    if (contrast(c, bg) >= min) return c;
  }
  return goLighter ? "#FFFFFF" : "#000000";
}

// ---------------------------------------------------------------------------
// brief reading

const MOOD_WORDS: Record<string, string[]> = {
  snappy: ["fast", "launch", "startup", "tech", "saas", "app", "energetic", "hype", "punchy", "sale", "product", "feature", "dev", "code", "ai", "short", "tiktok", "reel"],
  smooth: ["calm", "wellness", "meditation", "soft", "gentle", "spa", "health", "relax", "sleep", "mindful", "elegant", "minimal", "nature"],
  bouncy: ["playful", "fun", "kids", "cute", "cartoon", "friendly", "game", "party", "colorful", "colourful", "bouncy", "joy", "food", "pet"],
  cinematic: ["cinematic", "film", "epic", "dramatic", "trailer", "luxury", "premium", "story", "documentary", "moody", "dark", "space", "3d", "intro", "teaser"],
  editorial: ["news", "editorial", "magazine", "journal", "essay", "explainer", "report", "data", "history", "science", "interview", "podcast", "analysis", "changelog", "release"],
};

export function moodScores(text: unknown): Record<string, number> {
  const t = ` ${String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  const scores: Record<string, number> = {};
  for (const [c, words] of Object.entries(MOOD_WORDS)) scores[c] = words.reduce((n, w) => n + (t.includes(` ${w} `) ? 1 : 0), 0);
  return scores;
}

function chooseCharacter(r: Rng, scores: Record<string, number>, forced: string | null | undefined): string {
  if (forced && CHARACTERS.includes(forced)) return forced;
  const weights = CHARACTERS.map((c) => 1 + 3 * (scores[c] ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < CHARACTERS.length; i++) {
    x -= weights[i];
    if (x <= 0) return CHARACTERS[i];
  }
  return CHARACTERS[CHARACTERS.length - 1];
}

// ---------------------------------------------------------------------------
// brand input

export function readBrand(arg: unknown): Brand | null {
  if (!arg) return null;
  // JSON text, or else the path of a JSON file
  let raw = arg as string;
  if (!String(arg).trim().startsWith("{")) raw = readFileSync(resolve(arg as string), "utf8");
  const b = JSON.parse(raw) as RawBrand;
  const hex = (c: unknown): string | null => (parseHex(c) ? toHex(parseHex(c)!) : null);
  const fontName = (f: RawFont): string | null => (typeof f === "string" ? f : (f?.family ?? f?.name ?? null));
  const fonts = Array.isArray(b.fonts) ? { display: fontName(b.fonts[0]), body: fontName(b.fonts[1] ?? b.fonts[0]) } : { display: fontName(b.fonts?.display), body: fontName(b.fonts?.body) };
  const base = {
    name: b.name ?? b.title ?? null,
    display: fonts.display ?? null,
    body: fonts.body ?? null,
    motion: CHARACTERS.includes(b.motion as string) ? (b.motion as string) : null,
  };
  if (!Array.isArray(b.colors)) {
    const n = b.colors ?? {};
    return {
      ...base,
      primary: hex(n.primary ?? n.accent),
      secondary: hex(n.secondary ?? n.accent2),
      background: hex(n.background ?? n.bg),
      text: hex(n.text ?? n.fg),
    };
  }
  // An ordered list (most used first), e.g. a captured site's tokens.json: the
  // accents are the most vivid colours, the background is a near-white or
  // near-black at the top of the list.
  const list = b.colors.map((c) => hex(typeof c === "string" ? c : c?.hex ?? c?.value)).filter(Boolean) as string[];
  const vivid = (c: string): number => {
    const [, s, l] = hexToHsl(c);
    return s * (1 - Math.abs(2 * l - 1));
  };
  const accents = [...list].filter((c) => vivid(c) > 0.25).sort((x, y) => vivid(y) - vivid(x));
  const primary = accents[0] ?? null;
  const secondary = accents.find((c) => primary && deltaE(c, primary) > 20) ?? null;
  const background = list.find((c) => luminance(c) > 0.8 || luminance(c) < 0.03) ?? null;
  const text = background ? (list.filter((c) => contrast(c, background) >= 7).sort((x, y) => contrast(y, background) - contrast(x, background))[0] ?? null) : null;
  return { ...base, primary, secondary, background, text };
}

// ---------------------------------------------------------------------------
// generation

const ADJECTIVES = ["midnight", "copper", "glacier", "velvet", "signal", "harbor", "ember", "paper", "neon", "quiet", "solar", "orchard", "chalk", "cobalt", "saffron", "tidal", "graphite", "citrus", "dune", "aurora", "ink", "moss", "coral", "static"];
const NOUNS = ["signal", "bloom", "atlas", "pulse", "frame", "drift", "verse", "circuit", "tide", "lantern", "grain", "orbit", "ledger", "canvas", "spark", "echo", "field", "studio", "parade", "monolith", "postcard", "relay", "harvest", "skyline"];

// accent hue ranges that read as the generic "AI video" look on dark backgrounds
const CLICHE_HUES: [number, number][] = [[228, 272]];
const isCliche = (h: number): boolean => CLICHE_HUES.some(([lo, hi]) => h >= lo && h <= hi);

function pairingFor(r: Rng, character: string, brand: Brand | null): [string, number, string, number, string[]?] {
  const fits = PAIRINGS.filter((p) => p[4].includes(character));
  if (brand?.display) {
    // The brand's display face stays; its body comes from the brand, else from a curated pair
    // that uses the same display face, else a body that suits the character.
    const d = brand.display;
    const same = PAIRINGS.find((p) => p[0].toLowerCase() === String(d).toLowerCase());
    const body = brand.body ?? same?.[2] ?? pick(r, fits.length ? fits : PAIRINGS)[2];
    return [d, same?.[1] ?? 700, body, 400];
  }
  const chosen = pick(r, fits.length ? fits : PAIRINGS);
  if (brand?.body) return [chosen[0], chosen[1], brand.body, 400];
  return chosen;
}

// Background tones. Without them every light look is near-white and every dark look near-black,
// and three videos read as one template with different fonts (found in the same-look check).
//   ink    near-black          deep    dark, saturated colour (forest, oxblood, plum)
//   paper  near-white          tinted  light colour you can name (butter, blush, sage)
//   vivid  a bold colour field with dark type (poster)
export const TONES = ["ink", "deep", "paper", "tinted", "vivid"];
const TONE_WEIGHTS: Record<string, Record<string, number>> = {
  snappy: { ink: 3, deep: 1.5, paper: 1.5, tinted: 1, vivid: 3 },
  smooth: { ink: 1.5, deep: 2.5, paper: 2.5, tinted: 3.5, vivid: 0 },
  bouncy: { ink: 0.5, deep: 1, paper: 1.5, tinted: 3.5, vivid: 4 },
  cinematic: { ink: 5, deep: 4.5, paper: 0.5, tinted: 0, vivid: 0 },
  editorial: { ink: 2, deep: 2, paper: 4, tinted: 2, vivid: 1 },
};

/** Which tone a background colour is. */
export function toneOf(bg: string): string {
  const [, s, l] = hexToHsl(bg);
  if (l < 0.125) return "ink";
  if (l < 0.3) return "deep";
  if (l >= 0.91) return "paper";
  if (l >= 0.82) return "tinted";
  return s >= 0.5 ? "vivid" : "tinted";
}

function chooseTone(r: Rng, character: string, brand: Brand | null): string {
  if (brand?.background) {
    // the brand's background decides dark or light, by how it reads (luminance), as before
    const t = toneOf(brand.background);
    if (luminance(brand.background) < 0.18) return t === "ink" ? "ink" : "deep";
    return t === "ink" || t === "deep" ? "tinted" : t;
  }
  // The accent must stay the brand's primary, so a brand never gets a field of its own colour.
  const w: Record<string, number> = { ...TONE_WEIGHTS[character], ...(brand?.primary ? { vivid: 0 } : {}) };
  const total = TONES.reduce((n, t) => n + w[t], 0);
  let x = r() * total;
  for (const t of TONES) {
    x -= w[t];
    if (x <= 0 && w[t] > 0) return t;
  }
  return "paper";
}

// Words in the brief that point at a colour family: [hue from, hue to] (degrees).
const HUE_WORDS: [string[], [number, number]][] = [
  [["warm", "cozy", "cosy", "sunset", "autumn", "coffee", "terracotta", "earthy"], [12, 45]],
  [["trust", "trustworthy", "finance", "fintech", "bank", "banking", "money", "secure", "insurance", "invoices", "accounting"], [150, 205]],
  [["fresh", "nature", "eco", "green", "garden", "plant", "organic", "sustainable"], [85, 150]],
  [["calm", "ocean", "water", "sleep", "serene", "breathe"], [165, 210]],
  [["luxury", "premium", "gold", "golden", "elegant"], [36, 50]],
  [["romance", "love", "beauty", "fashion", "cosmetics"], [320, 352]],
  [["energy", "energetic", "fitness", "sport", "sports", "workout", "gym", "hype"], [0, 28]],
];
export function hueHints(text: unknown): [number, number][] {
  const t = ` ${String(text).toLowerCase().replace(/[^a-z0-9s]/g, " ")} `;
  return HUE_WORDS.filter(([words]) => words.some((w) => t.includes(` ${w} `))).map(([, range]) => range);
}

function paletteFor(r: Rng, character: string, brand: Brand | null, hints: [number, number][] = []): { palette: Palette; scheme: string; tone: string } {
  const tone = chooseTone(r, character, brand);
  const dark = tone === "ink" || tone === "deep";
  let hue: number;
  if (brand?.primary) hue = hexToHsl(brand.primary)[0];
  else {
    const range = hints.length ? pick(r, hints) : [0, 360];
    hue = Math.floor(range[0] + r() * (range[1] - range[0])) % 360;
    if (dark && isCliche(hue)) hue = (hue + 90 + Math.floor(r() * 120)) % 360; // step out of the cliché band
  }
  const scheme = pick(r, ["complement", "split", "triad", "analogous", "mono-pop"] as const);
  const offset = { complement: 180, split: 150 + Math.floor(r() * 60), triad: 120, analogous: 30 + Math.floor(r() * 20), "mono-pop": 180 }[scheme];
  let bgHue = (hue + (r() < 0.5 ? 0 : 200 + r() * 40)) % 360;
  const bgSat = character === "editorial" ? 0.08 + r() * 0.12 : 0.15 + r() * 0.35;
  const toneSat = 0.35 + r() * 0.3;
  const toneL = r();
  let bg = brand?.background;
  if (!bg) {
    if (tone === "ink") bg = hslToHex(bgHue, bgSat, 0.05 + toneL * 0.07);
    else if (tone === "paper") bg = hslToHex(bgHue, bgSat * 0.7, 0.92 + toneL * 0.05);
    else if (tone === "tinted") bg = hslToHex(bgHue, toneSat, 0.84 + toneL * 0.06);
    else if (tone === "deep") {
      if (isCliche(bgHue)) bgHue = (bgHue + 80) % 360; // a deep navy or indigo field is the cliché itself
      bg = hslToHex(bgHue, toneSat, 0.13 + toneL * 0.09);
    } else {
      // vivid: the main hue becomes the field; lift it until dark type reads on it
      bgHue = hue;
      let l = 0.5;
      const sat = 0.7 + toneSat * 0.3; // bold, not neon
      bg = hslToHex(bgHue, sat, l);
      while (luminance(bg) < 0.4 && l < 0.8) bg = hslToHex(bgHue, sat, (l += 0.02));
    }
  }
  const fgBase = brand?.text ?? (dark ? hslToHex(bgHue, 0.12, 0.94 + r() * 0.04) : hslToHex(bgHue, 0.2, 0.07 + r() * 0.06));
  const fg = ensureContrast(fgBase, bg, 7);
  // calm characters get softer accents, so a quiet video doesn't glow neon
  const accSat = character === "smooth" ? 0.45 + r() * 0.25 : character === "editorial" || character === "cinematic" ? 0.5 + r() * 0.3 : 0.65 + r() * 0.3;
  // on a vivid field the accents are other hues, deep enough to read on it
  // (the complement and its neighbour: nearby hues go muddy brown or olive when darkened)
  const accHue = tone === "vivid" ? (hue + 180) % 360 : hue;
  let a2Hue = tone === "vivid" ? (hue + (scheme === "split" ? 120 : 240)) % 360 : (hue + offset) % 360;
  const accL = dark ? 0.58 : tone === "vivid" ? 0.3 : 0.45;
  const accent = ensureContrast(brand?.primary ?? hslToHex(accHue, accSat, accL), bg, 3);
  const a2L = dark ? 0.62 : tone === "vivid" ? 0.36 : 0.48;
  let accent2 = ensureContrast(brand?.secondary ?? hslToHex(a2Hue, accSat * 0.9, a2L), bg, 3);
  // two accents that read as one colour add nothing: turn the second one until it stands apart
  for (let i = 0; !brand?.secondary && i < 6 && deltaE(accent, accent2) < 25; i++) {
    a2Hue = (a2Hue + 50) % 360;
    accent2 = ensureContrast(hslToHex(a2Hue, accSat * 0.9, a2L), bg, 3);
  }
  return { palette: { bg, fg, accent, accent2 }, scheme, tone };
}

/** Build a look from brief text + seed (+ optional brand). Pure and deterministic. */
export function generateLook({ briefText = "", seed, brand = null }: { briefText?: string; seed?: number; brand?: Brand | null } = {}): Look {
  const s = Number.isInteger(seed) ? (seed as number) : seedFromText(briefText);
  const r = rng(s);
  const scores = moodScores(briefText);
  const character = chooseCharacter(r, scores, brand?.motion);
  const m = MOTION[character];
  const [display, dw, body, bw] = pairingFor(r, character, brand);
  const { palette } = paletteFor(r, character, brand, hueHints(briefText));
  const ease = r() < 0.6 ? m.ease : pick(r, ALT_EASES[character]);
  const look: Look = {
    version: 1,
    name: brand?.name ? `${String(brand.name).toLowerCase()} ${pick(r, NOUNS)}` : `${pick(r, ADJECTIVES)} ${pick(r, NOUNS)}`,
    palette,
    type: { display: { family: display, weight: dw }, body: { family: body, weight: bw } },
    motion: { character, ease, duration_scale: round(m.duration_scale * (0.9 + r() * 0.2), 2) },
    texture: { grain: round(between(r, m.grain), 2), vignette: round(between(r, m.vignette), 2) },
    source: brand ? "brand" : "brief",
    seed: s,
  };
  return look;
}

// ---------------------------------------------------------------------------
// validation

/** look.json as read from disk: any part may be missing; validateLook says what is wrong. */
export type LookInput = Partial<Look>;

export function validateLook(look: LookInput, { projectDir = null }: { projectDir?: string | null } = {}): LookCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: LookCheck["info"] = {};
  const isObj = (v: unknown): v is object => (v && typeof v === "object" && !Array.isArray(v)) as boolean;
  if (!isObj(look)) return { ok: false, errors: ["look.json is not a JSON object"], warnings, info };
  if (look.version !== 1) errors.push(`version must be 1 (got ${JSON.stringify(look.version)})`);
  if (typeof look.name !== "string" || !look.name.trim()) errors.push("name must be a non-empty string");
  const pal = look.palette;
  if (!isObj(pal)) errors.push("palette must be an object with bg, fg, accent and accent2");
  else for (const k of ["bg", "fg", "accent", "accent2"] as const) if (!parseHex(pal[k])) errors.push(`palette.${k} must be a hex colour like #0B1020 (got ${JSON.stringify(pal[k])})`);
  for (const k of ["display", "body"] as const) {
    const t = look.type?.[k];
    if (!isObj(t) || typeof t.family !== "string" || !t.family.trim()) errors.push(`type.${k}.family must be a font family name`);
    else {
      if (!Number.isInteger(t.weight) || t.weight < 100 || t.weight > 900) errors.push(`type.${k}.weight must be 100-900 (got ${JSON.stringify(t.weight)})`);
      if (!ENGINE_FONTS.includes(t.family)) {
        if (!t.src) warnings.push(`type.${k} "${t.family}" is not in the engine's auto-resolved fonts: add an @font-face with a local .woff2 (lint rule font_family_without_font_face), or set type.${k}.src`);
        else if (projectDir && !isAbsolute(t.src) && !existsSync(join(projectDir, t.src))) errors.push(`type.${k}.src ${t.src} does not exist in the project`);
      }
    }
  }
  const mo = look.motion;
  if (!isObj(mo)) errors.push("motion must be an object");
  else {
    if (!CHARACTERS.includes(mo.character)) errors.push(`motion.character must be one of ${CHARACTERS.join(", ")} (got ${JSON.stringify(mo.character)})`);
    if (typeof mo.ease !== "string" || !mo.ease.trim()) errors.push("motion.ease must be a GSAP ease string");
    if (typeof mo.duration_scale !== "number" || mo.duration_scale < 0.25 || mo.duration_scale > 4) errors.push("motion.duration_scale must be a number from 0.25 to 4");
  }
  const tx = look.texture;
  if (tx !== undefined) {
    if (!isObj(tx)) errors.push("texture must be an object");
    else for (const k of ["grain", "vignette"] as const) if (tx[k] !== undefined && (typeof tx[k] !== "number" || tx[k] < 0 || tx[k] > 1)) errors.push(`texture.${k} must be a number from 0 to 1`);
  }
  if (look.source !== undefined && typeof look.source !== "string") errors.push("source must be a string");
  if (look.seed !== undefined && !Number.isInteger(look.seed)) errors.push("seed must be an integer");

  if (isObj(pal) && (["bg", "fg", "accent", "accent2"] as const).every((k) => parseHex(pal[k]))) {
    const fgBg = contrast(pal.fg, pal.bg);
    const accBg = contrast(pal.accent, pal.bg);
    const acc2Bg = contrast(pal.accent2, pal.bg);
    const fgOnAcc = contrast(pal.fg, pal.accent);
    const bgOnAcc = contrast(pal.bg, pal.accent);
    info.contrast = { fg_bg: fgBg, accent_bg: accBg, accent2_bg: acc2Bg, fg_on_accent: fgOnAcc, bg_on_accent: bgOnAcc };
    info.textOnAccent = fgOnAcc >= bgOnAcc ? "fg" : "bg";
    if (fgBg < 4.5) errors.push(`fg on bg contrast is ${fgBg}:1; body text needs at least 4.5:1 (WCAG AA)`);
    else if (fgBg < 7) warnings.push(`fg on bg contrast is ${fgBg}:1; 7:1 (AAA) reads better on phones and through compression`);
    if (accBg < 3) errors.push(`accent on bg contrast is ${accBg}:1; accents, shapes and large text need at least 3:1`);
    if (acc2Bg < 3) warnings.push(`accent2 on bg contrast is ${acc2Bg}:1; use it only for decoration, or lift it to 3:1`);
    if (Math.max(fgOnAcc, bgOnAcc) < 4.5) warnings.push(`text on an accent fill reaches only ${Math.max(fgOnAcc, bgOnAcc)}:1; keep accent fills free of small text`);
    if (deltaE(pal.accent, pal.accent2) < 12) warnings.push("accent and accent2 are almost the same colour; the second accent adds nothing");
    if (GENERIC_DISPLAY.includes(look.type?.display?.family as string) && look.source !== "brand") warnings.push(`type.display "${look.type!.display.family}" is one of the most common UI fonts and reads as a default; pick a display face with more character unless the brand uses it`);
    const [h] = hexToHsl(pal.accent);
    if (luminance(pal.bg) < 0.05 && isCliche(h) && look.source !== "brand") warnings.push("dark background with an indigo/violet accent is the generic AI-video look; pick another hue unless the brand asks for it");
  }
  return { ok: errors.length === 0, errors, warnings, info };
}

// ---------------------------------------------------------------------------
// difference

export function diffLooks(a: Look, b: Look): LookDiff {
  const pd = (x: string, y: string): number => Math.min(deltaE(x, y) / 60, 1);
  const pa = a.palette;
  const pb = b.palette;
  const direct = (pd(pa.accent, pb.accent) + pd(pa.accent2, pb.accent2)) / 2;
  const swapped = (pd(pa.accent, pb.accent2) + pd(pa.accent2, pb.accent)) / 2;
  const palette = (pd(pa.bg, pb.bg) + pd(pa.fg, pb.fg) + 2 * Math.min(direct, swapped)) / 4;
  const fam = (x: unknown): string => String(x ?? "").trim().toLowerCase();
  const type = 0.6 * (fam(a.type?.display?.family) === fam(b.type?.display?.family) ? 0 : 1) + 0.4 * (fam(a.type?.body?.family) === fam(b.type?.body?.family) ? 0 : 1);
  const motion =
    0.7 * (a.motion?.character === b.motion?.character ? 0 : 1) +
    0.15 * (a.motion?.ease === b.motion?.ease ? 0 : 1) +
    0.15 * Math.min(Math.abs((a.motion?.duration_scale ?? 1) - (b.motion?.duration_scale ?? 1)), 1);
  const ta = a.texture ?? {};
  const tb = b.texture ?? {};
  const texture = Math.min((Math.abs((ta.grain ?? 0) - (tb.grain ?? 0)) / 0.15 + Math.abs((ta.vignette ?? 0) - (tb.vignette ?? 0)) / 0.5) / 2, 1);
  const score = round(0.4 * palette + 0.25 * type + 0.25 * motion + 0.1 * texture, 3);
  return { score, parts: { palette: round(palette, 3), type: round(type, 3), motion: round(motion, 3), texture: round(texture, 3) } };
}

// ---------------------------------------------------------------------------
// files

export function lookPathOf(target: string): string {
  const p = resolve(target);
  if (existsSync(p) && statSync(p).isDirectory()) return join(p, ".cutscene", "look.json");
  return p;
}
export function projectOfLook(lookPath: string): string {
  const dir = dirname(lookPath);
  return basename(dir) === ".cutscene" ? dirname(dir) : dir;
}
export function readLook(target: string): { path: string; look: Look } {
  const p = lookPathOf(target);
  if (!existsSync(p)) throw Object.assign(new Error(`No look.json at ${p}`), { code: "LOOK_NOT_FOUND" });
  try {
    return { path: p, look: JSON.parse(readFileSync(p, "utf8")) as Look };
  } catch (e) {
    throw Object.assign(new Error(`${p} is not valid JSON (${(e as Error).message})`), { code: "LOOK_INVALID_JSON" });
  }
}

/** Previous projects' looks under dir (each <dir>/<project>/.cutscene/look.json), newest first. */
export function previousLooks(dir: string, { exclude = null, last = 5 }: { exclude?: string | null; last?: number } = {}): PreviousLook[] {
  const root = resolve(dir);
  if (!existsSync(root)) return [];
  const out: PreviousLook[] = [];
  const consider = (projectDir: string): void => {
    const p = join(projectDir, ".cutscene", "look.json");
    if (!existsSync(p)) return;
    if (exclude && resolve(p) === resolve(exclude)) return;
    try {
      out.push({ project: projectDir, path: p, mtime: statSync(p).mtimeMs, look: JSON.parse(readFileSync(p, "utf8")) as Look });
    } catch {
      /* unreadable look: ignore */
    }
  };
  consider(root);
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory() && name !== ".cutscene") consider(full);
  }
  out.sort((a, b) => b.mtime - a.mtime || a.project.localeCompare(b.project));
  return out.slice(0, last);
}

export interface CompareRow extends LookDiff {
  project: string;
  name: string | null;
}

export function compareAgainst(look: Look, previous: PreviousLook[], threshold = DEFAULT_THRESHOLD): { rows: CompareRow[]; tooSimilar: CompareRow[]; closest: CompareRow | null } {
  const rows: CompareRow[] = previous.map((p) => ({ project: p.project, name: p.look?.name ?? null, ...diffLooks(look, p.look) }));
  const tooSimilar = rows.filter((r) => r.score < threshold);
  const closest = rows.reduce<CompareRow | null>((m, r) => (m === null || r.score < m.score ? r : m), null);
  return { rows, tooSimilar, closest };
}

// 3D titles (cutscene-3d) need their own copy of the display font: Three.js can't read .woff2,
// and engine fonts have no file in the project at all. The 3D part pins a .woff per family.
const MANIFEST_3D = resolve(HERE, "..", "..", "cutscene-3d", "assets", "manifest.json");
const fontSlug = (family: unknown): string => String(family ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cutsceneHome = (): string => (process.env.CUTSCENE_HOME?.trim() ? resolve(process.env.CUTSCENE_HOME.trim()) : join(homedir(), ".cutscene"));
let pins3d: FontPin[] | null = null;
export function fontPin3d(family: unknown, weight = 700): FontPin | null {
  if (pins3d === null) {
    try {
      pins3d = (JSON.parse(readFileSync(MANIFEST_3D, "utf8")) as { downloads: FontPin[] }).downloads.filter((d) => d.kind === "font");
    } catch {
      pins3d = [];
    }
  }
  const same = pins3d.filter((d) => d.family === fontSlug(family));
  if (!same.length) return null;
  return same.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best));
}
function cachedPinPath(pin: FontPin): string | null {
  const p = join(cutsceneHome(), "assets", pin.sha256, basename(new URL(pin.url).pathname));
  try {
    return createHash("sha256").update(readFileSync(p)).digest("hex") === pin.sha256 ? p : null;
  } catch {
    return null;
  }
}

/**
 * Make the display font ready for 3D titles, or say up front what they will do.
 * Copies the pinned .woff into assets/fonts/ when it is already on this computer.
 */
export function prepare3dFont(look: Look, projectDir: string): { copied: string | null; note: string | null } {
  const t = look.type.display;
  if (/^geist( sans)?$/i.test(t.family)) return { copied: null, note: null };
  const pin = fontPin3d(t.family, t.weight);
  const cached = pin && cachedPinPath(pin);
  if (cached) {
    const rel = `assets/fonts/${basename(cached)}`;
    mkdirSync(join(projectDir, "assets", "fonts"), { recursive: true });
    if (!existsSync(join(projectDir, rel))) copyFileSync(cached, join(projectDir, rel));
    return { copied: rel, note: null };
  }
  const blenderReads = t.src ? " Blender 3D shots read the copied .woff2 as it is." : "";
  if (pin) {
    return { copied: null, note: `if this video gets a 3D title, Cutscene 3D needs its own copy of "${t.family}" (${Math.round(pin.size / 1024)} KB, ${pin.license}): ask the user, then run cutscene 3d assets fetch ${pin.name} --yes. Without it, Three.js 3D titles use Geist Bold.${blenderReads}` };
  }
  return { copied: null, note: `3D titles can't use "${t.family}" yet: put a .ttf or .woff of it in assets/fonts/ (Blender also reads .woff2), or 3D titles use Geist Bold.` };
}

function copyBundledFonts(look: Look, projectDir: string): string[] {
  const copied: string[] = [];
  for (const k of ["display", "body"] as const) {
    const t = look.type[k];
    const b = BUNDLED_FONTS[t.family];
    if (!b) continue;
    const weight = b.weights.reduce((best, w) => (Math.abs(w - t.weight) < Math.abs(best - t.weight) ? w : best), b.weights[0]);
    const file = `${b.slug}-latin-${weight}-normal.woff2`;
    const src = join(BUNDLED_DIR, file);
    if (!existsSync(src)) continue;
    const rel = `assets/fonts/${file}`;
    mkdirSync(join(projectDir, "assets", "fonts"), { recursive: true });
    copyFileSync(src, join(projectDir, rel));
    t.src = rel;
    t.weight = weight;
    copied.push(rel);
  }
  return copied;
}

// ---------------------------------------------------------------------------
// CLI

interface CliArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

function parse(argv: string[]): CliArgs {
  const args: CliArgs = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (["json", "force", "strict"].includes(key)) args[key] = true;
      else if (next === undefined || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

const USAGE = `usage:
  node look.mjs new --brief .cutscene/brief.md [--seed N] [--brand <file.json|json>] [--out .cutscene/look.json] [--against <dir>] [--force] [--json]
  node look.mjs check <project|look.json> [--json]
  node look.mjs diff <a> <b> [--json]
  node look.mjs compare <project> --against <dir> [--last 5] [--threshold 0.3] [--strict] [--json]`;

/** Where the CLI writes (tests pass their own). */
export interface CliIo {
  out: (s: string) => void;
  err: (s: string) => void;
}

export function runCli(argv: string[], io: CliIo = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }): number {
  const args = parse(argv);
  const cmd = args._[0];
  const json = !!args.json;
  const emit = (obj: unknown, human: string): void => {
    if (json) io.out(JSON.stringify(obj) + "\n");
    else io.out(human + "\n");
  };
  const fail = (code: string, message: string, hint: string, exit = 1): number => {
    if (json) io.out(JSON.stringify({ ok: false, error: { code, message, hint } }) + "\n");
    else io.err(`${message}${hint ? `\n${hint}` : ""}\n`);
    return exit;
  };
  try {
    if (cmd === "new") {
      const briefPath = resolve((args.brief ?? ".cutscene/brief.md") as string);
      if (!existsSync(briefPath)) return fail("BRIEF_NOT_FOUND", `No brief at ${briefPath}.`, "Write and approve .cutscene/brief.md first, or pass --brief <file>.");
      const briefText = readFileSync(briefPath, "utf8");
      const out = resolve((args.out ?? join(dirname(briefPath), "look.json")) as string);
      if (existsSync(out) && !args.force) return fail("LOOK_EXISTS", `${out} already exists.`, "This video already has a look. Pass --force only when the user asked for a new look.");
      let brand: Brand | null = null;
      try {
        brand = readBrand(args.brand);
      } catch (e) {
        return fail("BRAND_INVALID", `Could not read the brand: ${(e as Error).message}`, 'Pass a JSON file like {"colors":{"primary":"#FF5A1F"},"fonts":{"display":"Poppins"}}.', 2);
      }
      const baseSeed = args.seed !== undefined ? Number(args.seed) : seedFromText(briefText);
      if (!Number.isInteger(baseSeed) || baseSeed < 0) return fail("BAD_SEED", "--seed must be a whole number.", "Example: --seed 1337", 2);
      const projectDir = projectOfLook(out);
      const previous = args.against ? previousLooks(args.against as string, { exclude: out, last: Number(args.last ?? 5) }) : [];
      const threshold = Number(args.threshold ?? DEFAULT_THRESHOLD);
      let look: Look | null = null;
      let tries = 0;
      let comparison: ReturnType<typeof compareAgainst> | null = null;
      // Prefer a different background tone from the newest earlier video (the brand's background
      // wins) and a display font none of the compared videos used (the brand's font wins).
      const lastBg = previous[0]?.look?.palette?.bg;
      const lastTone = !brand?.background && parseHex(lastBg) ? toneOf(lastBg!) : null;
      const usedFonts = brand?.display ? new Set<string>() : new Set(previous.map((p) => String(p.look?.type?.display?.family ?? "").toLowerCase()));
      let differentEnough: Look | null = null;
      let firstValid: Look | null = null;
      for (; tries < 24; tries++) {
        const candidate = generateLook({ briefText, seed: baseSeed + tries * 7919, brand });
        if (!validateLook(candidate).ok) continue;
        firstValid ??= candidate;
        comparison = compareAgainst(candidate, previous, threshold);
        if (comparison.tooSimilar.length) continue;
        if ((!lastTone || toneOf(candidate.palette.bg) !== lastTone) && !usedFonts.has(candidate.type.display.family.toLowerCase())) {
          look = candidate;
          break;
        }
        differentEnough ??= candidate;
      }
      look ??= differentEnough ?? firstValid;
      if (!look) return fail("LOOK_FAILED", "Could not generate a valid look.", "Try another --seed.");
      comparison = compareAgainst(look, previous, threshold);
      const fonts = copyBundledFonts(look, projectDir);
      const font3d = prepare3dFont(look, projectDir);
      if (font3d.copied) fonts.push(font3d.copied);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(look, null, 2) + "\n");
      const check = validateLook(look, { projectDir });
      if (font3d.note) check.warnings.push(font3d.note);
      if (brand) {
        for (const [role, key] of [["primary", "accent"], ["secondary", "accent2"], ["background", "bg"], ["text", "fg"]] as const) {
          if (brand[role] && brand[role] !== look.palette[key]) check.warnings.push(`brand ${role} ${brand[role]} was adjusted to ${look.palette[key]} for contrast; keep the original in logos and product shots`);
        }
      }
      const similar = comparison?.tooSimilar ?? [];
      emit(
        { ok: true, path: out, look, fontsCopied: fonts, font3d: font3d.copied ?? null, warnings: check.warnings, compared: previous.length, tooSimilar: similar.map((s) => ({ project: s.project, score: s.score })) },
        [
          `Wrote ${out}: "${look.name}" (${look.motion.character}, ${look.type.display.family} + ${look.type.body.family}, seed ${look.seed})`,
          `  palette bg ${look.palette.bg} (${toneOf(look.palette.bg)})  fg ${look.palette.fg}  accent ${look.palette.accent}  accent2 ${look.palette.accent2}`,
          fonts.length ? `  copied fonts: ${fonts.join(", ")} (declare the .woff2 files with @font-face${font3d.copied ? "; the .woff is for 3D titles" : ""})` : null,
          previous.length ? `  compared with ${previous.length} earlier look(s)${similar.length ? `; still close to ${similar.map((s) => basename(s.project)).join(", ")}` : ", all different enough"}` : null,
          ...check.warnings.map((w) => `  note: ${w}`),
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return 0;
    }
    if (cmd === "check") {
      if (!args._[1]) return fail("USAGE", "check needs a project folder or a look.json path.", USAGE, 2);
      const { path, look } = readLook(args._[1]);
      const res = validateLook(look, { projectDir: projectOfLook(path) });
      emit(
        { ok: res.ok, path, errors: res.errors, warnings: res.warnings, ...res.info },
        [
          res.ok ? `look.json OK: ${path}` : `look.json has problems: ${path}`,
          res.info.contrast ? `  contrast fg/bg ${res.info.contrast.fg_bg}:1  accent/bg ${res.info.contrast.accent_bg}:1  accent2/bg ${res.info.contrast.accent2_bg}:1  text on accent: use ${res.info.textOnAccent}` : null,
          ...res.errors.map((e) => `  error: ${e}`),
          ...res.warnings.map((w) => `  note: ${w}`),
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return res.ok ? 0 : 1;
    }
    if (cmd === "diff") {
      if (args._.length < 3) return fail("USAGE", "diff needs two looks (project folders or look.json paths).", USAGE, 2);
      const a = readLook(args._[1]);
      const b = readLook(args._[2]);
      const d = diffLooks(a.look, b.look);
      emit(
        { ok: true, a: a.path, b: b.path, ...d, threshold: DEFAULT_THRESHOLD, tooSimilar: d.score < DEFAULT_THRESHOLD },
        `difference ${d.score} (0 = same look, 1 = nothing in common)  palette ${d.parts.palette}  type ${d.parts.type}  motion ${d.parts.motion}  texture ${d.parts.texture}${d.score < DEFAULT_THRESHOLD ? "\n  these two looks are too similar" : ""}`,
      );
      return 0;
    }
    if (cmd === "compare") {
      if (!args._[1] || !args.against || args.against === true) return fail("USAGE", "compare needs a project and --against <folder with earlier projects>.", USAGE, 2);
      const { path, look } = readLook(args._[1]);
      const threshold = Number(args.threshold ?? DEFAULT_THRESHOLD);
      const previous = previousLooks(args.against as string, { exclude: path, last: Number(args.last ?? 5) });
      const { rows, tooSimilar, closest } = compareAgainst(look, previous, threshold);
      const ok = !(args.strict && tooSimilar.length);
      emit(
        { ok, path, threshold, compared: rows.length, rows, tooSimilar: tooSimilar.map((r) => ({ project: r.project, score: r.score })), closest: closest && { project: closest.project, score: closest.score } },
        [
          rows.length ? `compared "${look.name}" with ${rows.length} earlier look(s)` : "no earlier looks found to compare with",
          ...rows.map((r) => `  ${r.score < threshold ? "TOO SIMILAR" : "ok         "} ${r.score.toFixed(3)}  ${basename(r.project)}${r.name ? ` ("${r.name}")` : ""}`),
          tooSimilar.length ? `warning: this look is too close to ${tooSimilar.length} earlier video(s). Make a new one: node look.mjs new --force --against ${args.against}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return ok ? 0 : 1;
    }
    return fail("USAGE", cmd ? `Unknown command "${cmd}".` : "Missing command.", USAGE, 2);
  } catch (e) {
    return fail((e as Error & { code?: string }).code ?? "LOOK_ERROR", (e as Error).message, "Check the path and try again.", 1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
