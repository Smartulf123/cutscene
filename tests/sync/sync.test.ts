// Tests for tools/sync-hyperframes.mjs: determinism, --check, branding, links, headers, licences.
// Needs the pinned upstream source: it is downloaded once into the OS temp folder (about 150 MB,
// verified against the pinned commit). Without network and without a cached copy the
// upstream-dependent tests skip with a reason.
import { describe, it, expect, beforeAll } from "vitest";
import type { TestContext } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build, diffTree, writeTree, matchGlob, readTarGz, REPO_ROOT } from "../../tools/sync-hyperframes.mjs";
import type { BuildResult, LockJson, SyncMap } from "../../tools/sync-hyperframes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAP = JSON.parse(readFileSync(join(ROOT, "tools", "sync-map.json"), "utf8")) as SyncMap;
const GENERATED = Object.values(MAP.targets).map((t) => t.dir);
const SKILL_TARGETS = Object.values(MAP.targets).filter((t) => t.skillMd !== false);
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

function walk(dir: string, base: string = dir, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(full.slice(base.length + 1).split("\\").join("/"));
  }
  return out;
}
const treeFiles = (): string[] => GENERATED.flatMap((d) => walk(join(ROOT, d)).map((r) => `${d}/${r}`));
const read = (rel: string): string => readFileSync(join(ROOT, ...rel.split("/")), "utf8");

let result: BuildResult | null = null;
let skipReason: string | null = null;
beforeAll(async () => {
  try {
    result = await build({ quiet: true });
  } catch (e) {
    skipReason = `upstream source unavailable (${(e as Error).message})`;
  }
}, 600_000);
// After this, `result` is set (ctx.skip ends the test otherwise).
const needUpstream = (ctx: TestContext): void => {
  if (!result) ctx.skip(skipReason as string);
};

