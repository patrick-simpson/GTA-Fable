import * as THREE from 'three';
import { damp, dampAngle } from '../utils/math';
import type { CollisionWorld, CircleHit } from './Collision';

/**
 * Pedestrian locomotion: analog joystick magnitude maps to speed, with
 * acceleration smoothing, facing-direction easing and circle-vs-world
 * collision (wall sliding falls out of the push-out resolution).
 */
export class CharacterPhysics {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0;

  readonly radius = 0.42;
  maxSpeed = 5.4; // light jog at full stick
  accelLambda = 9;

  /** Planar speed (m/s) for animation. */
  speed = 0;

  private hit: CircleHit = { x: 0, z: 0, nx: 0, nz: 0, collided: false };

  /** moveX/moveZ: desired world-space direction * magnitude (<= 1). */
  update(dt: number, moveX: number, moveZ: number, world: CollisionWorld): void {
    const targetVx = moveX * this.maxSpeed;
    const targetVz = moveZ * this.maxSpeed;
    this.velocity.x = damp(this.velocity.x, targetVx, this.accelLambda, dt);
    this.velocity.z = damp(this.velocity.z, targetVz, this.accelLambda, dt);

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    world.resolveCircle(this.position.x, this.position.z, this.radius, this.hit);
    if (this.hit.collided) {
      this.position.x = this.hit.x;
      this.position.z = this.hit.z;
      const vn = this.velocity.x * this.hit.nx + this.velocity.z * this.hit.nz;
      if (vn < 0) {
        this.velocity.x -= this.hit.nx * vn;
        this.velocity.z -= this.hit.nz * vn;
      }
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.speed > 0.4) {
      this.heading = dampAngle(
        this.heading,
        Math.atan2(this.velocity.x, this.velocity.z),
        14,
        dt,
      );
    }
  }

  teleport(x: number, z: number, heading: number): void {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.heading = heading;
    this.speed = 0;
  }
}
