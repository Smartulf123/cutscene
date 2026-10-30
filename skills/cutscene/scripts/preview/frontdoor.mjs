// Cutscene's front door for the preview: a small loopback HTTP proxy in front of the engine's
// Studio. It pins the Host header, only lets the page itself make changes (same-origin writes),
// stops other sites from framing it, and dresses the Studio in Cutscene's look.
//
// Built on HyperFrames, an open-source framework by HeyGen (Apache-2.0). Cutscene is
// independent and not affiliated with HeyGen.
//
// Node built-ins only.
import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSET_DIR = dirname(fileURLToPath(import.meta.url));

/** Methods that can't change anything. Everything else must come from the page itself. */
const SAFE_METHODS = new Set(["GET", "HEAD"]);

/** Hop-by-hop headers a proxy must not forward (RFC 9110 §7.6.1). */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** Largest Studio HTML document we rewrite in memory. The real one is about 1 KB. */
const MAX_SHELL_BYTES = 2 * 1024 * 1024;

export const STUDIO_TITLE = "Cutscene Studio";
export const THEME_PATH = "/__cutscene/theme.css";
export const ICON_PATH = "/__cutscene/icon.svg";
export const HEALTH_PATH = "/__cutscene/health";

/** The front door's own files, served from this folder. */
const OWN_FILES = {
  "/__cutscene/theme.css": { file: "theme.css", type: "text/css; charset=utf-8" },
  "/__cutscene/icon.svg": { file: "icon.svg", type: "image/svg+xml" },
  "/__cutscene/icon-ink.svg": { file: "icon-ink.svg", type: "image/svg+xml" },
  "/__cutscene/favicon.svg": { file: "favicon.svg", type: "image/svg+xml" },
  "/favicon.svg": { file: "favicon.svg", type: "image/svg+xml" },
};

/** The two names the browser may use for the front door. */
export function allowedOrigins(port) {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

/** True when `host` (a Host header) names the front door on loopback. */
export function isAllowedHost(host, port) {
  if (typeof host !== "string") return false;
  const h = host.trim().toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

function header(headers, name) {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The front door's request rules. Pure: decides from method, path and headers alone.
 *
 * - Host must be `127.0.0.1:<port>` or `localhost:<port>` (stops DNS rebinding).
 * - Writes (anything but GET/HEAD) and WebSocket upgrades must come from the page itself:
 *   an `Origin` of the front door, or, with no `Origin`, a `Sec-Fetch-Site` of `same-origin`
 *   or `none`. A request with neither header is a local program (not a browser) and is let in.
 * - A request another website started (`Sec-Fetch-Site: cross-site`/`same-site`) may only
 *   read the Studio page itself, never `/api/`.
 *
 * @param {{method?: string, url?: string, headers: Record<string, string|string[]|undefined>}} req
 * @param {number} port the front door's port
 * @param {{upgrade?: boolean}} [opts]
 * @returns {{ok: true} | {ok: false, status: number, reason: string}}
 */
export function checkRequest(req, port, { upgrade = false } = {}) {
  const headers = req.headers || {};
  const host = header(headers, "host");
  if (!isAllowedHost(host, port)) {
    return { ok: false, status: 403, reason: "host" };
  }
  const method = String(req.method || "GET").toUpperCase();
  const origin = header(headers, "origin");
  const fetchSite = (header(headers, "sec-fetch-site") || "").toLowerCase();
  const foreignSite = fetchSite === "cross-site" || fetchSite === "same-site";
  const path = pathOf(req.url);

  const mustBeSameOrigin = upgrade || !SAFE_METHODS.has(method);
  if (mustBeSameOrigin) {
    if (origin !== undefined) {
      if (!allowedOrigins(port).includes(origin.trim().toLowerCase())) {
        return { ok: false, status: 403, reason: "origin" };
      }
      if (foreignSite) return { ok: false, status: 403, reason: "fetch-site" };
      return { ok: true };
    }
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      return { ok: false, status: 403, reason: "fetch-site" };
    }
    return { ok: true };
  }
  if (foreignSite && isApiPath(path)) {
    return { ok: false, status: 403, reason: "fetch-site" };
  }
  return { ok: true };
}

/**
 * True for the Studio's API, however the path is spelled: `/api/x`, `//api/x`, `/%61pi/x`,
 * `/API/x` or `/./api/x` all count, so another site can't slip past the rule with an odd spelling.
 */
export function isApiPath(path) {
  let p = String(path || "/");
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep the raw path when it isn't valid percent-encoding
  }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/(\.\/)+/g, "/").toLowerCase();
  return p === "/api" || p.startsWith("/api/");
}