describe("glob and tar helpers", () => {
  it("matches globs like the sync map expects", () => {
    expect(matchGlob("scripts/a.test.mjs", "**/*.test.mjs")).toBe(true);
    expect(matchGlob("a.test.mjs", "**/*.test.mjs")).toBe(true);
    expect(matchGlob("references/x.md", "references/*.md")).toBe(true);
    expect(matchGlob("references/sub/x.md", "references/*.md")).toBe(false);
    expect(matchGlob("modes/cinematic/_archive/a/b.html", "modes/cinematic/_archive/**")).toBe(true);
  });

  it("reads a tar.gz with a pax global header (the commit id git archive writes)", async () => {
    const block = (name: string, size: number, type: string): Buffer => {
      const h = Buffer.alloc(512);
      h.write(name, 0, "utf8");
      h.write("0000644\0", 100);
      h.write("0000000\0", 108);
      h.write("0000000\0", 116);
      h.write(size.toString(8).padStart(11, "0") + "\0", 124);
      h.write("00000000000\0", 136);
      h.write("        ", 148);
      h.write(type, 156);
      h.write("ustar\0", 257);
      h.write("00", 263);
      let sum = 0;
      for (const b of h) sum += b;
      h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
      return h;
    };
    const pad = (b: Buffer): Buffer => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
    // a pax record is "<length> key=value\n", where length counts the whole record
    const paxBuf = Buffer.from("18 comment=abc123\n");
    const file = Buffer.from("hello\n");
    const tar = Buffer.concat([
      block("pax_global_header", paxBuf.length, "g"),
      pad(paxBuf),
      block("root-abc/skills/x.md", file.length, "0"),
      pad(file),
      Buffer.alloc(1024),
    ]);
    const dir = mkdtempSync(join(tmpdir(), "cutscene-tar-"));
    const path = join(dir, "t.tar.gz");
    writeFileSync(path, gzipSync(tar));
    const seen: [string, string][] = [];
    const { globalPax } = await readTarGz(path, (e) => seen.push([e.path, e.data.toString()]));
    expect(globalPax.comment).toBe("abc123");
    expect(seen).toEqual([["root-abc/skills/x.md", "hello\n"]]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("sync output", () => {
  it("is deterministic: two builds give identical files and lock", async (ctx) => {
    needUpstream(ctx);
    const again = await build({ quiet: true });
    expect(again.lockBuf.equals(result!.lockBuf)).toBe(true);
    expect([...again.plan.keys()].sort()).toEqual([...result!.plan.keys()].sort());
    for (const [k, v] of result!.plan) expect(again.plan.get(k)!.equals(v), k).toBe(true);
  });

  it("is idempotent on disk and --check notices drift", async (ctx) => {
    needUpstream(ctx);
    const tmp = mkdtempSync(join(tmpdir(), "cutscene-sync-repo-"));
    try {
      cpSync(join(ROOT, "overlays"), join(tmp, "overlays"), { recursive: true });
      cpSync(join(ROOT, "tools"), join(tmp, "tools"), { recursive: true });
      const r1 = await build({ quiet: true, repoRoot: tmp });
      const w1 = writeTree(r1);
      expect(w1.written).toBeGreaterThan(100);
      const r2 = await build({ quiet: true, repoRoot: tmp });
      expect(writeTree(r2)).toEqual({ written: 0, removed: 0 });
      expect(diffTree(r2)).toEqual({ changed: [], missing: [], extra: [] });
      // drift: edit a generated file and add a stray one
      const target = join(tmp, "skills", "cutscene-render", "SKILL.md");
      writeFileSync(target, readFileSync(target, "utf8") + "\nhand edit\n");
      writeFileSync(join(tmp, "skills", "cutscene-render", "stray.md"), "x\n");
      const d = diffTree(r2);
      expect(d.changed).toContain("skills/cutscene-render/SKILL.md");
      expect(d.extra).toContain("skills/cutscene-render/stray.md");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("`--check --strict` passes on the committed tree", (ctx) => {
    needUpstream(ctx);
    const r = spawnSync(process.execPath, [join(ROOT, "tools", "sync-hyperframes.mjs"), "--check", "--strict", "--json"], { encoding: "utf8" });
    const out = JSON.parse(r.stdout.trim().split("\n").pop()!) as unknown;
    expect(out, r.stderr).toMatchObject({ ok: true, changed: [], missing: [], extra: [], issues: 0 });
    expect(r.status).toBe(0);
  });

  it("reports no patch problems, residue or missing script imports", (ctx) => {
    needUpstream(ctx);
    expect(result!.problems).toEqual([]);
    expect(result!.residue).toEqual([]);
    expect(result!.links).toEqual([]);
    expect(result!.deps.filter((d) => !d.external)).toEqual([]);
  });

  it("records the pinned upstream in the lock", (ctx) => {
    needUpstream(ctx);
    const lock = JSON.parse(read("tools/sync-lock.json")) as LockJson;
    expect(lock.upstream).toEqual({ repo: "heygen-com/hyperframes", tag: "v0.8.162", commit: "76222e41d7760f94426484ceb9f76d0007813fcc" });
    for (const [file, v] of Object.entries(lock.files)) {
      if (file === "THIRD_PARTY.md") continue;
      expect(v.sha256, file).toBe(sha(readFileSync(join(ROOT, ...file.split("/")))));
    }
  });
});

// These read the tree on disk, so they work without the upstream source.
describe("generated skills on disk", () => {
  const files = treeFiles();
  const md = files.filter((f) => f.endsWith(".md"));
  const lock: LockJson["files"] = existsSync(join(ROOT, "tools/sync-lock.json")) ? (JSON.parse(read("tools/sync-lock.json")) as LockJson).files : {};
  const verbatim = (f: string): boolean => /(?:^|\/)(?:CREDITS\.md|OFL[^/]*\.txt|LICENSE[^/]*|NOTICE[^/]*)$/.test(f);

  it("exist", () => {
    expect(files.length).toBeGreaterThan(400);
    for (const t of SKILL_TARGETS) expect(existsSync(join(ROOT, t.dir, "SKILL.md")), t.dir).toBe(true);
  });

  it("show no user-facing engine branding, npx engine calls, @latest or cloud commands", () => {
    const allow = [
      /https?:\/\/hyperframes\.heygen\.com\/schema\/[\w./-]+/g,
      /hyperframes\.json/g,
      /@hyperframes\/[\w./-]+/g,
      /~\/\.hyperframes\b\/?/g,
      /\.cache\/hyperframes\b/g,
      /\.hyperframes(?:ignore)?\b/g,
      /HYPERFRAMES_[A-Z0-9_]+/g,
      /(?:window\.)?__hyperframes\b[\w.]*/g,
      /<\/?hyperframes-player\b/g,
      /\bhyperframes-player\b/g,
      /hyperframes-localize-fonts/g,
      /\bhyperframes[A-Z]\w*/g,
      /--hyperframes\b/g,
    ];
    const bad: string[] = [];
    for (const f of md) {
      if (verbatim(f)) continue;
      read(f)
        .split("\n")
        .forEach((line, i) => {
          if (line.includes("Adapted from HyperFrames")) return;
          let s = line;
          for (const a of allow) s = s.replace(a, "");
          if (/hyperframes|heygen|@latest|npx\s+hyperframes|plugin-cli|\bcutscene\s+(?:cloud|cloudrun|lambda|publish|auth|usage|feedback|upgrade|skills|telemetry)\b/i.test(s)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
    }
    const code = files.filter((f) => /\.(mjs|cjs|js|sh|py)$/.test(f));
    for (const f of code) {
      const t = read(f);
      if (/npx\s+(?:--yes\s+|-y\s+)?hyperframes/.test(t)) bad.push(`${f}: npx hyperframes`);
      if (/@latest/.test(t)) bad.push(`${f}: @latest`);
      if (/api\.heygen\.com|heygen auth/.test(t)) bad.push(`${f}: HeyGen cloud call`);
    }
    expect(bad).toEqual([]);
  });

  it("have no relative markdown link that fails to resolve", () => {
    const broken: string[] = [];
    for (const f of md) {
      const lines = read(f).split("\n");
      let fence = false;
      lines.forEach((line, i) => {
        if (/^\s*(```|~~~)/.test(line)) fence = !fence;
        if (fence) return;
        const s = line.replace(/`[^`]*`/g, "");
        for (const m of s.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          const href = m[1];
          if (/^(?:[a-z]+:|#|\/|<)/i.test(href)) continue;
          const target = posix.normalize(posix.join(posix.dirname(f), href.split("#")[0]));
          if (!existsSync(join(ROOT, ...target.split("/")))) broken.push(`${f}:${i + 1} -> ${href}`);
        }
      });
    }
    expect(broken).toEqual([]);
  });

  it("have one SKILL.md each with only name + description, Cutscene wording and the run note", () => {
    for (const t of SKILL_TARGETS) {
      const text = read(`${t.dir}/SKILL.md`);
      const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
      expect(fm, t.dir).not.toBeNull();
      const keys = fm![1].split("\n").filter((l) => /^\w/.test(l)).map((l) => l.split(":")[0]);
      expect(keys).toEqual(["name", "description"]);
      expect(fm![1]).toContain(`name: ${t.name}`);
      expect(t.name).toBe(t.dir.split("/").pop());
      const desc = /description: (.*)/.exec(fm![1])![1];
      expect(desc.length).toBeLessThanOrEqual(1024);
      expect(desc).toMatch(/does not/i);
      expect(text).toContain("## How to run cutscene commands");
      expect(text).toContain('node "<this skill\'s folder>/../cutscene/scripts/cli.mjs" <command>');
      expect(text).toContain("<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->");
      expect(text.split("\n").length, t.dir).toBeLessThan(530);
    }
    // no nested SKILL.md (skill loaders would pick them up as separate skills)
    expect(files.filter((f) => f.endsWith("/SKILL.md")).length).toBe(SKILL_TARGETS.length);
  });

  it("carry the adaptation header on every adapted file", () => {
    const missing: string[] = [];
    for (const [f, v] of Object.entries(lock)) {
      if (typeof v.from !== "string" || !v.from.startsWith("skills/")) continue;
      if (verbatim(f)) continue;
      const ext = /\.[^./]+$/.exec(f)?.[0];
      if (![".md", ".mjs", ".cjs", ".js", ".sh", ".py", ".html", ".css"].includes(ext as string)) continue;
      // the header sits at the top, after a shebang or doctype, or right after YAML frontmatter
      const text = read(f);
      const fm = /^---\n[\s\S]*?\n---\n/.exec(text);
      const head = (fm ? text.slice(fm[0].length) : text).split("\n").slice(0, 8).join("\n");
      if (!head.includes("Adapted from HyperFrames")) missing.push(f);
    }
    expect(missing).toEqual([]);
  });

  it("keep third-party licence files byte for byte", () => {
    const lic = Object.entries(lock).filter(([f]) => verbatim(f));
    expect(lic.length).toBeGreaterThanOrEqual(4);
    for (const [f, v] of lic) expect(v.sha256, f).toBe(v.sourceSha256);
  });

  it("ship the look system and the local sound engine in the right skills", () => {
    expect(existsSync(join(ROOT, "skills/cutscene-design/scripts/look.mjs"))).toBe(true);
    expect(existsSync(join(ROOT, "skills/cutscene-design/references/look-system.md"))).toBe(true);
    expect(read("skills/cutscene-design/SKILL.md")).toContain("references/look-system.md");
    expect(existsSync(join(ROOT, "skills/cutscene-audio/scripts/sound-engine.mjs"))).toBe(true);
    expect(read("skills/cutscene-promo/workflows/product-launch/scripts/audio.mjs")).toContain('"cutscene-audio", "scripts", "sound-engine.mjs"');
    // The Pixabay sound files are not shipped (their licence forbids a standalone library); the
    // sound engine takes them from the installed engine, checked against sha256.json.
    expect(existsSync(join(ROOT, "skills/cutscene-audio/sound/sfx/whoosh.mp3"))).toBe(false);
    expect(Object.keys((JSON.parse(read("skills/cutscene-audio/sound/sfx/sha256.json")) as { files: Record<string, string> }).files)).toHaveLength(19);
  });

  it("have every relative script import resolve", () => {
    const missing: string[] = [];
    for (const f of files.filter((x) => /\.(mjs|cjs|js)$/.test(x))) {
      const t = read(f);
      const specs = [...t.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g), ...t.matchAll(/\brequire\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)].map((m) => m[1]);
      for (const s of specs) {
        const target = posix.normalize(posix.join(posix.dirname(f), s));
        if (![target, `${target}.js`, `${target}.mjs`, `${target}.cjs`].some((c) => existsSync(join(ROOT, ...c.split("/"))))) missing.push(`${f}: ${s}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("parse as valid JavaScript (generated and overlay scripts)", () => {
    const bad: string[] = [];
    for (const f of files.filter((x) => /\.(mjs|cjs)$/.test(x))) {
      const r = spawnSync(process.execPath, ["--check", join(ROOT, ...f.split("/"))], { encoding: "utf8" });
      if (r.status !== 0) bad.push(`${f}: ${r.stderr.split("\n").slice(0, 3).join(" ")}`);
    }
    expect(bad).toEqual([]);
  });

  it("write THIRD_PARTY.md with the upstream pin and the bundled licences", () => {
    const tp = read("THIRD_PARTY.md");
    expect(tp).toContain("76222e41d7760f94426484ceb9f76d0007813fcc");
    expect(tp).toContain("Pixabay Content License");
    expect(tp).toContain("SIL Open Font License");
    expect(tp).toContain("GSAP Standard License");
    expect(tp).toContain("not affiliated with HeyGen");
  });
});

void REPO_ROOT;
