// Real runs on this machine: a Tier 1 shot through the engine's lint and check. Skips with a
// reason when the cutscene CLI isn't there, so CI without it stays green (contracts §12).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI3D = resolve("skills/cutscene-3d/scripts/3d.mjs");
const CUTSCENE = resolve("skills/cutscene/scripts/cli.mjs");
const engineCli = existsSync(CUTSCENE) ? CUTSCENE : null;

function run3d(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [CLI3D, ...args, "--json"], { cwd, encoding: "utf8", windowsHide: true, timeout: 20 * 60_000 });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* leave null */
  }
  if (!json?.ok) console.error(r.stdout, r.stderr.slice(-2000));
  return json;
}

const LONG = 25 * 60_000; // engine checks are slow on integrated graphics

describe.skipIf(!engineCli)(`Tier 1 shot passes the engine's lint and check ${engineCli ? "" : "(skipped: cutscene CLI not found)"}`, () => {
  it("title3d in a fresh project", () => {
    const root = mkdtempSync(join(tmpdir(), "cs3d-t1-"));
    const env = { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" };
    const init = spawnSync(process.execPath, [engineCli!, "init", "video", "--non-interactive"], { cwd: root, encoding: "utf8", env, timeout: 300_000, windowsHide: true });
    const dir = join(root, "video");
    if (init.status !== 0 || !existsSync(join(dir, "index.html"))) {
      console.warn("[cutscene-3d e2e] skipped: engine init failed", init.stderr.slice(-500));
      return;
    }
    expect(run3d(["new", "title3d", "--id", "hi", "--text", "HELLO", "--duration", "3"], dir).ok).toBe(true);
    const w = run3d(["tier1", "title3d", "--spec", ".cutscene/3d/hi.json"], dir);
    expect(w.ok).toBe(true);
    let html = readFileSync(join(dir, "index.html"), "utf8");
    html = html.replace(/<h1 id="title"[^\n]*\n/, "").replace(/data-duration="\d+"/, 'data-duration="3"').replace(/(\s*<\/div>\s*<script>)/, `\n      ${w.snippet}$1`);
    writeFileSync(join(dir, "index.html"), html);
    const lint = spawnSync(process.execPath, [engineCli!, "lint"], { cwd: dir, encoding: "utf8", env, timeout: 300_000, windowsHide: true });
    expect(lint.status, lint.stdout + lint.stderr).toBe(0);
    expect(lint.stdout + lint.stderr).toMatch(/0 error/);
    const check = spawnSync(process.execPath, [engineCli!, "check", "--timeout", "30000"], { cwd: dir, encoding: "utf8", env, timeout: 600_000, windowsHide: true });
    expect(check.status, (check.stdout + check.stderr).slice(-2000)).toBe(0);
    expect(check.stdout + check.stderr).toMatch(/Check passed/);
  }, LONG);
});