/** The path part of a request URL, without query or hash. */
export function pathOf(url) {
  const raw = typeof url === "string" ? url : "/";
  const cut = raw.search(/[?#]/);
  return cut === -1 ? raw : raw.slice(0, cut);
}

/** True when a response is the Studio's own HTML page (not a composition preview or an API reply). */
export function isStudioDocument(path, contentType) {
  if (!/^text\/html\b/i.test(contentType || "")) return false;
  return !(path === "/api" || path.startsWith("/api/") || path.startsWith("/assets/"));
}

const THEME_SEED =
  // First visit only: start in Cutscene's dark look. The Studio's own theme toggle still works.
  `<script>try{if(!localStorage.getItem("hf-studio-ui-preferences"))localStorage.setItem("hf-studio-ui-preferences",'{"theme":"dark"}')}catch(e){}</script>`;

/**
 * Rebrand the Studio's HTML page: Cutscene title, favicon, theme stylesheet and dark default.
 * Leaves everything else (scripts, the app root) untouched so the timeline keeps working.
 * @param {string} html
 * @returns {string}
 */
export function rewriteStudioHtml(html) {
  let out = String(html);

  // Title.
  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${STUDIO_TITLE}</title>`);
  } else {
    out = insertAfterHeadOpen(out, `<title>${STUDIO_TITLE}</title>`);
  }

  // Favicon: drop every icon link, then add ours.
  out = out.replace(/<link\b[^>]*\brel\s*=\s*["']?[^"'>]*\bicon\b[^>]*>\s*/gi, "");
  const headExtras =
    `<link rel="icon" type="image/svg+xml" href="/__cutscene/favicon.svg" />` +
    `<meta name="application-name" content="${STUDIO_TITLE}" />` +
    `<meta name="theme-color" content="#0B0D12" />`;

  // The dark-default seed must run before the Studio's own pre-paint theme script.
  out = insertAfterHeadOpen(out, THEME_SEED + headExtras);

  // Theme last in <head>, so it follows the Studio's stylesheet.
  const themeLink = `<link rel="stylesheet" href="${THEME_PATH}" />`;
  if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${themeLink}</head>`);
  else out = themeLink + out;
  return out;
}

function insertAfterHeadOpen(html, snippet) {
  const m = /<head\b[^>]*>/i.exec(html);
  if (!m) return snippet + html;
  const at = m.index + m[0].length;
  return html.slice(0, at) + snippet + html.slice(at);
}

/** Security headers added to every response. CSP is appended to any the Studio set itself. */
export function securityHeaders(existingCsp) {
  const csp = "frame-ancestors 'self'";
  const list = [];
  if (existingCsp) list.push(...(Array.isArray(existingCsp) ? existingCsp : [existingCsp]));
  list.push(csp);
  return {
    "content-security-policy": list.length === 1 ? list[0] : list,
    "x-content-type-options": "nosniff",
    // Older browsers that ignore frame-ancestors.
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
  };
}

function forbidden(res, reason) {
  const body =
    reason === "host"
      ? "Cutscene preview only answers on 127.0.0.1 or localhost."
      : "Cutscene preview only accepts changes from its own page.";
  res.writeHead(403, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...securityHeaders(),
  });
  res.end(body + "\n");
}

function readOwnFile(name) {
  try {
    return readFileSync(join(ASSET_DIR, name));
  } catch {
    return null;
  }
}

