// Tests for the look system (skills/cutscene-design/scripts/look.mjs, from overlays/cutscene-design).
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUNDLED_FONTS,
  CHARACTERS,
  ENGINE_FONTS,
  GENERIC_DISPLAY,
  TONES,
  deltaE,
  hexToHsl,
  hueHints,
  toneOf,
  PAIRINGS,
  fontPin3d,
  MOTION,
  contrast,
  diffLooks,
  generateLook,
  readBrand,
  runCli,
  validateLook,
  DEFAULT_THRESHOLD,
} from "../../skills/cutscene-design/scripts/look.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOOK = join(ROOT, "skills", "cutscene-design", "scripts", "look.mjs");
const BRIEF_A = "A fast, punchy launch video for our developer tool. Tech startup energy, 20 seconds.";
const BRIEF_B = "A calm, gentle wellness explainer about sleep and meditation.";

function project(root, name, brief) {
  const dir = join(root, name);
  mkdirSync(join(dir, ".cutscene"), { recursive: true });
  writeFileSync(join(dir, ".cutscene", "brief.md"), brief);
  return dir;
}
function cli(args) {
  const out = [];
  const err = [];
  const code = runCli(args, { out: (s) => out.push(s), err: (s) => err.push(s) });
  const text = out.join("");
  return { code, text, err: err.join(""), json: args.includes("--json") && text ? JSON.parse(text.trim()) : null };
}
const tmp = () => mkdtempSync(join(tmpdir(), "cutscene-look-"));

describe("font choice", () => {
  const BRIEFS = [BRIEF_A, BRIEF_B, "A playful kids game trailer", "A cinematic luxury perfume teaser", "A data-driven news explainer"];
  it("never picks Inter, Poppins, Open Sans or Roboto as the display face unless the brand does", () => {
    const brand = readBrand(JSON.stringify({ colors: { primary: "#FF5A1F", background: "#101010" } }));
    for (const briefText of BRIEFS) {
      for (let seed = 0; seed < 80; seed++) {
        for (const b of [null, brand]) {
          const look = generateLook({ briefText, seed, brand: b });
          expect(GENERIC_DISPLAY, `${briefText} ${seed}`).not.toContain(look.type.display.family);
        }
      }
    }
    // A brand that asks for one keeps it.
    const poppins = generateLook({ briefText: BRIEF_A, brand: readBrand('{"fonts":{"display":"Poppins"}}') });
    expect(poppins.type.display.family).toBe("Poppins");
    expect(validateLook(poppins).warnings.join(" ")).not.toMatch(/most common UI fonts/);
  });

  it("brand colours without fonts still draw from the curated pairs, with variety", () => {
    const brand = readBrand(JSON.stringify({ colors: { primary: "#FF5A1F" } }));
    const pairs = new Set();
    for (let seed = 0; seed < 120; seed++) {
      const l = generateLook({ briefText: BRIEF_A, seed, brand });
      const key = `${l.type.display.family}|${l.type.body.family}`;
      expect(PAIRINGS.some((p) => `${p[0]}|${p[2]}` === key), key).toBe(true);
      pairs.add(key);
    }
    expect(pairs.size).toBeGreaterThanOrEqual(8);
  });

  it("a brand display font gets a matching body, not a default", () => {
    const l = generateLook({ briefText: BRIEF_A, brand: readBrand('{"fonts":{"display":"Bodoni Moda"}}') });
    expect(l.type.display.family).toBe("Bodoni Moda");
    expect(l.type.body.family).toBe("Lato"); // the curated partner of Bodoni Moda
    const body = generateLook({ briefText: BRIEF_A, seed: 3, brand: readBrand('{"fonts":{"body":"Lato"}}') });
    expect(body.type.body.family).toBe("Lato");
    expect(GENERIC_DISPLAY).not.toContain(body.type.display.family);
  });

  it("every curated display face has a pinned font that 3D titles can read", () => {
    for (const [display, weight] of PAIRINGS) {
      const pin = fontPin3d(display, weight);
      expect(pin, display).toBeTruthy();
      expect(pin.url, display).toMatch(/\.woff$/);
    }
  });
});

