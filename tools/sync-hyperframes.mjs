#!/usr/bin/env node
// tools/sync-hyperframes.mjs: rebuild Cutscene's engine-derived skills from the
// pinned upstream source (HyperFrames, Apache-2.0, HeyGen, Inc.).
//
// For maintainers, not users. Node built-ins only.
//
//   node tools/sync-hyperframes.mjs            fetch (or reuse the cache), rebuild, write
//   node tools/sync-hyperframes.mjs --check    rebuild in memory; exit 1 if the tree differs
//   options: --source <dir>   use an already-extracted upstream tree (must contain skills/)
//            --cache <dir>    where the verified tarball + extraction live
//                             (default: <os tmp>/cutscene-sync/<commit>)
//            --strict         fail on residue / broken links / missing script deps
//            --json           one JSON summary object on stdout
//            --quiet          only print problems
//
// What it does (all deterministic, so a re-run on the same upstream is a no-op):
//   1. gets the upstream tarball at the commit pinned in tools/sync-map.json and
//      verifies it (tag -> commit through the GitHub API, plus the commit id that
//      git-archive writes into the tarball's pax header);
//   2. maps upstream skills onto Cutscene skills (sync-map.json "targets");
//   3. rewrites commands, skill names, links and branding (sync-map.json "rewrite",
//      "patches", "drop*");
//   4. layers overlays/<target>/ on top (overlay files win; SKILL.head.md and
//      SKILL.append.md wrap the generated SKILL.md);
//   5. writes the tree, THIRD_PARTY.md and tools/sync-lock.json (per-file sha256,
//      source -> target), and prints what changed upstream since the last lock.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..");
const MAP_PATH = join(HERE, "sync-map.json");
const LOCK_PATH = join(HERE, "sync-lock.json");

// ---------------------------------------------------------------------------
// small helpers

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const toPosix = (p) => p.split(sep).join("/");

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**/" matches zero or more directories
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if ("\\^$+.()|{}[]".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}
const globCache = new Map();
export function matchGlob(path, glob) {
  if (!globCache.has(glob)) globCache.set(glob, globToRegExp(glob));
  return globCache.get(glob).test(path);
}
const matchAny = (path, globs = []) => globs.some((g) => matchGlob(path, g));

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else if (st.isFile()) out.push(toPosix(full.slice(base.length + 1)));
  }
  return out;
}

const BINARY_EXT = new Set([
  ".woff2", ".woff", ".ttf", ".otf", ".mp3", ".wav", ".m4a", ".ogg", ".mp4", ".webm", ".mov",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".cube", ".glb", ".gltf", ".bin", ".zip",
]);
const extOf = (p) => {
  const m = /\.[^./]+$/.exec(p);
  return m ? m[0].toLowerCase() : "";
};
const isBinary = (p) => BINARY_EXT.has(extOf(p));
const CODE_EXT = new Set([".mjs", ".cjs", ".js", ".ts"]);
const HASH_EXT = new Set([".sh", ".py", ".yaml", ".yml"]);

function relLink(fromFile, toFile) {
  let r = posix.relative(posix.dirname(fromFile), toFile);
  if (!r.startsWith(".")) r = r === "" ? "." : r;
  return r;
}

function regexOf(spec, extraFlags = "") {
  if (spec instanceof RegExp) return spec;
  const flags = Array.from(new Set(("g" + extraFlags).split(""))).join("");
  return new RegExp(spec, flags);
}

// ---------------------------------------------------------------------------
// upstream fetch + verification (pure Node tar reader, no system tar needed)

function parseOctal(buf, off, len) {
  const s = buf.toString("latin1", off, off + len).replace(/\0.*$/, "").trim();
  return s ? parseInt(s, 8) : 0;
}

