import { vec3 } from '../../math.js';
import { PALETTE as P, assembly, box, collide, cylinder, paintFace, sphere, stepMotif, type Assembly } from '../procedural.js';
import { puddle } from './common.js';

/** Игрушечный замок: башни, зал со ступенями, ящики, бочки, ковёр, сундук, доспехи, жаровни, рыцари. */

export function buildCrate(color: string = P.coral): Assembly {
  const a = assembly();
  box(a, 0, 0.48, 0, 1.65, 0.96, 1.42, color, true, 0.08);
  for (const side of [-1, 1]) {
    paintFace(a, 'front', vec3(0, 0.45, side * 0.714), [1.42, 0.78], color);
    for (const y of [0.12, 0.83]) paintFace(a, 'front', vec3(0, y, side * 0.72), [1.43, 0.09], P.woodLight);
    for (const x of [-0.66, 0.66]) paintFace(a, 'front', vec3(x, 0.48, side * 0.727), [0.09, 0.67], P.woodLight);
  }
  return a;
}

export function buildBarrel(color: string = P.woodLight): Assembly {
  const a = assembly();
  cylinder(a, 0, 0.55, 0, 1.1, 1.1, 1.1, color, true);
  for (const y of [0.15, 0.9]) cylinder(a, 0, y, 0, 1.15, 0.1, 1.15, P.dark);
  return a;
}

/** Башня — закрытый объём: по стене не лезть, внутри пусто. */
export function buildTower(color: string = P.purple): Assembly {
  const a = assembly();
  cylinder(a, 0, 2.05, 0, 4.4, 4.1, 4.4, P.cream);
  collide(a, 0, 2.05, 0, 4.4, 4.1, 4.4, true);
  // Крыша твёрдая: на неё не попасть, но если попал — стоишь на ней, а не внутри.
  cylinder(a, 0, 4.18, 0, 4.95, 0.28, 4.95, P.ivory, true);
  for (let i = 0; i < 3; i++) cylinder(a, 0, 4.5 + i * 0.4, 0, 4.7 - i * 1.25, 0.42, 4.7 - i * 1.25, color, true);
  box(a, 0, 5.6, 0, 0.09, 0.65, 0.09, P.dark, true, 0.02);
  box(a, 0.4, 5.8, 0, 0.8, 0.4, 0.06, color, true, 0.035);
  for (const x of [-1, 1]) {
    box(a, x * 0.85, 2.75, 2.085, 0.47, 1.0, 0.06, P.deep, false, 0.08);
    paintFace(a, 'front', vec3(x * 0.85, 0.63, 2.21), [0.72, 1.0], color);
  }
  return a;
}

/** Зал на помосте: входы с двух сторон по четырём ступеням, гобелены на стенах, два трона внутри. */
export function buildHall(color: string = P.purple): Assembly {
  const a = assembly();
  box(a, 0, 0.15, 0, 8.2, 0.3, 5.8, P.ivory, true, 0.06);
  for (const x of [-3.95, 3.95]) box(a, x, 2.2, 0, 0.3, 3.8, 5.8, P.cream, true, 0.04, true);
  for (const sign of [-1, 1]) {
    for (const x of [-2.6, 2.6]) box(a, x, 2.2, sign * 2.75, 3.0, 3.8, 0.3, P.cream, true, 0.05, true);
    box(a, 0, 3.2, sign * 2.75, 2.2, 1.8, 0.3, P.cream, true, 0.05, true);
    for (const x of [-2.65, 2.65]) {
      box(a, x, 1.3, sign * 2.91, 1.1, 2.54, 0.06, color, false, 0.04);
      stepMotif(a, 'front', vec3(x, 1.5, sign * 2.947), P.gold, 0.48);
      for (const y of [0.28, 2.31]) paintFace(a, 'front', vec3(x, y, sign * 2.95), [1.06, 0.12], P.gold);
    }
    for (let i = 0; i < 4; i++) {
      const h = 0.3 - i * 0.075;
      box(a, 0, h / 2, sign * (3.02 + i * 0.24), 1.9, h, 0.24, P.ivory, true, 0.012);
    }
  }
  box(a, 0, 4.2, 0, 8.6, 0.24, 6.2, color, true, 0.06, true);
  box(a, 0, 4.5, 0, 6.9, 0.4, 6.0, color, true, 0.06, true);
  for (const x of [-2.45, 2.45]) {
    box(a, x, 0.7, 0, 1.5, 0.8, 1.4, color, true, 0.1);
    box(a, x, 1.65, -0.5, 1.5, 1.2, 0.25, color, true, 0.1);
  }
  a.passages.push({ id: 'through-hall', from: vec3(0, 0.3, -2.5), to: vec3(0, 0.3, 2.5) });
  return a;
}

/** Красная ковровая дорожка с гербами: маскировка лёжа. */
export function buildCarpet(color: string = P.red): Assembly {
  const a = assembly();
  box(a, 0, 0.016, 0, 3.9, 0.014, 11.6, P.gold, false, 0);
  box(a, 0, 0.025, 0, 3.65, 0.01, 11.3, color, false, 0);
  for (const z of [-4.5, -1.5, 1.5, 4.5]) {
    cylinder(a, 0, 0.035, z, 1.4, 0.012, 1.4, P.gold);
    box(a, 0, 0.045, z, 0.22, 0.012, 0.8, P.ivory, false, 0);
    box(a, 0, 0.046, z, 0.7, 0.012, 0.2, P.ivory, false, 0);
  }
  return a;
}

