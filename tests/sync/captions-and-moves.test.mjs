// The caption rail for narrated motion graphics (overlays/cutscene-captions/scripts/beats-captions.mjs)
// and the sync's moveSections step that keeps SKILL.md files short.
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  alignDisplay, audioStarts, buildCaptions, captionsHtml, dimColor, readableAccent, runCli, spokenKey, splitLines, tidySpoken,
} from "../../skills/cutscene-captions/scripts/beats-captions.mjs";
import { moveSectionOut } from "../../tools/sync-hyperframes.mjs";

const W = (list) => list.map(([w, start, end]) => ({ w, start, end }));
const B2 = W([["Tell", 0, 0.34], ["your", 0.34, 0.5], ["A", 0.5, 0.62], ["I", 0.62, 0.76], ["the", 0.76, 0.94], ["video", 0.94, 1.22], ["you", 1.22, 1.4], ["want.", 1.4, 1.62]]);
const B3 = W([["It", 0, 0.32], ["renders", 0.32, 0.7], ["real", 0.7, 0.9], ["three", 0.9, 1.2], ["D,", 1.2, 1.5], ["and", 1.6, 1.7], ["speaks.", 1.7, 2.1]]);
const SHEET = {
  version: 1, fps: 30, width: 1920, height: 1080, duration: 8,
  beats: [
    { id: "b1", start: 0, end: 3, voice: { file: "assets/voice/b1.wav", line: "Tell your A I the video you want.", heard: "Tell your AI the video you want.", words: B2 } },
    { id: "b2", start: 3, end: 6, voice: { file: "assets/voice/b2.wav", line: "It renders real three D, and speaks.", display: "It renders real 3D, and speaks.", words: B3 } },
    { id: "b3", start: 6, end: 8, label: "logo, no voice" },
  ],
};
const HTML = `<audio id="v1" class="clip" src="assets/voice/b1.wav" data-start="0.35" data-duration="1.7" data-track-index="10"></audio>`;

describe("caption text vs spoken text", () => {
  it("compares words the way they are said", () => {
    expect(spokenKey("3D")).toBe(spokenKey("three") + spokenKey("D"));
    expect(spokenKey("AI")).toBe("ai");
    expect(spokenKey("R&D")).toBe("randd");
    expect(spokenKey("it's")).toBe("its");
  });
  it("lines display text up with the spoken words, one caption word per spoken span", () => {
    const a = alignDisplay("Tell your AI the video you want.", B2);
    expect(a.map((t) => t.text)).toEqual(["Tell", "your", "AI", "the", "video", "you", "want."]);
    expect(a[2]).toEqual({ text: "AI", start: 0.5, end: 0.76 });
    expect(alignDisplay("It renders real 3D, and speaks.", B3)[3]).toEqual({ text: "3D,", start: 0.9, end: 1.5 });
    expect(alignDisplay("Tell your robot the video you want.", B2)).toBeNull();
    expect(alignDisplay("Tell your AI", B2)).toBeNull(); // words left over
  });
  it("tidies spoken words when there is no display text", () => {
    expect(tidySpoken(B2).map((t) => t.text).join(" ")).toBe("Tell your AI the video you want.");
    expect(tidySpoken(B3).map((t) => t.text).join(" ")).toBe("It renders real 3D, and speaks.");
    expect(tidySpoken(W([["I", 0, 0.1], ["think", 0.1, 0.3]])).map((t) => t.text)).toEqual(["I", "think"]);
  });
  it("breaks lines at sentence ends and keeps them short", () => {
    const toks = "One two three, four five six seven eight nine.".split(" ").map((text, i) => ({ text, start: i, end: i + 1 }));
    expect(splitLines(toks, 7).map((l) => l.map((t) => t.text).join(" "))).toEqual(["One two three,", "four five six seven eight nine."]);
  });
});

