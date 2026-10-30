// Skill triggering, checked statically: every description says when to use the skill, names the
// words people actually use for that job, says what it does not do, and only the router claims
// to be the entry point. Real trigger rates need a live model (skill-creator's run_eval with
// `claude -p` on tests/skills/trigger-evals.json); that is not part of this suite.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKILLS = join("skills");
const names = readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, "SKILL.md")));
const description = (name) => {
  const text = readFileSync(join(SKILLS, name, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)[1];
  const m = /^description:\s*(>\s*\n((?:\s+.*\n?)+)|(.*))$/m.exec(fm);
  const raw = m[2] ? m[2].split("\n").map((l) => l.trim()).join(" ") : m[3];
  return raw.trim().replace(/^"|"$/g, "").replace(/\\"/g, '"').replace(/\s+/g, " ");
};
const { evals } = JSON.parse(readFileSync(join("tests", "skills", "trigger-evals.json"), "utf8"));

describe("skill descriptions", () => {
  it("cover all eleven skills, each with when-to-use and what-not", () => {
    expect(names.sort()).toEqual(["cutscene", "cutscene-3d", "cutscene-animate", "cutscene-audio", "cutscene-captions", "cutscene-compose", "cutscene-design", "cutscene-edit", "cutscene-promo", "cutscene-render", "cutscene-voice"]);
    for (const n of names) {
      const d = description(n);
      expect(d.length, n).toBeLessThanOrEqual(1024);
      expect(d, n).toMatch(/\b(use|start here|make 3d|cleans up)\b/i);
      expect(d, n).toMatch(/does not/i);
      expect(d, n).not.toMatch(/hyperframes|heygen/i);
    }
  });

  it("only the router claims to be the entry point; the others defer to it", () => {
    expect(description("cutscene")).toMatch(/^Start here/);
    for (const n of names.filter((x) => x !== "cutscene")) expect(description(n), n).not.toMatch(/start here|mandatory entry|read (this|me) first/i);
    for (const n of ["cutscene-compose", "cutscene-promo", "cutscene-render"]) expect(description(n), n).toMatch(/cutscene\b(?!-)/);
  });

  it("names its neighbour when two skills share a topic", () => {
    // audio vs edit: mixing inside a composition vs cleaning a recording
    expect(description("cutscene-audio")).toMatch(/cutscene-edit/);
    expect(description("cutscene-edit")).toMatch(/cutscene-audio/);
    // captions vs edit: styled captions vs plain SRT
    expect(description("cutscene-captions")).toMatch(/SRT.*cutscene-edit/);
    // 2D motion vs 3D
    expect(description("cutscene-animate")).toMatch(/cutscene-3d/);
    expect(description("cutscene-3d")).toMatch(/cutscene-animate/);
  });
});

describe("trigger eval set", () => {
  it("has about 30 realistic requests covering every skill at least twice", () => {
    expect(evals.length).toBeGreaterThanOrEqual(28);
    for (const n of names) expect(evals.filter((e) => e.expected === n).length, n).toBeGreaterThanOrEqual(2);
    for (const e of evals) {
      expect(names, e.query).toContain(e.expected);
      for (const x of e.not ?? []) expect(names, x).toContain(x);
      expect(e.not ?? [], e.query).not.toContain(e.expected);
    }
  });

  it.each(evals.map((e) => [e.expected, e.query, e]))("%s mentions the trigger words for: %s", (skill, _q, e) => {
    const d = description(skill).toLowerCase();
    for (const k of e.keywords) expect(d, `${skill} should mention "${k}"`).toContain(k.toLowerCase());
  });

  it("converts to skill-creator's per-skill format (should_trigger)", () => {
    const perSkill = (n) => evals.map((e) => ({ query: e.query, should_trigger: e.expected === n }));
    for (const n of names) {
      const set = perSkill(n);
      expect(set.some((x) => x.should_trigger), n).toBe(true);
      expect(set.some((x) => !x.should_trigger), n).toBe(true);
    }
  });
});
