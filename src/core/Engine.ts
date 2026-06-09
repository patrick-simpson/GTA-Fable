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

    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x55604f, 1.0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4d8, 1.5);
    sun.position.set(80, 140, 50);
    this.scene.add(sun);

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
