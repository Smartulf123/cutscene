import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findOnPath, killTree, probe, run } from "../../skills/cutscene/scripts/lib/proc.mjs";
import { REPO, cleanup, tempDir } from "./helpers.ts";

const alive = (pid: number | undefined) => {
  try {
    process.kill(pid as number, 0);
    return true;
  } catch {
    return false;
  }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("process helpers", () => {
  it("captures output and exit codes", async () => {
    const r = await run(process.execPath, ["-e", "console.log('hi'); console.error('err'); process.exit(3)"]);
    expect(r).toMatchObject({ code: 3, stdout: "hi\n", stderr: "err\n", timedOut: false });
  });

  it("reports a program that doesn't exist instead of throwing", async () => {
    const r = await run("cutscene-no-such-program-xyz", []);
    expect(r.code).toBe(1);
    expect(r.error).toBeTruthy();
    expect(probe("cutscene-no-such-program-xyz", []).ok).toBe(false);
  });

  it("finds programs on PATH without a shell", () => {
    const node = findOnPath(process.platform === "win32" ? "node" : "node");
    expect(node).toBeTruthy();
    expect(findOnPath("cutscene-no-such-program-xyz")).toBeNull();
  });

  it("stops a whole process tree, grandchildren included", async () => {
    const dir = tempDir();
    try {
      const pidFile = join(dir, "grandchild.pid");
      // The child starts a grandchild that would run for a minute, writes its pid, and waits.
      const script = `
        const { spawn } = require("node:child_process");
        const g = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore", windowsHide: true });
        require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
        setTimeout(() => {}, 60000);
      `;
      const child = spawn(process.execPath, ["-e", script], { stdio: "ignore", windowsHide: true });
      let grandchild: number | undefined;
      for (let i = 0; i < 100 && !grandchild; i++) {
        await wait(50);
        try {
          grandchild = Number(readFileSync(pidFile, "utf8"));
        } catch {
          // not yet
        }
      }
      expect(alive(grandchild)).toBe(true);
      killTree(child.pid);
      for (let i = 0; i < 40 && (alive(grandchild) || alive(child.pid)); i++) await wait(50);
      expect(alive(child.pid)).toBe(false);
      if (process.platform === "win32") expect(alive(grandchild)).toBe(false); // taskkill /T
      else process.kill(grandchild as number);
    } finally {
      cleanup(dir);
    }
  });

  it("never starts detached processes in the cutscene skill's own scripts", () => {
    for (const f of ["cli.mjs", "doctor.mjs", "setup.mjs", "lib/proc.mjs", "lib/engine.mjs"]) {
      const text = readFileSync(join(REPO, "skills", "cutscene", "scripts", f), "utf8");
      expect(text, f).not.toMatch(/detached:\s*true/);
    }
  });

  it("hides windows on every spawn in the cutscene skill's own scripts", () => {
    const text = readFileSync(join(REPO, "skills", "cutscene", "scripts", "lib", "proc.mjs"), "utf8");
    const spawns = text.match(/\bspawn(Sync)?\(/g)!.length;
    const hidden = text.match(/windowsHide: true/g)!.length;
    expect(hidden).toBeGreaterThanOrEqual(spawns);
  });
});
