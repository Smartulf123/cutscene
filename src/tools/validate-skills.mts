#!/usr/bin/env node
// Checks every skill in skills/ before it ships (contracts §13 and §1):
// - SKILL.md frontmatter has exactly `name` and `description`; the name matches the folder
//   and the Agent Skills naming rules; the description has a sane length and says what the
//   skill does NOT do;
// - relative links in the skill's Markdown files resolve;
// - no engine names in skill names or in commands shown to users (attribution headers and
//   skills/cutscene/references/upstream/ are allowed);
// - no "@latest" anywhere in skills/;
// - no absolute paths into someone's home folder.
//
// Usage: node tools/validate-skills.mjs [--root <repo>] [--json]
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEXT_EXT = new Set([".md", ".mjs", ".js", ".cjs", ".ts", ".json", ".py", ".txt", ".html", ".css", ".yml", ".yaml", ".toml", ".sh", ".ps1", ".svg", ".csv", ".xml", ".glsl", ".vert", ".frag", ""]);
const SKIP_DIRS = new Set(["node_modules", ".git", "__pycache__", ".venv"]);
const ENGINE_COMMANDS = "init|add|capture|catalog|preview|present|publish|render|open|catch-up|lint|check|validate|beats|audio|inspect|keyframes|snapshot|media-treatment|normalize-audio|grade-compare|compare|info|compositions|timeline|history|docs|benchmark|browser|doctor|clean|upgrade|cloud|lambda|cloudrun|skills|transcribe|models|tts|remove-background|auth|feedback|telemetry|usage";

/** A frontmatter value: a string, or an object for a key that only holds an indented block. */
export type FrontmatterValue = string | Record<string, never>;

/** Parse simple YAML frontmatter: top-level keys with inline, quoted or block (> |) values. */
export function parseFrontmatter(text: string): { data: Record<string, FrontmatterValue>; endLine: number } | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0].trim() !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) return null;
  const data: Record<string, FrontmatterValue> = {};
  let key: string | null = null;
  let block: string | null = null;
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m && !/^\s/.test(line)) {
      key = m[1];
      const v = m[2].trim();
      if (/^[>|][-+]?$/.test(v)) {
        block = v[0];
        data[key] = "";
      } else {
        block = v === "" ? "map" : null;
        data[key] = v.replace(/^(['"])(.*)\1$/, "$2");
      }
      continue;
    }
    if (key && block && /^\s+\S/.test(line)) {
      if (block === "map") data[key] = data[key] || {};
      else (data[key] as string) += (data[key] ? (block === ">" ? " " : "\n") : "") + line.trim();
    }
  }
  return { data, endLine: end + 1 };
}

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** Remove fenced code blocks and inline code so links inside code aren't checked. */
function proseOnly(lines: string[]): string[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return "";
    }
    if (fence) return "";
    return line.replace(/`[^`]*`/g, "");
  });
}

/** Relative link targets in a Markdown file, with line numbers. */
export function markdownLinks(text: string): { target: string; line: number }[] {
  const out: { target: string; line: number }[] = [];
  proseOnly(text.split(/\r?\n/)).forEach((line, i) => {
    for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ target: m[1], line: i + 1 });
    const ref = /^\s*\[[^\]]+\]:\s*(\S+)/.exec(line);
    if (ref) out.push({ target: ref[1], line: i + 1 });
  });
  return out.filter(({ target }) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target));
}

function isAttribution(line: string): boolean {
  return /Adapted from HyperFrames|Built on HyperFrames|not affiliated with HeyGen|HyperFrames \(Apache-2\.0/i.test(line);
}

/** Lines of a Markdown file with HTML comments blanked out (attribution headers live there). */
function withoutComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
}

/** A problem on one line of a file. */
export interface LineFinding {
  line: number;
  message: string;
}

/** Engine names shown to users: errors for commands, warnings for the product name in prose. */
export function brandFindings(text: string): { errors: LineFinding[]; warnings: LineFinding[] } {
  const errors: LineFinding[] = [];
  const warnings: LineFinding[] = [];
  const cmd = new RegExp(String.raw`(?<![\w./\\-])hyperframes\s+(?:${ENGINE_COMMANDS})\b`, "i");
  withoutComments(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (isAttribution(line)) return;
      const n = i + 1;
      if (/\bnpx\s+(?:--yes\s+|-y\s+)?hyperframes\b/i.test(line)) errors.push({ line: n, message: "shows an engine command (npx hyperframes); write `cutscene <command>` instead." });
      else if (/(?<![\w./\\-])hyperframes@/i.test(line)) errors.push({ line: n, message: "shows the engine package (hyperframes@...); write `cutscene <command>` instead." });
      else if (cmd.test(line)) errors.push({ line: n, message: "shows an engine command (hyperframes <command>); write `cutscene <command>` instead." });
      if (/(^|[\s(`'"])\/hyperframes(?:-[a-z-]+)?(?![\w/\\-]|\.\w)/i.test(line)) errors.push({ line: n, message: "names an engine skill (/hyperframes...); route to a cutscene-* skill instead." });
      if (/(?<![\w./\\-])HyperFrames(?![\w./\\-])/.test(line)) warnings.push({ line: n, message: "mentions the engine by name; users should only see \"Cutscene\" (credits belong in README/NOTICE)." });
    });
  return { errors, warnings };
}

