// Unit tests for the preview front door, against a fake Studio (no engine needed).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import {
  checkRequest,
  downstreamHeaders,
  isApiPath,
  securityHeaders,
  rewriteStudioHtml,
  isStudioDocument,
  createFrontDoor,
  STUDIO_TITLE,
} from "../../skills/cutscene/scripts/preview/frontdoor.mjs";

const STOCK_HTML = `<!doctype html>
<html lang="en">
  <head><script>window.__HF_CLI_TELEMETRY_DISABLED=true;</script>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>HyperFrames Studio</title>
    <script>/* theme pre-paint */</script>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

const COMPOSITION_HTML = `<!doctype html><html><head><title>My video</title></head><body>clip</body></html>`;

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
  headers: IncomingHttpHeaders;
  body: string;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

/** Low-level request so we control every header (fetch won't let us set Host or Origin freely). */
function request(port: number, { method = "GET", path = "/", headers = {}, body }: RequestOptions = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers }, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("checkRequest (pure rules)", () => {
  const P = 3002;
  const req = (method: string, headers: Record<string, string>, url = "/") =>({ method, url, headers: { host: `127.0.0.1:${P}`, ...headers } });

  it("refuses a foreign Host (DNS rebinding)", () => {
    expect(checkRequest({ method: "GET", url: "/", headers: { host: "evil.example:3002" } }, P)).toMatchObject({ ok: false, status: 403, reason: "host" });
    expect(checkRequest({ method: "GET", url: "/", headers: { host: "127.0.0.1:9999" } }, P).ok).toBe(false);
    expect(checkRequest({ method: "GET", url: "/", headers: {} }, P).ok).toBe(false);
    expect(checkRequest({ method: "GET", url: "/", headers: { host: "192.168.1.5:3002" } }, P).ok).toBe(false);
  });

  it("accepts both loopback names", () => {
    expect(checkRequest({ method: "GET", url: "/", headers: { host: "localhost:3002" } }, P).ok).toBe(true);
    expect(checkRequest({ method: "GET", url: "/", headers: { host: "127.0.0.1:3002" } }, P).ok).toBe(true);
  });

  it("refuses writes from another origin", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(checkRequest(req(m, { origin: "https://evil.example" }), P)).toMatchObject({ ok: false, reason: "origin" });
    }
    expect(checkRequest(req("POST", { origin: "null" }), P).ok).toBe(false);
    expect(checkRequest(req("POST", { origin: "http://127.0.0.1:8080" }), P).ok).toBe(false);
  });

  it("refuses a browser write marked cross-site even without Origin", () => {
    expect(checkRequest(req("POST", { "sec-fetch-site": "cross-site" }), P).ok).toBe(false);
    expect(checkRequest(req("POST", { "sec-fetch-site": "same-site" }), P).ok).toBe(false);
    expect(checkRequest(req("POST", { origin: `http://127.0.0.1:${P}`, "sec-fetch-site": "cross-site" }), P).ok).toBe(false);
  });

  it("allows same-origin writes", () => {
    expect(checkRequest(req("POST", { origin: `http://127.0.0.1:${P}`, "sec-fetch-site": "same-origin" }), P).ok).toBe(true);
    expect(checkRequest(req("PUT", { origin: `http://localhost:${P}` }), P).ok).toBe(true);
    expect(checkRequest(req("DELETE", { "sec-fetch-site": "same-origin" }), P).ok).toBe(true);
    expect(checkRequest(req("POST", { "sec-fetch-site": "none" }), P).ok).toBe(true);
  });

  it("lets local programs (no browser headers) write", () => {
    expect(checkRequest(req("POST", {}), P).ok).toBe(true);
  });

  it("allows GET from anywhere on a loopback Host, but not cross-site reads of /api", () => {
    expect(checkRequest(req("GET", { origin: "https://evil.example" }), P).ok).toBe(true);
    expect(checkRequest(req("GET", { "sec-fetch-site": "cross-site" }), P).ok).toBe(true);
    expect(checkRequest(req("GET", { "sec-fetch-site": "cross-site" }, "/api/projects"), P).ok).toBe(false);
    expect(checkRequest(req("GET", { "sec-fetch-site": "same-origin" }, "/api/projects"), P).ok).toBe(true);
  });

  it("refuses Host look-alikes", () => {
    for (const host of ["127.0.0.1:3002.evil.example", "localhost.evil.example:3002", "127.0.0.2:3002", "[::1]:3002", "0.0.0.0:3002"]) {
      expect(checkRequest({ method: "GET", url: "/", headers: { host } }, P).ok, host).toBe(false);
    }
  });

  it("spots the API however its path is spelled", () => {
    for (const p of ["/api", "/api/projects", "//api/projects", "/%61pi/projects", "/API/projects", "/./api/x"]) expect(isApiPath(p), p).toBe(true);
    for (const p of ["/", "/apiary", "/assets/api.js", "/%zz"]) expect(isApiPath(p), p).toBe(false);
    expect(checkRequest(req("GET", { "sec-fetch-site": "cross-site" }, "/%61pi/projects"), P).ok).toBe(false);
  });

  it("drops CORS grants and refuses framing on every reply", () => {
    const out = downstreamHeaders({ "access-control-allow-origin": "*", "access-control-allow-credentials": "true", "content-type": "text/html", connection: "keep-alive" });
    expect(out).toEqual({ "content-type": "text/html" });
    expect(securityHeaders()).toMatchObject({ "content-security-policy": "frame-ancestors 'self'", "x-frame-options": "SAMEORIGIN" });
  });

  it("treats WebSocket upgrades like writes", () => {
    expect(checkRequest(req("GET", { origin: "https://evil.example" }), P, { upgrade: true }).ok).toBe(false);
    expect(checkRequest(req("GET", { origin: `http://127.0.0.1:${P}` }), P, { upgrade: true }).ok).toBe(true);
  });
});

