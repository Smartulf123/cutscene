// Write a Tier 1 (Three.js) shot into a Cutscene project as a sub-composition:
//   compositions/scene3d-<id>.html  + compositions/assets/3d/{fonts,models,vendor}/...
// Values come from the spec and look.json and are baked into the file as its defaults.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyInto, findItem, isCached, assetPath, loadManifest, fetchAsset } from "./assets.mjs";
import { cutsceneError, writeFileAtomic } from "./project.mjs";
import { DEFAULT_LOOK, TIER1_TEMPLATES, merge, BUNDLED_FONT } from "./spec.mjs";
import type { Look, Palette, Params, ShotSpec } from "./spec.mjs";

/** The config baked into a Tier 1 shot (read by templates/tier1/_boot.js and cs3d-runtime.js). */
export interface Tier1Config {
  template: string;
  id: string;
  width: number;
  height: number;
  duration: number;
  seed: number;
  motion: string;
  palette: Palette;
  transparent: boolean;
  bloom: boolean | string;
  bloomStrength?: number;
  exposure: number;
  vars: Record<string, unknown>;
  vendor?: { postprocessing: string };
  [key: string]: unknown;
}

/** A Studio-editable variable (data-composition-variables). */
export interface Tier1Variable {
  id: string;
  type: string;
  role: string;
  label: string;
  default: unknown;
  maxLength: number;
}

const here = dirname(fileURLToPath(import.meta.url));
export const TIER1_DIR = resolve(here, "..", "..", "templates", "tier1");
export const THREE_VERSION = "0.184.0";

