import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";
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
export declare function stage(id: string, assetUrl: (path: string) => string): {
    THREE: typeof THREE;
    host: Cs3dHost;
    C: Cs3dConfig;
    V: Record<string, unknown>;
    W: number;
    H: number;
    P: Record<string, string>;
    color: (v: string | undefined, fallback: string) => string;
    assetUrl: (path: string) => string;
    rng: (seed: number) => () => number;
    clamp01: (x: number) => number;
    ease: Record<string, Ease>;
    REVEAL_EASE: Ease;
    CAMERA_EASE: Ease;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    studioEnvironment: (rimColor?: THREE.ColorRepresentation) => THREE.Texture;
    material: (spec: MaterialSpec | null | undefined, fallbackColor: string) => THREE.MeshStandardMaterial;
    contactShadow: (width: number, depth: number, strength?: number) => THREE.Mesh;
    makeComposer: (camera: THREE.Camera) => Promise<{
        render: () => void;
    } | null>;
};
export {};
