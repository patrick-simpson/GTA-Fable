import type { Economy } from './Economy';
import type { HeatSystem } from './HeatSystem';
import { pick as _pick } from '../utils/math';

export interface GameEvent {
  id: string;
  label: string;
  description: string;
  icon: string;
  duration: number;            // seconds to complete
  heatOnAccept: number;
  cashReward: number;
  dirtyReward: number;
  heatReward: number;          // heat reduction on success
  requiresDriving: boolean;
}

const EVENT_POOL: GameEvent[] = [
  {
    id: 'data_heist',
    label: 'DATA HEIST',
    description: 'Intercept a corporate data convoy. Drive to extraction.',
    icon: '⬡',
    duration: 45,
    heatOnAccept: 0.15,
    cashReward: 0,
    dirtyReward: 1800,
    heatReward: 0,
    requiresDriving: true,
  },
  {
    id: 'street_race',
    label: 'STREET RACE',
    description: 'Underground circuit. Finish before the clock dies.',
    icon: '◈',
    duration: 30,
    heatOnAccept: 0.05,
    cashReward: 600,
    dirtyReward: 0,
    heatReward: 0,
    requiresDriving: true,
  },
  {
    id: 'courier_run',
    label: 'COURIER RUN',
    description: 'Off-grid package. No questions. Clean pay.',
    icon: '◆',
    duration: 25,
    heatOnAccept: 0,
    cashReward: 400,
    dirtyReward: 0,
    heatReward: 0.05,
    requiresDriving: false,
  },
  {
    id: 'blackout_protocol',
    label: 'BLACKOUT PROTOCOL',
    description: 'Kill the grid in sector 7. Maximum heat. Maximum payout.',
    icon: '⬟',
    duration: 60,
    heatOnAccept: 0.30,
    cashReward: 0,
    dirtyReward: 4200,
    heatReward: 0,
    requiresDriving: true,
  },
  {
    id: 'ghost_extract',
    label: 'GHOST EXTRACT',
    description: 'Rescue a compromised asset. No vehicle — stay low.',
    icon: '◇',
    duration: 40,
    heatOnAccept: 0.08,
    cashReward: 700,
    dirtyReward: 300,
    heatReward: 0.12,
    requiresDriving: false,
  },
  {
    id: 'fixer_drop',
    label: "FIXER'S DROP",
    description: "Dirty package. Don't ask. Don't stop.",
    icon: '◉',
    duration: 35,
    heatOnAccept: 0.10,
    cashReward: 0,
    dirtyReward: 2500,
    heatReward: 0,
    requiresDriving: true,
  },
];

type EventState = 'idle' | 'offered' | 'active' | 'success' | 'failed';

export class EventEngine {
  private state: EventState = 'idle';
  private current: GameEvent | null = null;
  private timer = 0;
  private offerTimer = 0;
  private idleTimer = 0;
  private rng = (): number => Math.random();

  onOffer: ((ev: GameEvent) => void) | null = null;
  onStart: ((ev: GameEvent) => void) | null = null;
  onComplete: ((ev: GameEvent, success: boolean) => void) | null = null;

  constructor(private economy: Economy, private heat: HeatSystem) {}

  get activeEvent(): GameEvent | null { return this.state === 'active' ? this.current : null; }
  get offeredEvent(): GameEvent | null { return this.state === 'offered' ? this.current : null; }
  get progress(): number {
    if (this.state !== 'active' || !this.current) return 0;
    return 1 - this.timer / this.current.duration;
  }
  get timeLeft(): number { return Math.ceil(this.timer); }

  update(dt: number): void {
    switch (this.state) {
      case 'idle':
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) {
          this.idleTimer = 18 + Math.random() * 22;
          this.offerEvent();
        }
        break;

      case 'offered':
        this.offerTimer -= dt;
        if (this.offerTimer <= 0) this.decline();
        break;

      case 'active':
        this.timer -= dt;
        if (this.timer <= 0) this.failEvent();
        break;
    }
  }

  private offerEvent(): void {
    // Prefer high-heat events when heat is elevated.
    const pool = this.heat.heat > 0.5
      ? EVENT_POOL.filter((e) => e.heatOnAccept > 0.1)
      : EVENT_POOL;
    this.current = _pick(this.rng, pool.length > 0 ? pool : EVENT_POOL);
    this.state = 'offered';
    this.offerTimer = 12; // 12 seconds to accept
    this.onOffer?.(this.current);
  }

  accept(): void {
    if (this.state !== 'offered' || !this.current) return;
    this.heat.add(this.current.heatOnAccept);
    this.timer = this.current.duration;
    this.state = 'active';
    this.onStart?.(this.current);
  }

  decline(): void {
    if (this.state !== 'offered') return;
    this.state = 'idle';
    this.idleTimer = 15 + Math.random() * 25;
    this.current = null;
  }

  completeActive(): void {
    if (this.state !== 'active' || !this.current) return;
    const ev = this.current;
    if (ev.cashReward > 0) this.economy.earn(ev.cashReward, false, ev.label, 0, 0);
    if (ev.dirtyReward > 0) this.economy.earn(ev.dirtyReward, true, ev.label, 0, 0);
    if (ev.heatReward > 0) this.heat.reduce(ev.heatReward);
    this.onComplete?.(ev, true);
    this.state = 'idle';
    this.idleTimer = 20 + Math.random() * 20;
    this.current = null;
  }

  private failEvent(): void {
    if (!this.current) return;
    this.heat.add(0.08); // penalty for blowing the mission
    this.onComplete?.(this.current, false);
    this.state = 'idle';
    this.idleTimer = 25 + Math.random() * 15;
    this.current = null;
  }
}
