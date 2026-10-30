// `cutscene init` keeps engine, Studio and Cutscene caches and render outputs out of git.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GITIGNORE_LINES, finishProject, writeGitignore } from "../../skills/cutscene/scripts/cli.mjs";
import { cleanup, tempDir } from "./helpers.ts";

let dir: string;
beforeEach(() => {
  dir = tempDir("cutscene-gitignore-");
});
afterEach(() => cleanup(dir));

describe("project .gitignore", () => {
  it("covers the caches and outputs the lead found in a real project", () => {
    for (const line of [".hyperframes/", ".thumbnails/", ".transcode-cache/", ".cutscene/3d/*/frames/", ".cutscene/3d/*/stills/", ".cutscene/stills/", ".cutscene/voice/takes/", "renders/"]) {
      expect(GITIGNORE_LINES).toContain(line);
    }
    // Final 3D clips, voice lines and the beat sheet are work, not cache.
    for (const keep of ["assets/", "assets/3d/", ".cutscene/", ".cutscene/beats.json"]) expect(GITIGNORE_LINES).not.toContain(keep);
  });

  it("finishProject writes it for a new project", () => {
    writeFileSync(join(dir, "index.html"), "<!doctype html>");
    finishProject(dir, null);
    const text = readFileSync(join(dir, ".gitignore"), "utf8");
    for (const line of GITIGNORE_LINES) expect(text.split("\n")).toContain(line);
  });

  it("never overwrites an existing .gitignore: it appends only the missing lines, once", () => {
    writeFileSync(join(dir, ".gitignore"), "# mine\nsecret.txt\n.thumbnails/");
    const added = writeGitignore(dir);
    expect(added).not.toContain(".thumbnails/");
    const text = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(text.startsWith("# mine\nsecret.txt\n.thumbnails/\n\n# Cutscene")).toBe(true);
    expect(text.match(/\.thumbnails\//g)).toHaveLength(1);
    expect(writeGitignore(dir)).toEqual([]);
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(text);
  });

  it("keeps Windows line endings in an existing file", () => {
    writeFileSync(join(dir, ".gitignore"), "dist/\r\n");
    writeGitignore(dir);
    const text = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(/[^\r]\n/.test(text)).toBe(false);
  });
});
