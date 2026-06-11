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
import { HeatSystem } from './game/HeatSystem';
import { Economy } from './game/Economy';
import { EventEngine } from './game/EventEngine';
import { BlackMarket } from './game/BlackMarket';
import { ScreenFX } from './fx/ScreenFX';
import { TextParticleSystem } from './fx/TextParticle';
import { mulberry32, pick } from './utils/math';

const ENTER_RANGE = 3.4;
const CAR_BODY_RADIUS = 1.45;

export class Game {
  private engine: Engine;
  private input: InputManager;
  private hud: HUD;
  private minimap: MiniMap;
  private audio = new AudioEngine();
  private clock = new FixedClock();
  private city: City;
  private chaseCam: ChaseCamera;
  private screenFX: ScreenFX;
  private particles: TextParticleSystem;

  private heat = new HeatSystem();
  private economy = new Economy();
  private eventEngine: EventEngine;
  private market: BlackMarket;

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
  private noticeTimer = 0;

  // Passive income while driving: earn small amounts over time.
  private driveEarnTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
    const uiRoot = document.getElementById('ui') as HTMLDivElement;

    this.eventEngine = new EventEngine(this.economy, this.heat);
    this.market = new BlackMarket(this.economy, this.heat);
    this.input = new InputManager(uiRoot);
    this.hud = new HUD(uiRoot, undefined, this.market, this.economy, this.heat, this.eventEngine);

    const rng = mulberry32(20260609);
    this.city = new City(this.engine.scene, this.engine.disposer, 1337);
    this.minimap = new MiniMap(this.hud.topLeft, this.city.blocks);
    this.chaseCam = new ChaseCamera(this.engine.camera, this.city.collision);

    this.screenFX = new ScreenFX(canvas, this.engine.camera);
    this.particles = new TextParticleSystem(this.engine.camera);

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

    // ---- rogue-lite callbacks ----
    this.economy.onTransaction = (tx) => {
      const pos = this.mode === 'drive' && this.currentVehicle
        ? this.currentVehicle.physics.position
        : this.character.position;
      const color = tx.dirty ? '#ff6af0' : '#00ffe0';
      const prefix = tx.dirty ? '⬡ +' : '$ +';
      this.particles.spawn(`${prefix}${tx.amount}`, pos.x, pos.z, color);
    };

    this.heat.onIntervention = (label) => {
      this.screenFX.shake(0.8);
      const cy = window.innerHeight * 0.35;
      this.particles.spawnScreen(`⚠ ${label}`, window.innerWidth / 2, cy, '#ff2a50');
    };

    this.eventEngine.onOffer = (ev) => {
      this.hud.showEventOffer(ev.label, ev.description, 12);
    };

    this.eventEngine.onStart = (ev) => {
      this.hud.showActiveMission(ev.label, 0, ev.duration);
      const color = ev.dirtyReward > 0 ? '#ff6af0' : '#00ffe0';
      this.particles.spawnScreen(`▶ ${ev.label}`, window.innerWidth / 2, window.innerHeight * 0.25, color);
    };

    this.eventEngine.onComplete = (ev, success) => {
      this.hud.hideBanner();
      const msg = success ? `✓ ${ev.label} — COMPLETE` : `✗ ${ev.label} — FAILED`;
      const color = success ? '#00ffe0' : '#ff2a50';
      if (success) this.screenFX.shake(0.5);
      else { this.heat.add(0.05); this.screenFX.shake(0.3); }
      this.particles.spawnScreen(msg, window.innerWidth / 2, window.innerHeight * 0.3, color);
    };

    this.hud.onAcceptEvent = () => this.eventEngine.accept();
    this.hud.onDeclineEvent = () => this.eventEngine.decline();

    this.hud.onBuyItem = (item) => {
      const bought = this.market.buy(item);
      if (bought) {
        this.screenFX.shake(0.3);
        this.particles.spawnScreen(`⬡ ${item.label}`, window.innerWidth / 2, window.innerHeight * 0.4, '#f0b800');
        this.applyMarketUpgrades();
      }
    };

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

