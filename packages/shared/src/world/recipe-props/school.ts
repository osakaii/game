import { vec3 } from '../../math.js';
import { PALETTE as P, assembly, box, cylinder, lettering, paintFace, sphere, type Assembly } from '../procedural.js';

/**
 * Школьная мебель из коллекции генератора: спокойные цвета (дерево, металл, светлые стены),
 * узнаваемые вещи и мелкие цветные детали для маскировки — тетради, корешки книг, рюкзаки.
 * Всё в метрах плана (центр основания в 0, «лицо» к +Z), ×3 делает карта.
 */
export const SCHOOL_COLORS = {
  wall: '#eeeade',
  wood: '#c79d6a',
  metal: '#69777c',
  board: '#426a59',
  blue: '#759ab4',
  mint: '#91b8a0',
  ochre: '#ccad70',
  rose: '#c88f87',
  violet: '#aaa0bc',
  ink: '#354750',
  linen: '#d8d2bc',
} as const;
const S = SCHOOL_COLORS;

/** Столешница на четырёх тонких ножках: после ×3 под ней проходят стоя. */
function tabletop(a: Assembly, w: number, d: number, h: number, color: string): void {
  for (const x of [-w / 2 + 0.14, w / 2 - 0.14]) {
    for (const z of [-d / 2 + 0.12, d / 2 - 0.12]) box(a, x, (h - 0.07) / 2, z, 0.07, h - 0.07, 0.07, S.metal, true, 0.012);
  }
  box(a, 0, h, 0, w, 0.1, d, color, true, 0.035);
}

/** Книга твёрдая: лежит на столе, в кресле или на полу — на неё встают, а не ложатся «внутрь». */
function book(a: Assembly, x: number, y: number, z: number, w: number, h: number, d: number, color: string): void {
  box(a, x, y, z, w, h, d, color, true, 0.012);
  box(a, x, y + h * 0.08, z + d / 2 + 0.004, w * 0.8, h * 0.67, 0.012, P.ivory, false, 0);
}

function paper(a: Assembly, x: number, y: number, z: number, w = 0.5, d = 0.4): void {
  box(a, x, y, z, w, 0.01, d, P.white, false, 0);
  for (let i = 0; i < 3; i++) box(a, x, y + 0.008, z - d * 0.24 + i * d * 0.2, w * 0.62, 0.005, 0.012, S.blue, false, 0);
}

/** Парта (variant 1 — стол кабинета рисования: краски, кисти). Под ней — проход между ножками. */
export function buildSchoolDesk(color: string = S.wood, variant = 0): Assembly {
  const a = assembly();
  tabletop(a, 1.75, 1.05, 0.83, color);
  box(a, 0, 0.58, -0.36, 1.42, 0.16, 0.3, S.linen, false, 0.015);
  if (variant === 1) {
    paper(a, -0.2, 0.89, 0, 0.9, 0.7);
    // Краски и банка с кистями твёрдые: лёгший на стол в них не прячется.
    for (const [i, x] of [-0.55, -0.15, 0.25, 0.55].entries()) cylinder(a, x, 0.92, -0.34, 0.16, 0.09, 0.16, [P.coral, P.blue, P.yellow, P.mint][i]!, true);
    cylinder(a, 0.56, 1.04, 0.18, 0.2, 0.28, 0.2, S.blue, true);
    for (const x of [0.5, 0.56, 0.62]) box(a, x, 1.3, 0.18, 0.025, 0.44, 0.025, S.wood, false, 0);
  } else {
    book(a, -0.38, 0.91, -0.1, 0.54, 0.07, 0.4, [S.blue, S.rose, S.mint][variant % 3]!);
    paper(a, 0.35, 0.889, 0.15, 0.52, 0.42);
    box(a, 0.3, 0.91, 0.16, 0.34, 0.028, 0.028, S.ochre, false, 0);
    box(a, 0.56, 0.95, -0.28, 0.28, 0.1, 0.14, S.rose, true, 0.025);
  }
  a.passages.push({ id: 'under-desk', from: vec3(-1.2, 0, 0), to: vec3(1.2, 0, 0) });
  return a;
}

