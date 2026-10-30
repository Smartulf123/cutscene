// Ported from Cutscene 1 src/lib/analysis/faces.ts (Apache-2.0); plain ESM JS for Cutscene 2.
//
// Face tracking with MediaPipe's face detector (Apache-2.0, google-ai-edge/mediapipe, BlazeFace
// short-range model), run in the headless Chrome the engine already uses for rendering, driven by
// the engine's own puppeteer-core (so Cutscene adds no npm dependency). Frames are sampled with
// FFmpeg; each frame's face boxes are kept, normalised to the frame (0–1). Both MediaPipe files are
// pinned downloads (assets/manifest.json) installed only after the user agrees.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { EditError } from "./cli.mjs";
import { engineChrome, engineModules } from "./engine.mjs";
import { ensureTool, installedPath, pinFor } from "./install.mjs";
import { ffmpeg } from "./media.mjs";

const ORIGIN = "http://cutscene-faces.local";
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".tflite": "application/octet-stream", ".html": "text/html" };

/** True when the face detector files are installed. */
export function faceDetectorInstalled() {
  return ["mediapipe-tasks-vision", "face-detector-model"].every((n) => {
    const p = pinFor(n);
    return p && installedPath(p);
  });
}

/** Samples a second: 4 up to half an hour, fewer for long recordings (the speaker moves slowly). */
export function faceSampleRate(seconds) {
  return seconds <= 1800 ? 4 : seconds <= 5400 ? 2 : 1;
}

const SETUP = `(async () => {
  const vision = await import("__ORIGIN__/vision_bundle.mjs");
  const fileset = await vision.FilesetResolver.forVisionTasks("__ORIGIN__/wasm");
  const detector = await vision.FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "__ORIGIN__/model.tflite", delegate: "CPU" },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.5,
  });
  window.detect = async (frames) => {
    const out = [];
    for (const b64 of frames) {
      const blob = await (await fetch("data:image/jpeg;base64," + b64)).blob();
      const img = await createImageBitmap(blob);
      const r = detector.detect(img);
      out.push(r.detections.filter((d) => d.boundingBox).map((d) => ({
        x: d.boundingBox.originX / img.width, y: d.boundingBox.originY / img.height,
        w: d.boundingBox.width / img.width, h: d.boundingBox.height / img.height,
        score: (d.categories[0] && d.categories[0].score) || 0,
      })));
      img.close();
    }
    return out;
  };
})()`;

const round4 = (n) => Math.round(n * 10_000) / 10_000;

/**
 * Detect faces in a video.
 * @param {string} file
 * @param {{fps: number, yes?: boolean}} o
 * @returns {Promise<{fps: number, frames: {x: number, y: number, w: number, h: number, score: number}[][]}>}
 */
export async function detectFaces(file, o) {
  const vision = await ensureTool("mediapipe-tasks-vision", { yes: o.yes, why: "Face-follow reframing" });
  const model = await ensureTool("face-detector-model", { yes: o.yes, why: "Face-follow reframing" });
  const mods = engineModules();
  if (!mods) throw new EditError("ENGINE_MISSING", "Face tracking runs in the engine's browser, and the engine is not installed.", "Run `cutscene setup`, or reframe with --center.");
  let puppeteer;
  try {
    const req = createRequire(join(mods, "noop.js"));
    puppeteer = (await import(pathToFileURL(req.resolve("puppeteer-core")).href)).default;
  } catch (e) {
    throw new EditError("ENGINE_MISSING", `The engine's browser driver was not found (${e.message}).`, "Run `cutscene setup` to repair the engine, or reframe with --center.");
  }
  const chrome = engineChrome();
  if (!chrome) throw new EditError("BROWSER_MISSING", "The engine's Chrome was not found.", "Run `cutscene doctor`; it installs the render browser. Or reframe with --center.");
  const local = (url) => {
    const u = new URL(url);
    if (u.origin !== ORIGIN) return null;
    if (u.pathname === "/model.tflite") return model;
    if (u.pathname === "/vision_bundle.mjs") return join(vision, "vision_bundle.mjs");
    const wasm = /^\/wasm\/([a-z_]+\.(?:js|wasm))$/.exec(u.pathname);
    return wasm ? join(vision, "wasm", wasm[1]) : null;
  };
  const dir = mkdtempSync(join(tmpdir(), "cutscene-faces-"));
  try {
    ffmpeg(["-loglevel", "error", "-i", file, "-an", "-vf", `fps=${o.fps},scale=480:-2`, "-q:v", "4", join(dir, "f%06d.jpg")], { what: "read the video frames" });
    const names = readdirSync(dir).filter((n) => n.endsWith(".jpg")).sort();
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--disable-gpu", "--no-first-run", "--mute-audio"] });
    try {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (req.url() === `${ORIGIN}/`) return void req.respond({ status: 200, contentType: "text/html", body: "<!doctype html><title>faces</title>" });
        const p = local(req.url());
        if (!p) return void req.abort();
        try {
          req.respond({ status: 200, contentType: TYPES[extname(p)] ?? "application/octet-stream", body: readFileSync(p) });
        } catch {
          req.respond({ status: 404, body: "" });
        }
      });
      await page.goto(`${ORIGIN}/`);
      await page.evaluate(SETUP.replaceAll("__ORIGIN__", ORIGIN));
      const frames = [];
      for (let i = 0; i < names.length; i += 24) {
        const batch = names.slice(i, i + 24).map((n) => readFileSync(join(dir, n)).toString("base64"));
        const found = await page.evaluate((b) => window.detect(b), batch);
        frames.push(...found.map((faces) => faces.map((f) => ({ x: round4(f.x), y: round4(f.y), w: round4(f.w), h: round4(f.h), score: round4(f.score) }))));
      }
      return { fps: o.fps, frames };
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
