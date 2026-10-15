import type { Vec3 } from '../math.js';
import { placeProp, type PropPlacement } from './props/index.js';

/**
 * Форма блока — только для вида. Столкновения у любой формы — по её коробке (AABB):
 * физика и сервер остаются простыми, а глаз видит круглый горшок и мягкий диван.
 */
export type Shape = 'box' | 'rounded' | 'cylinder' | 'sphere';

/**
 * Поверхность — процедурная текстура на клиенте (рисунок светлый, цвет блока его тонирует).
 * 'paint' — ровная краска без рисунка. Узор важен для игры: на пёстром прятаться легче, чем на гладком.
 */
export const SURFACES = ['paint', 'wood', 'parquet', 'tiles', 'stripes', 'dots', 'fabric', 'carpet', 'brick', 'marble'] as const;
export type SurfaceId = (typeof SURFACES)[number];

/**
 * Объект карты — блок, выровненный по осям (без поворота).
 * x/z — центр, y — нижняя грань (по умолчанию пол), w/h/d — размер по X/Y/Z.
 */
export interface MapBox {
  x: number;
  y?: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  /** По умолчанию 'box'. */
  shape?: Shape;
  /** Радиус скругления рёбер для 'rounded', м. */
  round?: number;
  /** По умолчанию 'paint'. */
  surface?: SurfaceId;
  /** false — только для вида, сквозь него можно пройти (книги на полке, листва). По умолчанию true. */
  solid?: boolean;
  /** true — только для физики, не рисуется: простая коробка вместо сложного силуэта (шкаф с полками). */
  hidden?: boolean;
}

export interface MapDef {
  id: string;
  /** Название для игроков. */
  name: string;
  skyColor?: string;
  /** Размер пола по X и Z, центр в (0, 0). */
  width: number;
  depth: number;
  floorColor: string;
  floorSurface?: SurfaceId;
  /** Простые блоки: стены, ящики. */
  boxes: MapBox[];
  /** Предметы (мебель): каждый сам раскладывается на блоки, см. props/index.ts. */
  props?: PropPlacement[];
  /** Точки появления в лобби и для прячущихся. */
  spawns: Vec3[];
  /** Где ищущие ждут фазу пряток. */
  seekerSpawns: Vec3[];
}

/** AABB (axis-aligned bounding box) — то, с чем работает физика. */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export function boxToAabb(box: MapBox): Aabb {
  const y = box.y ?? 0;
  return {
    minX: box.x - box.w / 2,
    maxX: box.x + box.w / 2,
    minY: y,
    maxY: y + box.h,
    minZ: box.z - box.d / 2,
    maxZ: box.z + box.d / 2,
  };
}

/** Все блоки карты: простые и из предметов, в мировых координатах. */
export function mapBoxes(map: MapDef): MapBox[] {
  return [...map.boxes, ...(map.props ?? []).flatMap(placeProp)];
}

/** Коллайдеры — только твёрдые блоки. Это всё, что нужно физике и серверу. */
export function buildColliders(map: MapDef): Aabb[] {
  return mapBoxes(map)
    .filter((box) => box.solid !== false)
    .map(boxToAabb);
}

/** Четыре стены по периметру пола. */
export function perimeterWalls(
  width: number,
  depth: number,
  height: number,
  color: string,
  surface: SurfaceId = 'paint',
): MapBox[] {
  const t = 1;
  return [
    { x: 0, z: -depth / 2 - t / 2, w: width + 2 * t, h: height, d: t, color, surface },
    { x: 0, z: depth / 2 + t / 2, w: width + 2 * t, h: height, d: t, color, surface },
    { x: -width / 2 - t / 2, z: 0, w: t, h: height, d: depth, color, surface },
    { x: width / 2 + t / 2, z: 0, w: t, h: height, d: depth, color, surface },
  ];
}
