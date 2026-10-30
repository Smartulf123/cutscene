// Optional adapter for the user's local VoiceStudio app (https://github.com/debpalash/VoiceStudio).
// VoiceStudio is AGPL: Cutscene never copies or bundles its code. We only call its documented
// HTTP API when the app is already running on this computer:
//   GET  /health, /openapi.json, /v1/audio/voices
//   POST /v1/audio/speech (OpenAI-compatible, plus VoiceStudio's instruct/seed/language/num_step)
//   POST /v1/audio/transcriptions (verbose_json with word timestamps)
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { readManifest } from "./paths.mjs";
import type { WordTiming } from "./types.mjs";
import { VoiceError } from "./util.mjs";

/** What the HTTP calls take besides their own fields (tests pass a fake fetch). */
type StudioOptions = { url?: string; fetchImpl?: typeof fetch; timeoutMs?: number };

/** A word in an OpenAI-style verbose_json transcript. */
type VerboseWord = { word?: string; text?: string; start?: number | string; end?: number | string; probability?: number };
/** An OpenAI-style verbose_json transcript. */
type VerboseTranscript = { text?: string; language?: string; words?: VerboseWord[]; segments?: { words?: VerboseWord[] }[] };

export const DEFAULT_URL = "http://127.0.0.1:3900";

/** Only talk to VoiceStudio on this computer, so voice lines and recordings never leave it. */
export function voiceStudioUrl(configured?: string): string {
  const raw = (configured || process.env.CUTSCENE_VOICESTUDIO_URL || readManifest().presets.voicestudio.url || DEFAULT_URL).replace(/\/+$/, "");
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new VoiceError("VOICESTUDIO_URL", `"${raw}" isn't a valid VoiceStudio address.`, `Use ${DEFAULT_URL}.`);
  }
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname) || !/^https?:$/.test(u.protocol)) {
    throw new VoiceError("VOICESTUDIO_NOT_LOCAL", `Cutscene only uses VoiceStudio on this computer, not ${u.host}.`, `Run VoiceStudio locally (${DEFAULT_URL}).`);
  }
  return raw;
}

/** Is VoiceStudio running? Never throws. */
export async function voiceStudioHealth({ url, timeoutMs = 1200, fetchImpl = fetch }: StudioOptions = {}) {
  let base;
  try {
    base = voiceStudioUrl(url);
  } catch (err) {
    return { running: false, url: url || DEFAULT_URL, detail: (err as Error).message };
  }
  try {
    const res = await fetchImpl(`${base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { running: false, url: base, detail: `Answered with HTTP ${res.status}` };
    let info: unknown = {};
    try {
      info = await res.json();
    } catch {
      /* health may be plain text */
    }
    return { running: true, url: base, info };
  } catch {
    return { running: false, url: base, detail: "Not running (optional; Cutscene's own voices don't need it)." };
  }
}

export async function requireVoiceStudio(opts: StudioOptions = {}): Promise<string> {
  const h = await voiceStudioHealth(opts);
  if (!h.running) {
    throw new VoiceError("VOICESTUDIO_NOT_RUNNING", `VoiceStudio isn't running at ${h.url}.`, "Start the VoiceStudio app, or use Cutscene's own voices (`--model omnivoice`, or `--model kokoro` with nothing to install).");
  }
  return h.url;
}

async function failFrom(res: Response, what: string): Promise<never> {
  let body = "";
  try {
    body = (await res.text()).slice(0, 300);
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) throw new VoiceError("VOICESTUDIO_AUTH", `VoiceStudio refused ${what} (HTTP ${res.status}).`, "This VoiceStudio needs credentials; set them up in the app. Cutscene never disables its sign-in.");
  throw new VoiceError("VOICESTUDIO_FAILED", `VoiceStudio couldn't do ${what} (HTTP ${res.status}).`, body || "Check the VoiceStudio app for a missing model or a busy engine.");
}

/** The saved voices and engines VoiceStudio reports. */
export async function listVoices({ url, fetchImpl = fetch }: StudioOptions = {}): Promise<unknown> {
  const base = await requireVoiceStudio({ url, fetchImpl });
  const res = await fetchImpl(`${base}/v1/audio/voices`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) await failFrom(res, "listing voices");
  return res.json();
}

/**
 * Speak one line and save it as WAV.
 */
export async function speak(
  req: { text: string; out: string; voice?: string; instruct?: string | null; seed?: number; language?: string; engine?: string; numStep?: number },
  { url, fetchImpl = fetch, timeoutMs = 15 * 60 * 1000 }: StudioOptions = {},
): Promise<{ seconds: number }> {
  const base = await requireVoiceStudio({ url, fetchImpl });
  const body: Record<string, string | number> = { model: req.engine || "omnivoice", input: req.text, voice: req.voice || "default", response_format: "wav" };
  if (req.instruct) body.instruct = req.instruct;
  if (Number.isInteger(req.seed)) body.seed = req.seed!;
  if (req.language) body.language = req.language;
  if (req.numStep) body.num_step = req.numStep;
  const t0 = Date.now();
  const res = await fetchImpl(`${base}/v1/audio/speech`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) await failFrom(res, "speech");
  const buf = Buffer.from(await res.arrayBuffer());
  // an error page can arrive with status 200; only a real WAV counts
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") {
    throw new VoiceError("VOICESTUDIO_NOT_AUDIO", "VoiceStudio answered, but not with audio.", buf.toString("utf8", 0, Math.min(200, buf.length)));
  }
  writeFileSync(req.out, buf);
  return { seconds: (Date.now() - t0) / 1000 };
}

/** Transcribe a file with word timestamps; returns words in Cutscene's {w, start, end, p} shape. */
export async function transcribe(file: string, { url, language, fetchImpl = fetch, timeoutMs = 15 * 60 * 1000 }: StudioOptions & { language?: string } = {}): Promise<{ text: string; language?: string; words: WordTiming[] }> {
  const base = await requireVoiceStudio({ url, fetchImpl });
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)], { type: "audio/wav" }), basename(file));
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (language) form.append("language", language);
  const res = await fetchImpl(`${base}/v1/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) await failFrom(res, "transcription");
  const data = (await res.json()) as VerboseTranscript;
  return { text: data.text || "", language: data.language, words: wordsFromVerbose(data) };
}

/** OpenAI verbose_json -> [{w, start, end, p}] (VoiceStudio sends no word probability; p is omitted). */
export function wordsFromVerbose(data: VerboseTranscript | null | undefined): WordTiming[] {
  const src = Array.isArray(data?.words) && data.words.length ? data.words : (data?.segments || []).flatMap((s) => s.words || []);
  return src
    .map((w) => ({ w: String(w.word ?? w.text ?? "").trim(), start: Number(w.start), end: Number(w.end), ...(Number.isFinite(w.probability) ? { p: w.probability } : {}) }))
    .filter((w) => w.w && Number.isFinite(w.start) && Number.isFinite(w.end));
}
