import { vec3 } from '../../math.js';
import { PALETTE as P, assembly, box, cylinder, lettering, paintFace, sphere, type Assembly } from '../procedural.js';

/**
 * Оборудование супермаркета. Каждая сборка — в своей системе: центр основания в 0, «лицом» к +Z,
 * `cy` — центр блока. Размеры — до увеличения ×3: стеллаж 4 м станет 12 м, под нижней полкой (0.71 → 2.1 м)
 * проходишь стоя. solid = true — блок сам себе препятствие (коробка столкновений по нему же).
 */

function label(a: Assembly, x: number, y: number, z: number, w: number, h: number, color: string): void {
  paintFace(a, 'front', vec3(x, y, z), [w, h], color);
}

/** Упаковка с этикеткой. Твёрдая: стоять на ней можно, уйти в неё — нет. */
function packageBox(a: Assembly, x: number, y: number, z: number, w: number, h: number, d: number, color: string, face = 1): void {
  box(a, x, y + h / 2, z, w, h, d, color, true, 0.045);
  label(a, x, y + h * 0.55, z + face * (d / 2 + 0.004), w * 0.72, h * 0.36, P.ivory);
  label(a, x, y + h * 0.85, z + face * (d / 2 + 0.011), w * 0.6, h * 0.09, color === P.coral ? P.yellow : P.mint);
}

/** Двусторонний стеллаж: под нижней полкой — сквозной проход; на полу — крупные коробки-укрытия. */
export function buildGondola(color: string = P.coral, variant = 0): Assembly {
  const a = assembly();
  for (const x of [-1.92, 1.92]) {
    for (const z of [-0.69, 0.69]) box(a, x, 1.27, z, 0.13, 2.54, 0.13, P.dark, true, 0.025);
  }
  box(a, 0, 1.69, 0, 3.98, 1.72, 0.1, color, true, 0.03);
  for (const x of [-2.04, 2.04]) {
    box(a, x, 1.27, 0, 0.13, 2.54, 1.6, color, true, 0.04);
    paintFace(a, 'side', vec3(x + Math.sign(x) * 0.069, 0.47, 0), [1.36, 0.82], color);
    paintFace(a, 'side', vec3(x + Math.sign(x) * 0.076, 1.3, 0), [1.1, 0.14], P.ivory);
  }
  const colors = [color, P.orange, P.blue, P.purple, P.mint, P.yellow, P.coral];
  // Коробки на полу дают цветное укрытие, но не перекрывают проход под серединой.
  for (const [i, x] of [-1.08, 1.08].entries()) packageBox(a, x, 0, 0, 0.84, 0.61, 0.68, colors[(variant + i + 1) % colors.length]!);
  for (const [row, y] of [0.78, 1.55, 2.32].entries()) {
    box(a, 0, y, 0, 4.2, 0.14, 1.7, P.ivory, true, 0.035);
    for (const sign of [-1, 1]) {
      paintFace(a, 'front', vec3(0, y, sign * 0.854), [3.94, 0.105], color);
      for (let i = 0; i < 7; i++) {
        const x = -1.65 + i * 0.55;
        const c = colors[(i + row + variant) % colors.length]!;
        const h = row === 2 ? 0.5 : 0.59;
        if ((i + variant) % 4 === 0) {
          cylinder(a, x, y + 0.07 + h / 2, sign * 0.46, 0.32, h, 0.32, c, true);
          cylinder(a, x, y + 0.07 + h + 0.025, sign * 0.46, 0.21, 0.05, 0.21, P.ivory);
          label(a, x, y + 0.07 + h * 0.53, sign * (0.46 + 0.166), 0.22, h * 0.3, P.ivory);
        } else {
          packageBox(a, x, y + 0.07, sign * 0.46, 0.43, h, 0.38, c, sign);
        }
      }
    }
  }
  a.passages.push({ id: 'under-gondola', from: vec3(0, 0, -1.2), to: vec3(0, 0, 1.2) });
  return a;
}