  private onResize = (): void => { this.engine.resize(); };
  private onVisibility = (): void => {
    if (document.hidden) this.stop(); else this.start();
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
    this.heat.update(dt);
    this.eventEngine.update(dt);

    if (this.mode === 'foot') {
      this.updateOnFoot(dt);
    } else {
      this.updateDriving(dt);
    }

    for (const v of this.vehicles) {
      if (v === this.currentVehicle || !v.simulatePhysics) continue;
      if (v.physics.speed > 0.06) {
        v.physics.update(dt, ZERO_INPUT, this.city.collision);
      }
    }

    this.collectObstacles();
    for (const ai of this.traffic) ai.update(dt, this.obstacles);
    this.resolveVehicleContacts();
  }

  private updateOnFoot(dt: number): void {
    const yaw = this.chaseCam.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const mx = this.input.moveX, my = this.input.moveY;
    let moveX = fx * my + fz * mx;
    let moveZ = fz * my - fx * mx;
    const mag = Math.hypot(moveX, moveZ);
    if (mag > 1) { moveX /= mag; moveZ /= mag; }
    this.character.update(dt, moveX, moveZ, this.city.collision);

    for (const v of this.vehicles) {
      const hit = circleVsCircle(
        this.character.position.x, this.character.position.z, this.character.radius,
        v.physics.position.x, v.physics.position.z, CAR_BODY_RADIUS,
      );
      if (hit) {
        this.character.position.x += hit.nx * hit.depth;
        this.character.position.z += hit.nz * hit.depth;
      }
    }

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

    // Passive earnings while driving (clean street cred).
    this.driveEarnTimer -= dt;
    if (this.driveEarnTimer <= 0 && car.physics.speed > 5) {
      this.driveEarnTimer = 8;
      const amount = Math.round(15 + car.physics.speed * 1.2);
      const pos = car.physics.position;
      this.economy.earn(amount, false, 'STREET RUN', pos.x, pos.z);
    }

    // Ramming traffic adds heat.
    // (handled in resolveVehicleContacts via collision impulse magnitude)

    const slow = car.physics.speed < 6;
    this.input.setAction(true, 'EXIT');
    this.noticeTimer -= dt;
    if (this.noticeTimer <= 0 && !this.eventEngine.activeEvent) this.hud.setPrompt(null);

    if (this.input.consumeAction()) {
      if (slow) {
        this.exitVehicle();
      } else {
        this.hud.setPrompt('Slow down to exit');
        this.noticeTimer = 1.5;
      }
    }

    // Complete active event when driving fast for long enough (proxy objective).
    if (this.eventEngine.activeEvent && this.eventEngine.activeEvent.requiresDriving) {
      if (this.eventEngine.progress >= 1) {
        this.eventEngine.completeActive();
      }
    }
  }

  private findNearestVehicle(): Vehicle | null {
    let best: Vehicle | null = null;
    let bestDist = ENTER_RANGE;
    for (const v of this.vehicles) {
      if (v.physics.speed > 4) continue;
      const d = this.tmpVec.copy(v.physics.position).sub(this.character.position).length();
      if (d < bestDist) { best = v; bestDist = d; }
    }
    return best;
  }

  private enterVehicle(car: Vehicle): void {
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

    // Jacking a traffic car raises heat slightly.
    if (this.traffic.some((ai) => ai.vehicle === car)) {
      this.heat.add(0.06);
      this.screenFX.shake(0.4);
    }
  }

