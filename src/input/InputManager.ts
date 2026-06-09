import { VirtualJoystick } from './VirtualJoystick';
import { TouchButtons } from './TouchButtons';
import { clamp } from '../utils/math';

/**
 * Merges the touch overlay with a desktop keyboard fallback
 * (WASD / arrows to move & steer, W/Up = gas, S/Down = brake,
 * E or Enter = action) into one unified input state.
 */
export class InputManager {
  readonly joystick: VirtualJoystick;
  readonly buttons: TouchButtons;

  private keys = new Set<string>();
  private actionQueued = false;
  /** Fires on the very first interaction — used to unlock WebAudio. */
  onFirstInteraction: (() => void) | null = null;
  private interacted = false;

  constructor(uiRoot: HTMLElement) {
    this.joystick = new VirtualJoystick(uiRoot);
    this.buttons = new TouchButtons(uiRoot);
    this.buttons.onAction = () => {
      this.actionQueued = true;
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onAnyPointer);
  }

  private onAnyPointer = (): void => {
    if (!this.interacted) {
      this.interacted = true;
      this.onFirstInteraction?.();
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.interacted) {
      this.interacted = true;
      this.onFirstInteraction?.();
    }
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === 'e' || k === 'enter') this.actionQueued = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  /** Steering for driving mode: -1 (left) .. 1 (right). */
  get steer(): number {
    let v = this.joystick.x;
    if (this.keys.has('a') || this.keys.has('arrowleft')) v -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) v += 1;
    return clamp(v, -1, 1);
  }

  /** Screen-space movement vector for walking mode (x right, y forward). */
  get moveX(): number {
    let v = this.joystick.x;
    if (this.keys.has('a') || this.keys.has('arrowleft')) v -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) v += 1;
    return clamp(v, -1, 1);
  }

  get moveY(): number {
    let v = this.joystick.y;
    if (this.keys.has('w') || this.keys.has('arrowup')) v += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) v -= 1;
    return clamp(v, -1, 1);
  }

  get throttle(): number {
    let v = this.buttons.throttle;
    if (this.keys.has('w') || this.keys.has('arrowup')) v = 1;
    return v;
  }

  get brake(): number {
    let v = this.buttons.brake;
    if (this.keys.has('s') || this.keys.has('arrowdown') || this.keys.has(' ')) v = 1;
    return v;
  }

  /** Edge-triggered: true exactly once per action press. */
  consumeAction(): boolean {
    const a = this.actionQueued;
    this.actionQueued = false;
    return a;
  }

  setAction(available: boolean, label: string): void {
    this.buttons.setAction(available, label);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerdown', this.onAnyPointer);
    this.joystick.dispose();
    this.buttons.dispose();
  }
}
