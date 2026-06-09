import * as THREE from 'three';
import { Engine } from './core/Engine';
import { FixedClock } from './core/Time';
import { InputManager } from './input/InputManager';
import { City } from './world/City';
import { PALETTE } from './world/palette';
import { Player } from './entities/Player';
import { Vehicle, type VehicleStyle } from './entities/Vehicle';
import { TrafficAI, type Obstacle } from './entities/TrafficCar';
import { CharacterPhysics } from './physics/CharacterPhysics';
import { ZERO_INPUT, type VehicleInput } from './physics/VehiclePhysics';
import { circleVsCircle } from './physics/Collision';
import { ChaseCamera } from './camera/ChaseCamera';
import { HUD } from './ui/HUD';
import { MiniMap } from './ui/MiniMap';
import { AudioEngine } from './audio/AudioEngine';
import { mulberry32, pick } from './utils/math';

const ENTER_RANGE = 3.4;
const CAR_BODY_RADIUS = 1.45;

/**
 * Orchestrator: owns the fixed-timestep loop and the ON_FOOT / DRIVING
 * state machine, wires input → physics → camera → HUD, and manages the
 * full lifecycle (pause on tab switch, dispose on teardown).
 */
export class Game {
  private engine: Engine;
  private input: InputManager;
  private hud: HUD;
  private minimap: MiniMap;
  private audio = new AudioEngine();
  private clock = new FixedClock();
  private city: City;
  private chaseCam: ChaseCamera;

  private player: Player;
  private character = new CharacterPhysics();
  private vehicles: Vehicle[] = [];
  private traffic: TrafficAI[] = [];

  private mode: 'foot' | 'drive' = 'foot';
  private currentVehicle: Vehicle | null = null;
  private nearestVehicle: Vehicle | null = null;

  private rafId = 0;
  private running = false;
  private disposed = false;

  private driveInput: VehicleInput = { throttle: 0, brake: 0, steer: 0 };
  private tmpVec = new THREE.Vector3();
  private obstacles: Obstacle[] = [];
  /** Seconds left to keep a transient HUD message on screen. */
  private noticeTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
    const uiRoot = document.getElementById('ui') as HTMLDivElement;
    this.input = new InputManager(uiRoot);
    this.hud = new HUD(uiRoot);

    const rng = mulberry32(20260609);
    this.city = new City(this.engine.scene, this.engine.disposer, 1337);
    this.minimap = new MiniMap(this.hud.topLeft, this.city.blocks);
    this.chaseCam = new ChaseCamera(this.engine.camera, this.city.collision);

    // ---- player ----
    this.player = new Player(rng);
    this.character.teleport(this.city.spawn.x, this.city.spawn.z, Math.PI);
    this.engine.scene.add(this.player.group);

    // ---- parked cars ----
    const styles: VehicleStyle[] = ['sedan', 'sedan', 'sports', 'taxi', 'pickup', 'van'];
    for (const spot of this.city.parkingSpots) {
      const style = pick(rng, styles);
      const color = style === 'taxi' ? PALETTE.taxiYellow : pick(rng, PALETTE.carColors);
      const car = new Vehicle(style, color);
      car.placeAt(spot.x, spot.z, spot.heading);
      this.vehicles.push(car);
      this.engine.scene.add(car.group);
    }

    // ---- roaming traffic ----
    for (let i = 0; i < 6; i++) {
      const style = pick(rng, styles);
      const color = style === 'taxi' ? PALETTE.taxiYellow : pick(rng, PALETTE.carColors);
      const car = new Vehicle(style, color);
      this.vehicles.push(car);
      this.engine.scene.add(car.group);
      this.traffic.push(new TrafficAI(car, rng));
    }

    this.input.onFirstInteraction = () => this.audio.unlock();
    this.hud.onToggleMute = () => this.audio.toggleMute();

    this.chaseCam.snap(this.cameraTarget());

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.reset();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private onResize = (): void => {
    this.engine.resize();
  };

  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private frame = (timeMs: number): void => {
    if (!this.running) return;
    const steps = this.clock.tick(timeMs / 1000);
    for (let i = 0; i < steps; i++) this.fixedUpdate(this.clock.step);
    this.visualUpdate(this.clock.frameDelta || this.clock.step);
    this.engine.render();
    this.rafId = requestAnimationFrame(this.frame);
  };

  // ------------------------------------------------------------------
  // simulation
  // ------------------------------------------------------------------

