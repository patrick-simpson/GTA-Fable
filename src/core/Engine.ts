import * as THREE from 'three';
import { Disposer } from './Disposer';
import { disposeSharedCaches } from './Materials';
import { PALETTE } from '../world/palette';

/**
 * Renderer / scene / lighting setup tuned for mobile GPUs:
 * - pixel ratio capped at 2
 * - shadow mapping fully disabled
 * - single hemisphere + single directional light (Lambert-friendly)
 * - fog matched to the sky color to hide the draw distance
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly disposer = new Disposer();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 90, 280);

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      600,
    );
    this.camera.position.set(0, 4, -8);

    // Night city: deep blue ambient + cool moonlight from above.
    const hemi = new THREE.HemisphereLight(0x0a1428, 0x050810, 0.8);
    this.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0x4060c0, 0.7);
    moon.position.set(-60, 180, 80);
    this.scene.add(moon);

    // Neon fill from below — gives buildings that pink/cyan underbelly glow.
    const neonFill = new THREE.HemisphereLight(0xff00a0, 0x00ffe0, 0.35);
    this.scene.add(neonFill);

    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    // Free everything still attached to the scene graph, then the registries.
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.scene.clear();
    this.disposer.dispose();
    disposeSharedCaches();
    this.renderer.dispose();
  }
}
