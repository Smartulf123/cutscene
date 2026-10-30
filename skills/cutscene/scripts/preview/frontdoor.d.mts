// Built from src/skills/cutscene/scripts/preview/frontdoor.mts by `npm run build`. Edit that file, not this one.
import http from "node:http";
import type { IncomingHttpHeaders, OutgoingHttpHeader, OutgoingHttpHeaders } from "node:http";
export declare const STUDIO_TITLE = "Cutscene Studio";
export declare const THEME_PATH = "/__cutscene/theme.css";
export declare const ICON_PATH = "/__cutscene/icon.svg";
export declare const HEALTH_PATH = "/__cutscene/health";
/** Where the Studio answers. */
export interface Upstream {
    host: string;
    port: number;
}
/** A request as the front door's rules see it. */
export interface DoorRequest {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
}
/** The front door's verdict on a request. */
export type Verdict = {
    ok: true;
} | {
    ok: false;
    status: number;
    reason: string;
};
/** The two names the browser may use for the front door. */
export declare function allowedOrigins(port: number): string[];
/** True when `host` (a Host header) names the front door on loopback. */
export declare function isAllowedHost(host: unknown, port: number): boolean;
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
 * @param port the front door's port
 */
export declare function checkRequest(req: DoorRequest, port: number, { upgrade }?: {
    upgrade?: boolean;
}): Verdict;
/**
 * True for the Studio's API, however the path is spelled: `/api/x`, `//api/x`, `/%61pi/x`,
 * `/API/x` or `/./api/x` all count, so another site can't slip past the rule with an odd spelling.
 */
export declare function isApiPath(path: string | undefined): boolean;
/** The path part of a request URL, without query or hash. */
export declare function pathOf(url: unknown): string;
/** True when a response is the Studio's own HTML page (not a composition preview or an API reply). */
export declare function isStudioDocument(path: string, contentType: string | undefined): boolean;
/**
 * Rebrand the Studio's HTML page: Cutscene title, favicon, theme stylesheet and dark default.
 * Leaves everything else (scripts, the app root) untouched so the timeline keeps working.
 */
export declare function rewriteStudioHtml(html: string): string;
/** Security headers added to every response. CSP is appended to any the Studio set itself. */
export declare function securityHeaders(existingCsp?: string | string[]): NodeJS.Dict<OutgoingHttpHeader>;
/**
 * Copy response headers for the browser, minus hop-by-hop ones. CORS grants are dropped too:
 * the page is same-origin, so no other website should ever be allowed to read a reply.
 */
export declare function downstreamHeaders(resHeaders: IncomingHttpHeaders): OutgoingHttpHeaders;
/** Options for `createFrontDoor`. */
export interface FrontDoorOptions {
    /** the port the front door will listen on (used by the Host rules) */
    port: number;
    /** where the Studio is; null while starting */
    upstream: () => Upstream | null;
    /** extra fields for the health reply */
    health?: () => object;
    log?: (line: string) => void;
}
/**
 * Create the front door server (not yet listening).
 */
export declare function createFrontDoor({ port, upstream, health, log }: FrontDoorOptions): http.Server;
