import type { MapBox, Shape, SurfaceId } from '../map.js';

/**
 * Набор для сборки мебели: типы и мелкие детали, которые повторяются у многих предметов
 * (ножки, ручки, швы дверец). Предмет строится в своей системе координат: центр основания
 * в (0, 0, 0), «лицом» к +Z, ширина вдоль X.
 */

export interface PropParams {
  /** Основной цвет (корпус, обивка). */
  color: string;
  /** Второй цвет (подушки, столешница, ножки). */
  accent: string;
  /** Ширина вдоль локального X, где у предмета есть выбор. */
  length: number;
}

export type PropBuilder = (p: PropParams, random: () => number) => MapBox[];

export interface PropDef {
  color: string;
  accent: string;
  length: number;
  build: PropBuilder;
}

interface PartOptions {
  shape?: Shape;
  round?: number;
  surface?: SurfaceId;
  solid?: boolean;
  hidden?: boolean;
  glow?: boolean;
}

/** Деталь: центр по X/Z, низ по Y, размеры. Коротко, чтобы описание предмета читалось как чертёж. */
export function part(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  options: PartOptions = {},
): MapBox {
  return { x, y, z, w, h, d, color, ...options };
}

/** Только для вида: сквозь неё можно пройти, сервер её не знает. */
export function decor(x: number, y: number, z: number, w: number, h: number, d: number, color: string, options: PartOptions = {}): MapBox {
  return part(x, y, z, w, h, d, color, { ...options, solid: false });
}

/** Только для физики: простая коробка вместо сложного силуэта. */
export function collider(x: number, y: number, z: number, w: number, h: number, d: number): MapBox {
  return part(x, y, z, w, h, d, '#000000', { hidden: true });
}

/** Четыре ножки по углам прямоугольника w×d (inset — отступ от края). */
export function legs(w: number, d: number, h: number, inset: number, size: number, color: string, shape: Shape = 'cylinder'): MapBox[] {
  const lx = w / 2 - inset;
  const lz = d / 2 - inset;
  return [-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(sx * lx, 0, sz * lz, size, h, size, color, { shape, surface: 'wood' })));
}

/** Ручка на фасаде (передняя грань на z = front). Горизонтальная — у ящиков, вертикальная — у дверец. */
export function handle(x: number, y: number, front: number, vertical = false, color = '#c9ccd1'): MapBox {
  return vertical
    ? decor(x, y, front + 0.012, 0.025, 0.18, 0.025, color, { shape: 'rounded', round: 0.01 })
    : decor(x, y, front + 0.012, 0.16, 0.025, 0.025, color, { shape: 'rounded', round: 0.01 });
}

/** Тонкий тёмный шов на фасаде — граница дверцы или ящика. */
export function seam(x: number, y: number, front: number, w: number, h: number, color = '#3b3b3b'): MapBox {
  return decor(x, y, front + 0.002, w, h, 0.006, color);
}

/**
 * Детерминированный генератор случайных чисел (mulberry32): одно и то же зерно — одна и та же
 * последовательность. Корешки книг «случайные», но у всех игроков одинаковые.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Случайный элемент массива по генератору. */
export function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

/** Яркая палитра мелочей (книги, игрушки, обувь) — пёстрые места, где интересно прятаться. */
export const BRIGHT = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a', '#8d99ae', '#6a4c93', '#f1faee', '#118ab2'];
