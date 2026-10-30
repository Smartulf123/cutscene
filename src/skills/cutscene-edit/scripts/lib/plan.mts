// Adapted from Herk Edit Kit .claude/skills/short-form-edit/scripts/validate-plan.mjs and validate-footage.mjs, commit 10511e5af8 (MIT + Herk Edit Kit Use Permission), Copyright (c) 2026 Nate Herk and kit contributors. Modified for Cutscene.
//
// Structural checks a script can make on a short-form edit plan. They catch broken timing and
// reused footage; they cannot judge taste, motion or sound. Changes for Cutscene: readable code,
// plain-language messages, and the plan's EDL may be a Cutscene EDL.
import { createHash } from "node:crypto";
import type { Keep } from "./edl.mjs";

export type PlanScene = { id: string; start: number; end: number; anchor?: string; anchorTime?: number; layout?: string; kind?: string; holdReason?: string; mode?: string };
export type PlanEvent = { time: number; visual: string };
export type PlanCaptionGroup = { start: number; end: number; words: { text: string; start: number; end: number }[] };
/** A short-form edit plan (assets/plan.json). */
export type Plan = { fps: number; duration: number; scenes: PlanScene[]; events?: PlanEvent[]; captions?: PlanCaptionGroup[] };
export type PlanWord = { text: string; start: number; end: number; type?: string; sourceStart?: number; sourceEnd?: number; source_start?: number; source_end?: number };
export type PlanKeep = { sourceStart: number; sourceEnd: number; start: number; end: number };
/** The plan validator's view of the edit: kept ranges with their source and output times. */
export type PlanKeeps = { duration?: number; fps?: number; keeps: PlanKeep[] };
/** One row of the footage ledger (assets/footage-ledger.json). */
export type FootageRow = { scene: string; sourceSceneId?: string; sha256?: string; sourceStart: number; sourceEnd: number; asset?: string };

/**
 * @param transcript  edited timeline, words with sourceStart/sourceEnd (or source_start/source_end)
 */
