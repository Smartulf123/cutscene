import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ageDays, checkPins, classify, collectPins, isExactVersion, type PinResult } from "../../tools/check-pin-ages.mjs";
import { cleanup, tempDir } from "./helpers.ts";

let root: string;
const write = (rel: string, data: unknown) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2));
};
const NOW = new Date("2026-10-29T19:00:00Z");

/** The part of a fetch Response the pin checker reads. */
interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
type FakeFetch = (url: string, opts?: unknown) => Promise<FakeResponse>;

/** A fake registry: answers from a table and records the URLs asked for. */
function fakeFetch(table: Record<string, unknown>) {
  const asked: string[] = [];
  const impl: FakeFetch = async (url) => {
    asked.push(url);
    const hit = Object.entries(table).find(([k]) => url.includes(k));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => hit[1] };
  };
  return { impl, asked };
}

beforeEach(() => {
  root = tempDir();
  write("skills/cutscene/engine.json", { hyperframes: "0.8.162" });
  write("package.json", { devDependencies: { vitest: "4.1.12" } });
  write("skills/cutscene-voice/assets/manifest.json", {
    version: 1,
    pins: [
      { name: "torch", version: "2.9.1", url: "https://download.pytorch.org/whl/cpu/torch-2.9.1.whl", source: "pypi" },
      { name: "omnivoice", version: "abc123", url: "https://huggingface.co/k2-fsa/OmniVoice/resolve/abc123/model.safetensors", published: "2026-09-01" },
      { name: "studio-tool", version: "5.2.2", url: "https://downloads.example.org/release/studio-tool-5.2.2.zip", published: "2026-10-25" },
    ],
  });
  write(".github/workflows/ci.yml", "steps:\n  - uses: actions/checkout@v7.0.1\n  - run: python -m pip install pytest==9.1.1 -r requirements.txt\n");
});
afterEach(() => cleanup(root));

describe("collectPins", () => {
  it("reads the engine, package.json, manifests and workflows", () => {
    const pins = collectPins(root);
    const ids = pins.map((p: { kind: string; name: string; version: string }) => `${p.kind}:${p.name}@${p.version}`);
    expect(ids).toEqual([
      "npm:hyperframes@0.8.162",
      "npm:vitest@4.1.12",
      "pypi:torch@2.9.1",
      "huggingface:omnivoice@abc123",
      "url:studio-tool@5.2.2",
      "github:actions/checkout@v7.0.1",
      "pypi:pytest@9.1.1",
    ]);
  });

  it("knows exact versions from ranges and tags", () => {
    for (const v of ["1.2.3", "0.8.162", "v7.0.1", "5.2.2-lts", "abc123"]) expect(isExactVersion(v), v).toBe(true);
    for (const v of ["^1.2.3", "~1.2", "latest", ">=1", "1.x", "*", "", "1.2.3 || 2"]) expect(isExactVersion(v), v).toBe(false);
  });

  it("classifies download URLs", () => {
    expect(classify({ url: "https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.0.1.tgz" })).toEqual({ kind: "npm", package: "@mediapipe/tasks-vision" });
    expect(classify({ url: "https://github.com/WyattBlue/auto-editor/releases/download/31.7.2/a.exe" })).toEqual({ kind: "github", repo: "WyattBlue/auto-editor", tag: "31.7.2" });
    expect(classify({ url: "https://huggingface.co/datasets/o/r/resolve/main/x" })).toMatchObject({ kind: "huggingface", type: "datasets", repo: "o/r", revision: "main" });
  });
});