export function buildSchoolSeat(color: string = S.blue): Assembly {
  const a = assembly();
  for (const x of [-0.26, 0.26]) for (const z of [-0.24, 0.24]) box(a, x, 0.22, z, 0.055, 0.44, 0.055, S.metal, true, 0.012);
  box(a, 0, 0.47, 0, 0.7, 0.08, 0.65, S.wood, true, 0.03);
  box(a, 0, 0.83, -0.28, 0.7, 0.55, 0.08, color, true, 0.03);
  return a;
}

/** Три шкафчика. variant 1 — средний открыт: внутри прячутся стоя. */
export function buildSchoolLockers(color: string = S.blue, variant = 0): Assembly {
  const a = assembly();
  const w = 2.55;
  box(a, 0, 0.04, 0, w, 0.08, 0.66, S.metal, true, 0.012);
  box(a, 0, 1.91, 0, w, 0.08, 0.66, color, true, 0.018);
  box(a, 0, 0.98, -0.3, w, 1.82, 0.06, color, true, 0.01);
  for (let i = 0; i < 4; i++) box(a, -1.275 + i * 0.85, 0.98, 0, 0.055, 1.82, 0.65, color, true, 0.01);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.85;
    const c = [color, S.mint, S.ochre][i]!;
    if (variant === 1 && i === 1) {
      box(a, x + 0.46, 0.98, 0.6, 0.06, 1.78, 0.62, c, true, 0.01);
      box(a, x, 0.2, -0.16, 0.48, 0.23, 0.24, S.rose, true, 0.025);
    } else {
      box(a, x, 0.98, 0.335, 0.78, 1.77, 0.045, c, true, 0.012);
      for (const y of [1.62, 1.68, 1.74]) box(a, x, y, 0.365, 0.33, 0.017, 0.012, S.ink, false, 0);
      box(a, x + 0.24, 0.96, 0.383, 0.035, 0.18, 0.025, S.ink, false, 0.005);
      box(a, x, 1.38, 0.37, 0.18, 0.11, 0.012, P.ivory, false, 0);
    }
  }
  return a;
}

/** Стеллаж с цветными корешками. Нижняя полка поднята: под ней проходят стоя. */
export function buildSchoolShelf(color: string = S.wood, variant = 0): Assembly {
  const a = assembly();
  const cols = [S.blue, S.rose, S.mint, S.ochre, S.violet, P.ivory];
  for (const x of [-1.38, 1.38]) box(a, x, 1.2, 0, 0.08, 2.4, 0.72, color, true, 0.018);
  box(a, 0, 1.59, -0.33, 2.8, 1.62, 0.06, color, true, 0.008);
  for (const y of [0.76, 1.3, 1.84, 2.38]) box(a, 0, y, 0, 2.85, 0.08, 0.76, color, true, 0.012);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 8; i++) {
      const x = -1.16 + i * 0.32;
      const h = 0.32 + ((row + i) % 3) * 0.055;
      // Книги твёрдые: между полками (после ×3 — 1.4 м) иначе лёг бы и утонул в корешках.
      box(a, x, 0.82 + row * 0.54 + h / 2, 0.06, 0.19, h, 0.42, cols[(i + row + variant) % cols.length]!, true, 0.01);
      box(a, x, 0.91 + row * 0.54, 0.278, 0.13, 0.025, 0.012, P.ivory, false, 0);
    }
  }
  a.passages.push({ id: 'under-shelf', from: vec3(0, 0, -0.95), to: vec3(0, 0, 0.95) });
  return a;
}

/** Лабораторный стол: мойка, кран, колбы, микроскоп. Под свободной частью — проход. */
export function buildSchoolLab(color: string = S.mint, variant = 0): Assembly {
  const a = assembly();
  tabletop(a, 3.0, 1.5, 0.94, S.linen);
  box(a, -1.1, 0.49, 0, 0.58, 0.86, 1.2, color, true, 0.03);
  // Мойка, колбы и микроскоп твёрдые: на столе лежат поверх них, а не в них.
  box(a, 0.88, 0.995, 0, 0.65, 0.05, 0.6, S.metal, true, 0.025);
  box(a, 0.88, 1.01, 0, 0.5, 0.03, 0.43, S.ink, false, 0.025);
  box(a, 0.88, 1.27, -0.42, 0.045, 0.5, 0.045, S.metal, false, 0.008);
  box(a, 0.75, 1.49, -0.42, 0.29, 0.045, 0.045, S.metal, false, 0.008);
  for (const [i, x] of [-0.6, -0.1, 0.34].entries()) {
    cylinder(a, x, 1.12, 0.16, 0.23, 0.24, 0.23, [P.teal, P.purple, P.orange][(i + variant) % 3]!, true);
    cylinder(a, x, 1.3, 0.16, 0.11, 0.13, 0.11, P.ivory);
  }
  box(a, -0.2, 1.05, -0.4, 0.44, 0.12, 0.28, S.ink, true, 0.02);
  box(a, -0.2, 1.27, -0.4, 0.08, 0.34, 0.08, P.ivory, true, 0.012);
  box(a, -0.06, 1.4, -0.4, 0.31, 0.12, 0.13, S.metal, true, 0.018);
  a.passages.push({ id: 'under-lab', from: vec3(0.25, 0, -1), to: vec3(0.25, 0, 1) });
  return a;
}

