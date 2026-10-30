// Real run of `cutscene preview` against the installed engine. Skips when the engine isn't
// installed (CI without it stays green). Uses port 3092 so it doesn't touch a preview on 3002.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import http from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { engineCliPath, engineEnv } from "../../skills/cutscene/scripts/preview/engine.mjs";
import { pidAlive, readState } from "../../skills/cutscene/scripts/preview/state.mjs";

const PREVIEW = resolve(import.meta.dirname, "../../skills/cutscene/scripts/preview.mjs");
const CLI = engineCliPath();
const PORT = 3092;

/** The fields these tests read from `cutscene preview --json` (null when stdout isn't JSON). */
interface PreviewJson {
  ok: boolean;
  pid: number;
  previews: { port: number }[];
  stopped: { port: number; stopped: boolean }[];
  [key: string]: unknown;
}

/** Options for `request`. */
interface RequestOptions {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** What `request` resolves with. */
interface Reply {
  status: number | undefined;
  body: string;
  headers: IncomingHttpHeaders;
}

function run(args: string[]) {
  const r = spawnSync(process.execPath, [PREVIEW, ...args], { encoding: "utf8", windowsHide: true, timeout: 180_000 });
  return { code: r.status, out: r.stdout, err: r.stderr, json: safeJson(r.stdout) as PreviewJson };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function request({ method = "GET", path = "/", headers = {}, body }: RequestOptions = {}): Promise<Reply> {
  return new Promise((resolveReq, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORT, method, path, headers: { host: `127.0.0.1:${PORT}`, ...headers }, agent: false },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (data += c));
        res.on("end", () => resolveReq({ status: res.statusCode, body: data, headers: res.headers }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe.skipIf(!CLI)("the pinned Studio still has what the Cutscene theme targets", () => {
  // Re-checked on every engine bump: if one of these disappears, theme.css or frontdoor.mjs
  // needs a new selector, or HyperFrames chrome would show through.
  it("finds every selector and string the front door relies on", () => {
    const studioDir = join(CLI!, "..", "studio");
    const html = readFileSync(join(studioDir, "index.html"), "utf8");
    expect(html).toMatch(/<title>[^<]*<\/title>/);
    expect(html).toContain('rel="icon"');
    expect(html).toContain("hf-studio-ui-preferences");
    const assets = readdirSync(join(studioDir, "assets"));
    const js = assets.filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(studioDir, "assets", f), "utf8")).join("\n");
    const css = assets.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(studioDir, "assets", f), "utf8")).join("\n");
    for (const needle of [
      '"aria-label":"Hyperframes"', // header logo
      "Send feedback to the HyperFrames team", // feedback survey
      '"data-testid":"header-open-in-desktop"', // desktop-app button
      "hf-framey-trigger",
      "hf-loader-mark",
      "hf-topology-seal",
      "/api/open-in-desktop",
    ]) {
      expect(js, needle).toContain(needle);
    }
    for (const token of ["--color-bg-0", "--color-surface", "--color-accent", "--color-text-0", "--timeline-accent", "--color-brand-gradient-from", "hf-loader-progress__fill"]) {
      expect(css, token).toContain(token);
    }
  });
});

describe.skipIf(!CLI)("cutscene preview with the real engine", () => {
  let tmp: string;
  let project: string;
  let started: PreviewJson;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "cs-preview-int-"));
    project = join(tmp, "demo");
    const init = spawnSync(process.execPath, [CLI!, "init", project, "--non-interactive", "--example", "blank"], {
      encoding: "utf8",
      windowsHide: true,
      env: engineEnv(),
      timeout: 120_000,
    });
    if (!existsSync(join(project, "index.html"))) throw new Error(`engine init failed: ${init.stderr || init.stdout}`);
    run(["--stop", "--port", String(PORT), "--json"]);
  });

  afterAll(() => {
    run(["--stop", "--port", String(PORT), "--json"]);
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it("starts in the background and serves the Cutscene-branded Studio", async () => {
    const r = run([project, "--background", "--no-open", "--json", "--port", String(PORT)]);
    expect(r.json, r.err || r.out).toMatchObject({ ok: true, url: `http://127.0.0.1:${PORT}/#project/demo`, port: PORT });
    expect(Number.isInteger(r.json.pid)).toBe(true);
    started = r.json;

    const page = await request({ path: "/" });
    expect(page.status).toBe(200);
    expect(page.body).toContain("<title>Cutscene Studio</title>");
    expect(page.body).toContain("/__cutscene/theme.css");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'self'");

    const status = run(["--status", "--port", String(PORT), "--json"]);
    expect(status.json).toMatchObject({ ok: true, running: true, pid: started.pid });
  });

  it("refuses a foreign Host", async () => {
    const res = await request({ headers: { host: `evil.example:${PORT}` } });
    expect(res.status).toBe(403);
  });

  it("refuses a cross-origin write and lets a same-origin write reach the Studio", async () => {
    const evil = await request({
      method: "POST",
      path: "/api/projects/demo/files/evil.txt",
      headers: { origin: "https://evil.example", "content-type": "text/plain" },
      body: "pwned",
    });
    expect(evil.status).toBe(403);
    expect(existsSync(join(project, "evil.txt"))).toBe(false);

    const good = await request({
      method: "POST",
      path: "/api/projects/demo/files/hello.txt",
      headers: { origin: `http://127.0.0.1:${PORT}`, "sec-fetch-site": "same-origin", "content-type": "text/plain" },
      body: "hello",
    });
    expect(good.status).toBeGreaterThanOrEqual(200);
    expect(good.status).toBeLessThan(300);
    expect(existsSync(join(project, "hello.txt"))).toBe(true);
  });

  it("--stop leaves no processes behind", async () => {
    const list = run(["--list", "--json"]);
    const mine = list.json.previews.find((p) => p.port === PORT);
    expect(mine).toBeDefined();
    const enginePid = readState(PORT)!.enginePid;
    expect(pidAlive(enginePid)).toBe(true);
    const r = run(["--stop", "--port", String(PORT), "--json"]);
    expect(r.json).toMatchObject({ ok: true });
    expect(r.json.stopped[0]).toMatchObject({ port: PORT, stopped: true });
    expect(pidAlive(started.pid)).toBe(false);
    expect(pidAlive(enginePid)).toBe(false);
    expect(readState(PORT)).toBeNull();
    await expect(request({ path: "/" })).rejects.toThrow();
    const after = run(["--status", "--port", String(PORT), "--json"]);
    expect(after.json).toMatchObject({ ok: true, running: false });
  });
});