describe("background tones and brief colour cues", () => {
  const BRIEFS = [BRIEF_A, BRIEF_B, "A playful kids game trailer", "A cinematic luxury perfume teaser", "A data-driven news explainer"];
  it("uses every background tone, not only near-white and near-black", () => {
    const tones = new Set();
    for (let seed = 0; seed < 300; seed++) tones.add(toneOf(generateLook({ briefText: BRIEFS[seed % 5], seed }).palette.bg));
    expect([...tones].sort()).toEqual([...TONES].sort());
  });
  it("never makes a deep navy or indigo field, and never a field of the brand's own colour", () => {
    const brand = readBrand('{"colors":{"primary":"#FF5A1F"}}');
    for (let seed = 0; seed < 300; seed++) {
      const l = generateLook({ briefText: BRIEFS[seed % 5], seed });
      const [h] = hexToHsl(l.palette.bg);
      if (toneOf(l.palette.bg) === "deep") expect(h >= 228 && h <= 272, `seed ${seed} ${l.palette.bg}`).toBe(false);
      const b = generateLook({ briefText: BRIEFS[seed % 5], seed, brand });
      expect(toneOf(b.palette.bg), `seed ${seed}`).not.toBe("vivid");
      // the brand's primary stays the accent (only its lightness may move for contrast)
      expect(Math.abs(hexToHsl(b.palette.accent)[0] - hexToHsl("#FF5A1F")[0]), `seed ${seed} ${b.palette.accent}`).toBeLessThan(4);
    }
  });
  it("reads colour cues in the brief (warm, trust, fresh...)", () => {
    expect(hueHints("A calm, warm podcast")).toEqual([[12, 45], [165, 210]]);
    expect(hueHints("A fintech explainer about invoices")).toEqual([[150, 205]]);
    expect(hueHints("A video")).toEqual([]);
    for (let seed = 0; seed < 60; seed++) {
      const l = generateLook({ briefText: "A warm and cozy coffee shop promo", seed });
      if (toneOf(l.palette.bg) === "vivid") continue; // there the accent is the complement of the field
      const [h] = hexToHsl(l.palette.accent);
      expect(h, `seed ${seed} ${l.palette.accent}`).toBeGreaterThanOrEqual(8);
      expect(h, `seed ${seed} ${l.palette.accent}`).toBeLessThanOrEqual(50);
    }
  });
  it("keeps the two accents apart", () => {
    for (let seed = 0; seed < 200; seed++) {
      const l = generateLook({ briefText: BRIEFS[seed % 5], seed });
      expect(deltaE(l.palette.accent, l.palette.accent2), `seed ${seed}`).toBeGreaterThanOrEqual(25);
    }
  });
  it("`new --against` picks another background tone and display font than the earlier videos", () => {
    const root = tmp();
    try {
      for (const [i, brief] of ["A fitness app promo, energetic", "A calm, warm podcast trailer", "A fintech explainer: trust, data, charts"].entries()) {
        const p = project(root, `p${i}`, brief);
        const before = previousLooksFor(root);
        const r = cli(["new", "--brief", join(p, ".cutscene", "brief.md"), "--against", root, "--json"]);
        expect(r.code).toBe(0);
        const fonts = before.map((l) => l.type.display.family);
        expect(fonts).not.toContain(r.json.look.type.display.family);
        if (before.length) expect(toneOf(r.json.look.palette.bg)).not.toBe(toneOf(before.at(-1).palette.bg));
        utimesSync(join(p, ".cutscene", "look.json"), new Date(Date.now() + i * 1000), new Date(Date.now() + i * 1000));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function previousLooksFor(root) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    try {
      out.push(JSON.parse(readFileSync(join(root, `p${i}`, ".cutscene", "look.json"), "utf8")));
    } catch {
      /* not made yet */
    }
  }
  return out;
}

describe("colour maths", () => {
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#FFFFFF")).toBe(21);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBe(1);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
  });
});

describe("generateLook", () => {
  it("is deterministic for the same brief and seed", () => {
    expect(generateLook({ briefText: BRIEF_A, seed: 1337 })).toEqual(generateLook({ briefText: BRIEF_A, seed: 1337 }));
    expect(generateLook({ briefText: BRIEF_A })).toEqual(generateLook({ briefText: BRIEF_A }));
  });

  it("varies with the seed and with the brief", () => {
    const a = generateLook({ briefText: BRIEF_A, seed: 1 });
    const b = generateLook({ briefText: BRIEF_A, seed: 2 });
    expect(a).not.toEqual(b);
    expect(generateLook({ briefText: BRIEF_A }).seed).not.toBe(generateLook({ briefText: BRIEF_B }).seed);
  });

  it("always produces a valid look with passing contrast (200 seeds)", () => {
    const characters = new Set();
    for (let seed = 0; seed < 200; seed++) {
      const look = generateLook({ briefText: seed % 2 ? BRIEF_A : BRIEF_B, seed });
      const res = validateLook(look);
      expect(res.errors, `seed ${seed}`).toEqual([]);
      expect(res.info.contrast.fg_bg).toBeGreaterThanOrEqual(7);
      expect(res.info.contrast.accent_bg).toBeGreaterThanOrEqual(3);
      expect(CHARACTERS).toContain(look.motion.character);
      characters.add(look.motion.character);
    }
    expect(characters.size).toBe(5); // every motion character shows up across briefs and seeds
  });

  it("leans the motion character toward the brief's mood", () => {
    const count = (brief, c) => Array.from({ length: 60 }, (_, s) => generateLook({ briefText: brief, seed: s })).filter((l) => l.motion.character === c).length;
    expect(count(BRIEF_B, "smooth")).toBeGreaterThan(count(BRIEF_A, "smooth"));
    expect(count(BRIEF_A, "snappy")).toBeGreaterThan(count(BRIEF_B, "snappy"));
  });

  it("uses only fonts the engine renders or that Cutscene bundles", () => {
    for (let seed = 0; seed < 100; seed++) {
      const look = generateLook({ briefText: BRIEF_A, seed });
      for (const k of ["display", "body"]) {
        const f = look.type[k].family;
        expect(ENGINE_FONTS.includes(f) || f in BUNDLED_FONTS, f).toBe(true);
        if (f in BUNDLED_FONTS) {
          const b = BUNDLED_FONTS[f];
          for (const w of b.weights) expect(existsSync(join(ROOT, "skills", "cutscene-captions", "modes", "standard", "fonts", "files", `${b.slug}-latin-${w}-normal.woff2`)), `${f} ${w}`).toBe(true);
        }
      }
    }
  });

  it("keeps brand colours (adjusting lightness only for contrast) and brand fonts", () => {
    const brand = readBrand(JSON.stringify({ name: "Acme", colors: { primary: "#FF5A1F", secondary: "#1F8FFF", background: "#FFF8F2" }, fonts: { display: "Poppins", body: "Lato" } }));
    const look = generateLook({ briefText: BRIEF_A, seed: 5, brand });
    expect(look.source).toBe("brand");
    expect(look.palette.bg).toBe("#FFF8F2");
    expect(look.type.display.family).toBe("Poppins");
    expect(look.type.body.family).toBe("Lato");
    expect(contrast(look.palette.accent, look.palette.bg)).toBeGreaterThanOrEqual(3);
    expect(validateLook(look).ok).toBe(true);
  });

  it("reads a captured site's ordered colour list as a brand", () => {
    const b = readBrand(JSON.stringify({ title: "Site", colors: ["#FFFFFF", "#111111", "#E8E8E8", "#00A86B", "#FFB000"], fonts: ["Inter"] }));
    expect(b.background).toBe("#FFFFFF");
    expect(["#00A86B", "#FFB000"]).toContain(b.primary);
    expect(b.text).toBe("#111111");
    expect(b.display).toBe("Inter");
  });
});

describe("validateLook", () => {
  const good = () => generateLook({ briefText: BRIEF_A, seed: 42 });

  it("rejects schema errors with plain messages", () => {
    const l = good();
    l.version = 2;
    l.palette.bg = "navy";
    l.motion.character = "wobbly";
    const res = validateLook(l);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/version must be 1/);
    expect(res.errors.join("\n")).toMatch(/palette\.bg must be a hex colour/);
    expect(res.errors.join("\n")).toMatch(/motion\.character must be one of/);
  });

  it("fails low text contrast and weak accents, and warns about the generic AI look", () => {
    const l = good();
    l.palette = { bg: "#0B1020", fg: "#333344", accent: "#1A1F33", accent2: "#6366F1" };
    l.source = "brief";
    const res = validateLook(l);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.startsWith("fg on bg contrast"))).toBe(true);
    expect(res.errors.some((e) => e.startsWith("accent on bg contrast"))).toBe(true);
    const cliche = { ...good(), palette: { bg: "#0B1020", fg: "#F4F3EE", accent: "#6366F1", accent2: "#FF7A45" }, source: "brief" };
    expect(validateLook(cliche).warnings.join(" ")).toMatch(/generic AI-video look/);
  });

  it("notes fonts that need an @font-face", () => {
    const l = good();
    l.type.display = { family: "Comic Neue", weight: 700 };
    expect(validateLook(l).warnings.join(" ")).toMatch(/font_family_without_font_face/);
  });

  it("accepts the example in the contracts", () => {
    const example = {
      version: 1,
      name: "midnight signal",
      palette: { bg: "#0B1020", fg: "#F4F3EE", accent: "#5B8DEF", accent2: "#FF7A45" },
      type: { display: { family: "Space Grotesk", weight: 700 }, body: { family: "Inter", weight: 500 } },
      motion: { character: "snappy", ease: "power3.out", duration_scale: 1.0 },
      texture: { grain: 0.06, vignette: 0.2 },
      source: "brief",
      seed: 1337,
    };
    expect(validateLook(example).errors).toEqual([]);
  });
});

