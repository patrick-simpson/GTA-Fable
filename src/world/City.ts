import * as THREE from 'three';
import { CollisionWorld } from '../physics/Collision';
import type { Disposer } from '../core/Disposer';
import { mulberry32 } from '../utils/math';
import { HALF, generatePlan, type BlockInfo, type ParkingSpot } from './CityLayout';
import { buildBuildings } from './Buildings';
import { buildRoads } from './Roads';
import { buildProps } from './Props';

/**
 * Owns the full static world: meshes, collision boxes, parking spots and
 * the spawn point. Everything is seeded so the same city regenerates on
 * every load.
 */
export class City {
  readonly group = new THREE.Group();
  readonly collision = new CollisionWorld();
  readonly blocks: BlockInfo[];
  readonly parkingSpots: ParkingSpot[];
  readonly spawn: { x: number; z: number };

  constructor(scene: THREE.Scene, disposer: Disposer, seed = 1337) {
    const rng = mulberry32(seed);
    const plan = generatePlan(rng);
    this.blocks = plan.blocks;
    this.parkingSpots = plan.parkingSpots;
    this.spawn = plan.spawn;

    this.group.add(buildRoads(plan.blocks, disposer));
    this.group.add(buildBuildings(plan.blocks, rng, this.collision, disposer));
    this.group.add(buildProps(plan.blocks, rng, this.collision, disposer));

    // Invisible walls just outside the edge roads keep everything in town.
    const wall = 50;
    const edge = HALF + wall / 2;
    this.collision.addBox(0, -edge, HALF + wall, wall / 2);
    this.collision.addBox(0, edge, HALF + wall, wall / 2);
    this.collision.addBox(-edge, 0, wall / 2, HALF + wall);
    this.collision.addBox(edge, 0, wall / 2, HALF + wall);

    // Plaza fountain collider.
    for (const b of plan.blocks) {
      if (b.type === 'plaza') {
        this.collision.addBox(b.x0 + 18, b.z0 + 18, 3.9, 3.9);
      }
    }

    scene.add(this.group);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    // Geometries/materials are owned by the shared Disposer; the group only
    // needs detaching here.
    this.group.clear();
  }
}
