import { vec3 } from '../../math.js';
import { PALETTE as P, assembly, box, collide, cylinder, paintFace, sphere, stepMotif, type Assembly } from './kit.js';

/**
 * Предметы площади. Каждый — в своей системе: центр основания в 0, «лицом» к +Z, `cy` — центр блока.
 * Размеры — до увеличения ×3: скамейка 2.6 м станет 7.8 м, и под ней пройдёшь в полный рост.
 */

/** Скамейка: под сиденьем проход стоя (0.76 м → 2.28 м), рейки — «дерево» в цвет скамейки. */
export function buildBench(color: string, length = 2.6): Assembly {
  const a = assembly();
  const accent = color === P.woodLight ? P.wood : P.ivory;
  for (const x of [-length * 0.36, length * 0.36]) {
    for (const z of [-0.24, 0.24]) box(a, x, 0.38, z, 0.15, 0.76, 0.15, color, true, 0.025);
  }
  for (let i = 0; i < 4; i++) {
    box(a, 0, 0.83, -0.3 + i * 0.2, length, 0.14, 0.17, i % 2 ? accent : color, true, 0.05).surface = 'wood';
  }
  for (const x of [-length * 0.43, length * 0.43]) box(a, x, 1.15, 0.37, 0.14, 1.0, 0.14, P.dark, true, 0.025);
  for (let i = 0; i < 3; i++) {
    box(a, 0, 1.04 + i * 0.23, 0.37, length, 0.17, 0.13, i % 2 ? accent : color, true, 0.045).surface = 'wood';
  }
  for (const x of [-length * 0.44, length * 0.44]) box(a, x, 1.1, 0, 0.13, 0.13, 0.9, P.dark, true, 0.045);
  for (const x of [-length * 0.36, length * 0.36]) {
    for (let i = 0; i < 3; i++) sphere(a, x, 1.04 + i * 0.23, 0.45, 0.055, 0.055, 0.028, P.gold);
  }
  for (const sign of [-1, 1]) {
    for (const x of [-length * 0.19, length * 0.19]) {
      paintFace(a, 'front', vec3(x, 1.27, 0.37 + sign * 0.067), [0.46, 0.12], sign > 0 ? P.yellow : P.mint);
    }
  }
  a.passages.push({ id: 'under-seat', from: vec3(0, 0, -0.9), to: vec3(0, 0, 0.9) });
  return a;
}

/** Клумба: на каждой грани два поля по 2 м высотой (×3) — встал рядом и слился. */
export function buildPlanter(color: string, flowers: string): Assembly {
  const a = assembly();
  box(a, 0, 0.46, 0, 1.6, 0.92, 1.6, color, true, 0.12);
  box(a, 0, 0.96, 0, 1.78, 0.16, 1.78, P.white, true, 0.06);
  box(a, 0, 1.06, 0, 1.5, 0.1, 1.5, P.woodDark, false, 0.03);
  const second =
    color === P.mint ? P.teal : color === P.blue ? P.deep : color === P.purple ? P.lavender : color === P.yellow ? P.orange : P.peach;
  for (const sign of [-1, 1]) {
    for (const u of [-0.335, 0.335]) {
      paintFace(a, 'front', vec3(u, 0.45, sign * 0.803), [0.65, 0.66], u < 0 ? color : second);
      paintFace(a, 'side', vec3(sign * 0.803, 0.45, u), [0.65, 0.66], u < 0 ? second : color);
    }
    paintFace(a, 'front', vec3(0, 0.16, sign * 0.809), [1.28, 0.075], P.gold);
    paintFace(a, 'side', vec3(sign * 0.809, 0.16, 0), [1.28, 0.075], P.gold);
    stepMotif(a, 'front', vec3(0, 0.72, sign * 0.809), P.ivory, 0.23);
  }
  for (const x of [-0.43, 0, 0.43]) {
    for (const z of [-0.43, 0, 0.43]) {
      cylinder(a, x, 1.23, z, 0.07, 0.34, 0.07, P.leaf);
      sphere(a, x, 1.43, z, 0.3, 0.24, 0.3, flowers);
      sphere(a, x, 1.53, z, 0.11, 0.08, 0.11, P.yellow);
    }
  }
  return a;
}

