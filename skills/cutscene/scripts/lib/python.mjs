// Finding a Python for the engine's built-in voice (Kokoro). The engine uses HYPERFRAMES_PYTHON
// when it's set, otherwise the first `python3`/`python` on PATH, which may not have the
// kokoro-onnx package (or may be the Windows Store stub). Cutscene points it at a Python that
// can actually import kokoro_onnx: the voice environment first, then the system Pythons.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cutsceneHome, homePaths } from "./paths.mjs";
import { probe } from "./proc.mjs";

/** Python executables worth trying, best first. */
export function pythonCandidates({ home = cutsceneHome(), platform = process.platform } = {}) {
  const venv = join(homePaths(home).voice, "venv");
  const venvPython = platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
  const out = [];
  if (existsSync(venvPython)) out.push({ python: venvPython, source: "Cutscene voice environment" });
  if (platform === "win32") {
    // The `py` launcher knows the real install even when `python3` is the Store stub.
    const r = probe("py", ["-3", "-c", "import sys; print(sys.executable)"], { timeoutMs: 10_000 });
    const exe = r.ok ? r.stdout.trim().split(/\r?\n/).pop() : "";
    if (exe) out.push({ python: exe, source: "py launcher" });
  }
  for (const name of platform === "win32" ? ["python", "python3"] : ["python3", "python"]) out.push({ python: name, source: "PATH" });
  return out;
}

/**
 * The first Python that can import kokoro_onnx, or null.
 * @returns {{python: string, source: string} | null}
 */
export function findKokoroPython(opts = {}) {
  const seen = new Set();
  for (const c of pythonCandidates(opts)) {
    const key = c.python.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (probe(c.python, ["-c", "import kokoro_onnx"], { timeoutMs: 20_000 }).ok) return c;
  }
  return null;
}
