/**
 * Right-side touch controls: large GAS and BRAKE buttons plus a
 * context-sensitive ACTION button (enter/exit car). Each button tracks its
 * own pointer id so multi-touch chords (gas + steer + action) work.
 */
export class TouchButtons {
  throttle = 0;
  brake = 0;
  onAction: (() => void) | null = null;

  private stack: HTMLDivElement;
  private actionEl: HTMLDivElement;

  constructor(uiRoot: HTMLElement) {
    this.stack = document.createElement('div');
    this.stack.className = 'btn-stack';
    uiRoot.appendChild(this.stack);

    this.actionEl = this.makeButton('btn-action', 'ENTER', () => {
      if (this.actionEl.classList.contains('available') && this.onAction) {
        this.onAction();
      }
    });
    this.makeHoldButton('btn-brake', 'BRAKE', (v) => (this.brake = v));
    this.makeHoldButton('btn-gas', 'GAS', (v) => (this.throttle = v));
  }

  /** Highlight + arm the action button, updating its label. */
  setAction(available: boolean, label: string): void {
    this.actionEl.classList.toggle('available', available);
    if (this.actionEl.textContent !== label) this.actionEl.textContent = label;
  }

  private makeButton(cls: string, label: string, onPress: () => void): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `touch-btn ${cls}`;
    el.textContent = label;
    let pid: number | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      e.preventDefault();
      pid = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('pressed');
      onPress();
    });
    const release = (e: PointerEvent): void => {
      if (e.pointerId !== pid) return;
      pid = null;
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    this.stack.appendChild(el);
    return el;
  }

  private makeHoldButton(cls: string, label: string, set: (v: number) => void): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `touch-btn ${cls}`;
    el.textContent = label;
    let pid: number | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      e.preventDefault();
      pid = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('pressed');
      set(1);
    });
    const release = (e: PointerEvent): void => {
      if (e.pointerId !== pid) return;
      pid = null;
      el.classList.remove('pressed');
      set(0);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    this.stack.appendChild(el);
    return el;
  }

  dispose(): void {
    this.stack.remove();
  }
}
