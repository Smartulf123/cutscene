// Partly ported from Cutscene 1 src/lib/project/interchange.test.ts (Apache-2.0).
import { describe, expect, it } from "vitest";
import { buildEdl } from "../../skills/cutscene-edit/scripts/lib/edl.mjs";
import { captionGroups, fileUrl, fromAutoEditorV1, placedClips, rational, toAutoEditorV1, toFcpxml, toOtio, toSrt, toXmeml } from "../../skills/cutscene-edit/scripts/lib/interchange.mjs";
import { checkXml } from "./xml.mjs";

const edl = buildEdl({ deletes: [{ start: 2.51, end: 10 }, { start: 15, end: 20 }], duration: 20, fps: 30, tool: "apply-cuts", source: "C:\\Users\\me\\My Videos\\take.mp4" });
const media = { path: "C:\\Users\\me\\My Videos\\take & <1>.mp4", name: "take & <1>", width: 1920, height: 1080, hasVideo: true, hasAudio: true, channels: 2, sampleRate: 48000 };

describe("editor export", () => {
  it("writes file URLs with spaces encoded", () => {
    expect(fileUrl("C:\\Users\\me\\My Videos\\a.mp4")).toBe("file:///C:/Users/me/My%20Videos/a.mp4");
    expect(fileUrl("C:\\Users\\me\\My Videos\\a.mp4", true)).toBe("file://localhost/C:/Users/me/My%20Videos/a.mp4");
    expect(fileUrl("/home/me/a b.mp4")).toBe("file:///home/me/a%20b.mp4");
  });
  it("knows NTSC rates", () => {
    expect(rational(29.97)).toEqual({ num: 30000, den: 1001, ntsc: true, timebase: 30 });
    expect(rational(25)).toEqual({ num: 25, den: 1, ntsc: false, timebase: 25 });
  });
  it("lays kept ranges back to back in whole frames", () => {
    // Cut edges sit on the frame at or before them: 2.51 s -> frame 75.
    expect(placedClips(edl).clips).toEqual([
      { start: 0, inFrame: 0, frames: 75 },
      { start: 75, inFrame: 300, frames: 150 },
    ]);
  });
  it("writes valid FCPXML 1.8 with the clips on the spine", () => {
    const x = toFcpxml(edl, media, "Talk & <cuts>");
    const c = checkXml(x);
    expect(c.ok, c.error).toBe(true);
    expect(c.root).toBe("fcpxml");
    expect(c.tags["asset-clip"]).toBe(2);
    expect(x).toContain('<fcpxml version="1.8">');
    expect(x).toContain('offset="0s" name="take &amp; &lt;1&gt;" start="0s" duration="75/30s"');
    expect(x).toContain('offset="75/30s" name="take &amp; &lt;1&gt;" start="300/30s" duration="150/30s"');
    expect(x).toContain('frameDuration="1/30s"');
    expect(x).toContain("Talk &amp; &lt;cuts&gt;");
    expect(x).toContain("file:///C:/Users/me/My%20Videos/take%20%26%20%3C1%3E.mp4");
  });
  it("writes NTSC time in FCPXML as rational frame durations", () => {
    const e = buildEdl({ deletes: [{ start: 1, end: 2 }], duration: 5, fps: 29.97, tool: "t" });
    const x = toFcpxml(e, media);
    expect(x).toContain('frameDuration="1001/30000s"');
    expect(checkXml(x).ok).toBe(true);
  });
  it("writes valid FCP7 XML for Premiere with one file element", () => {
    const x = toXmeml(edl, media);
    const c = checkXml(x);
    expect(c.ok, c.error).toBe(true);
    expect(c.root).toBe("xmeml");
    expect(x).toContain("<start>75</start><end>225</end><in>300</in><out>450</out>");
    expect(x.match(/<file id="file-1">/g)).toHaveLength(1);
    expect(c.tags.clipitem).toBe(4);
  });
  it("writes OpenTimelineIO with a video and an audio track", () => {
    const o = JSON.parse(toOtio(edl, media));
    expect(o.OTIO_SCHEMA).toBe("Timeline.1");
    expect(o.tracks.children.map((t) => t.kind)).toEqual(["Video", "Audio"]);
    expect(o.tracks.children[0].children[1].source_range.start_time.value).toBe(300);
  });
  it("round-trips auto-editor's v1 timeline", () => {
    const v1 = toAutoEditorV1(edl, "C:\\a b\\take.mp4");
    expect(v1).toEqual({ version: "1", source: "C:/a b/take.mp4", timebase: "30/1", chunks: [[0, 75, 1], [75, 300, 99999], [300, 450, 1], [450, 600, 99999]] });
    const back = fromAutoEditorV1(v1);
    expect(back.fps).toBe(30);
    expect(back.deletes.map((d) => [d.start, d.end])).toEqual([
      [2.5, 10],
      [15, 20],
    ]);
  });
});

describe("captions as SRT", () => {
  const words = [
    { text: "Hello", start: 0.5, end: 0.9 },
    { text: "there.", start: 1, end: 1.4 },
    { text: "Next", start: 3, end: 3.3 },
    { text: "line", start: 3.35, end: 3.7 },
  ];
  it("groups at sentence ends and pauses, holding each line a moment", () => {
    expect(toSrt(words)).toBe("1\n00:00:00,500 --> 00:00:01,800\nHello there.\n\n2\n00:00:03,000 --> 00:00:04,100\nNext line\n");
  });
  it("never lets a line overlap the next", () => {
    const g = captionGroups([{ text: "a.", start: 0, end: 0.3 }, { text: "b", start: 0.4, end: 0.6 }]);
    expect(g[0].end).toBeLessThanOrEqual(g[1].start);
  });
});
