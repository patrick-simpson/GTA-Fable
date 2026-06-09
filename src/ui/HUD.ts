/** Speedometer, mode badge, contextual prompt and the mute toggle. */
export class HUD {
  private speedVal: HTMLDivElement;
  private modeBadge: HTMLDivElement;
  private prompt: HTMLDivElement;
  private muteBtn: HTMLDivElement;
  private lastSpeed = -1;
  private promptText = '';

  onToggleMute: (() => boolean) | null = null;

  constructor(uiRoot: HTMLElement, public readonly topLeft: HTMLDivElement = document.createElement('div')) {
    this.topLeft.className = 'hud-top';
    uiRoot.appendChild(this.topLeft);

    this.modeBadge = document.createElement('div');
    this.modeBadge.className = 'mode-badge';
    this.modeBadge.textContent = 'ON FOOT';
    this.topLeft.appendChild(this.modeBadge);

    const speedo = document.createElement('div');
    speedo.className = 'speedo';
    this.speedVal = document.createElement('div');
    this.speedVal.className = 'val';
    this.speedVal.textContent = '0';
    const unit = document.createElement('div');
    unit.className = 'unit';
    unit.textContent = 'KM/H';
    speedo.appendChild(this.speedVal);
    speedo.appendChild(unit);
    uiRoot.appendChild(speedo);

    this.prompt = document.createElement('div');
    this.prompt.className = 'prompt';
    uiRoot.appendChild(this.prompt);

    this.muteBtn = document.createElement('div');
    this.muteBtn.className = 'mute-btn';
    this.muteBtn.textContent = '\u{1F50A}';
    this.muteBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.onToggleMute) {
        const muted = this.onToggleMute();
        this.muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
      }
    });
    uiRoot.appendChild(this.muteBtn);
  }

  setSpeed(kmh: number): void {
    const v = Math.round(kmh);
    if (v !== this.lastSpeed) {
      this.lastSpeed = v;
      this.speedVal.textContent = String(v);
    }
  }

  setMode(mode: 'walk' | 'drive'): void {
    this.modeBadge.textContent = mode === 'drive' ? 'DRIVING' : 'ON FOOT';
  }

  setPrompt(text: string | null): void {
    const t = text ?? '';
    if (t === this.promptText) return;
    this.promptText = t;
    if (t) {
      this.prompt.textContent = t;
      this.prompt.style.display = 'block';
    } else {
      this.prompt.style.display = 'none';
    }
  }
}
