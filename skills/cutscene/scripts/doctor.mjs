// Built from src/skills/cutscene/scripts/doctor.mts by `npm run build`. Edit that file, not this one.
// `cutscene doctor`: checks everything Cutscene uses and says how to fix what's missing.
// Needed: Node.js 22+, FFmpeg, the pinned video engine and its render browser.
// Optional: VP9 alpha encoding (transparent 3D clips), Blender 4.2+, Python 3.10+, the voice
// environment, and VoiceStudio on 127.0.0.1:3900.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EXIT, printJson } from "./lib/json.mjs";
import { CUTSCENE_VERSION, SKILLS_ROOT, cutsceneHome } from "./lib/paths.mjs";
import { readConfig } from "./lib/config.mjs";
import { engineStatus, readPin, runEngine } from "./lib/engine.mjs";
import { findOnPath, probe } from "./lib/proc.mjs";
import { isMainModule } from "./lib/main.mjs";
import { findKokoroPython } from "./lib/python.mjs";
export const MIN_NODE = [22, 0, 0];
export const MIN_BLENDER = [4, 2, 0];
export const MIN_PYTHON = [3, 10, 0];
export const VOICESTUDIO_HEALTH = "http://127.0.0.1:3900/health";
/** Compare version arrays: negative when a < b. */
export function compareVersions(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] || 0) - (b[i] || 0);
        if (d)
            return d;
    }
    return 0;
}
/** "Blender 5.2.3 LTS" -> [5, 2, 3] */
export function parseVersion(text, prefix) {
    const m = new RegExp(`${prefix}\\s*v?(\\d+)\\.(\\d+)(?:\\.(\\d+))?`, "i").exec(text || "");
    return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}