/** Компьютерный стол: монитор, клавиатура, мышь, системный блок под столом справа. */
export function buildSchoolComputer(color: string = S.blue): Assembly {
  const a = assembly();
  tabletop(a, 2.1, 1.05, 0.83, S.wood);
  // Монитор, подставка и клавиатура твёрдые: стоящий на столе за ними не прячется.
  box(a, 0, 0.95, -0.24, 0.42, 0.12, 0.3, S.ink, true, 0.02);
  box(a, 0, 1.15, -0.3, 0.08, 0.34, 0.08, S.ink, true, 0.008);
  box(a, 0, 1.48, -0.3, 0.96, 0.65, 0.1, S.ink, true, 0.025);
  box(a, 0, 1.48, -0.242, 0.86, 0.54, 0.02, color, false, 0.012);
  for (const y of [1.33, 1.44, 1.55]) box(a, -0.1, y, -0.227, 0.45, 0.025, 0.009, P.ivory, false, 0);
  box(a, 0, 0.91, 0.22, 0.68, 0.045, 0.24, S.ink, true, 0.014);
  for (const x of [-0.24, -0.12, 0, 0.12, 0.24]) box(a, x, 0.94, 0.22, 0.055, 0.012, 0.17, P.ivory, false, 0);
  sphere(a, 0.62, 0.94, 0.22, 0.14, 0.075, 0.22, S.ink);
  box(a, 0.78, 0.35, -0.31, 0.26, 0.62, 0.23, S.ink, true, 0.02);
  a.passages.push({ id: 'under-computer', from: vec3(-1.35, 0, 0.12), to: vec3(1.35, 0, 0.12) });
  return a;
}

/** Доска на стене: variant 0 — «A B C / 1 2 3», иначе строки и цветные пометки. */
export function buildSchoolBoard(color: string = S.board, variant = 0): Assembly {
  const a = assembly();
  // Рама твёрдая: прижавшись к стене, в доску не «вдавиться».
  box(a, 0, 1.65, 0, 4.7, 1.7, 0.06, S.wood, true, 0.025);
  box(a, 0, 1.65, 0.04, 4.5, 1.5, 0.025, color, false, 0.008);
  if (variant === 0) {
    lettering(a, 'A B C', 0, 1.98, 0.062, 0.28, P.ivory);
    lettering(a, '1 2 3', 0, 1.42, 0.062, 0.25, P.ivory);
  } else {
    for (const [i, y] of [1.1, 1.45, 1.8, 2.15].entries()) {
      box(a, -0.25, y, 0.062, 2.4 - i * 0.23, 0.022, 0.012, P.ivory, false, 0);
      box(a, 1.4, y, 0.062, 0.32, 0.07, 0.012, [P.coral, P.yellow, P.mint, P.blue][i]!, false, 0);
    }
  }
  box(a, 0, 0.84, 0.14, 4.65, 0.06, 0.22, S.metal, true, 0.012);
  for (const x of [-0.9, -0.65]) box(a, x, 0.9, 0.14, 0.17, 0.03, 0.03, P.ivory, false, 0);
  return a;
}

