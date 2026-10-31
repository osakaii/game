import { vec3 } from '../../math.js';
import { PALETTE as P, assembly, box, collide, cylinder, paintFace, place, sphere, type Assembly } from '../procedural.js';
import { buildWallArt, floorText } from './common.js';

/** Жилой двор: проходные домики, машины, детская площадка, сушилка, игрушки, классики. */

/** Домик с проходом насквозь (двери с двух сторон), окнами, ступенчатой крышей и мебелью внутри. */
export function buildHouse(color: string = P.coral, variant = 0): Assembly {
  const a = assembly();
  box(a, 0, 0.004, 0, 5.1, 0.008, 4.4, P.ivory, false, 0);
  for (const x of [-2.65, 2.65]) box(a, x, 1.65, 0, 0.2, 3.3, 4.8, color, true, 0.04, true);
  for (const z of [-2.3, 2.3]) {
    const out = Math.sign(z);
    for (const x of [-1.75, 1.75]) box(a, x, 1.65, z, 1.8, 3.3, 0.2, color, true, 0.04, true);
    box(a, 0, 2.7, z, 1.7, 1.2, 0.2, color, true, 0.04, true);
    for (const x of [-1.75, 1.75]) {
      box(a, x, 1.85, z + out * 0.114, 1.2, 1.25, 0.035, P.glass, false, 0.025);
      box(a, x, 1.85, z + out * 0.14, 0.06, 1.24, 0.05, P.ivory, false, 0.01);
      box(a, x, 1.85, z + out * 0.14, 1.18, 0.06, 0.05, P.ivory, false, 0.01);
    }
    for (const x of [-0.85, 0.85]) box(a, x, 1.0, z + out * 0.12, 0.1, 2.0, 0.08, P.ivory, false, 0.015);
  }
  for (let i = 0; i < 3; i++) box(a, 0, 3.43 + i * 0.24, 0, 5.85 - i * 1.35, 0.24, 5.0, P.roof, true, 0.04, true);
  box(a, -1.48, 0.4, -0.65, 1.75, 0.8, 1.65, variant % 2 ? P.mint : P.lavender, true, 0.12);
  box(a, -1.48, 0.91, -1.27, 1.75, 0.55, 0.26, P.ivory, true, 0.07);
  box(a, 1.8, 0.6, 0.7, 0.8, 1.2, 1.1, P.woodLight, true, 0.06);
  paintFace(a, 'top', vec3(0, 0.008, 0), [1.3, 2.8], color);
  a.passages.push({ id: 'through-house', from: vec3(0, 0, -2.9), to: vec3(0, 0, 2.9) });
  decorateHouse(a, variant);
  return a;
}

/** Облака на торце дома и почтовый ящик у двери: цветные ориентиры на фасаде. */
function decorateHouse(a: Assembly, variant: number): void {
  place(a, buildWallArt(variant % 2 ? P.blue : P.teal, 2), 2.762, 0, 1);
  box(a, -1.75, 0.82, 2.53, 0.58, 0.52, 0.3, variant % 2 ? P.coral : P.blue, true, 0.05);
  box(a, -1.75, 0.93, 2.688, 0.4, 0.035, 0.02, P.dark, false, 0);
  box(a, -1.75, 0.72, 2.69, 0.25, 0.13, 0.022, P.ivory, false, 0.015);
}

export function buildCar(color: string = P.blue): Assembly {
  const a = assembly();
  box(a, 0, 0.62, 0, 1.85, 0.72, 4.1, color, true, 0.22);
  box(a, 0, 1.22, -0.2, 1.62, 0.85, 2.0, color, true, 0.19);
  for (const x of [-0.816, 0.816]) box(a, x, 1.28, -0.2, 0.025, 0.57, 1.7, P.glass, false, 0.02);
  box(a, 0, 1.28, 0.82, 1.35, 0.57, 0.035, P.glass, false, 0.03);
  box(a, 0, 1.28, -1.22, 1.35, 0.57, 0.035, P.glass, false, 0.03);
  for (const x of [-0.9, 0.9]) {
    for (const z of [-1.35, 1.3]) {
      sphere(a, x, 0.33, z, 0.28, 0.64, 0.64, P.dark);
      collide(a, x, 0.33, z, 0.28, 0.64, 0.64);
    }
  }
  for (const x of [-0.6, 0.6]) box(a, x, 0.65, 2.06, 0.35, 0.22, 0.05, P.paint, false, 0.045);
  box(a, 0, 0.42, 2.1, 1.5, 0.13, 0.08, P.ivory, false, 0.03);
  return a;
}

