// Cut a video from an EDL in one FFmpeg pass (exact frames, audio and video together, short
// fades at every join), then check the result. Cutscene (Apache-2.0).
import { writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { filterScript } from "./edl.mjs";
import { ffmpeg, probe } from "./media.mjs";
import { ms } from "./cli.mjs";
import type { Edl } from "./edl.mjs";

/** The self-check after a render. */
export type RenderCheck = { ok: boolean; duration: number; expected: number; durationDelta: number; avDelta: number; problems: string[] };
/** What renderEdl did (or, in a dry run, would do). */
export type RenderResult = { rendered: boolean; output: string; filterScript: string; command: string; check?: RenderCheck };

/** The command line, for showing in a dry run. */
export function renderArgs(input: string, output: string, scriptPath: string, info: { hasVideo: boolean; hasAudio: boolean }): string[] {
  const audioOnly = !info.hasVideo;
  const ext = extname(output).toLowerCase();
  const maps = [...(info.hasVideo ? ["-map", "[v]"] : []), ...(info.hasAudio ? ["-map", "[a]"] : [])];
  const v = info.hasVideo ? ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"] : [];
  const a = !info.hasAudio ? [] : ext === ".wav" ? ["-c:a", "pcm_s16le"] : ext === ".flac" ? ["-c:a", "flac"] : ["-c:a", "aac", "-b:a", "192k"];
  const fast = [".mp4", ".m4a", ".mov"].includes(ext) ? ["-movflags", "+faststart"] : [];
  return ["-y", "-i", input, "-/filter_complex", scriptPath, ...maps, ...v, ...a, ...fast, ...(audioOnly ? ["-vn"] : []), output];
}

/**
 * Write the filtergraph next to the outputs and (with apply) render.
 */
export function renderEdl(edl: Edl, input: string, output: string, o: { outDir: string; stem: string; apply: boolean; fade?: number }): RenderResult {
  const info = probe(input);
  const scriptPath = join(o.outDir, `${o.stem}.${edl.tool}-filter.txt`);
  writeFileSync(scriptPath, filterScript(edl.keep_ranges, { video: info.hasVideo, audio: info.hasAudio, fade: o.fade }));
  const args = renderArgs(input, output, scriptPath, info);
  const command = `ffmpeg ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`;
  if (!o.apply) return { rendered: false, output, filterScript: scriptPath, command };
  ffmpeg(args, { what: "cut the video" });
  return { rendered: true, output, filterScript: scriptPath, command, check: checkRender(output, edl) };
}

/**
 * The self-check after every cut: the file plays, has the expected length, and its audio and
 * video end together (a drift here shows up as lips behind the voice).
 */
export function checkRender(output: string, edl: { edited_duration: number; fps: number }): RenderCheck {
  const p = probe(output);
  const frame = 1 / (edl.fps || 30);
  const durationDelta = ms(p.duration - edl.edited_duration);
  const av = p.videoDuration !== undefined && p.audioDuration !== undefined ? ms(Math.abs(p.videoDuration - p.audioDuration)) : 0;
  const problems: string[] = [];
  if (Math.abs(durationDelta) > frame + 0.05) problems.push(`the file is ${durationDelta.toFixed(3)} s off the planned length`);
  if (av > 0.06) problems.push(`audio and video lengths differ by ${av.toFixed(3)} s`);
  return { ok: problems.length === 0, duration: ms(p.duration), expected: edl.edited_duration, durationDelta, avDelta: av, problems };
}
