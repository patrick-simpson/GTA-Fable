/**
 * Dynamic-origin virtual analog stick covering the left half of the screen.
 * The base appears wherever the finger lands; output is a normalized vector
 * with a dead zone. Pointer Events + capture make it multi-touch safe.
 */
export class VirtualJoystick {
  /** -1..1, right positive. */
  x = 0;
  /** -1..1, up (away from player) positive. */
  y = 0;
  active = false;

  private zone: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly radius = 52;
  private readonly deadZone = 0.14;

  constructor(uiRoot: HTMLElement) {
    this.zone = document.createElement('div');
    this.zone.className = 'joy-zone';

    const hint = document.createElement('div');
    hint.className = 'joy-hint';
    hint.textContent = 'MOVE';
    this.zone.appendChild(hint);

    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.zone.appendChild(this.base);

    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.zone.appendChild(this.knob);

    uiRoot.appendChild(this.zone);

    this.zone.addEventListener('pointerdown', this.onDown);
    this.zone.addEventListener('pointermove', this.onMove);
    this.zone.addEventListener('pointerup', this.onUp);
    this.zone.addEventListener('pointercancel', this.onUp);
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    this.originX = e.clientX;
    this.originY = e.clientY;
    this.active = true;
    this.base.style.display = 'block';
    this.knob.style.display = 'block';
    this.base.style.left = `${this.originX}px`;
    this.base.style.top = `${this.originY}px`;
    this.updateKnob(0, 0);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    let dx = (e.clientX - this.originX) / this.radius;
    let dy = (e.clientY - this.originY) / this.radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }

    // Dead zone with re-normalization so small inputs stay smooth.
    const mag = Math.min(len, 1);
    if (mag < this.deadZone) {
      this.x = 0;
      this.y = 0;
    } else {
      const scaled = (mag - this.deadZone) / (1 - this.deadZone);
      const inv = mag > 1e-6 ? scaled / mag : 0;
      this.x = dx * inv;
      this.y = -dy * inv;
    }
    this.updateKnob(dx, dy);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.base.style.display = 'none';
    this.knob.style.display = 'none';
  };

  private updateKnob(dx: number, dy: number): void {
    this.knob.style.left = `${this.originX + dx * this.radius}px`;
    this.knob.style.top = `${this.originY + dy * this.radius}px`;
  }

  dispose(): void {
    this.zone.remove();
  }
}
