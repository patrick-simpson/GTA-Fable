import * as THREE from 'three';

/**
 * Central registry of GPU resources so the whole scene can be freed in one
 * call — prevents WebGL memory leaks on teardown / hot reload.
 */
export class Disposer {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.add(g);
    return g;
  }

  mat<T extends THREE.Material>(m: T): T {
    this.materials.add(m);
    return m;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}
