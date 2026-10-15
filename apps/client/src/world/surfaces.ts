import * as THREE from 'three';
import { seededRandom, type SurfaceId } from '@mecha/shared';

/**
 * Процедурные текстуры поверхностей: дерево, паркет, плитка, обои, ткань, ковёр, кирпич.
 *
 * Рисунок генерируется массивом байтов (а не на canvas): так текстура одинаковая у всех игроков,
 * не нужен DOM (работает в тестах), а пипетка может прочитать любой пиксель напрямую из массива.
 *
 * Рисунок светлый и почти серый: цвет блока его «тонирует» (умножение). Одна текстура «паркет»
 * годится и для светлого дуба, и для тёмного ореха — достаточно сменить цвет блока.
 */
export interface SurfaceTexture {
  readonly id: SurfaceId;
  readonly texture: THREE.DataTexture;
  /** Байты RGBA (sRGB), строка 0 — низ текстуры (v = 0), как в WebGL. */
  readonly pixels: Uint8Array;
  readonly size: number;
  /** Сколько метров мира занимает один повтор рисунка. */
  readonly tile: number;
}

type Painter = (x: number, y: number, size: number, noise: (x: number, y: number) => number) => number;

interface Generator {
  size: number;
  tile: number;
  paint: Painter;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const GENERATORS: Record<Exclude<SurfaceId, 'paint'>, Generator> = {
  /**
   * Дерево мебели: только волокна — длинные мягкие полосы вдоль u, без досок и швов
   * (швы на дверце шкафа выглядели бы как вагонка). Доски — это «паркет».
   */
  wood: {
    size: 128,
    tile: 0.9,
    paint: (x, y, size, noise) => {
      const grain = Math.sin((y / size) * Math.PI * 14 + noise(x * 0.15, y * 1.5) * 3) * 0.035;
      return 0.9 + grain + (noise(x * 0.5, y * 2) - 0.5) * 0.06;
    },
  },
  /** Паркет «ёлочкой» упрощённо: ряды плашек со сдвигом на половину, у каждой плашки свой тон. */
  parquet: {
    size: 128,
    tile: 1.2,
    paint: (x, y, size, noise) => {
      const rows = 8;
      const row = Math.floor((y / size) * rows);
      const plankLength = size / 2;
      const shifted = x + (row % 2) * (plankLength / 2);
      const plank = Math.floor(shifted / plankLength);
      const inRow = ((y / size) * rows) % 1;
      const inPlank = (shifted % plankLength) / plankLength;
      if (inRow < 0.06 || inPlank < 0.015) return 0.6;
      return 0.8 + noise(plank * 3.3 + row * 11.7, row) * 0.16 + Math.sin(inPlank * 30 + row) * 0.015;
    },
  },
  /** Плитка 4×4 с затиркой. */
  tiles: {
    size: 128,
    tile: 0.8,
    paint: (x, y, size, noise) => {
      const cell = size / 4;
      const gx = x % cell;
      const gy = y % cell;
      if (gx < 2 || gy < 2) return 0.7;
      return 0.94 + noise(Math.floor(x / cell) * 5.3, Math.floor(y / cell) * 2.1) * 0.05;
    },
  },
  /** Обои в полоску: широкие светлые и узкие тёмные полосы, тонкая линия между ними. */
  stripes: {
    size: 128,
    tile: 1.6,
    paint: (x, _y, size) => {
      const t = ((x / size) * 5) % 1;
      if (t < 0.03 || (t > 0.55 && t < 0.58)) return 0.8;
      return t < 0.55 ? 1 : 0.9;
    },
  },
  /** Обои в горошек: кружки в шахматном порядке. */
  dots: {
    size: 128,
    tile: 0.6,
    paint: (x, y, size) => {
      const n = 6;
      const cell = size / n;
      const row = Math.floor(y / cell);
      const cx = (x + (row % 2) * (cell / 2)) % cell;
      const cy = y % cell;
      const d = Math.hypot(cx - cell / 2, cy - cell / 2) / cell;
      return d < 0.2 ? 0.72 : 1;
    },
  },
  /** Ткань: мелкое плетение «ёлочкой» и чуть шума. */
  fabric: {
    size: 64,
    tile: 0.25,
    paint: (x, y, _size, noise) => ((x + y) % 4 < 2 ? 0.9 : 0.97) + (noise(x * 0.9, y * 0.9) - 0.5) * 0.06,
  },
  /** Ворс ковра: мелкий шум. */
  carpet: {
    size: 64,
    tile: 0.35,
    paint: (x, y, _size, noise) => 0.8 + noise(x * 1.7, y * 1.7) * 0.2,
  },
  /** Кирпич: кладка со сдвигом рядов, светлый раствор. */
  brick: {
    size: 128,
    tile: 1.2,
    paint: (x, y, size, noise) => {
      const rows = 8;
      const rowH = size / rows;
      const row = Math.floor(y / rowH);
      const brickW = size / 4;
      const bx = (x + (row % 2) * (brickW / 2)) % brickW;
      if (y % rowH < 2 || bx < 2) return 0.96;
      return 0.72 + noise(Math.floor((x + (row % 2) * (brickW / 2)) / brickW) * 4.7, row * 3.1) * 0.18;
    },
  },
  /** Мрамор: светлый фон и тонкие извилистые прожилки (синус от координаты + шум). */
  marble: {
    size: 128,
    tile: 1,
    paint: (x, y, size, noise) => {
      const t = (x + y * 0.6) / size;
      const vein = Math.abs(Math.sin(t * Math.PI * 3 + noise(x * 0.4, y * 0.4) * 5));
      return 0.97 - Math.pow(1 - vein, 10) * 0.28 + (noise(x, y) - 0.5) * 0.03;
    },
  },
};

/**
 * Гладкий шум: случайные значения в узлах решётки, между ними — плавная интерполяция.
 * Повторяется с периодом size — рисунок «зациклен» и не даёт швов на стыке повторов.
 */
function smoothNoise(size: number, seed: number) {
  const random = seededRandom(seed);
  const grid = 64;
  const values = Array.from({ length: grid * grid }, () => random());
  const at = (ix: number, iy: number) => values[(((iy % grid) + grid) % grid) * grid + (((ix % grid) + grid) % grid)];
  return (x: number, y: number) => {
    // Масштаб решётки привязан к размеру текстуры — тогда шум тоже «зациклен».
    const fx = (x / size) * grid;
    const fy = (y / size) * grid;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}

const cache = new Map<SurfaceId, SurfaceTexture>();

/** Текстура поверхности (одна на всю игру) или null для ровной краски. */
export function surfaceTexture(id: SurfaceId): SurfaceTexture | null {
  if (id === 'paint') return null;
  let surface = cache.get(id);
  if (!surface) {
    const { size, tile, paint } = GENERATORS[id];
    const noise = smoothNoise(size, id.length * 97 + id.charCodeAt(0));
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = Math.round(clamp01(paint(x, y, size, noise)) * 255);
        const i = (y * size + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
        pixels[i + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    surface = { id, texture, pixels, size, tile };
    texture.userData.surface = surface;
    cache.set(id, surface);
  }
  return surface;
}

/**
 * Цвет поверхности в точке (для пипетки): пиксель рисунка × цвет блока.
 * Умножаем в линейном пространстве — так же, как видеокарта умножает map на color.
 */
export function surfaceColor(surface: SurfaceTexture, u: number, v: number, tint: THREE.Color): THREE.Color {
  const fract = (t: number) => t - Math.floor(t);
  const x = Math.min(surface.size - 1, Math.floor(fract(u) * surface.size));
  const y = Math.min(surface.size - 1, Math.floor(fract(v) * surface.size));
  const i = (y * surface.size + x) * 4;
  const texel = new THREE.Color().setRGB(
    surface.pixels[i] / 255,
    surface.pixels[i + 1] / 255,
    surface.pixels[i + 2] / 255,
    THREE.SRGBColorSpace,
  );
  return texel.multiply(tint);
}
