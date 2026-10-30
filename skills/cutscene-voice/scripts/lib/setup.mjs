// Built from src/skills/cutscene-voice/scripts/lib/setup.mts by `npm run build`. Edit that file, not this one.
// `cutscene voice setup`: create or repair the voice environment and download models, only
// after consent (contracts §9). Everything goes under <CUTSCENE_HOME>/voice/; nothing global,
// nothing on PATH.
//
// Pins: assets/manifest.json. Python packages are resolved only from releases uploaded before
// the manifest's cutoff (pip --uploaded-prior-to), so every package, including dependencies, is
// at least 14 days old. CPU PyTorch comes from download.pytorch.org with a pinned SHA-256. The
// exact result (every package version and SHA-256, every model file hash) is written to
// <CUTSCENE_HOME>/voice/lock.json; a later repair reinstalls exactly that with --require-hashes.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cutsceneHome, modelDir, readManifest, voicePaths } from "./paths.mjs";
import { run } from "./proc.mjs";
import { modelFilesStatus } from "./status.mjs";
import { runWorker, workerEnv } from "./worker.mjs";
import { VoiceError, fmtBytes, log } from "./util.mjs";
export const MODEL_IDS = ["omnivoice", "whisper", "voxcpm2"];
export const DEFAULT_MODELS = ["omnivoice", "whisper"];
function readJson(file) {
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    }
    catch {
        return null;
    }
}
const norm = (name) => name.toLowerCase().replace(/[-_.]+/g, "-");
/** Which manifest groups the chosen models need (always "base"). */
export function groupsFor(models, manifest = readManifest()) {
    const g = new Set(["base"]);
    for (const m of models)
        g.add(manifest.models[m].python_group);
    return [...g];
}
/** Top-level pins for pip, e.g. ["soundfile==0.14.0", ...]. */
export function pinsFor(groups, manifest = readManifest()) {
    const out = [];
    for (const g of groups)
        for (const p of manifest.python.groups[g] || [])
            out.push(`${p.name}==${p.version}`);
    return out;
}
/** The pinned torch wheels that fit this Python, or null when this platform has no hashed pin yet. */
export function torchWheelsFor(pyInfo, manifest = readManifest()) {
    const plat = pyInfo.platform === "win32" && /amd64|x86_64/i.test(pyInfo.machine) ? "win_amd64" : null;
    const tag = `cp${pyInfo.major}${pyInfo.minor}`;
    const wheels = manifest.python.torch_wheels.filter((w) => w.platform === plat && w.python === tag);
    const names = new Set(manifest.python.torch_wheels.map((w) => w.name));
    return wheels.length === names.size ? wheels : null;
}
/** Plain-text requirements with hashes. */
export function requirementsText(entries) {
    return entries.map((e) => `${e.name}==${e.version} --hash=sha256:${e.sha256}`).join("\n") + "\n";
}
// ---------------------------------------------------------------------------------------------
// Python discovery
async function pythonInfo(cmd, prefix = []) {
    const code = "import sys,platform,json;print(json.dumps({'major':sys.version_info[0],'minor':sys.version_info[1],'micro':sys.version_info[2],'machine':platform.machine(),'platform':sys.platform,'exe':sys.executable}))";
    const r = await run(cmd, [...prefix, "-c", code], { timeoutMs: 20_000 });
    if (r.code !== 0)
        return null;
    try {
        return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
    }
    catch {
        return null;
    }
}
const versionOk = (i) => i && i.major === 3 && i.minor >= 10 && i.minor <= 13;
/** Find a Python 3.10-3.13 to build the environment with (CUTSCENE_PYTHON wins). */
export async function findBasePython(env = process.env) {
    const tries = [];
    if (env.CUTSCENE_PYTHON)
        tries.push([env.CUTSCENE_PYTHON, []]);
    if (process.platform === "win32")
        for (const v of ["3.12", "3.11", "3.13", "3.10"])
            tries.push(["py", [`-${v}`]]);
    tries.push(["python3", []], ["python", []]);
    for (const [cmd, prefix] of tries) {
        const info = await pythonInfo(cmd, prefix);
        if (versionOk(info))
            return { ...info, exe: info.exe };
    }
    throw new VoiceError("PYTHON_MISSING", "Python 3.10 to 3.13 is needed for AI voices, and none was found.", "Install Python 3.12 from https://www.python.org (or set CUTSCENE_PYTHON to its python.exe), then run `cutscene voice setup` again.");
}
// ---------------------------------------------------------------------------------------------
// Plan
/**
 * What setup would do for these models.
 */