/** Composition id for a shot ("logo" -> "3d-logo"). */
export function compositionId(id: string): string {
  return `scene3d-${String(id).toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
}

/** Safe to drop inside <script>: no "</script" and no U+2028/2029. */
export function scriptJson(obj: unknown): string {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(obj)
    .split("</").join("<\\/")
    .split(LS).join("\\u2028")
    .split(PS).join("\\u2029");
}

/** Safe inside a single-quoted HTML attribute. */
export function attrJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

/** Studio-editable variables for each template (the rest is baked config). */
export function variablesFor(template: string, config: { vars?: Record<string, unknown> }): Tier1Variable[] {
  const v: Tier1Variable[] = [];
  if (["title3d"].includes(template) || config.vars?.text !== undefined) {
    v.push({ id: "text", type: "string", role: "content", label: "Text", default: config.vars?.text ?? "", maxLength: 40 });
  }
  return v;
}

/** Build the baked config object for a Tier 1 template. Pure. */
export function tier1Config(template: string, spec: ShotSpec, { look, assets = {} }: { look?: Look | null; assets?: Record<string, unknown> } = {}): Tier1Config {
  const lk = merge(DEFAULT_LOOK, look || {});
  const palette = merge(lk.palette, spec.palette || {});
  const p: Params = spec.params || {};
  const config: Tier1Config = {
    template,
    id: compositionId(spec.id),
    width: spec.width || 1920,
    height: spec.height || 1080,
    duration: spec.duration || 3,
    seed: Number.isInteger(spec.seed) ? spec.seed! : Number.isInteger(lk.seed) ? lk.seed! : 1337,
    motion: lk.motion?.character || "snappy",
    palette,
    transparent: spec.transparent ?? !["shapes", "flythrough"].includes(template),
    bloom: spec.bloom ?? (["shapes", "flythrough"].includes(template) ? "three" : false),
    bloomStrength: spec.bloom_strength,
    exposure: spec.exposure ? 2 ** spec.exposure : 1,
    face: template === "turntable" ? p.label ?? p.face : p.face,
    sides: p.sides,
    rim: spec.lighting?.rim_color || "accent",
    depth: p.depth,
    bevel: p.bevel,
    tracking: p.tracking,
    swing: p.swing,
    stagger: p.stagger,
    letter_duration: p.letter_duration,
    turns: p.turns,
    count: p.count,
    vars: {},
    ...assets,
  };
  if (template === "title3d") config.vars.text = String(p.text ?? "CUTSCENE");
  for (const k of Object.keys(config)) if (config[k] === undefined) delete config[k];
  return config;
}

/** Fill the template text. Pure (given template sources). */
export function renderTemplate({ html, boot, common, id, config, variables }: { html: string; boot: string; common: string; id: string; config: { width: number; height: number; duration: number; [key: string]: unknown }; variables: unknown }): string {
  const out = html
    .replace("/*__CS3D_BOOT__*/", () => boot)
    .replace("/*__CS3D_COMMON__*/", () => common)
    .replaceAll("__CS3D_ID__", id)
    .replaceAll("__CS3D_WIDTH__", String(config.width))
    .replaceAll("__CS3D_HEIGHT__", String(config.height))
    .replaceAll("__CS3D_DURATION__", String(config.duration))
    .replace("__CS3D_VARIABLES__", () => attrJson(variables));
  return out.replace("__CS3D_CONFIG__", () => scriptJson(config));
}

/** Rewrite postprocessing's bare `three` imports to the pinned three ESM build. */
export function pinThreeImports(js: string, version = THREE_VERSION): string {
  return js.replace(/from\s*["']three["']/g, `from "https://cdn.jsdelivr.net/npm/three@${version}/+esm"`);
}

/**
 * Write the shot. Returns {file, compositionId, snippet, copied:[...], warnings:[...]}.
 */
export async function writeTier1({ template, spec, projectDir, look, font, yes = false, start = 0, track = 2 }: { template: string; spec: ShotSpec; projectDir: string; look?: Look | null; font?: string | null; yes?: boolean; start?: number; track?: number }) {
  if (!TIER1_TEMPLATES[template]) {
    throw cutsceneError("UNKNOWN_TEMPLATE", `There's no Three.js template called "${template}".`, `Choose one of: ${Object.keys(TIER1_TEMPLATES).join(", ")}.`, 2);
  }
  const id = compositionId(spec.id);
  const compDir = join(projectDir, "compositions");
  const assetDir = join(compDir, "assets", "3d");
  const copied: string[] = [];
  const warnings: string[] = [];
  const assets: Record<string, unknown> = {};
  const p: Params = spec.params || {};

  if (["title3d"].includes(template)) {
    const src = font || BUNDLED_FONT;
    const dest = copyInto(src, join(assetDir, "fonts"));
    copied.push(dest);
    assets.font = `assets/3d/fonts/${basename(dest)}`;
    const ofl = join(dirname(BUNDLED_FONT), "Geist-OFL.txt");
    if (src === BUNDLED_FONT && existsSync(ofl)) copied.push(copyInto(ofl, join(assetDir, "fonts")));
  }
  if (template === "logo-svg") {
    const svg = p.svg ? resolve(projectDir, p.svg) : join(here, "..", "..", "templates", "tier2", "cutscene-mark.svg");
    if (!existsSync(svg)) throw cutsceneError("FILE_NOT_FOUND", `The SVG ${svg} doesn't exist.`, "Check params.svg in the spec.");
    const dest = copyInto(svg, join(assetDir, "logos"), `${spec.id}${extname(svg)}`);
    copied.push(dest);
    assets.svg = `assets/3d/logos/${basename(dest)}`;
    assets.keepSvgColors = !!p.keep_svg_colors;
  }
  if (template === "turntable" && p.model) {
    const model = resolve(projectDir, p.model);
    if (!existsSync(model)) throw cutsceneError("FILE_NOT_FOUND", `The model ${model} doesn't exist.`, "Check params.model in the spec.");
    if (!/\.(glb|gltf)$/i.test(model)) throw cutsceneError("MODEL_FORMAT", "Tier 1 turntables need a .glb or .gltf model.", "Convert the model to .glb (Blender can export it), or use Tier 2, which also reads OBJ/FBX.");
    if (/\.gltf$/i.test(model)) warnings.push("A .gltf with separate .bin/texture files must have those files copied next to it in compositions/assets/3d/models/.");
    const dest = copyInto(model, join(assetDir, "models"), `${spec.id}${extname(model)}`);
    copied.push(dest);
    assets.model = `assets/3d/models/${basename(dest)}`;
  }
  const config = tier1Config(template, spec, { look, assets });
  if (config.bloom === "postprocessing") {
    // The bundled manifest always pins postprocessing.
    const item = findItem("postprocessing", loadManifest())!;
    const got = await fetchAsset(item, { yes });
    const vendorDir = join(assetDir, "vendor");
    mkdirSync(vendorDir, { recursive: true });
    const dest = join(vendorDir, `postprocessing-${item.version}.js`);
    writeFileSync(dest, `// postprocessing ${item.version} (Zlib, Raoul van Rüschen), three import pinned for Cutscene.\n` + pinThreeImports(readFileSync(got.path, "utf8")));
    copied.push(dest);
    config.vendor = { postprocessing: `assets/3d/vendor/postprocessing-${item.version}.js` };
  }

  const html = readFileSync(join(TIER1_DIR, `${template}.html`), "utf8");
  const boot = builtScript("_boot.js");
  const common = builtScript("_preamble.js");
  const runtime = join(assetDir, "cs3d-runtime.js");
  writeFileSync(runtime, builtScript("cs3d-runtime.js"));
  copied.push(runtime);
  const text = renderTemplate({ html, boot, common, id, config, variables: variablesFor(template, config) });
  const file = join(compDir, `${id}.html`);
  writeFileAtomic(file, text);
  const snippet = hostSnippet({ id, config, start, track });
  return { file, compositionId: id, snippet, copied, warnings, config };
}

/** A browser script built from src/, without the build's "edit the source" line, which means nothing inside a user's project. */
function builtScript(name: string): string {
  return readFileSync(join(TIER1_DIR, name), "utf8").replace(/^\/\/ Built from .*\n/, "");
}

/** The clip to paste into index.html (inside the root composition). */
export function hostSnippet({ id, config, start = 0, track = 2 }: { id: string; config: { duration: number; width: number; height: number }; start?: number; track?: number }): string {
  return `<div id="${id}-clip" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${config.duration}" data-track-index="${track}" data-width="${config.width}" data-height="${config.height}"></div>`;
}
