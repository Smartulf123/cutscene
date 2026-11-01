#!/usr/bin/env node
// Record the real Cutscene preview (Studio) playing this project, headlessly, into an mp4.
//
//   node .cutscene/capture/record-preview.mjs [--start 33.3] [--length 4.6] [--fps 30]
//        [--out assets/footage/preview-recording.mp4] [--size 2560x1440] [--scale 1.7778]
//        [--no-update-scene] [--keep-frames]
//
// It asks `cutscene preview --status` for the Studio URL (starting the preview in the background if
// it isn't running, and stopping it again at the end), launches the cached chrome-headless-shell the
// engine downloaded (~/.cache/hyperframes/chrome), opens the Studio at a CSS viewport of size/scale
// (1440x810 by default, drawn at 1.78 device pixels per CSS pixel, so the picture is `size`), and
// records it over the DevTools protocol, frame-exact: for each frame it moves the Studio's own
// playhead (the `t=` value in the Studio URL, the same state the timeline scrubber writes), waits
// for the player and the visible <video> elements to finish seeking, then takes a screenshot. The
// time readout, the timeline playhead and the canvas all show that frame; no dropped frames.
//
// It waits for the project files to be quiet before it starts, and starts over if any of them
// change while it records (the Studio hot-reloads on every save) or if the Studio shows a
// console-error notice.
//
// It also writes where the Studio's canvas and timeline playhead are in every frame to
// <out>.json and into the REC-LAYOUT block of compositions/b7-studio.html, so that scene's beat
// sheet, sync line and push-in follow the recording (skip with --no-update-scene).
//
// Frames are encoded with ffmpeg (H.264, yuv420p, silent). Node built-ins only (Node 22+).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, "..", "..");
const REPO = resolve(PROJECT, "..", "..");
const CLI = join(REPO, "skills", "cutscene", "scripts", "cli.mjs");
const SCENE = join(PROJECT, "compositions", "b7-studio.html");