/** Плакат на стене, четыре рисунка: таблица, планета, ноты, натюрморт. */
export function buildSchoolPoster(color: string = S.blue, variant = 0): Assembly {
  const a = assembly();
  box(a, 0, 1.15, 0, 1.5, 1.85, 0.02, P.ivory, false, 0.008);
  box(a, 0, 1.78, 0.018, 1.2, 0.2, 0.012, color, false, 0);
  if (variant === 0) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        box(a, -0.5 + col * 0.25, 0.5 + row * 0.25, 0.02, 0.19, 0.19, 0.015, [color, S.mint, S.rose, S.ochre][(row + col) % 4]!, false, 0);
      }
    }
  } else if (variant === 1) {
    sphere(a, 0, 1.0, 0.025, 0.74, 0.74, 0.015, color);
    for (const x of [-0.42, 0.42]) sphere(a, x, 0.66, 0.03, 0.23, 0.23, 0.015, S.ochre);
    box(a, 0, 0.4, 0.03, 0.92, 0.06, 0.012, S.mint, false, 0);
  } else if (variant === 2) {
    for (let i = 0; i < 5; i++) box(a, 0, 0.66 + i * 0.14, 0.025, 1.1, 0.018, 0.012, S.ink, false, 0);
    for (const [x, y] of [
      [-0.3, 0.75],
      [0.1, 1.02],
      [0.4, 0.9],
    ] as const) {
      sphere(a, x, y, 0.035, 0.16, 0.12, 0.02, color);
      box(a, x + 0.06, y + 0.18, 0.035, 0.025, 0.35, 0.012, S.ink, false, 0);
    }
  } else {
    box(a, 0, 0.64, 0.025, 0.9, 0.6, 0.012, S.mint, false, 0);
    sphere(a, 0.3, 1.27, 0.035, 0.3, 0.3, 0.018, S.ochre);
    for (const [i, x] of [-0.3, 0, 0.3].entries()) box(a, x, 0.87, 0.04, 0.16, 0.42, 0.012, [S.rose, S.blue, S.violet][i]!, false, 0);
  }
  return a;
}

export function buildSchoolBag(color: string = S.rose): Assembly {
  const a = assembly();
  box(a, 0, 0.38, 0, 0.55, 0.76, 0.4, color, true, 0.095);
  box(a, 0, 0.27, 0.23, 0.39, 0.3, 0.11, color, false, 0.045);
  box(a, 0, 0.32, 0.295, 0.28, 0.024, 0.012, P.ivory, false, 0);
  for (const x of [-0.2, 0.2]) box(a, x, 0.43, -0.23, 0.06, 0.52, 0.04, S.ink, false, 0.02);
  box(a, 0, 0.8, 0, 0.24, 0.08, 0.055, S.ink, false, 0.02);
  return a;
}

export function buildSchoolGlobe(): Assembly {
  const a = assembly();
  cylinder(a, 0, 0.05, 0, 0.65, 0.1, 0.65, S.ink, true);
  // Стойка и шар твёрдые: по стойке лезут, а шар не пускает внутрь — сидят на нём сверху.
  cylinder(a, 0, 0.58, 0, 0.08, 0.96, 0.08, S.metal, true);
  sphere(a, 0, 1.35, 0, 0.91, 0.91, 0.91, S.blue, true);
  for (const [x, y, z, w, h, d] of [
    [-0.22, 1.51, 0.25, 0.32, 0.25, 0.3],
    [0.21, 1.28, 0.32, 0.22, 0.4, 0.2],
    [0.23, 1.62, -0.13, 0.25, 0.19, 0.3],
  ] as const) {
    sphere(a, x, y, z, w, h, d, S.mint);
  }
  return a;
}

export function buildSchoolEasel(color: string = S.rose, variant = 0): Assembly {
  const a = assembly();
  for (const x of [-0.56, 0.56]) box(a, x, 0.9, 0, 0.07, 1.8, 0.1, S.wood, true, 0.012);
  box(a, 0, 0.04, 0, 1.35, 0.08, 0.65, S.wood, true, 0.015);
  box(a, 0, 1.38, 0, 1.38, 1.14, 0.1, S.wood, true, 0.02);
  box(a, 0, 1.38, 0.062, 1.24, 1.02, 0.025, P.ivory, false, 0.008);
  sphere(a, -0.25, 1.64, 0.082, 0.35, 0.35, 0.015, S.ochre);
  box(a, 0, 1.1, 0.082, 1.22, 0.38, 0.012, S.mint, false, 0);
  for (const [i, x] of [-0.4, 0, 0.4].entries()) box(a, x, 1.34, 0.1, 0.2, 0.45, 0.012, [color, S.blue, S.violet][(i + variant) % 3]!, false, 0);
  return a;
}

