import { clamp, damp } from '../utils/math';

/**
 * Tiny synthesized soundscape — no audio files. A sawtooth through a
 * lowpass fakes the engine (pitch follows RPM), and looped noise through a
 * bandpass screeches when the tires lose grip. The AudioContext is created
 * on the first user gesture (mobile autoplay policy).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private skidGain: GainNode | null = null;
  private muted = false;
  private rpm = 0;

  /** Call from the first pointer/key event. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    // ---- engine voice ----
    const master = ctx.createGain();
    master.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 1.2;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 27.5;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.5;

    osc.connect(filter);
    osc2.connect(osc2Gain).connect(filter);
    filter.connect(master).connect(ctx.destination);
    osc.start();
    osc2.start();

    this.engineGain = master;
    this.engineOsc = osc;
    this.engineOsc2 = osc2;

    // ---- tire screech voice ----
    const noiseLen = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 4;
    const skid = ctx.createGain();
    skid.gain.value = 0;
    noise.connect(band).connect(skid).connect(ctx.destination);
    noise.start();
    this.skidGain = skid;
  }

  /**
   * @param speed01 normalized speed 0..1
   * @param throttle 0..1
   * @param driving whether the player is in a car
   * @param skidding tire slip is loud
   */
  update(dt: number, speed01: number, throttle: number, driving: boolean, skidding: boolean): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineOsc2 || !this.skidGain) return;

    const targetRpm = driving ? clamp(speed01 * 0.85 + throttle * 0.25, 0.06, 1) : 0;
    this.rpm = damp(this.rpm, targetRpm, 3.5, dt);

    const freq = 50 + this.rpm * 190;
    this.engineOsc.frequency.value = freq;
    this.engineOsc2.frequency.value = freq / 2;

    const vol = this.muted || !driving ? 0 : 0.035 + this.rpm * 0.05;
    this.engineGain.gain.value = damp(this.engineGain.gain.value, vol, 8, dt);

    const skidVol = this.muted || !skidding ? 0 : 0.05;
    this.skidGain.gain.value = damp(this.skidGain.gain.value, skidVol, 10, dt);
  }

  /** Returns the new muted state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
