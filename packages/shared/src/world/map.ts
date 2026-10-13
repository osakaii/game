import type { Vec3 } from '../math.js';

/**
 * Объект карты — прямоугольный блок, выровненный по осям (без поворота).
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
  boxes: MapBox[];
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

export function buildColliders(map: MapDef): Aabb[] {
  return map.boxes.map(boxToAabb);
}

/** Четыре стены по периметру пола. */
export function perimeterWalls(width: number, depth: number, height: number, color: string): MapBox[] {
  const t = 1;
  return [
    { x: 0, z: -depth / 2 - t / 2, w: width + 2 * t, h: height, d: t, color },
    { x: 0, z: depth / 2 + t / 2, w: width + 2 * t, h: height, d: t, color },
    { x: -width / 2 - t / 2, z: 0, w: t, h: height, d: depth, color },
    { x: width / 2 + t / 2, z: 0, w: t, h: height, d: depth, color },
  ];
}
