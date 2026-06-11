import * as THREE from 'three';
import { damp } from '../utils/math';

/**
 * DOM-layer visual effects: screen shake (via canvas translate), alert
 * red-tint overlay, and CSS glitch class toggling.
 */
export class ScreenFX {
  private canvas: HTMLCanvasElement;
  private overlay: HTMLDivElement;
  private shakeX = 0;
  private shakeY = 0;
  private shakeIntensity = 0;
  private _camera: THREE.PerspectiveCamera;


  constructor(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera) {
    this.canvas = canvas;
    this._camera = camera;

    this.overlay = document.createElement('div');
    this.overlay.id = 'screen-fx-overlay';
    this.overlay.style.cssText = `
      position:fixed;inset:0;pointer-events:none;z-index:5;
      background:transparent;transition:background 0.05s;
    `;
    document.body.appendChild(this.overlay);
  }

  shake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  update(dt: number, alertFlash: number, glitchActive: boolean): void {
    // Decay shake.
    this.shakeIntensity = damp(this.shakeIntensity, 0, 12, dt);
    this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 12;
    this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 12;

    // Apply shake as camera position offset.
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this._camera.getWorldDirection(right); // reuse temp — we just need an orthogonal
    right.crossVectors(this._camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0,1,0)).normalize();
    up.set(0, 1, 0);

    this._camera.position.addScaledVector(right, this.shakeX * 0.01);
    this._camera.position.addScaledVector(up, this.shakeY * 0.01);

    // Red alert overlay.
    if (alertFlash > 0.01) {
      const alpha = alertFlash * 0.28;
      this.overlay.style.background = `rgba(255,20,20,${alpha.toFixed(3)})`;
      this.overlay.style.boxShadow = `inset 0 0 80px rgba(255,0,0,${(alertFlash * 0.5).toFixed(3)})`;
    } else {
      this.overlay.style.background = 'transparent';
      this.overlay.style.boxShadow = 'none';
    }

    // CSS glitch class on canvas.
    if (glitchActive) {
      this.canvas.classList.add('glitch');
    } else {
      this.canvas.classList.remove('glitch');
    }
  }

  dispose(): void {
    this.overlay.remove();
  }
}