/** Absolute paths into a real user's home folder. Placeholders such as <you> are fine. */
export function userPathFindings(text: string): LineFinding[] {
  const out: LineFinding[] = [];
  const placeholder = /^(?:<|\{|%|\$|you$|user$|username$|name$|me$|example$|public$|default$|all users$|\.\.\.)/i;
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/\b[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}([^\\/\s"'`<>*|]+)/gi)) {
      if (!placeholder.test(m[1])) out.push({ line: i + 1, message: `contains an absolute path into a user folder (${m[0]}); use ~ or a placeholder.` });
    }
    for (const m of line.matchAll(/(?<![\w.~-])\/(?:Users|home)\/([A-Za-z0-9._-]+)/g)) {
      if (!placeholder.test(m[1])) out.push({ line: i + 1, message: `contains an absolute path into a user folder (${m[0]}); use ~ or a placeholder.` });
    }
  });
  return out;
}

/** A problem found in a skill. */
export interface SkillFinding {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  skills: string[];
  errors: SkillFinding[];
  warnings: SkillFinding[];
}

/**
 * Validate every skill under <root>/skills.
 */
export function validateSkills({ root = process.cwd() }: { root?: string } = {}): ValidationResult {
  const skillsDir = join(root, "skills");
  const errors: SkillFinding[] = [];
  const warnings: SkillFinding[] = [];
  const rel = (p: string): string => relative(root, p).split(sep).join("/");
  const err = (file: string, line: number, rule: string, message: string): number => errors.push({ file: rel(file), line, rule, message });
  const warn = (file: string, line: number, rule: string, message: string): number => warnings.push({ file: rel(file), line, rule, message });

  if (!existsSync(skillsDir)) {
    errors.push({ file: "skills", line: 0, rule: "layout", message: "There's no skills/ folder." });
    return { ok: false, skills: [], errors, warnings };
  }
  const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const name of skills) {
    const dir = join(skillsDir, name);
    const skillMd = join(dir, "SKILL.md");
    if (name.toLowerCase().includes("hyperframes")) err(dir, 0, "name", "Skill folder names must not contain the engine's name; use cutscene-*.");
    if (!existsSync(skillMd)) {
      err(dir, 0, "skill-md", "has no SKILL.md.");
      continue;
    }
    const text = readFileSync(skillMd, "utf8");
    const fm = parseFrontmatter(text);
    if (!fm) {
      err(skillMd, 1, "frontmatter", "must start with a --- frontmatter block holding name and description.");
    } else {
      const keys = Object.keys(fm.data);
      for (const k of ["name", "description"]) if (!keys.includes(k)) err(skillMd, 1, "frontmatter", `frontmatter is missing "${k}".`);
      for (const k of keys.filter((k) => !["name", "description"].includes(k))) err(skillMd, 1, "frontmatter", `frontmatter may only hold name and description (found "${k}").`);
      const skillName = typeof fm.data.name === "string" ? fm.data.name : "";
      if (skillName && skillName !== name) err(skillMd, 1, "name", `name "${skillName}" must match the folder name "${name}".`);
      if (skillName && (!NAME_RE.test(skillName) || skillName.length > 64)) err(skillMd, 1, "name", "name must be lowercase letters, digits and single hyphens, at most 64 characters.");
      if (skillName.toLowerCase().includes("hyperframes")) err(skillMd, 1, "name", "Skill names must not contain the engine's name.");
      const desc = typeof fm.data.description === "string" ? fm.data.description.trim() : "";
      if (keys.includes("description")) {
        if (desc.length < 40) err(skillMd, 1, "description", `description is too short (${desc.length} characters); say when to use the skill and what it does.`);
        if (desc.length > 1024) err(skillMd, 1, "description", `description is too long (${desc.length} characters; the limit is 1024).`);
        if (!/\bnot\b/i.test(desc)) warn(skillMd, 1, "description", "description should also say what the skill does NOT do (contracts §13).");
      }
    }
    const lineCount = text.split(/\r?\n/).length;
    if (lineCount > 500) warn(skillMd, lineCount, "size", `SKILL.md has ${lineCount} lines; keep it under about 500 and move detail to references/.`);

    for (const file of walk(dir)) {
      const ext = extname(file).toLowerCase();
      if (!TEXT_EXT.has(ext)) continue;
      let body;
      try {
        if (statSync(file).size > 5 * 1024 * 1024) continue;
        body = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const upstream = rel(file).startsWith("skills/cutscene/references/upstream/");
      body.split(/\r?\n/).forEach((line, i) => {
        if (/@latest\b/.test(line)) err(file, i + 1, "pin", 'uses "@latest"; pin an exact version instead.');
      });
      for (const f of userPathFindings(body)) err(file, f.line, "user-path", f.message);
      if (ext !== ".md" || upstream) continue;
      // Credits and licence files are where the engine is meant to be named.
      const creditsFile = /^(credits|notice|third[_-]party|licen[cs]e|attribution)/i.test(basename(file));
      const brand = creditsFile ? { errors: [], warnings: [] } : brandFindings(body);
      for (const f of brand.errors) err(file, f.line, "brand", f.message);
      for (const f of brand.warnings) warn(file, f.line, "brand", f.message);
      for (const link of markdownLinks(body)) {
        const target = decodeURIComponent(link.target.split("#")[0].split("?")[0]);
        if (!target) continue;
        const abs = resolve(dirname(file), target);
        if (existsSync(abs)) continue;
        const intoUpstream = rel(abs).startsWith("skills/cutscene/references/upstream");
        if (intoUpstream) warn(file, link.line, "link", `links to ${link.target}, which the sync step hasn't generated yet.`);
        else err(file, link.line, "link", `links to ${link.target}, which doesn't exist.`);
      }
    }
  }
  return { ok: errors.length === 0, skills, errors, warnings };
}

function format(result: ValidationResult): string {
  const lines: string[] = [];
  for (const e of result.errors) lines.push(`error    ${e.file}${e.line ? `:${e.line}` : ""}  ${e.message}`);
  for (const w of result.warnings) lines.push(`warning  ${w.file}${w.line ? `:${w.line}` : ""}  ${w.message}`);
  if (lines.length) lines.push("");
  lines.push(
    `${result.skills.length} skill${result.skills.length === 1 ? "" : "s"} checked: ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}, ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}.`,
  );
  return lines.join("\n") + "\n";
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === here.toLowerCase()) {
  const args = process.argv.slice(2);
  const rootArg = args.indexOf("--root");
  const root = rootArg >= 0 ? resolve(args[rootArg + 1]) : resolve(dirname(here), "..");
  const result = validateSkills({ root });
  if (args.includes("--json")) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else process.stdout.write(format(result));
  process.exitCode = result.ok ? 0 : 1;
}