export function validatePlan(plan: Plan, transcript: { words?: PlanWord[] }, edl: { keeps: PlanKeep[] }, exists: (p: string) => boolean = () => true): { ok: boolean; errors: string[]; metrics: { duration: number; retainedWords: number; scenes: number; averageShotSeconds: number; visualEvents: number; maxEventGap: number; speakerShare: number } } {
  const errors: string[] = [];
  const fail = (m: string): number => errors.push(m);
  const fps = plan.fps;
  const tol = 1 / fps + 0.005;
  if (!Number.isFinite(fps) || fps <= 0) fail("The plan has no valid fps.");
  if (!plan.scenes?.length) fail("The plan has no scenes.");
  // A missing source time stays missing; the comparisons below then fail and report the word.
  const words = (transcript.words ?? []).filter((w) => w.type !== "spacing" && w.type !== "audio_event").map((w) => ({ ...w, sourceStart: (w.sourceStart ?? w.source_start) as number, sourceEnd: (w.sourceEnd ?? w.source_end) as number }));
  const caps = (plan.captions ?? []).flatMap((g) => g.words);
  if (caps.length !== words.length) fail(`Captions have ${caps.length} words but the edit keeps ${words.length}.`);
  words.forEach((w, i) => {
    const cap = caps[i];
    if (!cap || cap.text !== w.text) fail(`Caption word ${i} is missing or differs from the speech ("${w.text}").`);
    else if (Math.abs(cap.start - w.start) > 0.005 || Math.abs(cap.end - w.end) > 0.005) fail(`Caption word ${i} ("${w.text}") is timed differently from the transcript.`);
    if (w.end <= w.start || w.start < 0 || w.end > plan.duration + tol) fail(`Word ${i} ("${w.text}") is outside the timeline.`);
    const k = edl.keeps.find((k) => w.sourceStart >= k.sourceStart - 0.016 && w.sourceEnd <= k.sourceEnd + 0.016);
    if (!k) fail(`Word ${i} ("${w.text}") crosses a cut or has no source time.`);
    else if (Math.abs(w.start - (k.start + w.sourceStart - k.sourceStart)) > 0.006) fail(`Word ${i} ("${w.text}") is mapped to the wrong source time.`);
  });
  let end = 0;
  const ids = new Set<string>();
  for (const s of plan.scenes ?? []) {
    if (ids.has(s.id)) fail(`Scene ${s.id} appears twice.`);
    ids.add(s.id);
    if (Math.abs(s.start - end) > 0.005) fail(`There is a gap or overlap before scene ${s.id}.`);
    if (s.end <= s.start) fail(`Scene ${s.id} has no duration.`);
    if (Math.abs(s.start * fps - Math.round(s.start * fps)) > 0.01) fail(`Scene ${s.id} does not start on a frame.`);
    if (!s.anchor || !Number.isFinite(s.anchorTime)) fail(`Scene ${s.id} has no verified anchor word.`);
    else if ((s.anchorTime as number) - s.start < -0.15 || (s.anchorTime as number) - s.start > 0.2) fail(`Scene ${s.id} does not cut close to its anchor word.`);
    if (String(s.layout ?? "").includes("broll") && !exists(`assets/${s.kind}.mp4`)) fail(`Scene ${s.id} needs moving B-roll assets/${s.kind}.mp4, which is missing.`);
    end = s.end;
  }
  if (Math.abs(end - plan.duration) > 0.005) fail("The scenes do not cover the whole duration.");
  const times = [0, ...(plan.events ?? []).map((e) => e.time), plan.duration].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    maxGap = Math.max(maxGap, gap);
    if (gap > 2.2) {
      const s = (plan.scenes ?? []).find((s) => times[i - 1] >= s.start && times[i - 1] < s.end);
      if (!s?.holdReason) fail(`Nothing new happens on screen for ${gap.toFixed(2)} s from ${times[i - 1].toFixed(2)} s (add an event or a holdReason).`);
    }
  }
  for (const e of plan.events ?? []) if (!ids.has(e.visual) || e.time < 0 || e.time >= plan.duration) fail(`Visual event ${JSON.stringify(e)} is not valid.`);
  (plan.captions ?? []).forEach((g, i) => {
    if (g.start > g.words[0].start + 0.005 || g.end < g.words.at(-1)!.end - 0.005) fail(`Caption group ${i} cuts off a word.`);
    if (i && g.start < plan.captions![i - 1].end - 0.005) fail(`Caption groups ${i - 1} and ${i} overlap.`);
  });
  const scenes = plan.scenes ?? [];
  return {
    ok: errors.length === 0,
    errors,
    metrics: {
      duration: plan.duration,
      retainedWords: words.length,
      scenes: scenes.length,
      averageShotSeconds: scenes.length ? plan.duration / scenes.length : 0,
      visualEvents: (plan.events ?? []).length,
      maxEventGap: maxGap,
      speakerShare: plan.duration ? scenes.filter((s) => ["face", "split", "broll-split"].includes(s.layout as string)).reduce((a, s) => a + s.end - s.start, 0) / plan.duration : 0,
    },
  };
}

/**
 * Each B-roll scene once per video: a scene id, a file hash and an interval for every row; no
 * scene twice, and no overlapping intervals of the same file.
 */
export function validateFootage(rows: FootageRow[]): { ok: boolean; errors: string[]; scenes: number } {
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (!r.sourceSceneId) errors.push(`Scene ${r.scene} has no source scene id.`);
    else if (seen.has(r.sourceSceneId)) errors.push(`Footage scene ${r.sourceSceneId} is used twice (a new crop, speed or grade is still the same scene).`);
    if (r.sourceSceneId) seen.add(r.sourceSceneId);
    if (!/^[a-f0-9]{64}$/.test(r.sha256 ?? "")) errors.push(`Scene ${r.scene} has no SHA-256 for its file.`);
    if (!(r.sourceStart >= 0 && r.sourceEnd > r.sourceStart)) errors.push(`Scene ${r.scene} has an invalid interval.`);
    for (const p of rows.slice(0, i)) {
      if (p.sha256 === r.sha256 && Math.min(p.sourceEnd, r.sourceEnd) > Math.max(p.sourceStart, r.sourceStart) + 0.001) errors.push(`Scenes ${p.scene} and ${r.scene} reuse overlapping footage from the same file.`);
    }
  });
  return { ok: errors.length === 0, errors, scenes: rows.length };
}

/** SHA-256 of a buffer, hex. */
export function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** A Cutscene EDL as the plan validator's keeps ({sourceStart, sourceEnd, start, end}). */
export function keepsFromEdl(edl: { keeps?: PlanKeep[]; edited_duration?: number; fps?: number; keep_ranges?: Keep[] }): PlanKeeps {
  if (Array.isArray(edl.keeps)) return edl as PlanKeeps;
  return { duration: edl.edited_duration, fps: edl.fps, keeps: (edl.keep_ranges ?? []).map((k) => ({ sourceStart: k.start, sourceEnd: k.end, start: k.out_start, end: k.out_end })) };
}
