import type { BodyZone } from '@mecha/shared';
import { CHARACTER_PARTS, PART_ORDER, type PartSize } from './character-parts';

/**
 * UV-атлас («выкройка») кожи персонажа.
 *
 * У каждой коробки 6 граней, у персонажа 14 частей — 84 прямоугольника. Скругление рёбер выкройку
 * не меняет: грань скруглённой коробки — это та же плоская грань, «надутая» у краёв (см. rounded-box). Раскладываем их
 * на одной квадратной текстуре так, чтобы у всех граней была одинаковая плотность (пикселей на метр):
 * тогда кисть одного размера оставляет одинаковый след и на голове, и на ноге.
 *
 * Система координат атласа — как у <canvas>: x вправо, y ВНИЗ, в пикселях (текселях).
 * UV-координаты в three.js: u вправо, v ВВЕРХ, от 0 до 1. Перевод: u = x/size, v = 1 - y/size.
 */

export const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
export type FaceId = (typeof FACES)[number];
type Axis = 'x' | 'y' | 'z';

/**
 * Как three.js строит каждую грань BoxGeometry (см. buildPlane в её исходнике):
 * вдоль какой оси идёт u, вдоль какой v, куда смотрит грань и какого она размера.
 * Порядок граней в геометрии: px, nx, py, ny, pz, nz — тот же, что в FACES.
 */
interface FaceSpec {
  u: Axis;
  v: Axis;
  w: Axis;
  udir: 1 | -1;
  vdir: 1 | -1;
  /** Размер грани вдоль u и вдоль v, смещение грани от центра вдоль w (со знаком). */
  size(part: PartSize): { width: number; height: number; depth: number };
}

const FACE_SPECS: Record<FaceId, FaceSpec> = {
  px: { u: 'z', v: 'y', w: 'x', udir: -1, vdir: -1, size: (p) => ({ width: p.d, height: p.h, depth: p.w }) },
  nx: { u: 'z', v: 'y', w: 'x', udir: 1, vdir: -1, size: (p) => ({ width: p.d, height: p.h, depth: -p.w }) },
  py: { u: 'x', v: 'z', w: 'y', udir: 1, vdir: 1, size: (p) => ({ width: p.w, height: p.d, depth: p.h }) },
  ny: { u: 'x', v: 'z', w: 'y', udir: 1, vdir: -1, size: (p) => ({ width: p.w, height: p.d, depth: -p.h }) },
  pz: { u: 'x', v: 'y', w: 'z', udir: 1, vdir: -1, size: (p) => ({ width: p.w, height: p.h, depth: p.d }) },
  nz: { u: 'x', v: 'y', w: 'z', udir: -1, vdir: -1, size: (p) => ({ width: p.w, height: p.h, depth: -p.d }) },
};

/** Прямоугольник грани на атласе, в текселях, без учёта отступа. */
export interface AtlasRect {
  part: BodyZone;
  face: FaceId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkinAtlas {
  size: number;
  /**
   * Отступ вокруг каждой грани (тексели). Туда «растягивается» краска с края грани:
   * при фильтрации и мипмапах соседние тексели смешиваются, и без отступа на рёбрах
   * проступал бы цвет соседней грани.
   */
  padding: number;
  /** Тексели на метр — одинаково для всех граней. */
  density: number;
  rects: AtlasRect[];
}

interface FaceToPack {
  part: BodyZone;
  face: FaceId;
  width: number;
  height: number;
}

function allFaces(): FaceToPack[] {
  const faces: FaceToPack[] = [];
  for (const part of PART_ORDER) {
    for (const face of FACES) {
      const { width, height } = FACE_SPECS[face].size(CHARACTER_PARTS[part].size);
      faces.push({ part, face, width, height });
    }
  }
  return faces;
}

/**
 * Полочная упаковка (shelf packing): кладём прямоугольники в ряд слева направо, не влезает —
 * начинаем новую «полку» ниже. Перед этим сортируем по высоте — полки получаются плотнее.
 * Возвращает null, если при такой плотности всё не влезает.
 */
function pack(faces: FaceToPack[], density: number, size: number, padding: number): AtlasRect[] | null {
  const sorted = faces
    .map((f, index) => ({ ...f, index, w: Math.ceil(f.width * density), h: Math.ceil(f.height * density) }))
    // Стабильный порядок при равной высоте — атлас должен быть одинаковым у всех игроков.
    .sort((a, b) => b.h - a.h || a.index - b.index);

  const rects: AtlasRect[] = [];
  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  for (const f of sorted) {
    const fullW = f.w + padding * 2;
    const fullH = f.h + padding * 2;
    if (x + fullW > size) {
      x = 0;
      y += shelfHeight;
      shelfHeight = 0;
    }
    if (fullW > size || y + fullH > size) return null;
    rects.push({ part: f.part, face: f.face, x: x + padding, y: y + padding, w: f.w, h: f.h });
    x += fullW;
    shelfHeight = Math.max(shelfHeight, fullH);
  }
  return rects;
}

/** Находит максимальную плотность, при которой выкройка влезает в текстуру (бинарный поиск). */
export function buildAtlas(size = 512, padding = 4): SkinAtlas {
  const faces = allFaces();
  let low = 1;
  let high = size * 4;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (pack(faces, mid, size, padding)) low = mid;
    else high = mid;
  }
  const density = Math.floor(low);
  return { size, padding, density, rects: pack(faces, density, size, padding)! };
}

let cached: SkinAtlas | null = null;

/** Атлас один на всю игру и одинаковый у всех: это чистая функция от формы персонажа. */
export function getSkinAtlas(): SkinAtlas {
  cached ??= buildAtlas();
  return cached;
}

export function findRect(atlas: SkinAtlas, part: BodyZone, face: FaceId): AtlasRect {
  return atlas.rects.find((r) => r.part === part && r.face === face)!;
}

/** UV атласа (как у three.js: v вверх) для точки (u, v) внутри грани, где v = 1 — верх грани. */
export function atlasUV(atlas: SkinAtlas, rect: AtlasRect, u: number, v: number): { u: number; v: number } {
  return {
    u: (rect.x + u * rect.w) / atlas.size,
    v: 1 - (rect.y + (1 - v) * rect.h) / atlas.size,
  };
}

/** Размер грани вдоль u и вдоль v (м). */
export function faceDims(part: PartSize, face: FaceId): { width: number; height: number } {
  const { width, height } = FACE_SPECS[face].size(part);
  return { width, height };
}

/** Нормаль грани — куда она «смотрит» (единичный вектор вдоль оси w, знак как у смещения грани). */
export function faceNormal(face: FaceId): { x: number; y: number; z: number } {
  const spec = FACE_SPECS[face];
  const n = { x: 0, y: 0, z: 0 };
  n[spec.w] = Math.sign(spec.size({ w: 1, h: 1, d: 1 }).depth);
  return n;
}

/** Точка на грани коробки по координатам (u, v) внутри грани — обратная формула к buildPlane. */
export function facePoint(part: PartSize, face: FaceId, u: number, v: number): { x: number; y: number; z: number } {
  const spec = FACE_SPECS[face];
  const { width, height, depth } = spec.size(part);
  const p = { x: 0, y: 0, z: 0 };
  p[spec.u] = (u - 0.5) * width * spec.udir;
  p[spec.v] = (0.5 - v) * height * spec.vdir;
  p[spec.w] = depth / 2;
  return p;
}
