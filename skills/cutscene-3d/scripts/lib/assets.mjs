// Pinned downloads for Cutscene 3D (fonts, HDRIs, postprocessing): consent first, SHA-256 checked,
// stored in <CUTSCENE_HOME>/assets/<sha256>/<file>. Also finds a font file for look.json's display face.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cutsceneError, cutsceneHome } from "./project.mjs";
import { BUNDLED_FONT } from "./spec.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = resolve(here, "..", "..", "assets", "manifest.json");

export function loadManifest(path = MANIFEST_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function assetPath(item, home = cutsceneHome()) {
  return join(home, "assets", item.sha256, basename(new URL(item.url).pathname));
}

export function isCached(item, home) {
  const p = assetPath(item, home);
  if (!existsSync(p)) return false;
  try {
    return sha256(readFileSync(p)) === item.sha256;
  } catch {
    return false;
  }
}

export function findItem(name, manifest = loadManifest()) {
  return manifest.downloads.find((d) => d.name === name) || null;
}

/** What a download would fetch (printed before asking for consent). */
export function describe(item) {
  return { name: item.name, size: item.size, license: item.license, source: item.source, url: item.url, credit: item.credit };
}

/** Download a pinned item. Without `yes`, throws NEEDS_CONSENT describing it. */
export async function fetchAsset(item, { yes = false, home = cutsceneHome(), fetchImpl = globalThis.fetch } = {}) {
  const dest = assetPath(item, home);
  if (isCached(item, home)) return { path: dest, cached: true };
  if (!yes) {
    const e = cutsceneError("NEEDS_CONSENT", `Cutscene needs to download ${item.name} (${Math.round(item.size / 1024)} KB, ${item.license}, from ${item.source}).`,
      "Ask the user, then run the same command again with --yes.");
    e.details = describe(item);
    throw e;
  }
  const res = await fetchImpl(item.url);
  if (!res.ok) throw cutsceneError("DOWNLOAD_FAILED", `Downloading ${item.name} failed (HTTP ${res.status}).`, "Check the internet connection and try again.");
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== item.sha256) throw cutsceneError("CHECKSUM_MISMATCH", `${item.name} didn't match its pinned checksum, so Cutscene didn't keep it.`, "Try again later; if it keeps happening, report it.");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  writeFileSync(join(dirname(dest), "SOURCE.txt"), `${item.name}\n${item.url}\n${item.license}\n${item.credit || item.source}\n`);
  return { path: dest, cached: false };
}

/** "Space Grotesk" -> "space-grotesk" (Fontsource slug). */
export function fontSlug(family) {
  return String(family || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The pinned font for a family and weight (nearest weight available). */
export function fontItemFor(family, weight = 700, manifest = loadManifest()) {
  const slug = fontSlug(family);
  const fonts = manifest.downloads.filter((d) => d.kind === "font" && d.family === slug);
  if (!fonts.length) return null;
  return fonts.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best));
}

