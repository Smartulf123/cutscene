import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contactSheetArgs, encodeArgs, posterArgs, probeArgs, alphaStatsArgs } from "../../skills/cutscene-3d/scripts/lib/encode.mjs";
import { updateShot3d, withShot3d, parseArgs, findProject, shotPaths, userPath } from "../../skills/cutscene-3d/scripts/lib/project.mjs";
import {
  attrJson, compositionId, hostSnippet, pinThreeImports, renderTemplate, scriptJson, tier1Config, variablesFor, writeTier1,
} from "../../skills/cutscene-3d/scripts/lib/tier1.mjs";
import { fetchAsset, fontItemFor, fontSlug, loadManifest, resolveFont, scoreFontFile } from "../../skills/cutscene-3d/scripts/lib/assets.mjs";
import { BUNDLED_FONT, newSpec } from "../../skills/cutscene-3d/scripts/lib/spec.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "cs3d-"));

describe("encode arguments", () => {
  const a = encodeArgs({ framesDir: "C:/p/.cutscene/3d/logo/frames/", fps: 30, out: "C:/p/assets/3d/logo.webm" });
  const pair = (flag) => a[a.indexOf(flag) + 1];
  it("uses VP9 with an alpha pixel format and the alpha_mode tag", () => {
    expect(pair("-c:v")).toBe("libvpx-vp9");
    expect(pair("-pix_fmt")).toBe("yuva420p");
    expect(pair("-auto-alt-ref")).toBe("0");
    expect(pair("-metadata:s:v:0")).toBe("alpha_mode=1");
    expect(a).toContain("-an");
  });
  it("reads the numbered PNG sequence at the shot's fps", () => {
    expect(pair("-framerate")).toBe("30");
    expect(pair("-i")).toBe("C:/p/.cutscene/3d/logo/frames/frame_%04d.png");
    expect(a.at(-1)).toBe("C:/p/assets/3d/logo.webm");
  });
  it("poster keeps one PNG frame", () => {
    expect(posterArgs({ frame: "f.png", out: "p.png" })).toEqual(expect.arrayContaining(["-frames:v", "1", "-c:v", "png", "p.png"]));
  });
  it("contact sheet: stills over the palette colour, 2 per row", () => {
    const c = contactSheetArgs({ stills: ["a.png", "b.png", "c.png"], out: "s.png", width: 960, height: 540, bg: "#0B1020" });
    const fc = c[c.indexOf("-filter_complex") + 1];
    expect(fc).toContain("color=c=0x0B1020:s=960x540");
    expect(fc).toContain("xstack=inputs=3:layout=0_0|w0_0|0_h0");
    expect(c.filter((x) => x === "-i")).toHaveLength(3);
  });
  it("single still needs no stack", () => {
    const c = contactSheetArgs({ stills: ["a.png"], out: "s.png", width: 10, height: 10 });
    expect(c[c.indexOf("-filter_complex") + 1]).toContain("[v0]null[out]");
  });
  it("alpha checks decode with libvpx so alpha isn't dropped", () => {
    expect(alphaStatsArgs("x.webm").slice(0, 3)).toEqual(["-hide_banner", "-c:v", "libvpx-vp9"]);
    expect(probeArgs("x.webm").join(" ")).toContain("stream_tags");
  });
});

const BEATS = `{
    "version": 1,
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "voices": { "narrator": { "model": "omnivoice", "seed": 42 } },
    "beats": [
        { "id": "b1", "start": 0, "end": 2.4, "label": "logo reveal", "voice": { "speaker": "narrator", "line": "Meet Cutscene.", "words": [{ "w": "Meet", "start": 0, "end": 0.32, "p": 0.98 }] }, "sfx": [{ "at": 0.4, "name": "whoosh" }] },
        { "id": "b2", "start": 2.4, "end": 5, "shot3d": { "tier": 1, "note": "keep me" } }
    ]
}
`;

