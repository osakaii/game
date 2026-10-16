import { vec3 } from '../math.js';
import { WALL_H, WALL_T, buildWalls, finishRoom, type Room, type WallLine } from './layout.js';
import { perimeterWalls, scaleMap, type MapDef } from './map.js';
import type { PropPlacement } from './props/index.js';

const WIDTH = 26;
const DEPTH = 20;
const HALF_W = WIDTH / 2;
const HALF_D = DEPTH / 2;

/**
 * План (вид сверху, север — минус Z):
 *
 *   z=-10 ┌──────────┬──────────┬───────────┐
 *         │  Кухня   │  Ванная  │  Детская  │
 *   z=-2  ├──дверь───┴──дверь───┴──дверь────┤
 *         │     Прихожая (вход с запада)    │
 *   z=1.2 ├────широкий проём───┬───дверь────┤
 *         │      Гостиная      │  Спальня   │
 *   z=10  └────────────────────┴────────────┘
 *        x=-13      x=-4   x=2  x=3        x=13
 *
 * Проёмы 1.6 м: игрок (0.7 м) проходит свободно, и камера от третьего лица не застревает в косяке.
 */
const NORTH = -2; // стена между северными комнатами и прихожей
const SOUTH = 1.2; // стена между прихожей и южными комнатами

const LINES: WallLine[] = [
  {
    axis: 'x',
    at: NORTH,
    from: -HALF_W,
    to: HALF_W,
    doors: [
      { center: -8.5, width: 1.6 },
      { center: -0.5, width: 1.6 },
      { center: 8, width: 1.6 },
    ],
  },
  {
    axis: 'x',
    at: SOUTH,
    from: -HALF_W,
    to: HALF_W,
    doors: [
      { center: -6, width: 2.6 },
      { center: 7.5, width: 1.6 },
    ],
  },
  { axis: 'z', at: -4, from: -HALF_D, to: NORTH },
  { axis: 'z', at: 3, from: -HALF_D, to: NORTH },
  { axis: 'z', at: 2, from: SOUTH, to: HALF_D },
];

const ROOMS: Record<string, Room> = {
  kitchen: { x0: -HALF_W, z0: -HALF_D, x1: -4, z1: NORTH, floor: { surface: 'tiles', color: '#e4e9ec' }, walls: { surface: 'tiles', color: '#f4efe6' } },
  bathroom: { x0: -4, z0: -HALF_D, x1: 3, z1: NORTH, floor: { surface: 'tiles', color: '#bfdbe8' }, walls: { surface: 'tiles', color: '#e3f2f8' } },
  kids: { x0: 3, z0: -HALF_D, x1: HALF_W, z1: NORTH, floor: { surface: 'carpet', color: '#c8e6c9' }, walls: { surface: 'dots', color: '#ffe0ea' } },
  hall: { x0: -HALF_W, z0: NORTH, x1: HALF_W, z1: SOUTH, floor: { surface: 'parquet', color: '#9c6b43' }, walls: { surface: 'brick', color: '#e7cdb4' } },
  living: { x0: -HALF_W, z0: SOUTH, x1: 2, z1: HALF_D, floor: { surface: 'parquet', color: '#d4a373' }, walls: { surface: 'stripes', color: '#d8ead2' } },
  bedroom: { x0: 2, z0: SOUTH, x1: HALF_W, z1: HALF_D, floor: { surface: 'parquet', color: '#c9a27e' }, walls: { surface: 'dots', color: '#dbe4f5' } },
};

/** Внутренняя грань стены на линии at со стороны side (+1 — в сторону роста координаты). */
const face = (at: number, side: 1 | -1, outer = false) => at + side * (outer ? 0 : WALL_T / 2 + 0.02);

/** Картина на стене: на высоте глаз, «лицом» в комнату. */
const painting = (x: number, z: number, rot: PropPlacement['rot'], length = 0.9, color?: string): PropPlacement => ({
  prop: 'painting',
  x,
  z,
  y: 1.25,
  rot,
  length,
  color,
});

/** Окно на внешней стене, «лицом» в комнату. */
const windowAt = (x: number, z: number, rot: PropPlacement['rot'], length = 1.4, accent?: string): PropPlacement => ({
  prop: 'window',
  x,
  z,
  rot,
  length,
  accent,
});

/** Люстра под потолком в центре комнаты. */
const lampIn = (room: Room): PropPlacement => ({
  prop: 'ceilingLamp',
  x: (room.x0 + room.x1) / 2,
  z: (room.z0 + room.z1) / 2,
  y: WALL_H - 0.62, // стойка 0.62 м упирается в потолок
});

