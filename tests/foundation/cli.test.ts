import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { BLOCKED } from "../../skills/cutscene/scripts/cli.mjs";
import { PIN, cleanup, copySkill, fakeHome, fakePart, runCli, tempDir } from "./helpers.ts";

let root: string;
let cli: string;
let skillsRoot: string;
let home: string;

beforeAll(() => {
  root = tempDir();
  ({ cli, skillsRoot } = copySkill(root));
  home = fakeHome(root);
  fakePart(skillsRoot, "3d");
});
afterAll(() => cleanup(root));

describe("cutscene basics", () => {
  it("prints help and its version", async () => {
    const help = await runCli(cli, ["help"], { home });
    expect(help.code).toBe(0);
    expect(help.stdout).toMatch(/^Cutscene \d+\.\d+\.\d+/);
    expect(help.stdout).not.toMatch(/hyperframes/i);
    const v = await runCli(cli, ["--version", "--json"], { home });
    expect(v.json).toEqual({ ok: true, version: "0.1.0", engine: PIN });
  });

  it("answers an unknown command with a usage error (exit 2)", async () => {
    const r = await runCli(cli, ["frobnicate", "--json"], { home });
    expect(r.code).toBe(2);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("USAGE");
    expect(r.json.error.hint).toBeTruthy();
  });
});

