import { PALETTE as P, assembly, box, lettering, sphere, type Assembly } from '../procedural.js';

/**
 * Общие детали карт-рецептов: вывеска, картины на стене, лужи и надписи на полу.
 * Всё — в «обычных» метрах сборки (центр основания в 0, «лицо» к +Z), ×3 делает карта.
 */

/** Вывеска на двух столбах. Щит твёрдый: залез по столбу — стоишь на щите, а не внутри него. */
export function buildSign(color: string = P.teal, variant = 0): Assembly {
  const a = assembly();
  const texts = ['BISTRO', 'COURTYARD', 'CASTLE'];
  box(a, 0, 3.2, 0, 6.5, 1.05, 0.15, color, true, 0.07);
  lettering(a, texts[variant % 3]!, 0, 3.2, 0.086, 0.38, P.ivory);
  for (const x of [-2.6, 2.6]) box(a, x, 1.6, 0, 0.1, 3.2, 0.1, P.dark, true, 0.02);
  return a;
}

/** Плоская картина 3 × 2.5 м (×3): меню, портрет повара или пейзаж — крупные поля цвета для маскировки. */
export function buildWallArt(color: string = P.teal, variant = 0): Assembly {
  const a = assembly();
  box(a, 0, 1.25, 0, 3.15, 2.45, 0.022, color, false, 0.01);
  if (variant === 0) {
    lettering(a, 'MENU', 0, 2.12, 0.022, 0.38, P.ivory);
    for (const [i, y] of [0.55, 1.1, 1.65].entries()) {
      sphere(a, -0.85, y, 0.035, 0.65, 0.46, 0.025, [P.orange, P.mint, P.coral][i]!);
      for (const dy of [-0.075, 0.075]) box(a, 0.45, y + dy, 0.03, 1.15, 0.045, 0.018, P.ivory, false, 0);
    }
  } else if (variant === 1) {
    sphere(a, 0, 1.48, 0.025, 0.9, 0.9, 0.025, P.peach);
    for (const x of [-0.3, 0, 0.3]) sphere(a, x, 2.02, 0.05, 0.55, 0.52, 0.025, P.ivory);
    box(a, 0, 0.55, 0.03, 1.05, 0.8, 0.025, P.ivory, false, 0.01);
    for (const x of [-0.18, 0.18]) box(a, x, 1.55, 0.055, 0.07, 0.09, 0.015, P.dark, false, 0);
    box(a, 0, 1.26, 0.055, 0.28, 0.05, 0.015, P.coral, false, 0);
  } else {
    for (const [x, y, s] of [
      [-0.95, 1.95, 0.55],
      [0.25, 2.0, 0.65],
      [0.85, 1.75, 0.45],
    ] as const) {
      sphere(a, x, y, 0.03, s, 0.35, 0.025, P.ivory);
      sphere(a, x - 0.15, y + 0.1, 0.032, s * 0.6, 0.35, 0.025, P.ivory);
    }
    sphere(a, 0.65, 0.65, 0.03, 0.85, 0.85, 0.025, P.yellow);
    for (const [i, x] of [-0.85, -0.45, -0.05].entries()) {
      box(a, x, 0.22, 0.035, 0.23, 0.36, 0.025, [P.coral, P.mint, P.lavender][i]!, false, 0);
    }
  }
  return a;
}

/** Лужа из пяти плоских пятен: на ней ложатся и сливаются с полом. */
export function puddle(a: Assembly, x: number, z: number, color: string, size = 1): void {
  for (const [dx, dz, w, d] of [
    [0, 0, 1.65, 1.2],
    [-0.65, 0.1, 0.7, 0.7],
    [0.55, -0.35, 0.9, 0.85],
    [0.62, 0.37, 0.55, 0.55],
    [-0.7, -0.45, 0.28, 0.25],
  ] as const) {
    sphere(a, x + dx * size, 0.019, z + dz * size, w * size, 0.016, d * size, color);
  }
}

/** Надпись, лежащая на полу (читается сверху): обычная вывеска, повёрнутая из плоскости XY в XZ. */
export function floorText(a: Assembly, text: string, x: number, z: number, height: number, color: string): void {
  const start = a.boxes.length;
  lettering(a, text, x, 0, 0, height, color);
  for (const b of a.boxes.slice(start)) {
    const centerY = (b.y ?? 0) + b.h / 2;
    [b.h, b.d] = [b.d, b.h];
    b.z = z - centerY;
    b.y = 0.026 - b.h / 2;
  }
}
