import { pick, randInt } from '../utils/math';

/**
 * Seeded city grid layout. All world-builder modules derive their geometry
 * from these constants so roads, buildings, props and AI lanes stay aligned.
 */
export const GRID = 8; // blocks per side
export const BLOCK = 36; // block size (m)
export const ROAD = 14; // road strip width including sidewalks (m)
export const SIDEWALK = 1.5; // sidewalk band on each road edge (m)
export const PITCH = BLOCK + ROAD;
export const CITY_SIZE = GRID * BLOCK + (GRID + 1) * ROAD;
export const HALF = CITY_SIZE / 2;

/** Driveable half-width of a road (excludes sidewalks). */
export const DRIVE_HALF = ROAD / 2 - SIDEWALK;
/** Lane center offset from a road's centerline (right-hand traffic). */
export const LANE_OFFSET = 2.5;
/** Parking lane offset from a road's centerline. */
export const PARK_OFFSET = DRIVE_HALF - 1.2;

/** World coordinate of road centerline i (i in 0..GRID). */
export function roadCenter(i: number): number {
  return -HALF + ROAD / 2 + i * PITCH;
}

/** World min-corner of block (ix, iz), each in 0..GRID-1. */
export function blockMin(i: number): number {
  return -HALF + ROAD + i * PITCH;
}

export type BlockType = 'buildings' | 'park' | 'plaza';

export interface BlockInfo {
  ix: number;
  iz: number;
  x0: number;
  z0: number;
  type: BlockType;
}

export interface ParkingSpot {
  x: number;
  z: number;
  heading: number;
}

export interface CityPlan {
  blocks: BlockInfo[];
  parkingSpots: ParkingSpot[];
  spawn: { x: number; z: number };
}

export function generatePlan(rng: () => number): CityPlan {
  const blocks: BlockInfo[] = [];
  const parkIx = randInt(rng, 1, GRID - 2);
  const parkIz = randInt(rng, 1, GRID - 2);
  let plazaIx = randInt(rng, 1, GRID - 2);
  let plazaIz = randInt(rng, 1, GRID - 2);
  if (plazaIx === parkIx && plazaIz === parkIz) {
    plazaIx = (plazaIx + 2) % (GRID - 2) + 1;
  }

  for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
      let type: BlockType = 'buildings';
      if (ix === parkIx && iz === parkIz) type = 'park';
      else if (ix === plazaIx && iz === plazaIz) type = 'plaza';
      blocks.push({ ix, iz, x0: blockMin(ix), z0: blockMin(iz), type });
    }
  }

  // Parking spots: parallel-parked along random road segments, kept away
  // from intersections, alternating road sides.
  const parkingSpots: ParkingSpot[] = [];
  const usedSegments = new Set<string>();
  let guard = 0;
  while (parkingSpots.length < 14 && guard++ < 300) {
    const vertical = rng() > 0.5;
    const roadIdx = randInt(rng, 0, GRID);
    const segIdx = randInt(rng, 0, GRID - 1);
    const side = rng() > 0.5 ? 1 : -1;
    const segKey = `${vertical}|${roadIdx}|${segIdx}|${side}`;
    if (usedSegments.has(segKey)) continue;
    usedSegments.add(segKey);

    const along = blockMin(segIdx) + 6 + rng() * (BLOCK - 12);
    const center = roadCenter(roadIdx);
    if (vertical) {
      parkingSpots.push({
        x: center + side * PARK_OFFSET,
        z: along,
        heading: side > 0 ? 0 : Math.PI, // face along the road
      });
    } else {
      parkingSpots.push({
        x: along,
        z: center + side * PARK_OFFSET,
        heading: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      });
    }
  }

  // Spawn on the sidewalk beside the plaza block.
  const plaza = blocks.find((b) => b.type === 'plaza')!;
  const spawn = {
    x: plaza.x0 + BLOCK / 2,
    z: plaza.z0 - ROAD / 2 + SIDEWALK + 0.8,
  };

  return { blocks, parkingSpots, spawn };
}

/** Convenience for prop scatter: random point inside a block with margin. */
export function pointInBlock(rng: () => number, b: BlockInfo, margin: number): { x: number; z: number } {
  return {
    x: b.x0 + margin + rng() * (BLOCK - margin * 2),
    z: b.z0 + margin + rng() * (BLOCK - margin * 2),
  };
}

export function randomBuildingPalette<T>(rng: () => number, colors: readonly T[]): T {
  return pick(rng, colors);
}
