// The edit as files other editors open, from a Cutscene EDL: FCPXML 1.8 (Final Cut Pro, DaVinci
// Resolve), Final Cut Pro 7 XML / xmeml (Adobe Premiere Pro, Resolve), OpenTimelineIO, SRT
// captions, and auto-editor's v1 timeline (which auto-editor turns into Premiere, Resolve, Final
// Cut, Shotcut and Kdenlive projects).
//
// Ported from Cutscene 1's src/lib/project/interchange.ts (Apache-2.0), rewritten to read an EDL
// (one source, kept ranges back to back) instead of the old app's project model. Times are whole
// frames, so cut points line up exactly in every editor.

import type { Edl } from "./edl.mjs";

export type MediaInfo = { path: string; name: string; width?: number; height?: number; hasVideo?: boolean; hasAudio?: boolean; channels?: number; sampleRate?: number; duration?: number };
/** A kept range placed on the sequence, in frames. */
export type PlacedClip = { start: number; inFrame: number; frames: number };
/** A timed word, as captions need it. */
type CaptionWord = { text: string; start: number; end: number };

export function escapeXml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** file:///C:/Users/... with each path part percent-encoded. */
export function fileUrl(absolute: string, localhost: boolean = false): string {
  const forward = String(absolute).replace(/\\/g, "/");
  const parts = forward.split("/").map((p, i) => (i === 0 && /^[A-Za-z]:$/.test(p) ? p : encodeURIComponent(p)));
  const joined = parts.join("/");
  return `file://${localhost ? "localhost" : ""}${joined.startsWith("/") ? "" : "/"}${joined}`;
}

/** Frame rate as a rational: 29.97 -> {num: 30000, den: 1001, ntsc: true, timebase: 30}. */
export function rational(fps: number): { num: number; den: number; ntsc: boolean; timebase: number } {
  for (const base of [24, 30, 60, 120]) {
    if (Math.abs(fps - (base * 1000) / 1001) < 0.005) return { num: base * 1000, den: 1001, ntsc: true, timebase: base };
  }
  const r = Math.round(fps);
  if (Math.abs(fps - r) < 0.001) return { num: r, den: 1, ntsc: false, timebase: r };
  return { num: Math.round(fps * 1000), den: 1000, ntsc: false, timebase: Math.round(fps) };
}

/**
 * Kept ranges as whole frames on the sequence.
 */
export function placedClips(edl: Edl): { fps: number; clips: PlacedClip[]; total: number; sourceFrames: number } {
  const fps = edl.fps || 30;
  let cursor = 0;
  const clips: PlacedClip[] = [];
  for (const k of edl.keep_ranges) {
    const inF = Math.round(k.start * fps);
    const outF = Math.round(k.end * fps);
    const n = outF - inF;
    if (n <= 0) continue;
    clips.push({ start: cursor, inFrame: inF, frames: n });
    cursor += n;
  }
  return { fps, clips, total: cursor, sourceFrames: Math.round(edl.source_duration * fps) };
}

/**
 * FCPXML 1.8 (the widest support: Resolve reads 1.8 to 1.11, Final Cut Pro reads it).
 */
