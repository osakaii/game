import * as THREE from 'three';
import type { BodyZone } from '@mecha/shared';
import { FACES, type FaceId, type SkinAtlas } from './atlas';

/**
 * Кожа персонажа — текстура, натянутая на модель через атлас.
 *
 * На этапе П1 рисуем на обычном <canvas> (2D API) и отдаём его видеокарте как CanvasTexture.
 * На следующих этапах кисть будет рисовать прямо на видеокарте, но атлас и UV останутся теми же.
 */
export class SkinTexture {
  /** null вне браузера (тесты в Node): там нет canvas, рисование пропускается. */
  readonly canvas: HTMLCanvasElement | null;
  readonly texture: THREE.Texture;
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(private readonly atlas: SkinAtlas) {
    this.canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    if (this.canvas) this.canvas.width = this.canvas.height = atlas.size;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    this.texture = this.canvas ? new THREE.CanvasTexture(this.canvas) : new THREE.Texture();
    // Цвета в canvas — sRGB, как и строки '#rrggbb'. Без этого цвета на модели вышли бы бледнее.
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // Анизотропная фильтрация — чётче на гранях под острым углом к камере.
    this.texture.anisotropy = 4;
  }

  /** Залить все грани части тела одним цветом — вместе с отступом вокруг граней. */
  fillPart(part: BodyZone, color: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = this.atlas.padding;
    ctx.fillStyle = color;
    for (const r of this.atlas.rects) {
      if (r.part === part) ctx.fillRect(r.x - p, r.y - p, r.w + p * 2, r.h + p * 2);
    }
    this.texture.needsUpdate = true; // перезалить картинку в видеопамять
  }

  /**
   * Отладочный узор: шахматка, подпись грани и стрелка «вверх по текстуре».
   * На модели сразу видно, нет ли растяжений (клетки квадратные) и куда смотрит «верх» каждой грани.
   */
  drawDebugPattern(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = '#20232c';
    ctx.fillRect(0, 0, this.atlas.size, this.atlas.size);
    const cell = Math.max(4, Math.round(this.atlas.density * 0.05)); // клетка 5 см
    for (const r of this.atlas.rects) {
      const hue = (FACES.indexOf(r.face) * 60 + partHue(r.part)) % 360;
      for (let y = 0; y < r.h; y += cell) {
        for (let x = 0; x < r.w; x += cell) {
          const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
          ctx.fillStyle = `hsl(${hue} 70% ${dark ? 45 : 65}%)`;
          ctx.fillRect(r.x + x, r.y + y, Math.min(cell, r.w - x), Math.min(cell, r.h - y));
        }
      }
      drawArrowAndLabel(ctx, r.x, r.y, r.w, r.h, `${r.part}.${r.face}`, r.face);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

function partHue(part: BodyZone): number {
  return { head: 0, torso: 30, armLeft: 200, armRight: 220, legLeft: 120, legRight: 140 }[part];
}

function drawArrowAndLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  face: FaceId,
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const len = Math.min(w, h) * 0.35;
  ctx.strokeStyle = ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, len * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx, cy + len);
  ctx.lineTo(cx, cy - len);
  ctx.moveTo(cx - len * 0.4, cy - len * 0.55);
  ctx.lineTo(cx, cy - len);
  ctx.lineTo(cx + len * 0.4, cy - len * 0.55);
  ctx.stroke();
  // Подпись — только если влезает.
  if (w > 40) {
    ctx.font = `${Math.max(7, Math.min(11, w / 9))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(face === 'pz' || face === 'nz' || w > 70 ? label : face, cx, y + h - 3);
  }
}
