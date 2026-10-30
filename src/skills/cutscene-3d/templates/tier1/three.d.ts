// Three.js (pinned 0.184.0, loaded from jsDelivr by the page), typed for cs3d-runtime.ts.
// Only the classes, members and constants the runtime uses are declared; the templates use much
// more of Three.js but aren't type-checked. Type-only: nothing here is built.

declare module "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm" {
  export type ColorRepresentation = Color | string | number;

  export const SRGBColorSpace: string;
  export const NeutralToneMapping: number;
  export const DoubleSide: number;
  export const HalfFloatType: number;

  export class Color {
    constructor(color?: ColorRepresentation);
    multiplyScalar(s: number): this;
  }

  export class Vector2 {
    constructor(x?: number, y?: number);
  }

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }

  export class Euler {
    x: number;
    y: number;
    z: number;
  }

  export class Texture {}

  export class CanvasTexture extends Texture {
    constructor(canvas: HTMLCanvasElement);
  }

  export class Object3D {
    position: Vector3;
    rotation: Euler;
    add(...objects: Object3D[]): this;
    lookAt(x: number, y: number, z: number): void;
  }

  export class Camera extends Object3D {}

  export class Scene extends Object3D {
    background: Color | Texture | null;
    environment: Texture | null;
  }

  export class BufferGeometry {}

  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number);
  }

  export interface MaterialParameters {
    color?: ColorRepresentation;
    side?: number;
    map?: Texture | null;
    transparent?: boolean;
    depthWrite?: boolean;
    metalness?: number;
    roughness?: number;
    emissive?: ColorRepresentation;
    emissiveIntensity?: number;
    transmission?: number;
    thickness?: number;
    ior?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
  }

  export class Material {}

  export class MeshBasicMaterial extends Material {
    constructor(parameters?: MaterialParameters);
  }

  export class MeshStandardMaterial extends Material {
    constructor(parameters?: MaterialParameters);
  }

  export class MeshPhysicalMaterial extends MeshStandardMaterial {}

  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
  }

  export class WebGLRenderer {
    constructor(parameters?: { canvas?: HTMLCanvasElement | null; antialias?: boolean; alpha?: boolean; preserveDrawingBuffer?: boolean });
    outputColorSpace: string;
    toneMapping: number;
    toneMappingExposure: number;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setClearColor(color: ColorRepresentation, alpha?: number): void;
    render(scene: Object3D, camera: Camera): void;
  }

  export class PMREMGenerator {
    constructor(renderer: WebGLRenderer);
    fromScene(scene: Scene, sigma?: number): { texture: Texture };
    dispose(): void;
  }
}

/** A post-processing pass from three's examples (UnrealBloomPass and friends). */
interface ThreeExamplePass {}

declare module "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/EffectComposer.js/+esm" {
  import type { WebGLRenderer } from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";
  export class EffectComposer {
    constructor(renderer: WebGLRenderer);
    addPass(pass: ThreeExamplePass): void;
    render(): void;
  }
}

declare module "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/RenderPass.js/+esm" {
  import type { Camera, Scene } from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";
  export class RenderPass implements ThreeExamplePass {
    constructor(scene: Scene, camera: Camera);
  }
}

declare module "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm" {
  import type { Vector2 } from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";
  export class UnrealBloomPass implements ThreeExamplePass {
    constructor(resolution: Vector2, strength?: number, radius?: number, threshold?: number);
  }
}

declare module "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/OutputPass.js/+esm" {
  export class OutputPass implements ThreeExamplePass {}
}