export function toFcpxml(edl: Edl, m: MediaInfo, name: string = "Cutscene edit"): string {
  const { fps, clips, total, sourceFrames } = placedClips(edl);
  const r = rational(fps);
  const t = (n: number): string => (n === 0 ? "0s" : `${n * r.den}/${r.num}s`);
  const width = m.width ?? 1920;
  const height = m.height ?? 1080;
  const video = m.hasVideo !== false;
  const audio = m.hasAudio !== false ? ` hasAudio="1" audioSources="1" audioChannels="${m.channels ?? 2}" audioRate="${m.sampleRate ?? 48000}"` : "";
  const spine = clips.map((c) => `            <asset-clip ref="r2" offset="${t(c.start)}" name="${escapeXml(m.name)}" start="${t(c.inFrame)}" duration="${t(c.frames)}" tcFormat="NDF"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.8">
  <resources>
    <format id="r1" name="Cutscene ${width}x${height} ${Math.round(fps * 100) / 100}p" frameDuration="${r.den}/${r.num}s" width="${width}" height="${height}"/>
    <asset id="r2" name="${escapeXml(m.name)}" src="${escapeXml(fileUrl(m.path))}" start="0s" duration="${t(sourceFrames)}" hasVideo="${video ? 1 : 0}" format="r1"${audio}/>
  </resources>
  <library>
    <event name="Cutscene">
      <project name="${escapeXml(name)}">
        <sequence format="r1" duration="${t(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${spine.join("\n")}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

/**
 * Final Cut Pro 7 XML (xmeml v5): Premiere Pro's import format.
 */
export function toXmeml(edl: Edl, m: MediaInfo, name: string = "Cutscene edit"): string {
  const { fps, clips, total, sourceFrames } = placedClips(edl);
  const r = rational(fps);
  const rate = `<rate><timebase>${r.timebase}</timebase><ntsc>${r.ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
  const width = m.width ?? 1920;
  const height = m.height ?? 1080;
  let n = 0;
  let fileWritten = false;
  const file = (): string => {
    if (fileWritten) return `<file id="file-1"/>`;
    fileWritten = true;
    return `<file id="file-1"><name>${escapeXml(m.name)}</name><pathurl>${escapeXml(fileUrl(m.path, true))}</pathurl>${rate}<duration>${sourceFrames}</duration><media>${m.hasVideo !== false ? `<video><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></video>` : ""}${m.hasAudio !== false ? `<audio><channelcount>${m.channels ?? 2}</channelcount></audio>` : ""}</media></file>`;
  };
  const item = (c: PlacedClip): string => {
    n++;
    return `<clipitem id="clipitem-${n}"><name>${escapeXml(m.name)}</name><duration>${sourceFrames}</duration>${rate}<start>${c.start}</start><end>${c.start + c.frames}</end><in>${c.inFrame}</in><out>${c.inFrame + c.frames}</out>${file()}</clipitem>`;
  };
  const videoTrack = m.hasVideo !== false ? `<track>${clips.map(item).join("")}</track>` : "";
  const audioTrack = m.hasAudio !== false ? `<track>${clips.map(item).join("")}</track>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
<sequence id="sequence-1"><name>${escapeXml(name)}</name><duration>${total}</duration>${rate}
<media>
<video><format><samplecharacteristics>${rate}<width>${width}</width><height>${height}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>
${videoTrack}
</video>
<audio>
${audioTrack}
</audio>
</media>
</sequence>
</xmeml>
`;
}

/**
 * OpenTimelineIO JSON.
 */
export function toOtio(edl: Edl, m: MediaInfo, name: string = "Cutscene edit"): string {
  const { fps, clips, sourceFrames } = placedClips(edl);
  const time = (v: number) => ({ OTIO_SCHEMA: "RationalTime.1", rate: fps, value: v });
  const range = (start: number, duration: number) => ({ OTIO_SCHEMA: "TimeRange.1", start_time: time(start), duration: time(duration) });
  const clip = (c: PlacedClip) => ({
    OTIO_SCHEMA: "Clip.2",
    name: m.name,
    source_range: range(c.inFrame, c.frames),
    media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: "ExternalReference.1", name: m.name, target_url: fileUrl(m.path), available_range: range(0, sourceFrames), metadata: {} } },
    active_media_reference_key: "DEFAULT_MEDIA",
    effects: [],
    markers: [],
    enabled: true,
    metadata: {},
  });
  const track = (tname: string, kind: string) => ({ OTIO_SCHEMA: "Track.1", name: tname, kind, source_range: null, effects: [], markers: [], enabled: true, metadata: {}, children: clips.map(clip) });
  const tracks: ReturnType<typeof track>[] = [];
  if (m.hasVideo !== false) tracks.push(track("Main", "Video"));
  if (m.hasAudio !== false) tracks.push(track("Main sound", "Audio"));
  return `${JSON.stringify({ OTIO_SCHEMA: "Timeline.1", name, global_start_time: null, metadata: { cutscene: { fps, tool: edl.tool } }, tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", source_range: null, effects: [], markers: [], enabled: true, metadata: {}, children: tracks } }, null, 2)}\n`;
}