const SYSTEM_FONT_DIRS = () => {
  if (process.platform === "win32") return [join(process.env.WINDIR || "C:\\Windows", "Fonts"), join(process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts")];
  if (process.platform === "darwin") return ["/Library/Fonts", "/System/Library/Fonts", join(process.env.HOME || "", "Library", "Fonts")];
  return ["/usr/share/fonts", "/usr/local/share/fonts", join(process.env.HOME || "", ".fonts"), join(process.env.HOME || "", ".local", "share", "fonts")];
};

// Font formats each tier can read. Blender (FreeType) reads .woff2 too (checked on Blender 5.2:
// bundled caption .woff2 files extrude like a .ttf). Three.js's TTFLoader (opentype.js) can't
// unpack .woff2, so Tier 1 needs a .ttf, .otf or .woff.
export const FONT_FORMATS = { 1: ["ttf", "otf", "woff"], 2: ["ttf", "otf", "woff", "woff2"] };
const ext = (f) => (/\.([a-z0-9]+)$/i.exec(f)?.[1] || "").toLowerCase();

function walkFonts(dir, depth = 0, out = []) {
  if (depth > 3) return out;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFonts(p, depth + 1, out);
    else if (/\.(ttf|otf|woff2?)$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** Score a font file name against a family + weight ("SpaceGrotesk-Bold.ttf", "space-grotesk-latin-700-normal.woff2"). */
export function scoreFontFile(file, family, weight = 700) {
  const name = basename(file).toLowerCase().replace(/[^a-z0-9]/g, "");
  const fam = String(family).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!fam || !name.startsWith(fam)) return -1;
  const rest = name.slice(fam.length).replace(/(ttf|otf|woff2?)$/, "");
  const words = { 100: "thin", 200: "extralight", 300: "light", 400: "regular", 500: "medium", 600: "semibold", 700: "bold", 800: "extrabold", 900: "black" };
  let score = 10;
  if (rest.includes("italic")) score -= 8;
  if (rest.includes(words[weight] || "bold") || rest.includes(String(weight))) score += 5;
  if (rest === "" || rest === "variablefont" || rest.includes("wght")) score += 2;
  return score;
}

// Best match first; on a tie prefer .ttf/.otf, then .woff, then .woff2.
function rankFonts(files, family, weight) {
  const pref = { ttf: 3, otf: 3, woff: 2, woff2: 1 };
  return files
    .map((f) => [scoreFontFile(f, family, weight), f])
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || (pref[ext(b[1])] || 0) - (pref[ext(a[1])] || 0))
    .map(([, f]) => f);
}

/**
 * Find the display font for a look: the look's own file (type.display.src) and project fonts ->
 * pinned download in the cache -> system fonts -> the bundled Geist Bold. Only formats the tier
 * can read are used (FONT_FORMATS). Returns {path, source, family}; on a fallback also
 * {wanted, missing: pinned manifest item name or null, unreadable: a project file the tier can't
 * read (a .woff2 for Tier 1) or null}.
 */
export function resolveFont({ family, weight = 700, projectDir, src = null, tier = 2, home = cutsceneHome(), manifest = loadManifest(), systemDirs = SYSTEM_FONT_DIRS() } = {}) {
  if (!family || /^geist( sans)?$/i.test(family)) return { path: BUNDLED_FONT, source: "bundled", family: "Geist" };
  const formats = FONT_FORMATS[tier] || FONT_FORMATS[2];
  const readable = (f) => formats.includes(ext(f));
  const candidates = [];
  if (projectDir && src && typeof src === "string") {
    const p = resolve(projectDir, src);
    if (existsSync(p)) candidates.push(p);
  }
  if (projectDir) for (const d of [join(projectDir, "assets", "fonts"), join(projectDir, "fonts")]) candidates.push(...walkFonts(d));
  const inProject = rankFonts([...new Set(candidates)], family, weight);
  const usable = inProject.filter(readable);
  if (usable.length) return { path: usable[0], source: "project", family };
  const item = fontItemFor(family, weight, manifest);
  if (item && isCached(item, home)) return { path: assetPath(item, home), source: "cache", family };
  const sys = rankFonts(systemDirs.flatMap((d) => walkFonts(d)), family, weight).filter(readable);
  if (sys.length) return { path: sys[0], source: "system", family };
  return { path: BUNDLED_FONT, source: "bundled", family: "Geist", missing: item ? item.name : null, wanted: family, unreadable: inProject[0] || null };
}

/** One plain sentence about a font fallback (or null when the look's font is used). */
export function fontFallbackWarning(font, tier = 2) {
  if (!font?.wanted) return null;
  const fetch = font.missing ? ` Get a copy 3D can read with: cutscene 3d assets fetch ${font.missing} --yes (ask the user first).` : "";
  if (font.unreadable) {
    return `The look's font "${font.wanted}" is in the project only as .${ext(font.unreadable)}, which Three.js 3D titles can't read; this shot uses Geist Bold.${fetch || " Put a .ttf or .woff of it in the project's assets/fonts/."} A Blender (Tier 2) shot reads it as it is.`;
  }
  if (font.missing) return `The look's font "${font.wanted}" isn't on this computer yet; this shot uses Geist Bold.${fetch}`;
  return `The look's font "${font.wanted}" wasn't found; this shot uses Geist Bold. Put a .ttf or .woff of it in the project's assets/fonts/${tier === 2 ? " (Blender also reads .woff2)" : ""}.`;
}

/** Copy a file into a folder, returning the new path. */
export function copyInto(file, dir, name = basename(file)) {
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, name);
  copyFileSync(file, dest);
  return dest;
}