describe("beats.json shot3d updates", () => {
  it("withShot3d changes only the beat's shot3d", () => {
    const before = JSON.parse(BEATS);
    const after = withShot3d(before, "b1", { spec: ".cutscene/3d/logo.json", tier: 2, file: "assets/3d/logo.webm", duration: 2.4 });
    expect(after.beats[0].shot3d).toEqual({ spec: ".cutscene/3d/logo.json", tier: 2, file: "assets/3d/logo.webm", duration: 2.4 });
    expect({ ...after.beats[0], shot3d: undefined }).toEqual({ ...before.beats[0], shot3d: undefined });
    expect(after.beats[1]).toEqual(before.beats[1]);
    expect(after.voices).toEqual(before.voices);
    expect(before.beats[0].shot3d).toBeUndefined();
  });
  it("merges into an existing shot3d", () => {
    const after = withShot3d(JSON.parse(BEATS), "b2", { tier: 2, file: "x.webm" });
    expect(after.beats[1].shot3d).toEqual({ tier: 2, note: "keep me", file: "x.webm" });
  });
  it("names the beats when the id is wrong", () => {
    let err;
    try {
      withShot3d(JSON.parse(BEATS), "b9", {});
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: "BEAT_NOT_FOUND" });
    expect(err.hint).toMatch(/b1, b2/);
  });
  it("updateShot3d writes the file and keeps every other field", async () => {
    const dir = tmp();
    const file = join(dir, "beats.json");
    writeFileSync(file, BEATS);
    await updateShot3d(file, "b1", { spec: ".cutscene/3d/logo.json", tier: 2, file: "assets/3d/logo.webm", duration: 2.4 });
    const text = readFileSync(file, "utf8");
    const after = JSON.parse(text);
    expect(after.beats[0].shot3d.file).toBe("assets/3d/logo.webm");
    expect(after.beats[0].voice).toEqual(JSON.parse(BEATS).beats[0].voice);
    expect(after.beats[1]).toEqual(JSON.parse(BEATS).beats[1]);
    // untouched text (the second beat line) is kept exactly
    expect(text).toContain(`{ "id": "b2", "start": 2.4, "end": 5, "shot3d": { "tier": 1, "note": "keep me" } }`);
  });
});

describe("project helpers", () => {
  it("parses flags", () => {
    expect(parseArgs(["stills", "a.json", "--count", "3", "--json", "--frames=1,2", "-y"])).toEqual({ pos: ["stills", "a.json"], flags: { count: "3", json: true, frames: "1,2", yes: true } });
  });
  it("finds the project from a spec path and builds shot paths", () => {
    const dir = tmp();
    writeFileSync(join(dir, "index.html"), "<html></html>");
    expect(findProject(join(dir, ".cutscene", "3d"))).toBe(dir);
    const p = shotPaths(dir, "logo");
    expect(p.webm).toBe(join(dir, "assets", "3d", "logo.webm"));
    expect(p.poster).toBe(join(dir, "assets", "3d", "logo.poster.png"));
    expect(p.frames).toBe(join(dir, ".cutscene", "3d", "logo", "frames"));
  });
  it("refuses network paths", () => {
    expect(() => userPath("\\\\server\\share\\x.glb")).toThrow(/network/);
    expect(() => userPath("//server/share/x.glb")).toThrow(/network/);
  });
});

