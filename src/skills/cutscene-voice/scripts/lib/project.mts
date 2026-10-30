// Project notes the voice part writes: the consent record in .cutscene/project.md and the
// licence note next to every voice file.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readManifest } from "./paths.mjs";
import type { LicenseFacts, VoiceSpec } from "./types.mjs";
import { VoiceError, today } from "./util.mjs";

/** What a licence note says about one voice file. */
export interface LicenseInfo {
  beatId: string;
  file: string;
  line: string;
  model: string;
  voice?: VoiceSpec;
  speaker: string;
  seed?: number | null;
}

/** A consent statement must say who gave permission; refuse empty or placeholder text. */
export function checkConsent(consent: unknown): string {
  const c = typeof consent === "string" ? consent.trim() : "";
  if (!c) {
    throw new VoiceError(
      "CONSENT_REQUIRED",
      "Cloning a voice needs the speaker's permission, and none was given.",
      'Ask the user who the voice belongs to and whether they have permission, then pass --consent "<who gave permission, e.g. it is my own voice>". Never clone a real person without their consent.',
    );
  }
  if (c.length < 3 || /^(yes|y|ok|okay|true|1|sure|n\/a|none|-)$/i.test(c)) {
    throw new VoiceError("CONSENT_UNCLEAR", `"${c}" doesn't say who gave permission.`, 'Write who gave permission, for example --consent "Maya, it is my own voice" or --consent "Jane Doe agreed by email on 2026-10-20".');
  }
  return c.replace(/[\r\n]+/g, " ").slice(0, 300);
}

/** Append one line to .cutscene/project.md (created if missing). Never rewrites earlier notes. */
export function appendProjectNote(projectMd: string, heading: string, line: string): void {
  mkdirSync(dirname(projectMd), { recursive: true });
  if (!existsSync(projectMd)) writeFileSync(projectMd, "# Project notes\n", "utf8");
  const text = readFileSync(projectMd, "utf8");
  let add = "";
  if (!text.includes(`\n## ${heading}\n`) && !text.startsWith(`## ${heading}\n`)) add += `${text.endsWith("\n") ? "" : "\n"}\n## ${heading}\n\n`;
  else if (!text.endsWith("\n")) add += "\n";
  add += `- ${line}\n`;
  appendFileSync(projectMd, add, "utf8");
}

export function recordConsent(projectMd: string, { speaker, source, consent, model }: { speaker: string; source: string; consent: string; model: string }): void {
  appendProjectNote(projectMd, "Voice consent", `${today()}: cloned voice "${speaker}" from ${source} with ${model}. Permission: ${consent}. (Recorded by cutscene voice clone.)`);
}

/** Licence facts for a model id (omnivoice, voxcpm2, kokoro, voicestudio). */
export function licenseFor(model: string): LicenseFacts {
  const m = readManifest();
  const x = m.models[model] || m.presets[model];
  if (!x) return { license: "unknown", commercial_use: null, attribution: "", title: model };
  return { license: x.license, commercial_use: x.commercial_use, attribution: x.attribution, title: x.title, revision: x.revision, repo: x.repo, license_note: x.license_note };
}

export function licenseText({ beatId, file, line, model, voice, speaker, seed }: LicenseInfo): string {
  const l = licenseFor(model);
  const how = voice?.cloned_from
    ? `cloned from ${voice.cloned_from} (permission: ${voice.consent || "recorded in .cutscene/project.md"})`
    : voice?.design
      ? `designed from "${voice.design}"`
      : voice?.preset
        ? `preset ${voice.preset}`
        : "default voice";
  const lines = [
    `Cutscene voice line ${beatId}`,
    `File: ${file}`,
    `Text: ${JSON.stringify(line)}`,
    `Voice: ${speaker}, ${how}${seed !== undefined && seed !== null ? `, seed ${seed}` : ""}`,
    `Model: ${l.title}${l.repo ? ` (${l.repo}${l.revision ? ` @ ${l.revision.slice(0, 12)}` : ""})` : ""}`,
    `Licence: ${l.license}${l.commercial_use === false ? " (NON-COMMERCIAL: do not use this file in paid or commercial work)" : ""}`,
  ];
  if (l.license_note) lines.push(`Note: ${l.license_note}`);
  if (l.attribution) lines.push(`Attribution: ${l.attribution}`);
  lines.push(`Made: ${today()} with Cutscene (cutscene voice speak).`);
  return lines.join("\n") + "\n";
}

export function writeLicenseFile(path: string, info: LicenseInfo): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, licenseText(info), "utf8");
}