describe("rewriteStudioHtml", () => {
  const out = rewriteStudioHtml(STOCK_HTML);

  it("sets the Cutscene title", () => {
    expect(out).toContain(`<title>${STUDIO_TITLE}</title>`);
    expect(out).not.toContain("HyperFrames Studio");
  });

  it("replaces the favicon", () => {
    expect(out).not.toContain('href="/favicon.svg"');
    expect(out).toContain('href="/__cutscene/favicon.svg"');
    expect(out.match(/rel="icon"/g)).toHaveLength(1);
  });

  it("adds the theme after the Studio stylesheet and a dark default before its theme script", () => {
    const theme = out.indexOf('href="/__cutscene/theme.css"');
    expect(theme).toBeGreaterThan(out.indexOf("/assets/index-abc.css"));
    expect(theme).toBeLessThan(out.indexOf("</head>"));
    expect(out.indexOf("hf-studio-ui-preferences")).toBeLessThan(out.indexOf("theme pre-paint"));
  });

  it("keeps the app's scripts and root untouched", () => {
    expect(out).toContain('<script type="module" crossorigin src="/assets/index-abc.js"></script>');
    expect(out).toContain('<div id="root"></div>');
  });

  it("only treats non-API HTML as the Studio page", () => {
    expect(isStudioDocument("/", "text/html; charset=UTF-8")).toBe(true);
    expect(isStudioDocument("/some/route", "text/html")).toBe(true);
    expect(isStudioDocument("/api/projects/x/preview", "text/html")).toBe(false);
    expect(isStudioDocument("/", "application/json")).toBe(false);
    expect(isStudioDocument("/assets/x.js", "text/javascript")).toBe(false);
  });
});

