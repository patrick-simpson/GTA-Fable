import * as THREE from 'three';

interface Particle {
  el: HTMLDivElement;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
}

/**
 * Floating "+$400" / "HEAT++" text particles anchored to 3D world positions.
 * They drift upward and fade out over ~1.5 s.
 */
export class TextParticleSystem {
  private container: HTMLDivElement;
  private particles: Particle[] = [];
  private camera: THREE.Camera;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden;';
    document.body.appendChild(this.container);
  }

  spawn(text: string, worldX: number, worldZ: number, color: string): void {
    const el = document.createElement('div');
    el.className = 'text-particle';
    el.textContent = text;
    el.style.color = color;
    this.container.appendChild(el);

    // Project world pos to screen.
    const { sx, sy } = this.project(worldX, worldZ);

    const p: Particle = {
      el,
      x: sx,
      y: sy,
      vy: -60 - Math.random() * 30,
      life: 1.6,
      maxLife: 1.6,
    };
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    this.particles.push(p);
  }

  spawnScreen(text: string, sx: number, sy: number, color: string): void {
    const el = document.createElement('div');
    el.className = 'text-particle large';
    el.textContent = text;
    el.style.color = color;
    this.container.appendChild(el);

    const p: Particle = {
      el,
      x: sx,
      y: sy,
      vy: -40,
      life: 2.2,
      maxLife: 2.2,
    };
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    this.particles.push(p);
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.el.remove();
        this.particles.splice(i, 1);
        continue;
      }
      p.y += p.vy * dt;
      const alpha = Math.min(1, p.life / (p.maxLife * 0.3));
      p.el.style.transform = `translate(-50%, -50%) translateY(${p.y - (this.project(0,0).sy)}px)`;
      p.el.style.left = `${p.x}px`;
      p.el.style.top = `${p.y}px`;
      p.el.style.opacity = String(alpha.toFixed(3));
    }
  }

  private project(worldX: number, worldZ: number): { sx: number; sy: number } {
    const vec = new THREE.Vector3(worldX, 2, worldZ);
    vec.project(this.camera);
    return {
      sx: (vec.x * 0.5 + 0.5) * window.innerWidth,
      sy: (-vec.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  dispose(): void {
    this.container.remove();
  }
}
