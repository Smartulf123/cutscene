// Unit tests for `cutscene preview` argument handling, project checks and URL safety.
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, resolveProject } from "../../skills/cutscene/scripts/preview.mjs";
import { safeOpenUrl, openCommand, previewUrl, sameDir } from "../../skills/cutscene/scripts/preview/state.mjs";
import { parseReadyLine, engineEnv } from "../../skills/cutscene/scripts/preview/engine.mjs";

describe("parseArgs", () => {
  it("has the contract defaults", () => {
    const o = parseArgs([]);
    expect(o).toMatchObject({ port: 3002, explicitPort: false, open: true, json: false, background: false });
  });

  it("reads the project, port and flags", () => {
    const o = parseArgs(["my-video", "--port", "3010", "--background", "--no-open", "--json"]);
    expect(o).toMatchObject({ project: "my-video", port: 3010, explicitPort: true, background: true, open: false, json: true });
    expect(parseArgs(["--port=4000"]).port).toBe(4000);
  });

  it("rejects bad ports, unknown options and clashing actions with a usage error", () => {
    for (const argv of [["--port", "80"], ["--port", "abc"], ["--port", "70000"], ["--port"], ["--frobnicate"], ["--status", "--stop"], ["--background", "--list"], ["a", "b"], ["--all"]]) {
      let err: { code?: string; exitCode?: number } | undefined;
      try {
        parseArgs(argv);
      } catch (e) {
        err = e as { code?: string; exitCode?: number };
      }
      expect(err, argv.join(" ")).toBeDefined();
      expect(err!.code).toBe("USAGE");
      expect(err!.exitCode).toBe(2);
    }
  });
});

describe("resolveProject", () => {
  it("refuses network paths", () => {
    expect(() => resolveProject("\\\\server\\share\\video")).toThrowError(/network paths/);
    expect(() => resolveProject("//server/share/video")).toThrowError(/network paths/);
  });

  it("needs an existing folder with index.html", () => {
    const dir = mkdtempSync(join(tmpdir(), "cs-preview-"));
    try {
      expect(() => resolveProject(join(dir, "missing"))).toThrow(expect.objectContaining({ code: "PROJECT_NOT_FOUND" }));
      mkdirSync(join(dir, "empty"));
      expect(() => resolveProject(join(dir, "empty"))).toThrow(expect.objectContaining({ code: "NOT_A_PROJECT" }));
      mkdirSync(join(dir, "real"));
      writeFileSync(join(dir, "real", "index.html"), "<html></html>");
      expect(resolveProject(join(dir, "real"))).toMatchObject({ name: "real" });
      expect(resolveProject("real", dir)).toMatchObject({ name: "real" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("URLs handed to the browser", () => {
  it("previewUrl matches the contract", () => {
    expect(previewUrl(3002, "demo")).toBe("http://127.0.0.1:3002/#project/demo");
    expect(previewUrl(3002, "my video")).toBe("http://127.0.0.1:3002/#project/my%20video");
  });

  it("safeOpenUrl drops anything but plain project names", () => {
    expect(safeOpenUrl(3002, "demo_2.v1")).toBe("http://127.0.0.1:3002/#project/demo_2.v1");
    expect(safeOpenUrl(3002, 'x" & calc & "')).toBe("http://127.0.0.1:3002/");
    expect(safeOpenUrl(3002, "100%")).toBe("http://127.0.0.1:3002/");
    expect(() => safeOpenUrl(0, "a")).toThrow();
  });

  it("openCommand only accepts validated loopback URLs", () => {
    expect(openCommand("http://127.0.0.1:3002/#project/demo", "win32")).toEqual({
      cmd: "cmd.exe",
      args: ["/d", "/s", "/c", 'start "" "http://127.0.0.1:3002/#project/demo"'],
      verbatim: true,
    });
    expect(openCommand("http://127.0.0.1:3002/", "darwin")).toMatchObject({ cmd: "open" });
    expect(openCommand("http://127.0.0.1:3002/", "linux")).toMatchObject({ cmd: "xdg-open" });
    for (const bad of ['http://127.0.0.1:3002/#project/a"&calc', "https://evil.example/", "http://127.0.0.1:3002/x", "file:///c:/x"]) {
      expect(() => openCommand(bad, "win32")).toThrow();
    }
  });

  it("sameDir ignores trailing slashes (and case off Linux)", () => {
    expect(sameDir("C:\\a\\b\\", "C:/a/b")).toBe(true);
  });
});

describe("engine helpers", () => {
  it("reads the engine's ready line", () => {
    const line = JSON.stringify({ schemaVersion: 1, operation: "start", ok: true, result: { state: "started", port: 51234, ready: true } });
    expect(parseReadyLine(line)).toEqual({ ok: true, port: 51234 });
    expect(parseReadyLine(JSON.stringify({ operation: "start", ok: false, error: { message: "boom" } }))).toEqual({ ok: false, message: "boom" });
    expect(parseReadyLine("Starting studio...")).toBeNull();
    expect(parseReadyLine("{not json")).toBeNull();
  });

  it("sets the contract environment and the hidden bind address", () => {
    const env = engineEnv({ env: { CUTSCENE_HOME: "/tmp/cs", HYPERFRAMES_PREVIEW_HOST: "0.0.0.0" }, bindHost: "127.9.8.7", watchPid: 42 });
    expect(env).toMatchObject({
      HYPERFRAMES_SKIP_SKILLS: "1",
      HYPERFRAMES_NO_UPDATE_CHECK: "1",
      HYPERFRAMES_NO_TELEMETRY: "1",
      DO_NOT_TRACK: "1",
      HYPERFRAMES_PREVIEW_HOST: "127.9.8.7",
      CUTSCENE_PREVIEW_WATCH_PID: "42",
    });
    expect(env.HYPERFRAMES_CLIENT).toMatch(/^cutscene\//);
    expect(env.HYPERFRAMES_MEDIA_HOME).toMatch(/media$/);
    // An inherited LAN bind is never passed through.
    expect(engineEnv({ env: { HYPERFRAMES_PREVIEW_HOST: "0.0.0.0" } }).HYPERFRAMES_PREVIEW_HOST).toBeUndefined();
  });
});