export function buildSchoolPiano(color: string = S.ink): Assembly {
  const a = assembly();
  box(a, 0, 0.56, 0, 2.6, 1.12, 0.66, color, true, 0.045);
  box(a, 0, 1.17, -0.18, 2.65, 0.13, 0.38, color, true, 0.025);
  box(a, 0, 0.77, 0.47, 2.64, 0.16, 0.36, color, true, 0.025);
  for (let i = 0; i < 17; i++) {
    // Клавиши твёрдые: на клавиатуре лежат поверх клавиш.
    box(a, -1.18 + i * 0.147, 0.87, 0.49, 0.13, 0.045, 0.28, P.ivory, true, 0.004);
    if (i % 7 !== 2 && i % 7 !== 6) box(a, -1.12 + i * 0.147, 0.9, 0.42, 0.06, 0.04, 0.14, S.ink, true, 0.004);
  }
  box(a, 0, 1.03, 0.17, 0.95, 0.3, 0.035, P.ivory, false, 0.008);
  for (const y of [0.97, 1.03, 1.09]) box(a, 0, y, 0.193, 0.7, 0.012, 0.008, S.ink, false, 0);
  return a;
}

export function buildSchoolDrums(color: string = S.rose): Assembly {
  const a = assembly();
  for (const [x, z, w, h] of [
    [-0.55, 0.1, 0.65, 0.64],
    [0.4, 0.1, 0.85, 0.9],
    [0, -0.65, 0.5, 0.75],
  ] as const) {
    cylinder(a, x, h / 2, z, w, h, w, color, true);
    cylinder(a, x, h + 0.015, z, w + 0.025, 0.05, w + 0.025, P.ivory, true);
  }
  box(a, 1.15, 0.65, -0.35, 0.045, 1.3, 0.045, S.metal, true, 0.008);
  cylinder(a, 1.15, 1.31, -0.35, 0.88, 0.025, 0.88, S.ochre, true);
  return a;
}

/** Стойка с мячами: три металлические полки, мячи оранжевые и белые через один. */
export function buildSchoolSports(variant = 0): Assembly {
  const a = assembly();
  box(a, 0, 0.04, 0, 2.8, 0.08, 0.9, S.metal, true, 0.012);
  for (const x of [-1.35, 1.35]) box(a, x, 0.95, 0, 0.07, 1.9, 0.85, S.metal, true, 0.012);
  for (const y of [0.15, 0.84, 1.53]) box(a, 0, y, 0, 2.75, 0.07, 0.85, S.metal, true, 0.012);
  for (const [i, x] of [-0.85, 0, 0.85].entries()) {
    for (const y of [0.47, 1.16]) {
      // Мячи твёрдые: полки стойки после ×3 — как ниши, без мячей-препятствий в них легли бы.
      sphere(a, x, y, 0, 0.57, 0.57, 0.57, (i + variant) % 2 ? P.orange : P.ivory, true);
      box(a, x, y, 0.285, 0.035, 0.5, 0.012, S.ink, false, 0);
    }
  }
  return a;
}

/** Баскетбольный щит на столбе, кольцо из шариков. */
export function buildSchoolHoop(color: string = P.white): Assembly {
  const a = assembly();
  box(a, 0, 1.6, -0.35, 0.1, 3.2, 0.1, S.metal, true, 0.018);
  box(a, 0, 2.85, -0.3, 1.85, 1.2, 0.1, color, true, 0.02);
  for (const x of [-0.35, 0.35]) box(a, x, 2.7, -0.24, 0.045, 0.46, 0.02, S.rose, false, 0);
  for (const y of [2.48, 2.92]) box(a, 0, y, -0.24, 0.74, 0.045, 0.02, S.rose, false, 0);
  for (let i = 0; i < 12; i++) {
    const t = (i * Math.PI) / 6;
    sphere(a, Math.cos(t) * 0.34, 2.47, 0.17 + Math.sin(t) * 0.34, 0.1, 0.07, 0.1, P.orange);
  }
  for (const x of [-0.28, 0, 0.28]) box(a, x, 2.27, 0.17, 0.025, 0.36, 0.035, P.ivory, false, 0.004);
  return a;
}

