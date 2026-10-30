// Inlined into each template's <script type="module"> after its imports (tier1.mjs renderTemplate),
// so it is a module: the top-level await needs that. This type import is erased in the build.
import type { stage } from "./cs3d-runtime.js";
      // Shared Cutscene 3D runtime (compositions/assets/3d/cs3d-runtime.js), bound to this file.
      const assetUrl = (path: string): string =>
        typeof __hyperframes !== "undefined" && __hyperframes.assetUrl ? __hyperframes.assetUrl(path) : path;
      const host = window.__cs3d["__CS3D_ID__"];
      let S: ReturnType<typeof stage>;
      try {
        S = ((await import(assetUrl("assets/3d/cs3d-runtime.js"))) as { stage: typeof stage }).stage("__CS3D_ID__", assetUrl);
      } catch (error) {
        console.error("[cutscene-3d] runtime failed to load", error);
        host.fail!(error);
        throw error;
      }
      const { C, V, W, H, P, color, rng, clamp01, ease, REVEAL_EASE, CAMERA_EASE, renderer, scene } = S;
      const { studioEnvironment, material, contactShadow, makeComposer } = S;