describe("front door against a fake Studio", () => {
  let upstream: http.Server;
  let upPort: number;
  let door: http.Server;
  let port: number;
  const seen: { method?: string; url?: string; headers: IncomingHttpHeaders }[] = [];
  let ready = true;
  let sseRelease: (() => void) | null = null;

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      seen.push({ method: req.method, url: req.url, headers: req.headers });
      if (req.url === "/" || req.url!.startsWith("/#") || req.url === "/editor") {
        res.writeHead(200, { "content-type": "text/html; charset=UTF-8" });
        return res.end(STOCK_HTML);
      }
      if (req.url === "/api/projects/demo/preview") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(COMPOSITION_HTML);
      }
      if (req.url === "/assets/index-abc.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        return res.end("console.log('<title>HyperFrames Studio</title>')");
      }
      if (req.url === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        res.write("event: hello\ndata: first\n\n");
        sseRelease = () => {
          res.write("event: hello\ndata: second\n\n");
          res.end();
        };
        return;
      }
      if (req.method === "POST" && req.url!.startsWith("/api/projects/demo/files/")) {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          res.writeHead(201, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, body }));
        });
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("nope");
    });
    upstream.on("upgrade", (req, socket) => {
      seen.push({ method: "UPGRADE", url: req.url, headers: req.headers });
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
      socket.on("data", (d) => socket.write(Buffer.concat([Buffer.from("echo:"), d])));
      socket.on("end", () => socket.destroy());
      socket.on("error", () => {});
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    upPort = (upstream.address() as AddressInfo).port;

    port = await freePort();
    door = createFrontDoor({ port, upstream: () => (ready ? { host: "127.0.0.1", port: upPort } : null), health: () => ({ instance: "t" }) });
    await new Promise<void>((r) => door.listen(port, "127.0.0.1", r));
  });

  afterAll(async () => {
    door.closeAllConnections?.();
    upstream.closeAllConnections?.();
    await new Promise((r) => door.close(r));
    await new Promise((r) => upstream.close(r));
  });

  it("returns 403 for a foreign Host and never reaches the Studio", async () => {
    const before = seen.length;
    const res = await request(port, { headers: { host: "evil.example:" + port } });
    expect(res.status).toBe(403);
    expect(seen.length).toBe(before);
  });

  it("returns 403 for a cross-origin POST and never reaches the Studio", async () => {
    const before = seen.length;
    const res = await request(port, {
      method: "POST",
      path: "/api/projects/demo/files/evil.txt",
      headers: { origin: "https://evil.example", "content-type": "text/plain" },
      body: "pwned",
    });
    expect(res.status).toBe(403);
    expect(seen.length).toBe(before);
  });

  it("forwards a same-origin POST with the Host and Origin rewritten to the Studio", async () => {
    const res = await request(port, {
      method: "POST",
      path: "/api/projects/demo/files/ok.txt",
      headers: { origin: `http://127.0.0.1:${port}`, "sec-fetch-site": "same-origin", "content-type": "text/plain" },
      body: "hello",
    });
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body).body).toBe("hello");
    const last = seen[seen.length - 1];
    expect(last.headers.host).toBe(`127.0.0.1:${upPort}`);
    expect(last.headers.origin).toBe(`http://127.0.0.1:${upPort}`);
  });

  it("allows GET from another site on a loopback Host", async () => {
    const res = await request(port, { headers: { origin: "https://elsewhere.example", "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(200);
  });

  it("rebrands the Studio page and adds security headers", async () => {
    const res = await request(port, { path: "/" });
    expect(res.status).toBe(200);
    expect(res.body).toContain("<title>Cutscene Studio</title>");
    expect(res.body).toContain("/__cutscene/theme.css");
    expect(Number(res.headers["content-length"])).toBe(Buffer.byteLength(res.body));
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("same-origin");
    // The upstream was asked for an uncompressed page.
    expect(seen[seen.length - 1].headers["accept-encoding"]).toBe("identity");
  });

  it("leaves composition HTML and scripts alone", async () => {
    const comp = await request(port, { path: "/api/projects/demo/preview" });
    expect(comp.body).toBe(COMPOSITION_HTML);
    expect(comp.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    const js = await request(port, { path: "/assets/index-abc.js" });
    expect(js.body).toContain("HyperFrames Studio");
    expect(js.body).not.toContain("Cutscene");
  });

  it("serves its own favicon, theme and icon", async () => {
    const before = seen.length;
    const fav = await request(port, { path: "/favicon.svg" });
    expect(fav.status).toBe(200);
    expect(fav.headers["content-type"]).toBe("image/svg+xml");
    expect(fav.body).toContain("#F4F3EE");
    const css = await request(port, { path: "/__cutscene/theme.css" });
    expect(css.status).toBe(200);
    expect(css.body).toContain("--color-accent");
    expect(css.body).toContain('[aria-label="Send feedback to the HyperFrames team"]');
    const icon = await request(port, { path: "/__cutscene/icon.svg" });
    expect(icon.status).toBe(200);
    expect(seen.length).toBe(before);
  });

  it("reports the desktop-app hand-off as unavailable", async () => {
    const res = await request(port, { path: "/api/open-in-desktop" });
    expect(JSON.parse(res.body)).toEqual({ available: false, handoff: false, downloadUrl: null });
    const post = await request(port, { method: "POST", path: "/api/open-in-desktop", headers: { origin: `http://127.0.0.1:${port}` } });
    expect(post.status).toBe(404);
  });

  it("streams Server-Sent Events without buffering", async () => {
    const got: string[] = [];
    const done = new Promise((resolve, reject) => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/events", headers: { host: `127.0.0.1:${port}` }, agent: false },
        (res) => {
          expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
          res.setEncoding("utf8");
          res.on("data", (c) => {
            got.push(c);
            // The first event arrived while the Studio is still holding the stream open.
            if (got.join("").includes("first") && sseRelease) {
              const release = sseRelease;
              sseRelease = null;
              setTimeout(release, 50);
            }
          });
          res.on("end", resolve);
        },
      );
      req.on("error", reject);
    });
    await done;
    const all = got.join("");
    expect(all).toContain("data: first");
    expect(all).toContain("data: second");
  });

  it("proxies WebSocket upgrades from the same origin and refuses foreign ones", async () => {
    const upgrade = (origin: string) =>
      new Promise<string>((resolve) => {
        const s = net.connect(port, "127.0.0.1", () => {
          s.write(
            `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nOrigin: ${origin}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
          );
        });
        let buf = "";
        s.on("data", (d) => {
          buf += d.toString();
          if (buf.includes("101 Switching") && !buf.includes("echo:")) s.write("ping");
          if (buf.includes("echo:ping") || buf.includes("403")) {
            s.destroy();
            resolve(buf);
          }
        });
        s.on("close", () => resolve(buf));
      });
    const good = await upgrade(`http://127.0.0.1:${port}`);
    expect(good).toContain("101 Switching Protocols");
    expect(good).toContain("echo:ping");
    const bad = await upgrade("https://evil.example");
    expect(bad).toContain("403");
  });

  it("shows a starting page while the Studio isn't ready", async () => {
    ready = false;
    try {
      const res = await request(port, { path: "/" });
      expect(res.status).toBe(503);
      expect(res.body).toContain("Cutscene Studio is starting");
      const health = await request(port, { path: "/__cutscene/health" });
      expect(JSON.parse(health.body)).toMatchObject({ ok: true, app: "cutscene-preview", ready: false, instance: "t" });
    } finally {
      ready = true;
    }
  });
});