/** Стопка из четырёх цветных матов. */
export function buildSchoolMats(color: string = S.blue): Assembly {
  const a = assembly();
  for (let i = 0; i < 4; i++) {
    box(a, (i % 2) * 0.08, 0.12 + i * 0.24, 0, 2.4, 0.22, 1.4, [color, S.rose, S.mint, S.ochre][i]!, true, 0.06);
    box(a, -0.5, 0.12 + i * 0.24, 0.717, 0.35, 0.025, 0.025, P.ivory, false, 0);
  }
  return a;
}

/** Длинный стол столовой со скамьями и подносами. Вдоль столешницы — проход под ней. */
export function buildSchoolLunch(color: string = S.wood): Assembly {
  const a = assembly();
  tabletop(a, 3.5, 1.35, 0.84, color);
  for (const z of [-1.05, 1.05]) {
    for (const x of [-1.35, 1.35]) box(a, x, 0.23, z, 0.1, 0.46, 0.1, S.metal, true, 0.018);
    box(a, 0, 0.49, z, 3.6, 0.1, 0.45, S.mint, true, 0.035);
  }
  for (const x of [-1.1, 0, 1.1]) {
    // Подносы с едой твёрдые, как посуда в ресторане: лёгший на стол в них не тонет.
    box(a, x, 0.92, 0, 0.8, 0.045, 0.54, S.blue, true, 0.025);
    cylinder(a, x - 0.1, 0.95, 0, 0.37, 0.035, 0.37, P.ivory, true);
    sphere(a, x - 0.1, 1.04, 0, 0.2, 0.16, 0.2, S.ochre, true);
    cylinder(a, x + 0.24, 1.04, 0.08, 0.12, 0.22, 0.12, P.ivory, true);
  }
  a.passages.push({ id: 'under-lunch', from: vec3(-2.1, 0, 0), to: vec3(2.1, 0, 0) });
  return a;
}

/** Раздача: стойка с лотками еды. */
export function buildSchoolCounter(color: string = S.mint): Assembly {
  const a = assembly();
  box(a, 0, 0.53, 0, 3.2, 1.06, 1.2, color, true, 0.035);
  box(a, 0, 1.12, 0, 3.35, 0.12, 1.35, P.ivory, true, 0.025);
  for (const [i, x] of [-1, 0, 1].entries()) {
    box(a, x, 1.21, 0, 0.82, 0.09, 0.76, S.metal, true, 0.025);
    sphere(a, x, 1.28, 0, 0.66, 0.08, 0.56, [S.rose, S.ochre, S.mint][i]!, true);
    paintFace(a, 'front', vec3(x, 0.54, 0.606), [0.9, 0.9], color);
  }
  return a;
}

/** Витрина с кубками. */
export function buildSchoolTrophy(color: string = S.wood): Assembly {
  const a = assembly();
  box(a, 0, 0.86, 0, 2.4, 1.72, 0.64, color, true, 0.025);
  box(a, 0, 1.06, 0.33, 2.12, 1.2, 0.025, S.blue, false, 0.012);
  for (const x of [-0.7, 0, 0.7]) {
    box(a, x, 0.7, 0.365, 0.36, 0.09, 0.08, S.ink, false, 0.01);
    box(a, x, 0.9, 0.365, 0.05, 0.35, 0.055, S.ochre, false, 0.008);
    sphere(a, x, 1.13, 0.365, 0.41, 0.35, 0.08, S.ochre);
    for (const dx of [-0.22, 0.22]) sphere(a, x + dx, 1.14, 0.37, 0.13, 0.2, 0.07, S.ochre);
  }
  return a;
}

/** Ячейки гардероба со сменкой. */
export function buildSchoolCubbies(color: string = S.wood): Assembly {
  const a = assembly();
  box(a, 0, 0.94, -0.3, 3.1, 1.88, 0.08, color, true, 0.012);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) box(a, x, 0.94, 0, 0.08, 1.88, 0.65, color, true, 0.012);
  for (const y of [0.05, 0.92, 1.84]) box(a, 0, y, 0, 3.12, 0.08, 0.7, color, true, 0.012);
  for (const [i, x] of [-1, 0, 1].entries()) {
    box(a, x, 0.36, 0, 0.62, 0.48, 0.4, [S.blue, S.rose, S.mint][i]!, true, 0.07);
    box(a, x, 1.35, -0.2, 0.62, 0.58, 0.15, [S.mint, S.ochre, S.violet][i]!, true, 0.04);
  }
  return a;
}

