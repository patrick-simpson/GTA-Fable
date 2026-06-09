import {
  BLOCK,
  CITY_SIZE,
  GRID,
  HALF,
  ROAD,
  blockMin,
  roadCenter,
  type BlockInfo,
} from '../world/CityLayout';

export interface Blip {
  x: number;
  z: number;
  color: string;
}

const SCALE = 0.8; // pixels per meter on the pre-rendered map
const VIEW = 132; // on-screen canvas size (CSS px)

/**
 * GTA-style circular minimap. The static city is rasterized once to an
 * offscreen canvas; each frame we just blit the region around the player
 * (north-up) and stamp blips on top.
 */
export class MiniMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapImage: HTMLCanvasElement;

  constructor(parent: HTMLElement, blocks: BlockInfo[]) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = VIEW * dpr;
    this.canvas.height = VIEW * dpr;
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    ctx.scale(dpr, dpr);

    this.mapImage = this.renderStaticMap(blocks);
  }

  private renderStaticMap(blocks: BlockInfo[]): HTMLCanvasElement {
    const size = Math.ceil(CITY_SIZE * SCALE);
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const c = off.getContext('2d')!;

    // World (x,z) → map pixel: px = (x + HALF) * SCALE.
    c.fillStyle = '#2a2d38';
    c.fillRect(0, 0, size, size);

    // Roads.
    c.fillStyle = '#555a66';
    for (let i = 0; i <= GRID; i++) {
      const p = (roadCenter(i) + HALF) * SCALE;
      const w = ROAD * SCALE;
      c.fillRect(p - w / 2, 0, w, size);
      c.fillRect(0, p - w / 2, size, w);
    }

    // Special blocks.
    for (const b of blocks) {
      if (b.type === 'buildings') continue;
      c.fillStyle = b.type === 'park' ? '#4d7a4a' : '#8d8576';
      const px = (blockMin(b.ix) + HALF) * SCALE;
      const pz = (blockMin(b.iz) + HALF) * SCALE;
      c.fillRect(px, pz, BLOCK * SCALE, BLOCK * SCALE);
    }
    return off;
  }

  update(px: number, pz: number, heading: number, blips: Blip[]): void {
    const ctx = this.ctx;
    const half = VIEW / 2;

    ctx.save();
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#1c1f29';
    ctx.fillRect(0, 0, VIEW, VIEW);

    // Blit the pre-rendered city centered on the player (north-up).
    const mapX = (px + HALF) * SCALE;
    const mapZ = (pz + HALF) * SCALE;
    ctx.drawImage(this.mapImage, half - mapX, half - mapZ);

    // Vehicle blips.
    for (const b of blips) {
      const bx = half + (b.x - px) * SCALE;
      const bz = half + (b.z - pz) * SCALE;
      if (bx < -4 || bx > VIEW + 4 || bz < -4 || bz > VIEW + 4) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(bx, bz, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player arrow. Canvas y points down and world heading 0 faces +Z, so
    // rotating by (PI - heading) makes an up-drawn triangle point correctly.
    ctx.translate(half, half);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  dispose(): void {
    this.canvas.remove();
  }
}
