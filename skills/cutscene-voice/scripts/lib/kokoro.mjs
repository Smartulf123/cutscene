// The fast English fallback: Kokoro-82M through Cutscene's own `tts` command (the engine's
// built-in voice). Preset voices only; no design and no cloning.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { cutsceneHome, FOUNDATION_CLI, readManifest, SKILL_DIR, voicePaths } from "./paths.mjs";
import { run } from "./proc.mjs";
import { VoiceError } from "./util.mjs";

export function enginePin(env = process.env) {
  if (env.CUTSCENE_ENGINE_VERSION) return env.CUTSCENE_ENGINE_VERSION;
  try {
    return JSON.parse(readFileSync(join(SKILL_DIR, "..", "cutscene", "engine.json"), "utf8")).hyperframes;
  } catch {
    return null;
  }
}

/** How to reach the `cutscene` command: CUTSCENE_CLI from the dispatcher, else the CLI next to this skill. */
export function cutsceneCli(env = process.env) {
  if (env.CUTSCENE_CLI && existsSync(env.CUTSCENE_CLI)) return env.CUTSCENE_CLI;
  if (existsSync(FOUNDATION_CLI)) return FOUNDATION_CLI;
  return null;
}

/** Where the engine keeps Kokoro's model after its first use (shared engine cache). */
export function kokoroCache() {
  const dir = join(homedir(), ".cache", "hyperframes", "tts");
  return { model: join(dir, "models", "kokoro-v1.0.onnx"), voices: join(dir, "voices", "voices-v1.0.bin") };
}

export function kokoroStatus(home = cutsceneHome()) {
  const cli = cutsceneCli();
  const c = kokoroCache();
  const cached = existsSync(c.model) && existsSync(c.voices);
  const pin = enginePin();
  const engineInstalled = !!pin && existsSync(join(home, "engine", pin));
  return {
    id: "kokoro",
    name: "Kokoro (built-in, English presets)",
    available: !!cli,
    installed: !!cli && cached,
    engine_installed: engineInstalled,
    model_cached: cached,
    license: readManifest().presets.kokoro.license,
    note: cached ? "Ready." : "The built-in voice downloads its model (about 340 MB) the first time Cutscene's tts runs.",
  };
}

/**
 * Speak a line with a Kokoro preset into `out` (WAV).
 * The text goes through a .txt file, never the command line, so it can't be read as options.
 */
export async function kokoroSpeak({ text, out, voice = "af_heart", speed, home = cutsceneHome(), yes = false }) {
  const cli = cutsceneCli();
  if (!cli) throw new VoiceError("CUTSCENE_CLI_MISSING", "Cutscene's main command wasn't found next to the voice skill.", "Reinstall the Cutscene plugin so skills/cutscene sits next to skills/cutscene-voice.");
  const cache = kokoroCache();
  if (!yes && !(existsSync(cache.model) && existsSync(cache.voices))) {
    // The first use downloads the model (contracts §9: ask first).
    throw new VoiceError("NEEDS_CONSENT", "The built-in voice (Kokoro-82M) needs a one-time download first: about 350 MB, Apache-2.0, from github.com/thewh1teagle/kokoro-onnx.", "Ask the user, then run the same command again with --yes. It is saved in the engine's cache (~/.cache/hyperframes/tts); nothing goes on PATH.", {
      downloads: [{ id: "kokoro", name: "Kokoro-82M voice model", size: "about 350 MB", license: "Apache-2.0", source: "github.com/thewh1teagle/kokoro-onnx (release model-files-v1.0)" }],
    });
  }
  const vp = voicePaths(home);
  mkdirSync(vp.jobs, { recursive: true });
  mkdirSync(dirname(out), { recursive: true });
  const txt = join(vp.jobs, `kokoro-${process.pid}-${Date.now()}.txt`);
  writeFileSync(txt, text, "utf8");
  const args = [cli, "tts", "--text-file", txt, "-o", out, "--voice", voice, "--json"];
  if (speed) args.push("--speed", String(speed));
  if (yes) args.push("--yes");
  const env = { ...process.env };
  // Kokoro needs Python with kokoro-onnx. Prefer Cutscene's voice environment when it has it.
  if (!env.HYPERFRAMES_PYTHON && existsSync(vp.python) && existsSync(join(vp.venv, "Lib", "site-packages", "kokoro_onnx"))) env.HYPERFRAMES_PYTHON = vp.python;
  const t0 = Date.now();
  const res = await run(process.execPath, args, { env, timeoutMs: 10 * 60 * 1000 });
  rmSync(txt, { force: true });
  if (res.code !== 0 || !existsSync(out)) {
    let msg = "";
    try {
      msg = JSON.parse(res.stdout.trim().split(/\r?\n/).pop() || "{}")?.error?.message || "";
    } catch {
      /* not JSON */
    }
    msg = msg || res.stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(" ");
    throw new VoiceError("KOKORO_FAILED", `The built-in voice couldn't speak the line${msg ? `: ${msg}` : "."}`, "Run `cutscene doctor`. Kokoro needs Python with kokoro-onnx (pip install kokoro-onnx soundfile).");
  }
  return { seconds: (Date.now() - t0) / 1000 };
}