/** Copy request headers for the upstream, minus hop-by-hop ones. */
function upstreamHeaders(reqHeaders, upstreamOrigin, { keepUpgrade = false } = {}) {
  const out = {};
  const connectionTokens = String(reqHeaders.connection || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const [name, value] of Object.entries(reqHeaders)) {
    const n = name.toLowerCase();
    if (value === undefined) continue;
    if (!keepUpgrade && (HOP_BY_HOP.has(n) || connectionTokens.includes(n))) continue;
    if (keepUpgrade && n !== "upgrade" && n !== "connection" && HOP_BY_HOP.has(n)) continue;
    out[n] = value;
  }
  const upstreamHost = upstreamOrigin.replace(/^http:\/\//, "");
  out.host = upstreamHost;
  // The Studio compares Origin to its own Host for a few routes; the front door has already
  // checked the browser's Origin, so present the Studio with its own.
  if (out.origin !== undefined) out.origin = upstreamOrigin;
  if (typeof out.referer === "string") {
    out.referer = out.referer.replace(/^http:\/\/(127\.0\.0\.1|localhost):\d+/i, upstreamOrigin);
  }
  return out;
}

/**
 * Copy response headers for the browser, minus hop-by-hop ones. CORS grants are dropped too:
 * the page is same-origin, so no other website should ever be allowed to read a reply.
 */
export function downstreamHeaders(resHeaders) {
  const out = {};
  for (const [name, value] of Object.entries(resHeaders)) {
    const n = name.toLowerCase();
    if (HOP_BY_HOP.has(n) || value === undefined) continue;
    if (n.startsWith("access-control-allow-")) continue;
    out[n] = value;
  }
  return out;
}

/**
 * Create the front door server (not yet listening).
 *
 * @param {object} opts
 * @param {number} opts.port the port the front door will listen on (used by the Host rules)
 * @param {() => ({host: string, port: number} | null)} opts.upstream where the Studio is; null while starting
 * @param {() => object} [opts.health] extra fields for the health reply
 * @param {(line: string) => void} [opts.log]
 * @returns {http.Server}
 */
export function createFrontDoor({ port, upstream, health = () => ({}), log = () => {} }) {
  const server = http.createServer({ requestTimeout: 0, headersTimeout: 60_000 }, (req, res) => {
    const verdict = checkRequest(req, port);
    if (!verdict.ok) {
      log(`refused ${req.method} ${pathOf(req.url)} (${verdict.reason})`);
      req.resume();
      return forbidden(res, verdict.reason);
    }
    const path = pathOf(req.url);
    const method = String(req.method).toUpperCase();

    // The front door's own files and health check.
    if (OWN_FILES[path] && SAFE_METHODS.has(method)) {
      const f = OWN_FILES[path];
      const body = readOwnFile(f.file);
      if (!body) {
        res.writeHead(404, securityHeaders());
        return res.end();
      }
      res.writeHead(200, {
        "content-type": f.type,
        "content-length": body.length,
        "cache-control": "no-cache",
        ...securityHeaders(),
      });
      return res.end(method === "HEAD" ? undefined : body);
    }
    if (path === HEALTH_PATH && SAFE_METHODS.has(method)) {
      const up = upstream();
      const body = Buffer.from(
        JSON.stringify({ ok: true, app: "cutscene-preview", ready: Boolean(up), pid: process.pid, ...health() }),
      );
      res.writeHead(200, {
        "content-type": "application/json",
        "content-length": body.length,
        "cache-control": "no-store",
        ...securityHeaders(),
      });
      return res.end(method === "HEAD" ? undefined : body);
    }
    // The desktop-app hand-off belongs to another product: always report it unavailable.
    if (path === "/api/open-in-desktop") {
      req.resume();
      if (method === "GET" || method === "HEAD") {
        const body = Buffer.from(JSON.stringify({ available: false, handoff: false, downloadUrl: null }));
        res.writeHead(200, {
          "content-type": "application/json",
          "content-length": body.length,
          "cache-control": "no-store",
          ...securityHeaders(),
        });
        return res.end(method === "HEAD" ? undefined : body);
      }
      res.writeHead(404, { "content-type": "application/json", ...securityHeaders() });
      return res.end(JSON.stringify({ error: "not available in Cutscene" }));
    }

    const up = upstream();
    if (!up) {
      req.resume();
      res.writeHead(503, {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "1",
        "cache-control": "no-store",
        ...securityHeaders(),
      });
      return res.end(startingPage());
    }
    proxyHttp(req, res, up, { path, method, log });
  });

  server.on("upgrade", (req, socket, head) => {
    const verdict = checkRequest(req, port, { upgrade: true });
    if (!verdict.ok) {
      log(`refused upgrade ${pathOf(req.url)} (${verdict.reason})`);
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    const up = upstream();
    if (!up) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    proxyUpgrade(req, socket, head, up, log);
  });

  // Long-lived streams (Server-Sent Events) must not time out.
  server.keepAliveTimeout = 5_000;
  server.timeout = 0;
  return server;
}

function proxyHttp(req, res, up, { path, method, log }) {
  const upstreamOrigin = `http://${up.host}:${up.port}`;
  const headers = upstreamHeaders(req.headers, upstreamOrigin);
  const maybeShell = method === "GET" && !(path === "/api" || path.startsWith("/api/") || path.startsWith("/assets/"));
  // We rewrite the Studio page, so ask for it uncompressed.
  if (maybeShell) headers["accept-encoding"] = "identity";

  const upstreamReq = http.request(
    { host: up.host, port: up.port, method, path: req.url, headers },
    (upRes) => {
      const ctype = String(upRes.headers["content-type"] || "");
      const outHeaders = downstreamHeaders(upRes.headers);
      Object.assign(outHeaders, securityHeaders(outHeaders["content-security-policy"]));

      if (maybeShell && isStudioDocument(path, ctype) && !upRes.headers["content-encoding"]) {
        const chunks = [];
        let size = 0;
        let tooBig = false;
        upRes.on("data", (c) => {
          if (tooBig) return;
          size += c.length;
          if (size > MAX_SHELL_BYTES) {
            tooBig = true;
            return;
          }
          chunks.push(c);
        });
        upRes.on("end", () => {
          if (tooBig) {
            res.writeHead(502, { "content-type": "text/plain; charset=utf-8", ...securityHeaders() });
            return res.end("The Studio page was larger than expected.\n");
          }
          const body = Buffer.from(rewriteStudioHtml(Buffer.concat(chunks).toString("utf8")), "utf8");
          delete outHeaders["content-length"];
          outHeaders["content-length"] = body.length;
          outHeaders["cache-control"] = "no-cache";
          res.writeHead(upRes.statusCode || 200, outHeaders);
          res.end(method === "HEAD" ? undefined : body);
        });
        upRes.on("error", () => res.destroy());
        return;
      }

      res.writeHead(upRes.statusCode || 502, upRes.statusMessage, outHeaders);
      const isStream = /^text\/event-stream\b/i.test(ctype);
      if (isStream) {
        // Server-Sent Events: send headers now and every event the moment it arrives.
        res.flushHeaders();
        if (res.socket) res.socket.setNoDelay(true);
        upRes.on("data", (chunk) => {
          res.write(chunk);
        });
        upRes.on("end", () => res.end());
        upRes.on("error", () => res.destroy());
      } else {
        upRes.pipe(res);
        upRes.on("error", () => res.destroy());
      }
    },
  );
  upstreamReq.on("error", (err) => {
    log(`upstream error on ${method} ${path}: ${err.code || err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8", ...securityHeaders() });
      res.end("Cutscene couldn't reach the Studio. It may have stopped; run `cutscene preview` again.\n");
    } else {
      res.destroy();
    }
  });
  // The browser went away (closed tab, aborted fetch, ended event stream): stop the upstream too.
  res.on("close", () => {
    if (!res.writableFinished) upstreamReq.destroy();
  });
  req.pipe(upstreamReq);
}

function proxyUpgrade(req, socket, head, up, log) {
  const upstreamOrigin = `http://${up.host}:${up.port}`;
  const headers = upstreamHeaders(req.headers, upstreamOrigin, { keepUpgrade: true });
  const upstreamReq = http.request({ host: up.host, port: up.port, method: req.method, path: req.url, headers });
  upstreamReq.on("upgrade", (upRes, upSocket, upHead) => {
    let raw = `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n`;
    for (let i = 0; i < upRes.rawHeaders.length; i += 2) {
      raw += `${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}\r\n`;
    }
    socket.write(raw + "\r\n");
    if (upHead && upHead.length) socket.write(upHead);
    if (head && head.length) upSocket.write(head);
    upSocket.pipe(socket).pipe(upSocket);
    const close = () => {
      upSocket.destroy();
      socket.destroy();
    };
    // HTTP servers keep sockets half-open; when either side ends, end both.
    for (const s of [upSocket, socket]) {
      s.on("error", close);
      s.on("end", close);
      s.on("close", close);
    }
  });
  upstreamReq.on("response", (upRes) => {
    // The Studio declined the upgrade: pass its answer on and close.
    let raw = `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n`;
    for (let i = 0; i < upRes.rawHeaders.length; i += 2) {
      raw += `${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}\r\n`;
    }
    socket.write(raw + "Connection: close\r\n\r\n");
    upRes.pipe(socket);
  });
  upstreamReq.on("error", (err) => {
    log(`upstream upgrade error: ${err.code || err.message}`);
    socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  socket.on("error", () => upstreamReq.destroy());
  upstreamReq.end();
}

function startingPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${STUDIO_TITLE}</title>
<meta http-equiv="refresh" content="1"><link rel="icon" type="image/svg+xml" href="/__cutscene/favicon.svg">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B0D12;color:#F4F3EE;
font:500 15px/1.5 "Segoe UI",system-ui,-apple-system,sans-serif}p{opacity:.8}</style></head>
<body><main><img src="/__cutscene/icon.svg" width="40" height="40" alt=""><p>Cutscene Studio is starting…</p></main></body></html>`;
}
