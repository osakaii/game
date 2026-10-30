import { vec3, type Vec3 } from '../math.js';
import type { MapBox, Shape } from './map.js';

/**
 * Набор для карт внешнего процедурного генератора (площадь Ала-Тоо, супермаркет). Планы перенесены
 * как есть, поэтому у помощников своя договорённость: `cy` — ЦЕНТР блока по высоте
 * (в `MapBox` и в мебели квартиры y — низ). Перевод в низ делает `block()` один раз.
 *
 * План — в «обычных» метрах; итоговое увеличение ×3 делает `scaleMap`, как у квартиры.
 */

/** Палитра генератора: цвета полей для маскировки + архитектура. Общая у его карт — они в одной гамме. */
export const PALETTE = {
  ivory: '#f4efdf',
  cream: '#e7ddc2',
  stone: '#c2baa5',
  white: '#fffcf0',
  blue: '#4b9ec9',
  glass: '#397c9e',
  deep: '#25536e',
  road: '#52677a',
  paint: '#fff0b3',
  grass: '#72bd6b',
  leaf: '#309766',
  leafLight: '#79c56e',
  wood: '#ba764c',
  woodLight: '#db9c5c',
  woodDark: '#925d40',
  bronze: '#695548',
  gold: '#f6c644',
  water: '#52c4de',
  waterLight: '#9ae4ed',
  waterDark: '#298cbd',
  coral: '#f27678',
  pink: '#ee78a6',
  red: '#e63e52',
  yellow: '#ffd03d',
  mint: '#89d8ad',
  purple: '#9b87d1',
  dark: '#3d555f',
  roof: '#719caf',
  teal: '#38b5ac',
  orange: '#f5a34d',
  lavender: '#b59ae2',
  peach: '#f9bb98',
} as const;

/** Проход, который обязан оставаться открытым (под скамейкой, под стеллажом, по колоннаде). Проверяет тест. */
export interface Passage {
  id: string;
  from: Vec3;
  to: Vec3;
}

/** Сборка: блоки одного объекта в его системе (центр основания в 0, «лицом» к +Z) или вся карта. */
export interface Assembly {
  boxes: MapBox[];
  passages: Passage[];
}

export function assembly(): Assembly {
  return { boxes: [], passages: [] };
}

/**
 * Видимый блок. solid — он же и препятствие (столкновение по его коробке).
 * Иначе только вид: тонкие цветные поля, листва, вода — сквозь них проходишь.
 */
export function block(
  a: Assembly,
  x: number,
  cy: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  shape: Shape = 'rounded',
  round = 0.08,
  solid = false,
  noClimb = false,
): MapBox {
  const box: MapBox = { x, y: cy - h / 2, z, w, h, d, color, shape };
  if (shape === 'rounded') box.round = Math.min(round, w / 2, h / 2, d / 2);
  if (!solid) box.solid = false;
  if (noClimb) box.noClimb = true;
  a.boxes.push(box);
  return box;
}

/** Коробка: скруглённая, если round > 0. Самый частый блок плана. */
export function box(
  a: Assembly,
  x: number,
  cy: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  solid = false,
  round = 0.06,
  noClimb = false,
): MapBox {
  return block(a, x, cy, z, w, h, d, color, round ? 'rounded' : 'box', round, solid, noClimb);
}

export function sphere(a: Assembly, x: number, cy: number, z: number, w: number, h: number, d: number, color: string, solid = false): MapBox {
  return block(a, x, cy, z, w, h, d, color, 'sphere', 0, solid);
}

export function cylinder(a: Assembly, x: number, cy: number, z: number, w: number, h: number, d: number, color: string, solid = false): MapBox {
  return block(a, x, cy, z, w, h, d, color, 'cylinder', 0, solid);
}

/** Только физика: простая коробка вместо тонкого силуэта (флагшток, ствол, столб фонаря). */
export function collide(a: Assembly, x: number, cy: number, z: number, w: number, h: number, d: number, noClimb = false): void {
  const box: MapBox = { x, y: cy - h / 2, z, w, h, d, color: '#000000', hidden: true };
  if (noClimb) box.noClimb = true;
  a.boxes.push(box);
}

/**
 * Перенести сборку на карту с поворотом на turn × 90°. При turn = 1 «лицо» (+Z) смотрит в +X.
 * Поворот кратен 90°, поэтому блоки остаются выровненными по осям — физике этого достаточно.
 */
