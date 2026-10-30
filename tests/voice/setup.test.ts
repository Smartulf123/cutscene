// Voice setup when the new environment's Python doesn't answer. Child processes are faked, so
// no Python is needed and nothing is installed.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { voicePaths } from "../../skills/cutscene-voice/scripts/lib/paths.mjs";
import { installPython } from "../../skills/cutscene-voice/scripts/lib/setup.mjs";
import { VoiceError } from "../../skills/cutscene-voice/scripts/lib/util.mjs";
import type * as Proc from "../../skills/cutscene-voice/scripts/lib/proc.mjs";

const home = mkdtempSync(join(tmpdir(), "cutscene-voice-setup-test-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

// A base Python 3.12 that makes a venv whose own python.exe exits with an error.
vi.mock("../../skills/cutscene-voice/scripts/lib/proc.mjs", async (importOriginal) => {
  const real = await importOriginal<typeof Proc>();
  const fake: typeof real.run = async (cmd, args) => {
    const venvPython = voicePaths(home).python;
    if (args.includes("venv")) {
      mkdirSync(dirname(venvPython), { recursive: true });
      writeFileSync(venvPython, "");
      return { code: 0, stdout: "", stderr: "" };
    }
    if (cmd === venvPython) return { code: 1, stdout: "", stderr: "broken" };
    return { code: 0, stdout: JSON.stringify({ major: 3, minor: 12, micro: 4, machine: "AMD64", platform: "win32", exe: "base-python" }), stderr: "" };
  };
  return { ...real, run: fake };
});

describe("installPython", () => {
  it("stops with a clear error when the new environment's Python doesn't answer", async () => {
    const err = await installPython(["base"], { home }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VoiceError);
    expect(err).toMatchObject({ code: "VENV_FAILED", hint: expect.stringMatching(/voice setup --yes/) });
  });
});