function parsePax(text) {
  const out = {};
  let i = 0;
  while (i < text.length) {
    const sp = text.indexOf(" ", i);
    if (sp < 0) break;
    const len = parseInt(text.slice(i, sp), 10);
    if (!len) break;
    const rec = text.slice(sp + 1, i + len - 1);
    const eq = rec.indexOf("=");
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/**
 * Stream a .tar.gz and call onEntry({path, type, data}) for every entry.
 * Handles ustar prefixes and pax ('x' per-entry, 'g' global) headers.
 * Returns { globalPax }.
 */
export function readTarGz(file, onEntry) {
  return new Promise((resolvePromise, reject) => {
    const gunzip = createGunzip();
    let buf = Buffer.alloc(0);
    let state = { need: 512, mode: "header" };
    let current = null;
    let paxNext = null;
    let globalPax = {};
    let done = false;
    const chunks = [];
    let chunkLen = 0;

    function consume() {
      while (!done) {
        if (state.mode === "header") {
          if (buf.length < 512) return;
          const h = buf.subarray(0, 512);
          buf = buf.subarray(512);
          if (h.every((b) => b === 0)) {
            done = true;
            return;
          }
          const name = h.toString("utf8", 0, 100).replace(/\0.*$/s, "");
          const size = parseOctal(h, 124, 12);
          const type = String.fromCharCode(h[156] || 48);
          const magic = h.toString("latin1", 257, 263);
          const prefix = magic.startsWith("ustar") ? h.toString("utf8", 345, 500).replace(/\0.*$/s, "") : "";
          let path = prefix ? `${prefix}/${name}` : name;
          if (paxNext?.path) path = paxNext.path;
          current = { path, type, size };
          paxNext = type === "x" || type === "g" ? paxNext : null;
          state = { mode: "data", need: size, pad: (512 - (size % 512)) % 512 };
          chunks.length = 0;
          chunkLen = 0;
          if (size === 0) finishEntry();
        } else {
          const take = Math.min(state.need - chunkLen, buf.length);
          if (take > 0) {
            chunks.push(buf.subarray(0, take));
            chunkLen += take;
            buf = buf.subarray(take);
          }
          if (chunkLen < state.need) return;
          if (buf.length < state.pad) return;
          buf = buf.subarray(state.pad);
          finishEntry();
        }
      }
    }

    function finishEntry() {
      const data = Buffer.concat(chunks, chunkLen);
      const { type, path } = current;
      if (type === "g") globalPax = { ...globalPax, ...parsePax(data.toString("utf8")) };
      else if (type === "x") paxNext = parsePax(data.toString("utf8"));
      else onEntry({ path, type, data });
      if (type !== "x") paxNext = null;
      state = { mode: "header", need: 512 };
    }

    const input = createReadStream(file);
    input.on("error", reject);
    gunzip.on("error", reject);
    gunzip.on("data", (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      try {
        consume();
      } catch (e) {
        reject(e);
      }
    });
    gunzip.on("end", () => resolvePromise({ globalPax }));
    input.pipe(gunzip);
  });
}

function ghJson(args) {
  const r = spawnSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

function verifyTagCommit(upstream, log) {
  const ref = ghJson([`repos/${upstream.repo}/git/ref/tags/${upstream.tag}`]);
  if (!ref) {
    log(`  note: could not ask GitHub which commit ${upstream.tag} points to (gh missing or offline); relying on the tarball's commit id`);
    return;
  }
  let sha = ref.object?.sha;
  if (ref.object?.type === "tag") {
    const tagObj = ghJson([`repos/${upstream.repo}/git/tags/${sha}`]);
    sha = tagObj?.object?.sha;
  }
  if (sha !== upstream.commit) {
    throw new Error(`Tag ${upstream.tag} points to ${sha}, but sync-map.json pins ${upstream.commit}. Update the pin on purpose.`);
  }
}

async function downloadTarball(upstream, dest, log) {
  log(`  downloading ${upstream.repo}@${upstream.commit.slice(0, 7)} ...`);
  const tmp = `${dest}.part`;
  const r = spawnSync("gh", ["api", `repos/${upstream.repo}/tarball/${upstream.commit}`], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (!r.error && r.status === 0 && r.stdout.length > 1000) {
    writeFileSync(tmp, r.stdout);
  } else {
    const url = `https://codeload.github.com/${upstream.repo}/tar.gz/${upstream.commit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}) from ${url}. Check your connection or pass --source <dir>.`);
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  }
  renameSync(tmp, dest);
}

/** Returns the absolute path of an upstream tree root containing skills/. */
async function getUpstream(map, opts, log) {
  if (opts.source) {
    const dir = resolve(opts.source);
    if (!existsSync(join(dir, "skills"))) throw new Error(`--source ${dir} has no skills/ folder.`);
    const marker = join(dir, ".cutscene-sync-source.json");
    if (existsSync(marker)) {
      const m = JSON.parse(readFileSync(marker, "utf8"));
      if (m.commit !== map.upstream.commit) throw new Error(`--source ${dir} is commit ${m.commit}, but the map pins ${map.upstream.commit}.`);
    } else log(`  note: --source ${dir} has no commit marker; trusting it is ${map.upstream.commit.slice(0, 7)}`);
    return dir;
  }
  const cache = resolve(opts.cache || join(tmpdir(), "cutscene-sync", map.upstream.commit));
  const tree = join(cache, "tree");
  const marker = join(tree, ".cutscene-sync-source.json");
  if (existsSync(marker)) {
    const m = JSON.parse(readFileSync(marker, "utf8"));
    if (m.commit === map.upstream.commit && m.verified) return tree;
  }
  mkdirSync(cache, { recursive: true });
  const tarball = join(cache, "upstream.tar.gz");
  verifyTagCommit(map.upstream, log);
  if (!existsSync(tarball)) await downloadTarball(map.upstream, tarball, log);
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(tree, { recursive: true });
  let root = null;
  const keep = map.upstream.extract ?? ["skills/", "LICENSE", "CREDITS.md"];
  const { globalPax } = await readTarGz(tarball, ({ path, type, data }) => {
    const slash = path.indexOf("/");
    if (slash < 0) return;
    if (!root) root = path.slice(0, slash);
    const rel = path.slice(slash + 1);
    if (!rel || !keep.some((k) => (k.endsWith("/") ? rel.startsWith(k) : rel === k))) return;
    if (type !== "0" && type !== "\0") return; // regular files only (no links)
    if (rel.split("/").some((seg) => seg === ".." || seg === "")) return;
    const out = join(tree, ...rel.split("/"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  });
  if (globalPax.comment !== map.upstream.commit) {
    rmSync(tree, { recursive: true, force: true });
    throw new Error(`The downloaded tarball is commit ${globalPax.comment ?? "unknown"}, expected ${map.upstream.commit}.`);
  }
  writeFileSync(
    marker,
    JSON.stringify({ repo: map.upstream.repo, tag: map.upstream.tag, commit: map.upstream.commit, verified: true, tarballSha256: sha256(readFileSync(tarball)) }, null, 2),
  );
  log(`  verified ${map.upstream.tag} = ${map.upstream.commit}`);
  return tree;
}

// ---------------------------------------------------------------------------
// markdown helpers

function splitFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return { fm: "", body: text };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { fm: "", body: text };
  const after = text.indexOf("\n", end + 4);
  return { fm: text.slice(0, after + 1), body: text.slice(after + 1) };
}

/** Lines with a flag telling whether each line is inside a fenced code block. */
function fenceMap(lines) {
  const inFence = [];
  let fence = null;
  for (const line of lines) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      inFence.push(true);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^\s*[`~]+\s*$/.test(line)) fence = null;
    } else if (m) {
      inFence.push(true);
      fence = m[1];
    } else inFence.push(false);
  }
  return inFence;
}

function dropSections(text, headingRes) {
  if (!headingRes.length) return { text, hits: [] };
  const lines = text.split("\n");
  const fences = fenceMap(lines);
  const keep = [];
  const hits = [];
  let dropLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = !fences[i] && /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h) {
      const level = h[1].length;
      if (dropLevel && level <= dropLevel) dropLevel = 0;
      if (!dropLevel) {
        const re = headingRes.find((r) => regexOf(r, "").test(h[2]));
        if (re) {
          dropLevel = level;
          hits.push(re);
          continue;
        }
      }
    }
    if (!dropLevel) keep.push(lines[i]);
  }
  return { text: keep.join("\n"), hits };
}

/**
 * Move one section (a heading and everything under it) out of a SKILL.md body into a reference
 * file, leaving the heading and a short summary behind. Used to keep SKILL.md under ~500 lines.
 * Returns {text, moved} or null when the heading isn't there (upstream drift; the caller fails).
 */
export function moveSectionOut(text, { heading, to, summary }) {
  const lines = text.split("\n");
  const fences = fenceMap(lines);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = !fences[i] && /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!h) continue;
    if (start < 0) {
      if (regexOf(heading, "").test(h[2])) {
        start = i;
        level = h[1].length;
      }
    } else if (h[1].length <= level) {
      return finish(i);
    }
  }
  return start < 0 ? null : finish(lines.length);

  function finish(end) {
    const section = lines.slice(start, end);
    // the reference starts at "#", nested headings move up with it
    const shifted = section.map((line, k) => {
      if (fences[start + k]) return line;
      const h = /^(#{1,6})(\s+.*)$/.exec(line);
      return h ? "#".repeat(Math.max(1, h[1].length - (level - 1))) + h[2] : line;
    });
    // links were relative to the skill folder; the reference lives in references/
    const moved = shifted
      .join("\n")
      .replace(/\]\((?!https?:|mailto:|#|\/)([^)\s]+)\)/g, (m, href) => `](${href.startsWith("references/") ? href.slice("references/".length) : `../${href}`})`)
      .replace(/\n+$/, "");
    const stub = [lines[start], "", summary.trim(), "", `Details: [${to}](${to}).`, ""];
    return { text: [...lines.slice(0, start), ...stub, ...lines.slice(end)].join("\n"), moved: moved + "\n" };
  }
}

function dropBlocks(text, blocks) {
  let hits = [];
  for (const b of blocks) {
    const lines = text.split("\n");
    const out = [];
    let dropping = false;
    const start = regexOf(b.start, "");
    const end = regexOf(b.end, "");
    for (const line of lines) {
      if (!dropping && start.test(line)) {
        dropping = true;
        hits.push(b.start);
        if (b.inclusiveEnd === false) continue;
        if (end.test(line) && b.sameLine) dropping = false;
        continue;
      }
      if (dropping) {
        if (end.test(line)) {
          dropping = false;
          if (b.keepEnd) out.push(line);
        }
        continue;
      }
      out.push(line);
    }
    text = out.join("\n");
  }
  return { text, hits };
}

function cleanupMarkdown(text) {
  const lines = text.split("\n");
  // drop fenced blocks that became empty
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})[\w-]*\s*$/.exec(lines[i]);
    if (open) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && lines[j].trim() === open[2]) {
        i = j;
        continue;
      }
    }
    out.push(lines[i]);
  }
  // drop table separator rows left without a header and tables with only a header
  const res = [];
  for (let i = 0; i < out.length; i++) {
    const isRow = (l) => /^\s*\|.*\|\s*$/.test(l ?? "");
    const isSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l ?? "") && /-/.test(l ?? "");
    if (isRow(out[i]) && isSep(out[i + 1]) && !isRow(out[i + 2])) {
      i += 1; // header + separator with no rows
      continue;
    }
    res.push(out[i]);
  }
  return res.join("\n").replace(/\n{4,}/g, "\n\n\n").replace(/\n{3,}(?=\S)/g, "\n\n");
}

// ---------------------------------------------------------------------------
// the transform engine

/** rename: exact "a/b.md" keys, or "dir/" prefixes (longest prefix wins). */
function applyRename(rel, rename = {}) {
  if (rename[rel]) return rename[rel];
  const prefix = Object.keys(rename)
    .filter((k) => k.endsWith("/") && rel.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? rename[prefix] + rel.slice(prefix.length) : rel;
}

function buildContext(map, upstreamRoot) {
  const pathMap = new Map(); // "skills/<src>/<rel>" -> "<target repo-relative path>"
  const dirMap = []; // [upstream dir prefix, target dir prefix]
  const fileJobs = []; // {up, target, targetId, source, kind}
  const targetDirOf = {};
  for (const [targetId, t] of Object.entries(map.targets)) {
    targetDirOf[targetId] = t.dir;
    for (const src of t.sources) {
      const srcDir = `skills/${src.from}`;
      const prefix = src.prefix ?? "";
      dirMap.push([`${srcDir}/`, `${t.dir}/${prefix}`, src.from]);
      const files = walk(join(upstreamRoot, "skills", src.from));
      for (const rel of files) {
        const up = `${srcDir}/${rel}`;
        if (rel === "SKILL.md") {
          if (src.skillMd === "body") {
            pathMap.set(up, `${t.dir}/SKILL.md`);
            fileJobs.push({ up, target: `${t.dir}/SKILL.md`, targetId, src, kind: "skill-body" });
          } else if (typeof src.skillMd === "string") {
            const target = `${t.dir}/${prefix}${src.skillMd}`;
            pathMap.set(up, target);
            fileJobs.push({ up, target, targetId, src, kind: "guide" });
          }
          continue;
        }
        const globalExcluded = matchAny(rel, map.exclude) || matchAny(up, map.excludeUpstream);
        if (globalExcluded || matchAny(rel, src.exclude)) continue;
        if (src.include && !matchAny(rel, src.include)) continue;
        const renamed = applyRename(rel, src.rename);
        const target = `${t.dir}/${prefix}${renamed}`;
        pathMap.set(up, target);
        fileJobs.push({ up, target, targetId, src, kind: "file" });
      }
    }
  }
  // longest prefix first for directory mapping
  dirMap.sort((a, b) => b[0].length - a[0].length);
  return { pathMap, dirMap, fileJobs, targetDirOf };
}

/** Map an upstream repo-relative path (file or dir, posix) to its target. */
function mapUpstreamPath(ctx, up) {
  if (ctx.pathMap.has(up)) return { target: ctx.pathMap.get(up), exact: true };
  const asDir = up.endsWith("/") ? up : `${up}/`;
  // a directory whose files were synced
  for (const [k, v] of ctx.pathMap) {
    if (k.startsWith(asDir)) {
      for (const [from, to] of ctx.dirMap) {
        if (asDir.startsWith(from)) return { target: (to + asDir.slice(from.length)).replace(/\/$/, ""), exact: false, dir: true };
      }
      void v;
    }
  }
  return null;
}

function skillNameRegex(names) {
  return new RegExp(`(?<![\\w./@-])/?(${names.map((n) => n.replace(/[-]/g, "\\-")).join("|")})(?![\\w-])`, "g");
}

const DEBUG_DROPS = process.env.CUTSCENE_SYNC_DEBUG ? [] : null;
export const debugDrops = () => DEBUG_DROPS;

const PLACEHOLDER = (i) => `\u0000P${i}\u0000`;

function protect(text, patterns) {
  const saved = [];
  for (const p of patterns) {
    text = text.replace(regexOf(p), (m) => {
      saved.push(m);
      return PLACEHOLDER(saved.length - 1);
    });
  }
  return { text, restore: (t) => t.replace(/\u0000P(\d+)\u0000/g, (_, i) => saved[Number(i)]) };
}

function applyPatches(text, patches, file, stage, problems) {
  for (const p of patches) {
    if ((p.stage ?? "before") !== stage) continue;
    if (!matchAny(file, [].concat(p.file))) continue;
    if (p.regex) {
      const re = regexOf(p.regex, p.flags ?? "m");
      if (!re.test(text)) {
        if (!p.optional) problems.push(`patch did not match in ${file}: /${p.regex}/`);
        continue;
      }
      re.lastIndex = 0;
      text = text.replace(re, p.replace);
    } else {
      if (!text.includes(p.find)) {
        if (!p.optional) problems.push(`patch did not match in ${file}: ${JSON.stringify(p.find.slice(0, 80))}`);
        continue;
      }
      text = text.split(p.find).join(p.replace);
    }
  }
  return text;
}

function commandRewrite(text, rw) {
  const cmds = rw.cliCommands.join("|");
  // npx / bunx / pnpm dlx forms, with optional --yes and @version
  text = text.replace(/\b(?:npx|bunx|pnpm dlx|yarn dlx)\s+(?:(?:--yes|-y)\s+)?hyperframes(?:@[\w.^~-]+)?(?![\w./-])/g, "cutscene");
  // bare "hyperframes <command>"
  text = text.replace(new RegExp(`(?<![\\w./@$-])hyperframes(?=\\s+(?:${cmds})(?![\\w-]))`, "g"), "cutscene");
  // "hyperframes --help" etc.
  text = text.replace(/(?<![\w./@$-])hyperframes(?=\s+--(?:help|version)\b)/g, "cutscene");
  return text;
}

function rewriteMarkdown(text, file, up, ctx, map, problems) {
  const rw = map.rewrite;
  // 1) sections / blocks / lines
  const fileDrops = (map.dropSections ?? []).filter((d) => matchAny(up, [].concat(d.file)));
  text = dropSections(text, fileDrops.flatMap((d) => [].concat(d.heading))).text;
  const blockDrops = (map.dropBlocks ?? []).filter((d) => matchAny(up, [].concat(d.file ?? "**")));
  text = dropBlocks(text, blockDrops).text;

  // 2) commands first, so line drops can see "cutscene <blocked>"
  text = commandRewrite(text, rw);

  const lineDrops = (map.dropLines ?? [])
    .filter((d) => matchAny(up, [].concat(d.file ?? "**")))
    .flatMap((d) => [].concat(d.match).map((r) => regexOf(r, d.flags ?? "i")));
  const blocked = new RegExp(`\\bcutscene\\s+(?:${rw.blockedCommands.join("|")})(?![\\w-])`, "i");
  text = text
    .split("\n")
    .filter((line) => {
      const drop =
        blocked.test(line) ||
        lineDrops.some((re) => {
          re.lastIndex = 0;
          return re.test(line);
        });
      if (drop && DEBUG_DROPS) DEBUG_DROPS.push(`${file}: ${line}`);
      return !drop;
    })
    .join("\n");

  // 3) <SKILL_DIR> placeholders
  const job = ctx.jobsByTarget.get(file);
  const prefix = job?.src?.prefix ?? "";
  // A path after the placeholder is quoted, because skill folders can contain spaces.
  text = text.replace(/"?<SKILL_DIR>((?:\/[^\s`"')\]]*)?)"?/g, (m, rest) => {
    const base = `<this skill's folder>${prefix ? "/" + prefix.replace(/\/$/, "") : ""}`;
    return rest ? `"${base}${rest}"` : base;
  });

  // 4) links: [text](relative)
  text = text.replace(/(!?)\[([^\]\n]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (all, bang, label, href, title) => {
    if (/^(?:[a-z]+:|#|\/|<)/i.test(href)) {
      if (/^https?:\/\/[^/]*(?:hyperframes|heygen)/i.test(href)) return bang ? "" : label;
      return all;
    }
    const [pathPart, anchor] = href.split("#");
    const upTarget = posix.normalize(posix.join(posix.dirname(up), pathPart));
    const mapped = mapUpstreamPath(ctx, upTarget);
    if (mapped) return `${bang}[${label}](${relLink(file, mapped.target)}${anchor ? "#" + anchor : ""}${title ?? ""})`;
    if (ctx.extraTargets.has(upTarget)) return `${bang}[${label}](${relLink(file, ctx.extraTargets.get(upTarget))}${anchor ? "#" + anchor : ""}${title ?? ""})`;
    return bang ? "" : label; // link to something Cutscene does not ship
  });

  // 5) path mentions of upstream skill files outside links
  const srcNames = Object.keys(rw.skillNames).sort((a, b) => b.length - a.length);
  const pathRe = new RegExp(
    `(?<![\\w@-])((?:\\.\\./)+|skills/)?(${srcNames.map((n) => n.replace(/-/g, "\\-")).join("|")})/((?:[\\w.-]+/?)*[\\w.-]*)`,
    "g",
  );
  text = text.replace(pathRe, (all, lead = "", skill, rest, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 40), offset);
    if (/https?:\/\/\S*$/.test(before) || /[\w.]\/$/.test(before)) return all; // part of a URL or a longer path
    const up2 = `skills/${skill}/${rest}`.replace(/\/$/, "");
    const mapped = mapUpstreamPath(ctx, up2) || (rest === "" ? null : null);
    let target = mapped?.target;
    if (!target) {
      // a skill root mention like "../hyperframes-core/" or unmapped file
      const t = rw.skillNames[skill];
      if (!t || t.startsWith("!")) return all;
      const tdir = ctx.targetDirOf[t] ?? `skills/${t}`;
      if (rest === "") target = tdir;
      else return all; // unknown file: leave for the residue report
    }
    const trailing = rest.endsWith("/") ? "/" : "";
    if (lead.startsWith("..")) return relLink(file, target) + trailing;
    if (lead === "skills/") return target + trailing;
    return target.replace(/^skills\//, "") + trailing;
  });

  // 6) skill names (/hyperframes-core, `hyperframes-core`)
  for (const r of rw.beforeNames ?? []) text = text.replace(regexOf(r.find, r.flags ?? ""), r.replace);
  text = text.replace(skillNameRegex(srcNames), (all, name, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 30), offset);
    if (/https?:\/\/\S*$/.test(before)) return all;
    const slash = all.startsWith("/") ? "/" : "";
    const t = rw.skillNames[name];
    if (!t) return all;
    if (t.startsWith("!")) return rw.notInV1Text.replace("{name}", name.replace(/-/g, " "));
    if (!slash && rw.slashOnlyNames.includes(name)) return all;
    return slash + t;
  });

  // 7) branding in prose, protecting engine API names
  const { text: guarded, restore } = protect(text, rw.engineApi);
  let t2 = guarded;
  for (const r of rw.prose) t2 = t2.replace(regexOf(r.find, r.flags ?? ""), r.replace);
  text = restore(t2);

  return cleanupMarkdown(text);
}

function rewriteCode(text, file, map) {
  const rw = map.rewrite;
  text = commandRewrite(text, rw);
  for (const r of rw.code ?? []) {
    if (r.file && !matchAny(file, [].concat(r.file))) continue;
    text = text.replace(regexOf(r.find, r.flags ?? ""), r.replace);
  }
  return text;
}

function headerFor(file, up, map) {
  const h = map.headers;
  const ext = extOf(file);
  const path = up.replace(/^skills\//, "skills/");
  if (ext === ".md") return h.markdown;
  if (CODE_EXT.has(ext)) return h.code.replace("{path}", path);
  if (HASH_EXT.has(ext)) return h.hash.replace("{path}", path);
  if (ext === ".html") return h.html.replace("{path}", path);
  if (ext === ".css") return h.css.replace("{path}", path);
  return null;
}

function addHeader(text, header, ext) {
  if (!header) return text;
  if (ext === ".md") {
    const { fm, body } = splitFrontmatter(text);
    return `${fm}${header}\n\n${body.replace(/^\n+/, "")}`;
  }
  const lines = text.split("\n");
  if (lines[0].startsWith("#!")) return [lines[0], header, ...lines.slice(1)].join("\n");
  if (ext === ".html" && /^<!doctype/i.test(lines[0])) return [lines[0], header, ...lines.slice(1)].join("\n");
  return `${header}\n${text}`;
}

function transformFile(job, raw, ctx, map, problems) {
  const file = job.target;
  const ext = extOf(file);
  if (isBinary(file) || matchAny(file.split("/").slice(2).join("/"), map.verbatim) || matchAny(job.up, map.verbatim)) return raw;
  let text = raw.toString("utf8").replace(/\r\n/g, "\n");
  text = applyPatches(text, map.patches ?? [], job.up, "before", problems);
  if (ext === ".md") {
    if (job.kind === "guide") text = splitFrontmatter(text).body.replace(/^\n+/, "");
    text = rewriteMarkdown(text, file, job.up, ctx, map, problems);
  } else if (CODE_EXT.has(ext) || HASH_EXT.has(ext) || ext === ".html" || ext === ".css") {
    text = rewriteCode(text, file, map);
  }
  text = applyPatches(text, map.patches ?? [], job.up, "after", problems);
  if (job.kind !== "skill-body") text = addHeader(text, headerFor(file, job.up, map), ext);
  if (!text.endsWith("\n")) text += "\n";
  return Buffer.from(text, "utf8");
}

// ---------------------------------------------------------------------------
// SKILL.md assembly + overlays

function yamlString(s) {
  return JSON.stringify(s.replace(/\s+/g, " ").trim());
}

function assembleSkillMd(targetId, t, bodies, overlayDir, map) {
  const head = existsSync(join(overlayDir, "SKILL.head.md")) ? readFileSync(join(overlayDir, "SKILL.head.md"), "utf8").replace(/\r\n/g, "\n") : "";
  const append = existsSync(join(overlayDir, "SKILL.append.md")) ? readFileSync(join(overlayDir, "SKILL.append.md"), "utf8").replace(/\r\n/g, "\n") : "";
  const parts = [
    `---\nname: ${t.name}\ndescription: ${yamlString(t.description)}\n---\n`,
    map.headers.markdown,
  ];
  if (head.trim()) parts.push(head.trim());
  if (t.runNote !== false) parts.push(map.runNote.trim());
  for (const b of bodies) if (b.trim()) parts.push(b.trim());
  if (append.trim()) parts.push(append.trim());
  return Buffer.from(cleanupMarkdown(parts.join("\n\n")) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// checks

export function residueScan(files, map) {
  const out = [];
  const allow = (map.residue.allow ?? []).map((r) => regexOf(r, "i"));
  const forbidMd = map.residue.markdown.map((r) => regexOf(r, "i"));
  const forbidCode = map.residue.code.map((r) => regexOf(r, "i"));
  for (const [file, buf] of files) {
    const ext = extOf(file);
    if (isBinary(file) || matchAny(file, map.residue.skipFiles ?? [])) continue;
    const isMd = ext === ".md";
    const forbid = isMd ? forbidMd : forbidCode;
    const lines = buf.toString("utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("Adapted from HyperFrames")) return;
      let scrub = line;
      for (const a of allow) scrub = scrub.replace(a, "");
      for (const f of forbid) {
        f.lastIndex = 0;
        const m = f.exec(scrub);
        if (m) {
          out.push({ file, line: i + 1, match: m[0], text: line.trim().slice(0, 160) });
          break;
        }
      }
    });
  }
  return out;
}

export function linkScan(files, repoRoot = REPO_ROOT) {
  const broken = [];
  for (const [file, buf] of files) {
    if (extOf(file) !== ".md") continue;
    const text = buf.toString("utf8");
    const lines = text.split("\n");
    const fences = fenceMap(lines);
    lines.forEach((line, i) => {
      if (fences[i]) return;
      const scrubbed = line.replace(/`[^`]*`/g, "");
      for (const m of scrubbed.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const href = m[1];
        if (/^(?:[a-z]+:|#|\/|<)/i.test(href)) continue;
        const target = posix.normalize(posix.join(posix.dirname(file), href.split("#")[0]));
        if (files.has(target)) continue;
        if (existsSync(join(repoRoot, ...target.split("/")))) continue;
        // a directory link that holds synced files
        if ([...files.keys()].some((k) => k.startsWith(`${target}/`))) continue;
        broken.push({ file, line: i + 1, href });
      }
    });
  }
  return broken;
}

export function scriptDepScan(files, repoRoot = REPO_ROOT, ownedDirs = []) {
  const missing = [];
  for (const [file, buf] of files) {
    const ext = extOf(file);
    if (!CODE_EXT.has(ext)) continue;
    const text = buf.toString("utf8");
    const specs = [
      ...text.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g),
      ...text.matchAll(/\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g),
      ...text.matchAll(/\brequire\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g),
      ...text.matchAll(/^\s*import\s+["'](\.{1,2}\/[^"']+)["']/gm),
    ].map((m) => m[1]);
    for (const spec of specs) {
      const target = posix.normalize(posix.join(posix.dirname(file), spec));
      const candidates = [target, `${target}.js`, `${target}.mjs`, `${target}.cjs`, `${target}/index.js`];
      if (candidates.some((c) => files.has(c))) continue;
      const inOwned = ownedDirs.some((d) => target.startsWith(`${d}/`));
      if (!inOwned && candidates.some((c) => existsSync(join(repoRoot, ...c.split("/"))))) continue;
      missing.push({ file, spec, target, external: !inOwned });
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// THIRD_PARTY.md

function thirdPartyMd(map, plan, lock = {}) {
  const tp = map.thirdParty;
  const lines = [
    "# Third-party material in Cutscene",
    "",
    "Generated by `tools/sync-hyperframes.mjs` from `tools/sync-map.json`. Do not edit by hand; change",
    "the map (`thirdParty`, `targets`) and re-run the sync.",
    "",
    tp.intro.trim(),
    "",
    `Upstream: \`${map.upstream.repo}\` at tag \`${map.upstream.tag}\`, commit \`${map.upstream.commit}\`.`,
    "",
    "## Where each upstream skill went",
    "",
    "| Upstream skill (HyperFrames) | Cutscene location | What was kept | Licence |",
    "|---|---|---|---|",
  ];
  for (const [id, t] of Object.entries(map.targets)) {
    for (const s of t.sources) {
      const where = `\`${t.dir}/${s.prefix ?? ""}\``.replace("/`", "/`").replace(/\/`$/, "/`");
      lines.push(`| \`${s.from}\` | ${where} | ${s.kept ?? "SKILL.md, references and scripts (adapted)"} | Apache-2.0 |`);
    }
    void id;
  }
  for (const n of tp.notSynced ?? []) lines.push(`| \`${n.from}\` | not shipped | ${n.why} | Apache-2.0 |`);
  lines.push("", "## Licences of bundled files", "");
  lines.push("| Files | Origin | Licence | Notes |", "|---|---|---|---|");
  for (const e of tp.bundled) {
    const count = [...plan.keys()].filter((k) => matchAny(k, [].concat(e.files))).length;
    lines.push(`| ${[].concat(e.files).map((f) => `\`${f}\``).join("<br>")} | ${e.origin} | ${e.license} | ${e.notes ?? ""}${count ? ` (${count} file${count === 1 ? "" : "s"})` : ""} |`);
  }
  // Third-party licence texts kept in overlays (font licences, for example) aren't Cutscene's own.
  const own = Object.entries(lock)
    .filter(([, v]) => typeof v.from === "string" && v.from.startsWith("overlays/"))
    .map(([k]) => k)
    .filter((k) => !/(^|\/)(OFL|LICENSE)[^/]*\.txt$/i.test(k))
    .sort();
  if (own.length) {
    lines.push("", "## Cutscene's own files in the generated folders", "", "Written for Cutscene (Apache-2.0) and layered on top by the sync from `overlays/`:", "");
    for (const k of own) lines.push(`- \`${k}\``);
  }
  lines.push("", "## Loaded at run time, not bundled", "");
  for (const r of tp.runtime ?? []) lines.push(`- ${r}`);
  lines.push("", "## Ideas only, no code copied", "");
  for (const r of tp.ideasOnly ?? []) lines.push(`- ${r}`);
  lines.push("");
  return Buffer.from(lines.join("\n"), "utf8");
}

// ---------------------------------------------------------------------------
// main build

export async function build(opts = {}) {
  const log = opts.quiet ? () => {} : (m) => process.stderr.write(m + "\n");
  const map = JSON.parse(readFileSync(opts.mapPath ?? MAP_PATH, "utf8"));
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const pin = (() => {
    try {
      return JSON.parse(readFileSync(join(repoRoot, "skills/cutscene/engine.json"), "utf8")).hyperframes;
    } catch {
      return map.upstream.version;
    }
  })();
  map.rewrite.code = (map.rewrite.code ?? []).map((r) => ({ ...r, replace: r.replace.replaceAll("{pin}", pin) }));
  map.patches = (map.patches ?? []).map((p) => ({ ...p, replace: p.replace.replaceAll("{pin}", pin) }));

  const upstreamRoot = await getUpstream(map, opts, log);
  const ctx = buildContext(map, upstreamRoot);
  ctx.jobsByTarget = new Map(ctx.fileJobs.map((j) => [j.target, j]));
  ctx.extraTargets = new Map(Object.entries(map.linkTargets ?? {}));

  const problems = [];
  const plan = new Map(); // target -> Buffer
  const lock = {}; // target -> {from, sourceSha256, sha256}
  const bodies = {}; // targetId -> [body]

  for (const job of ctx.fileJobs) {
    const raw = readFileSync(join(upstreamRoot, ...job.up.split("/")));
    if (job.kind === "skill-body") {
      let text = raw.toString("utf8").replace(/\r\n/g, "\n");
      text = applyPatches(text, map.patches ?? [], job.up, "before", problems);
      text = splitFrontmatter(text).body;
      text = rewriteMarkdown(text, job.target, job.up, ctx, map, problems);
      text = applyPatches(text, map.patches ?? [], job.up, "after", problems);
      for (const mv of (map.moveSections ?? []).filter((m) => m.target === job.targetId && matchAny(job.up, [].concat(m.file ?? "**")))) {
        const r = moveSectionOut(text, mv);
        if (!r) {
          problems.push(`moveSections: heading ${mv.heading} not found in ${job.up}`);
          continue;
        }
        text = r.text;
        const target = `${map.targets[job.targetId].dir}/${mv.to}`;
        plan.set(target, Buffer.from(`${map.headers.markdown}\n\n${r.moved}`, "utf8"));
        lock[target] = { from: `${job.up} (section "${mv.heading}")`, sourceSha256: sha256(raw) };
      }
      (bodies[job.targetId] ??= []).push(text);
      (lock[job.target] ??= { from: [], sourceSha256: [] }).from.push(job.up);
      lock[job.target].sourceSha256.push(sha256(raw));
      continue;
    }
    const out = transformFile(job, raw, ctx, map, problems);
    if (plan.has(job.target)) problems.push(`two upstream files map to ${job.target}`);
    plan.set(job.target, out);
    lock[job.target] = { from: job.up, sourceSha256: sha256(raw) };
  }

  for (const [targetId, t] of Object.entries(map.targets)) {
    const overlayDir = join(repoRoot, "overlays", targetId);
    if (t.skillMd !== false) {
      const target = `${t.dir}/SKILL.md`;
      plan.set(target, assembleSkillMd(targetId, t, bodies[targetId] ?? [], overlayDir, map));
      lock[target] = { from: [...(lock[target]?.from ?? []), "generated"], sourceSha256: lock[target]?.sourceSha256 ?? [] };
      if (existsSync(join(overlayDir, "SKILL.head.md"))) lock[target].from.push(`overlays/${targetId}/SKILL.head.md`);
      if (existsSync(join(overlayDir, "SKILL.append.md"))) lock[target].from.push(`overlays/${targetId}/SKILL.append.md`);
    }
    for (const rel of walk(overlayDir)) {
      if (rel === "SKILL.head.md" || rel === "SKILL.append.md") continue;
      const target = `${t.dir}/${rel}`;
      const raw = readFileSync(join(overlayDir, ...rel.split("/")));
      const buf = isBinary(rel) ? raw : Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
      plan.set(target, buf);
      lock[target] = { from: `overlays/${targetId}/${rel}`, sourceSha256: sha256(raw) };
    }
  }

  plan.set("THIRD_PARTY.md", thirdPartyMd(map, plan, lock));
  lock["THIRD_PARTY.md"] = { from: "generated" };

  for (const [target, buf] of plan) lock[target].sha256 = sha256(buf);
  const sortedLock = Object.fromEntries(Object.keys(lock).sort().map((k) => [k, lock[k]]));
  const lockJson = {
    note: "Generated by tools/sync-hyperframes.mjs. Records which upstream file became which Cutscene file.",
    upstream: { repo: map.upstream.repo, tag: map.upstream.tag, commit: map.upstream.commit },
    enginePin: pin,
    files: sortedLock,
  };
  const lockBuf = Buffer.from(JSON.stringify(lockJson, null, 2) + "\n", "utf8");

  const ownedDirs = Object.values(map.targets).map((t) => t.dir);
  const skillFiles = new Map([...plan].filter(([k]) => k !== "THIRD_PARTY.md"));
  return {
    map,
    plan,
    lockBuf,
    lockJson,
    ownedDirs,
    problems,
    residue: residueScan(skillFiles, map),
    links: linkScan(skillFiles, repoRoot),
    deps: scriptDepScan(skillFiles, repoRoot, ownedDirs),
    repoRoot,
  };
}

/** Files on disk that the sync owns (inside generated dirs) plus THIRD_PARTY.md + lock. */
function diskState(result) {
  const files = new Map();
  for (const dir of result.ownedDirs) {
    for (const rel of walk(join(result.repoRoot, ...dir.split("/")))) {
      files.set(`${dir}/${rel}`, readFileSync(join(result.repoRoot, ...dir.split("/"), ...rel.split("/"))));
    }
  }
  return files;
}

export function diffTree(result) {
  const disk = diskState(result);
  const changed = [];
  const missing = [];
  const extra = [];
  for (const [k, buf] of result.plan) {
    const p = join(result.repoRoot, ...k.split("/"));
    const cur = disk.get(k) ?? (existsSync(p) ? readFileSync(p) : null);
    if (!cur) missing.push(k);
    else if (!cur.equals(buf)) changed.push(k);
  }
  for (const k of disk.keys()) if (!result.plan.has(k)) extra.push(k);
  const lockCur = existsSync(join(result.repoRoot, "tools/sync-lock.json")) ? readFileSync(join(result.repoRoot, "tools/sync-lock.json")) : null;
  if (!lockCur || !lockCur.equals(result.lockBuf)) changed.push("tools/sync-lock.json");
  return { changed, missing, extra };
}

export function writeTree(result) {
  const disk = diskState(result);
  let written = 0;
  let removed = 0;
  for (const k of disk.keys()) {
    if (!result.plan.has(k)) {
      rmSync(join(result.repoRoot, ...k.split("/")));
      removed++;
    }
  }
  for (const [k, buf] of result.plan) {
    const p = join(result.repoRoot, ...k.split("/"));
    if (existsSync(p) && readFileSync(p).equals(buf)) continue;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, buf);
    written++;
  }
  // remove empty directories left behind
  for (const dir of result.ownedDirs) pruneEmpty(join(result.repoRoot, ...dir.split("/")));
  const lockPath = join(result.repoRoot, "tools/sync-lock.json");
  if (!existsSync(lockPath) || !readFileSync(lockPath).equals(result.lockBuf)) writeFileSync(lockPath, result.lockBuf);
  return { written, removed };
}

function pruneEmpty(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      pruneEmpty(full);
      if (readdirSync(full).length === 0) rmSync(full, { recursive: true });
    }
  }
}

export function upstreamChanges(result) {
  const lockPath = join(result.repoRoot, "tools/sync-lock.json");
  if (!existsSync(lockPath)) return null;
  const old = JSON.parse(readFileSync(lockPath, "utf8"));
  const srcShas = (lock) => {
    const m = new Map();
    for (const v of Object.values(lock.files ?? {})) {
      const froms = [].concat(v.from);
      const shas = [].concat(v.sourceSha256 ?? []);
      froms.forEach((f, i) => {
        if (f.startsWith("skills/") && shas[i]) m.set(f, shas[i]);
      });
    }
    return m;
  };
  const a = srcShas(old);
  const b = srcShas(result.lockJson);
  const changed = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k));
  const added = [...b.keys()].filter((k) => !a.has(k));
  const removed = [...a.keys()].filter((k) => !b.has(k));
  return { fromCommit: old.upstream?.commit, toCommit: result.lockJson.upstream.commit, changed, added, removed };
}