/** Холодильник: глухой (по нему не лезть), двери и полки — только вид. */
export function buildFridge(color: string = P.blue): Assembly {
  const a = assembly();
  box(a, 0, 1.32, 0, 2.65, 2.64, 0.92, P.ivory, true, 0.09, true);
  box(a, 0, 0.15, 0.48, 2.7, 0.3, 0.1, color, false, 0.025);
  for (let i = 0; i < 3; i++) {
    const x = -0.86 + i * 0.86;
    box(a, x, 1.4, 0.477, 0.79, 2.08, 0.035, color, false, 0.025);
    for (const y of [0.72, 1.36, 2.0]) {
      box(a, x, y, 0.505, 0.72, 0.045, 0.08, P.white, false, 0);
      for (const dx of [-0.21, 0.16]) box(a, x + dx, y + 0.19, 0.51, 0.18, 0.33, 0.018, i % 2 ? P.mint : P.waterLight, false, 0.008);
    }
    box(a, x + 0.28, 1.31, 0.545, 0.05, 0.72, 0.06, P.white, false, 0.015);
  }
  // Козырёк твёрдый: на крыше холодильника в нём (0.6 м при ×3) лёжа не спрячешься.
  box(a, 0, 2.74, 0, 2.75, 0.2, 1.0, color, true, 0.04);
  lettering(a, 'COLD', 0, 2.75, 0.506, 0.13, P.ivory);
  return a;
}

/** Овощной стол: под столешницей проход, ящики и овощи твёрдые — среди них не залечь. */
export function buildProduce(color: string = P.yellow): Assembly {
  const a = assembly();
  for (const x of [-1.38, 1.38]) {
    for (const z of [-0.62, 0.62]) box(a, x, 0.4, z, 0.14, 0.8, 0.14, P.wood, true, 0.03);
  }
  box(a, 0, 0.88, 0, 3.2, 0.16, 1.7, color, true, 0.06);
  for (const sign of [-1, 1]) box(a, 0, 1.1, sign * 0.79, 3.2, 0.36, 0.12, P.woodLight, true, 0.035);
  for (let i = 0; i < 3; i++) {
    const x = -1.03 + i * 1.03;
    box(a, x, 1.1, 0, 0.94, 0.28, 1.36, P.wood, true, 0.025);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const fx = x - 0.27 + col * 0.27;
        const fz = -0.3 + row * 0.58;
        sphere(a, fx, 1.41, fz, 0.34, 0.36, 0.36, [P.red, P.orange, P.leafLight][i]!, true);
        box(a, fx, 1.61, fz, 0.025, 0.09, 0.025, P.woodDark, false, 0);
      }
    }
    label(a, x, 1.1, 0.856, 0.65, 0.2, P.ivory);
  }
  a.passages.push({ id: 'under-produce', from: vec3(0, 0, -1.15), to: vec3(0, 0, 1.15) });
  return a;
}

/** Хлебный прилавок: глухой короб с батонами на подносах. */
export function buildBakery(): Assembly {
  const a = assembly();
  box(a, 0, 0.48, 0, 3.2, 0.96, 1.65, P.coral, true, 0.1);
  for (const sign of [-1, 1]) paintFace(a, 'front', vec3(0, 0.46, sign * 0.829), [2.9, 0.74], P.peach);
  box(a, 0, 1.01, 0, 3.35, 0.16, 1.78, P.ivory, true, 0.06);
  for (let i = 0; i < 3; i++) {
    for (const z of [-0.4, 0.35]) {
      const x = -1.0 + i;
      box(a, x, 1.1, z, 0.89, 0.04, 0.59, P.woodDark, false, 0.025);
      box(a, x, 1.32, z, 0.72, 0.4, 0.44, P.woodLight, true, 0.17);
      for (const dx of [-0.18, 0, 0.18]) box(a, x + dx, 1.522, z, 0.045, 0.012, 0.32, P.paint, false, 0);
    }
  }
  return a;
}

/** Морозильный ларь: крупные цветные борта — поле для маскировки от пола. */
export function buildFreezer(color: string = P.teal): Assembly {
  const a = assembly();
  box(a, 0, 0.48, 0, 2.8, 0.96, 1.6, color, true, 0.1);
  for (const sign of [-1, 1]) paintFace(a, 'front', vec3(0, 0.47, sign * 0.804), [2.5, 0.78], color);
  box(a, 0, 1.01, 0, 2.94, 0.16, 1.74, P.ivory, true, 0.055);
  for (const x of [-0.71, 0.71]) {
    box(a, x, 1.104, 0, 1.3, 0.025, 1.45, P.waterLight, false, 0.015);
    box(a, x, 1.135, 0.43, 0.4, 0.055, 0.055, P.white, false, 0.02);
  }
  return a;
}