describe("checkPins", () => {
  it("passes old releases and fails new ones", async () => {
    const { impl, asked } = fakeFetch({
      "registry.npmjs.org/hyperframes": { time: { "0.8.162": "2026-10-15T12:23:35Z" } },
      "registry.npmjs.org/vitest": { time: { "4.1.12": "2026-10-20T00:00:00Z" } },
      "pypi.org/pypi/torch/2.9.1": { urls: [{ upload_time_iso_8601: "2026-08-01T00:00:00Z" }] },
      "huggingface.co/api/models/k2-fsa/OmniVoice/revision/abc123": { lastModified: "2026-09-02T00:00:00Z" },
      "api.github.com/repos/actions/checkout/releases/tags/v7.0.1": { published_at: "2026-07-20T15:10:05Z" },
      "pypi.org/pypi/pytest/9.1.1": { urls: [{ upload_time_iso_8601: "2026-06-19T10:58:31Z" }] },
    });
    const report = await checkPins({ root, now: NOW, fetchImpl: impl, env: {} });
    const status = Object.fromEntries(report.results.map((r: PinResult) => [r.name, r.status]));
    expect(status).toEqual({ hyperframes: "ok", vitest: "too-new", torch: "ok", omnivoice: "ok", "studio-tool": "too-new", "actions/checkout": "ok", pytest: "ok" });
    expect(report.ok).toBe(false);
    expect(report.results.find((r: PinResult) => r.name === "studio-tool")!.from).toBe("recorded");
    expect(report.results.find((r: PinResult) => r.name === "vitest")!.message).toMatch(/9 days ago/);
    expect(asked.every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("rejects unpinned versions", async () => {
    write("package.json", { devDependencies: { vitest: "^4.1.12" } });
    const report = await checkPins({ root, now: NOW, offline: true });
    expect(report.results.find((r: PinResult) => r.name === "vitest")!.status).toBe("unpinned");
    expect(report.ok).toBe(false);
  });

  it("offline mode uses only recorded dates and never touches the network", async () => {
    const { impl, asked } = fakeFetch({});
    const report = await checkPins({ root, now: NOW, offline: true, fetchImpl: impl });
    expect(asked).toEqual([]);
    const byName = Object.fromEntries(report.results.map((r: PinResult) => [r.name, r]));
    expect(byName.omnivoice.status).toBe("ok");
    expect(byName["studio-tool"].status).toBe("too-new");
    expect(byName.hyperframes.status).toBe("unknown");
    // unknown is a warning unless --strict
    write("skills/cutscene-voice/assets/manifest.json", { pins: [] });
    expect((await checkPins({ root, now: NOW, offline: true })).ok).toBe(true);
    expect((await checkPins({ root, now: NOW, offline: true, strict: true })).ok).toBe(false);
  });

  it("reports a registry that can't be reached as 'could not check', not as an age failure", async () => {
    write("skills/cutscene-voice/assets/manifest.json", { pins: [{ name: "omnivoice", version: "abc123", url: "https://huggingface.co/k2-fsa/OmniVoice/resolve/abc123/model.safetensors", published: "2026-09-01" }] });
    let calls = 0;
    const down = async () => {
      calls++;
      throw new Error("getaddrinfo ENOTFOUND");
    };
    for (const strict of [false, true]) {
      const report = await checkPins({ root, now: NOW, env: {}, strict, retryDelayMs: 0, fetchImpl: down });
      const engine = report.results.find((r: PinResult) => r.name === "hyperframes")!;
      expect(engine.status).toBe("network");
      expect(engine.message).toMatch(/not an age problem/);
      expect(engine.message).toMatch(/--offline/);
      expect(report.unchecked).toBe(4);
      // A recorded date is used when the lookup fails, and says so.
      const ov = report.results.find((r: PinResult) => r.name === "omnivoice")!;
      expect(ov.status).toBe("ok");
      expect(ov.note).toMatch(/recorded date/);
      // Network trouble alone never fails the run, even with --strict.
      expect(report.ok).toBe(true);
    }
    expect(calls).toBeGreaterThanOrEqual(3 * 4); // every lookup was tried 3 times
  });

  it("retries a flaky lookup and then passes (the pytest 9.1.1 case)", async () => {
    write("skills/cutscene-voice/assets/manifest.json", { pins: [] });
    const { impl } = fakeFetch({
      "registry.npmjs.org/hyperframes": { time: { "0.8.162": "2026-10-15T12:23:35Z" } },
      "registry.npmjs.org/vitest": { time: { "4.1.12": "2026-09-20T00:00:00Z" } },
      "api.github.com/repos/actions/checkout/releases/tags/v7.0.1": { published_at: "2026-07-20T15:10:05Z" },
      "pypi.org/pypi/pytest/9.1.1": { urls: [{ upload_time_iso_8601: "2026-06-19T10:58:31Z" }] },
    });
    const seen = new Map<string, number>();
    const flaky = async (url: string, opts?: unknown) => {
      const n = (seen.get(url) || 0) + 1;
      seen.set(url, n);
      if (url.includes("pypi.org") && n === 1) throw new Error("socket hang up");
      if (url.includes("pypi.org") && n === 2) return { ok: false, status: 503, json: async () => ({}) };
      return impl(url, opts);
    };
    const report = await checkPins({ root, now: NOW, env: {}, strict: true, retryDelayMs: 0, fetchImpl: flaky });
    expect(report.results.find((r: PinResult) => r.name === "pytest")!.status).toBe("ok");
    expect(report.ok).toBe(true);
    expect(report.unchecked).toBe(0);
  });

  it("does not retry a plain 'not found' and still fails a real too-new pin when the network is flaky", async () => {
    const { impl, asked } = fakeFetch({ "registry.npmjs.org/vitest": { time: { "4.1.12": "2026-10-25T00:00:00Z" } } });
    const report = await checkPins({ root, now: NOW, env: {}, retryDelayMs: 0, fetchImpl: impl });
    expect(asked.filter((u) => u.includes("pypi.org/pypi/pytest")).length).toBe(1);
    expect(report.results.find((r: PinResult) => r.name === "vitest")!.status).toBe("too-new");
    expect(report.ok).toBe(false);
  });

  it("counts days exactly", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    expect(ageDays("2026-10-15T12:00:00Z", now)).toBe(14);
    expect(ageDays("2026-10-15T12:00:01Z", now)).toBeLessThan(14);
  });
});
