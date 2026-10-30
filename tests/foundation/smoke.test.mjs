// Real smoke test with the real pinned engine: `cutscene init` then `cutscene check`.
// Skips cleanly when the engine (or its browser) isn't installed, as on CI.
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { engineStatus } from "../../skills/cutscene/scripts/lib/engine.mjs";
import { cutsceneHome } from "../../skills/cutscene/scripts/lib/paths.mjs";
import { SKILL, cleanup, runCli, tempDir } from "./helpers.mjs";

const home = cutsceneHome();
const engine = engineStatus({ home });
const cli = join(SKILL, "scripts", "cli.mjs");
const tmp = tempDir("cutscene-smoke-");
afterAll(() => cleanup(tmp));

describe.skipIf(!engine.installed)(`real engine ${engine.pin} (skipped when it isn't installed in ${home})`, () => {
  const project = join(tmp, "demo");

  it("makes a Cutscene project", async () => {
    const r = await runCli(cli, ["init", project, "--json"], { home, timeout: 120_000 });
    expect(r.stderr).not.toMatch(/npx hyperframes/);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.json).toMatchObject({ ok: true, project, name: "demo" });
    expect(r.json.files).toEqual(expect.arrayContaining([".cutscene", "index.html", "CLAUDE.md", "AGENTS.md"]));
    expect(existsSync(join(project, ".cutscene", "project.md"))).toBe(true);
    const guide = readFileSync(join(project, "CLAUDE.md"), "utf8");
    expect(guide).toMatch(/^<!--.*-->\n# Cutscene video project/);
    expect(guide).not.toMatch(/npx hyperframes|Framey|heygen\.com/i);
    expect(JSON.parse(readFileSync(join(project, "package.json"), "utf8")).scripts).toBeUndefined();
    // Blocks come from the registry of the pinned engine, not the engine's moving main branch.
    expect(JSON.parse(readFileSync(join(project, "hyperframes.json"), "utf8")).registry).toBe(`https://raw.githubusercontent.com/heygen-com/hyperframes/v${engine.pin}/registry`);
  }, 120_000);

  it("checks it with the engine", async () => {
    const r = await runCli(cli, ["check", project, "--json"], { home, timeout: 240_000 });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.lint.errorCount).toBe(0);
    expect(r.json._meta).toBeUndefined();
  }, 240_000);

  it("lists blocks from the pinned registry", async () => {
    const r = await runCli(cli, ["catalog", "--json"], { home, cwd: project, timeout: 120_000 });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.json.ok).toBe(true);
  }, 120_000);

  it("words the check for people", async () => {
    const r = await runCli(cli, ["check", project], { home, timeout: 240_000 });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Check passed: 0 errors/);
    expect(r.stdout + r.stderr).not.toMatch(/hyperframes (check|lint)|npx/i);
  }, 240_000);
});
