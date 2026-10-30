// What a Tier 1 shot's page provides at runtime, typed for _boot.ts, _preamble.ts and
// cs3d-runtime.ts: the HyperFrames runtime, GSAP (a classic <script> in each template), the host
// object _boot.js publishes on window.__cs3d, and the config tier1.mjs bakes into the page.
// Only what those files use is typed. Type-only: nothing here is built.

/** The config tier1.mjs bakes into the page (see Tier1Config in scripts/lib/tier1.mts). */
interface Cs3dConfig {
  template: string;
  id: string;
  width: number;
  height: number;
  duration: number;
  seed: number;
  motion: string;
  palette: Record<string, string>;
  transparent: boolean;
  bloom: boolean | string;
  bloomStrength?: number;
  exposure: number;
  vars: Record<string, unknown>;
  vendor?: { postprocessing?: string };
  [key: string]: unknown;
}

/** The parts of a paused GSAP timeline the boot uses. */
interface Cs3dTimeline {
  to(target: object, vars: { duration?: number; ease?: string; onUpdate?: () => void; [key: string]: unknown }): Cs3dTimeline;
  time(): number;
}

/** One shot's state, shared by the boot, the runtime and the template code. */
interface Cs3dHost {
  id: string;
  config: Cs3dConfig;
  duration: number;
  clock: { t: number };
  render: ((t: number) => void) | null;
  /** Set by the boot when it creates window.__hf.buildReady[id]. */
  ready?: (value?: unknown) => void;
  fail?: (reason?: unknown) => void;
  timeline?: Cs3dTimeline;
}

/** The HyperFrames runtime, when the page runs inside it. */
interface HyperframesRuntime {
  getVariables?(): Record<string, unknown>;
  assetUrl?(path: string): string;
}

interface Window {
  __cs3d: Record<string, Cs3dHost>;
  __hf?: { buildReady?: Record<string, Promise<unknown>>; [key: string]: unknown };
  __timelines?: Record<string, Cs3dTimeline>;
}

declare var __hyperframes: HyperframesRuntime | undefined;

declare const gsap: { timeline(vars: { paused: boolean }): Cs3dTimeline };

/** Replaced with the shot's JSON config by tier1.mjs (renderTemplate). */
declare const __CS3D_CONFIG__: Cs3dConfig;
