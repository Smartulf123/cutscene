import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brandFindings, markdownLinks, parseFrontmatter, userPathFindings, validateSkills } from "../../tools/validate-skills.mjs";
import { REPO, cleanup, tempDir } from "./helpers.ts";

/** A validator finding, as far as these tests read it. */
interface Finding {
  rule: string;
  file: string;
  message: string;
  line?: number;
}

let root: string;
const write = (rel: string, text: string) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const skill = (name: string, body = "# Body\n", fm = `name: ${name}\ndescription: Use this to test the validator on a small fixture skill. Does NOT do anything real.`) =>
  write(`skills/${name}/SKILL.md`, `---\n${fm}\n---\n\n${body}`);

beforeEach(() => {
  root = tempDir();
});
afterEach(() => cleanup(root));

const rules = (r: { errors: Finding[] }) => r.errors.map((e: Finding) => `${e.rule}:${e.file}`);

describe("validateSkills on fixtures", () => {
  it("passes a clean skill with working links", () => {
    skill("cutscene-good", "See [the guide](references/guide.md) and [a section](#body).\n\n```bash\nnode x/../cutscene/scripts/cli.mjs check\n```\n");
    write("skills/cutscene-good/references/guide.md", "# Guide\n\n[Back](../SKILL.md)\n");
    const r = validateSkills({ root });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.skills).toEqual(["cutscene-good"]);
  });

  it("checks the frontmatter keys, name and description", () => {
    skill("cutscene-a", "", "name: cutscene-b\ndescription: short");
    skill("cutscene-c", "", "name: cutscene-c\ndescription: Use this to test the validator on a small fixture skill. Does NOT do much.\nlicense: MIT");
    skill("Bad_Name", "", "name: Bad_Name\ndescription: Use this to test the validator on a small fixture skill, does NOT pass.");
    write("skills/cutscene-empty/README.md", "no skill here");
    const r = validateSkills({ root });
    const msgs = r.errors.map((e: Finding) => `${e.file} ${e.message}`).join("\n");
    expect(msgs).toMatch(/cutscene-a\/SKILL.md name "cutscene-b" must match the folder/);
    expect(msgs).toMatch(/cutscene-a\/SKILL.md description is too short/);
    expect(msgs).toMatch(/cutscene-c\/SKILL.md frontmatter may only hold name and description \(found "license"\)/);
    expect(msgs).toMatch(/Bad_Name\/SKILL.md name must be lowercase/);
    expect(msgs).toMatch(/cutscene-empty has no SKILL.md/);
  });

  it("reads folded and quoted descriptions", () => {
    skill("cutscene-folded", "", 'name: "cutscene-folded"\ndescription: >\n  Use this to test the validator\n  on a folded description. Does NOT run.');
    const r = validateSkills({ root });
    expect(r.errors).toEqual([]);
  });

  it("finds broken links but ignores links in code and to the web", () => {
    skill("cutscene-links", "[gone](references/missing.md)\n[web](https://example.com)\n`[code](nope.md)`\n```\n[fenced](nope.md)\n```\n");
    const r = validateSkills({ root });
    expect(r.errors.filter((e: Finding) => e.rule === "link")).toHaveLength(1);
    expect(r.errors[0].message).toContain("references/missing.md");
  });

  it("lets the router link to the upstream folder before it exists (warning only)", () => {
    skill("cutscene", "[upstream](references/upstream/)\n");
    const r = validateSkills({ root });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w: Finding) => w.rule === "link")).toBe(true);
  });

  it("flags engine commands shown to users, but not attribution or the upstream folder", () => {
    skill("cutscene-brand", "<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->\nRun `npx hyperframes render`.\nThen hyperframes check.\nLoad /hyperframes-core.\nEdit hyperframes.json and .hyperframes/ freely.\n");
    write("skills/cutscene/SKILL.md", "---\nname: cutscene\ndescription: Use this to test the validator on a small fixture router. Does NOT route.\n---\n");
    write("skills/cutscene/references/upstream/router.md", "Run npx hyperframes preview.\n");
    write("skills/hyperframes-thing/SKILL.md", "---\nname: hyperframes-thing\ndescription: Use this to test the validator on a badly named skill. Does NOT pass.\n---\n");
    const r = validateSkills({ root });
    const brand = r.errors.filter((e: Finding) => e.rule === "brand");
    expect(brand.map((e: Finding) => e.line)).toEqual([7, 8, 9]);
    expect(brand.every((e: Finding) => e.file === "skills/cutscene-brand/SKILL.md")).toBe(true);
    expect(rules(r)).toContain("name:skills/hyperframes-thing");
  });

  it("forbids @latest everywhere in skills/, upstream included", () => {
    skill("cutscene", "ok\n");
    write("skills/cutscene/references/upstream/x.md", "npm i gsap@latest\n");
    write("skills/cutscene/scripts/a.mjs", "// fetch three@latest\n");
    const r = validateSkills({ root });
    expect(r.errors.filter((e: Finding) => e.rule === "pin").map((e: Finding) => e.file).sort()).toEqual(["skills/cutscene/references/upstream/x.md", "skills/cutscene/scripts/a.mjs"]);
  });

  it("forbids absolute paths into a user's home folder", () => {
    skill("cutscene-paths", "Put it in C:\\Users\\jane\\Videos or /home/alice/x, not C:\\Users\\<you>\\Videos.\n");
    const r = validateSkills({ root });
    expect(r.errors.filter((e: Finding) => e.rule === "user-path")).toHaveLength(2);
  });

  it("runs from the command line with --root and --json", () => {
    skill("cutscene-cli", "[gone](nope.md)\n");
    let out: { status: number; stdout: string } | undefined;
    try {
      execFileSync(process.execPath, [join(REPO, "tools", "validate-skills.mjs"), "--root", root, "--json"], { encoding: "utf8", windowsHide: true });
    } catch (err) {
      out = err as { status: number; stdout: string };
    }
    expect(out!.status).toBe(1);
    expect(JSON.parse(out!.stdout).errors[0].rule).toBe("link");
  });
});

describe("helpers", () => {
  it("parses frontmatter", () => {
    expect(parseFrontmatter("---\nname: x\ndescription: |\n  a\n  b\n---\n")!.data).toEqual({ name: "x", description: "a\nb" });
    expect(parseFrontmatter("no frontmatter")).toBeNull();
  });
  it("lists relative links", () => {
    expect(markdownLinks("[a](b.md) [c](http://x) [d](#e) ![i](img.png)\n[ref]: refs/x.md").map((l: { target: string }) => l.target)).toEqual(["b.md", "img.png", "refs/x.md"]);
  });
  it("tells commands from paths", () => {
    expect(brandFindings("cd ~/.cache/hyperframes/chrome").errors).toEqual([]);
    expect(brandFindings("hyperframes render out.mp4").errors).toHaveLength(1);
    expect(userPathFindings("C:\\Users\\Public\\x and /Users/<name>/y").length).toBe(0);
  });
});