  private exitVehicle(): void {
    const car = this.currentVehicle;
    if (!car) return;
    car.physics.drifting = false;

    const p = car.physics.position;
    const fx = Math.sin(car.physics.heading), fz = Math.cos(car.physics.heading);
    const candidates: [number, number][] = [
      [p.x + fz * 2.0, p.z - fx * 2.0],
      [p.x - fz * 2.0, p.z + fx * 2.0],
      [p.x - fx * 3.4, p.z - fz * 3.4],
    ];
    let spot = candidates[0]!;
    for (const c of candidates) {
      const hit = { x: c[0], z: c[1], nx: 0, nz: 0, collided: false };
      this.city.collision.resolveCircle(c[0], c[1], this.character.radius, hit);
      if (!hit.collided) { spot = c; break; }
    }

    this.character.teleport(spot[0], spot[1], car.physics.heading);
    this.mode = 'foot';
    this.currentVehicle = null;
    this.player.setVisible(true);
    this.chaseCam.setMode('walk');
    this.hud.setMode('walk');
    this.hud.setPrompt(null);
  }

  private resolveVehicleContacts(): void {
    const player = this.currentVehicle;
    if (!player) return;
    for (const other of this.vehicles) {
      if (other === player) continue;
      const hit = circleVsCircle(
        player.physics.position.x, player.physics.position.z, CAR_BODY_RADIUS,
        other.physics.position.x, other.physics.position.z, CAR_BODY_RADIUS,
      );
      if (!hit) continue;

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
        const impact = Math.abs(closing);
        if (impact > 6) {
          for (const ai of this.traffic) {
            if (ai.vehicle === other && ai.active) ai.release();
          }
          // Hard crash: heat spike + screen shake.
          this.heat.add(0.04 + impact * 0.006);
          this.screenFX.shake(Math.min(impact / 20, 1.0));
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

  /** Re-apply BlackMarket upgrades to vehicle physics tuning. */
  private applyMarketUpgrades(): void {
    if (!this.currentVehicle) return;
    const speedMult = this.market.getMultiplier('speed');
    const gripMult = this.market.getMultiplier('grip');
    // Tuned vehicle: boost topSpeed + grip on the active vehicle.
    this.currentVehicle.physics.topSpeed = this.currentVehicle.physics.topSpeed * speedMult;
    this.currentVehicle.physics.gripNormal = this.currentVehicle.physics.gripNormal * gripMult;
  }

  // ------------------------------------------------------------------
  // presentation
  // ------------------------------------------------------------------

  private cameraTarget(): { position: THREE.Vector3; heading: number; speed: number } {
    if (this.mode === 'drive' && this.currentVehicle) {
      const p = this.currentVehicle.physics;
      return { position: p.position, heading: p.heading, speed: p.speed };
    }
    return { position: this.character.position, heading: this.character.heading, speed: this.character.speed };
  }

  private visualUpdate(dt: number): void {
    this.player.group.position.copy(this.character.position);
    this.player.group.rotation.y = this.character.heading;
    this.player.update(dt, this.mode === 'foot' ? this.character.speed : 0);

    for (const v of this.vehicles) v.updateVisuals(dt);

    this.chaseCam.update(dt, this.cameraTarget());

    const driving = this.mode === 'drive' && this.currentVehicle !== null;
    const speed = driving ? this.currentVehicle!.physics.speed : this.character.speed;
    this.hud.setSpeed(speed * 3.6);
    this.hud.setHeat(this.heat.heat, this.heat.tier);
    this.hud.setEconomy(this.economy.cash, this.economy.dirty);

    // Update active mission timer display.
    const active = this.eventEngine.activeEvent;
    if (active) {
      this.hud.showActiveMission(active.label, this.eventEngine.progress, this.eventEngine.timeLeft);
    }

    const focus = driving ? this.currentVehicle!.physics.position : this.character.position;
    const heading = driving ? this.currentVehicle!.physics.heading : this.character.heading;
    const blips = this.vehicles
      .filter((v) => v !== this.currentVehicle)
      .map((v) => ({ x: v.physics.position.x, z: v.physics.position.z, color: '#7fb8ff' }));
    this.minimap.update(focus.x, focus.z, heading, blips);

    // Screen FX.
    this.screenFX.update(dt, this.heat.alertFlash, this.heat.glitch > 0);
    this.particles.update(dt);

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
    this.screenFX.dispose();
    this.particles.dispose();
    this.city.dispose(this.engine.scene);
    this.engine.dispose();
  }
}
