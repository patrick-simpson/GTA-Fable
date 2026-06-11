import { clamp } from '../utils/math';

export type HeatTier = 0 | 1 | 2 | 3 | 4;

interface Intervention {
  label: string;
  heatCost: number;     // heat added when it triggers
  cooldown: number;     // seconds before it can fire again
  minHeat: number;
}

const INTERVENTIONS: Intervention[] = [
  { label: 'PATROL SPOTTED', heatCost: 0.08, cooldown: 20, minHeat: 0.25 },
  { label: 'ROADBLOCK AHEAD', heatCost: 0.12, cooldown: 35, minHeat: 0.50 },
  { label: 'HELICOPTER DEPLOYED', heatCost: 0.18, cooldown: 60, minHeat: 0.75 },
  { label: 'TACTICAL UNIT INCOMING', heatCost: 0.25, cooldown: 90, minHeat: 0.90 },
];

export class HeatSystem {
  private _heat = 0;          // 0..1
  private cooldownTimers: number[] = INTERVENTIONS.map(() => 0);
  private _alertFlash = 0;    // 0..1, drives the red screen overlay
  private _glitch = 0;        // seconds remaining

  onIntervention: ((label: string) => void) | null = null;

  get heat(): number { return this._heat; }
  get tier(): HeatTier {
    if (this._heat < 0.2) return 0;
    if (this._heat < 0.4) return 1;
    if (this._heat < 0.6) return 2;
    if (this._heat < 0.8) return 3;
    return 4;
  }
  get alertFlash(): number { return this._alertFlash; }
  get glitch(): number { return this._glitch; }

  add(amount: number): void {
    this._heat = clamp(this._heat + amount, 0, 1);
    if (amount > 0.05) this._glitch = Math.max(this._glitch, 0.6);
  }

  reduce(amount: number): void {
    this._heat = clamp(this._heat - amount, 0, 1);
  }

  update(dt: number): void {
    // Passive heat decay (slow — safety is earned by staying low).
    const decayRate = this._heat > 0.5 ? 0.004 : 0.012;
    this._heat = clamp(this._heat - decayRate * dt, 0, 1);

    // Flash animation: rapid sine pulse when heat ≥ 0.6.
    if (this._heat >= 0.6) {
      this._alertFlash = (Math.sin(Date.now() / 180) * 0.5 + 0.5) * ((this._heat - 0.6) / 0.4);
    } else {
      this._alertFlash = 0;
    }

    this._glitch = Math.max(0, this._glitch - dt);

    // Random aggressive interventions.
    for (let i = 0; i < INTERVENTIONS.length; i++) {
      const iv = INTERVENTIONS[i]!;
      this.cooldownTimers[i] = Math.max(0, this.cooldownTimers[i]! - dt);
      if (
        this._heat >= iv.minHeat &&
        this.cooldownTimers[i] === 0 &&
        Math.random() < 0.004 * dt * 60
      ) {
        this.cooldownTimers[i] = iv.cooldown;
        this.add(iv.heatCost);
        this._glitch = 1.2;
        this.onIntervention?.(iv.label);
      }
    }
  }
}
