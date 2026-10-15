import { BODY_ZONES, type BodyZone } from '@mecha/shared';
import type { Caps } from './rounded-box';

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
  /** Плоские торцы там, где сегмент вплотную стыкуется с соседом (локоть, колено, запястье). */
  caps?: Caps;
}

/** Высота таза над землёй в позе покоя — от него растут торс и ноги. */
export const HIP_Y = 0.6;

const p = (x: number, y: number, z: number): Point3 => ({ x, y, z });

/**
 * Рука или нога одной стороны: side = -1 — левая (−X), +1 — правая.
 *
 * Конечность — трубка одного сечения, разрезанная суставами на сегменты. В суставе торцы плоские
 * и совпадают точь-в-точь, а вершины торца привязаны к обеим костям пополам (см. body-geometry) —
 * поэтому шва не видно ни у прямой, ни у согнутой руки. Скруглены только свободные концы:
 * плечо и бедро (они утоплены в торс) и кончик кисти.
 */
function limbs(side: -1 | 1, s: 'Left' | 'Right'): Partial<Record<BodyZone, PartDef>> {
  const ARM = 0.14;
  const LEG = 0.19;
  return {
    [`upperArm${s}`]: {
      size: { w: ARM, h: 0.21 + ARM / 2, d: ARM },
      radius: ARM / 2,
      parent: 'torso',
      joint: p(0.28 * side, 0.45, 0),
      center: p(0, (ARM / 2 - 0.21) / 2, 0),
      caps: { flatBottom: true },
    },
    [`forearm${s}`]: {
      size: { w: ARM, h: 0.19, d: ARM },
      radius: ARM / 2,
      parent: `upperArm${s}`,
      joint: p(0, -0.21, 0),
      center: p(0, -0.095, 0),
      caps: { flatTop: true, flatBottom: true },
    },
    [`hand${s}`]: {
      size: { w: ARM, h: 0.15, d: ARM },
      radius: ARM / 2,
      parent: `forearm${s}`,
      joint: p(0, -0.19, 0),
      center: p(0, -0.075, 0),
      caps: { flatTop: true },
    },
    [`thigh${s}`]: {
      size: { w: LEG, h: 0.27 + LEG / 2, d: LEG },
      radius: LEG / 2,
      parent: null,
      joint: p(0.115 * side, 0, 0),
      center: p(0, (LEG / 2 - 0.27) / 2, 0),
      caps: { flatBottom: true },
    },
    // Голень уходит нижним скруглённым концом в стопу.
    [`shin${s}`]: {
      size: { w: LEG, h: 0.27, d: LEG },
      radius: LEG / 2,
      parent: `thigh${s}`,
      joint: p(0, -0.27, 0),
      center: p(0, -0.135, 0),
      caps: { flatTop: true },
    },
    // Стопа вынесена вперёд: персонаж устойчиво стоит, и видно, куда он смотрит.
    [`foot${s}`]: { size: { w: 0.18, h: 0.09, d: 0.27 }, radius: 0.044, parent: `shin${s}`, joint: p(0, -0.24, 0), center: p(0, -0.045, 0.045) },
  } as Partial<Record<BodyZone, PartDef>>;
}

/**
 * Форма персонажа — единственное место, где заданы части тела и суставы.
 * Модель, атлас кожи, карта позиций и кисть строятся отсюда: поменяешь здесь — поменяется везде.
 * Пропорции «игрушечные»: большая почти круглая голова, торс-«фасолина», короткие мягкие конечности.
 * Соседние части заходят друг в друга — тело выглядит цельным, без щелей на шее, плечах и бёдрах.
 */
export const CHARACTER_PARTS: Record<BodyZone, PartDef> = {
  head: { size: { w: 0.48, h: 0.46, d: 0.45 }, radius: 0.21, parent: 'torso', joint: p(0, 0.52, 0), center: p(0, 0.235, 0) },
  torso: { size: { w: 0.5, h: 0.58, d: 0.34 }, radius: 0.16, parent: null, joint: p(0, 0, 0), center: p(0, 0.25, 0) },
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

/** Сустав между частью и её соседом «выше по цепочке» (родителем или торсом для ног). */
export interface JointLink {
  child: BodyZone;
  parent: BodyZone;
  /** Точка сустава в позе покоя. */
  at: Point3;
  /** Ребёнок ниже сустава (руки, ноги) или выше (голова над шеей). */
  childBelow: boolean;
}

/**
 * Суставы, у которых вершины привязаны к обеим костям: внутри конечностей (локоть, запястье, колено, лодыжка).
 * Плечи, бёдра и шея — жёсткие: скруглённый конец утоплен в торс или голову, как шаровой шарнир,
 * и тянуть за рукой бок торса незачем.
 */
export const JOINT_LINKS: readonly JointLink[] = PART_ORDER.flatMap((child) => {
  const parent = paintLink(child);
  if (!parent || parent === 'torso') return [];
  const at = restJoint(child);
  return [{ child, parent, at, childBelow: restCenter(child).y < at.y }];
});
