import { GRID, LANE_OFFSET, roadCenter } from '../world/CityLayout';
import { damp, dampAngle, randInt, wrapAngle } from '../utils/math';
import type { Vehicle } from './Vehicle';

interface Waypoint {
  x: number;
  z: number;
  /** Slow down approaching this point (it precedes a turn). */
  slow: boolean;
}

export interface Obstacle {
  x: number;
  z: number;
}

/**
 * Lightweight kinematic driver that cruises the road grid on right-hand
 * lanes, randomly turning at intersections and braking for anything ahead.
 * It writes straight into the car's VehiclePhysics state so the player can
 * jack the car and the handoff is seamless.
 */
export class TrafficAI {
  active = true;

  private axis: 'x' | 'z';
  private dir: 1 | -1;
  /** Index of the road line being driven (0..GRID). */
  private roadIdx: number;
  /** Index of the next intersection along the travel axis (0..GRID). */
  private nextCross: number;
  private waypoints: Waypoint[] = [];
  private speed = 0;
  private cruiseSpeed = 8.5;

  constructor(readonly vehicle: Vehicle, rng: () => number) {
    this.axis = rng() > 0.5 ? 'x' : 'z';
    this.dir = rng() > 0.5 ? 1 : -1;
    this.roadIdx = randInt(rng, 1, GRID - 1);
    this.nextCross = this.dir > 0 ? randInt(rng, 1, GRID - 1) : randInt(rng, 1, GRID - 1);
    this.rng = rng;

    // Start one segment before the first crossing, on the correct lane.
    const along = roadCenter(this.nextCross) - this.dir * 20;
    const lane = this.lanePos(this.axis, this.dir, this.roadIdx);
    if (this.axis === 'z') {
      this.vehicle.placeAt(lane, along, this.dir > 0 ? 0 : Math.PI);
    } else {
      this.vehicle.placeAt(along, lane, this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    this.vehicle.simulatePhysics = false;
    this.pushNextWaypoint();
  }

  private rng: () => number;

  /** Lane center for right-hand traffic on the given road. */
  private lanePos(axis: 'x' | 'z', dir: 1 | -1, roadIdx: number): number {
    const c = roadCenter(roadIdx);
    // Facing +Z right side is -X; facing +X right side is +Z (and mirrored).
    if (axis === 'z') return c - dir * LANE_OFFSET;
    return c + dir * LANE_OFFSET;
  }

  private pushNextWaypoint(): void {
    const crossCoord = roadCenter(this.nextCross);
    const lane = this.lanePos(this.axis, this.dir, this.roadIdx);

    // Decide what happens at the upcoming intersection.
    const atEdge = this.nextCross <= 0 || this.nextCross >= GRID;
    const roll = this.rng();
    const turning = atEdge || roll < 0.45;

    if (!turning) {
      // Approach point just past the intersection, keep cruising.
      const approach = crossCoord + this.dir * 0;
      this.waypoints.push(
        this.axis === 'z'
          ? { x: lane, z: approach, slow: false }
          : { x: approach, z: lane, slow: false },
      );
      this.nextCross += this.dir;
      if (this.nextCross < 0 || this.nextCross > GRID) {
        this.nextCross -= this.dir; // will force a turn next time
      }
      return;
    }

    // Turn: pick left or right (clamped so we never leave the grid).
    const newAxis: 'x' | 'z' = this.axis === 'z' ? 'x' : 'z';
    let newDir: 1 | -1 = this.rng() > 0.5 ? 1 : -1;
    const newRoadIdx = this.nextCross;
    // The crossing index on the new axis starts from our current road line.
    let newCross = this.roadIdx + newDir;
    if (newCross < 0 || newCross > GRID) {
      newDir = -newDir as 1 | -1;
      newCross = this.roadIdx + newDir;
    }

    const entryLane = this.lanePos(newAxis, newDir, newRoadIdx);
    // 1) slow approach point at the edge of the intersection
    const approach = crossCoord - this.dir * 4;
    // 2) exit point on the new road, past the intersection
    const exitAlong = roadCenter(this.roadIdx) + newDir * 8;
    if (this.axis === 'z') {
      this.waypoints.push({ x: lane, z: approach, slow: true });
      this.waypoints.push({ x: exitAlong, z: entryLane, slow: false });
    } else {
      this.waypoints.push({ x: approach, z: lane, slow: true });
      this.waypoints.push({ x: entryLane, z: exitAlong, slow: false });
    }

    this.axis = newAxis;
    this.dir = newDir;
    this.roadIdx = newRoadIdx;
    this.nextCross = newCross;
  }

  update(dt: number, obstacles: Obstacle[]): void {
    if (!this.active) return;
    const p = this.vehicle.physics;
    const wp = this.waypoints[0];
    if (!wp) {
      this.pushNextWaypoint();
      return;
    }

    const dx = wp.x - p.position.x;
    const dz = wp.z - p.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.2) {
      this.waypoints.shift();
      if (this.waypoints.length === 0) this.pushNextWaypoint();
      return;
    }

    // Heading eases toward the waypoint — corners become smooth arcs.
    const desired = Math.atan2(dx, dz);
    p.heading = dampAngle(p.heading, desired, 3.2, dt);

    // Speed control: slow for turns, stop for obstacles ahead.
    let target = wp.slow || Math.abs(wrapAngle(desired - p.heading)) > 0.5
      ? 3.5
      : this.cruiseSpeed;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    for (const o of obstacles) {
      const ox = o.x - p.position.x;
      const oz = o.z - p.position.z;
      const d = Math.hypot(ox, oz);
      if (d < 0.5 || d > 9) continue;
      const ahead = (ox * fx + oz * fz) / d;
      if (ahead > 0.78) {
        target = d < 5 ? 0 : Math.min(target, 2.5);
        break;
      }
    }

    const lambda = target < this.speed ? 5 : 1.6;
    this.speed = damp(this.speed, target, lambda, dt);

    p.position.x += fx * this.speed * dt;
    p.position.z += fz * this.speed * dt;
    p.velocity.set(fx * this.speed, 0, fz * this.speed);
    p.forwardSpeed = this.speed;
    p.steerAngle = 0;
  }

  /** Player jacked the car: hand the state to real physics and retire. */
  release(): void {
    this.active = false;
    this.vehicle.simulatePhysics = true;
  }
}
