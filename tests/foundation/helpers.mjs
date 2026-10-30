// Shared helpers for the foundation tests: temp folders, a copy of the cutscene skill in a
// temp skills tree, a fake engine, and a way to run the CLI.
import { execFile } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SKILL = join(REPO, "skills", "cutscene");
export const PIN = "0.8.162";

export function tempDir(prefix = "cutscene-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // best effort on Windows
  }
}

/**
 * Copy the cutscene skill (without the preview, which another owner builds) into
 * <root>/skills/cutscene so tests control what sits next to it.
 */
export function copySkill(root, { withPreview = false } = {}) {
  const dest = join(root, "skills", "cutscene");
  cpSync(SKILL, dest, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(SKILL.length).replace(/\\/g, "/");
      if (rel.startsWith("/references/upstream")) return false;
      if (!withPreview && (rel === "/scripts/preview.mjs" || rel.startsWith("/scripts/preview/"))) return false;
      return true;
    },
  });
  return { skillsRoot: join(root, "skills"), cli: join(dest, "scripts", "cli.mjs") };
}

/** A fake engine: prints its arguments and environment, and some engine-style text. */
export const FAKE_ENGINE = `
const args = process.argv.slice(2);
const pick = (k) => process.env[k];
const env = Object.fromEntries(["HYPERFRAMES_SKIP_SKILLS","HYPERFRAMES_NO_UPDATE_CHECK","HYPERFRAMES_NO_TELEMETRY","DO_NOT_TRACK","HYPERFRAMES_CLIENT","HYPERFRAMES_SKILL_PKG_VERSION","HYPERFRAMES_PLUGIN_VERSION","HYPERFRAMES_MEDIA_HOME"].map((k) => [k, pick(k)]));
const cmd = args[0];
if (cmd === "fail-json" || (cmd === "check" && args.includes("--fail"))) {
  process.stdout.write(JSON.stringify({ ok: false, lint: { errorCount: 2, findings: [] }, _meta: { latestVersion: "9.9.9" } }));
  process.exit(1);
}
if (cmd === "render") {
  console.log("Rendering with HyperFrames...");
  console.log("Saved to C:\\\\work\\\\demo\\\\.hyperframes\\\\renders\\\\out.mp4");
  console.log("Tip: run npx hyperframes@0.8.162 check first, or hyperframes preview.");
  console.log("Keep editing by chatting with Framey in the HyperFrames desktop app: hyperframes open");
  console.error("Settings in hyperframes.json were read.");
  process.exit(0);
}
if (args.includes("--json")) {
  process.stdout.write(JSON.stringify({ ok: true, args, env, cwd: process.cwd(), message: "Run hyperframes lint next", _meta: { updateAvailable: true } }, null, 2));
} else {
  console.log(JSON.stringify({ args, env }));
}
`;

/** Make a Cutscene home with a fake engine installed at the pin. */
export function fakeHome(root, { engine = true } = {}) {
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  if (engine) {
    const pkg = join(home, "engine", PIN, "node_modules", "hyperframes");
    mkdirSync(join(pkg, "dist"), { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "hyperframes", version: PIN }));
    writeFileSync(join(pkg, "dist", "cli.js"), FAKE_ENGINE);
  }
  return home;
}

/** A fake part script that prints its arguments and the Cutscene variables. */
export function fakePart(skillsRoot, part) {
  const dir = join(skillsRoot, `cutscene-${part}`, "scripts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${part}.mjs`),
    `console.log(JSON.stringify({ ok: true, part: ${JSON.stringify(part)}, args: process.argv.slice(2), home: process.env.CUTSCENE_HOME, cli: process.env.CUTSCENE_CLI, engine: process.env.CUTSCENE_ENGINE_VERSION }));`,
  );
}

/**
 * Run the CLI and collect its output.
 * @returns {Promise<{code: number, stdout: string, stderr: string, json?: any}>}
 */
export function runCli(cli, args, { home, cwd, env = {}, timeout = 60_000 } = {}) {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [cli, ...args],
      { cwd, env: { ...process.env, ...(home ? { CUTSCENE_HOME: home } : {}), ...env }, timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        let json;
        try {
          json = JSON.parse(stdout);
        } catch {
          json = undefined;
        }
        resolvePromise({ code, stdout, stderr, json });
      },
    );
  });
}
