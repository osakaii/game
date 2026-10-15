import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SURFACES } from '@mecha/shared';
import { surfaceColor, surfaceTexture } from '../../src/world/surfaces';

describe('surfaces', () => {
  it('plain paint has no texture', () => {
    expect(surfaceTexture('paint')).toBeNull();
  });

  it.each(SURFACES.filter((s) => s !== 'paint'))('%s is a light, tileable pattern that tints well', (id) => {
    const surface = surfaceTexture(id)!;
    expect(surface.pixels).toHaveLength(surface.size * surface.size * 4);
    let sum = 0;
    let min = 255;
    let max = 0;
    for (let i = 0; i < surface.pixels.length; i += 4) {
      sum += surface.pixels[i];
      min = Math.min(min, surface.pixels[i]);
      max = Math.max(max, surface.pixels[i]);
    }
    // Светлый в среднем: цвет блока остаётся узнаваемым, рисунок лишь оживляет его.
    expect(sum / (surface.pixels.length / 4)).toBeGreaterThan(180);
    // И это действительно рисунок, а не ровная заливка.
    expect(max - min).toBeGreaterThan(20);
  });

  it('is generated the same way every time (same on every device)', () => {
    expect(surfaceTexture('wood')).toBe(surfaceTexture('wood')); // кэш
  });

  it('eyedropper color = pattern texel × block color, and tiles repeat', () => {
    const tiles = surfaceTexture('tiles')!;
    const tint = new THREE.Color('#ff0000');
    // Угол плитки — светлая затирка нет: (0,0) — шов (тёмный), середина плитки — светлая.
    const grout = surfaceColor(tiles, 0.001, 0.001, tint);
    const tile = surfaceColor(tiles, 0.125, 0.125, tint);
    expect(tile.r).toBeGreaterThan(grout.r);
    expect(tile.g).toBe(0); // красный блок остаётся красным
    // u = 1.125 — то же место следующего повтора.
    expect(surfaceColor(tiles, 1.125, 0.125, tint).r).toBeCloseTo(tile.r, 6);
  });
});
