import * as THREE from 'three';
import { GeometryBatch } from './geometry';
import { PALETTE } from './palette';
import { BLOCK, GRID, type BlockInfo } from './CityLayout';
import { clamp, lerp, pick, randRange } from '../utils/math';
import type { CollisionWorld } from '../physics/Collision';
import type { Disposer } from '../core/Disposer';

interface Lot {
  x: number; // center
  z: number;
  w: number;
  d: number;
}

/**
 * All buildings across the whole city merge into a single vertex-colored
 * mesh: one draw call for every tower, window band and rooftop unit.
 */
export function buildBuildings(
  blocks: BlockInfo[],
  rng: () => number,
  collision: CollisionWorld,
  disposer: Disposer,
): THREE.Mesh {
  const batch = new GeometryBatch();
  const center = (GRID - 1) / 2;

  for (const block of blocks) {
    if (block.type !== 'buildings') continue;

    // Downtown falloff: blocks near the city center grow taller.
    const dist =
      Math.hypot(block.ix - center, block.iz - center) / Math.hypot(center, center);
    const heightMin = lerp(18, 6, dist);
    const heightMax = lerp(52, 14, dist);

    for (const lot of subdivideBlock(block, rng)) {
      const h = randRange(rng, heightMin, heightMax);
      const bodyColor = pick(rng, PALETTE.buildings);
      const x = lot.x;
      const z = lot.z;

      batch.box(lot.w, h, lot.d, x, h / 2, z, bodyColor);
      // Roof trim cap.
      batch.box(lot.w * 0.94, 0.8, lot.d * 0.94, x, h + 0.4, z, PALETTE.roofTrim);

      // Window bands: thin dark strips wrapping each floor group.
      const floorPitch = 3.2;
      const bands = Math.floor(h / floorPitch) - 1;
      for (let f = 1; f <= bands; f++) {
        const lit = rng() < 0.14;
        batch.box(
          lot.w + 0.08,
          1.15,
          lot.d + 0.08,
          x,
          f * floorPitch,
          z,
          lit ? PALETTE.windowLit : PALETTE.windowDark,
        );
      }

      // Rooftop clutter: AC units / stair boxes on taller buildings.
      if (h > 16 && rng() < 0.8) {
        const rw = randRange(rng, 1.5, 3.5);
        batch.box(
          rw,
          randRange(rng, 1, 2.4),
          rw,
          x + randRange(rng, -lot.w / 4, lot.w / 4),
          h + 1.4,
          z + randRange(rng, -lot.d / 4, lot.d / 4),
          PALETTE.roofTrim,
        );
      }

      collision.addBox(x, z, lot.w / 2, lot.d / 2);
    }
  }

  const geo = disposer.geo(batch.build());
  const mat = disposer.mat(new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffffff }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Split one city block into 1–4 building lots with sidewalk margins. */
function subdivideBlock(block: BlockInfo, rng: () => number): Lot[] {
  const margin = 4; // setback from the sidewalk
  const inner = BLOCK - margin * 2;
  const cx = block.x0 + BLOCK / 2;
  const cz = block.z0 + BLOCK / 2;
  const roll = rng();

  if (roll < 0.25) {
    // One large tower.
    const w = inner * randRange(rng, 0.6, 0.85);
    const d = inner * randRange(rng, 0.6, 0.85);
    return [{ x: cx, z: cz, w, d }];
  }
  if (roll < 0.55) {
    // Two slabs side by side (random orientation).
    const horizontal = rng() > 0.5;
    const gap = 3;
    const lots: Lot[] = [];
    for (const s of [-1, 1]) {
      if (horizontal) {
        lots.push({
          x: cx + s * (inner / 4 + gap / 4),
          z: cz,
          w: inner / 2 - gap,
          d: inner * randRange(rng, 0.55, 0.9),
        });
      } else {
        lots.push({
          x: cx,
          z: cz + s * (inner / 4 + gap / 4),
          w: inner * randRange(rng, 0.55, 0.9),
          d: inner / 2 - gap,
        });
      }
    }
    return lots;
  }
  // 2x2 quad of smaller buildings, with a chance to skip a corner (courtyard).
  const lots: Lot[] = [];
  const gap = 3;
  const cell = inner / 2 - gap;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (rng() < 0.15) continue;
      lots.push({
        x: cx + sx * (inner / 4 + gap / 4),
        z: cz + sz * (inner / 4 + gap / 4),
        w: cell * randRange(rng, 0.8, 1),
        d: cell * randRange(rng, 0.8, 1),
      });
    }
  }
  if (lots.length === 0) {
    lots.push({ x: cx, z: cz, w: clamp(inner * 0.6, 4, inner), d: inner * 0.6 });
  }
  return lots;
}
