import { vec3 } from '../../math.js';
import { scaleMap, type MapDef } from '../map.js';
import { PALETTE as P, assembly, box, floorMosaic, lettering, paintFace, place, type Assembly, type Passage } from '../procedural.js';
import { buildBakery, buildCart, buildCheckout, buildFreezer, buildFridge, buildGondola, buildPallet, buildProduce } from './fixtures.js';

/**
 * Супермаркет Mecha Mart — карта из пакета внешнего генератора (как Ала-Тоо), перенесённая в формат MapDef.
 * Торговый зал: шесть двусторонних стеллажей, холодильники, овощи, хлеб, морозильники, три кассы, тележки;
 * за перегородкой с двумя проёмами — склад с поддонами. Под стеллажами, кассами и тележками проходишь стоя.
 *
 * План — в обычных метрах (зал 28 × 24, потолок 4.14), ×3 делает scaleMap: 84 × 72 м, потолок 12.4 м.
 * Отличия от пакета: пол — плоскость карты (а не блок поверх неё: мерцали бы), крыша — потолок карты
 * (MapDef.ceiling: свет солнца проходит, тень от него не падает), видимые блоки с коллайдером «один в один»
 * сведены в один твёрдый блок, стены и перегородка — по одному блоку на участок (вместо низа и верха).
 */
const WIDTH = 28;
const DEPTH = 24;
const CEILING = 4.14;
export const SUPERMARKET_SCALE = 3;

type Kind = 'gondola' | 'fridge' | 'produce' | 'bakery' | 'freezer' | 'checkout' | 'pallet' | 'cart';
interface Fixture {
  kind: Kind;
  x: number;
  z: number;
  turn: number;
  color?: string;
  variant?: number;
}

/** Расстановка отделов (в метрах плана). Другой магазин — другая таблица из тех же сборок. */
const FIXTURES: Fixture[] = [
  { kind: 'gondola', x: -6.2, z: -3.2, turn: 1, color: P.coral, variant: 0 },
  { kind: 'gondola', x: 0, z: -3.2, turn: 1, color: P.purple, variant: 1 },
  { kind: 'gondola', x: 6.2, z: -3.2, turn: 1, color: P.blue, variant: 2 },
  { kind: 'gondola', x: -6.2, z: 2.8, turn: 1, color: P.yellow, variant: 3 },
  { kind: 'gondola', x: 0, z: 2.8, turn: 1, color: P.mint, variant: 4 },
  { kind: 'gondola', x: 6.2, z: 2.8, turn: 1, color: P.orange, variant: 5 },
  { kind: 'fridge', x: -2.8, z: -6.15, turn: 0, color: P.blue },
  { kind: 'fridge', x: 0, z: -6.15, turn: 0, color: P.teal },
  { kind: 'fridge', x: 2.8, z: -6.15, turn: 0, color: P.purple },
  { kind: 'produce', x: -10.4, z: -2.5, turn: 1, color: P.yellow },
  { kind: 'bakery', x: 10.4, z: -2.5, turn: 1 },
  { kind: 'freezer', x: -10.3, z: 3.9, turn: 1, color: P.teal },
  { kind: 'freezer', x: 10.3, z: 3.9, turn: 1, color: P.lavender },
  { kind: 'checkout', x: -5.2, z: 8.7, turn: 0, color: P.coral },
  { kind: 'checkout', x: 0, z: 8.7, turn: 0, color: P.mint },
  { kind: 'checkout', x: 5.2, z: 8.7, turn: 0, color: P.blue },
  { kind: 'pallet', x: -10.8, z: -10.1, turn: 0, color: P.orange, variant: 0 },
  { kind: 'pallet', x: -4.1, z: -10.1, turn: 0, color: P.lavender, variant: 1 },
  { kind: 'pallet', x: 0, z: -10.1, turn: 0, color: P.mint, variant: 2 },
  { kind: 'pallet', x: 4.1, z: -10.1, turn: 0, color: P.coral, variant: 3 },
  { kind: 'pallet', x: 10.8, z: -10.1, turn: 0, color: P.yellow, variant: 4 },
  { kind: 'cart', x: -10.7, z: 8.7, turn: 0, color: P.coral },
  { kind: 'cart', x: 10.7, z: 8.7, turn: 1, color: P.teal },
];

/** Вариант наполнения полок: в пакете — номер плюс зерно генератора (30102026 % 7 = 6). */
const SEED_SHIFT = 6;

