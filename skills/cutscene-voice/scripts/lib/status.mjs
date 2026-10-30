// voiceStatus(): what the voice part can do on this computer, without starting Python.
// Used by `cutscene voice status` and by the foundation's `cutscene doctor`.
//
//   import { voiceStatus } from "../../cutscene-voice/scripts/lib/status.mjs";
//   const s = await voiceStatus({ home });   // s.ok, s.detail, s.fix, s.models[]
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cutsceneHome, modelDir, readManifest, voicePaths } from "./paths.mjs";
import { kokoroStatus } from "./kokoro.mjs";
import { voiceStudioHealth } from "./voicestudio.mjs";
import { fmtBytes } from "./util.mjs";

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Are all pinned files of a model present with the right sizes? */
export function modelFilesStatus(model, home = cutsceneHome()) {
  const spec = readManifest().models[model];
  const dir = modelDir(model, home);
  let present = 0;
  let bytes = 0;
  const missing = [];
  for (const f of spec.files) {
    const p = join(dir, f.path);
    try {
      const st = statSync(p);
      if (st.size === f.size) {
        present++;
        bytes += st.size;
      } else missing.push(f.path);
    } catch {
      missing.push(f.path);
    }
  }
  const size = spec.files.reduce((a, f) => a + f.size, 0);
  return { installed: missing.length === 0, present, total: spec.files.length, bytes, size, missing, dir };
}

/**
 * @param {{home?: string, voicestudio?: boolean, timeoutMs?: number}} [opts]
 */
export async function voiceStatus(opts = {}) {
  const home = opts.home || cutsceneHome();
  const vp = voicePaths(home);
  const manifest = readManifest();
  const lock = readJson(vp.lock);
  const benchmarks = readJson(vp.benchmarks);
  const envExists = existsSync(vp.python);
  const groups = new Set(lock?.groups || []);

  const models = [];
  for (const [id, spec] of Object.entries(manifest.models)) {
    const files = modelFilesStatus(id, home);
    const pkgs = groups.has(spec.python_group) || (!lock && envExists && id !== "voxcpm2" && existsSync(join(vp.venv, "Lib", "site-packages", id === "whisper" ? "faster_whisper" : id)));
    const installed = envExists && files.installed && pkgs;
    models.push({
      id,
      name: spec.title,
      kind: spec.kind,
      installed,
      files_present: files.installed,
      packages_installed: !!pkgs,
      size: files.size,
      size_text: fmtBytes(files.size),
      license: spec.license,
      commercial_use: spec.commercial_use,
      languages: spec.languages,
      revision: spec.revision,
      source: spec.source,
      on_demand: !!spec.on_demand,
      verified_sha256: !!lock?.models?.[id]?.verified,
      benchmark: benchmarks?.models?.[id] || null,
    });
  }
  const kokoro = kokoroStatus(home);
  models.push({ ...kokoro, kind: "tts", commercial_use: true, size_text: "about 340 MB (engine cache)", benchmark: benchmarks?.models?.kokoro || null });

  const vs = opts.voicestudio === false ? { running: false, url: null, detail: "not checked" } : await voiceStudioHealth({ timeoutMs: opts.timeoutMs ?? 1200 });
  const has = (id) => models.find((m) => m.id === id)?.installed;
  const tts = ["omnivoice", "voxcpm2"].filter(has);
  const ready = {
    design: tts.length > 0 || vs.running,
    clone: tts.length > 0,
    speak: tts.length > 0 || vs.running || kokoro.available,
    verify: !!has("whisper") || vs.running,
  };
  const ok = envExists && tts.length > 0 && !!has("whisper");
  let detail;
  let fix;
  if (ok) detail = `Ready: ${tts.join(", ")} for voices, Whisper for checking${vs.running ? "; VoiceStudio is running" : ""}`;
  else if (envExists) {
    detail = `Partly set up: ${tts.length ? tts.join(", ") : "no voice model"}${has("whisper") ? ", Whisper" : ", no Whisper"}`;
    fix = "Run `cutscene voice setup` to add what's missing (it asks first).";
  } else {
    detail = kokoro.available ? "Only the built-in English voice (Kokoro). Voice design and cloning aren't set up." : "Not set up.";
    fix = "Run `cutscene voice setup` (shows sizes and licences, asks before downloading).";
  }
  return {
    ok,
    ready,
    detail,
    fix,
    home: vp.root,
    env: { exists: envExists, python: vp.python, locked: !!lock, python_version: lock?.python?.version || null, packages: lock?.packages?.length || 0, groups: [...groups] },
    models,
    voicestudio: vs,
    benchmarks: benchmarks || null,
    default_model: tts[0] || (vs.running ? "voicestudio" : "kokoro"),
  };
}
