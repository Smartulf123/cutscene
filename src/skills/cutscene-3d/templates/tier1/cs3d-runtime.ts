// Cutscene 3D Tier 1 runtime: renderer, studio environment, materials, easing, seeded randomness
// and optional bloom, shared by every Tier 1 shot in a project. Copied next to the shots by
// `cutscene 3d tier1` (compositions/assets/3d/cs3d-runtime.js).
// Patterns adapted from HyperFrames registry blocks extruded-logo and product-turntable
// (Apache-2.0, HeyGen, Inc.); modified for Cutscene.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";

/** A vendored pmndrs postprocessing build (the parts makeComposer uses). */
interface PostprocessingModule {
  EffectComposer: new (renderer: THREE.WebGLRenderer, options: { frameBufferType: number }) => { addPass(pass: unknown): void; render(): void };
  RenderPass: new (scene: THREE.Scene, camera: THREE.Camera) => unknown;
  EffectPass: new (camera: THREE.Camera, ...effects: unknown[]) => unknown;
  BloomEffect: new (options: { intensity: number; luminanceThreshold: number; mipmapBlur: boolean }) => unknown;
}

/** A material in the shot config: a preset and a colour (palette token or "#RRGGBB"). */
interface MaterialSpec {
  preset?: string;
  color?: string;
  roughness?: number;
  emission_strength?: number;
}

type Ease = (x: number) => number;

/**
 * @param id composition id
 * @param assetUrl resolver bound to the calling composition
 */