function build(f: Fixture): Assembly {
  const color = f.color ?? P.ivory;
  const variant = (f.variant ?? 0) + SEED_SHIFT;
  switch (f.kind) {
    case 'gondola':
      return buildGondola(color, variant);
    case 'fridge':
      return buildFridge(color);
    case 'produce':
      return buildProduce(color);
    case 'bakery':
      return buildBakery();
    case 'freezer':
      return buildFreezer(color);
    case 'checkout':
      return buildCheckout(color);
    case 'pallet':
      return buildPallet(color, variant);
    case 'cart':
      return buildCart(color);
  }
}

function buildPlan(): Assembly {
  const a = assembly();

  // Швы плитки — тонкие полоски краски, а не плитки-кубики.
  for (let x = -13; x <= 13; x += 1.3) box(a, x, 0.005, 0, 0.018, 0.01, 23.4, P.cream, false, 0);
  for (let z = -11; z <= 11; z += 1.3) box(a, 0, 0.006, z, 27.4, 0.012, 0.018, P.cream, false, 0);
  box(a, 0, 0.008, -9.4, 27.4, 0.012, 4.4, P.peach, false, 0);
  box(a, 0, 0.009, 10.8, 27.4, 0.014, 1.6, P.waterLight, false, 0);
  for (const x of [-6.2, 0, 6.2]) floorMosaic(a, x, 6.0, [P.coral, P.mint, P.blue, P.yellow], 0, 0);
  for (const x of [-8, 8]) {
    paintFace(a, 'top', vec3(x, 0.015, -7.0), [1.8, 1.4], P.yellow);
    for (const dx of [-0.5, 0, 0.5]) paintFace(a, 'top', vec3(x + dx, 0.023, -7.0), [0.16, 0.9], P.dark);
  }

  // Наружные стены: по ним не лезть (под потолком всё равно некуда, а висеть у потолка — нечестно).
  box(a, -13.85, 2.1, 0, 0.3, 4.2, 24, P.cream, true, 0.025, true);
  box(a, 13.85, 2.1, 0, 0.3, 4.2, 24, P.cream, true, 0.025, true);
  box(a, 0, 2.1, -11.85, 27.4, 4.2, 0.3, P.teal, true, 0.025, true);
  box(a, 0, 2.1, 11.85, 27.4, 4.2, 0.3, P.waterDark, true, 0.025, true);

  // Перегородка склада с двумя проёмами 2 м (×3 — 6 м) и балкой над ними.
  for (const [x, w] of [
    [-11.35, 4.7],
    [0, 14],
    [11.35, 4.7],
  ] as const) {
    box(a, x, 1.68, -6.95, w, 3.36, 0.22, P.peach, true, 0.025, true);
  }
  box(a, 0, 3.78, -6.95, 27.4, 0.84, 0.22, P.ivory, true, 0.025, true);
  for (const x of [-9, -7, 7, 9]) box(a, x, 1.7, -6.79, 0.075, 3.4, 0.07, P.dark, false, 0.015);
  for (const x of [-8, 8]) {
    box(a, x, 3.35, -6.78, 1.8, 0.48, 0.08, P.teal, false, 0.035);
    lettering(a, 'STOCK', x, 3.35, -6.731, 0.21, P.ivory);
  }

  // Витрина: непрозрачная и плоская — пипетка берёт её цвет, как у любой стены.
  for (const x of [-10, -5, 0, 5, 10]) {
    box(a, x, 2.1, 11.68, 4.6, 2.45, 0.045, P.blue, false, 0.03);
    box(a, x + 2.38, 2.05, 11.63, 0.09, 2.6, 0.08, P.white, false, 0.015);
  }
  for (const x of [-0.6, 0.6]) box(a, x, 1.65, 11.6, 0.07, 0.65, 0.07, P.white, false, 0.02);

  // Название магазина на дальней стене — из цветных блоков.
  box(a, 0, 3.2, -11.665, 8.9, 1.25, 0.12, P.ivory, false, 0.075);
  lettering(a, 'MECHA MART', 0, 3.2, -11.594, 0.49, P.teal);

  // Светильники под потолком: плафон светится сам (glow), настоящих источников света нет.
  for (const x of [-10, -5, 0, 5, 10]) {
    for (const z of [-9, -3, 3, 8]) {
      box(a, x, 4.06, z, 2.3, 0.1, 0.38, P.dark, false, 0.035);
      box(a, x, 3.999, z, 2.12, 0.025, 0.25, P.paint, false, 0.008).glow = true;
    }
  }

  for (const f of FIXTURES) {
    place(a, build(f), f.x, f.z, f.turn);
    if (f.kind === 'gondola') {
      const color = f.color ?? P.ivory;
      box(a, f.x, 2.86, f.z + 2.12, 1.65, 0.48, 0.09, color, true, 0.035);
      lettering(a, `0${(f.variant ?? 0) + 1}`, f.x, 2.86, f.z + 2.171, 0.3, P.ivory);
      box(a, f.x, 2.58, f.z + 2.12, 0.065, 0.2, 0.065, P.dark, false, 0.01);
    }
  }

  // Вывески отделов и номера касс.
  for (const [text, x, z, color] of [
    ['FRESH', -10.4, -2.5, P.leaf],
    ['BAKERY', 10.4, -2.5, P.coral],
  ] as const) {
    box(a, x, 2.42, z, 2.6, 0.59, 0.1, color, false, 0.045);
    lettering(a, text, x, 2.42, z + 0.057, 0.27, P.ivory);
    for (const dx of [-1, 1]) box(a, x + dx, 1.94, z, 0.055, 0.4, 0.055, P.dark, false, 0.01);
  }
  for (let i = 0; i < 3; i++) {
    const x = -5.2 + i * 5.2;
    box(a, x, 2.6, 8.7, 0.85, 0.66, 0.09, [P.coral, P.mint, P.blue][i]!, false, 0.06);
    lettering(a, String(i + 1), x, 2.6, 8.753, 0.4, P.ivory);
    box(a, x, 1.93, 8.7, 0.06, 0.67, 0.06, P.dark, false, 0.01);
  }

  a.passages.push(...ROUTES);
  return a;
}

