import * as THREE from 'three';
import { clamp, damp } from '../utils/math';
import type { CollisionWorld } from '../physics/Collision';

export interface CamTarget {
  position: THREE.Vector3;
  heading: number;
  /** m/s, used to widen FOV and lengthen the boom while driving. */
  speed: number;
}

interface Profile {
  distance: number;
  height: number;
  lookAhead: number;
  lookHeight: number;
  posLambda: number;
  fovBase: number;
  fovSpan: number;
}

const WALK: Profile = {
  distance: 6.0,
  height: 3.0,
  lookAhead: 1.6,
  lookHeight: 1.3,
  posLambda: 5.5,
  fovBase: 60,
  fovSpan: 0,
};

const DRIVE: Profile = {
  distance: 8.2,
  height: 3.2,
  lookAhead: 7.0,
  lookHeight: 1.1,
  posLambda: 4.5,
  fovBase: 62,
  fovSpan: 13,
};

/**
 * Spring-damped third-person chase rig. The boom trails the target's
 * heading; exponential damping absorbs physics bumps while the look-at
 * point sits ahead of the target so the road stays in view. A 2D raycast
 * against the collision world pulls the camera in front of buildings.
 */
export class ChaseCamera {
  private mode: 'walk' | 'drive' = 'walk';
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private fov = 60;
  private boom = 6;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private collision: CollisionWorld,
  ) {}

  setMode(mode: 'walk' | 'drive'): void {
    this.mode = mode;
  }

  /** Hard reset behind the target (initial spawn). */
  snap(target: CamTarget): void {
    const p = this.profile();
    const fx = Math.sin(target.heading);
    const fz = Math.cos(target.heading);
    this.boom = p.distance;
    this.pos.set(
      target.position.x - fx * p.distance,
      p.height,
      target.position.z - fz * p.distance,
    );
    this.look.set(target.position.x, p.lookHeight, target.position.z);
    this.fov = p.fovBase;
    this.apply();
  }

  update(dt: number, target: CamTarget): void {
    const p = this.profile();
    const fx = Math.sin(target.heading);
    const fz = Math.cos(target.heading);

    // Boom stretches slightly with speed, then shortens if a wall is in the way.
    const speed01 = clamp(target.speed / 33, 0, 1);
    let wantBoom = p.distance + speed01 * 1.6;
    const t = this.collision.raycast(
      target.position.x,
      target.position.z,
      target.position.x - fx * wantBoom,
      target.position.z - fz * wantBoom,
    );
    wantBoom *= Math.max(t - 0.04, 0.18);
    // Snap in fast when blocked, ease back out slowly.
    this.boom = damp(this.boom, wantBoom, wantBoom < this.boom ? 18 : 3, dt);

    const desiredX = target.position.x - fx * this.boom;
    const desiredZ = target.position.z - fz * this.boom;
    const desiredY = p.height + speed01 * 0.5;

    this.pos.x = damp(this.pos.x, desiredX, p.posLambda, dt);
    this.pos.y = damp(this.pos.y, desiredY, p.posLambda, dt);
    this.pos.z = damp(this.pos.z, desiredZ, p.posLambda, dt);

    this.look.x = damp(this.look.x, target.position.x + fx * p.lookAhead, 9, dt);
    this.look.y = damp(this.look.y, p.lookHeight, 9, dt);
    this.look.z = damp(this.look.z, target.position.z + fz * p.lookAhead, 9, dt);

    this.fov = damp(this.fov, p.fovBase + p.fovSpan * speed01, 4, dt);
    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private profile(): Profile {
    return this.mode === 'drive' ? DRIVE : WALK;
  }

  /** Camera yaw used for camera-relative pedestrian movement. */
  get yaw(): number {
    return Math.atan2(this.look.x - this.pos.x, this.look.z - this.pos.z);
  }
}
