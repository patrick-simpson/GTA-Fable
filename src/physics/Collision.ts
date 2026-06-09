/**
 * Static collision world: axis-aligned boxes (buildings, props, city bounds)
 * stored in a spatial hash for O(1) local queries. Dynamic bodies are
 * resolved as circles with wall sliding.
 */

export interface AABB {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface CircleHit {
  x: number;
  z: number;
  /** Combined push-out normal of the last resolution (zero when no hit). */
  nx: number;
  nz: number;
  collided: boolean;
}

const CELL = 16;

export class CollisionWorld {
  readonly aabbs: AABB[] = [];
  private grid = new Map<number, AABB[]>();

  private key(cx: number, cz: number): number {
    return (cx + 2048) * 8192 + (cz + 2048);
  }

  addAABB(b: AABB): void {
    this.aabbs.push(b);
    const cx0 = Math.floor(b.minX / CELL);
    const cx1 = Math.floor(b.maxX / CELL);
    const cz0 = Math.floor(b.minZ / CELL);
    const cz1 = Math.floor(b.maxZ / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = this.key(cx, cz);
        let list = this.grid.get(k);
        if (!list) {
          list = [];
          this.grid.set(k, list);
        }
        list.push(b);
      }
    }
  }

  addBox(centerX: number, centerZ: number, halfW: number, halfD: number): void {
    this.addAABB({
      minX: centerX - halfW,
      maxX: centerX + halfW,
      minZ: centerZ - halfD,
      maxZ: centerZ + halfD,
    });
  }

  queryCircle(x: number, z: number, r: number, out: AABB[]): AABB[] {
    out.length = 0;
    const cx0 = Math.floor((x - r) / CELL);
    const cx1 = Math.floor((x + r) / CELL);
    const cz0 = Math.floor((z - r) / CELL);
    const cz1 = Math.floor((z + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.grid.get(this.key(cx, cz));
        if (!list) continue;
        for (const b of list) {
          if (out.indexOf(b) === -1) out.push(b);
        }
      }
    }
    return out;
  }

  private scratch: AABB[] = [];

  /** Push a circle out of all overlapping boxes (with wall sliding). */
  resolveCircle(x: number, z: number, r: number, result: CircleHit): CircleHit {
    result.x = x;
    result.z = z;
    result.nx = 0;
    result.nz = 0;
    result.collided = false;

    for (let pass = 0; pass < 3; pass++) {
      const boxes = this.queryCircle(result.x, result.z, r, this.scratch);
      let any = false;
      for (const b of boxes) {
        const cx = result.x < b.minX ? b.minX : result.x > b.maxX ? b.maxX : result.x;
        const cz = result.z < b.minZ ? b.minZ : result.z > b.maxZ ? b.maxZ : result.z;
        let dx = result.x - cx;
        let dz = result.z - cz;
        const distSq = dx * dx + dz * dz;
        if (distSq >= r * r) continue;

        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = r - dist;
          dx /= dist;
          dz /= dist;
          result.x += dx * push;
          result.z += dz * push;
          result.nx += dx;
          result.nz += dz;
        } else {
          // Circle center is inside the box — escape along the thinnest axis.
          const left = result.x - b.minX + r;
          const right = b.maxX - result.x + r;
          const near = result.z - b.minZ + r;
          const far = b.maxZ - result.z + r;
          const m = Math.min(left, right, near, far);
          if (m === left) { result.x = b.minX - r; result.nx -= 1; }
          else if (m === right) { result.x = b.maxX + r; result.nx += 1; }
          else if (m === near) { result.z = b.minZ - r; result.nz -= 1; }
          else { result.z = b.maxZ + r; result.nz += 1; }
        }
        any = true;
        result.collided = true;
      }
      if (!any) break;
    }

    const len = Math.hypot(result.nx, result.nz);
    if (len > 1e-6) {
      result.nx /= len;
      result.nz /= len;
    }
    return result;
  }

  /**
   * 2D segment vs world: returns the smallest t in [0,1] where the segment
   * enters any box, or 1 if the path is clear. Used by the chase camera.
   */
  raycast(x0: number, z0: number, x1: number, z1: number): number {
    const dx = x1 - x0;
    const dz = z1 - z0;
    let best = 1;
    // Walk the cells along the segment's bounding box (segments are short).
    const minX = Math.min(x0, x1) - 1;
    const maxX = Math.max(x0, x1) + 1;
    const minZ = Math.min(z0, z1) - 1;
    const maxZ = Math.max(z0, z1) + 1;
    const cx0 = Math.floor(minX / CELL);
    const cx1 = Math.floor(maxX / CELL);
    const cz0 = Math.floor(minZ / CELL);
    const cz1 = Math.floor(maxZ / CELL);
    const seen = new Set<AABB>();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.grid.get(this.key(cx, cz));
        if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue;
          seen.add(b);
          const t = segmentVsAABB(x0, z0, dx, dz, b);
          if (t !== null && t < best) best = t;
        }
      }
    }
    return best;
  }
}

function segmentVsAABB(x0: number, z0: number, dx: number, dz: number, b: AABB): number | null {
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < b.minX || x0 > b.maxX) return null;
  } else {
    let t1 = (b.minX - x0) / dx;
    let t2 = (b.maxX - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < b.minZ || z0 > b.maxZ) return null;
  } else {
    let t1 = (b.minZ - z0) / dz;
    let t2 = (b.maxZ - z0) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/**
 * Circle-vs-circle separation for car/car and car/pedestrian contacts.
 * Returns the penetration depth and unit normal pointing from B toward A,
 * or null when not touching.
 */
export function circleVsCircle(
  ax: number, az: number, ar: number,
  bx: number, bz: number, br: number,
): { nx: number; nz: number; depth: number } | null {
  const dx = ax - bx;
  const dz = az - bz;
  const rs = ar + br;
  const distSq = dx * dx + dz * dz;
  if (distSq >= rs * rs) return null;
  const dist = Math.sqrt(distSq);
  if (dist < 1e-6) return { nx: 1, nz: 0, depth: rs };
  return { nx: dx / dist, nz: dz / dist, depth: rs - dist };
}
