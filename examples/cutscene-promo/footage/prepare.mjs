// Gets the files this example doesn't keep in git, then you can open it with `cutscene preview`:
//   1. the Pexels clips listed in footage/sources.json: downloaded, checked against their sha256 and
//      cut into assets/footage/ the way the video uses them (needs ffmpeg);
//   2. the sound effects in .cutscene/audio/sfx-cues.json: copied from the installed Cutscene
//      engine into assets/sfx/, each checked against Cutscene's own checksum list.
// Run from this folder:  node footage/prepare.mjs
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const repo = resolve(project, "..", "..");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const { files } = JSON.parse(readFileSync(join(here, "sources.json"), "utf8"));
mkdirSync(join(project, "assets", "footage"), { recursive: true });
for (const [name, f] of Object.entries(files)) {
  if (!f.trim) continue;
  const raw = join(here, name);
  if (!existsSync(raw) || sha256(readFileSync(raw)) !== f.sha256) {
    console.log(`downloading ${name} (${(f.bytes / 1e6).toFixed(1)} MB) from ${f.file}`);
    const res = await fetch(f.file);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== f.sha256) throw new Error(`${name}: checksum doesn't match sources.json`);
    writeFileSync(raw, buf);
  }
  const out = join(project, f.trim.out);
  const args = ["-v", "error", "-y", "-i", raw, "-ss", String(f.trim.start), "-t", String(f.trim.length), "-an",
    "-vf", "scale=1920:1080:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", out];
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${name}`);
  console.log(`wrote ${f.trim.out}`);
}

const { engineSfxDir, loadSfxHashes } = await import(pathToFileURL(join(repo, "skills", "cutscene-audio", "scripts", "sound-engine.mjs")).href);
const hashes = loadSfxHashes();
const dir = engineSfxDir();
const names = [...new Set(JSON.parse(readFileSync(join(project, ".cutscene", "audio", "sfx-cues.json"), "utf8")).map((c) => `${c.name}.mp3`))];
mkdirSync(join(project, "assets", "sfx"), { recursive: true });
for (const n of names) {
  const src = join(dir, n);
  if (!existsSync(src)) throw new Error(`${n} isn't in the engine (${dir}); run "cutscene setup" first`);
  const want = (hashes.files || hashes)[n];
  if (want && sha256(readFileSync(src)) !== want) throw new Error(`${n}: checksum doesn't match Cutscene's list`);
  copyFileSync(src, join(project, "assets", "sfx", n));
}
console.log(`copied ${names.length} sound effects into assets/sfx/`);
