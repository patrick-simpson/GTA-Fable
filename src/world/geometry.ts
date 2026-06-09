import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Helpers for building one big vertex-colored geometry out of many primitive
 * shapes, so an entire city district renders in a single draw call.
 */

const color = new THREE.Color();

export function paintGeometry(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  color.setHex(hex);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export class GeometryBatch {
  private parts: THREE.BufferGeometry[] = [];

  box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, rotY = 0): void {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotY !== 0) g.rotateY(rotY);
    g.translate(x, y, z);
    paintGeometry(g, hex);
    this.parts.push(g);
  }

  /** Horizontal plane (facing +Y). */
  plane(w: number, d: number, x: number, y: number, z: number, hex: number): void {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    paintGeometry(g, hex);
    this.parts.push(g);
  }

  cylinder(rTop: number, rBottom: number, h: number, seg: number, x: number, y: number, z: number, hex: number): void {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    g.translate(x, y, z);
    paintGeometry(g, hex);
    this.parts.push(g);
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  /** Merge everything into one BufferGeometry and free the sources. */
  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    if (!merged) throw new Error('GeometryBatch: nothing to merge');
    // UVs are unused by our vertex-colored Lambert material — drop them.
    merged.deleteAttribute('uv');
    return merged;
  }
}