/**
 * Caption groups from timed words: short lines, broken at sentence ends, pauses and a word cap.
 */
export function captionGroups(words: CaptionWord[], o: { maxWords?: number; maxSeconds?: number; pause?: number; hold?: number } = {}): { start: number; end: number; words: CaptionWord[] }[] {
  const maxWords = o.maxWords ?? 6;
  const maxSeconds = o.maxSeconds ?? 2.8;
  const pause = o.pause ?? 0.45;
  const hold = o.hold ?? 0.4;
  const groups: { start: number; end: number; words: CaptionWord[] }[] = [];
  let cur: CaptionWord[] = [];
  const flush = (): void => {
    if (cur.length) groups.push({ start: cur[0].start, end: cur.at(-1)!.end, words: cur });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && (cur.length >= maxWords || w.end - cur[0].start > maxSeconds || w.start - cur.at(-1)!.end > pause)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text)) flush();
  }
  flush();
  // Lines stay up a moment after the last word, until the next line.
  for (let i = 0; i < groups.length; i++) {
    const next = groups[i + 1];
    groups[i].end = Math.min(groups[i].end + hold, next ? next.start : groups[i].end + hold);
  }
  return groups;
}

/** SRT text from timed words (edited timeline). */
export function toSrt(words: CaptionWord[], o: { maxWords?: number; maxSeconds?: number; pause?: number; hold?: number } = {}): string {
  const stamp = (s: number): string => {
    const msT = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(msT / 3_600_000);
    const m = Math.floor((msT % 3_600_000) / 60_000);
    const sec = Math.floor((msT % 60_000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(msT % 1000).padStart(3, "0")}`;
  };
  return captionGroups(words, o)
    .map((g, i) => `${i + 1}\n${stamp(g.start)} --> ${stamp(g.end)}\n${g.words.map((w) => w.text).join(" ")}\n`)
    .join("\n");
}

/** auto-editor's v1 timeline file. */
export type AutoEditorV1 = { version: string; source: string; timebase: string; chunks: [number, number, number][] };

/**
 * auto-editor's v1 timeline: [startFrame, endFrame, speed] chunks; 99999 means cut.
 */
export function toAutoEditorV1(edl: Edl, sourcePath: string): AutoEditorV1 {
  const { fps, sourceFrames } = placedClips(edl);
  const r = rational(fps);
  const chunks: [number, number, number][] = [];
  let at = 0;
  for (const k of edl.keep_ranges) {
    const a = Math.round(k.start * fps);
    const b = Math.min(sourceFrames, Math.round(k.end * fps));
    if (a > at) chunks.push([at, a, 99999.0]);
    if (b > a) chunks.push([a, b, 1.0]);
    at = Math.max(at, b);
  }
  if (at < sourceFrames) chunks.push([at, sourceFrames, 99999.0]);
  return { version: "1", source: String(sourcePath).replace(/\\/g, "/"), timebase: `${r.num}/${r.den}`, chunks };
}

/**
 * auto-editor's v1 timeline back to cut ranges in seconds.
 */
export function fromAutoEditorV1(v1: { timebase?: string; chunks: [number, number, number][] }, fallbackFps: number = 30): { fps: number; deletes: { start: number; end: number; reason: string }[]; frames: number } {
  const [num, den] = String(v1.timebase ?? `${fallbackFps}/1`).split("/").map(Number);
  const fps = den ? num / den : fallbackFps;
  const deletes: { start: number; end: number; reason: string }[] = [];
  for (const [a, b, speed] of v1.chunks ?? []) {
    if (speed === 0 || speed >= 99999) deletes.push({ start: a / fps, end: b / fps, reason: "quiet (auto-editor loudness pass)" });
  }
  return { fps, deletes, frames: Math.max(0, ...(v1.chunks ?? []).map((c) => c[1])) };
}