/** Домик на столбах с лестницей: под настилом проходишь, наверх — по ступеням. */
export function buildPlayground(color: string = P.coral): Assembly {
  const a = assembly();
  for (const x of [-1.45, 1.45]) for (const z of [-1.15, 1.15]) box(a, x, 1.25, z, 0.17, 2.5, 0.17, P.wood, true, 0.04);
  box(a, 0, 0.85, 0, 3.3, 0.18, 2.8, P.yellow, true, 0.07);
  box(a, 0, 2.65, 0, 3.7, 0.25, 3.2, color, true, 0.08);
  box(a, 0, 2.86, 0, 2.8, 0.18, 2.7, P.peach, true, 0.05);
  for (const side of [-1, 1]) {
    box(a, side * 1.5, 1.58, 0, 0.1, 0.13, 2.7, P.mint, true, 0.03);
    for (let i = 0; i < 4; i++) box(a, side * 1.5, 1.23, -0.9 + i * 0.6, 0.1, 0.6, 0.1, P.mint, true, 0.02);
  }
  for (let i = 0; i < 9; i++) {
    const h = 0.1 * (9 - i);
    box(a, -1.0, h / 2, 1.55 + i * 0.19, 0.75, h, 0.19, P.blue, true, 0.015);
  }
  a.passages.push({ id: 'under-playground', from: vec3(0, 0, -1.9), to: vec3(0, 0, 1.9) });
  return a;
}

/** Сушилка с двумя полотенцами: между ними меняешь цвет и выходишь вдоль или поперёк. */
export function buildLaundry(color: string = P.mint): Assembly {
  const a = assembly();
  for (const x of [-2.2, 2.2]) for (const z of [-0.8, 0.8]) box(a, x, 1.05, z, 0.08, 2.1, 0.08, P.wood, true, 0.02);
  for (const z of [-0.7, 0.7]) box(a, 0, 2.08, z, 4.45, 0.05, 0.04, P.ivory, false, 0.01);
  for (const [i, x] of [-0.95, 0.95].entries()) {
    const z = i ? -0.7 : 0.7;
    const towel = i ? P.purple : color;
    // Полотенце — тонкая твёрдая панель, по ней не лезть.
    box(a, x, 0.84, z, 1.45, 1.58, 0.025, towel, true, 0.008, true);
    for (const side of [-1, 1]) {
      for (const y of [0.22, 0.51, 1.17, 1.46]) paintFace(a, 'front', vec3(x, y, z + side * 0.018), [1.43, 0.1], P.ivory);
    }
    for (const xx of [x - 0.5, x + 0.5]) box(a, xx, 1.67, z, 0.09, 0.14, 0.08, P.gold, false, 0.015);
  }
  a.passages.push(
    { id: 'between-towels', from: vec3(0, 0, -1.35), to: vec3(0, 0, 1.35) },
    { id: 'across-towels', from: vec3(-2.5, 0, 0), to: vec3(2.5, 0, 0) },
  );
  return a;
}

/** Забытый ящик с игрушками, мяч и мелки рядом. */
export function buildToybox(color: string = P.orange): Assembly {
  const a = assembly();
  box(a, 0, 0.34, 0, 1.3, 0.68, 1.0, color, true, 0.08);
  // Игрушки, мяч и мелки твёрдые: среди них прячутся рядом, а не внутри.
  box(a, 0, 0.69, 0, 1.08, 0.04, 0.78, P.deep, true, 0.02);
  for (const [i, x] of [-0.4, -0.12, 0.18, 0.43].entries()) {
    box(a, x, 0.83, 0, 0.17, 0.25, 0.5, [P.coral, P.blue, P.mint, P.yellow][i]!, true, 0.03);
  }
  sphere(a, 0.93, 0.24, 0.22, 0.48, 0.48, 0.48, P.blue, true);
  for (const z of [-0.25, 0.25]) box(a, -1.05, 0.1, z, 0.55, 0.2, 0.22, z < 0 ? P.purple : P.mint, true, 0.035);
  return a;
}

/** Классики с цифрами, круги-колёса и недорисованное солнце мелом: фон для низких поз. */
export function buildChalkGame(color: string = P.coral): Assembly {
  const a = assembly();
  const colors = [color, P.blue, P.yellow, P.mint, P.purple, P.orange];
  for (let i = 0; i < 6; i++) {
    const x = i % 3 === 2 ? 0.48 : -0.2;
    const z = -1.7 + i * 0.65;
    box(a, x, 0.018, z, 0.88, 0.012, 0.59, P.ivory, false, 0);
    box(a, x, 0.026, z, 0.78, 0.009, 0.49, colors[i]!, false, 0);
    floorText(a, String(i + 1), x, z, 0.29, P.ivory);
  }
  for (const x of [-1.25, 1.25]) cylinder(a, x, 0.022, 2.1, 0.7, 0.012, 0.7, P.blue);
  for (const x of [-1.25, 1.25]) cylinder(a, x, 0.031, 2.1, 0.55, 0.01, 0.55, P.cream);
  box(a, 0, 0.036, 2.1, 2.4, 0.012, 0.055, P.coral, false, 0);
  cylinder(a, 1.4, 0.024, -1.5, 0.9, 0.012, 0.9, P.yellow);
  for (const [x, z] of [
    [1.4, -2.2],
    [2.1, -1.5],
    [0.7, -1.5],
  ] as const) {
    box(a, x, 0.027, z, 0.14, 0.012, 0.23, P.yellow, false, 0);
  }
  return a;
}
