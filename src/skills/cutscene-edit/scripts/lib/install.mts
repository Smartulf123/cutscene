// On-demand downloads for cutscene-edit (contracts §9): ask first, official source, exact pin,
// SHA-256 checked, one folder per tool under <CUTSCENE_HOME>/tools/, never on PATH.
// Cutscene (Apache-2.0).
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { EditError, log } from "./cli.mjs";
import { cutsceneHome } from "./paths.mjs";

/** One pinned download in assets/manifest.json. */
export type Pin = { name: string; version: string; platform: string; file: string; url: string; sha256: string; size: number; license: string; source: string; published?: string; unpack?: string };

const MANIFEST = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets/manifest.json");

/** This computer's platform key, as used in the manifest. */
export function platformKey(p: string = process.platform, a: string = process.arch): string {
  return `${p}-${a === "arm64" ? "arm64" : a === "x64" ? "x64" : a}`;
}

/** The pin for a tool on this platform, or null. */
export function pinFor(name: string, platform: string = platformKey()): Pin | null {
  const m = JSON.parse(readFileSync(MANIFEST, "utf8")) as { pins: Pin[] };
  return m.pins.find((p) => p.name === name && (p.platform === platform || p.platform === "any")) ?? null;
}

export function sizeText(bytes: number): string {
  return bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Folder a pinned tool lives in. */
export function toolDir(pin: Pin): string {
  return join(cutsceneHome(), "tools", pin.name, pin.version);
}

/** The installed file (or unpacked folder) for a pin, or null. */
export function installedPath(pin: Pin): string | null {
  const dir = toolDir(pin);
  const marker = join(dir, ".cutscene-ok");
  if (!existsSync(marker)) return null;
  return pin.unpack ? join(dir, "package") : join(dir, pin.file);
}

/** The NEEDS_CONSENT error for a download (contracts §9). */
export function consentError(pin: Pin, why: string): EditError {
  return new EditError("NEEDS_CONSENT", `${why} needs a one-time download: ${pin.name} ${pin.version} (${sizeText(pin.size)}, ${pin.license}).`, `Ask the user, then run again with --yes (or \`cutscene edit install ${pin.name === "auto-editor" ? "auto-editor" : "face-detector"} --yes\`). It goes into ${toolDir(pin)} and nowhere else.`, {
    details: { name: pin.name, version: pin.version, size: pin.size, sizeText: sizeText(pin.size), license: pin.license, source: pin.source, url: pin.url, into: toolDir(pin) },
  });
}

/**
 * Minimal tar reader (ustar, as npm packs): returns [{name, data}] for regular files.
 */
export function untar(buf: Buffer): { name: string; data: Buffer }[] {
  const files: { name: string; data: Buffer }[] = [];
  let off = 0;
  let longName: string | null = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const str = (a: number, b: number): string => header.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    let name = str(0, 100);
    const prefix = str(345, 500);
    if (prefix) name = `${prefix}/${name}`;
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const body = buf.subarray(off + 512, off + 512 + size);
    if (type === "L") longName = body.toString("utf8").replace(/\0.*$/s, "");
    else {
      if (longName) {
        name = longName;
        longName = null;
      }
      if (type === "0" || type === "\0") files.push({ name, data: Buffer.from(body) });
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/**
 * Install a pinned tool if needed. Without consent, throws NEEDS_CONSENT.
 * @returns path to the installed file or folder
 */
export async function ensureTool(name: string, o: { yes?: boolean; why?: string } = {}): Promise<string> {
  const pin = pinFor(name);
  if (!pin) throw new EditError("UNSUPPORTED_PLATFORM", `There is no ${name} download for this computer (${platformKey()}).`, "Install it yourself and set CUTSCENE_AUTO_EDITOR to its program, or use the export formats that need no download (fcpxml, fcp7, otio, srt).");
  const have = installedPath(pin);
  if (have) return have;
  if (!o.yes) throw consentError(pin, o.why ?? `This step`);
  const dir = toolDir(pin);
  mkdirSync(dir, { recursive: true });
  log(`Downloading ${pin.name} ${pin.version} (${sizeText(pin.size)}) from ${pin.url} ...`);
  const res = await fetch(pin.url, { redirect: "follow" });
  if (!res.ok) throw new EditError("DOWNLOAD_FAILED", `Download failed (${res.status} ${res.statusText}) for ${pin.url}.`, "Check the internet connection and try again.");
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== pin.sha256 || (pin.size && buf.length !== pin.size)) {
    throw new EditError("CHECKSUM_MISMATCH", `The downloaded ${pin.name} does not match its pinned SHA-256 (got ${sha.slice(0, 16)}…), so it was not installed.`, "Try again later; if it keeps failing, the release changed and the pin needs a review.");
  }
  if (pin.unpack === "tgz") {
    const files = untar(gunzipSync(buf));
    for (const f of files) {
      const target = resolve(dir, f.name);
      if (!target.startsWith(resolve(dir) + sep)) continue; // never write outside the tool folder
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.data);
    }
  } else {
    const tmp = join(dir, `${pin.file}.part`);
    writeFileSync(tmp, buf);
    renameSync(tmp, join(dir, pin.file));
    if (process.platform !== "win32") chmodSync(join(dir, pin.file), 0o755);
  }
  writeFileSync(join(dir, ".cutscene-ok"), JSON.stringify({ name: pin.name, version: pin.version, sha256: sha, url: pin.url, license: pin.license, installed: new Date().toISOString() }, null, 2));
  return installedPath(pin) as string;
}

/** Remove a broken install (used by tests and `install --reinstall`). */
export function removeTool(name: string): void {
  const pin = pinFor(name);
  if (pin) rmSync(toolDir(pin), { recursive: true, force: true });
}