/** Дерево: ствол — препятствие (по нему не лезть), крона — только вид: в листве можно спрятаться. */
export function buildTree(variant: number): Assembly {
  const a = assembly();
  const odd = variant % 2 !== 0;
  cylinder(a, 0, 1.45, 0, 0.4, 2.9, 0.4, P.wood);
  collide(a, 0, 1.45, 0, 0.4, 2.9, 0.4, true);
  sphere(a, 0, 3.42, 0, 2.45, 2.8, 2.3, odd ? P.leafLight : P.leaf);
  sphere(a, -0.58, 3.0, 0.21, 1.5, 1.65, 1.5, odd ? P.leaf : P.leafLight);
  return a;
}

/** Киоск: открыт спереди и с боков — сквозной проход, а не глухой куб. На крышу можно залезть по стойке. */
export function buildKiosk(accent: string): Assembly {
  const a = assembly();
  for (const x of [-1.2, 1.2]) {
    for (const z of [-0.7, 0.7]) box(a, x, 1.24, z, 0.16, 2.48, 0.16, P.wood, true, 0.04);
  }
  box(a, 0, 2.58, 0, 2.9, 0.22, 2.0, P.white, true, 0.08);
  box(a, 0, 0.74, -0.72, 2.5, 1.48, 0.16, P.wood, true, 0.05);
  box(a, 0, 1.58, -0.65, 2.65, 0.18, 0.54, P.woodLight, true, 0.055);
  for (let i = 0; i < 9; i++) box(a, -1.28 + i * 0.32, 2.79, 0, 0.3, 0.18, 2.08, i % 2 ? P.ivory : accent, false, 0.035);
  box(a, 0, 2.28, -0.71, 1.1, 0.33, 0.13, P.blue, false, 0.05);
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      paintFace(a, 'front', vec3(-0.8 + i * 0.8, 0.75, -0.72 + sign * 0.083), [0.77, 1.26], [accent, P.mint, P.orange][i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    paintFace(a, 'front', vec3(-0.32 + i * 0.32, 2.28, -0.638), [0.19, 0.18], [P.yellow, P.pink, P.mint][i]);
    box(a, -0.7 + i * 0.7, 2.89, 0, 0.12, 0.04, 1.8, P.yellow, false, 0);
  }
  for (const x of [-0.6, 0.15, 0.75]) cylinder(a, x, 1.81, -0.61, 0.27, 0.28, 0.27, x < 0 ? P.yellow : P.mint);
  a.passages.push({ id: 'side-passage', from: vec3(-1.65, 0, 0), to: vec3(1.65, 0, 0) });
  return a;
}

export function buildBin(color: string): Assembly {
  const a = assembly();
  box(a, 0, 0.61, 0, 0.75, 1.22, 0.75, color, true, 0.11);
  box(a, 0, 1.27, 0, 0.85, 0.16, 0.85, P.ivory, true, 0.06);
  box(a, 0, 1.22, 0.435, 0.42, 0.2, 0.03, P.deep, false, 0.03);
  for (const sign of [-1, 1]) {
    paintFace(a, 'front', vec3(0, 0.6, sign * 0.378), [0.48, 0.84], color === P.blue ? P.teal : P.purple);
    paintFace(a, 'front', vec3(0, 0.68, sign * 0.384), [0.28, 0.17], P.ivory);
  }
  return a;
}

/** Фонарь: плафон светится сам (glow), столб — тонкое препятствие, по которому не лезть. */
export function buildLamp(): Assembly {
  const a = assembly();
  cylinder(a, 0, 2.05, 0, 0.16, 4.1, 0.16, P.dark);
  collide(a, 0, 2.05, 0, 0.18, 4.1, 0.18, true);
  box(a, 0, 4.19, 0, 0.75, 0.18, 0.75, P.dark, false, 0.06);
  sphere(a, 0, 4.43, 0, 0.5, 0.46, 0.5, P.paint).glow = true;
  box(a, 0, 4.72, 0, 0.64, 0.12, 0.64, P.dark, false, 0.04);
  return a;
}
