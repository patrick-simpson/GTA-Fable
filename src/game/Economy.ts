import { clamp } from '../utils/math';

export interface Transaction {
  amount: number;
  dirty: boolean;
  label: string;
  x: number;
  z: number;
}

export class Economy {
  private _cash = 500;
  private _dirty = 0;

  onTransaction: ((tx: Transaction) => void) | null = null;

  get cash(): number { return this._cash; }
  get dirty(): number { return this._dirty; }
  get total(): number { return this._cash + this._dirty; }

  earn(amount: number, dirty: boolean, label: string, x: number, z: number): void {
    amount = Math.round(amount);
    if (dirty) {
      this._dirty += amount;
    } else {
      this._cash += amount;
    }
    this.onTransaction?.({ amount, dirty, label, x, z });
  }

  spend(amount: number): boolean {
    amount = Math.round(amount);
    const total = this._cash + this._dirty;
    if (total < amount) return false;
    // Spend dirty money first (laundering via the shop).
    const fromDirty = clamp(amount, 0, this._dirty);
    this._dirty -= fromDirty;
    this._cash -= amount - fromDirty;
    return true;
  }

  launder(fraction: number): void {
    const amount = Math.round(this._dirty * fraction);
    this._dirty -= amount;
    this._cash += Math.round(amount * 0.70); // 30% cut to the fixer
  }
}
