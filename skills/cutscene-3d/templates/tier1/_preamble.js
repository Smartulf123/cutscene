// Built from src/skills/cutscene-3d/templates/tier1/_preamble.ts by `npm run build`. Edit that file, not this one.
// Shared Cutscene 3D runtime (compositions/assets/3d/cs3d-runtime.js), bound to this file.
const assetUrl = (path) => typeof __hyperframes !== "undefined" && __hyperframes.assetUrl ? __hyperframes.assetUrl(path) : path;
const host = window.__cs3d["__CS3D_ID__"];
let S;
try {
    S = (await import(assetUrl("assets/3d/cs3d-runtime.js"))).stage("__CS3D_ID__", assetUrl);
}
catch (error) {
    console.error("[cutscene-3d] runtime failed to load", error);
    host.fail(error);
    throw error;
}
const { C, V, W, H, P, color, rng, clamp01, ease, REVEAL_EASE, CAMERA_EASE, renderer, scene } = S;
const { studioEnvironment, material, contactShadow, makeComposer } = S;
export {};