const v2s = (v) => v.join(".");
function check(id, name, group, ok, fields = {}) {
    return { id, name, group, ok, status: ok ? "ok" : "missing", ...fields };
}
// --- Node -------------------------------------------------------------------------------------
export function checkNode(version = process.versions.node) {
    const v = version.split(".").map(Number);
    const ok = compareVersions(v, MIN_NODE) >= 0;
    return check("node", "Node.js 22+", "needed", ok, {
        status: ok ? "ok" : "too old",
        version,
        detail: ok ? version : `${version} is too old`,
        fix: ok ? undefined : "Install Node.js 22 or newer from nodejs.org, then run `cutscene doctor` again.",
    });
}
// --- FFmpeg -----------------------------------------------------------------------------------
export function checkFfmpeg({ env = process.env } = {}) {
    const ffmpeg = findOnPath("ffmpeg", env);
    const ffprobe = findOnPath("ffprobe", env);
    if (!ffmpeg) {
        return [
            check("ffmpeg", "FFmpeg", "needed", false, {
                detail: "Not found on PATH",
                fix: "Install FFmpeg (Windows: `winget install Gyan.FFmpeg`; macOS: `brew install ffmpeg`; Linux: your package manager), open a new terminal, then run `cutscene doctor` again.",
            }),
            check("vp9", "Transparent WebM (VP9)", "optional", false, { detail: "Needs FFmpeg", fix: "Install FFmpeg first." }),
        ];
    }
    const ver = probe(ffmpeg, ["-hide_banner", "-version"]);
    const first = (ver.stdout.split(/\r?\n/)[0] || "").trim();
    const m = /ffmpeg version (\S+)/i.exec(first);
    const version = m ? m[1].replace(/-.*$/, "") : "unknown";
    const enc = probe(ffmpeg, ["-hide_banner", "-encoders"]);
    const vp9 = /\blibvpx-vp9\b/.test(enc.stdout);
    return [
        check("ffmpeg", "FFmpeg", "needed", ver.ok && !!ffprobe, {
            version,
            path: ffmpeg,
            detail: ffprobe ? version : `${version}, but ffprobe is missing`,
            fix: ffprobe ? undefined : "Install a full FFmpeg build that includes ffprobe.",
        }),
        check("vp9", "Transparent WebM (VP9)", "optional", vp9, {
            detail: vp9 ? "libvpx-vp9 encoder ready (for transparent 3D clips)" : "This FFmpeg has no libvpx-vp9 encoder",
            fix: vp9 ? undefined : "Install a full FFmpeg build (for example the gyan.dev full build on Windows) to make transparent 3D clips.",
        }),
    ];
}
// --- Engine and its browser -------------------------------------------------------------------
export async function checkEngine({ home = cutsceneHome() } = {}) {
    let pin;
    try {
        pin = readPin();
    }
    catch (err) {
        return [check("engine", "Video engine", "needed", false, { detail: err.message, fix: err.hint })];
    }
    const status = engineStatus({ pin, home });
    const engine = check("engine", "Video engine", "needed", status.installed, {
        version: status.version || undefined,
        path: status.dir,
        detail: status.installed ? `${pin}` : status.version ? `Version ${status.version} found, ${pin} needed` : "Not installed",
        fix: status.installed ? undefined : "Run `cutscene setup --yes` (about 110 MB from npm).",
        installable: !status.installed,
    });
    if (!status.installed) {
        return [engine, check("browser", "Render browser", "needed", false, { detail: "Needs the video engine", fix: "Run `cutscene setup --yes`.", installable: true })];
    }
    const r = await runEngine(["browser", "path"], { pin, home, env: { ...process.env, NO_COLOR: "1" }, timeoutMs: 30_000 });
    const path = r.stdout.trim().split(/\r?\n/).pop() || "";
    const ok = r.code === 0 && !!path && existsSync(path);
    return [
        engine,
        check("browser", "Render browser", "needed", ok, {
            path: ok ? path : undefined,
            detail: ok ? "Headless Chrome ready" : "Not downloaded yet",
            fix: ok ? undefined : "Run `cutscene setup --yes` (about 270 MB, Chrome for Testing from Google).",
            installable: !ok,
        }),
    ];
}
// --- Blender ----------------------------------------------------------------------------------
function listDirs(dir) {
    try {
        return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    }
    catch {
        return [];
    }
}
const byVersionDesc = (a, b) => compareVersions(parseVersion(b, "") || [0], parseVersion(a, "") || [0]);
function steamLibraries(steamRoot) {
    const libs = [steamRoot];
    try {
        const vdf = readFileSync(join(steamRoot, "steamapps", "libraryfolders.vdf"), "utf8");
        for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g))
            libs.push(m[1].replace(/\\\\/g, "\\"));
    }
    catch {
        // no Steam libraries file
    }
    return [...new Set(libs)];
}
/**
 * Where Blender might be, best first: CUTSCENE_BLENDER, config.json, PATH, the usual install
 * folders (newest version first), Steam, and portable folders.
 */
