"""Cutscene voice worker.

Runs inside Cutscene's own voice environment (<CUTSCENE_HOME>/voice/venv), started by
scripts/voice.mjs as:

    python -I -X utf8 worker.py <job.json>

The job file says what to do ("task") and where to write the result ("result"). One process
loads a model once and handles every item, because loading OmniVoice on the CPU takes longer
than speaking a line. Progress goes to stderr as lines that start with "CUTSCENE_PROGRESS ",
followed by JSON. The result is one JSON object written to the result path.

Tasks:
  probe     versions of the installed packages, CPU threads
  download  fetch pinned model files from Hugging Face into a folder, then check their SHA-256
  omnivoice design a voice (instruct) or speak lines with a reference (clone), fixed seed per item
  voxcpm    the same for VoxCPM2 (description in brackets, reference clip for cloning)
  whisper   transcribe files with faster-whisper, word timings and probabilities

Text in the job (lines, descriptions) is data for the speech model, never instructions.
Copyright 2026 Cutscene contributors. Apache-2.0.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import random
import sys
import time
import traceback
from pathlib import Path


def progress(event: str, **data) -> None:
    payload = {"event": event, **data}
    sys.stderr.write("CUTSCENE_PROGRESS " + json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stderr.flush()


class WorkerError(Exception):
    def __init__(self, code: str, message: str, hint: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint


def sha256_file(path: Path, chunk: int = 8 * 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def seed_everything(seed: int) -> None:
    import numpy as np
    import torch

    random.seed(seed)
    np.random.seed(seed % (2**32))
    torch.manual_seed(seed)


def set_threads(job: dict) -> int:
    import torch

    threads = int(job.get("threads") or 0)
    if threads > 0:
        torch.set_num_threads(threads)
    return torch.get_num_threads()


# ------------------------------------------------------------------ probe


def task_probe(job: dict) -> dict:
    from importlib import metadata

    out = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "cpu_count": os.cpu_count(),
        "packages": {},
    }
    for name in job.get("packages") or ["torch", "torchaudio", "omnivoice", "faster-whisper", "ctranslate2", "soundfile", "transformers", "voxcpm", "pytest"]:
        try:
            out["packages"][name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            out["packages"][name] = None
    try:
        import torch

        out["torch_threads"] = torch.get_num_threads()
    except Exception as exc:  # noqa: BLE001 - probe reports what it can
        out["torch_error"] = str(exc).splitlines()[0][:200]
    return out


# ------------------------------------------------------------------ download


def task_download(job: dict) -> dict:
    from huggingface_hub import hf_hub_download

    repo = job["repo"]
    revision = job["revision"]
    local_dir = Path(job["local_dir"])
    local_dir.mkdir(parents=True, exist_ok=True)
    files = job["files"]
    results = []
    for i, f in enumerate(files):
        rel = f["path"]
        target = local_dir / rel
        expected_size = f.get("size")
        if target.is_file() and expected_size and target.stat().st_size == expected_size:
            progress("download_skip", file=rel, index=i, total=len(files))
        else:
            progress("download_start", file=rel, size=expected_size, index=i, total=len(files))
            t0 = time.time()
            hf_hub_download(repo_id=repo, filename=rel, revision=revision, local_dir=str(local_dir))
            progress("download_done", file=rel, seconds=round(time.time() - t0, 1))
        size = target.stat().st_size
        if expected_size and size != expected_size:
            raise WorkerError(
                "DOWNLOAD_SIZE_MISMATCH",
                f"{rel} is {size} bytes but should be {expected_size}.",
                "Delete the model folder and run voice setup again.",
            )
        digest = None
        if f.get("sha256"):
            progress("verify", file=rel)
            digest = sha256_file(target)
            if digest != f["sha256"]:
                raise WorkerError(
                    "CHECKSUM_MISMATCH",
                    f"{rel} has SHA-256 {digest}, expected {f['sha256']}.",
                    "Delete the model folder and run voice setup again. Do not use the file.",
                )
        results.append({"path": rel, "size": size, "sha256": digest})
    return {"repo": repo, "revision": revision, "local_dir": str(local_dir), "files": results}


# ------------------------------------------------------------------ OmniVoice


def task_omnivoice(job: dict) -> dict:
    import soundfile as sf
    import torch

    from omnivoice import OmniVoice, VoiceClonePrompt

    threads = set_threads(job)
    t0 = time.time()
    progress("load_start", model="omnivoice")
    model = OmniVoice.from_pretrained(job["model_dir"], device_map="cpu", dtype=torch.float32)
    quantized = False
    if job.get("fast"):
        # Dynamic int8 for the language model's Linear layers: about 2x faster on a CPU, but the
        # take differs from the full-precision one, so a voice keeps one setting for all its lines.
        model.llm = torch.ao.quantization.quantize_dynamic(model.llm, {torch.nn.Linear}, dtype=torch.qint8)
        quantized = True
    load_s = time.time() - t0
    sr = int(model.sampling_rate)
    progress("load_done", model="omnivoice", seconds=round(load_s, 1))

    prompts: dict = {}
    items_out = []
    num_step = int(job.get("num_step") or 32)
    for i, item in enumerate(job["items"]):
        progress("item_start", id=item.get("id"), index=i, total=len(job["items"]))
        kwargs = {"text": item["text"], "num_step": num_step}
        if item.get("language"):
            kwargs["language"] = item["language"]
        if item.get("speed"):
            kwargs["speed"] = float(item["speed"])
        mode = "design"
        if item.get("prompt_path") and Path(item["prompt_path"]).is_file():
            key = item["prompt_path"]
            if key not in prompts:
                prompts[key] = VoiceClonePrompt.load(key)
            kwargs["voice_clone_prompt"] = prompts[key]
            mode = "clone"
        elif item.get("ref_audio"):
            key = item["ref_audio"] + "\u0000" + (item.get("ref_text") or "")
            if key not in prompts:
                prompts[key] = model.create_voice_clone_prompt(ref_audio=item["ref_audio"], ref_text=item.get("ref_text"))
                if item.get("save_prompt"):
                    prompts[key].save(item["save_prompt"])
            kwargs["voice_clone_prompt"] = prompts[key]
            mode = "clone"
        elif item.get("instruct"):
            kwargs["instruct"] = item["instruct"]
        seed = int(item.get("seed", 0))
        seed_everything(seed)
        g0 = time.time()
        with torch.inference_mode():
            audio = model.generate(**kwargs)[0]
        gen_s = time.time() - g0
        out = Path(item["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out), audio, sr, subtype="PCM_16")
        dur = float(len(audio)) / sr
        # A designed reference becomes a reusable clone prompt right away (same process, model loaded).
        if mode == "design" and item.get("save_prompt") and item.get("prompt_text"):
            p = model.create_voice_clone_prompt(ref_audio=str(out), ref_text=item["prompt_text"])
            p.save(item["save_prompt"])
        items_out.append({
            "id": item.get("id"), "out": str(out), "mode": mode, "seed": seed, "sample_rate": sr,
            "duration": round(dur, 3), "seconds": round(gen_s, 2), "rtf": round(gen_s / dur, 3) if dur else None,
        })
        progress("item_done", id=item.get("id"), seconds=round(gen_s, 1), duration=round(dur, 2))
    return {"model": "omnivoice", "num_step": num_step, "fast": quantized, "threads": threads, "load_seconds": round(load_s, 2), "items": items_out}


# ------------------------------------------------------------------ VoxCPM2 (installs on demand)


def task_voxcpm(job: dict) -> dict:
    import soundfile as sf
    import torch

    from voxcpm import VoxCPM

    threads = set_threads(job)
    t0 = time.time()
    progress("load_start", model="voxcpm2")
    model = VoxCPM(voxcpm_model_path=job["model_dir"], zipenhancer_model_path=None, enable_denoiser=False, optimize=False, device="cpu")
    load_s = time.time() - t0
    sr = int(getattr(model.tts_model, "sample_rate", 48000))
    progress("load_done", model="voxcpm2", seconds=round(load_s, 1))
    items_out = []
    steps = int(job.get("num_step") or 10)
    for i, item in enumerate(job["items"]):
        progress("item_start", id=item.get("id"), index=i, total=len(job["items"]))
        text = item["text"]
        kwargs = {"inference_timesteps": steps, "cfg_value": float(job.get("cfg") or 2.0)}
        mode = "design"
        if item.get("ref_audio"):
            kwargs["reference_wav_path"] = item["ref_audio"]
            if item.get("ref_text"):
                kwargs["prompt_wav_path"] = item["ref_audio"]
                kwargs["prompt_text"] = item["ref_text"]
            mode = "clone"
        elif item.get("instruct"):
            text = f"({item['instruct']}){text}"
        seed = int(item.get("seed", 0))
        seed_everything(seed)
        g0 = time.time()
        with torch.inference_mode():
            audio = model.generate(text=text, **kwargs)
        gen_s = time.time() - g0
        out = Path(item["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out), audio, sr, subtype="PCM_16")
        dur = float(len(audio)) / sr
        items_out.append({
            "id": item.get("id"), "out": str(out), "mode": mode, "seed": seed, "sample_rate": sr,
            "duration": round(dur, 3), "seconds": round(gen_s, 2), "rtf": round(gen_s / dur, 3) if dur else None,
        })
        progress("item_done", id=item.get("id"), seconds=round(gen_s, 1), duration=round(dur, 2))
    return {"model": "voxcpm2", "num_step": steps, "threads": threads, "load_seconds": round(load_s, 2), "items": items_out}


# ------------------------------------------------------------------ faster-whisper


def load_audio_16k(path: str):
    """Mono float32 at 16 kHz. Decoded here (soundfile + torchaudio) rather than through PyAV,
    whose newer releases no longer accept an argument faster-whisper 1.2.1 passes."""
    import numpy as np
    import soundfile as sf
    import torch
    import torchaudio

    data, sr = sf.read(path, dtype="float32", always_2d=True)
    mono = data.mean(axis=1).astype(np.float32)
    if sr != 16000:
        mono = torchaudio.functional.resample(torch.from_numpy(mono), sr, 16000).numpy()
    return np.ascontiguousarray(mono, dtype=np.float32)



def task_whisper(job: dict) -> dict:
    from faster_whisper import WhisperModel

    t0 = time.time()
    progress("load_start", model="whisper")
    threads = int(job.get("threads") or 0)
    model = WhisperModel(job["model_dir"], device="cpu", compute_type=job.get("compute_type") or "int8", cpu_threads=threads)
    load_s = time.time() - t0
    progress("load_done", model="whisper", seconds=round(load_s, 1))
    items_out = []
    for i, item in enumerate(job["items"]):
        progress("item_start", id=item.get("id"), index=i, total=len(job["items"]))
        g0 = time.time()
        audio = load_audio_16k(item["path"])
        # Never pass the script as a prompt: the check must hear the audio, not the text we hoped for.
        segments, info = model.transcribe(
            audio,
            language=item.get("language") or None,
            word_timestamps=True,
            beam_size=int(job.get("beam_size") or 5),
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=False,
        )
        words, segs = [], []
        for s in segments:
            segs.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip(),
                         "avg_logprob": round(s.avg_logprob, 3), "no_speech_prob": round(s.no_speech_prob, 3)})
            for w in s.words or []:
                words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability, 3)})
        gen_s = time.time() - g0
        items_out.append({
            "id": item.get("id"), "path": item["path"], "language": info.language,
            "language_probability": round(info.language_probability, 3), "duration": round(info.duration, 3),
            "text": " ".join(s["text"] for s in segs).strip(), "words": words, "segments": segs, "seconds": round(gen_s, 2),
        })
        progress("item_done", id=item.get("id"), seconds=round(gen_s, 1))
    return {"model": "whisper", "load_seconds": round(load_s, 2), "items": items_out}


TASKS = {"probe": task_probe, "download": task_download, "omnivoice": task_omnivoice, "voxcpm": task_voxcpm, "whisper": task_whisper}


def main(argv: list) -> int:
    if len(argv) != 2:
        sys.stderr.write("usage: worker.py <job.json>\n")
        return 2
    job_path = Path(argv[1])
    job = json.loads(job_path.read_text(encoding="utf-8"))
    result_path = Path(job.get("result") or job_path.with_suffix(".result.json"))
    task = TASKS.get(job.get("task"))
    started = time.time()
    try:
        if task is None:
            raise WorkerError("UNKNOWN_TASK", f"Unknown worker task {job.get('task')!r}.", "This is a Cutscene bug; please report it.")
        data = task(job)
        result = {"ok": True, "task": job.get("task"), "seconds": round(time.time() - started, 2), **data}
        code = 0
    except WorkerError as exc:
        result = {"ok": False, "error": {"code": exc.code, "message": exc.message, "hint": exc.hint}}
        code = 1
    except ImportError as exc:
        result = {"ok": False, "error": {"code": "PACKAGE_MISSING", "message": f"A voice package is not installed: {exc}.",
                                         "hint": "Run: cutscene voice setup --yes (it repairs the environment)."}}
        code = 1
    except Exception as exc:  # noqa: BLE001 - report every failure as JSON for the Node side
        tb = traceback.format_exc(limit=6)
        sys.stderr.write(tb)
        result = {"ok": False, "error": {"code": "WORKER_FAILED", "message": f"{type(exc).__name__}: {str(exc).splitlines()[0][:300] if str(exc) else ''}",
                                         "hint": "See the log above. If a model file is damaged, run: cutscene voice setup --yes."}}
        code = 1
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