export function place(target: Assembly, source: Assembly, x: number, z: number, turn = 0): void {
  const t = ((turn % 4) + 4) % 4;
  const rotate = (px: number, pz: number): [number, number] =>
    t === 0 ? [px, pz] : t === 1 ? [pz, -px] : t === 2 ? [-px, -pz] : [-pz, px];
  for (const b of source.boxes) {
    const [rx, rz] = rotate(b.x, b.z);
    target.boxes.push({ ...b, x: rx + x, z: rz + z, w: t % 2 ? b.d : b.w, d: t % 2 ? b.w : b.d });
  }
  for (const p of source.passages) {
    const [fx, fz] = rotate(p.from.x, p.from.z);
    const [tx, tz] = rotate(p.to.x, p.to.z);
    target.passages.push({ id: p.id, from: vec3(fx + x, p.from.y, fz + z), to: vec3(tx + x, p.to.y, tz + z) });
  }
}

/**
 * Цветное поле — тонкая «наклейка» на грани (front — грань ±Z, side — ±X, top — пол).
 * Это поля для маскировки: крупные, однотонные, достаются с земли. Препятствием не являются.
 */
export function paintFace(a: Assembly, face: 'front' | 'side' | 'top', position: Vec3, span: [number, number], color: string): MapBox {
  const [w, h] = span;
  const t = 0.008;
  const [dx, dy, dz] = face === 'top' ? [w, t, h] : face === 'side' ? [t, h, w] : [w, h, t];
  return box(a, position.x, position.y, position.z, dx, dy, dz, color, false, 0);
}

/** Ступенчатый орнамент (как на войлоке-шырдаке) из шести штрихов. */
export function stepMotif(a: Assembly, face: 'front' | 'side', position: Vec3, color: string = PALETTE.gold, size = 0.32): void {
  const k = size / 0.32;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const u = side * (0.12 + i * 0.12) * k;
      const v = (i - 1) * 0.1 * k;
      const at = face === 'front' ? vec3(position.x + u, position.y + v, position.z) : vec3(position.x, position.y + v, position.z + u);
      paintFace(a, face, at, [size * 0.38, size * 0.2], color);
    }
  }
}

/** Мозаика из шести напольных плиток 2 × 3: каждая (×3) крупнее лежащего персонажа. */
export function floorMosaic(a: Assembly, x: number, z: number, colors: string[], turn = 0, floorY = 0.07): void {
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const u = (col - 1) * 0.72;
      const v = (row - 0.5) * 0.94;
      const at = vec3(x + (turn ? v : u), floorY + 0.007, z + (turn ? u : v));
      paintFace(a, 'top', at, turn ? [0.9, 0.68] : [0.68, 0.9], colors[(col + row * 2) % colors.length]);
    }
  }
}

/** Пиксельный шрифт 5 × 5 для вывесок: буквы из обычных цветных блоков — пипетка их читает, атлас не нужен. */
const FONT: Record<string, readonly string[]> = {
  A: ['01110', '10001', '11111', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  F: ['11111', '10000', '11110', '10000', '10000'],
  H: ['10001', '10001', '11111', '10001', '10001'],
  K: ['10010', '10100', '11000', '10100', '10010'],
  L: ['10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '11110', '10100', '10010'],
  S: ['01111', '10000', '01110', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '01010', '00100', '00100', '00100'],
  '0': ['01110', '10011', '10101', '11001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '01110'],
  '2': ['11110', '00001', '01110', '10000', '11111'],
  '3': ['11110', '00001', '01110', '00001', '11110'],
  '4': ['10010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '11110'],
  '6': ['01111', '10000', '11110', '10001', '01110'],
};

/**
 * Надпись в плоскости XY (читается с +Z), центр — (x, y). Каждая непрерывная полоска пикселей строки —
 * один блок: «MECHA MART» — около сотни блоков, а не пять сотен пикселей.
 */
export function lettering(a: Assembly, text: string, x: number, y: number, z: number, height: number, color: string): void {
  const px = height / 5;
  const total = (text.length * 6 - 1) * px;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue;
    const glyph = FONT[text[i]!];
    if (!glyph) throw new Error(`Нет буквы в шрифте вывесок: ${text[i]}`);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; ) {
        if (glyph[row]![col] !== '1') {
          col++;
          continue;
        }
        const start = col;
        while (col < 5 && glyph[row]![col] === '1') col++;
        const cx = x - total / 2 + (i * 6 + (start + col) / 2) * px;
        box(a, cx, y + (2 - row) * px, z, (col - start) * px * 0.94, px * 0.88, 0.012, color, false, 0);
      }
    }
  }
}