export function blenderCandidates({ env = process.env, config = {}, platform = process.platform, home = cutsceneHome(env), userHome = homedir() } = {}) {
    const out = [];
    const add = (path, source) => path && out.push({ path, source });
    add(env.CUTSCENE_BLENDER, "CUTSCENE_BLENDER");
    add(typeof config.blender === "string" ? config.blender : config.blender && config.blender.path, "config.json");
    add(findOnPath(platform === "win32" ? "blender.exe" : "blender", env), "PATH");
    if (platform === "win32") {
        const programs = [env.ProgramFiles || "C:\\Program Files", env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", env.ProgramW6432].filter(Boolean);
        const local = env.LOCALAPPDATA || join(userHome, "AppData", "Local");
        for (const root of [...new Set(programs)]) {
            const foundation = join(root, "Blender Foundation");
            for (const d of listDirs(foundation).sort(byVersionDesc))
                add(join(foundation, d, "blender.exe"), "Program Files");
        }
        const localFoundation = join(local, "Programs", "Blender Foundation");
        for (const d of listDirs(localFoundation).sort(byVersionDesc))
            add(join(localFoundation, d, "blender.exe"), "user install");
        for (const lib of steamLibraries(join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"))) {
            add(join(lib, "steamapps", "common", "Blender", "blender.exe"), "Steam");
        }
        for (const base of [join(home, "blender"), join(userHome, "Downloads"), join(userHome, "Desktop"), userHome, "C:\\Blender"]) {
            for (const d of listDirs(base).filter((n) => /blender/i.test(n)).sort(byVersionDesc))
                add(join(base, d, "blender.exe"), "portable folder");
        }
    }
    else if (platform === "darwin") {
        for (const apps of ["/Applications", join(userHome, "Applications")]) {
            add(join(apps, "Blender.app", "Contents", "MacOS", "Blender"), "Applications");
            for (const d of listDirs(apps).filter((n) => /^blender.*\.app$/i.test(n)).sort(byVersionDesc))
                add(join(apps, d, "Contents", "MacOS", "Blender"), "Applications");
        }
        add(join(userHome, "Library", "Application Support", "Steam", "steamapps", "common", "Blender", "Blender.app", "Contents", "MacOS", "Blender"), "Steam");
    }
    else {
        add("/snap/bin/blender", "snap");
        add("/var/lib/flatpak/exports/bin/org.blender.Blender", "flatpak");
        for (const base of ["/opt", userHome, join(home, "blender")]) {
            for (const d of listDirs(base).filter((n) => /blender/i.test(n)).sort(byVersionDesc))
                add(join(base, d, "blender"), "portable folder");
        }
        add(join(userHome, ".local", "share", "Steam", "steamapps", "common", "Blender", "blender"), "Steam");
    }
    const seen = new Set();
    return out.filter((c) => {
        const key = platform === "win32" ? c.path.toLowerCase() : c.path;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
/** Run `blender --version` and read the version. */
export function blenderVersion(path) {
    const r = probe(path, ["--version"], { timeoutMs: 60_000 });
    const text = `${r.stdout}\n${r.stderr}`;
    const version = parseVersion(text, "Blender");
    const label = (/Blender\s+(\d+\.\d+(?:\.\d+)?(?:\s+LTS)?)/i.exec(text) || [])[1];
    return version ? { version, label: label || v2s(version) } : null;
}
/** Find Blender ourselves (used when the cutscene-3d part isn't installed). */
export function findBlenderFallback(opts = {}) {
    let tooOld = null;
    for (const c of blenderCandidates(opts)) {
        if (!existsSync(c.path))
            continue;
        const v = blenderVersion(c.path);
        if (!v)
            continue;
        if (compareVersions(v.version, MIN_BLENDER) >= 0)
            return { path: c.path, version: v2s(v.version), label: v.label, source: c.source };
        tooOld = tooOld || { path: c.path, version: v2s(v.version), label: v.label, source: c.source, tooOld: true };
    }
    return tooOld;
}
async function importPart(rel) {
    const file = join(SKILLS_ROOT, rel);
    if (!existsSync(file))
        return null;
    try {
        return await import(pathToFileURL(file).href);
    }
    catch {
        return null;
    }
}
/** Normalise whatever the 3d part's findBlender() returns into {path, version, label}. */
async function blenderFromPart(mod) {
    if (!mod || typeof mod.findBlender !== "function")
        return undefined;
    try {
        const r = await mod.findBlender();
        if (!r)
            return null;
        if (typeof r === "string") {
            const v = blenderVersion(r);
            return v ? { path: r, version: v2s(v.version), label: v.label, source: "cutscene-3d" } : null;
        }
        const path = r.path || r.exe || r.executable || r.bin;
        if (!path)
            return null;
        let version = Array.isArray(r.version) ? v2s(r.version) : typeof r.version === "string" ? (parseVersion(r.version, "") ? v2s(parseVersion(r.version, "")) : r.version) : null;
        let label = r.label || r.versionLabel || (version && r.lts && !/LTS/i.test(version) ? `${version} LTS` : version);
        if (!version) {
            const v = blenderVersion(path);
            if (v) {
                label = v.label;
                version = v2s(v.version);
            }
        }
        return { path, version, label, source: r.source || "cutscene-3d" };
    }
    catch {
        return undefined; // fall back to our own search
    }
}
export async function checkBlender({ env = process.env, home = cutsceneHome(env) } = {}) {
    let config = {};
    try {
        config = readConfig({ home });
    }
    catch {
        config = {};
    }
    let found = await blenderFromPart(await importPart(join("cutscene-3d", "scripts", "lib", "blender.mjs")));
    if (found === undefined)
        found = findBlenderFallback({ env, config, home });
    if (!found) {
        return check("blender", "Blender 4.2+", "optional", false, {
            status: "missing",
            detail: "Not found (only needed for realistic 3D shots)",
            fix: "Run `cutscene 3d setup`, or set CUTSCENE_BLENDER to your blender executable.",
        });
    }
    const version = found.version && parseVersion(found.version, "");
    const ok = !found.tooOld && (!version || compareVersions(version, MIN_BLENDER) >= 0);
    return check("blender", "Blender 4.2+", "optional", ok, {
        status: ok ? "ok" : "too old",
        version: found.version || undefined,
        path: found.path,
        detail: ok ? `${found.label || found.version} · ${found.path}` : `${found.label || found.version} is too old · ${found.path}`,
        fix: ok ? undefined : "Install Blender 4.2 or newer (blender.org), or run `cutscene 3d setup`.",
    });
}
// --- Python -----------------------------------------------------------------------------------
export function checkPython({ platform = process.platform } = {}) {
    const tries = platform === "win32" ? [["py", ["-3", "--version"]], ["python", ["--version"]], ["python3", ["--version"]]] : [["python3", ["--version"]], ["python", ["--version"]]];
    let tooOld = null;
    for (const [cmd, args] of tries) {
        const r = probe(cmd, args);
        if (!r.ok)
            continue;
        const v = parseVersion(`${r.stdout} ${r.stderr}`, "Python");
        if (!v)
            continue;
        const ok = compareVersions(v, MIN_PYTHON) >= 0;
        const fields = { version: v2s(v), detail: `${v2s(v)} (${cmd})`, command: cmd };
        if (ok)
            return check("python", "Python 3.10+", "optional", true, fields);
        tooOld = tooOld || check("python", "Python 3.10+", "optional", false, { ...fields, status: "too old", fix: "Install Python 3.10 or newer from python.org (needed for AI voices)." });
    }
    return tooOld || check("python", "Python 3.10+", "optional", false, { detail: "Not found (needed for AI voices)", fix: "Install Python 3.10 or newer from python.org, or run `cutscene voice setup`." });
}
// --- Voices -----------------------------------------------------------------------------------
export async function checkVoice({ home = cutsceneHome() } = {}) {
    const mod = await importPart(join("cutscene-voice", "scripts", "lib", "status.mjs"));
    if (!mod || typeof mod.voiceStatus !== "function") {
        return check("voice", "AI voices", "optional", false, {
            status: "not set up",
            detail: mod ? "The voice part has no status check" : "The cutscene-voice part isn't installed",
            fix: "Reinstall the Cutscene plugin to get the voice part.",
        });
    }
    try {
        const s = await mod.voiceStatus({ home });
        const ok = !!(s && (s.ok ?? s.ready ?? s.installed));
        const models = s && Array.isArray(s.models) ? s.models.filter((m) => m && (m.installed ?? m.ok)).map((m) => m.name || m.id).filter(Boolean) : [];
        const detail = (s && (s.detail || s.summary || s.message)) || (ok ? (models.length ? `Ready: ${models.join(", ")}` : "Ready") : "Not set up yet");
        return check("voice", "AI voices", "optional", ok, {
            status: ok ? "ok" : "not set up",
            detail,
            fix: ok ? undefined : (s && (s.fix || s.hint)) || "Run `cutscene voice setup` (asks before downloading anything).",
            voice: s,
        });
    }
    catch (err) {
        return check("voice", "AI voices", "optional", false, { status: "not set up", detail: `Couldn't read the voice status: ${err.message}`, fix: "Run `cutscene voice setup`." });
    }
}
export async function checkVoiceStudio({ url = VOICESTUDIO_HEALTH, timeoutMs = 1500 } = {}) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        const ok = res.ok;
        return check("voicestudio", "VoiceStudio", "optional", ok, {
            status: ok ? "ok" : "off",
            detail: ok ? "Running on 127.0.0.1:3900" : `Answered with HTTP ${res.status}`,
        });
    }
    catch {
        return check("voicestudio", "VoiceStudio", "optional", false, { status: "off", detail: "Not running (optional; Cutscene's own voices don't need it)" });
    }
}
// --- Built-in voice (the engine's Kokoro) -----------------------------------------------------
export function checkKokoro({ home = cutsceneHome(), find = findKokoroPython } = {}) {
    const found = process.env.HYPERFRAMES_PYTHON ? { python: process.env.HYPERFRAMES_PYTHON, source: "HYPERFRAMES_PYTHON" } : find({ home });
    const cache = join(homedir(), ".cache", "hyperframes", "tts");
    return check("kokoro", "Built-in voice (Kokoro)", "optional", !!found, {
        status: found ? "ok" : "not set up",
        path: found ? found.python : undefined,
        detail: found ? `Ready (Python with kokoro-onnx: ${found.python}); its model cache is ${cache}` : "No Python with kokoro-onnx found",
        fix: found ? undefined : "Run `cutscene voice setup`, or install kokoro-onnx into a Python 3.10+ and set HYPERFRAMES_PYTHON to it.",
    });
}
// --- Footage tools (cutscene-edit's on-demand downloads) --------------------------------------
const platformKey = (p = process.platform, a = process.arch) => `${p}-${a === "arm64" ? "arm64" : a === "x64" ? "x64" : a}`;
const sizeText = (bytes) => (bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(0)} MB` : `${Math.ceil(bytes / 1024)} KB`);
/**
 * auto-editor and the MediaPipe face detector, from the pins in
 * skills/cutscene-edit/assets/manifest.json. Installed means the part's own marker file
 * <home>/tools/<name>/<version>/.cutscene-ok exists.
 */
export function checkEditTools({ home = cutsceneHome(), skillsRoot = SKILLS_ROOT, platform = platformKey() } = {}) {
    let pins;
    try {
        pins = JSON.parse(readFileSync(join(skillsRoot, "cutscene-edit", "assets", "manifest.json"), "utf8")).pins || [];
    }
    catch {
        return [];
    }
    const pinFor = (name) => pins.find((p) => p.name === name && (p.platform === platform || p.platform === "any"));
    const installed = (pin) => !!pin && existsSync(join(home, "tools", pin.name, pin.version, ".cutscene-ok"));
    const out = [];
    const ae = pinFor("auto-editor");
    if (ae) {
        const ok = installed(ae);
        out.push(check("auto-editor", `auto-editor ${ae.version}`, "optional", ok, {
            status: ok ? "ok" : "not set up",
            version: ae.version,
            path: ok ? join(home, "tools", ae.name, ae.version, ae.file) : undefined,
            detail: ok ? "Ready (fast rough cuts, exports to other editors)" : "Not downloaded (only needed for rough cuts and editor exports)",
            fix: ok ? undefined : `Run \`cutscene edit install auto-editor --yes\` when needed (${sizeText(ae.size)}, Unlicense).`,
        }));
    }
    const face = ["mediapipe-tasks-vision", "face-detector-model"].map(pinFor);
    if (face.every(Boolean)) {
        const ok = face.every(installed);
        const size = face.reduce((n, p) => n + (p.size || 0), 0);
        out.push(check("face-detector", "Face detector (MediaPipe)", "optional", ok, {
            status: ok ? "ok" : "not set up",
            version: face.map((p) => `${p.name} ${p.version}`).join(", "),
            detail: ok ? "Ready (face-follow vertical reframes)" : "Not downloaded (only needed for face-follow reframes)",
            fix: ok ? undefined : `Run \`cutscene edit install face-detector --yes\` when needed (${sizeText(size)}, Apache-2.0).`,
        }));
    }
    return out;
}
// --- Settings ---------------------------------------------------------------------------------
export function checkConfig({ home = cutsceneHome() } = {}) {
    try {
        readConfig({ home });
        return null;
    }
    catch (err) {
        return check("config", "Settings file", "needed", false, { status: "broken", detail: err.message, fix: err.hint });
    }
}
// ---------------------------------------------------------------------------------------------
/** Run every check. */
export async function collectChecks({ home = cutsceneHome(), env = process.env } = {}) {
    const [engine, blender, voice, voicestudio] = await Promise.all([
        checkEngine({ home }),
        checkBlender({ env, home }),
        checkVoice({ home }),
        checkVoiceStudio(),
    ]);
    const checks = [checkNode(), ...checkFfmpeg({ env }), ...engine, blender, checkPython(), voice, checkKokoro({ home }), voicestudio, ...checkEditTools({ home })];
    const cfg = checkConfig({ home });
    if (cfg)
        checks.unshift(cfg);
    // Needed first, then optional, keeping the order above inside each group.
    return [...checks.filter((c) => c.group === "needed"), ...checks.filter((c) => c.group === "optional")];
}
export function summarize(checks) {
    const missing = checks.filter((c) => c.group === "needed" && !c.ok);
    return { ready: missing.length === 0, missing };
}
export function formatDoctor(checks, { home, pin }) {
    const lines = [`Cutscene doctor · Cutscene ${CUTSCENE_VERSION} · engine ${pin || "?"}`, `Home: ${home}`];
    const width = Math.max(...checks.map((c) => c.name.length)) + 2;
    for (const [group, title] of [["needed", "Needed"], ["optional", "Optional"]]) {
        const rows = checks.filter((c) => c.group === group);
        if (!rows.length)
            continue;
        lines.push("", title);
        for (const c of rows) {
            lines.push(`  ${c.status.padEnd(12)}${c.name.padEnd(width)}${c.detail || ""}`);
            if (!c.ok && c.fix)
                lines.push(`  ${"".padEnd(12)}${"".padEnd(width)}Fix: ${c.fix}`);
        }
    }
    const { ready, missing } = summarize(checks);
    lines.push("");
    lines.push(ready ? "Everything Cutscene needs is ready." : `${missing.length} thing${missing.length === 1 ? "" : "s"} Cutscene needs ${missing.length === 1 ? "is" : "are"} missing. Run \`cutscene setup\` to install what Cutscene can install for you.`);
    return lines.join("\n") + "\n";
}
export async function runDoctor(args = [], { json = false } = {}) {
    const home = cutsceneHome();
    let pin = "";
    try {
        pin = readPin();
    }
    catch {
        pin = "";
    }
    const checks = await collectChecks({ home });
    const { ready, missing } = summarize(checks);
    if (json) {
        const body = { cutscene: CUTSCENE_VERSION, engine: pin, home, ready, checks };
        if (ready)
            printJson({ ok: true, ...body });
        else {
            printJson({
                ok: false,
                error: {
                    code: "MISSING_REQUIREMENTS",
                    message: `Cutscene is missing ${missing.map((c) => c.name).join(", ")}.`,
                    hint: missing.some((c) => c.installable) ? "Run `cutscene setup` to install the engine pieces; each check says how to fix the rest." : missing.map((c) => c.fix).filter(Boolean).join(" "),
                },
                ...body,
            });
        }
    }
    else {
        process.stdout.write(formatDoctor(checks, { home, pin }));
    }
    return ready ? EXIT.OK : EXIT.FAIL;
}
if (isMainModule(import.meta.url)) {
    const json = process.argv.includes("--json");
    runDoctor(process.argv.slice(2), { json }).then((code) => {
        process.exitCode = code;
    });
}