describe("Tier 1 writer", () => {
  it("escapes config for <script> and attributes", () => {
    expect(scriptJson({ t: "</script><b>" })).not.toContain("</script>");
    expect(scriptJson({ t: "a" + String.fromCharCode(0x2028) })).toContain("\\u2028");
    expect(attrJson({ t: "it's <b>" })).not.toMatch(/['<]/);
  });
  it("composition ids start with a letter", () => {
    expect(compositionId("3D Logo!")).toBe("scene3d-3d-logo-");
    expect(compositionId("logo")).toMatch(/^[a-z]/);
  });
  it("fills every placeholder", () => {
    const html = "<div id='__CS3D_ID__' data-duration='__CS3D_DURATION__' w='__CS3D_WIDTH__' h='__CS3D_HEIGHT__' v='__CS3D_VARIABLES__'></div><script>/*__CS3D_BOOT__*/ /*__CS3D_COMMON__*/</script>";
    const out = renderTemplate({ html, boot: "var c = __CS3D_CONFIG__;", common: "x('__CS3D_ID__')", id: "scene3d-a", config: { width: 1080, height: 1920, duration: 2, vars: { text: "__CS3D_ID__ $& $1" } }, variables: [] });
    expect(out.replace('"text":"__CS3D_ID__ $& $1"', "")).not.toMatch(/__CS3D_/);
    expect(out).toContain("x('scene3d-a')");
    expect(out).toContain('"text":"__CS3D_ID__ $& $1"'); // user text is never treated as a placeholder
  });
  it("bakes look colours and motion into the config", () => {
    const spec = newSpec("title3d", { id: "t", text: "HELLO", duration: 2 });
    const c = tier1Config("title3d", spec, { look: { palette: { accent: "#123456" }, motion: { character: "bouncy" }, seed: 9 } });
    expect(c).toMatchObject({ id: "scene3d-t", duration: 2, motion: "bouncy", seed: 9, transparent: true, bloom: false, vars: { text: "HELLO" } });
    expect(c.palette.accent).toBe("#123456");
    expect(variablesFor("title3d", c)[0]).toMatchObject({ id: "text", default: "HELLO" });
    expect(tier1Config("shapes", { ...spec, template: "shapes" }).bloom).toBe("three");
  });
  it("pins postprocessing's three import", () => {
    expect(pinThreeImports('import { A } from "three";\nimport{B}from"three"')).toBe('import { A } from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";\nimport{B}from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm"');
  });
  it("writes every Tier 1 template into a project without leftovers or @latest", async () => {
    const dir = tmp();
    for (const t of ["title3d", "logo-svg", "turntable", "shapes", "flythrough"]) {
      const spec = { ...newSpec("title3d", { id: t, text: "HI" }), template: t };
      const r = await writeTier1({ template: t, spec, projectDir: dir });
      const html = readFileSync(r.file, "utf8");
      expect(html, t).not.toMatch(/__CS3D_/);
      expect(html, t).not.toMatch(/@latest/);
      expect(html, t).toContain(`data-composition-id="scene3d-${t}"`);
      expect(html, t).toMatch(/data-duration="3"/);
      expect(html, t).toContain("three@0.184.0");
      expect(r.snippet).toContain(`data-composition-src="compositions/scene3d-${t}.html"`);
    }
    expect(existsSync(join(dir, "compositions", "assets", "3d", "cs3d-runtime.js"))).toBe(true);
    expect(existsSync(join(dir, "compositions", "assets", "3d", "fonts", "Geist-Bold.ttf"))).toBe(true);
    expect(existsSync(join(dir, "compositions", "assets", "3d", "logos", "logo-svg.svg"))).toBe(true);
  });
  it("host snippet uses the beat time and track", () => {
    expect(hostSnippet({ id: "scene3d-x", config: { duration: 2, width: 1920, height: 1080 }, start: 4.2, track: 5 })).toContain('data-start="4.2" data-duration="2" data-track-index="5"');
  });
});

describe("assets and fonts", () => {
  const manifest = loadManifest();
  it("every download is pinned with sha256, size, licence and source", () => {
    for (const d of manifest.downloads) {
      expect(d.sha256, d.name).toMatch(/^[0-9a-f]{64}$/);
      expect(d.size, d.name).toBeGreaterThan(0);
      expect(d.license, d.name).toBeTruthy();
      expect(d.source, d.name).toBeTruthy();
      expect(d.url, d.name).not.toMatch(/@latest/);
    }
    expect(manifest.downloads.some((d) => /polyhaven/.test(d.url) && d.license === "CC0-1.0")).toBe(true);
  });
  it("maps families to Fontsource slugs and the nearest weight", () => {
    expect(fontSlug("Space Grotesk")).toBe("space-grotesk");
    expect(fontItemFor("Inter", 650, manifest).weight).toBe(700);
    expect(fontItemFor("Comic Neue", 700, manifest)).toBeNull();
  });
  it("scores font files by family and weight", () => {
    expect(scoreFontFile("SpaceGrotesk-Bold.ttf", "Space Grotesk", 700)).toBeGreaterThan(scoreFontFile("SpaceGrotesk-Light.ttf", "Space Grotesk", 700));
    expect(scoreFontFile("Inter-BoldItalic.ttf", "Inter", 700)).toBeLessThan(scoreFontFile("Inter-Bold.ttf", "Inter", 700));
    expect(scoreFontFile("Arial.ttf", "Inter", 700)).toBe(-1);
  });
  it("falls back to the bundled font and says what to fetch", () => {
    const home = tmp();
    const r = resolveFont({ family: "Syne", weight: 800, home, systemDirs: [] });
    expect(r).toMatchObject({ path: BUNDLED_FONT, source: "bundled", missing: "font-syne-800", wanted: "Syne" });
    expect(resolveFont({ family: "Geist" }).path).toBe(BUNDLED_FONT);
  });
  it("uses a font in the project", () => {
    const dir = tmp();
    const fonts = join(dir, "assets", "fonts");
    writeFileSync(join(dir, "x"), "");
    require_mkdir(fonts);
    writeFileSync(join(fonts, "Syne-ExtraBold.ttf"), "x");
    expect(resolveFont({ family: "Syne", weight: 800, projectDir: dir, home: tmp(), systemDirs: [] })).toMatchObject({ source: "project" });
  });
  it("asks for consent before downloading and checks the checksum", async () => {
    const item = { name: "t", url: "https://example.invalid/f.bin", sha256: "0".repeat(64), size: 3, license: "CC0-1.0", source: "test" };
    await expect(fetchAsset(item, { home: tmp() })).rejects.toMatchObject({ code: "NEEDS_CONSENT" });
    const fakeFetch = async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode("abc").buffer });
    await expect(fetchAsset(item, { yes: true, home: tmp(), fetchImpl: fakeFetch })).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });
    const good = { ...item, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" };
    const r = await fetchAsset(good, { yes: true, home: tmp(), fetchImpl: fakeFetch });
    expect(readFileSync(r.path, "utf8")).toBe("abc");
  });
});

import { mkdirSync } from "node:fs";
function require_mkdir(p) {
  mkdirSync(p, { recursive: true });
}