const PROPS: PropPlacement[] = [
  // ---------- Окна (шторы — тайник: за ними можно встать) и люстры ----------
  windowAt(-0.8, face(-HALF_D, 1, true) + 0.04, 0, 1.0, '#90e0ef'),
  windowAt(8.5, face(-HALF_D, 1, true) + 0.04, 0, 1.4, '#ffafcc'),
  windowAt(face(-HALF_W, 1, true) + 0.04, -4.4, 90, 1.4, '#f4a261'),
  windowAt(face(HALF_W, -1, true) - 0.04, -6.5, 270, 1.2, '#ffafcc'),
  windowAt(-7.6, face(HALF_D, -1, true) - 0.04, 180, 1.6, '#e07a5f'),
  windowAt(-3, face(HALF_D, -1, true) - 0.04, 180, 1.0, '#e07a5f'),
  windowAt(5.2, face(HALF_D, -1, true) - 0.04, 180, 1.4, '#cdb4db'),
  windowAt(face(-HALF_W, 1, true) + 0.04, 8, 90, 1.2, '#e07a5f'),
  windowAt(face(HALF_W, -1, true) - 0.04, 2.4, 270, 1.2, '#cdb4db'),
  ...Object.values(ROOMS).map(lampIn),

  // ---------- Кухня ----------
  { prop: 'fridge', x: -12.55, z: -9.62 },
  { prop: 'kitchenCounter', x: -10.6, z: -9.69, length: 2.4 },
  { prop: 'stove', x: -9.1, z: -9.69 },
  { prop: 'sinkCounter', x: -8.2, z: -9.69, length: 1.2 },
  { prop: 'kitchenCounter', x: -6.8, z: -9.69, length: 1.6 },
  { prop: 'upperCabinet', x: -10.6, z: -9.82, y: 1.45, length: 2.4 },
  { prop: 'upperCabinet', x: -7.2, z: -9.82, y: 1.45, length: 2.4 },
  { prop: 'kitchenCounter', x: -12.69, z: -7.2, rot: 90, length: 2.4 },
  { prop: 'table', x: -8.5, z: -5.6, length: 1.8, color: '#c68b59' },
  { prop: 'chair', x: -9.1, z: -6.35 },
  { prop: 'chair', x: -7.9, z: -6.35 },
  { prop: 'chair', x: -9.1, z: -4.85, rot: 180 },
  { prop: 'chair', x: -7.9, z: -4.85, rot: 180 },
  { prop: 'plant', x: -4.6, z: -2.65 },
  { prop: 'cardboardBox', x: -12.5, z: -2.6, length: 0.5 },
  painting(face(-4, -1), -6.2, 270, 0.8),

  // ---------- Ванная ----------
  { prop: 'bathtub', x: -2.95, z: -9.5 },
  { prop: 'toilet', x: 2.35, z: -9.55 },
  { prop: 'washbasin', x: 0.6, z: -9.72 },
  { prop: 'mirror', x: 0.6, z: face(-HALF_D, 1, true) + 0.02, y: 1.15, length: 0.6 },
  { prop: 'washingMachine', x: face(-4, 1) + 0.3, z: -6.6, rot: 90 },
  { prop: 'rug', x: -2.95, z: -8.3, length: 1.2, color: '#90e0ef' },
  { prop: 'tallPlant', x: 2.35, z: -2.65, length: 0.5 },
  { prop: 'dresser', x: face(3, -1) - 0.25, z: -6, rot: 270, length: 1, color: '#f8f9fa', accent: '#90e0ef' },
  // Корзина для белья — тот же ящик для игрушек, плетёного цвета.
  { prop: 'toyBox', x: face(-4, 1) + 0.28, z: -4.6, rot: 90, length: 0.7, color: '#d4a373', accent: '#bc8a5f' },
  { prop: 'plant', x: -3.4, z: -2.65 },

  // ---------- Детская ----------
  { prop: 'bed', x: 11.85, z: -8.93, length: 1.1, color: '#f4a261', accent: '#ffd6a5' },
  { prop: 'nightstand', x: 10.85, z: -9.7, length: 0.45, color: '#f4a261' },
  { prop: 'toyBox', x: 6.2, z: -9.65 },
  { prop: 'beanbag', x: 5.2, z: -5.2, color: '#e76f51' },
  { prop: 'beanbag', x: 6.3, z: -4.3, color: '#4cc9f0', length: 0.8 },
  { prop: 'desk', x: face(3, 1) + 0.33, z: -8.4, rot: 90, length: 1.2, accent: '#4361ee' },
  { prop: 'chair', x: 4.3, z: -8.4, rot: 270, color: '#4361ee', accent: '#f72585' },
  { prop: 'bookshelf', x: face(HALF_W, -1, true) - 0.2, z: -4.3, rot: 270, length: 1.4, color: '#ffffff' },
  { prop: 'rug', x: 8.6, z: -5.6, length: 3, color: '#b5179e' },
  { prop: 'cardboardBox', x: 12.4, z: -2.65, length: 0.6 },
  { prop: 'cardboardBox', x: 12.4, z: -2.65, y: 0.48, length: 0.5, color: '#b88a4f' },
  { prop: 'cardboardBox', x: 4.0, z: -2.7, length: 0.55, color: '#ffd166' },
  painting(face(3, 1), -5.6, 90, 0.7),

  // ---------- Прихожая ----------
  { prop: 'coatRack', x: -12.45, z: -1.4 },
  { prop: 'shoeRack', x: -11.2, z: face(SOUTH, -1) - 0.17, rot: 180 },
  { prop: 'rug', x: -12.2, z: -0.4, rot: 90, length: 1.5, color: '#6d597a' },
  { prop: 'mirror', x: -10.3, z: face(NORTH, 1) + 0.02, y: 1.05, length: 0.6 },
  { prop: 'tallPlant', x: 12.4, z: -1.35 },
  { prop: 'cardboardBox', x: 11.6, z: 0.55, length: 0.7 },
  { prop: 'cardboardBox', x: 10.8, z: 0.6, length: 0.55, color: '#b88a4f' },
  { prop: 'cardboardBox', x: 11.25, z: 0.58, y: 0.56, length: 0.5 },
  painting(-3.2, face(SOUTH, -1) - 0.02, 180, 1),
  painting(2.6, face(SOUTH, -1) - 0.02, 180, 0.8),
  painting(4.6, face(NORTH, 1) + 0.02, 0, 0.9),

  // ---------- Гостиная ----------
  { prop: 'tvStand', x: -10.5, z: face(SOUTH, 1) + 0.23, length: 2 },
  { prop: 'sofa', x: -10.5, z: 9.5, rot: 180, length: 2.6, color: '#3d5a80', accent: '#98c1d9' },
  { prop: 'coffeeTable', x: -10.5, z: 6.2 },
  { prop: 'armchair', x: -12.45, z: 6.2, rot: 90, color: '#ee6c4d', accent: '#f7a072' },
  { prop: 'armchair', x: -8.4, z: 6.2, rot: 270, color: '#ee6c4d', accent: '#f7a072' },
  { prop: 'rug', x: -10.5, z: 6.2, length: 4, color: '#e0c3a3' },
  { prop: 'floorLamp', x: -12.5, z: 9.55 },
  { prop: 'sideboard', x: -5.2, z: 9.75, rot: 180, length: 1.8 },
  { prop: 'bookshelf', x: face(2, -1) - 0.2, z: 4.2, rot: 270, length: 1.4 },
  { prop: 'bookshelf', x: face(2, -1) - 0.2, z: 5.6, rot: 270, length: 1.4 },
  { prop: 'tallPlant', x: 1.3, z: 9.45 },
  { prop: 'table', x: -3.2, z: 5.8, length: 1.6, color: '#8a5a35' },
  { prop: 'chair', x: -3.6, z: 5.05 },
  { prop: 'chair', x: -2.8, z: 6.55, rot: 180 },
  { prop: 'bookshelf', x: -1.2, z: face(HALF_D, -1, true) - 0.22, rot: 180, length: 1.4, color: '#6b4f3a' },
  { prop: 'beanbag', x: -0.8, z: 2.6, color: '#ffb703' },
  { prop: 'cardboardBox', x: -12.45, z: 2.1, length: 0.7 },
  { prop: 'cardboardBox', x: -11.7, z: 2.0, length: 0.55, color: '#b88a4f' },
  { prop: 'plant', x: -12.5, z: 4.6 },
  painting(-10.5, face(HALF_D, -1, true) - 0.04, 180, 1.4),
  painting(face(-HALF_W, 1, true) + 0.04, 3.4, 90, 0.8),
  painting(-5.2, face(HALF_D, -1, true) - 0.04, 180, 0.7),

  // ---------- Спальня ----------
  { prop: 'bed', x: 9, z: 8.93, rot: 180, length: 1.6 },
  { prop: 'nightstand', x: 7.85, z: 9.73, rot: 180 },
  { prop: 'nightstand', x: 10.15, z: 9.73, rot: 180 },
  { prop: 'wardrobe', x: face(HALF_W, -1, true) - 0.3, z: 4.3, rot: 270, length: 1.6 },
  { prop: 'dresser', x: face(2, 1) + 0.25, z: 6.4, rot: 90 },
  { prop: 'mirror', x: face(2, 1) + 0.02, z: 6.4, y: 1.15, rot: 90, length: 0.6 },
  { prop: 'rug', x: 9, z: 6.4, length: 2.6, color: '#cdb4db' },
  { prop: 'tallPlant', x: 12.45, z: 9.45 },
  { prop: 'armchair', x: 3, z: 9.4, rot: 180, length: 0.9, color: '#cdb4db', accent: '#ffc8dd' },
  { prop: 'desk', x: 4.5, z: face(SOUTH, 1) + 0.33, length: 1.3, color: '#ede0d4', accent: '#9c6644' },
  { prop: 'chair', x: 4.6, z: 2.45, rot: 180, color: '#9c6644', accent: '#cdb4db' },
  { prop: 'bookshelf', x: face(HALF_W, -1, true) - 0.2, z: 6.6, rot: 270, length: 1.2, color: '#ede0d4' },
  { prop: 'beanbag', x: 11, z: 2.5, color: '#a2d2ff', length: 0.85 },
  painting(9, face(HALF_D, -1, true) - 0.04, 180, 1.2),
  painting(face(HALF_W, -1, true) - 0.04, 7.6, 270, 0.7),
];

