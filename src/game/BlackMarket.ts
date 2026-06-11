import type { Economy } from './Economy';
import type { HeatSystem } from './HeatSystem';

export interface UpgradeItem {
  id: string;
  label: string;
  description: string;
  icon: string;           // SVG path id or emoji
  price: number;
  maxLevel: number;
  effect: string;
}

const CATALOG: UpgradeItem[] = [
  {
    id: 'heat_scrub',
    label: 'HEAT SCRUB',
    description: 'Flush surveillance data. Cuts active heat by 40%.',
    icon: 'scrub',
    price: 800,
    maxLevel: 99, // consumable
    effect: 'heat-40',
  },
  {
    id: 'turbo',
    label: 'TURBO KIT',
    description: 'Boosts engine output. +15% top speed.',
    icon: 'turbo',
    price: 1200,
    maxLevel: 3,
    effect: 'speed+15',
  },
  {
    id: 'grip',
    label: 'GRIP TIRES',
    description: 'Higher lateral friction. Reduces drift threshold.',
    icon: 'grip',
    price: 900,
    maxLevel: 3,
    effect: 'grip+20',
  },
  {
    id: 'scrambler',
    label: 'SIGNAL SCRAMBLER',
    description: 'Passive heat decay ×2. Stay dark longer.',
    icon: 'scrambler',
    price: 2000,
    maxLevel: 2,
    effect: 'decay×2',
  },
  {
    id: 'launder',
    label: 'LAUNDRY RUN',
    description: 'Convert dirty assets to clean cash (70 cents on the dollar).',
    icon: 'launder',
    price: 300,
    maxLevel: 99,
    effect: 'launder',
  },
  {
    id: 'armour',
    label: 'VEHICLE ARMOUR',
    description: 'Reduces collision damage and impact heat spikes.',
    icon: 'armour',
    price: 1500,
    maxLevel: 3,
    effect: 'armour+1',
  },
];

export interface UpgradeState {
  level: number;
}

export class BlackMarket {
  private owned = new Map<string, UpgradeState>();

  onPurchase: ((item: UpgradeItem) => void) | null = null;

  constructor(private economy: Economy, private heat: HeatSystem) {}

  get catalog(): UpgradeItem[] { return CATALOG; }

  level(id: string): number {
    return this.owned.get(id)?.level ?? 0;
  }

  canAfford(item: UpgradeItem): boolean {
    return this.economy.total >= item.price;
  }

  isMaxed(item: UpgradeItem): boolean {
    return this.level(item.id) >= item.maxLevel;
  }

  buy(item: UpgradeItem): boolean {
    if (!this.canAfford(item) || this.isMaxed(item)) return false;
    if (!this.economy.spend(item.price)) return false;

    const prev = this.owned.get(item.id);
    this.owned.set(item.id, { level: (prev?.level ?? 0) + 1 });

    this.applyEffect(item);
    this.onPurchase?.(item);
    return true;
  }

  private applyEffect(item: UpgradeItem): void {
    switch (item.effect) {
      case 'heat-40':
        this.heat.reduce(this.heat.heat * 0.4);
        break;
      case 'launder':
        this.economy.launder(1.0); // launder all dirty money
        break;
      // speed/grip/decay/armour effects are read by VehiclePhysics / HeatSystem
      // via getMultiplier() below — no direct mutation needed here.
    }
  }

  /** Returns a numeric multiplier for a given stat, composed from all owned upgrades. */
  getMultiplier(stat: 'speed' | 'grip' | 'decay' | 'armour'): number {
    let m = 1;
    if (stat === 'speed') m += this.level('turbo') * 0.15;
    if (stat === 'grip') m += this.level('grip') * 0.20;
    if (stat === 'decay') m += this.level('scrambler') * 1.0; // +100% per level → ×2 at L1, ×3 at L2
    if (stat === 'armour') m += this.level('armour') * 0.5;
    return m;
  }
}
