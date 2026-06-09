/**
 * Fixed-timestep accumulator. Physics always runs at 60 Hz regardless of the
 * display refresh rate; long frames are clamped so the simulation never
 * spirals after a tab switch.
 */
export class FixedClock {
  readonly step = 1 / 60;
  private accumulator = 0;
  private last = -1;
  /** Real time elapsed since last tick (for visual-only smoothing). */
  frameDelta = 0;

  /** Returns how many fixed steps to simulate this frame. */
  tick(nowSeconds: number): number {
    if (this.last < 0) {
      this.last = nowSeconds;
      return 1;
    }
    let delta = nowSeconds - this.last;
    this.last = nowSeconds;
    if (delta > 0.25) delta = 0.25;
    this.frameDelta = delta;
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= this.step && steps < 5) {
      this.accumulator -= this.step;
      steps++;
    }
    // Drop excess backlog rather than freezing the main thread.
    if (this.accumulator > this.step) this.accumulator = this.step;
    return steps;
  }

  /** Call after a pause so the next frame doesn't simulate the gap. */
  reset(): void {
    this.last = -1;
    this.accumulator = 0;
    this.frameDelta = 0;
  }
}