  private fixedUpdate(dt: number): void {
    if (this.mode === 'foot') {
      this.updateOnFoot(dt);
    } else {
      this.updateDriving(dt);
    }

    // Idle physics for shoved/abandoned cars so they roll to a stop.
    for (const v of this.vehicles) {
      if (v === this.currentVehicle || !v.simulatePhysics) continue;
      if (v.physics.speed > 0.06) {
        v.physics.update(dt, ZERO_INPUT, this.city.collision);
      }
    }

    // Traffic AI (skips cars the player has jacked).
    this.collectObstacles();
    for (const ai of this.traffic) ai.update(dt, this.obstacles);

    this.resolveVehicleContacts();
  }

  private updateOnFoot(dt: number): void {
    // Camera-relative movement: joystick up walks away from the camera.
    const yaw = this.chaseCam.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const mx = this.input.moveX;
    const my = this.input.moveY;
    let moveX = fx * my + fz * mx;
    let moveZ = fz * my - fx * mx;
    const mag = Math.hypot(moveX, moveZ);
    if (mag > 1) {
      moveX /= mag;
      moveZ /= mag;
    }
    this.character.update(dt, moveX, moveZ, this.city.collision);

    // Keep pedestrians out of car bodies.
    for (const v of this.vehicles) {
      const hit = circleVsCircle(
        this.character.position.x,
        this.character.position.z,
        this.character.radius,
        v.physics.position.x,
        v.physics.position.z,
        CAR_BODY_RADIUS,
      );
      if (hit) {
        this.character.position.x += hit.nx * hit.depth;
        this.character.position.z += hit.nz * hit.depth;
      }
    }

    // Door proximity → context action.
    this.nearestVehicle = this.findNearestVehicle();
    const near = this.nearestVehicle !== null;
    this.input.setAction(near, 'ENTER');
    this.hud.setPrompt(near ? 'Press ENTER to drive' : null);

    if (this.input.consumeAction() && this.nearestVehicle) {
      this.enterVehicle(this.nearestVehicle);
    }
  }

  private updateDriving(dt: number): void {
    const car = this.currentVehicle;
    if (!car) return;

    this.driveInput.throttle = this.input.throttle;
    this.driveInput.brake = this.input.brake;
    this.driveInput.steer = this.input.steer;
    car.physics.update(dt, this.driveInput, this.city.collision);

    const slow = car.physics.speed < 6;
    this.input.setAction(true, 'EXIT');
    this.noticeTimer -= dt;
    if (this.noticeTimer <= 0) this.hud.setPrompt(null);

    if (this.input.consumeAction()) {
      if (slow) {
        this.exitVehicle();
      } else {
        this.hud.setPrompt('Slow down to exit');
        this.noticeTimer = 1.5;
      }
    }
  }

  private findNearestVehicle(): Vehicle | null {
    let best: Vehicle | null = null;
    let bestDist = ENTER_RANGE;
    for (const v of this.vehicles) {
      // Don't jack cars that are driving past at speed.
      if (v.physics.speed > 4) continue;
      const d = this.tmpVec
        .copy(v.physics.position)
        .sub(this.character.position)
        .length();
      if (d < bestDist) {
        best = v;
        bestDist = d;
      }
    }
    return best;
  }

  private enterVehicle(car: Vehicle): void {
    // If an AI was driving it, hand control over permanently.
    for (const ai of this.traffic) {
      if (ai.vehicle === car && ai.active) ai.release();
    }
    this.mode = 'drive';
    this.currentVehicle = car;
    this.player.setVisible(false);
    this.chaseCam.setMode('drive');
    this.hud.setMode('drive');
    this.hud.setPrompt(null);
    this.input.setAction(true, 'EXIT');
  }

  private exitVehicle(): void {
    const car = this.currentVehicle;
    if (!car) return;
    car.physics.drifting = false;

    // Try the driver door, then the right side, then behind the car.
    const p = car.physics.position;
    const fx = Math.sin(car.physics.heading);
    const fz = Math.cos(car.physics.heading);
    const candidates: [number, number][] = [
      [p.x + fz * 2.0, p.z - fx * 2.0], // left door
      [p.x - fz * 2.0, p.z + fx * 2.0], // right door
      [p.x - fx * 3.4, p.z - fz * 3.4], // behind
    ];
    let spot = candidates[0]!;
    for (const c of candidates) {
      const hit = { x: c[0], z: c[1], nx: 0, nz: 0, collided: false };
      this.city.collision.resolveCircle(c[0], c[1], this.character.radius, hit);
      if (!hit.collided) {
        spot = c;
        break;
      }
    }

    this.character.teleport(spot[0], spot[1], car.physics.heading);
    this.mode = 'foot';
    this.currentVehicle = null;
    this.player.setVisible(true);
    this.chaseCam.setMode('walk');
    this.hud.setMode('walk');
    this.hud.setPrompt(null);
  }

