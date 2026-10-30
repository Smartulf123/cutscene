// What some engine commands download the first time they run, so Cutscene can ask first
// (contracts §9). The engine keeps these models in its own cache, ~/.cache/hyperframes/, not in
// the Cutscene home. Without --yes, a command that would download stops with NEEDS_CONSENT and
// says what it would get. Node built-ins only.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The engine's model cache. */
export function engineCacheDir(home = homedir()) {
  return join(home, ".cache", "hyperframes");
}

/** Whisper model sizes (whisper.cpp ggml files), for the consent message. */
const WHISPER_SIZES = {
  "tiny.en": "about 75 MB",
  "base.en": "about 140 MB",
  "small.en": "about 470 MB",
  "medium.en": "about 1.5 GB",
  "large-v3": "about 3 GB",
};

/** The value of `--name value`, `--name=value` or a short alias in an argument list. */
export function optionValue(args, names) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const n of names) {
      if (a === n && i + 1 < args.length) return args[i + 1];
      if (a.startsWith(`${n}=`)) return a.slice(n.length + 1);
    }
  }
  return undefined;
}

/** Positional arguments (anything not an option or an option's value). */
function positionals(args, valued) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("-")) {
      if (valued.includes(a)) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

function hasFiles(dir) {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/**
 * The downloads an engine command would make on this computer, as consent plans
 * ({id, name, size, license, source, location}). Empty when everything is already cached or the
 * command downloads nothing.
 * @param {string} cmd
 * @param {string[]} args the engine arguments
 * @param {{cacheDir?: string}} [opts]
 */
export function engineDownloadsFor(cmd, args, { cacheDir = engineCacheDir() } = {}) {
  const plans = [];
  if (args.includes("--help") || args.includes("-h")) return plans;

  if (cmd === "transcribe") {
    const input = positionals(args, ["-d", "--dir", "-e", "--engine", "-m", "--model", "-l", "--language", "--to", "-o", "--output", "--timeout"])[0] || "";
    if (/\.(json|srt|vtt)$/i.test(input)) return plans; // importing a transcript downloads nothing
    const engine = optionValue(args, ["--engine", "-e"]) || "auto";
    const parakeet = hasFiles(join(cacheDir, "parakeet"));
    if (engine === "parakeet" && !parakeet) {
      plans.push({
        id: "parakeet",
        name: "Parakeet speech model (local transcription)",
        size: "about 670 MB",
        license: "CC-BY-4.0 (NVIDIA Parakeet TDT 0.6B v3), runtime Apache-2.0 (sherpa-onnx)",
        source: "huggingface.co (csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8, pinned revision and SHA-256) and the npm registry",
        location: join(cacheDir, "parakeet"),
      });
      return plans;
    }
    if (engine === "parakeet" || (engine === "auto" && parakeet)) return plans;
    const model = optionValue(args, ["--model", "-m"]) || "small.en";
    const file = join(cacheDir, "whisper", "models", `ggml-${model}.bin`);
    if (!existsSync(file)) {
      plans.push({
        id: `whisper-${model}`,
        name: `Whisper ${model} speech model (local transcription)`,
        size: WHISPER_SIZES[model] || "up to 3 GB",
        license: "MIT (OpenAI Whisper weights, whisper.cpp conversion)",
        source: "huggingface.co (ggerganov/whisper.cpp)",
        location: join(cacheDir, "whisper", "models"),
      });
    }
    return plans;
  }

  if (cmd === "tts") {
    const model = join(cacheDir, "tts", "models", "kokoro-v1.0.onnx");
    const voices = join(cacheDir, "tts", "voices", "voices-v1.0.bin");
    if (!existsSync(model) || !existsSync(voices)) {
      plans.push({
        id: "kokoro",
        name: "Kokoro-82M voice model (the built-in English voice)",
        size: "about 350 MB",
        license: "Apache-2.0",
        source: "github.com/thewh1teagle/kokoro-onnx (release model-files-v1.0)",
        location: join(cacheDir, "tts"),
      });
    }
    return plans;
  }

  if (cmd === "remove-background") {
    if (args.includes("--info")) return plans;
    const model = join(cacheDir, "background-removal", "models", "u2net_human_seg.onnx");
    if (!existsSync(model)) {
      plans.push({
        id: "u2net",
        name: "U2-Net person cut-out model",
        size: "about 170 MB",
        license: "Apache-2.0 (U-2-Net, via rembg)",
        source: "github.com/danielgatis/rembg (release v0.0.0)",
        location: join(cacheDir, "background-removal", "models"),
      });
    }
    if (!hasFiles(join(cacheDir, "optional")) || !readdirSync(join(cacheDir, "optional")).some((d) => d.startsWith("onnxruntime-node@"))) {
      plans.push({
        id: "onnxruntime",
        name: "ONNX Runtime for Node.js (runs the cut-out model)",
        size: "about 210 MB",
        license: "MIT",
        source: "npm registry (onnxruntime-node, exact version pinned by the engine)",
        location: join(cacheDir, "optional"),
      });
    }
    return plans;
  }

  if (cmd === "models") {
    const [action, name] = positionals(args, []);
    if (action === "install") {
      plans.push({
        id: `model-${name || "unknown"}`,
        name: `On-device model ${name || ""}`.trim(),
        size: name === "parakeet" ? "about 670 MB" : "several hundred MB",
        license: name === "parakeet" ? "CC-BY-4.0 (NVIDIA Parakeet TDT 0.6B v3), runtime Apache-2.0 (sherpa-onnx)" : "see the model card",
        source: name === "parakeet" ? "huggingface.co (pinned revision and SHA-256) and the npm registry" : "the engine's model source",
        location: cacheDir,
      });
    }
    return plans;
  }

  return plans;
}

/** The consent sentence for a list of plans. */
export function describeDownloads(plans) {
  return plans.map((p) => `${p.name} (${p.size}, ${p.license}, from ${p.source})`).join("; ");
}