describe("buildCaptions", () => {
  it("places each line where its voice file starts in index.html, else at the beat start", () => {
    expect(audioStarts(HTML)).toEqual({ "assets/voice/b1.wav": 0.35 });
    const r = buildCaptions(SHEET, { html: HTML });
    expect(r.placements).toEqual([{ beat: "b1", at: 0.35, from: "index.html" }, { beat: "b2", at: 3, from: "beat.start" }]);
    expect(r.sources).toEqual([{ beat: "b1", source: "heard" }, { beat: "b2", source: "display" }]);
    const ai = r.lines[0].words.find((w) => w.text === "AI");
    expect(ai).toEqual({ text: "AI", start: 0.85, end: 1.11 });
    expect(r.lines[1].words.map((w) => w.text).join(" ")).toBe("It renders real 3D, and speaks.");
    expect(r.duration).toBe(8);
    for (let i = 1; i < r.lines.length; i++) expect(r.lines[i].show).toBeGreaterThanOrEqual(r.lines[i - 1].hide);
  });
  it("warns about a voice without word timings and about display text that doesn't match", () => {
    const sheet = structuredClone(SHEET);
    sheet.beats[1].voice.display = "Something else entirely.";
    sheet.beats.push({ id: "b4", start: 8, end: 9, voice: { line: "Bye." } });
    const r = buildCaptions(sheet);
    expect(r.sources[1].source).toBe("spoken");
    expect(r.warnings.join(" ")).toMatch(/b2: voice.display doesn't line up/);
    expect(r.warnings.join(" ")).toMatch(/b4 has a voice line but no word timings/);
  });
});

describe("the caption sub-composition", () => {
  it("is a templated sub-composition with matching ids, a registered timeline and no randomness", () => {
    const r = buildCaptions(SHEET, { html: HTML });
    const look = { palette: { bg: "#101010", fg: "#F4F4F4", accent: "#FF5A1F", accent2: "#4CC5F1" }, type: { body: { family: "Space Grotesk", weight: 400 } } };
    const page = captionsHtml({ id: "captions", lines: r.lines, duration: r.duration, look });
    expect(page).toBe(captionsHtml({ id: "captions", lines: r.lines, duration: r.duration, look }));
    expect(page.indexOf("<template>")).toBeLessThan(page.indexOf("<style>"));
    expect(page.indexOf("</script>")).toBeLessThan(page.indexOf("</template>"));
    expect(page).toMatch(/id="root" data-composition-id="captions"/);
    expect(page).toMatch(/window\.__timelines\[ID\] = tl/);
    expect(page).toMatch(/"Space Grotesk"/);
    expect(page).toMatch(/#FF5A1F/);
    expect(page).not.toMatch(/Math\.random|Date\.now/);
    expect(page).not.toMatch(/hyperframes/i);
  });
  it("lets only hex colours and plain font names from look.json into the page", () => {
    const r = buildCaptions(SHEET, { html: HTML });
    const look = {
      palette: { bg: "#000;}</style><script>alert(1)</script>", fg: "red", accent: "#FF5A1F</script>" },
      type: { body: { family: 'Evil"; } </style><img src=x>', weight: 400 } },
    };
    const page = captionsHtml({ id: "captions", lines: r.lines, duration: r.duration, look });
    expect(page).not.toMatch(/alert\(1\)|<img|FF5A1F<|"red"/);
    expect(page).toMatch(/color: #F4F3EE;/);
    expect(page).toMatch(/font-family: "Evil {2}styleimg srcx", var/);
    const tricky = captionsHtml({ id: "captions", lines: [{ show: 0, hide: 1, words: [{ text: "</script>", start: 0, end: 1 }] }], duration: 1 });
    expect(tricky.split("</script>").length).toBe(2); // only the real closing tag
  });
  it("dims words not yet said only as far as they stay readable (3:1 or more)", () => {
    for (const [fg, bg] of [["#0F1614", "#D1E9E2"], ["#F4F3EE", "#0B0D12"], ["#1F1515", "#F8938C"]]) {
      const dim = dimColor(fg, bg);
      expect(dim).not.toBe(fg);
      const lum = (h) => {
        const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const [a, b] = [lum(dim), lum(bg)].sort((x, y) => y - x);
      expect((a + 0.05) / (b + 0.05), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3.2);
    }
    // the spoken word's highlight reads as text even when the accent only reaches 3:1
    expect(readableAccent("#20936F", "#0F1614", "#D1E9E2")).not.toBe("#20936F");
    expect(readableAccent("#FF7A45", "#F4F3EE", "#0B0D12")).toBe("#FF7A45");
  });

  it("the CLI writes the file inside the project and never overwrites a hand-made one", () => {
    const dir = mkdtempSync(join(tmpdir(), "cs-captions-"));
    mkdirSync(join(dir, ".cutscene"), { recursive: true });
    writeFileSync(join(dir, ".cutscene", "beats.json"), JSON.stringify(SHEET));
    writeFileSync(join(dir, "index.html"), `<html><body>${HTML}</body></html>`);
    const io = () => {
      const out = [];
      return { out: (s) => out.push(s), err: (s) => out.push(s), text: () => out.join("") };
    };
    const a = io();
    expect(runCli([dir, "--json"], a)).toBe(0);
    const res = JSON.parse(a.text());
    expect(res.snippet).toMatch(/data-composition-id="captions" data-composition-src="compositions\/captions.html" data-track-kind="captions"/);
    expect(existsSync(join(dir, "compositions", "captions.html"))).toBe(true);
    expect(runCli([dir, "--json"], io())).toBe(0); // its own file: replaced
    writeFileSync(join(dir, "compositions", "mine.html"), "hand made");
    const b = io();
    expect(runCli([dir, "--id", "mine", "--json"], b)).toBe(1);
    expect(JSON.parse(b.text()).error.code).toBe("FILE_EXISTS");
    expect(readFileSync(join(dir, "compositions", "mine.html"), "utf8")).toBe("hand made");
    expect(runCli([dir, "--out", "../escape.html"], io())).toBe(2);
    expect(runCli([dir, "--out", `../${dir.split(/[\\/]/).pop()}-evil/c.html`], io())).toBe(2); // sibling folder sharing the name prefix
    expect(runCli([dir, "--max-words", "99"], io())).toBe(2);
    for (const unc of ["\\\\server\\share\\video", "//server/share/video", "/\\server\\share\\video"]) {
      const n = io();
      expect(runCli([unc, "--json"], n), unc).toBe(2);
      expect(JSON.parse(n.text()).error.code).toBe("NETWORK_PATH");
    }
  });
});

describe("moveSections", () => {
  const BODY = "# Skill\n\nIntro.\n\n## Carve\n\nLong text with [a link](references/fx.md) and [b](scripts/x.mjs).\n\n### Sub\n\n```md\n## not a heading\n```\n\n## Next\n\nKeep.\n";
  it("moves a section to a reference, leaves a summary and fixes the links", () => {
    const r = moveSectionOut(BODY, { heading: "^Carve$", to: "references/carve.md", summary: "Short." });
    expect(r.text).toBe("# Skill\n\nIntro.\n\n## Carve\n\nShort.\n\nDetails: [references/carve.md](references/carve.md).\n\n## Next\n\nKeep.\n");
    expect(r.moved).toMatch(/^# Carve\n/);
    expect(r.moved).toMatch(/\n## Sub\n/);
    expect(r.moved).toMatch(/\n## not a heading\n/); // inside a code fence: unchanged
    expect(r.moved).toMatch(/\[a link\]\(fx\.md\)/);
    expect(r.moved).toMatch(/\[b\]\(\.\.\/scripts\/x\.mjs\)/);
  });
  it("returns null when the heading is gone (the sync then fails)", () => {
    expect(moveSectionOut(BODY, { heading: "^Missing$", to: "references/x.md", summary: "x" })).toBeNull();
  });
  it("keeps the generated audio skill under 500 lines", () => {
    const lines = readFileSync(join("skills", "cutscene-audio", "SKILL.md"), "utf8").split("\n").length;
    expect(lines).toBeLessThan(500);
    expect(existsSync(join("skills", "cutscene-audio", "references", "voiceover-carve.md"))).toBe(true);
  });
});