/**
 * Квартира: шесть комнат, у каждой свои пол и обои, мебель, картины на стенах.
 * Хорошая карта для пряток — разная по фактуре: плитка, паркет, ковры, горошек, полоски, кирпич,
 * пёстрые полки и картины. Есть где лечь (под кроватями, столами, в ванне) и где встать (среди пальто).
 */
/**
 * Во сколько раз квартира больше настоящей. Персонаж ростом 1.6 м — как игрушка в огромном доме:
 * под столом и кроватью проходит в полный рост, на диван запрыгивает, а комнату видно как «ландшафт».
 * Планировка ниже — в обычных метрах, удобных для глаза; увеличивает её scaleMap.
 */
export const APARTMENT_SCALE = 3;

const APARTMENT_PLAN: MapDef = {
  id: 'apartment',
  name: 'Квартира',
  width: WIDTH,
  depth: DEPTH,
  skyColor: '#cfe8ff',
  floorColor: '#b08968',
  floorSurface: 'parquet',
  ceiling: { height: WALL_H, color: '#fbf7f0' },
  boxes: [
    // Под потолком по внешним стенам лазать можно: выше потолка всё равно не вылезешь.
    ...perimeterWalls(WIDTH, DEPTH, WALL_H, '#e9e4dc', 'paint', true),
    // Потолок для физики: голова упирается в него при прыжке и лазании (виден — отдельная плоскость).
    { x: 0, z: 0, y: WALL_H, w: WIDTH + 2, h: 1, d: DEPTH + 2, color: '#000000', hidden: true },
    ...buildWalls(LINES, { surface: 'paint', color: '#e9e4dc' }),
    ...Object.values(ROOMS).flatMap((room) => finishRoom(room, LINES, { halfW: HALF_W, halfD: HALF_D })),
  ],
  props: PROPS,
  // Прячущиеся и лобби — в прихожей: оттуда во все комнаты по одной двери.
  spawns: [vec3(-8, 0, -0.4), vec3(-4, 0, -0.4), vec3(0, 0, -0.4), vec3(4, 0, -0.4), vec3(-6, 0, 0.4), vec3(2, 0, 0.4)],
  // Ищущие ждут в гостиной, у дивана, — подальше от входа в спальни.
  seekerSpawns: [vec3(-6, 0, 4), vec3(-5, 0, 3.4)],
};

export const APARTMENT: MapDef = scaleMap(APARTMENT_PLAN, APARTMENT_SCALE);

/** Центры комнат (уже в масштабе карты) — для проверки, что в каждую можно пройти (см. тест карты). */
export const APARTMENT_ROOM_CENTERS = Object.fromEntries(
  Object.entries(ROOMS).map(([name, r]) => [
    name,
    vec3(((r.x0 + r.x1) / 2) * APARTMENT_SCALE, 0, ((r.z0 + r.z1) / 2) * APARTMENT_SCALE),
  ]),
);
