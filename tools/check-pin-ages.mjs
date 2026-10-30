#!/usr/bin/env node
// Checks that every pinned version Cutscene depends on is at least 14 days old on its registry
// (contracts §9), so a broken or malicious release has time to be noticed before we ship it.
//
// Pins it reads:
// - skills/cutscene/engine.json                 the engine (npm)
// - skills/*/assets/manifest.json               each part's downloads: {name, version, url, sha256,
//                                               size, license, source[, published]}
// - package.json dependencies/devDependencies   npm (must also be exact versions)
// - .github/workflows/*.yml                     `uses: owner/repo@tag` (GitHub) and
//                                               `pip install name==version` (PyPI)
//
// Where the date comes from: npm registry, PyPI, GitHub releases/tags, Hugging Face revisions.
// For anything else (or with --offline) it uses the date recorded in the manifest entry
// (`published`, ISO date). Entries without a date are reported as unknown (a warning; an
// error with --strict).
//
// Network trouble is not an age failure. Each lookup is tried 3 times with a short back-off
// (timeouts, connection errors, HTTP 429/5xx and GitHub's 403 rate limit). If it still fails, the
// pin's recorded date is used when it has one; otherwise it is reported as "could not check
// (network)". That status never fails the run, with or without --strict: rerun it, or use
// --offline --strict to require a recorded date for every pin (which works without a network).
//
// Exit code 1 only for: a release younger than --min-days, a version that isn't exact, a manifest
// that isn't valid JSON, and (with --strict) a pin with no release date anywhere.
//
// Usage: node tools/check-pin-ages.mjs [--offline] [--strict] [--min-days 14] [--root <repo>] [--json]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MIN_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/** True when a version string is a single exact version (no ranges, tags or wildcards). */
export function isExactVersion(v) {
  if (typeof v !== "string" || !v.trim()) return false;
  const s = v.trim();
  if (/^(latest|next|beta|canary|nightly|main|master|head|\*)$/i.test(s)) return false;
  if (/^[\^~<>=*]|\s|\|\||(^|\.)x(\.|$)/i.test(s)) return false;
  return true;
}

/** Kind of registry for a manifest entry, from its source and URL. */
export function classify(entry) {
  const src = String(entry.source || "").toLowerCase();
  const url = String(entry.url || "");
  const npmUrl = /registry\.npmjs\.org\/((?:@[^/]+\/)?[^/]+)\/-\//.exec(url);
  if (npmUrl) return { kind: "npm", package: decodeURIComponent(npmUrl[1]) };
  if (src === "npm") return { kind: "npm" };
  if (src === "pypi" || /(^|\.)pypi\.org|pythonhosted\.org/.test(url)) return { kind: "pypi" };
  let m = /huggingface\.co\/(datasets\/|spaces\/)?([^/]+\/[^/]+)\/(?:resolve|blob|tree)\/([^/]+)/.exec(url);
  if (m || src === "huggingface") {
    return m ? { kind: "huggingface", repo: m[2], type: m[1] ? m[1].replace("/", "") : "models", revision: m[3] } : { kind: "huggingface" };
  }
  m = /github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\//.exec(url);
  if (m) return { kind: "github", repo: `${m[1]}/${m[2]}`, tag: decodeURIComponent(m[3]) };
  m = /github\.com\/([^/]+)\/([^/]+)\/archive\/(?:refs\/tags\/)?([^/]+?)(?:\.tar\.gz|\.zip)$/.exec(url);
  if (m) return { kind: "github", repo: `${m[1]}/${m[2]}`, tag: decodeURIComponent(m[3]) };
  if (src === "github" && entry.repo) return { kind: "github", repo: entry.repo, tag: entry.tag || entry.version };
  return { kind: "url" };
}

function manifestEntries(manifest) {
  if (Array.isArray(manifest)) return manifest;
  if (!manifest || typeof manifest !== "object") return [];
  if (typeof manifest.name === "string" && manifest.version !== undefined) return [manifest];
  const out = [];
  for (const [key, value] of Object.entries(manifest)) {
    if (Array.isArray(value)) out.push(...value.filter((v) => v && typeof v === "object"));
    else if (value && typeof value === "object" && value.version !== undefined) out.push({ name: key, ...value });
  }
  return out;
}

