import * as THREE from 'three';
import { boxGeo, flatMat, glowMat, wheelGeo } from '../core/Materials';
import { PALETTE } from '../world/palette';
import { VehiclePhysics } from '../physics/VehiclePhysics';
import { clamp, damp } from '../utils/math';

export type VehicleStyle = 'sedan' | 'sports' | 'taxi' | 'pickup' | 'van';

const WHEEL_RADIUS = 0.34;

/**
 * Fully procedural low-poly car. Geometry/material instances are shared
 * through the module caches, so twenty cars cost a handful of GPU buffers.
 * Front wheels live in steering pivots; the body group rolls and pitches
 * with the physics for a bit of life.
 */
export class Vehicle {
  readonly group = new THREE.Group();
  readonly physics = new VehiclePhysics();
  readonly style: VehicleStyle;
  readonly color: number;

  private body = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private frontPivots: THREE.Group[] = [];
  private wheelSpin = 0;
  private rollVis = 0;
  private pitchVis = 0;

  /** Set false while AI drives this car kinematically. */
  simulatePhysics = true;

  constructor(style: VehicleStyle, color: number) {
    this.style = style;
    this.color = color;
    this.buildMesh();
    this.tuneForStyle();
  }

  private tuneForStyle(): void {
    const p = this.physics;
    switch (this.style) {
      case 'sports':
        p.topSpeed = 42;
        p.engineAccel = 18;
        p.gripNormal = 9.5;
        p.driftLatAccelThreshold = 14;
        break;
      case 'pickup':
      case 'van':
        p.topSpeed = 27;
        p.engineAccel = 11;
        p.gripNormal = 7.5;
        p.driftLatAccelThreshold = 10.5;
        break;
      case 'taxi':
      case 'sedan':
        break;
    }
  }

  private buildMesh(): void {
    const c = this.color;
    const body = this.body;
    const sporty = this.style === 'sports';
    const tall = this.style === 'van';

    // Chassis.
    const chassisH = sporty ? 0.42 : 0.52;
    const chassisY = 0.5;
    body.add(mesh(boxGeo(1.84, chassisH, 4.3), flatMat(c), 0, chassisY, 0));

    // Bumpers.
    body.add(mesh(boxGeo(1.7, 0.28, 0.3), flatMat(PALETTE.bumper), 0, 0.42, 2.2));
    body.add(mesh(boxGeo(1.7, 0.28, 0.3), flatMat(PALETTE.bumper), 0, 0.42, -2.2));

    // Cabin per style.
    if (this.style === 'pickup') {
      body.add(mesh(boxGeo(1.7, 0.62, 1.5), flatMat(c), 0, 1.05, 0.85));
      body.add(mesh(boxGeo(1.62, 0.5, 1.34), flatMat(PALETTE.glass), 0, 1.06, 0.8));
      // Open bed walls.
      body.add(mesh(boxGeo(1.7, 0.34, 0.12), flatMat(c), 0, 0.93, -2.05));
      body.add(mesh(boxGeo(0.12, 0.34, 1.9), flatMat(c), 0.79, 0.93, -1.1));
      body.add(mesh(boxGeo(0.12, 0.34, 1.9), flatMat(c), -0.79, 0.93, -1.1));
    } else if (tall) {
      body.add(mesh(boxGeo(1.78, 1.0, 3.4), flatMat(c), 0, 1.2, -0.3));
      body.add(mesh(boxGeo(1.66, 0.5, 3.1), flatMat(PALETTE.glass), 0, 1.35, -0.25));
    } else {
      const cabinLen = sporty ? 1.9 : 2.2;
      const cabinH = sporty ? 0.46 : 0.58;
      const cabinY = chassisY + chassisH / 2 + cabinH / 2 - 0.02;
      body.add(mesh(boxGeo(1.6, cabinH, cabinLen), flatMat(PALETTE.glass), 0, cabinY, -0.15));
      body.add(mesh(boxGeo(1.66, 0.1, cabinLen + 0.08), flatMat(c), 0, cabinY + cabinH / 2 + 0.04, -0.15));
      if (sporty) {
        // Rear spoiler.
        body.add(mesh(boxGeo(1.5, 0.07, 0.4), flatMat(c), 0, 0.95, -2.0));
      }
    }

    if (this.style === 'taxi') {
      body.add(mesh(boxGeo(0.7, 0.22, 0.32), flatMat(PALETTE.taxiYellow), 0, 1.42, -0.15));
    }

    // Lights (unlit "glow" materials).
    for (const s of [-1, 1]) {
      body.add(mesh(boxGeo(0.32, 0.14, 0.08), glowMat(PALETTE.headlight), s * 0.62, 0.62, 2.16));
      body.add(mesh(boxGeo(0.32, 0.14, 0.08), glowMat(PALETTE.taillight), s * 0.62, 0.62, -2.16));
    }

    this.group.add(body);

    // Wheels: front pair in steering pivot groups.
    const tireMat = flatMat(PALETTE.tire);
    const wGeo = wheelGeo(WHEEL_RADIUS, 0.26);
    const hubGeo = wheelGeo(0.16, 0.27);
    const hubMat = flatMat(PALETTE.hubcap);
    for (const [sx, sz] of [
      [-0.83, 1.35],
      [0.83, 1.35],
      [-0.83, -1.35],
      [0.83, -1.35],
    ] as const) {
      const front = sz > 0;
      const tire = new THREE.Mesh(wGeo, tireMat);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      tire.add(hub);
      this.wheels.push(tire);
      if (front) {
        const pivot = new THREE.Group();
        pivot.position.set(sx, WHEEL_RADIUS, sz);
        tire.position.set(0, 0, 0);
        pivot.add(tire);
        this.frontPivots.push(pivot);
        this.group.add(pivot);
      } else {
        tire.position.set(sx, WHEEL_RADIUS, sz);
        this.group.add(tire);
      }
    }
  }

  /** Place the car in the world without momentum. */
  placeAt(x: number, z: number, heading: number): void {
    this.physics.teleport(x, z, heading);
    this.syncTransform();
  }

  /** Pull renderable transform + cosmetic motion from the physics state. */
  updateVisuals(dt: number): void {
    this.syncTransform();

    const p = this.physics;
    this.wheelSpin += (p.forwardSpeed / WHEEL_RADIUS) * dt;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const piv of this.frontPivots) piv.rotation.y = -p.steerAngle;

    // Body roll from lateral slide, pitch from longitudinal acceleration.
    this.rollVis = damp(this.rollVis, clamp(p.lateralSpeed * 0.018, -0.09, 0.09), 8, dt);
    this.pitchVis = damp(this.pitchVis, clamp(-p.longAccel * 0.006, -0.05, 0.05), 6, dt);
    this.body.rotation.z = this.rollVis;
    this.body.rotation.x = this.pitchVis;
  }

  private syncTransform(): void {
    this.group.position.copy(this.physics.position);
    this.group.rotation.y = this.physics.heading;
  }

  /** World position of the driver door (left side). */
  getDoorPosition(out: THREE.Vector3): THREE.Vector3 {
    const fx = Math.sin(this.physics.heading);
    const fz = Math.cos(this.physics.heading);
    // Left = -right = (fz, -fx).
    out.set(
      this.physics.position.x + fz * 1.6,
      0,
      this.physics.position.z - fx * 1.6,
    );
    return out;
  }
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