export function setupPlan(models, { home = cutsceneHome(), repair = false } = {}) {
    const manifest = readManifest();
    const vp = voicePaths(home);
    const lock = readJson(vp.lock);
    const groups = groupsFor(models, manifest);
    const haveGroups = new Set(lock?.groups || []);
    const envNeeded = repair || !existsSync(vp.python) || groups.some((g) => !haveGroups.has(g));
    const items = [];
    if (envNeeded) {
        const fresh = repair || !existsSync(vp.python);
        const extra = groups.filter((g) => fresh || !haveGroups.has(g));
        const est = (k) => extra.reduce((a, g) => a + (manifest.python.estimates[g]?.[k] || 0), 0);
        items.push({
            kind: "python",
            id: "environment",
            what: `Python packages (${extra.join(", ")})${extra.includes("base") ? ", including CPU PyTorch 2.11.0" : ""}`,
            download_bytes: est("download_bytes"),
            disk_bytes: est("disk_bytes"),
            estimate: true,
            license: "open source (BSD, MIT, Apache-2.0)",
            source: `${manifest.python.index} and ${manifest.python.torch_index}`,
            where: vp.venv,
        });
    }
    for (const id of models) {
        const spec = manifest.models[id];
        const st = modelFilesStatus(id, home);
        const verified = !!lock?.models?.[id]?.verified;
        if (st.installed && verified && !repair)
            continue;
        items.push({
            kind: "model",
            id,
            what: spec.title,
            download_bytes: st.installed ? 0 : st.size - st.bytes,
            disk_bytes: st.size,
            license: spec.license,
            commercial_use: spec.commercial_use,
            license_note: spec.license_note,
            source: spec.source,
            revision: spec.revision,
            where: modelDir(id, home),
            ...(st.installed ? { action: "verify checksums" } : {}),
        });
    }
    const download = items.reduce((a, i) => a + (i.download_bytes || 0), 0);
    return { models, groups, items, download_bytes: download, nothing_to_do: items.length === 0 };
}
export function describePlan(plan) {
    const lines = [];
    for (const i of plan.items) {
        const lic = i.commercial_use === false ? `${i.license}, NON-COMMERCIAL` : i.license;
        const size = i.download_bytes ? `${fmtBytes(i.download_bytes)} download` : i.action || "no download";
        lines.push(`  - ${i.what}: ${size}, ${fmtBytes(i.disk_bytes)} on disk; licence ${lic}; from ${i.source}`);
        if (i.license_note)
            lines.push(`      ${i.license_note}`);
    }
    lines.push(`  Total download: about ${fmtBytes(plan.download_bytes)}. Everything goes into ${plan.items[0]?.where?.replace(/[\\/](venv|models[\\/].*)$/, "") || "~/.cutscene/voice"}; nothing on PATH.`);
    return lines.join("\n");
}
// ---------------------------------------------------------------------------------------------
// Install
async function pip(python, args, env, what) {
    log(`  pip ${what}...`);
    const r = await run(python, ["-m", "pip", "--disable-pip-version-check", "--no-input", ...args], { env, timeoutMs: 60 * 60 * 1000 });
    if (r.code !== 0) {
        const tail = (r.stderr || r.stdout).split(/\r?\n/).filter((l) => l.trim() && !/^\[notice\]/.test(l)).slice(-4).join(" | ");
        throw new VoiceError("PIP_FAILED", `Installing ${what} failed.`, tail || "Check your internet connection and run `cutscene voice setup --yes` again.");
    }
    return r;
}
function pipEnv(home) {
    const env = workerEnv(home, { offline: false });
    env.PIP_NO_INPUT = "1";
    env.PYTHONUTF8 = "1";
    return env;
}
async function ensureVenv(home, onStep) {
    const vp = voicePaths(home);
    mkdirSync(vp.root, { recursive: true });
    if (existsSync(vp.python)) {
        const ok = await pythonInfo(vp.python);
        if (versionOk(ok))
            return ok;
        const aside = `${vp.venv}.broken-${Date.now()}`;
        renameSync(vp.venv, aside);
        log(`  The voice environment was broken; moved it aside to ${aside} (you can delete it).`);
    }
    const base = await findBasePython();
    onStep?.(`Creating the voice environment with Python ${base.major}.${base.minor}.${base.micro}`);
    const r = await run(base.exe, ["-m", "venv", vp.venv], { timeoutMs: 10 * 60 * 1000 });
    if (r.code !== 0 || !existsSync(vp.python))
        throw new VoiceError("VENV_FAILED", "Couldn't create the voice environment.", r.stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(" "));
    return pythonInfo(vp.python);
}
/** Install the Python side for `groups`. Returns the new lock's package list. */
export async function installPython(groups, { home = cutsceneHome(), onStep } = {}) {
    const manifest = readManifest();
    const vp = voicePaths(home);
    const py = await ensureVenv(home, onStep);
    if (!py)
        throw new VoiceError("VENV_FAILED", "The voice environment was created, but its Python doesn't answer.", "Run `cutscene voice setup --yes` again; it moves a broken environment aside and builds a new one.");
    const env = pipEnv(home);
    mkdirSync(vp.jobs, { recursive: true });
    const req = (name, text) => {
        const f = join(vp.jobs, `${name}-${process.pid}.txt`);
        writeFileSync(f, text, "utf8");
        return f;
    };
    onStep?.("Pinning pip");
    const pipPin = manifest.python.pip;
    await pip(vp.python, ["install", "--require-hashes", "-r", req("pip", requirementsText([pipPin]))], env, `pip ${pipPin.version}`);
    onStep?.("Installing CPU PyTorch (pinned, checksum verified)");
    const wheels = torchWheelsFor(py, manifest);
    const torchPins = manifest.python.torch_wheels.filter((w) => w.platform === "win_amd64" && w.python === "cp312");
    if (wheels) {
        await pip(vp.python, ["install", "--no-deps", "--require-hashes", "--index-url", manifest.python.torch_index, "-r", req("torch", requirementsText(wheels))], env, "CPU PyTorch");
    }
    else {
        // No hashed pin for this platform yet: same exact versions from the official CPU index.
        const specs = torchPins.map((w) => (py.platform === "darwin" ? `${w.name}==${w.version.replace(/\+cpu$/, "")}` : `${w.name}==${w.version}`));
        log(`  Note: no pinned checksum for PyTorch on ${py.platform}/${py.machine} with Python ${py.major}.${py.minor} yet; installing the exact versions ${specs.join(", ")} from the official index.`);
        await pip(vp.python, ["install", "--no-deps", "--index-url", manifest.python.torch_index, ...specs], env, "CPU PyTorch");
    }
    const torchSpecs = (wheels || torchPins).map((w) => `${w.name}==${w.version}`);
    const lock = readJson(vp.lock);
    const lockHas = (g) => (lock?.groups || []).includes(g);
    const fromLock = lock && lock.cutoff === manifest.python.uploaded_prior_to && groups.every(lockHas) && Array.isArray(lock.packages) && lock.packages.every((p) => p.sha256);
    onStep?.(fromLock ? "Reinstalling the locked packages (exact versions and checksums)" : "Installing the voice packages (only releases at least 14 days old)");
    if (fromLock) {
        const entries = lock.packages.filter((p) => !["torch", "torchaudio", "pip"].includes(norm(p.name)));
        await pip(vp.python, ["install", "--no-deps", "--require-hashes", "--index-url", manifest.python.index, "-r", req("locked", requirementsText(entries))], env, "locked packages");
    }
    else {
        await pip(vp.python, ["install", "--index-url", manifest.python.index, "--uploaded-prior-to", manifest.python.uploaded_prior_to, ...torchSpecs, ...pinsFor(groups, manifest)], env, "voice packages");
    }
    return buildPackageLock({ home, python: py, previous: lock, groups: [...new Set([...(lock?.groups || []), ...groups])] });
}
/** Read what's installed and record every package's version and wheel SHA-256. */
export async function buildPackageLock({ home = cutsceneHome(), python, previous, groups }) {
    const manifest = readManifest();
    const vp = voicePaths(home);
    const env = pipEnv(home);
    const inspect = await pip(vp.python, ["inspect", "--local"], env, "inspect");
    const installed = JSON.parse(inspect.stdout).installed.map((d) => ({ name: d.metadata.name, version: d.metadata.version }));
    const known = new Map();
    for (const p of previous?.packages || [])
        if (p.sha256)
            known.set(`${norm(p.name)}==${p.version}`, p.sha256);
    known.set(`pip==${manifest.python.pip.version}`, manifest.python.pip.sha256);
    for (const w of manifest.python.torch_wheels)
        if (w.platform === "win_amd64" && python.platform === "win32")
            known.set(`${w.name}==${w.version}`, w.sha256);
    for (const g of Object.values(manifest.python.groups))
        for (const p of g)
            if (p.sha256)
                known.set(`${norm(p.name)}==${p.version}`, p.sha256);
    const need = installed.filter((p) => !known.has(`${norm(p.name)}==${p.version}`) && !["torch", "torchaudio"].includes(norm(p.name)));
    if (need.length) {
        // Ask the index which wheel this exact version is, without installing anything.
        const reportFile = join(vp.jobs, `lock-report-${process.pid}.json`);
        await pip(vp.python, ["install", "--dry-run", "--ignore-installed", "--no-deps", "--quiet", "--report", reportFile, "--index-url", manifest.python.index, ...need.map((p) => `${p.name}==${p.version}`)], env, "checksums for the lock");
        const report = readJson(reportFile) || { install: [] };
        for (const i of report.install) {
            const sha = i.download_info?.archive_info?.hashes?.sha256;
            if (sha)
                known.set(`${norm(i.metadata.name)}==${i.metadata.version}`, sha);
        }
    }
    const packages = installed
        .map((p) => ({ name: p.name, version: p.version, sha256: known.get(`${norm(p.name)}==${p.version}`) || null }))
        .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
    return { packages, groups, python };
}
/** Download (or re-check) one model's pinned files and verify their SHA-256. */
export async function installModel(id, { home = cutsceneHome(), onProgress } = {}) {
    const spec = readManifest().models[id];
    const res = await runWorker("download", { repo: spec.repo, revision: spec.revision, local_dir: modelDir(id, home), files: spec.files }, { home, offline: false, onProgress });
    return { repo: spec.repo, revision: spec.revision, license: spec.license, files: res.files, verified: res.files.every((f, i) => !spec.files[i].sha256 || f.sha256 === spec.files[i].sha256), installed_at: new Date().toISOString() };
}
export function writeLock(home, patch) {
    const vp = voicePaths(home);
    const manifest = readManifest();
    const prev = readJson(vp.lock) || {};
    const lock = {
        version: 1,
        note: "Exact versions and SHA-256 of Cutscene's voice environment. Written by `cutscene voice setup`; a repair reinstalls exactly this.",
        updated: new Date().toISOString(),
        cutoff: manifest.python.uploaded_prior_to,
        ...prev,
        ...patch,
        models: { ...(prev.models || {}), ...(patch.models || {}) },
    };
    lock.updated = new Date().toISOString();
    writeFileSync(vp.lock, JSON.stringify(lock, null, 2) + "\n", "utf8");
    return lock;
}