/** Главные маршруты зала и оба прохода на склад — тест проверяет их нашей физикой. */
const ROUTES: Passage[] = [
  { id: 'cross-aisle', from: vec3(-12.5, 0, -0.2), to: vec3(12.5, 0, -0.2) },
  { id: 'rear-aisle', from: vec3(-8, 0, -5.5), to: vec3(8, 0, -5.5) },
  { id: 'front-aisle', from: vec3(-8, 0, 6.2), to: vec3(8, 0, 6.2) },
  { id: 'warehouse', from: vec3(-8, 0, -8.1), to: vec3(8, 0, -8.1) },
  { id: 'west-stock-door', from: vec3(-8, 0, -8.1), to: vec3(-8, 0, -5.5) },
  { id: 'east-stock-door', from: vec3(8, 0, -8.1), to: vec3(8, 0, -5.5) },
];

const plan = buildPlan();

const PLAN: MapDef = {
  id: 'supermarket',
  name: 'Супермаркет',
  width: WIDTH,
  depth: DEPTH,
  floorColor: P.ivory,
  skyColor: '#cfe8ff',
  ceiling: { height: CEILING, color: P.white },
  boxes: [
    ...plan.boxes,
    // Потолок для физики: голова упирается в него при прыжке и лазании (виден — отдельная плоскость).
    { x: 0, z: 0, y: CEILING, w: WIDTH + 2, h: 1, d: DEPTH + 2, color: '#000000', hidden: true },
  ],
  spawns: [
    vec3(-8, 0, -8),
    vec3(8, 0, -8),
    vec3(-3.1, 0, -3),
    vec3(3.1, 0, -3),
    vec3(-8.1, 0, 3.4),
    vec3(8.1, 0, 3.4),
    vec3(-2.5, 0, 10.8),
    vec3(2.5, 0, 10.8),
  ],
  // Ищущие ждут в проходе у касс: отсюда одинаково близко до всех отделов и до склада.
  seekerSpawns: [vec3(-1.5, 0, 6.2), vec3(1.5, 0, 6.2)],
  // Зал плотный, укрытий много, и 8 игрокам нужно время: 5 минут (решение пользователя).
  seekSeconds: 300,
};

export const SUPERMARKET: MapDef = scaleMap(PLAN, SUPERMARKET_SCALE);

/** Проходы под оборудованием и маршруты зала — в мировых координатах карты. */
export const SUPERMARKET_PASSAGES: Passage[] = plan.passages.map((p) => {
  const k = SUPERMARKET_SCALE;
  return { id: p.id, from: vec3(p.from.x * k, p.from.y * k, p.from.z * k), to: vec3(p.to.x * k, p.to.y * k, p.to.z * k) };
});
