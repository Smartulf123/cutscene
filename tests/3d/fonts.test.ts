// The look's display font in 3D shots: which formats 3D titles read, the look's own src, and
// warnings only for templates that draw text.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FONT_FORMATS, fontFallbackWarning, loadManifest, resolveFont, scoreFontFile } from "../../skills/cutscene-3d/scripts/lib/assets.mjs";
import { BUNDLED_FONT, usesText } from "../../skills/cutscene-3d/scripts/lib/spec.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "cs3d-font-"));
const CLI = resolve("skills/cutscene-3d/scripts/3d.mjs");

function projectWithFont(files: string[], look?: object) {
  const dir = tmp();
  mkdirSync(join(dir, ".cutscene"), { recursive: true });
  mkdirSync(join(dir, "assets", "fonts"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!doctype html><html></html>");
  for (const f of files) writeFileSync(join(dir, "assets", "fonts", f), "x");
  if (look) writeFileSync(join(dir, ".cutscene", "look.json"), JSON.stringify(look));
  return dir;
}
const opts = (extra = {}) => ({ home: tmp(), systemDirs: [], manifest: { downloads: [] }, ...extra });

describe("3D fonts", () => {
  it("knows which templates draw text", () => {
    expect(usesText("title3d")).toBe(true);
    for (const t of ["logo-svg", "turntable", "shapes", "flythrough"]) expect(usesText(t), t).toBe(false);
  });

  it("scores Fontsource file names by their numeric weight", () => {
    expect(scoreFontFile("bodoni-moda-latin-700-normal.woff2", "Bodoni Moda", 700)).toBeGreaterThan(scoreFontFile("bodoni-moda-latin-400-normal.woff2", "Bodoni Moda", 700));
  });

  it("3D titles can't read the look's .woff2 and say why", () => {
    const dir = projectWithFont(["bodoni-moda-latin-700-normal.woff2"]);
    const src = "assets/fonts/bodoni-moda-latin-700-normal.woff2";
    const t1 = resolveFont({ family: "Bodoni Moda", weight: 700, src, projectDir: dir, ...opts() });
    expect(t1).toMatchObject({ source: "bundled", path: BUNDLED_FONT, wanted: "Bodoni Moda" });
    expect(t1.unreadable).toBe(join(dir, src));
    expect(FONT_FORMATS).toEqual(["ttf", "otf", "woff"]);
    const note = fontFallbackWarning(t1)!;
    expect(note).toMatch(/only as \.woff2, which Three\.js 3D titles can't read/);
    expect(note).not.toMatch(/Blender|Tier 2/);
  });

  it("Tier 1 picks a pinned .woff from the cache and prefers .woff over .woff2 in the project", () => {
    const dir = projectWithFont(["bodoni-moda-latin-700-normal.woff2", "bodoni-moda-latin-700-normal.woff"]);
    expect(resolveFont({ family: "Bodoni Moda", projectDir: dir, ...opts() }).path).toMatch(/\.woff$/);
    const pin = loadManifest().downloads.find((d) => d.name === "font-bodoni-moda-700");
    expect(pin, "Bodoni Moda has a pinned .woff for 3D titles").toBeTruthy();
    const home = tmp();
    const fake = { ...pin!, sha256: createHash("sha256").update("x").digest("hex") };
    mkdirSync(join(home, "assets", fake.sha256), { recursive: true });
    writeFileSync(join(home, "assets", fake.sha256, "bodoni-moda-latin-700-normal.woff"), "x");
    const only2 = projectWithFont(["bodoni-moda-latin-700-normal.woff2"]);
    const r = resolveFont({ family: "Bodoni Moda", projectDir: only2, home, systemDirs: [], manifest: { downloads: [fake] } });
    expect(r.source).toBe("cache");
  });

  it("explains a missing font with the fetch command when one is pinned", () => {
    const r = resolveFont({ family: "Bodoni Moda", home: tmp(), systemDirs: [] });
    expect(r.missing).toBe("font-bodoni-moda-700");
    expect(fontFallbackWarning(r)).toMatch(/cutscene 3d assets fetch font-bodoni-moda-700 --yes/);
    expect(fontFallbackWarning({ path: BUNDLED_FONT, source: "bundled" })).toBeNull();
  });

  it("a logo shot never warns about fonts; a title shot does", () => {
    const look = { version: 1, name: "t", palette: { bg: "#101010", fg: "#F4F4F4", accent: "#FF5A1F", accent2: "#4CC5F1" }, type: { display: { family: "Nonexistent Sans", weight: 700 }, body: { family: "Lato", weight: 400 } }, motion: { character: "snappy", ease: "power3.out", duration_scale: 1 } };
    const dir = projectWithFont([], look);
    const env = { ...process.env, CUTSCENE_HOME: tmp() };
    const run = (t: string) => JSON.parse(spawnSync(process.execPath, [CLI, "tier1", t, "--json"], { cwd: dir, encoding: "utf8", windowsHide: true, env }).stdout);
    const logo = run("logo-svg");
    expect(logo.ok).toBe(true);
    expect(logo.warnings.join(" ")).not.toMatch(/font/i);
    const title = run("title3d");
    expect(title.warnings.join(" ")).toMatch(/Nonexistent Sans/);
  });
});
