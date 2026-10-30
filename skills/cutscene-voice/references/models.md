# Voice models in Cutscene

Everything runs on the user's computer. Models live in `~/.cutscene/voice/models/<model>/`, the
Python environment in `~/.cutscene/voice/venv/`, and nothing is put on PATH. `cutscene voice
status` shows what's installed; `cutscene voice setup --model <id>` adds a model after showing its
size and licence.

## At a glance

| | OmniVoice | VoxCPM2 | Kokoro | faster-whisper (checking) |
|---|---|---|---|---|
| What it does | design + clone + speak | design + clone + speak | speak with presets | transcribe, word timings |
| Licence of the weights | **CC-BY-NC-4.0 (non-commercial)**; its audio tokenizer: Boson Higgs Audio 2 Community License | Apache-2.0 | Apache-2.0 | MIT |
| Code licence | Apache-2.0 | Apache-2.0 | Apache-2.0 | MIT |
| Commercial videos | **No** | Yes | Yes | Yes |
| Languages | 600+ (best: English, Chinese) | 30, incl. English and Norwegian | English; a few presets in es, fr, it, ja, zh, hi, pt | 99 |
| Voice design | tags only (see below) | free text, e.g. "(young woman, warm)" | no (presets) | n/a |
| Cloning | yes, 3–10 s reference + its exact words | yes, reference clip (+ words) | no | n/a |
| Download | 3.27 GB (2.45 GB model + 0.81 GB audio tokenizer) | 4.96 GB + its Python packages | about 340 MB (engine cache) | 1.62 GB (fp16 file, run as int8) |
| Source | huggingface.co/k2-fsa/OmniVoice @ c5fdb5c | huggingface.co/openbmb/VoxCPM2 @ 32279ef | built into Cutscene's `tts` | huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo @ 0a363e9 |
| Status | installed and tested | **installs on demand**, not tested on this PC yet | uses the engine | installed and tested |

Exact revisions, file sizes and SHA-256 are pinned in `assets/manifest.json`; setup checks every
large file's SHA-256 and writes the result to `~/.cutscene/voice/lock.json`.

## Speed on the test PC

Intel i5-13420H (8 cores, 12 threads), 24 GB RAM, no GPU, Windows 11, PyTorch 2.11 CPU. Measured
with Cutscene's own commands (`cutscene voice benchmark` writes `~/.cutscene/voice/benchmarks.json`
on each user's computer; quote those numbers, not these):

| Step | Time |
|---|---|
| OmniVoice model load | 5–11 s per run (once per `speak`) |
| OmniVoice design, 16 steps, 1.8 s sample | 21–27 s |
| OmniVoice clone line, 16 steps (default) | about 16–20 s per second of speech: 46–68 s per line in real runs (2.9–4.1 s lines); benchmark 16.0 s per second |
| OmniVoice clone line, 32 steps (`--steps 32`) | 110–146 s for a 3 s line |
| OmniVoice `--fast` (int8), 16 steps | about 35 s for a 3 s line |
| Whisper load + check, per line | 5–8 s load, then 13–17 s per 3–4 s line (benchmark 6.1 s per second of audio) |
| Kokoro (built-in), per line | about 4 s per second of audio including engine start (12 s for a 3 s line) |

So a 10-line narration takes roughly 10–15 minutes with OmniVoice at the default quality. Say
so before starting, and suggest Kokoro for quick drafts.

`--fast` quantises OmniVoice's language model to int8 at load time. It is about twice as fast
but the take is different from the full-precision one, so a voice keeps one setting for all its
lines (Cutscene stores it in `voices.<speaker>.fast`).

The same seed gives the same audio: speaking a line twice with the same seed, reference and
settings produced bit-identical files on the test PC.

## OmniVoice design tags

Comma-separated, at most one per group:

- gender: `male`, `female`
- age: `child`, `teenager`, `young adult`, `middle-aged`, `elderly`
- pitch: `very low pitch`, `low pitch`, `moderate pitch`, `high pitch`, `very high pitch`
- style: `whisper`
- accent: `american accent`, `british accent`, `australian accent`, `canadian accent`,
  `indian accent`, `chinese accent`, `korean accent`, `japanese accent`, `russian accent`,
  `portuguese accent`

Everyday words are mapped for you ("woman" → female, "old" → elderly, "deep" → low pitch, "UK"
→ british accent). Anything else ("warm", "energetic") is refused with a list of what works; use
VoxCPM2 for free-text styles.

## Choosing

1. Is the video commercial (ads, client work, monetised channel)? Then **not OmniVoice**. Use
   VoxCPM2 (needs setup) or Kokoro.
2. Norwegian or another non-English language? VoxCPM2 (30 languages) or OmniVoice (non-commercial).
3. A specific person's voice? Clone, only with their permission.
4. Just a draft? Kokoro, seconds per line, nothing to download.
5. The user has VoiceStudio running and prefers it? Use `--model voicestudio`.

## Credits

- OmniVoice: k2-fsa (https://github.com/k2-fsa/OmniVoice), code Apache-2.0, weights CC-BY-NC-4.0.
  Its audio tokenizer: "Built with Higgs Materials licensed from Boson AI USA, Inc." (Boson Higgs
  Audio 2 Community License, based on the Meta Llama 3 Community License).
- VoxCPM2: OpenBMB (https://github.com/OpenBMB/VoxCPM), Apache-2.0.
- Kokoro-82M: hexgrad (https://github.com/hexgrad/kokoro), Apache-2.0.
- Whisper large-v3-turbo: OpenAI, MIT; faster-whisper and CTranslate2: SYSTRAN / OpenNMT, MIT.