  /** Car-vs-car contacts: separate bodies and kill closing velocity. */
  private resolveVehicleContacts(): void {
    const player = this.currentVehicle;
    if (!player) return;
    for (const other of this.vehicles) {
      if (other === player) continue;
      const hit = circleVsCircle(
        player.physics.position.x,
        player.physics.position.z,
        CAR_BODY_RADIUS,
        other.physics.position.x,
        other.physics.position.z,
        CAR_BODY_RADIUS,
      );
      if (!hit) continue;

      // Split the separation between both cars and shove the victim.
      player.physics.position.x += hit.nx * hit.depth * 0.5;
      player.physics.position.z += hit.nz * hit.depth * 0.5;
      other.physics.position.x -= hit.nx * hit.depth * 0.5;
      other.physics.position.z -= hit.nz * hit.depth * 0.5;

      const rvx = player.physics.velocity.x - other.physics.velocity.x;
      const rvz = player.physics.velocity.z - other.physics.velocity.z;
      const closing = rvx * hit.nx + rvz * hit.nz;
      if (closing < 0) {
        const impulse = closing * 0.55;
        player.physics.velocity.x -= hit.nx * impulse;
        player.physics.velocity.z -= hit.nz * impulse;
        other.physics.velocity.x += hit.nx * impulse;
        other.physics.velocity.z += hit.nz * impulse;
        other.simulatePhysics = true;
        // A rammed AI car stops being driven by its lane logic.
        for (const ai of this.traffic) {
          if (ai.vehicle === other && ai.active && Math.abs(closing) > 6) ai.release();
        }
      }
    }
  }

  private collectObstacles(): void {
    this.obstacles.length = 0;
    for (const v of this.vehicles) {
      this.obstacles.push({ x: v.physics.position.x, z: v.physics.position.z });
    }
    if (this.mode === 'foot') {
      this.obstacles.push({ x: this.character.position.x, z: this.character.position.z });
    }
  }

  // ------------------------------------------------------------------
  // presentation
  // ------------------------------------------------------------------

  private cameraTarget(): { position: THREE.Vector3; heading: number; speed: number } {
    if (this.mode === 'drive' && this.currentVehicle) {
      const p = this.currentVehicle.physics;
      return { position: p.position, heading: p.heading, speed: p.speed };
    }
    return {
      position: this.character.position,
      heading: this.character.heading,
      speed: this.character.speed,
    };
  }

  private visualUpdate(dt: number): void {
    // Player mesh follows its physics body.
    this.player.group.position.copy(this.character.position);
    this.player.group.rotation.y = this.character.heading;
    this.player.update(dt, this.mode === 'foot' ? this.character.speed : 0);

    for (const v of this.vehicles) v.updateVisuals(dt);

    this.chaseCam.update(dt, this.cameraTarget());

    // HUD + minimap.
    const driving = this.mode === 'drive' && this.currentVehicle !== null;
    const speed = driving ? this.currentVehicle!.physics.speed : this.character.speed;
    this.hud.setSpeed(speed * 3.6);

    const focus = driving ? this.currentVehicle!.physics.position : this.character.position;
    const heading = driving ? this.currentVehicle!.physics.heading : this.character.heading;
    const blips = this.vehicles
      .filter((v) => v !== this.currentVehicle)
      .map((v) => ({
        x: v.physics.position.x,
        z: v.physics.position.z,
        color: '#7fb8ff',
      }));
    this.minimap.update(focus.x, focus.z, heading, blips);

    // Audio.
    const skidding = driving && this.currentVehicle!.physics.drifting && speed > 8;
    this.audio.update(
      dt,
      driving ? speed / this.currentVehicle!.physics.topSpeed : 0,
      driving ? this.input.throttle : 0,
      driving,
      skidding,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.input.dispose();
    this.minimap.dispose();
    this.audio.dispose();
    this.city.dispose(this.engine.scene);
    this.engine.dispose();
  }
}
