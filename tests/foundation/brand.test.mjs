import { describe, expect, it } from "vitest";
import { createRebrandStream, rebrand, rebrandLine } from "../../skills/cutscene/scripts/lib/brand.mjs";

describe("rebrandLine", () => {
  const cases = [
    ["Run: npx hyperframes render", "Run: cutscene render"],
    ["npx --yes hyperframes@0.8.162 preview --background", "cutscene preview --background"],
    ["Scaffold a new composition project (hyperframes init v0.8.162)", "Scaffold a new composition project (cutscene init)"],
    ["USAGE hyperframes check [OPTIONS] [DIR]", "USAGE cutscene check [OPTIONS] [DIR]"],
    ["Render with HyperFrames", "Render with Cutscene"],
    ["Using /hyperframes-cli now", "Using /cutscene now"],
    ["Wrote C:\\Users\\a\\.hyperframes\\artifacts\\x.json", "Wrote C:\\Users\\a\\.hyperframes\\artifacts\\x.json"],
    ["Edit hyperframes.json then retry", "Edit hyperframes.json then retry"],
    ["/home/a/hyperframes/dist/cli.js failed", "/home/a/hyperframes/dist/cli.js failed"],
    ["cache: C:\\x\\hyperframes\\chrome", "cache: C:\\x\\hyperframes\\chrome"],
    ["window.__hyperframes.getVariables()", "window.__hyperframes.getVariables()"],
    ["@hyperframes/core is loaded", "@hyperframes/core is loaded"],
    ['hyperframes:registry skipped item "x": timeout', 'cutscene registry: skipped item "x": timeout'],
  ];
  for (const [input, want] of cases) {
    it(JSON.stringify(input), () => expect(rebrandLine(input)).toBe(want));
  }

  it("drops lines about the cloud, the desktop app and updates", () => {
    expect(rebrandLine("Keep editing by chatting with Framey")).toBeNull();
    expect(rebrandLine("Open it in the HyperFrames desktop app")).toBeNull();
    expect(rebrandLine("Publish to hyperframes.dev")).toBeNull();
    expect(rebrandLine("Update available: 0.8.214")).toBeNull();
    expect(rebrandLine("Docs: hyperframes.heygen.com")).toBeNull();
  });

  it("keeps colour codes and still rewords the words between them", () => {
    expect(rebrandLine("\x1b[36mhyperframes init\x1b[39m")).toBe("\x1b[36mcutscene init\x1b[39m");
  });
});

describe("rebrand / stream", () => {
  it("handles whole blocks and keeps line endings", () => {
    expect(rebrand("a HyperFrames b\r\nFramey!\nnpx hyperframes lint\n")).toBe("a Cutscene b\r\ncutscene lint\n");
  });

  it("streams lines split across chunks, and progress updates with \\r", () => {
    let out = "";
    const s = createRebrandStream((x) => (out += x));
    s.push("Render with Hyper");
    s.push("Frames\n10%\r20%\r");
    s.push("npx hyper");
    s.push("frames check\n");
    s.end();
    expect(out).toBe("Render with Cutscene\n10%\r20%\rcutscene check\n");
  });
});