/** Пятна мха у стены. */
export function buildMoss(color: string = P.leaf): Assembly {
  const a = assembly();
  puddle(a, 0, 0, color, 0.85);
  puddle(a, 1.3, 0.6, P.leafLight, 0.35);
  return a;
}

/** Открытый сундук с монетами, несколько монет рассыпано рядом. */
export function buildTreasure(color: string = P.woodLight): Assembly {
  const a = assembly();
  box(a, 0, 0.46, 0, 1.9, 0.92, 1.1, color, true, 0.08);
  box(a, 0, 0.94, 0, 1.65, 0.035, 0.85, P.deep, true, 0.02);
  box(a, 0, 1.35, -0.48, 1.9, 0.85, 0.14, color, true, 0.06);
  for (const x of [-0.68, 0.68]) {
    box(a, x, 0.47, 0.56, 0.14, 0.88, 0.025, P.gold, false, 0.015);
    box(a, x, 1.35, -0.39, 0.14, 0.8, 0.025, P.gold, false, 0.015);
  }
  for (let i = 0; i < 10; i++) cylinder(a, ((i % 5) - 2) * 0.28, 0.99, 0.17 * Math.floor(i / 5), 0.23, 0.035, 0.23, P.gold, true);
  for (const [x, z] of [
    [-0.7, 0.88],
    [0, 1.03],
    [0.45, 1.4],
    [0.85, 0.78],
  ] as const) {
    cylinder(a, x, 0.03, z, 0.24, 0.045, 0.24, P.gold);
  }
  return a;
}

/** Стойка с доспехами и щитом: под перекладиной (×3 — 3.3 м) проходишь насквозь. */
export function buildArmorStand(color: string = P.blue): Assembly {
  const a = assembly();
  box(a, 0, 0.04, 0, 2.0, 0.08, 1.2, P.wood, true, 0.025);
  for (const x of [-0.8, 0.8]) box(a, x, 1.1, 0, 0.09, 2.1, 0.09, P.wood, true, 0.02);
  box(a, 0, 2.05, 0, 1.75, 0.12, 0.12, P.wood, true, 0.02);
  box(a, 0, 1.56, 0.08, 0.65, 0.52, 0.2, color, true, 0.07);
  sphere(a, 0, 2.2, 0.06, 0.48, 0.45, 0.43, P.stone, true);
  box(a, 0.94, 1.34, 0.12, 0.52, 0.8, 0.12, color, false, 0.09);
  stepMotif(a, 'front', vec3(0.94, 1.34, 0.19), P.gold, 0.32);
  a.passages.push({ id: 'under-armor', from: vec3(0, 0, -1), to: vec3(0, 0, 1) });
  return a;
}

/** Жаровня: огонь только светится (glow), без настоящего света — телефону так легче. */
export function buildBrazier(color: string = P.bronze): Assembly {
  const a = assembly();
  box(a, 0, 0.42, 0, 0.45, 0.84, 0.45, color, true, 0.06);
  cylinder(a, 0, 0.9, 0, 0.72, 0.18, 0.72, color, true);
  for (const [x, h, c] of [
    [-0.17, 0.36, P.orange],
    [0.08, 0.55, P.gold],
    [0.23, 0.3, P.coral],
  ] as const) {
    sphere(a, x, 1.03 + h / 2, 0, 0.26, h, 0.29, c, true).glow = true;
  }
  return a;
}

/**
 * Рыцарь ростом с игрока (после ×3 — 1.6 м) на низком постаменте: рядом встаёшь в позу статуи.
 * variant 3 — пустой постамент. Части тела твёрдые: в фигурку не войти.
 */
export function buildKnight(color: string = P.gold, variant = 0): Assembly {
  const a = assembly();
  box(a, 0, 0.04, 0, 0.55, 0.08, 0.55, P.stone, true, 0.02);
  if (variant === 3) return a;
  const s = 1 / 3;
  const base = 0.08;
  const part = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    box(a, x * s, base + y * s, z * s, w * s, h * s, d * s, color, true, 0.035 * s);
  part(0, 0.96, 0, 0.42, 0.52, 0.28);
  part(0, 1.43, 0, 0.32, 0.34, 0.3);
  for (const sign of [-1, 1]) {
    part(sign * 0.13, 0.57, 0, 0.19, 0.32, 0.23);
    part(sign * 0.13, 0.26, 0, 0.18, 0.3, 0.2);
    part(sign * 0.13, 0.07, 0.06, 0.21, 0.14, 0.32);
    part(sign * 0.3, 1.04, 0, 0.14, 0.3, 0.17);
    part(sign * 0.3, 0.76, 0, 0.14, 0.27, 0.17);
    part(sign * 0.3, 0.58, 0, 0.15, 0.14, 0.18);
  }
  box(a, 0, base + 1.44 * s, 0.153 * s, 0.25 * s, 0.055 * s, 0.015 * s, P.dark, false, 0);
  box(a, 0, base + 0.95 * s, 0.148 * s, 0.07 * s, 0.28 * s, 0.012 * s, P.ivory, false, 0);
  return a;
}