/** Тележка уборщицы: ведро, швабра. */
export function buildSchoolJanitor(color: string = S.ochre): Assembly {
  const a = assembly();
  box(a, 0, 0.45, 0, 0.85, 0.9, 0.64, color, true, 0.05);
  for (const x of [-0.35, 0.35]) for (const z of [-0.25, 0.25]) sphere(a, x, 0.1, z, 0.14, 0.2, 0.14, S.ink);
  cylinder(a, 0, 1.0, 0, 0.55, 0.28, 0.55, S.blue, true);
  box(a, 0.3, 1.35, -0.12, 0.035, 1.85, 0.035, S.wood, false, 0.006);
  box(a, 0.3, 0.49, -0.12, 0.45, 0.23, 0.24, S.mint, false, 0.02);
  paintFace(a, 'front', vec3(0, 0.43, 0.326), [0.65, 0.64], color);
  return a;
}

/** Кресло читального зала с книгой. */
export function buildSchoolReading(color: string = S.rose): Assembly {
  const a = assembly();
  box(a, 0, 0.22, 0, 1.15, 0.44, 1.1, color, true, 0.15);
  box(a, 0, 0.63, -0.38, 1.15, 0.74, 0.3, color, true, 0.1);
  book(a, 0, 0.49, 0.12, 0.5, 0.07, 0.42, S.blue);
  return a;
}

export function buildSchoolClock(): Assembly {
  const a = assembly();
  sphere(a, 0, 2.5, 0, 0.85, 0.85, 0.065, S.ink);
  sphere(a, 0, 2.5, 0.04, 0.74, 0.74, 0.025, P.ivory);
  for (const [x, y] of [
    [0, 2.79],
    [0, 2.21],
    [-0.29, 2.5],
    [0.29, 2.5],
  ] as const) {
    box(a, x, y, 0.065, 0.045, 0.045, 0.012, S.ink, false, 0);
  }
  box(a, 0.11, 2.5, 0.077, 0.25, 0.025, 0.014, S.ink, false, 0);
  box(a, 0, 2.65, 0.077, 0.025, 0.32, 0.014, S.ink, false, 0);
  return a;
}

const SIGN_TEXTS = ['SCHOOL', 'CLASS', 'SCIENCE', 'ART', 'LIBRARY', 'IT', 'MUSIC', 'GYM', 'CANTEEN', 'LOCKERS'];

/** Табличка кабинета над дверью. */
export function buildSchoolSign(color: string = S.blue, variant = 0): Assembly {
  const a = assembly();
  const text = SIGN_TEXTS[variant % SIGN_TEXTS.length]!;
  const w = Math.max(1.35, text.length * 0.28 + 0.3);
  box(a, 0, 2.72, 0, w, 0.45, 0.04, color, false, 0.015);
  lettering(a, text, 0, 2.72, 0.03, 0.2, P.ivory);
  return a;
}

/** Тетради и пятна краски на полу — мелкие цветные поля для маскировки. */
export function buildSchoolNotes(color: string = S.rose): Assembly {
  const a = assembly();
  book(a, -0.23, 0.035, 0, 0.76, 0.05, 0.84, color);
  paper(a, 0.35, 0.018, 0.15, 0.62, 0.8);
  book(a, -0.16, 0.075, -0.05, 0.66, 0.03, 0.7, S.blue);
  box(a, 0.25, 0.037, -0.35, 0.42, 0.024, 0.024, S.ochre, false, 0);
  for (const [x, z, c] of [
    [0.8, 0.3, P.coral],
    [0.72, -0.3, P.mint],
    [-0.82, 0.28, P.blue],
  ] as const) {
    sphere(a, x, 0.016, z, 0.24, 0.012, 0.2, c);
  }
  return a;
}

export function buildSchoolRadiator(): Assembly {
  const a = assembly();
  box(a, 0, 0.44, 0, 1.75, 0.64, 0.18, P.ivory, true, 0.015);
  for (let i = 0; i < 9; i++) box(a, -0.76 + i * 0.19, 0.44, 0.105, 0.1, 0.56, 0.045, S.linen, false, 0);
  for (const x of [-0.93, 0.93]) box(a, x, 0.44, 0, 0.13, 0.055, 0.07, S.metal, false, 0.006);
  cylinder(a, 0.97, 0.52, 0, 0.1, 0.07, 0.1, S.rose);
  return a;
}
