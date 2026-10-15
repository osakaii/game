import type { MapBox, SurfaceId } from './map.js';

/**
 * Планировка жилья: внутренние стены с дверными проёмами, обои и пол каждой комнаты.
 *
 * Стена между двумя комнатами — один блок, а обои у комнат разные. Поэтому стены нейтральные,
 * а каждую комнату «оклеиваем» изнутри тонкими панелями своих обоев (только вид) — с вырезами
 * под проёмы. Так у кухни плитка, у детской горошек, а стена между ними одна.
 */

/** Толщина внутренних стен и высота потолка (м). */
export const WALL_T = 0.2;
export const WALL_H = 3;
/** Высота дверного проёма: выше — перемычка (её видно, под ней свободно проходит даже прыжок у порога). */
export const DOOR_H = 2.3;

export interface Finish {
  surface: SurfaceId;
  color: string;
}

/**
 * Прямая стена по линии: axis 'x' — стена тянется вдоль X на z = at; 'z' — вдоль Z на x = at.
 * from..to — её протяжённость, doors — центры проёмов вдоль стены и их ширина.
 */
export interface WallLine {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  doors?: { center: number; width: number }[];
}

/** Комната: прямоугольник по осям стен (не по внутренним граням), её пол и обои. */
export interface Room {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floor: Finish;
  walls: Finish;
}

/** Отрезки [a, b] минус проёмы — куски стены (или обоев) между дверями. */
function pieces(from: number, to: number, holes: { center: number; width: number }[]): [number, number][] {
  const result: [number, number][] = [];
  let start = from;
  for (const hole of [...holes].sort((a, b) => a.center - b.center)) {
    const a = hole.center - hole.width / 2;
    const b = hole.center + hole.width / 2;
    if (a > start) result.push([start, Math.min(a, to)]);
    start = Math.max(start, b);
  }
  if (start < to) result.push([start, to]);
  return result;
}

/** Блок стены вдоль оси: от u0 до u1 по длине, по высоте y0..y1, толщиной t, на линии at (+ сдвиг offset поперёк). */
function slab(axis: 'x' | 'z', at: number, u0: number, u1: number, y0: number, y1: number, t: number, finish: Finish & { solid?: boolean }): MapBox {
  const length = u1 - u0;
  const center = (u0 + u1) / 2;
  const base = { y: y0, h: y1 - y0, color: finish.color, surface: finish.surface, solid: finish.solid };
  return axis === 'x' ? { ...base, x: center, z: at, w: length, d: t } : { ...base, x: at, z: center, w: t, d: length };
}

/** Внутренние стены: сплошные куски между проёмами и перемычки над проёмами. */
export function buildWalls(lines: WallLine[], finish: Finish): MapBox[] {
  const boxes: MapBox[] = [];
  for (const line of lines) {
    const doors = line.doors ?? [];
    for (const [a, b] of pieces(line.from, line.to, doors)) boxes.push(slab(line.axis, line.at, a, b, 0, WALL_H, WALL_T, finish));
    for (const door of doors) {
      boxes.push(slab(line.axis, line.at, door.center - door.width / 2, door.center + door.width / 2, DOOR_H, WALL_H, WALL_T, finish));
    }
  }
  return boxes;
}

/**
 * Пол и обои комнаты. Проёмы берём из тех же линий стен: если сторона комнаты лежит на линии
 * с дверью — в обоях на этом месте вырез (до высоты проёма), над проёмом — полоска обоев.
 * Стороны комнаты по периметру карты (внешние стены) оклеиваются вплотную к стене.
 */
export function finishRoom(room: Room, lines: WallLine[], bounds: { halfW: number; halfD: number }): MapBox[] {
  const PANEL = 0.02;
  const boxes: MapBox[] = [];
  const isOuter = (axis: 'x' | 'z', at: number) => Math.abs(Math.abs(at) - (axis === 'x' ? bounds.halfD : bounds.halfW)) < 1e-6;
  const inset = (axis: 'x' | 'z', at: number) => (isOuter(axis, at) ? 0 : WALL_T / 2) + PANEL / 2;

  // Внутренние грани комнаты — по ним кладём пол и обои.
  const ix0 = room.x0 + inset('z', room.x0);
  const ix1 = room.x1 - inset('z', room.x1);
  const iz0 = room.z0 + inset('x', room.z0);
  const iz1 = room.z1 - inset('x', room.z1);
  boxes.push({
    x: (ix0 + ix1) / 2,
    z: (iz0 + iz1) / 2,
    y: 0,
    w: ix1 - ix0,
    h: 0.004,
    d: iz1 - iz0,
    color: room.floor.color,
    surface: room.floor.surface,
    solid: false,
  });

  const sides: { axis: 'x' | 'z'; at: number; from: number; to: number; panelAt: number }[] = [
    { axis: 'x', at: room.z0, from: ix0, to: ix1, panelAt: iz0 - PANEL / 2 },
    { axis: 'x', at: room.z1, from: ix0, to: ix1, panelAt: iz1 + PANEL / 2 },
    { axis: 'z', at: room.x0, from: iz0, to: iz1, panelAt: ix0 - PANEL / 2 },
    { axis: 'z', at: room.x1, from: iz0, to: iz1, panelAt: ix1 + PANEL / 2 },
  ];
  const lining = { ...room.walls, solid: false };
  for (const side of sides) {
    const doors = lines
      .filter((l) => l.axis === side.axis && Math.abs(l.at - side.at) < 1e-6)
      .flatMap((l) => l.doors ?? [])
      .filter((d) => d.center > side.from && d.center < side.to);
    for (const [a, b] of pieces(side.from, side.to, doors)) {
      boxes.push(slab(side.axis, side.panelAt, a, b, 0, WALL_H, PANEL, lining));
    }
    for (const door of doors) {
      boxes.push(slab(side.axis, side.panelAt, door.center - door.width / 2, door.center + door.width / 2, DOOR_H, WALL_H, PANEL, lining));
    }
  }
  return boxes;
}
