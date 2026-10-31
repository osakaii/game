import { vec3 } from '../../math.js';
import { PALETTE as P, assembly, box, cylinder, paintFace, sphere, type Assembly } from '../procedural.js';
import { puddle } from './common.js';

/** Ресторан и кухня: столы, стулья, кухонный остров, плита, диван, подносы, пятна на полу. */

/** Обеденный стол на четырёх ножках: под ним (×3 — 2.7 м) проходишь в полный рост. */
export function buildDiningTable(color: string = P.coral): Assembly {
  const a = assembly();
  for (const x of [-1.32, 1.32]) for (const z of [-0.78, 0.78]) box(a, x, 0.45, z, 0.15, 0.9, 0.15, P.wood, true, 0.03);
  box(a, 0, 0.99, 0, 3.15, 0.18, 2.05, color, true, 0.1);
  for (const x of [-0.92, 0.92]) {
    for (const z of [-0.47, 0.47]) {
      // Посуда и ваза твёрдые: на столе лежишь рядом с тарелкой, а не в ней.
      cylinder(a, x, 1.11, z, 0.78, 0.055, 0.78, P.ivory, true);
      for (const u of [-0.16, 0.16]) {
        box(a, x + u, 1.2, z, 0.24, 0.16, 0.32, P.dark, true, 0.025);
        box(a, x + u, 1.3, z, 0.22, 0.1, 0.3, P.ivory, true, 0.03);
        box(a, x + u, 1.36, z, 0.2, 0.045, 0.28, P.coral, true, 0.018);
      }
      cylinder(a, x + Math.sign(x) * 0.34, 1.27, 0, 0.17, 0.32, 0.17, P.mint, true);
    }
  }
  a.passages.push({ id: 'under-table', from: vec3(0, 0, -1.48), to: vec3(0, 0, 1.48) });
  return a;
}

/**
 * Скатерть до пола по длинным сторонам стола: за тканью прячешься стоя, торцы открыты.
 * Ткань — тонкая твёрдая панель (по ней не лезть): сквозь неё не пройти и в ней не спрятаться.
 */
export function decorateTable(a: Assembly, color: string): Assembly {
  for (const side of [-1, 1]) {
    box(a, side * 1.565, 0.54, 0, 0.025, 1.02, 2.05, color, true, 0.008, true);
    for (const z of [-0.76, -0.25, 0.26, 0.77]) {
      for (const face of [-1, 1]) paintFace(a, 'side', vec3(side * 1.565 + face * 0.017, 0.54, z), [0.28, 1.0], P.ivory);
    }
  }
  return a;
}

export function buildChair(color: string = P.mint): Assembly {
  const a = assembly();
  for (const x of [-0.32, 0.32]) for (const z of [-0.32, 0.32]) box(a, x, 0.34, z, 0.1, 0.68, 0.1, P.wood, true, 0.025);
  box(a, 0, 0.74, 0, 0.91, 0.14, 0.91, color, true, 0.07);
  box(a, 0, 1.14, -0.38, 0.91, 0.78, 0.13, color, true, 0.07);
  return a;
}

export function buildKitchenIsland(color: string = P.teal): Assembly {
  const a = assembly();
  box(a, 0, 0.52, 0, 3.2, 1.04, 1.65, color, true, 0.08);
  box(a, 0, 1.1, 0, 3.4, 0.16, 1.85, P.ivory, true, 0.07);
  for (const side of [-1, 1]) {
    paintFace(a, 'front', vec3(0, 0.45, side * 0.829), [2.88, 0.78], color);
    for (const x of [-1.0, 0, 1.0]) box(a, x, 0.78, side * 0.85, 0.42, 0.06, 0.05, P.gold, false, 0.015);
  }
  for (const x of [-0.88, 0.88]) {
    box(a, x, 1.2, 0, 1.1, 0.05, 1.1, P.woodLight, true, 0.045);
    sphere(a, x, 1.4, 0, 0.45, 0.38, 0.43, x < 0 ? P.red : P.leafLight, true);
  }
  return a;
}

