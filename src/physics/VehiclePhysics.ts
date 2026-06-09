import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../utils/math';
import type { CollisionWorld, CircleHit } from './Collision';

export interface VehicleInput {
  /** 0..1 */
  throttle: number;
  /** 0..1 — brakes when rolling forward, reverses once nearly stopped. */
  brake: number;
  /** -1..1, positive = steer right. */
  steer: number;
}

export const ZERO_INPUT: VehicleInput = { throttle: 0, brake: 0, steer: 0 };

/**
 * Custom arcade-sim hybrid car model (no physics engine):
 *
 * - world velocity is decomposed into forward/lateral components each step
 * - engine force tapers as speed approaches the cap (acceleration curve)
 * - yaw rate derives from a bicycle model: v / wheelbase * tan(steer),
 *   with steering authority reduced at speed (turn radius grows with v)
 * - lateral velocity is damped by tire grip; sharp fast turns (or braking
 *   into a turn) exceed the grip budget and drop the car into a drift state
 *   where the rear slides and momentum carries the original travel direction
 */
export class VehiclePhysics {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0;
  steerAngle = 0;
  drifting = false;

  /** Signed speed along the car's forward axis (m/s). */
  forwardSpeed = 0;
  /** Lateral slide speed (m/s) — drives body roll and tire screech. */
  lateralSpeed = 0;
  /** Longitudinal acceleration of the last step — drives body pitch. */
  longAccel = 0;

  // ---- tunables ----
  topSpeed = 33; // ~120 km/h
  reverseTopSpeed = 9;
  engineAccel = 16;
  brakeDecel = 26;
  rollingResistance = 0.6;
  dragCoefficient = 0.0015;
  maxSteer = 0.6; // rad at standstill
  steerSpeedFalloff = 0.21; // higher = less steering authority at speed
  steerLerp = 9;
  wheelbase = 2.6;
  gripNormal = 8.5; // 1/s lateral damping with traction
  gripDrift = 2.1; // 1/s while sliding
  driftLatAccelThreshold = 12.5; // m/s^2 of demanded lateral accel
  collisionRadius = 1.05;
  axleOffset = 1.25; // collision circles sit this far fore/aft of center

  private hit: CircleHit = { x: 0, z: 0, nx: 0, nz: 0, collided: false };

  update(dt: number, input: VehicleInput, world: CollisionWorld): void {
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // Right-hand side of the car (y-up, facing +Z when heading = 0).
    const rx = -fz;
    const rz = fx;

    let vf = this.velocity.x * fx + this.velocity.z * fz;
    let vr = this.velocity.x * rx + this.velocity.z * rz;
    const prevVf = vf;

    // ---- engine: force fades as we approach top speed ----
    if (input.throttle > 0) {
      const speedNorm = clamp(vf / this.topSpeed, 0, 1);
      vf += this.engineAccel * input.throttle * (1 - speedNorm) * dt;
    }

    // ---- brake / reverse ----
    if (input.brake > 0) {
      if (vf > 0.4) {
        vf = Math.max(0, vf - this.brakeDecel * input.brake * dt);
      } else {
        const revNorm = clamp(-vf / this.reverseTopSpeed, 0, 1);
        vf -= this.engineAccel * 0.55 * input.brake * (1 - revNorm) * dt;
      }
    }

    // ---- rolling resistance + aerodynamic drag ----
    const resist = (this.rollingResistance + this.dragCoefficient * vf * vf) * dt;
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), resist);

    // ---- steering: authority shrinks with speed (bigger turn radius) ----
    const authority = 1 / (1 + Math.abs(vf) * this.steerSpeedFalloff);
    const targetSteer = input.steer * this.maxSteer * authority;
    this.steerAngle = damp(this.steerAngle, targetSteer, this.steerLerp, dt);

    // Bicycle-model yaw. Negative: positive steer turns right (heading
    // decreases in this coordinate convention).
    const yawRate = -(vf / this.wheelbase) * Math.tan(this.steerAngle);
    this.heading = wrapAngle(this.heading + yawRate * dt);

    // ---- tire grip vs drift ----
    const demandedLatAccel = Math.abs(vf * yawRate);
    const brakeKick =
      input.brake > 0.4 && Math.abs(vf) > 13 && Math.abs(input.steer) > 0.35;
    this.drifting =
      demandedLatAccel > this.driftLatAccelThreshold ||
      brakeKick ||
      (this.drifting && Math.abs(vr) > 2.2);
    const grip = this.drifting ? this.gripDrift : this.gripNormal;
    vr -= vr * Math.min(1, grip * dt);

    // Recompose on the PRE-yaw axes: rotating the chassis does not rotate
    // momentum — grip transfers it over the following frames. This is what
    // produces natural slides instead of rail-turning.
    this.velocity.x = fx * vf + rx * vr;
    this.velocity.z = fz * vf + rz * vr;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    this.resolveCollisions(world, fx, fz);

    // Refresh cached telemetry against the new heading.
    const nfx = Math.sin(this.heading);
    const nfz = Math.cos(this.heading);
    this.forwardSpeed = this.velocity.x * nfx + this.velocity.z * nfz;
    this.lateralSpeed = this.velocity.x * -nfz + this.velocity.z * nfx;
    this.longAccel = (this.forwardSpeed - prevVf) / dt;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Hard placement (parking spots, enter/exit). */
  teleport(x: number, z: number, heading: number): void {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.heading = heading;
    this.steerAngle = 0;
    this.drifting = false;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
  }

  private resolveCollisions(world: CollisionWorld, fx: number, fz: number): void {
    // Two-circle approximation of the chassis (front + rear axle).
    for (const sign of [1, -1]) {
      const cx = this.position.x + fx * this.axleOffset * sign;
      const cz = this.position.z + fz * this.axleOffset * sign;
      world.resolveCircle(cx, cz, this.collisionRadius, this.hit);
      if (!this.hit.collided) continue;

      this.position.x += this.hit.x - cx;
      this.position.z += this.hit.z - cz;

      // Kill velocity into the wall (slight restitution) + impact scrub.
      const vn = this.velocity.x * this.hit.nx + this.velocity.z * this.hit.nz;
      if (vn < 0) {
        this.velocity.x -= this.hit.nx * vn * 1.35;
        this.velocity.z -= this.hit.nz * vn * 1.35;
        this.velocity.multiplyScalar(0.94);
      }
    }
  }
}