describe("diffLooks", () => {
  it("scores identical looks 0 and unrelated looks high", () => {
    const a = generateLook({ briefText: BRIEF_A, seed: 1 });
    expect(diffLooks(a, a).score).toBe(0);
    const b = { ...a, palette: { bg: "#FAF7F0", fg: "#141210", accent: "#C2410C", accent2: "#15803D" }, type: { display: { family: "Playfair Display", weight: 700 }, body: { family: "Lato", weight: 400 } }, motion: { character: a.motion.character === "smooth" ? "bouncy" : "smooth", ease: "sine.inOut", duration_scale: 1.25 } };
    expect(diffLooks(a, b).score).toBeGreaterThan(0.5);
  });

  it("treats a swapped accent pair as the same palette", () => {
    const a = generateLook({ briefText: BRIEF_A, seed: 9 });
    const b = { ...a, palette: { ...a.palette, accent: a.palette.accent2, accent2: a.palette.accent } };
    expect(diffLooks(a, b).parts.palette).toBe(0);
  });

  it("documents a concrete GSAP ease for every motion character", () => {
    const doc = readFileSync(join(ROOT, "skills", "cutscene-design", "references", "look-system.md"), "utf8");
    for (const c of CHARACTERS) {
      expect(doc).toContain(`**${c}**`);
      expect(doc).toContain(MOTION[c].ease);
    }
  });
});