// ---------------------------------------------------------------- arguments
const args = { start: 33.3, length: 4.6, fps: 30, out: "assets/footage/preview-recording.mp4", scale: 16 / 9, size: "2560x1440", keepFrames: false, updateScene: true };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const val = () => argv[++i];
  if (a === "--start") args.start = Number(val());
  else if (a === "--length") args.length = Number(val());
  else if (a === "--fps") args.fps = Number(val());
  else if (a === "--out") args.out = val();
  else if (a === "--scale") args.scale = Number(val());
  else if (a === "--size") args.size = val();
  else if (a === "--keep-frames") args.keepFrames = true;
  else if (a === "--no-update-scene") args.updateScene = false;
  else if (a === "--help" || a === "-h") {
    const lines = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
    console.log(lines.slice(1, lines.findIndex((l) => l.startsWith("import"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    process.exit(0);
  } else throw new Error(`Unknown argument ${a}`);
}
const [W, H] = args.size.split("x").map(Number);
const VW = Math.round(W / args.scale), VH = Math.round(H / args.scale);
const OUT = resolve(PROJECT, args.out);
const NFRAMES = Math.round(args.length * args.fps);
const FRAME0 = Math.round(args.start * args.fps);
const log = (...m) => console.log("[record-preview]", ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- tools
function findChrome() {
  const base = join(homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  if (!existsSync(base)) throw new Error(`No cached chrome-headless-shell in ${base}. Run cutscene doctor.`);
  const vers = readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of vers) {
    for (const sub of readdirSync(join(base, v))) {
      for (const exe of ["chrome-headless-shell.exe", "chrome-headless-shell"]) {
        const p = join(base, v, sub, exe);
        if (existsSync(p)) return p;
      }
    }
  }
  throw new Error("chrome-headless-shell executable not found");
}
function findFfmpeg() {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", ["ffmpeg"], { encoding: "utf8" });
  const p = (r.stdout || "").split(/\r?\n/).find(Boolean);
  if (!p) throw new Error("ffmpeg not found on PATH");
  return p.trim();
}
function cutscene(...a) {
  const r = spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8" });
  try { return JSON.parse(r.stdout); } catch { return { ok: false, raw: r.stdout + r.stderr }; }
}
// the project files the Studio reloads on: index.html, compositions/, assets/ (not this recording)
function projectStamp() {
  const parts = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (!p.startsWith(OUT.replace(/\.mp4$/, ""))) parts.push(relative(PROJECT, p) + ":" + st.mtimeMs + ":" + st.size);
    }
  };
  parts.push("index.html:" + statSync(join(PROJECT, "index.html")).mtimeMs);
  walk(join(PROJECT, "compositions"));
  walk(join(PROJECT, "assets"));
  return parts.join("|");
}
async function waitQuiet(ms) {
  let s = projectStamp(), since = Date.now();
  while (Date.now() - since < ms) {
    await sleep(1000);
    const n = projectStamp();
    if (n !== s) { s = n; since = Date.now(); log("project files changed, waiting for them to settle"); }
  }
  return s;
}

// ---------------------------------------------------------------- CDP
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = (ev) => this.onMsg(JSON.parse(ev.data)); }
  static open(url) { return new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(new CDP(ws)); ws.onerror = (e) => rej(e); }); }
  onMsg(m) {
    if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

// In-page helpers (Studio page). Times are passed as exact frame numbers so they match the
// Studio's frame-snapped playhead.
const PAGE_HELPERS = `
window.__rec = {
  player() { return document.querySelector('hyperframes-player'); },
  frameWin() { const p = this.player(); const f = p && p.shadowRoot && p.shadowRoot.querySelector('iframe'); return f && f.contentWindow; },
  ready() { const p = this.player(), w = this.frameWin(); return !!(p && w && w.__renderReady && p.duration > 0); },
  hasError() { return /Console errors in preview/.test(document.body.innerText); },
  rect(e) { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(v => Math.round(v * 10) / 10); },
  handle() {
    const els = [...document.querySelectorAll('div[style*="--timeline-accent"]')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 4 && b.width < 24 && Math.abs(b.width - b.height) < 2; });
    if (!els.length) return null;
    const b = els[0].getBoundingClientRect();
    return [Math.round((b.x + b.width / 2) * 10) / 10, Math.round((b.y + b.height / 2) * 10) / 10];
  },
  async seek(frame, fps) {
    const target = frame / fps;
    const h = location.hash, q = h.indexOf('?');
    const sp = new URLSearchParams(q < 0 ? '' : h.slice(q + 1));
    sp.set('t', String(target));
    location.hash = (q < 0 ? h : h.slice(0, q)) + '?' + sp.toString();
    const p = this.player(), w = this.frameWin();
    const t0 = performance.now();
    const tick = () => new Promise(r => setTimeout(r, 4));
    const capped = (pr, ms) => Promise.race([Promise.resolve(pr).catch(() => {}), new Promise(r => setTimeout(r, ms))]);
    while (Math.abs(p.currentTime - target) > 0.25 / fps && performance.now() - t0 < 4000) await tick();
    if (w.__hfWaitForSeekCompletion) await capped(w.__hfWaitForSeekCompletion(), 3000);
    const shown = (v) => v.getClientRects().length > 0 && getComputedStyle(v).visibility !== 'hidden' && v.src;
    const vids = [...w.document.querySelectorAll('video')].filter(shown);
    while (vids.some(v => v.seeking || v.readyState < 2) && performance.now() - t0 < 4000) await tick();
    if (w.document.fonts) await capped(w.document.fonts.ready, 2000);
    for (let i = 0; i < 2; i++) await capped(new Promise(r => requestAnimationFrame(() => r())), 500);
    return { t: p.currentTime, ms: Math.round(performance.now() - t0), handle: this.handle() };
  },
};
true`;

async function main() {
  // 1. the preview
  let st = cutscene("preview", PROJECT, "--status", "--json");
  let startedHere = false;
  if (!st.running) {
    log("starting the preview");
    const r = cutscene("preview", PROJECT, "--background", "--no-open", "--json");
    if (!r.ok) throw new Error("could not start the preview: " + JSON.stringify(r));
    startedHere = true;
    st = cutscene("preview", PROJECT, "--status", "--json");
  }
  log("studio", st.url);

  // 2. chrome
  const profile = mkdtempSync(join(tmpdir(), "cs-rec-"));
  const proc = spawn(findChrome(), [
    "--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--mute-audio", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    `--window-size=${VW},${VH}`, "about:blank",
  ], { stdio: "ignore" });
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    const f = join(profile, "DevToolsActivePort");
    if (existsSync(f)) port = readFileSync(f, "utf8").split(/\r?\n/)[0];
  }
  if (!port) throw new Error("chrome did not start");
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
  const cdp = await CDP.open(page.webSocketDebuggerUrl);
  // every page call is capped, so a page that stops answering restarts the attempt instead of hanging
  const evaluate = async (expression, ms = 30000) => {
    let timer;
    const r = await Promise.race([
      cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("page call timed out")), ms); }),
    ]).finally(() => clearTimeout(timer));
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  const frameDir = mkdtempSync(join(tmpdir(), "cs-rec-frames-"));
  let layout;
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: args.scale, mobile: false });
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });

    for (let attempt = 1; ; attempt++) {
      if (attempt > 6) throw new Error("gave up: the project kept changing or the Studio kept showing errors");
      const stamp = await waitQuiet(attempt === 1 ? 5000 : 15000);
      try {
      log(`attempt ${attempt}: loading the studio`);
      await cdp.send("Page.navigate", { url: st.url });
      await sleep(1500);
      await evaluate(PAGE_HELPERS);
      await evaluate(`new Promise((res, rej) => { const t0 = performance.now(); (function poll() {
        if (window.__rec.ready()) return res(true);
        if (performance.now() - t0 > 90000) return rej(new Error('studio not ready'));
        setTimeout(poll, 200); })(); })`, 100000);
      await sleep(1500);
      // warm up: visit the range once so media is decoded and cached
      for (let f = 0; f < NFRAMES; f += 10) await evaluate(`window.__rec.seek(${FRAME0 + f}, ${args.fps})`);
      await sleep(4000); // let the timeline thumbnails finish loading
      if (await evaluate(`window.__rec.hasError()`)) { log("the Studio shows a console error; waiting and retrying"); continue; }

      const canvas = await evaluate(`window.__rec.rect(window.__rec.player())`);
      const handles = [];
      let broken = false;
      const t0 = Date.now();
      for (let i = 0; i < NFRAMES; i++) {
        const r = await evaluate(`window.__rec.seek(${FRAME0 + i}, ${args.fps})`);
        let st2;
        const shot = await Promise.race([cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }),
          new Promise((_, rej) => { st2 = setTimeout(() => rej(new Error("screenshot timed out")), 30000); })]).finally(() => clearTimeout(st2));
        writeFileSync(join(frameDir, `f${String(i).padStart(5, "0")}.png`), Buffer.from(shot.data, "base64"));
        handles.push(r.handle);
        if (i % 30 === 0) log(`frame ${i + 1}/${NFRAMES} @ ${r.t.toFixed(3)} s (${r.ms} ms)`);
        if (projectStamp() !== stamp || (i % 15 === 0 && (await evaluate(`window.__rec.hasError()`)))) { broken = true; break; }
      }
      if (broken) { log("the project changed (or the Studio reloaded with an error) mid-recording; starting over"); continue; }
      log(`captured ${NFRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      layout = { start: FRAME0 / args.fps, fps: args.fps, frames: NFRAMES, viewport: [VW, VH], size: [W, H], canvas, playhead: handles };
      break;
      } catch (e) {
        log(`attempt ${attempt} failed (${e.message}); starting over`);
      }
    }
  } finally {
    try { cdp.ws.close(); } catch {}
    proc.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    if (startedHere) { log("stopping the preview"); cutscene("preview", PROJECT, "--stop", "--json"); }
  }

  // 3. encode
  mkdirSync(dirname(OUT), { recursive: true });
  const r = spawnSync(findFfmpeg(), ["-y", "-loglevel", "error", "-framerate", String(args.fps), "-i", join(frameDir, "f%05d.png"),
    "-vf", `scale=${W}:${H}:flags=lanczos`, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", OUT], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
  if (args.keepFrames) log("frames kept in", frameDir);
  else rmSync(frameDir, { recursive: true, force: true });
  log(`wrote ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${NFRAMES} frames, ${W}x${H} @ ${args.fps} fps)`);

  // 4. layout for the scene
  const json = JSON.stringify(layout);
  writeFileSync(OUT.replace(/\.mp4$/, ".json"), JSON.stringify(layout, null, 1));
  if (args.updateScene && existsSync(SCENE)) {
    const src = readFileSync(SCENE, "utf8");
    const re = /(\/\* REC-LAYOUT:BEGIN[^\n]*\n)[\s\S]*?(\n\s*\/\* REC-LAYOUT:END \*\/)/;
    if (re.test(src)) {
      writeFileSync(SCENE, src.replace(re, (_, a, b) => `${a}          const REC = ${json};${b}`));
      log("updated the REC-LAYOUT block in compositions/b7-studio.html");
    } else log("no REC-LAYOUT block in compositions/b7-studio.html; layout written to the .json only");
  }
}

main().catch((e) => { console.error("[record-preview] failed:", e.message || e); process.exit(1); });
