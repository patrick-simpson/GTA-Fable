import * as THREE from 'three';

/**
 * Shared caches so every car/prop with the same color reuses one material
 * and identical box/cylinder dimensions reuse one geometry. All Lambert
 * materials share a single shader program — cheap on mobile GPUs.
 */
const lambertCache = new Map<number, THREE.MeshLambertMaterial>();
const basicCache = new Map<number, THREE.MeshBasicMaterial>();
const boxCache = new Map<string, THREE.BoxGeometry>();
const cylCache = new Map<string, THREE.CylinderGeometry>();

export function flatMat(color: number): THREE.MeshLambertMaterial {
  let m = lambertCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    lambertCache.set(color, m);
  }
  return m;
}

/** Unlit material — used for "glowing" headlights / taillights. */
export function glowMat(color: number): THREE.MeshBasicMaterial {
  let m = basicCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    basicCache.set(color, m);
  }
  return m;
}

export function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w}|${h}|${d}`;
  let g = boxCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxCache.set(key, g);
  }
  return g;
}

/** Cylinder pre-rotated to spin around the X axis (wheels). */
export function wheelGeo(radius: number, width: number): THREE.CylinderGeometry {
  const key = `w${radius}|${width}`;
  let g = cylCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(radius, radius, width, 10);
    g.rotateZ(Math.PI / 2);
    cylCache.set(key, g);
  }
  return g;
}

export function cylGeo(rTop: number, rBottom: number, h: number, seg = 8): THREE.CylinderGeometry {
  const key = `c${rTop}|${rBottom}|${h}|${seg}`;
  let g = cylCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    cylCache.set(key, g);
  }
  return g;
}

export function disposeSharedCaches(): void {
  for (const m of lambertCache.values()) m.dispose();
  for (const m of basicCache.values()) m.dispose();
  for (const g of boxCache.values()) g.dispose();
  for (const g of cylCache.values()) g.dispose();
  lambertCache.clear();
  basicCache.clear();
  boxCache.clear();
  cylCache.clear();
}