export function stage(id: string, assetUrl: (path: string) => string) {
  const host = window.__cs3d[id];
  const C = host.config;
  const V = C.vars || {};
  const W = C.width;
  const H = C.height;
  const hex = (v: unknown, fallback: string): string => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : fallback);
  const P: Record<string, string> = {
    bg: hex(C.palette.bg, "#0B1020"),
    fg: hex(C.palette.fg, "#F4F3EE"),
    accent: hex(C.palette.accent, "#5B8DEF"),
    accent2: hex(C.palette.accent2, "#FF7A45"),
  };
  // P[undefined] reads P["undefined"], which isn't there, so an unset colour falls through to the fallback.
  const color = (v: string | undefined, fallback: string): string => hex(P[v as string] || v, fallback);
  // Seeded randomness: same seed, same frame, every render.
  const rng = (seed: number) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const ease: Record<string, Ease> = {
    linear: (x: number) => clamp01(x),
    sineInOut: (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2,
    cubicOut: (x: number) => 1 - Math.pow(1 - clamp01(x), 3),
    quartOut: (x: number) => 1 - Math.pow(1 - clamp01(x), 4),
    quintInOut: (x: number) => {
      const u = clamp01(x);
      return u < 0.5 ? 16 * u ** 5 : 1 - Math.pow(-2 * u + 2, 5) / 2;
    },
    expoOut: (x: number) => (clamp01(x) >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(x))),
    backOut: (x: number) => {
      const u = clamp01(x) - 1;
      return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
    },
    elasticOut: (x: number) => {
      const u = clamp01(x);
      return u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    },
  };
  const EASE_BY_CHARACTER: Record<string, string[]> = {
    snappy: ["backOut", "expoOut"],
    smooth: ["quartOut", "sineInOut"],
    bouncy: ["elasticOut", "backOut"],
    cinematic: ["quartOut", "quintInOut"],
    editorial: ["cubicOut", "cubicOut"],
  };
  const [REVEAL_EASE, CAMERA_EASE] = (EASE_BY_CHARACTER[C.motion] || EASE_BY_CHARACTER.snappy).map((k) => ease[k]);

  const canvas = document.getElementById("cs3d-" + host.id + "-canvas") as HTMLCanvasElement | null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral tone mapping keeps brand colours close to their hex values.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = C.exposure || 1.0;
  const scene = new THREE.Scene();
  if (!C.transparent) scene.background = new THREE.Color(P.bg);
  renderer.setClearColor(new THREE.Color(P.bg), C.transparent ? 0 : 1);

  // Studio environment: softbox strips on black, so metal and gloss show crisp highlights.
  function studioEnvironment(rimColor?: THREE.ColorRepresentation) {
    const studio = new THREE.Scene();
    studio.background = new THREE.Color(0x050507);
    const box = (w: number, h: number, x: number, y: number, z: number, c: THREE.ColorRepresentation, power: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(power), side: THREE.DoubleSide }),
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      studio.add(m);
    };
    box(10, 2.2, 0, 7, 1, 0xffffff, 2.6);
    box(1.3, 7, -7, 1, 3, 0xffffff, 2.2);
    box(1.0, 7, 7, 1, -1, 0xffffff, 1.5);
    box(9, 1.4, 0, 0.5, -7, rimColor || 0xffffff, 1.8);
    box(14, 4, 0, -1.5, 9, 0x9a9ca3, 0.9);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(studio, 0.02).texture;
    pmrem.dispose();
    return tex;
  }

  function material(spec: MaterialSpec | null | undefined, fallbackColor: string) {
    const s = spec || {};
    const c = new THREE.Color(color(s.color, fallbackColor));
    switch (s.preset) {
      case "chrome":
        return new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: s.roughness ?? 0.08 });
      case "metal":
        return new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: s.roughness ?? 0.24 });
      case "gold":
        return new THREE.MeshStandardMaterial({ color: new THREE.Color(color(s.color, "#E8B65A")), metalness: 1, roughness: 0.2 });
      case "glass":
        return new THREE.MeshPhysicalMaterial({ color: c, metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.6, ior: 1.45 });
      case "plastic":
        return new THREE.MeshPhysicalMaterial({ color: c, roughness: s.roughness ?? 0.34, clearcoat: 0.1 });
      case "satin":
      case "clay":
        return new THREE.MeshStandardMaterial({ color: c, roughness: s.roughness ?? (s.preset === "clay" ? 0.8 : 0.55) });
      case "emissive":
        return new THREE.MeshStandardMaterial({ color: 0x101014, emissive: c, emissiveIntensity: s.emission_strength ?? 2.5 });
      default:
        return new THREE.MeshPhysicalMaterial({ color: c, roughness: s.roughness ?? 0.18, clearcoat: 0.6, clearcoatRoughness: 0.05 });
    }
  }

  // A soft baked contact shadow (no shadow maps, no per-frame cost).
  function contactShadow(width: number, depth: number, strength?: number) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    // A new canvas always has a 2D context.
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, `rgba(0,0,0,${strength ?? 0.55})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002;
    return m;
  }

  // Optional bloom: "three" (UnrealBloomPass, ships with three) or "postprocessing" (pmndrs, vendored).
  async function makeComposer(camera: THREE.Camera): Promise<{ render: () => void } | null> {
    if (!C.bloom) return null;
    if (C.bloom === "postprocessing" && C.vendor && C.vendor.postprocessing) {
      const PP = (await import(assetUrl(C.vendor.postprocessing))) as PostprocessingModule;
      const composer = new PP.EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
      composer.addPass(new PP.RenderPass(scene, camera));
      composer.addPass(
        new PP.EffectPass(camera, new PP.BloomEffect({ intensity: C.bloomStrength ?? 1.2, luminanceThreshold: 0.6, mipmapBlur: true })),
      );
      return { render: () => composer.render() };
    }
    const { EffectComposer } = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/EffectComposer.js/+esm");
    const { RenderPass } = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/RenderPass.js/+esm");
    const { UnrealBloomPass } = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm");
    const { OutputPass } = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/OutputPass.js/+esm");
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), C.bloomStrength ?? 0.7, 0.5, 0.75));
    composer.addPass(new OutputPass());
    return { render: () => composer.render() };
  }

  return { THREE, host, C, V, W, H, P, color, assetUrl, rng, clamp01, ease, REVEAL_EASE, CAMERA_EASE, renderer, scene,
    studioEnvironment, material, contactShadow, makeComposer };
}