/** Касса: под лентой проход, сзади — короб кассира. */
export function buildCheckout(color: string = P.mint): Assembly {
  const a = assembly();
  box(a, 0, 0.47, -1.03, 1.65, 0.94, 1.22, color, true, 0.08);
  paintFace(a, 'front', vec3(0, 0.47, -1.644), [1.42, 0.77], color);
  box(a, 0, 0.86, 0.53, 1.7, 0.2, 2.1, P.ivory, true, 0.07);
  for (const x of [-0.65, 0.65]) box(a, x, 0.38, 1.35, 0.17, 0.76, 0.17, color, true, 0.035);
  box(a, 0, 0.973, 0.53, 1.4, 0.024, 1.85, P.dark, false, 0.02);
  for (const x of [-0.755, 0.755]) box(a, x, 1.03, 0.53, 0.06, 0.12, 2.0, color, false, 0.02);
  cylinder(a, 0.48, 1.28, -1.0, 0.08, 0.58, 0.08, P.dark, true);
  box(a, 0.48, 1.63, -1.0, 0.84, 0.55, 0.12, P.dark, false, 0.055);
  label(a, 0.48, 1.64, -0.933, 0.67, 0.36, P.mint);
  box(a, -0.33, 1.1, -0.93, 0.6, 0.18, 0.53, P.dark, true, 0.055);
  box(a, -0.33, 1.205, -0.93, 0.38, 0.035, 0.34, P.red, false, 0.02);
  packageBox(a, -0.28, 0.99, 0.46, 0.42, 0.45, 0.38, P.yellow);
  packageBox(a, 0.28, 0.99, 0.95, 0.42, 0.33, 0.38, P.purple);
  a.passages.push({ id: 'under-belt', from: vec3(-1.15, 0, 0.5), to: vec3(1.15, 0, 0.5) });
  return a;
}

/** Поддон с коробками на складе. */
export function buildPallet(color: string = P.orange, variant = 0): Assembly {
  const a = assembly();
  for (const z of [-0.65, 0, 0.65]) box(a, 0, 0.11, z, 2.5, 0.22, 0.2, P.woodDark, true, 0.025);
  for (let i = 0; i < 5; i++) box(a, -1.02 + i * 0.51, 0.265, 0, 0.46, 0.09, 1.8, P.woodLight, true, 0.02);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x = -0.59 + col * 1.18;
      const h = row === 0 ? 0.83 : 0.7;
      packageBox(a, x, 0.31 + row * 0.83, 0, 1.1, h, 1.45, row === 1 && variant % 2 ? P.lavender : color);
      paintFace(a, 'front', vec3(x, 0.31 + row * 0.83 + h * 0.5, 0.735), [0.12, h * 0.98], P.paint);
    }
  }
  return a;
}

/** Тележка: колёса, стойки и корзина — отдельные препятствия, под корзиной (1.9 м при ×3) проходишь стоя. */
export function buildCart(color: string = P.coral): Assembly {
  const a = assembly();
  for (const x of [-0.53, 0.53]) {
    for (const z of [-0.58, 0.58]) {
      sphere(a, x, 0.16, z, 0.22, 0.32, 0.32, P.dark, true);
      box(a, x, 0.45, z, 0.07, 0.62, 0.07, P.dark, true, 0.02);
    }
  }
  box(a, 0, 0.7, 0, 1.25, 0.14, 1.5, color, true, 0.045);
  for (const x of [-0.59, 0.59]) box(a, x, 1.04, 0, 0.12, 0.65, 1.5, color, true, 0.035);
  for (const z of [-0.69, 0.69]) box(a, 0, 1.04, z, 1.25, 0.65, 0.12, color, true, 0.035);
  for (const z of [-0.73, 0.73]) {
    for (const x of [-0.43, -0.14, 0.14, 0.43]) label(a, x, 1.04, z, 0.15, 0.36, P.ivory);
  }
  box(a, 0, 1.45, -0.88, 1.45, 0.1, 0.12, P.dark, true, 0.035);
  for (const x of [-0.55, 0.55]) box(a, x, 1.29, -0.82, 0.08, 0.32, 0.08, P.dark, true, 0.02);
  a.passages.push({ id: 'under-cart', from: vec3(0, 0, -1.2), to: vec3(0, 0, 1.2) });
  return a;
}
