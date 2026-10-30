// `cutscene setup`: installs the engine pieces Cutscene can install itself, only with consent
// (contracts §9). Without --yes it lists what it would download and stops with NEEDS_CONSENT.
// Voices and Blender have their own setup: `cutscene voice setup`, `cutscene 3d setup`.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CutsceneError, EXIT, fail, printHumanError, printJson } from "./lib/json.mjs";
import { cutsceneHome } from "./lib/paths.mjs";
import { enginePlan, installEngine, readPin, runEngine } from "./lib/engine.mjs";
import { createRebrandStream } from "./lib/brand.mjs";
import { collectChecks, formatDoctor, summarize } from "./doctor.mjs";
import { isMainModule } from "./lib/main.mjs";

export function browserPlan() {
  return {
    id: "browser",
    name: "Render browser",
    package: "Chrome headless shell",
    size: "about 270 MB",
    license: "Google Chrome for Testing (Chromium: BSD-3-Clause and others)",
    source: "Google's Chrome for Testing downloads, fetched by the engine",
    location: join(homedir(), ".cache", "hyperframes", "chrome"),
  };
}

function cachedBrowser() {
  try {
    const dir = join(browserPlan().location, "chrome-headless-shell");
    return readdirSync(dir).some((d) => existsSync(join(dir, d)));
  } catch {
    return false;
  }
}

/** What setup would install, and what it leaves to other commands, from the doctor checks. */
export function planSetup(checks, pin) {
  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
  const downloads = [];
  if (byId.engine && !byId.engine.ok) downloads.push(enginePlan(pin));
  // Without the engine the browser can't be asked for; skip it when the engine's cache has one.
  const browserCached = byId.engine && !byId.engine.ok && cachedBrowser();
  if (byId.browser && !byId.browser.ok && !browserCached) downloads.push(browserPlan());
  const elsewhere = [];
  if (byId.ffmpeg && !byId.ffmpeg.ok) elsewhere.push({ id: "ffmpeg", name: "FFmpeg", how: byId.ffmpeg.fix });
  if (byId.node && !byId.node.ok) elsewhere.push({ id: "node", name: "Node.js 22+", how: byId.node.fix });
  if (byId.voice && !byId.voice.ok) elsewhere.push({ id: "voice", name: "AI voices (optional)", how: "Run `cutscene voice setup` when a video needs a voiceover." });
  if (byId.blender && !byId.blender.ok) elsewhere.push({ id: "blender", name: "Blender (optional)", how: "Run `cutscene 3d setup` when a video needs realistic 3D." });
  return { downloads, elsewhere };
}

function formatPlan({ downloads, elsewhere }, home) {
  const lines = [];
  if (downloads.length) {
    lines.push("Cutscene setup would download:", "");
    for (const d of downloads) lines.push(`  ${d.name.padEnd(18)}${d.package} · ${d.size} · ${d.license}`, `  ${"".padEnd(18)}From: ${d.source}${d.location ? ` · Saved in ${d.location}` : ""}`);
    lines.push("", `The engine goes into ${join(home, "engine")}. Nothing is installed globally or put on PATH.`);
  }
  if (elsewhere.length) {
    lines.push("", "Not installed by setup:");
    for (const e of elsewhere) lines.push(`  ${e.name}: ${e.how}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * @param {string[]} args
 * @param {{json?: boolean, yes?: boolean}} opts
 */
export async function runSetup(args = [], { json = false, yes = false } = {}) {
  const home = cutsceneHome();
  const pin = readPin();
  const before = await collectChecks({ home });
  const plan = planSetup(before, pin);

  if (!plan.downloads.length) {
    const { ready } = summarize(before);
    const message = ready ? "Everything Cutscene needs is installed." : "Setup can't install the rest for you; see below.";
    if (json) {
      const body = { installed: [], elsewhere: plan.elsewhere, checks: before };
      printJson(ready ? { ok: true, message, ...body } : fail("MISSING_REQUIREMENTS", message, plan.elsewhere.map((e) => `${e.name}: ${e.how}`).join(" "), body));
    } else {
      process.stdout.write(`${message}\n`);
      if (plan.elsewhere.length) process.stdout.write(formatPlan({ downloads: [], elsewhere: plan.elsewhere }, home));
    }
    return ready ? EXIT.OK : EXIT.FAIL;
  }

  if (!yes) {
    const message = `Cutscene needs to download ${plan.downloads.map((d) => `${d.name.toLowerCase()} (${d.size})`).join(" and ")}.`;
    if (json) {
      printJson(fail("NEEDS_CONSENT", message, "Ask the user. If they agree, run `cutscene setup --yes`.", { downloads: plan.downloads, elsewhere: plan.elsewhere }));
    } else {
      process.stdout.write(formatPlan(plan, home));
      process.stdout.write("\nTo go ahead, run: cutscene setup --yes\n");
    }
    return EXIT.FAIL;
  }

  const log = (s) => process.stderr.write(s);
  const installed = [];
  try {
    if (plan.downloads.some((d) => d.id === "engine")) {
      log(`Installing the video engine ${pin} into ${join(home, "engine", pin)}...\n`);
      await installEngine({ pin, home, onOutput: log });
      installed.push("engine");
    }
    const afterEngine = await collectChecks({ home });
    const browser = afterEngine.find((c) => c.id === "browser");
    if (browser && !browser.ok) {
      log("Downloading the render browser (this can take a few minutes)...\n");
      const err = createRebrandStream(log);
      const r = await runEngine(["browser", "ensure"], { pin, home, env: { ...process.env, NO_COLOR: "1" }, onStdout: (c) => err.push(c), onStderr: (c) => err.push(c) });
      err.end();
      if (r.code !== 0) {
        throw new CutsceneError("BROWSER_INSTALL_FAILED", "Cutscene couldn't download the render browser.", {
          hint: "Check your internet connection, then run `cutscene setup --yes` again.",
        });
      }
      installed.push("browser");
    }
  } catch (err) {
    if (json) printJson({ ...fail(err.code || "SETUP_FAILED", err.message, err.hint || ""), installed });
    else printHumanError(err);
    return EXIT.FAIL;
  }

  const after = await collectChecks({ home });
  const { ready } = summarize(after);
  if (json) {
    const body = { installed, elsewhere: planSetup(after, pin).elsewhere, checks: after };
    printJson(ready ? { ok: true, ...body } : fail("MISSING_REQUIREMENTS", "Setup finished, but something Cutscene needs is still missing.", "Run `cutscene doctor` to see what and how to fix it.", body));
  } else {
    process.stdout.write(`Installed: ${installed.join(", ") || "nothing"}.\n\n`);
    process.stdout.write(formatDoctor(after, { home, pin }));
  }
  return ready ? EXIT.OK : EXIT.FAIL;
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  runSetup(argv, { json: argv.includes("--json"), yes: argv.includes("--yes") || argv.includes("-y") }).then((code) => {
    process.exitCode = code;
  });
}
