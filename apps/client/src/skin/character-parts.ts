import { BODY_ZONES, type BodyZone } from '@mecha/shared';

/** Размер коробки части тела (м): ширина по X, высота по Y, глубина по Z. */
export interface PartSize {
  w: number;
  h: number;
  d: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Часть тела: скруглённая коробка, висящая на суставе.
 * Поза покоя — стоит ровно, руки опущены, все суставы не повёрнуты. В ней построены атлас,
 * карта позиций и геометрия; анимация только поворачивает суставы.
 */
export interface PartDef {
  size: PartSize;
  /** Радиус скругления рёбер, м (не больше половины самой тонкой стороны). */
  radius: number;
  /** Родительская часть; null — часть висит прямо на тазе. */
  parent: BodyZone | null;
  /** Сустав в позе покоя: относительно сустава родителя (или таза). */
  joint: Point3;
  /** Центр коробки относительно своего сустава. */
  center: Point3;
}

/** Высота таза над землёй в позе покоя — от него растут торс и ноги. */
export const HIP_Y = 0.6;

const p = (x: number, y: number, z: number): Point3 => ({ x, y, z });

/** Рука или нога одной стороны: side = -1 — левая (−X), +1 — правая. */
function limbs(side: -1 | 1, s: 'Left' | 'Right'): Partial<Record<BodyZone, PartDef>> {
  return {
    [`upperArm${s}`]: { size: { w: 0.15, h: 0.26, d: 0.16 }, radius: 0.07, parent: 'torso', joint: p(0.335 * side, 0.45, 0), center: p(0, -0.1, 0) },
    [`forearm${s}`]: { size: { w: 0.14, h: 0.22, d: 0.15 }, radius: 0.065, parent: `upperArm${s}`, joint: p(0, -0.21, 0), center: p(0, -0.09, 0) },
    [`hand${s}`]: { size: { w: 0.11, h: 0.13, d: 0.13 }, radius: 0.05, parent: `forearm${s}`, joint: p(0, -0.19, 0), center: p(0, -0.06, 0) },
    [`thigh${s}`]: { size: { w: 0.19, h: 0.3, d: 0.21 }, radius: 0.085, parent: null, joint: p(0.115 * side, 0, 0), center: p(0, -0.13, 0) },
    [`shin${s}`]: { size: { w: 0.17, h: 0.26, d: 0.18 }, radius: 0.075, parent: `thigh${s}`, joint: p(0, -0.27, 0), center: p(0, -0.115, 0) },
    // Стопа вынесена вперёд: персонаж устойчиво стоит, и видно, куда он смотрит.
    [`foot${s}`]: { size: { w: 0.17, h: 0.09, d: 0.26 }, radius: 0.04, parent: `shin${s}`, joint: p(0, -0.24, 0), center: p(0, -0.045, 0.045) },
  } as Partial<Record<BodyZone, PartDef>>;
}

/**
 * Форма персонажа — единственное место, где заданы части тела и суставы.
 * Модель, атлас кожи, карта позиций и кисть строятся отсюда: поменяешь здесь — поменяется везде.
 * Пропорции «игрушечные»: большая круглая голова, короткие конечности — так персонаж мягче и симпатичнее.
 */
export const CHARACTER_PARTS: Record<BodyZone, PartDef> = {
  head: { size: { w: 0.48, h: 0.46, d: 0.44 }, radius: 0.19, parent: 'torso', joint: p(0, 0.52, 0), center: p(0, 0.235, 0) },
  torso: { size: { w: 0.5, h: 0.52, d: 0.32 }, radius: 0.13, parent: null, joint: p(0, 0, 0), center: p(0, 0.26, 0) },
  ...limbs(-1, 'Left'),
  ...limbs(1, 'Right'),
} as Record<BodyZone, PartDef>;

/** Порядок частей фиксирован: индекс части хранится в карте позиций и в индексах костей. */
export const PART_ORDER: readonly BodyZone[] = BODY_ZONES;

export function partIndex(part: BodyZone): number {
  return PART_ORDER.indexOf(part);
}

/** Сустав части в позе покоя, в системе модели (y = 0 — земля под ногами). */
export function restJoint(part: BodyZone): Point3 {
  const def = CHARACTER_PARTS[part];
  const base = def.parent ? restJoint(def.parent) : p(0, HIP_Y, 0);
  return p(base.x + def.joint.x, base.y + def.joint.y, base.z + def.joint.z);
}

/** Центр коробки части в позе покоя, в системе модели. */
export function restCenter(part: BodyZone): Point3 {
  const joint = restJoint(part);
  const c = CHARACTER_PARTS[part].center;
  return p(joint.x + c.x, joint.y + c.y, joint.z + c.z);
}

/** Левая часть ↔ правая — для симметричной покраски. */
export function mirrorPart(part: BodyZone): BodyZone {
  if (part.endsWith('Left')) return part.replace(/Left$/, 'Right') as BodyZone;
  if (part.endsWith('Right')) return part.replace(/Right$/, 'Left') as BodyZone;
  return part;
}

/**
 * С кем часть соединена суставом. Ноги висят на тазе, но по коже переходят в торс —
 * поэтому их сосед по покраске торс.
 */
function paintLink(part: BodyZone): BodyZone | null {
  if (part === 'torso') return null;
  return CHARACTER_PARTS[part].parent ?? 'torso';
}

/** Насколько далеко от сустава кисть ещё «переходит» на соседнюю часть (м), сверх своего радиуса. */
const JOINT_REACH = 0.12;

/**
 * Каким частям тела достаётся оттиск кисти: битовая маска по индексам частей.
 *
 * Своя часть — всегда. Соседняя по суставу — только если оттиск рядом с этим суставом: мазок
 * через колено ляжет и на бедро, и на голень без шва. А вот рука, висящая вдоль торса, краску
 * с бока торса не получит, хотя в позе покоя лежит в сантиметре от него.
 */
export function paintMask(part: BodyZone, center: Point3, radius: number): number {
  let mask = 1 << partIndex(part);
  const reach = radius + JOINT_REACH;
  for (const other of PART_ORDER) {
    const link = paintLink(other);
    // Сустав между part и other — это сустав дочерней из двух частей.
    const joint = link === part ? restJoint(other) : other === paintLink(part) ? restJoint(part) : null;
    if (!joint) continue;
    if (Math.hypot(center.x - joint.x, center.y - joint.y, center.z - joint.z) < reach) mask |= 1 << partIndex(other);
  }
  return mask;
}

/** Части соединены суставом (или это одна часть) — мазок между ними можно вести непрерывно. */
export function partsLinked(a: BodyZone, b: BodyZone): boolean {
  return a === b || paintLink(a) === b || paintLink(b) === a;
}