/** Плита с кастрюлями и вытяжкой над ней. */
export function buildRange(color: string = P.blue): Assembly {
  const a = assembly();
  box(a, 0, 0.6, 0, 2.8, 1.2, 1.7, color, true, 0.08);
  box(a, 0, 1.25, 0, 2.95, 0.1, 1.8, P.dark, true, 0.04);
  for (const x of [-0.7, 0.7]) {
    for (const z of [-0.42, 0.42]) {
      // Конфорки и кастрюли твёрдые: залез на плиту — стоишь между кастрюль, а не в них.
      cylinder(a, x, 1.32, z, 0.57, 0.08, 0.57, P.gold, true);
      cylinder(a, x, 1.45, z, 0.45, 0.22, 0.45, P.dark, true);
      sphere(a, x, 1.58, z, 0.48, 0.1, 0.48, P.cream, true);
    }
  }
  for (const x of [-0.7, 0.7]) {
    box(a, x, 0.62, 0.862, 1.1, 0.72, 0.04, P.deep, false, 0.04);
    box(a, x, 0.88, 0.9, 0.7, 0.06, 0.06, P.ivory, false, 0.02);
  }
  box(a, 0, 2.8, 0, 3.15, 0.3, 2.0, P.cream, false, 0.07);
  box(a, 0, 3.3, 0, 0.8, 0.7, 0.8, P.cream, false, 0.04);
  return a;
}

export function buildSofa(color: string = P.purple): Assembly {
  const a = assembly();
  box(a, 0, 0.38, 0, 3.1, 0.76, 1.25, color, true, 0.17);
  box(a, 0, 1.11, -0.49, 3.1, 1.2, 0.3, color, true, 0.12);
  for (const x of [-1.4, 1.4]) box(a, x, 0.84, 0, 0.3, 0.7, 1.35, color, true, 0.12);
  // Подушки твёрдые: на диване лежишь на них, а не утопаешь целиком.
  for (const x of [-0.7, 0.7]) box(a, x, 0.81, 0.06, 1.3, 0.18, 1.0, P.peach, true, 0.08);
  return a;
}

/** Стопка подносов на тумбе: крупные полосы цвета на уровне глаз. */
export function buildTrayStack(color: string = P.coral): Assembly {
  const a = assembly();
  box(a, 0, 0.46, 0, 1.3, 0.92, 0.85, color, true, 0.07);
  for (let i = 0; i < 5; i++) {
    box(a, 0, 0.98 + i * 0.1, 0, 1.42, 0.06, 0.95, i % 2 ? P.ivory : color, true, 0.04);
    for (const x of [-0.65, 0.65]) box(a, x, 1.02 + i * 0.1, 0, 0.07, 0.06, 0.95, P.gold, true, 0.02);
  }
  return a;
}

/** Пятно соуса (с крошками) или опрокинутая кастрюля в луже (variant 1). */
export function buildSpill(color: string = P.mint, variant = 0): Assembly {
  const a = assembly();
  puddle(a, 0, 0, color, variant ? 1.15 : 1);
  if (variant) {
    box(a, -0.65, 0.3, -0.55, 0.88, 0.6, 0.72, P.blue, true, 0.09);
    box(a, -0.65, 0.3, -0.178, 0.66, 0.41, 0.026, P.deep, false, 0.07);
    for (const x of [-1.2, -0.1]) box(a, x, 0.38, -0.55, 0.24, 0.1, 0.18, P.dark, true, 0.035);
  } else {
    for (const [i, x] of [-1.4, -0.9, 0.6, 1.4].entries()) {
      // Крошки — низкие твёрдые кубики (×3 — 30 см, перешагиваешь): лёжа среди них не пропадёшь.
      box(a, x, 0.05, 0.65 - i * 0.25, 0.18, 0.1, 0.21, P.woodLight, true, 0.03);
      sphere(a, x + 0.16, 0.05, 0.7 - i * 0.25, 0.1, 0.1, 0.1, P.coral, true);
    }
  }
  return a;
}