describe("look CLI", () => {
  it("`new` writes the same look.json twice for the same brief and seed, and refuses to overwrite", () => {
    const root = tmp();
    try {
      const p1 = project(root, "one", BRIEF_A);
      const p2 = project(root, "two", BRIEF_A);
      expect(cli(["new", "--brief", join(p1, ".cutscene", "brief.md"), "--seed", "77"]).code).toBe(0);
      expect(cli(["new", "--brief", join(p2, ".cutscene", "brief.md"), "--seed", "77"]).code).toBe(0);
      const a = JSON.parse(readFileSync(join(p1, ".cutscene", "look.json"), "utf8"));
      const b = JSON.parse(readFileSync(join(p2, ".cutscene", "look.json"), "utf8"));
      expect(a).toEqual(b);
      const again = cli(["new", "--brief", join(p1, ".cutscene", "brief.md"), "--json"]);
      expect(again.code).toBe(1);
      expect(again.json.error.code).toBe("LOOK_EXISTS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("`new --against` avoids a look that matches an earlier video", () => {
    const root = tmp();
    try {
      const old = project(root, "earlier", BRIEF_A);
      cli(["new", "--brief", join(old, ".cutscene", "brief.md")]);
      const fresh = project(root, "fresh", BRIEF_A); // same brief, so the same seed would give the same look
      const r = cli(["new", "--brief", join(fresh, ".cutscene", "brief.md"), "--against", root, "--json"]);
      expect(r.code).toBe(0);
      expect(r.json.compared).toBe(1);
      expect(r.json.tooSimilar).toEqual([]);
      const a = JSON.parse(readFileSync(join(old, ".cutscene", "look.json"), "utf8"));
      const b = JSON.parse(readFileSync(join(fresh, ".cutscene", "look.json"), "utf8"));
      expect(diffLooks(a, b).score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("`compare` warns when too similar, and fails with --strict", () => {
    const root = tmp();
    try {
      const a = project(root, "a", BRIEF_A);
      const b = project(root, "b", BRIEF_A);
      const c = project(root, "c", BRIEF_B);
      cli(["new", "--brief", join(a, ".cutscene", "brief.md"), "--seed", "3"]);
      cli(["new", "--brief", join(b, ".cutscene", "brief.md"), "--seed", "3"]);
      const soft = cli(["compare", b, "--against", root, "--json"]);
      expect(soft.code).toBe(0);
      expect(soft.json.tooSimilar.map((t) => t.project)).toEqual([a]);
      expect(cli(["compare", b, "--against", root, "--strict"]).code).toBe(1);
      expect(cli(["compare", b, "--against", root]).text).toMatch(/TOO SIMILAR/);
      // a different video passes
      cli(["new", "--brief", join(c, ".cutscene", "brief.md"), "--against", root]);
      rmSync(join(b, ".cutscene", "look.json"));
      expect(cli(["compare", c, "--against", root, "--strict"]).code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("`compare --last` only looks at the newest projects", () => {
    const root = tmp();
    try {
      const old = project(root, "old", BRIEF_A);
      cli(["new", "--brief", join(old, ".cutscene", "brief.md"), "--seed", "11"]);
      utimesSync(join(old, ".cutscene", "look.json"), new Date(2020, 0, 1), new Date(2020, 0, 1));
      const mid = project(root, "mid", BRIEF_B);
      cli(["new", "--brief", join(mid, ".cutscene", "brief.md"), "--seed", "12"]);
      const now = project(root, "now", BRIEF_A);
      cli(["new", "--brief", join(now, ".cutscene", "brief.md"), "--seed", "11"]);
      const r = cli(["compare", now, "--against", root, "--last", "1", "--json"]);
      expect(r.json.compared).toBe(1);
      expect(r.json.rows[0].project).toBe(mid);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("`check` exits 1 on a broken look and `diff` prints a score", () => {
    const root = tmp();
    try {
      const p = project(root, "p", BRIEF_A);
      cli(["new", "--brief", join(p, ".cutscene", "brief.md"), "--seed", "8"]);
      expect(cli(["check", p]).code).toBe(0);
      const look = JSON.parse(readFileSync(join(p, ".cutscene", "look.json"), "utf8"));
      look.palette.fg = look.palette.bg;
      writeFileSync(join(p, ".cutscene", "look.json"), JSON.stringify(look));
      const bad = cli(["check", p, "--json"]);
      expect(bad.code).toBe(1);
      expect(bad.json.ok).toBe(false);
      const q = project(root, "q", BRIEF_B);
      cli(["new", "--brief", join(q, ".cutscene", "brief.md"), "--seed", "9"]);
      const d = cli(["diff", p, q, "--json"]);
      expect(d.code).toBe(0);
      expect(d.json.score).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("copies a bundled font into the project when the look picks one", () => {
    const root = tmp();
    try {
      // find a seed whose look uses a bundled (non-engine) display font
      let seed = 0;
      while (ENGINE_FONTS.includes(generateLook({ briefText: BRIEF_A, seed }).type.display.family)) seed++;
      const p = project(root, "fonts", BRIEF_A);
      const r = cli(["new", "--brief", join(p, ".cutscene", "brief.md"), "--seed", String(seed), "--json"]);
      expect(r.json.fontsCopied.length).toBeGreaterThan(0);
      const look = JSON.parse(readFileSync(join(p, ".cutscene", "look.json"), "utf8"));
      expect(look.type.display.src).toMatch(/^assets\/fonts\/.+\.woff2$/);
      expect(cli(["check", p, "--json"]).json.warnings.join(" ")).not.toMatch(/font_family_without_font_face/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses exit code 2 for wrong usage, and runs as a script", () => {
    expect(cli([]).code).toBe(2);
    expect(cli(["compare", "."]).code).toBe(2);
    const r = spawnSync(process.execPath, [LOOK, "frobnicate"], { encoding: "utf8" });
    expect(r.status).toBe(2);
  });
});
