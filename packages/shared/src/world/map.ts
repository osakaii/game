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
  /**
   * Холст картины: зерно, из которого клиент рисует картину (пейзаж, абстракция…).
   * Картина натягивается на большую грань тонкого блока целиком, а не повторяется узором.
   */
  art?: number;
  /**
   * Светится сам и не зависит от освещения: стекло окна с небом за ним, плафон лампы.
   * Только для вида — освещение сцены от него не меняется (настоящие источники света дороги для телефона).
   */
  glow?: boolean;
  /** Во сколько раз крупнее рисунок поверхности (паркет, обои): у увеличенной карты — вместе с ней. */
  texScale?: number;
  /** По этой грани нельзя лезть: внешние стены карт без потолка (иначе — через стену наружу). */
  noClimb?: boolean;
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
  /** Во сколько раз крупнее рисунок пола (у увеличенной карты). */
  texScale?: number;
  /** Простые блоки: стены, ящики. */
  boxes: MapBox[];
  /** Предметы (мебель): каждый сам раскладывается на блоки, см. props/index.ts. */
  props?: PropPlacement[];
  /** Потолок (у помещений): закрывает небо и останавливает камеру. Тень от него не падает. */
  ceiling?: { height: number; color: string };
  /** Точки появления в лобби и для прячущихся. */
  spawns: Vec3[];
  /** Где ищущие ждут фазу пряток. */
  seekerSpawns: Vec3[];
  /**
   * Время поиска по умолчанию, с. Подставляется при выборе карты (хост может поменять):
   * на огромной площади за 2.5 минуты не обойти и половины укрытий. Нет — общее по умолчанию.
   */
  seekSeconds?: number;
  /**
   * Где стоит персонаж на главном экране и куда смотрит (yaw: 0 — к +Z). Камера встаёт перед ним,
   * поэтому за спиной должно быть красивое (на площади — Манас и музей). Нет — первый спавн.
   */
  showcase?: { position: Vec3; facing: number };
}

/** AABB (axis-aligned bounding box) — то, с чем работает физика. */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Не для лазания (см. MapBox.noClimb). */
  noClimb?: boolean;
}

export function boxToAabb(box: MapBox): Aabb {
  const y = box.y ?? 0;
  const aabb: Aabb = {
    minX: box.x - box.w / 2,
    maxX: box.x + box.w / 2,
    minY: y,
    maxY: y + box.h,
    minZ: box.z - box.d / 2,
    maxZ: box.z + box.d / 2,
  };
  if (box.noClimb) aabb.noClimb = true;
  return aabb;
}

/**
 * Увеличить карту в k раз: стены, мебель, рисунки поверхностей, точки появления.
 * Персонаж при этом остаётся прежнего роста — и становится «игрушкой» в огромном доме:
 * под столом проходишь в полный рост, на диван запрыгиваешь, комнату пересекаешь за несколько секунд.
 * Физика, хитбоксы и сервер работают с уже увеличенными блоками — для них это обычная карта.
 */
export function scaleMap(map: MapDef, k: number): MapDef {
  const box = (b: MapBox): MapBox => ({
    ...b,
    x: b.x * k,
    y: (b.y ?? 0) * k,
    z: b.z * k,
    w: b.w * k,
    h: b.h * k,
    d: b.d * k,
    round: b.round === undefined ? undefined : b.round * k,
    texScale: (b.texScale ?? 1) * k,
  });
  const point = (p: Vec3): Vec3 => ({ x: p.x * k, y: p.y * k, z: p.z * k });
  return {
    ...map,
    width: map.width * k,
    depth: map.depth * k,
    texScale: (map.texScale ?? 1) * k,
    ceiling: map.ceiling && { ...map.ceiling, height: map.ceiling.height * k },
    boxes: map.boxes.map(box),
    props: map.props?.map((p) => ({ ...p, x: p.x * k, z: p.z * k, y: (p.y ?? 0) * k, scale: (p.scale ?? 1) * k })),
    spawns: map.spawns.map(point),
    seekerSpawns: map.seekerSpawns.map(point),
    showcase: map.showcase && { ...map.showcase, position: point(map.showcase.position) },
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

/**
 * Четыре стены по периметру пола. У карты без потолка по ним лазать нельзя (climbable = false):
 * иначе залез наверх — и спрыгнул наружу. Под потолком — можно: потолок не пустит выше.
 */
export function perimeterWalls(
  width: number,
  depth: number,
  height: number,
  color: string,
  surface: SurfaceId = 'paint',
  climbable = false,
): MapBox[] {
  const t = 1;
  const noClimb = !climbable;
  return [
    { x: 0, z: -depth / 2 - t / 2, w: width + 2 * t, h: height, d: t, color, surface, noClimb },
    { x: 0, z: depth / 2 + t / 2, w: width + 2 * t, h: height, d: t, color, surface, noClimb },
    { x: -width / 2 - t / 2, z: 0, w: t, h: height, d: depth, color, surface, noClimb },
    { x: width / 2 + t / 2, z: 0, w: t, h: height, d: depth, color, surface, noClimb },
  ];
}
