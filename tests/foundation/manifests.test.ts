import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CUTSCENE_VERSION } from "../../skills/cutscene/scripts/lib/paths.mjs";
import { readPin } from "../../skills/cutscene/scripts/lib/engine.mjs";
import { parseFrontmatter } from "../../tools/validate-skills.mjs";
import { REPO } from "./helpers.ts";

/** The manifest fields these tests read (each manifest has some of them). */
interface Manifest {
  name: string;
  version: string;
  license: string;
  repository: string;
  author: { name: string };
  owner: { name: string };
  plugins: Record<string, unknown>[];
  skills: string;
  interface: { displayName: string };
}

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const json = (rel: string): Manifest => JSON.parse(read(rel));

const MANIFESTS = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", "gemini-extension.json"];

describe("plugin manifests", () => {
  it("are valid JSON with Cutscene's name, version and licence", () => {
    for (const rel of MANIFESTS) {
      const m = json(rel);
      expect(m.name, rel).toBe("cutscene");
      if (rel !== ".claude-plugin/marketplace.json") expect(m.version, rel).toBe(CUTSCENE_VERSION);
    }
    for (const rel of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json"]) {
      const m = json(rel);
      expect(m.license, rel).toBe("Apache-2.0");
      expect(m.repository, rel).toBe("https://github.com/Smartulf123/cutscene");
      expect(m.author.name, rel).toBe("Smartulf123");
    }
  });

  it("let `claude plugin install cutscene@cutscene` find the plugin at the repo root", () => {
    const market = json(".claude-plugin/marketplace.json");
    expect(market.owner.name).toBe("Smartulf123");
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0]).toMatchObject({ name: "cutscene", source: "./", version: CUTSCENE_VERSION, license: "Apache-2.0" });
  });

  it("point Codex and Cursor at the skills folder", () => {
    expect(json(".codex-plugin/plugin.json").skills).toBe("./skills/");
    expect(json(".cursor-plugin/plugin.json").skills).toBe("./skills/");
    expect(json(".codex-plugin/plugin.json").interface.displayName).toBe("Cutscene");
  });

  it("never name the engine or its company", () => {
    for (const rel of MANIFESTS) expect(read(rel), rel).not.toMatch(/hyperframes|heygen/i);
  });
});

describe("the cutscene skill", () => {
  it("pins the engine exactly", () => {
    expect(json("skills/cutscene/engine.json")).toEqual({ hyperframes: "0.8.162" });
    expect(readPin()).toBe("0.8.162");
  });

  it("has a router SKILL.md with only name and description", () => {
    const fm = parseFrontmatter(read("skills/cutscene/SKILL.md"));
    expect(Object.keys(fm.data)).toEqual(["name", "description"]);
    expect(fm.data.name).toBe("cutscene");
    expect(fm.data.description.length).toBeLessThanOrEqual(1024);
    expect(fm.data.description).toMatch(/NOT/);
  });

  it("routes to every Cutscene skill", () => {
    const text = read("skills/cutscene/SKILL.md");
    for (const s of ["compose", "animate", "design", "captions", "audio", "voice", "3d", "edit", "render", "promo"]) expect(text).toContain(`cutscene-${s}`);
  });
});