describe("blocked commands", () => {
  for (const cmd of ["skills", "upgrade", "cloud", "cloudrun", "lambda", "publish", "auth", "feedback", "usage"]) {
    it(`blocks ${cmd} with a plain message`, async () => {
      const r = await runCli(cli, [cmd, "--json"], { home });
      expect(r.code).toBe(2);
      expect(r.json).toMatchObject({ ok: false, error: { code: "COMMAND_NOT_AVAILABLE" } });
      expect(r.json.error.message).toContain(`cutscene ${cmd}`);
      expect(r.json.error.message).not.toMatch(/hyperframes|heygen/i);
      expect(Object.keys(r.json)).toEqual(["ok", "error"]);
    });
  }

  it("has a reason for every blocked command, in sentence case", () => {
    for (const [cmd, msg] of Object.entries(BLOCKED)) {
      expect(msg, cmd).toMatch(/^[A-Z`]/);
      expect(msg, cmd).not.toMatch(/hyperframes|heygen/i);
    }
  });

  it("prints a human message without --json", async () => {
    const r = await runCli(cli, ["publish"], { home });
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/^Error: `cutscene publish` isn't part of Cutscene\./);
    expect(r.stderr).toMatch(/\nFix: /);
  });
});

describe("dispatch to parts", () => {
  it("runs a part with CUTSCENE_HOME, CUTSCENE_CLI and CUTSCENE_ENGINE_VERSION", async () => {
    const r = await runCli(cli, ["3d", "render", "spec.json", "--fast"], { home });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.part).toBe("3d");
    expect(out.args).toEqual(["render", "spec.json", "--fast"]);
    expect(out.home).toBe(home);
    expect(out.cli).toBe(cli);
    expect(out.engine).toBe(PIN);
  });

  it("passes --json on to the part", async () => {
    const r = await runCli(cli, ["3d", "status", "--json"], { home });
    expect(r.json.args).toEqual(["status", "--json"]);
  });

  it("explains a missing part", async () => {
    for (const part of ["voice", "edit"]) {
      const r = await runCli(cli, [part, "setup", "--json"], { home });
      expect(r.code).toBe(1);
      expect(r.json.error.code).toBe("PART_MISSING");
      expect(r.json.error.message).toMatch(/^The (voice|footage editing) part of Cutscene/);
      expect(r.json.error.hint).toMatch(/Reinstall/);
      expect(r.json.details.expected).toBe(join(skillsRoot, `cutscene-${part}`, "scripts", `${part}.mjs`));
    }
  });

  it("explains a missing preview", async () => {
    const r = await runCli(cli, ["preview", "--json"], { home });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("PREVIEW_MISSING");
  });
});

describe("engine commands", () => {
  it("runs the pinned engine with Cutscene's environment", async () => {
    const r = await runCli(cli, ["info", "--json"], { home });
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.env).toEqual({
      HYPERFRAMES_SKIP_SKILLS: "1",
      HYPERFRAMES_NO_UPDATE_CHECK: "1",
      HYPERFRAMES_NO_TELEMETRY: "1",
      DO_NOT_TRACK: "1",
      HYPERFRAMES_CLIENT: "cutscene/0.1.0",
      HYPERFRAMES_SKILL_PKG_VERSION: PIN,
      HYPERFRAMES_PLUGIN_VERSION: PIN,
      HYPERFRAMES_MEDIA_HOME: join(home, "media"),
    });
    expect(r.json.args).toEqual(["info", "--json"]);
  });

  it("forwards the figma, play and media-treatment tools the Cutscene skills use", async () => {
    for (const cmd of ["figma", "play", "media-treatment"]) {
      const r = await runCli(cli, [cmd, "--json"], { home });
      expect(r.code, cmd).toBe(0);
      expect(r.json.ok, cmd).toBe(true);
    }
  });

  it("lets `browser path` through but asks before `browser ensure` downloads", async () => {
    const path = await runCli(cli, ["browser", "path", "--json"], { home });
    expect(path.json.ok).toBe(true);
    const ensure = await runCli(cli, ["browser", "ensure", "--json"], { home });
    expect(ensure.code).toBe(1);
    expect(ensure.json.error.code).toBe("NEEDS_CONSENT");
    expect(ensure.json.details.downloads[0].size).toMatch(/MB/);
    const yes = await runCli(cli, ["browser", "ensure", "--yes", "--json"], { home });
    expect(yes.json.ok).toBe(true);
    expect(yes.json.output.join("\n")).not.toContain("--yes");
  });

  it("keeps transcribe's own flags and its JSON fields", async () => {
    const r = await runCli(cli, ["transcribe", "a.wav", "--dir", "p", "--model", "small.en", "--language", "en", "--engine", "whisper", "--yes", "--json"], { home });
    // --no-runtime-install: the engine may never install whisper.cpp itself (Homebrew or an unpinned build).
    expect(r.json.args).toEqual(["transcribe", "a.wav", "--dir", "p", "--model", "small.en", "--language", "en", "--engine", "whisper", "--no-runtime-install", "--json"]);
  });

  it("asks before the engine downloads a model on first use", async () => {
    // An empty user folder, so the engine's model cache (~/.cache/hyperframes) is empty.
    const user = join(root, "empty-user");
    const env = { USERPROFILE: user, HOME: user };
    const r = await runCli(cli, ["transcribe", "a.wav", "--json"], { home, env });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("NEEDS_CONSENT");
    expect(r.json.details.downloads[0].id).toBe("whisper-small.en");
    const tts = await runCli(cli, ["tts", "hello", "--json"], { home, env });
    expect(tts.json.error.code).toBe("NEEDS_CONSENT");
    const yes = await runCli(cli, ["tts", "hello", "--yes", "--json"], { home, env });
    expect(yes.json.error?.code).not.toBe("NEEDS_CONSENT");
  });

  it("drops the engine's update notice and rewords its messages", async () => {
    const r = await runCli(cli, ["timeline", ".", "--json"], { home });
    expect(r.json._meta).toBeUndefined();
    expect(r.json.message).toBe("Run cutscene lint next");
    expect(r.json.cwd).toBeTruthy(); // paths and other fields stay as they are
  });

  it("keeps snapshots and blocks on this computer by default", async () => {
    const snap = await runCli(cli, ["snapshot", ".", "--json"], { home });
    expect(snap.json.ok).toBe(true);
    expect(snap.json.output.join("\n")).toContain("--describe=false");
    const add = await runCli(cli, ["add", "grain", "--json"], { home });
    expect(add.json.args).toContain("--no-clipboard");
    const own = await runCli(cli, ["snapshot", ".", "--describe", "Is the logo visible?", "--json"], { home });
    expect(own.json.output.join("\n")).not.toContain("--describe=false");
  });

  it("turns an engine failure into an error envelope", async () => {
    const r = await runCli(cli, ["check", ".", "--fail", "--json"], { home });
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("CHECK_FAILED");
    expect(r.json.error.message).toMatch(/2 problems/);
    expect(r.json.lint.errorCount).toBe(2);
    expect(r.json._meta).toBeUndefined();
  });

  it("rewords human output without touching file paths", async () => {
    const r = await runCli(cli, ["render", "."], { home });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Rendering with Cutscene...");
    expect(r.stdout).toContain("C:\\work\\demo\\.hyperframes\\renders\\out.mp4");
    expect(r.stdout).toContain("Tip: run cutscene check first, or cutscene preview.");
    expect(r.stdout).not.toMatch(/Framey|desktop app/);
    expect(r.stderr).toContain("hyperframes.json");
  });

  it("asks before downloading a missing engine", async () => {
    const empty = fakeHome(join(root, "empty"), { engine: false });
    const r = await runCli(cli, ["check", ".", "--json"], { home: empty });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("NEEDS_CONSENT");
    expect(r.json.details.downloads[0]).toMatchObject({ version: PIN, license: "Apache-2.0" });
    expect(r.json.details.downloads[0].size).toMatch(/MB/);
  });

  it("asks for consent in setup and lists what it would download", async () => {
    const empty = fakeHome(join(root, "empty2"), { engine: false });
    const r = await runCli(cli, ["setup", "--json"], { home: empty });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("NEEDS_CONSENT");
    expect(r.json.downloads.map((d) => d.id)).toContain("engine");
    for (const d of r.json.downloads) for (const k of ["name", "size", "license", "source"]) expect(d[k], `${d.id}.${k}`).toBeTruthy();
  });

  it("refuses to make a project in a folder that isn't empty", async () => {
    const r = await runCli(cli, ["init", root, "--json"], { home });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("PROJECT_EXISTS");
  });

  it("asks for a folder when init gets none (exit 2)", async () => {
    const r = await runCli(cli, ["init", "--json"], { home });
    expect(r.code).toBe(2);
    expect(r.json.error.code).toBe("USAGE");
  });
});