export function sizeReport(result) {
  const rows = {};
  for (const [id, t] of Object.entries(result.map.targets)) {
    let bytes = 0;
    let files = 0;
    for (const [k, buf] of result.plan) {
      if (k.startsWith(`${t.dir}/`)) {
        bytes += buf.length;
        files++;
      }
    }
    rows[id] = { dir: t.dir, files, bytes };
  }
  return rows;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") opts.check = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--source") opts.source = argv[++i];
    else if (a === "--cache") opts.cache = argv[++i];
    else if (a === "--help" || a === "-h") opts.help = true;
    else {
      opts.bad = a;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts.bad) {
    process.stdout.write("usage: node tools/sync-hyperframes.mjs [--check] [--strict] [--source <dir>] [--cache <dir>] [--json] [--quiet]\n");
    process.exit(opts.bad ? 2 : 0);
  }
  const log = opts.quiet ? () => {} : (m) => process.stderr.write(m + "\n");
  let result;
  try {
    result = await build({ ...opts, quiet: opts.quiet || opts.json });
  } catch (e) {
    if (opts.json) process.stdout.write(JSON.stringify({ ok: false, error: { code: "SYNC_FAILED", message: e.message, hint: "Check the network, gh auth, or pass --source <dir>." } }) + "\n");
    else process.stderr.write(`sync failed: ${e.message}\n`);
    process.exit(1);
  }
  const report = (label, list, fmt) => {
    if (!list.length) return;
    process.stderr.write(`${label} (${list.length}):\n`);
    for (const x of list.slice(0, 60)) process.stderr.write(`  ${fmt(x)}\n`);
    if (list.length > 60) process.stderr.write(`  ... and ${list.length - 60} more\n`);
  };
  const issues = result.problems.length + result.residue.length + result.links.length + result.deps.filter((d) => !d.external).length;
  if (!opts.json) {
    report("patch problems", result.problems, (x) => x);
    report("branding residue", result.residue, (r) => `${r.file}:${r.line} [${r.match}] ${r.text}`);
    report("broken links", result.links, (l) => `${l.file}:${l.line} -> ${l.href}`);
    report("script imports that do not resolve", result.deps, (d) => `${d.file}: ${d.spec}${d.external ? " (outside the synced skills)" : ""}`);
  }
  const sizes = sizeReport(result);
  if (opts.check) {
    const d = diffTree(result);
    const dirty = d.changed.length + d.missing.length + d.extra.length;
    if (opts.json) process.stdout.write(JSON.stringify({ ok: dirty === 0 && (!opts.strict || issues === 0), ...d, issues }) + "\n");
    else {
      report("changed", d.changed, (x) => x);
      report("missing", d.missing, (x) => x);
      report("not produced by the sync", d.extra, (x) => x);
      log(dirty ? "sync --check: the tree differs from a fresh sync. Run node tools/sync-hyperframes.mjs." : "sync --check: up to date.");
    }
    process.exit(dirty || (opts.strict && issues) ? 1 : 0);
  }
  const changes = upstreamChanges(result);
  const { written, removed } = writeTree(result);
  if (DEBUG_DROPS) writeFileSync(process.env.CUTSCENE_SYNC_DEBUG, DEBUG_DROPS.join("\n") + "\n");
  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: !opts.strict || issues === 0, written, removed, sizes, upstreamChanges: changes, issues }) + "\n");
  } else {
    if (changes && (changes.changed.length || changes.added.length || changes.removed.length)) {
      log(`upstream since last sync (${changes.fromCommit?.slice(0, 7)} -> ${changes.toCommit.slice(0, 7)}): ${changes.changed.length} changed, ${changes.added.length} added, ${changes.removed.length} removed`);
      report("  changed upstream", changes.changed, (x) => x);
      report("  added upstream", changes.added, (x) => x);
      report("  removed upstream", changes.removed, (x) => x);
    }
    log(`wrote ${written} file(s), removed ${removed}.`);
    for (const [id, s] of Object.entries(sizes)) log(`  ${id.padEnd(20)} ${String(s.files).padStart(4)} files  ${(s.bytes / 1024).toFixed(0).padStart(6)} KB  ${s.dir}`);
  }
  process.exit(opts.strict && issues ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