const recordedDate = (e) => e.published || e.released || e.published_at || e.date || null;

/** Every pin in the repo. */
export function collectPins(root) {
  const pins = [];
  const rel = (p) => relative(root, p).split(sep).join("/");

  const engineJson = join(root, "skills", "cutscene", "engine.json");
  if (existsSync(engineJson)) {
    for (const [name, version] of Object.entries(readJson(engineJson))) pins.push({ kind: "npm", name, version, file: rel(engineJson) });
  }

  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    const data = readJson(pkg);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(data[field] || {})) pins.push({ kind: "npm", name, version, file: `${rel(pkg)} (${field})` });
    }
  }

  const skills = join(root, "skills");
  if (existsSync(skills)) {
    for (const d of readdirSync(skills, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const file = join(skills, d.name, "assets", "manifest.json");
      if (!existsSync(file)) continue;
      let manifest;
      try {
        manifest = readJson(file);
      } catch (err) {
        pins.push({ kind: "invalid", name: rel(file), version: "", file: rel(file), problem: `isn't valid JSON (${err.message})` });
        continue;
      }
      for (const e of manifestEntries(manifest)) {
        pins.push({ ...classify(e), name: e.name || "(unnamed)", version: e.version === undefined ? "" : String(e.version), url: e.url, recorded: recordedDate(e), file: rel(file) });
      }
    }
  }

  const workflows = join(root, ".github", "workflows");
  if (existsSync(workflows)) {
    for (const f of readdirSync(workflows).filter((n) => /\.ya?ml$/.test(n))) {
      const file = join(workflows, f);
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/^\s*-?\s*uses:\s*["']?([\w.-]+\/[\w.-]+)(?:\/[\w./-]+)?@([\w.-]+)["']?/gm)) {
        pins.push({ kind: "github", name: m[1], repo: m[1], tag: m[2], version: m[2], file: rel(file) });
      }
      const valueOptions = new Set(["-r", "-c", "--requirement", "--constraint", "-i", "--index-url", "--extra-index-url", "-f", "--find-links", "-t", "--target", "--python-version", "--platform"]);
      for (const m of text.matchAll(/pip3?\s+install\s+([^\n#]+)/g)) {
        const tokens = m[1].trim().split(/\s+/).map((t) => t.replace(/["']/g, ""));
        tokens.forEach((spec, i) => {
          if (i > 0 && valueOptions.has(tokens[i - 1])) return;
          if (!spec || spec.startsWith("-") || /[\\/$]/.test(spec) || spec === "." || /\.(txt|whl|zip|tar\.gz)$/i.test(spec)) return;
          const exact = /^([A-Za-z0-9._-]+(?:\[[^\]]*\])?)==([\w.!+-]+)$/.exec(spec);
          if (exact) pins.push({ kind: "pypi", name: exact[1].replace(/\[.*\]$/, ""), version: exact[2], file: rel(file) });
          else if (/^[A-Za-z][A-Za-z0-9._\[\]-]*([<>~=!].*)?$/.test(spec)) {
            const name = spec.split(/[<>~=!]/)[0].replace(/\[.*\]$/, "");
            pins.push({ kind: "pypi", name, version: spec.slice(spec.split(/[<>~=!]/)[0].length), file: rel(file) });
          }
        });
      }
    }
  }
  return pins;
}

// --- registry lookups -------------------------------------------------------------------------

/** A lookup that failed because the registry couldn't be reached (not an answer about the pin). */
export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.code = "NETWORK";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Worth another try: rate limits (GitHub answers 403 without a token) and server errors.
const retryable = (status) => status === 403 || status === 408 || status === 429 || status >= 500;

async function getJson(url, { fetchImpl, headers = {}, tries = 3, retryDelayMs = 700 }) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    if (i > 0 && retryDelayMs > 0) await sleep(retryDelayMs * 2 ** (i - 1));
    let res;
    try {
      res = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "cutscene-pin-check", ...headers }, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      last = err.message || String(err);
      continue;
    }
    if (res.status === 404) return null;
    if (res.ok) {
      try {
        return await res.json();
      } catch (err) {
        last = `unreadable answer from ${new URL(url).host} (${err.message})`;
        continue;
      }
    }
    last = `HTTP ${res.status} from ${new URL(url).host}`;
    if (!retryable(res.status)) break;
  }
  throw new NetworkError(`${last} after ${tries} tries`);
}

/** Look up when a pin was published. Returns an ISO date string, or null when unknown. */
export async function publishedDate(pin, { fetchImpl = fetch, env = process.env, npmCache = new Map(), retryDelayMs = 700 } = {}) {
  const get = (url, opts = {}) => getJson(url, { fetchImpl, retryDelayMs, ...opts });
  if (pin.kind === "npm") {
    const key = pin.package || pin.name;
    if (!npmCache.has(key)) npmCache.set(key, get(`https://registry.npmjs.org/${key.replace("/", "%2F")}`));
    const doc = await npmCache.get(key);
    return (doc && doc.time && doc.time[pin.version]) || null;
  }
  if (pin.kind === "pypi") {
    const doc = await get(`https://pypi.org/pypi/${encodeURIComponent(pin.name)}/${encodeURIComponent(pin.version)}/json`);
    const times = ((doc && doc.urls) || []).map((u) => u.upload_time_iso_8601 || u.upload_time).filter(Boolean).sort();
    return times[0] || null;
  }
  if (pin.kind === "github" && pin.repo && pin.tag) {
    const token = env.GITHUB_TOKEN || env.GH_TOKEN;
    const headers = { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const api = `https://api.github.com/repos/${pin.repo}`;
    const rel = await get(`${api}/releases/tags/${encodeURIComponent(pin.tag)}`, { headers });
    if (rel && rel.published_at) return rel.published_at;
    const ref = await get(`${api}/git/ref/tags/${encodeURIComponent(pin.tag)}`, { headers });
    if (!ref || !ref.object) return null;
    if (ref.object.type === "tag") {
      const tag = await get(`${api}/git/tags/${ref.object.sha}`, { headers });
      return (tag && tag.tagger && tag.tagger.date) || null;
    }
    const commit = await get(`${api}/commits/${ref.object.sha}`, { headers });
    return (commit && commit.commit && commit.commit.committer && commit.commit.committer.date) || null;
  }
  if (pin.kind === "huggingface" && pin.repo && pin.revision) {
    const type = pin.type === "datasets" ? "datasets" : pin.type === "spaces" ? "spaces" : "models";
    const doc = await get(`https://huggingface.co/api/${type}/${pin.repo}/revision/${encodeURIComponent(pin.revision)}`);
    return (doc && (doc.lastModified || doc.createdAt)) || null;
  }
  return null;
}

/** Whole and fractional days between a date and now. */
export function ageDays(date, now = new Date()) {
  return (now.getTime() - new Date(date).getTime()) / DAY;
}

/**
 * Check every pin.
 * @returns {Promise<{ok: boolean, minDays: number, offline: boolean, results: object[]}>}
 */
export async function checkPins({ root = process.cwd(), offline = false, strict = false, minDays = MIN_DAYS, now = new Date(), fetchImpl = fetch, env = process.env, retryDelayMs = 700 } = {}) {
  const results = [];
  const seen = new Set();
  const npmCache = new Map(); // one registry document per package, per run
  for (const pin of collectPins(root)) {
    const key = [pin.kind, pin.package || pin.name, pin.version, pin.file, pin.repo, pin.tag, pin.revision].join("|");
    if (seen.has(key)) continue; // e.g. one release with a file per platform
    seen.add(key);
    const r = { kind: pin.kind, name: pin.name, version: pin.version, file: pin.file };
    if (pin.kind === "invalid") {
      results.push({ ...r, status: "error", message: `${pin.file} ${pin.problem}` });
      continue;
    }
    if (!isExactVersion(pin.version)) {
      results.push({ ...r, status: "unpinned", message: `"${pin.version || "(none)"}" isn't an exact version; pin one release, like 1.2.3.` });
      continue;
    }
    let date = null;
    let from = null;
    let networkNote = null;
    if (!offline) {
      try {
        date = await publishedDate(pin, { fetchImpl, env, npmCache, retryDelayMs });
        if (date) from = pin.kind;
      } catch (err) {
        if (!(err instanceof NetworkError)) {
          results.push({ ...r, status: "error", message: `Couldn't read the release date (${err.message}).` });
          continue;
        }
        if (!pin.recorded) {
          results.push({ ...r, status: "network", message: `Could not check: the registry couldn't be reached (${err.message}). This is not an age problem; run the check again, or use --offline for recorded dates.` });
          continue;
        }
        networkNote = `registry unreachable (${err.message}); used the recorded date`;
      }
    }
    if (!date && pin.recorded) {
      date = pin.recorded;
      from = "recorded";
    }
    if (!date || Number.isNaN(new Date(date).getTime())) {
      results.push({
        ...r,
        status: "unknown",
        message: offline
          ? pin.file.includes("manifest.json") ? "No recorded release date (add `published` to the manifest entry); skipped offline." : "Checked online only; skipped offline."
          : "No release date found; add `published` (ISO date) to the manifest entry.",
      });
      continue;
    }
    const age = ageDays(date, now);
    const published = new Date(date).toISOString();
    if (age < minDays) {
      results.push({ ...r, status: "too-new", published, from, ageDays: Math.floor(age * 10) / 10, message: `Released ${published.slice(0, 10)}, only ${Math.max(0, Math.floor(age))} days ago; wait until it is ${minDays} days old or pin an older release.` });
    } else {
      results.push({ ...r, status: "ok", published, from, ageDays: Math.floor(age), ...(networkNote ? { note: networkNote } : {}) });
    }
  }
  // "network" never fails the run: it says nothing about the pin's age.
  const failing = results.filter((x) => x.status === "too-new" || x.status === "unpinned" || x.status === "error" || (strict && x.status === "unknown"));
  return { ok: failing.length === 0, minDays, offline, results, unchecked: results.filter((x) => x.status === "network").length };
}

function format(report) {
  const label = { ok: "ok", "too-new": "too new", unpinned: "unpinned", unknown: "unknown", error: "error", network: "no network" };
  const lines = [`Pin ages (each release at least ${report.minDays} days old${report.offline ? ", recorded dates only" : ""}):`, ""];
  const w = Math.max(10, ...report.results.map((r) => `${r.name} ${r.version}`.length)) + 2;
  for (const r of report.results) {
    const when = r.published ? `${r.published.slice(0, 10)} (${Math.floor(r.ageDays)} days${r.from === "recorded" ? ", recorded" : ""})` : "";
    lines.push(`  ${label[r.status].padEnd(10)}${r.kind.padEnd(13)}${`${r.name} ${r.version}`.padEnd(w)}${when.padEnd(34)}${r.file}`);
    if (r.message && r.status !== "ok") lines.push(`  ${"".padEnd(23)}${r.message}`);
    if (r.note) lines.push(`  ${"".padEnd(23)}${r.note}`);
  }
  const bad = report.results.filter((r) => r.status !== "ok" && r.status !== "unknown" && r.status !== "network").length;
  const unchecked = report.results.filter((r) => r.status === "network").length;
  const checked = report.results.length - unchecked;
  lines.push("", report.ok ? `All ${checked} checked pins pass.` : `${bad || "Some"} pin${bad === 1 ? "" : "s"} need${bad === 1 ? "s" : ""} attention.`);
  if (unchecked) lines.push(`${unchecked} pin${unchecked === 1 ? "" : "s"} could not be checked (network). That is not an age failure; run the check again, or use --offline --strict to rely on recorded dates.`);
  return lines.join("\n") + "\n";
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === here.toLowerCase()) {
  const args = process.argv.slice(2);
  const val = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = val("--root") ? resolve(val("--root")) : resolve(dirname(here), "..");
  const minDays = val("--min-days") ? Number(val("--min-days")) : MIN_DAYS;
  checkPins({ root, offline: args.includes("--offline"), strict: args.includes("--strict"), minDays }).then(
    (report) => {
      if (args.includes("--json")) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      else process.stdout.write(format(report));
      process.exitCode = report.ok ? 0 : 1;
    },
    (err) => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exitCode = 1;
    },
  );
}
