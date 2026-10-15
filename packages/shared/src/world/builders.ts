import type { MapBox } from './map.js';

/**
 * Строительные блоки для карт. Карта — просто массив коробок,
 * поэтому сложные предметы — это функции, возвращающие несколько коробок.
 */

/** Стол: столешница + 4 ножки, каждая — отдельный коллайдер. Залезть можно прыжком. */
export function table(x: number, z: number, w: number, d: number, h: number, color: string): MapBox[] {
  const top = 0.15;
  const leg = 0.15;
  const lx = w / 2 - leg / 2;
  const lz = d / 2 - leg / 2;
  return [
    { x, z, y: h - top, w, h: top, d, color, surface: 'wood', shape: 'rounded', round: 0.04 },
    { x: x - lx, z: z - lz, w: leg, h: h - top, d: leg, color, surface: 'wood' },
    { x: x + lx, z: z - lz, w: leg, h: h - top, d: leg, color, surface: 'wood' },
    { x: x - lx, z: z + lz, w: leg, h: h - top, d: leg, color, surface: 'wood' },
    { x: x + lx, z: z + lz, w: leg, h: h - top, d: leg, color, surface: 'wood' },
  ];
}

/** Лестница вдоль +X из ступеней высотой 0.3 — по ним можно зайти без прыжка (step-up). */
export function stairs(x: number, z: number, steps: number, color: string): MapBox[] {
  const result: MapBox[] = [];
  for (let i = 0; i < steps; i++) {
    result.push({ x: x + i, z, w: 1, h: 0.3 * (i + 1), d: 2, color });
  }
  return result;
}

/** Дерево: ствол и крона. Крона висит выше роста игрока — под ней можно пройти. */
export function tree(x: number, z: number, trunkColor: string, leavesColor: string): MapBox[] {
  return [
    { x, z, w: 0.8, h: 2.5, d: 0.8, color: trunkColor },
    { x, z, y: 2.5, w: 3.2, h: 2, d: 3.2, color: leavesColor },
  ];
}

/** Стул: сиденье и спинка (спинка со стороны +Z или -Z). */
export function chair(x: number, z: number, backSide: 1 | -1, color: string): MapBox[] {
  return [
    { x, z, w: 0.55, h: 0.5, d: 0.55, color },
    { x, z: z + backSide * 0.24, y: 0.5, w: 0.55, h: 0.6, d: 0.08, color },
  ];
}
