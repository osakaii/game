import { vec3 } from '../../math.js';
import { perimeterWalls, scaleMap, type MapDef } from '../map.js';
import {
  PALETTE as P,
  assembly,
  box,
  collide,
  cylinder,
  floorMosaic,
  paintFace,
  place,
  sphere,
  stepMotif,
  type Assembly,
  type Passage,
} from './kit.js';
import { buildBench, buildBin, buildKiosk, buildLamp, buildPlanter, buildTree } from './props.js';

/**
 * Площадь Ала-Тоо (Бишкек) — игрушечная версия для пряток: окружение ×3 относительно персонажа.
 * Под скамейками проходишь стоя, киоски и колоннады сквозные, клумбы, бортики фонтанов и
 * колоннады покрыты крупными цветными полями — материал для маскировки кистью.
 *
 * План (вид сверху, север — минус Z, в метрах до увеличения):
 *
 *   z=-30 ┌─────────── изгородь ───────────┐
 *         │ парк │     Исторический  │ парк │
 *         │      │       музей       │      │
 *         │      │  клумбы  Манас ⚑  │      │
 *   z=0   ├──────┴──── проспект ─────┴──────┤
 *         │ кол- │ фонтаны и мостики │ кол- │
 *         │ онна │                   │ онна │
 *   z=30  └──────── южный портал ───────────┘
 *        x=-18                            x=18
 *
 * Перенесено из внешнего генератора (`ala-too-mecha-v3`): числа плана те же, поменялись только
 * формат блоков (`MapBox`, y — низ), поверхности (плиты — tiles, музей — marble, рейки скамеек — wood)
 * и сдвиг плана по Z — у нас карта центрирована в нуле. Подземную плиту газона убрали: пол y = 0
 * уже есть в физике, а видимый пол карты — газон.
 */

const WIDTH = 36;
const DEPTH = 60;
/** У исходного плана центр — z = −6: сдвигаем всё на +6, чтобы карта стояла в нуле, как ждут физика и сервер. */
const SHIFT_Z = 6;
export const ALA_TOO_SCALE = 3;
/** Верх плит площади: спавны стоят на них, а не на газоне. */
const PLAZA_Y = 0.07;

/** Детерминированный ГПСЧ генератора (LCG): деревья в парке стоят одинаково у всех и всегда. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Кольцевой бортик фонтана; gap — разрыв посередине длинных сторон под мостик. */
function ring(a: Assembly, w: number, d: number, t: number, cy: number, h: number, color: string, gap: number) {
  if (gap > 0) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) box(a, (sx * (w + gap)) / 4, cy, sz * (d / 2 - t / 2), (w - gap) / 2, h, t, color, true, 0.05);
    }
  } else {
    box(a, 0, cy, -d / 2 + t / 2, w, h, t, color, true, 0.05);
    box(a, 0, cy, d / 2 - t / 2, w, h, t, color, true, 0.05);
  }
  box(a, -w / 2 + t / 2, cy, 0, t, h, d - 2 * t, color, true, 0.05);
  box(a, w / 2 - t / 2, cy, 0, t, h, d - 2 * t, color, true, 0.05);
}

function terrain(root: Assembly) {
  // Плиты площади: две «ступеньки» по 0.21 м (×3) — ниже шага, заходишь без прыжка.
  for (const [x, z, w, d] of [
    [0, -16, 18.4, 27],
    [0, 10.1, 18.4, 16.4],
  ]) {
    box(root, x, 0.035, z, w, 0.07, d, P.ivory, true, 0.08).surface = 'tiles';
  }
  // Дороги и разметка — тонкие, только вид.
  for (const x of [-10.25, 10.25]) box(root, x, 0.016, -6, 1.8, 0.032, 58, P.road, false, 0);
  box(root, 0, 0.018, 0, 36, 0.036, 3.8, P.road, false, 0);
  box(root, 0, 0.018, 20.1, 36, 0.036, 1.9, P.road, false, 0);
  for (const x of [-11.35, -9.15, 9.15, 11.35]) box(root, x, 0.04, -6, 0.35, 0.08, 57, P.cream, false, 0.02);
  for (const z of [-2.15, 2.15, 18.9, 21.3]) box(root, 0, 0.035, z, 35, 0.07, 0.3, P.cream, false, 0.02);
  for (let x = -16; x < 17; x += 2.5) box(root, x, 0.045, 0, 1.2, 0.02, 0.045, P.paint, false, 0);
  for (const x of [-8.5, 8.5]) {
    for (let k = 0; k < 6; k++) box(root, x, 0.045, -1.5 + k * 0.58, 0.7, 0.02, 0.2, P.white, false, 0);
  }
  for (const z of [-18, -14, -10, -6]) box(root, 0, 0.079, z, 17.8, 0.015, 0.06, P.cream, false, 0);
  for (const x of [-6, -3, 0, 3, 6]) box(root, x, 0.078, -10, 0.055, 0.015, 17, P.cream, false, 0);
  // Цветная плитка — поля для низких поз (лёг на плитку своего цвета).
  for (const side of [-1, 1]) {
    for (const z of [-18.5, -8.3]) floorMosaic(root, side * 4.9, z, [P.coral, P.peach, P.yellow, P.ivory]);
    for (const z of [3.9, 16.1]) floorMosaic(root, side * 5.1, z, [P.teal, P.mint, P.blue, P.ivory]);
    for (const z of [-25.4, -15.5]) floorMosaic(root, side * 14.2, z, [P.purple, P.lavender, P.mint, P.cream], 1, 0);
  }
}

/** Исторический музей: мраморный объём (не залезть), рёбра и стёкла — только вид, лестница к входу. */
function museum(): Assembly {
  const a = assembly();
  box(a, 0, 0.36, 0, 12, 0.72, 10.3, P.stone, true, 0.1).surface = 'marble';
  box(a, 0, 2.54, 0, 10.6, 3.64, 8.5, P.cream, true, 0.16, true).surface = 'marble';
  for (const s of [-1, 1]) {
    box(a, 0, 2.58, s * 4.29, 10.1, 3.1, 0.045, P.glass, false, 0.02);
    for (let i = 0; i <= 14; i++) box(a, -5.2 + i * (10.4 / 14), 2.61, s * 4.43, 0.13, 3.8, 0.32, P.white, false, 0.035);
    box(a, s * 5.34, 2.58, 0, 0.045, 3.1, 8.0, P.glass, false, 0.02);
    for (let i = 0; i <= 11; i++) box(a, s * 5.47, 2.61, -4.05 + i * (8.1 / 11), 0.32, 3.8, 0.13, P.white, false, 0.035);
    for (let i = 0; i < 4; i++) {
      box(a, s * 6.5, 0.2, -3.6 + i * 2.2, 1.0, 0.4, 1.5, P.white, true, 0.07);
      box(a, s * 6.5, 0.42, -3.6 + i * 2.2, 0.78, 0.045, 1.18, P.waterDark, false, 0.03);
    }
  }
  box(a, 0, 4.48, 0, 11.4, 0.22, 9.3, P.white, false, 0.07);
  box(a, 0, 4.69, 0, 10.8, 0.2, 8.7, P.ivory, false, 0.1);
  box(a, 0, 4.86, 0, 9.8, 0.16, 7.7, P.cream, false, 0.1);
  box(a, 0, 5.1, 0, 3.3, 0.4, 2.6, P.white, false, 0.1);
  box(a, 0, 5.32, 0, 2.8, 0.045, 2.1, P.blue, false, 0.04);
  // Лестница: 9 ступеней по 0.08 (×3 = 0.24 м) — ниже шага, поднимаешься пешком.
  for (let i = 0; i < 9; i++) box(a, 0, (i + 1) * 0.04, 6.51 - i * 0.16, 5.4, (i + 1) * 0.08, 0.16, P.white, true, 0.012);
  // Сам музей белый; орнамент — только по цоколю и фризу над входом.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      paintFace(a, 'front', vec3(side * (3.25 + i * 0.85), 0.37, 5.153), [0.66, 0.48], i % 2 ? P.blue : P.teal);
      stepMotif(a, 'front', vec3(side * (3.25 + i * 0.85), 0.38, 5.16), P.gold, 0.28);
    }
  }
  for (let i = 0; i < 9; i++) paintFace(a, 'front', vec3(-3.6 + i * 0.9, 4.43, 4.655), [0.48, 0.14], i % 2 ? P.blue : P.gold);
  return a;
}

/** Манас на белом ступенчатом постаменте. Постамент — препятствие (не залезть), бронза — только вид. */
function manas(): Assembly {
  const a = assembly();
  box(a, 0, 0.12, 0, 2.3, 0.24, 2.5, P.stone, true, 0.07);
  box(a, 0, 0.3, 0, 1.7, 0.13, 1.9, P.white, true, 0.05);
  for (let i = 0; i < 12; i++) {
    const h = 0.235;
    const w = 0.9 - i * 0.042;
    box(a, 0, 0.365 + (i + 0.5) * h, i * 0.048, w, h + 0.014, w, P.white, true, 0.025, true);
  }
  const y = 3.25;
  const z = 0.52;
  box(a, 0, y + 0.45, z, 0.55, 0.64, 1.2, P.bronze, false, 0.18);
  box(a, 0, y + 0.83, z + 0.42, 0.42, 0.7, 0.42, P.bronze, false, 0.13);
  box(a, 0, y + 1.16, z + 0.69, 0.35, 0.38, 0.57, P.bronze, false, 0.12);
  for (const s of [-1, 1]) {
    box(a, s * 0.18, y + 0.06, z - 0.39, 0.17, 0.55, 0.2, P.bronze, false, 0.06);
    box(a, s * 0.18, y - 0.13, z - 0.58, 0.17, 0.18, 0.43, P.bronze, false, 0.06);
    box(a, s * 0.2, y + 0.87, z + 0.6, 0.15, 0.17, 0.55, P.bronze, false, 0.06);
    box(a, s * 0.2, y + 0.79, z + 0.85, 0.15, 0.25, 0.17, P.bronze, false, 0.06);
    box(a, s * 0.29, y + 0.55, z - 0.03, 0.16, 0.7, 0.18, P.bronze, false, 0.06);
  }
  box(a, 0, y + 1.1, z - 0.05, 0.48, 0.65, 0.3, P.bronze, false, 0.1);
  sphere(a, 0, y + 1.58, z - 0.03, 0.29, 0.34, 0.29, P.bronze);
  cylinder(a, 0, y + 1.79, z - 0.03, 0.17, 0.16, 0.17, P.bronze);
  box(a, -0.36, y + 1.78, z + 0.12, 0.035, 1.32, 0.035, P.bronze, false, 0.012);
  box(a, -0.36, y + 2.3, z + 0.02, 0.04, 0.3, 0.35, P.bronze, false, 0.02);
  return a;
}

/** Государственный флаг: флагшток 43 м (×3) виден отовсюду — ориентир. По нему не лезть. */
function flag(): Assembly {
  const a = assembly();
  cylinder(a, 0, 0.1, 0, 0.9, 0.2, 0.9, P.stone, true);
  cylinder(a, 0, 7.2, 0, 0.15, 14.4, 0.15, P.white);
  collide(a, 0, 7.2, 0, 0.18, 14.4, 0.18, true);
  for (let i = 0; i < 8; i++) box(a, 0.25 + (i + 0.5) * 0.48, 13.1, Math.sin(i * 0.65) * 0.14, 0.49, 2.26, 0.035, P.red, false, 0.018);
  const fz = Math.sin(3.5 * 0.65) * 0.14 + 0.04;
  sphere(a, 2.17, 13.1, fz, 0.76, 0.76, 0.045, P.yellow);
  for (let i = 0; i < 40; i++) {
    const angle = (i * Math.PI) / 20;
    sphere(a, 2.17 + 0.5 * Math.cos(angle), 13.1 + 0.5 * Math.sin(angle), fz, 0.065, 0.065, 0.047, P.yellow);
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) box(a, 2.17 - 0.22 + i * 0.11, 13.1 + s * (-0.2 + i * 0.1), fz + 0.03, 0.13, 0.035, 0.018, P.red, false, 0.008);
  }
  return a;
}

/** Островок-цветник перед музеем; вокруг каждого два обхода. */
function island(): Assembly {
  const a = assembly();
  box(a, 0, 0.36, 0, 2.05, 0.72, 1.45, P.white, true, 0.12);
  box(a, 0, 0.8, 0, 1.85, 0.22, 1.25, P.leafLight, false, 0.1);
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      paintFace(a, 'front', vec3(-0.56 + i * 0.56, 0.37, sign * 0.728), [0.53, 0.53], [P.coral, P.peach, P.yellow][i]);
      paintFace(a, 'side', vec3(sign * 1.028, 0.37, -0.38 + i * 0.38), [0.35, 0.53], [P.peach, P.coral, P.yellow][i]);
    }
  }
  for (let i = 0; i < 5; i++) sphere(a, -0.7 + i * 0.35, 0.98, 0, 0.28, 0.21, 0.28, i % 2 ? P.pink : P.yellow);
  return a;
}

/** Фонтан: сухая чаша, бортики в бирюзовой плитке; у больших — разрыв бортика и мостик со ступенями. */
function fountain(w: number, d: number): Assembly {
  const a = assembly();
  const big = w > 3;
  const gap = big ? 1.18 : 0;
  box(a, 0, 0.1, 0, w + 0.45, 0.2, d + 0.45, P.stone, true, 0.09);
  box(a, 0, 0.22, 0, w - 0.3, 0.08, d - 0.3, P.water, false, 0.08);
  ring(a, w, d, 0.32, 0.39, 0.52, P.white, gap);
  ring(a, w + 0.12, d + 0.12, 0.18, 0.68, 0.13, P.ivory, gap);
  const count = big ? 8 : 2;
  const tile = (w - gap) / count;
  for (const sign of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      const x = big ? (i < count / 2 ? -w / 2 + (i + 0.5) * tile : gap / 2 + (i - count / 2 + 0.5) * tile) : -w / 2 + (i + 0.5) * tile;
      const color = [P.teal, P.blue, P.waterDark, P.mint][i % 4];
      paintFace(a, 'front', vec3(x, 0.39, sign * (d / 2 + 0.003)), [tile * 0.88, 0.45], color);
      paintFace(a, 'top', vec3(x, 0.752, sign * (d / 2 - 0.02)), [tile * 0.88, 0.16], color);
    }
    for (let i = 0; i < 3; i++) {
      paintFace(a, 'side', vec3(sign * (w / 2 + 0.003), 0.39, -d * 0.3 + i * d * 0.3), [d * 0.24, 0.45], [P.blue, P.teal, P.mint][i]);
    }
  }
  if (big) {
    box(a, 0, 0.37, 0, 0.95, 0.25, d + 0.85, P.white, true, 0.07);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const top = 0.07 + ((i + 1) * (0.495 - 0.07)) / 6;
        box(a, 0, top / 2, side * (d / 2 + 0.425 + (6 - i - 0.5) * 0.15), 1.1, top, 0.15, P.white, true, 0.018);
      }
    }
  }
  for (const s of [-1, 1]) {
    box(a, s * w * 0.24, 0.31, 0, w * 0.27, 0.15, d * 0.52, P.waterLight, false, 0.08);
    for (let j = 0; j < 3; j++) cylinder(a, s * w * 0.24, 0.51, -d * 0.22 + j * d * 0.22, 0.08, 0.44, 0.08, P.waterLight);
  }
  return a;
}

/** Колоннада: настоящий открытый коридор между глухой стеной и колоннами. */
function arcade(s: number): Assembly {
  const a = assembly();
  box(a, s * 0.75, 2.0, 0, 1.9, 4, 15.8, P.ivory, true, 0.12, true);
  box(a, 0, 4.05, 0, 4.0, 0.28, 16.4, P.white, true, 0.08);
  box(a, 0, 4.29, 0, 4.05, 0.16, 16.45, P.cream, false, 0.07);
  for (let i = 0; i < 8; i++) {
    const z = -7.2 + i * 2.05;
    box(a, -s * 1.5, 1.92, z, 0.36, 3.84, 0.36, P.white, true, 0.09);
    box(a, -s * 1.5, 0.18, z, 0.56, 0.36, 0.56, P.white, true, 0.07);
    box(a, -s * 1.5, 3.72, z, 0.58, 0.25, 0.58, P.white, false, 0.06);
    box(a, -s * 0.24, 2.23, z, 0.04, 1.9, 1.35, i % 2 ? P.glass : P.blue, false, 0.015);
    const accent = (s < 0 ? [P.coral, P.peach, P.orange, P.yellow] : [P.purple, P.lavender, P.teal, P.mint])[i % 4];
    paintFace(a, 'side', vec3(-s * 0.204, 0.6, z), [1.58, 1.12], accent);
    stepMotif(a, 'side', vec3(-s * 0.211, 0.82, z), P.ivory, 0.38);
    paintFace(a, 'front', vec3(-s * 1.5, 0.18, z + 0.283), [0.4, 0.2], accent);
  }
  a.passages.push({ id: 'corridor', from: vec3(-s * 0.72, 0, -8.6), to: vec3(-s * 0.72, 0, 8.6) });
  return a;
}

/** Южный портал — белая стена с синими арками, замыкает площадь. */
function southBackdrop(): Assembly {
  const a = assembly();
  box(a, 0, 2, 0, 16, 4, 2.4, P.cream, true, 0.14, true);
  box(a, 0, 4.18, 0, 16.7, 0.3, 2.9, P.white, false, 0.1);
  for (let i = 0; i < 9; i++) {
    box(a, -7 + i * 1.75, 2.1, -1.28, 0.3, 3.9, 0.35, P.white, false, 0.06);
    box(a, -6.6 + i * 1.65, 2.2, -1.23, 1.1, 2.65, 0.045, P.blue, false, 0.025);
  }
  box(a, 0, 4.59, 0, 4.8, 0.55, 2.8, P.roof, false, 0.1);
  return a;
}

/** Именованные проходы и маршруты плана — тест проверяет их нашей физикой. */
const ROUTES: Passage[] = [
  { id: 'fountain-bridges', from: vec3(0, PLAZA_Y, 4.2), to: vec3(0, PLAZA_Y, 15.6) },
  { id: 'museum-steps', from: vec3(0, PLAZA_Y, -18), to: vec3(0, 0.72, -20.25) },
];

function buildPlan(): Assembly {
  const root = assembly();
  const random = lcg(2742026);
  terrain(root);
  place(root, museum(), 0, -25);
  place(root, manas(), 0, -6);
  place(root, flag(), -6.9, -5.5);
  for (const s of [-1, 1]) {
    for (const z of [-16, -11.8]) place(root, island(), s * 3.3, z);
  }
  place(root, fountain(7.4, 2.6), 0, 7.3);
  place(root, fountain(7.4, 2.6), 0, 12.5);
  for (const s of [-1, 1]) {
    for (const z of [6.8, 13]) place(root, fountain(1.6, 1.9), s * 6.8, z);
  }
  for (const s of [-1, 1]) place(root, arcade(s), s * 12.6, 10);

  // Парки по бокам от музея.
  for (const s of [-1, 1]) {
    for (const z of [-28, -23, -18, -13, -8]) {
      box(root, s * 14.3, 0.004, z, 5.8, 0.008, 0.65, P.cream, false, 0);
      place(root, buildTree(z), s * (14 + random() * 0.7), z - 1);
    }
    box(root, s * 14.2, 0.004, -18, 0.7, 0.008, 23, P.cream, false, 0);
    for (let k = 0; k < 4; k++) place(root, buildTree(k), s * (3 + k * 3.1), -32.5);
  }
  for (const s of [-1, 1]) {
    for (const z of [3, 17.4]) place(root, buildTree(1), s * 15.2, z);
  }

  const benches: [number, number, number, string][] = [
    [-7.1, -17.4, 1, P.coral],
    [7.1, -17.4, 3, P.orange],
    [-7.0, -10.7, 1, P.purple],
    [7.0, -10.7, 3, P.mint],
    [-5.1, 3.25, 0, P.teal],
    [5.1, 3.25, 0, P.blue],
    [-5.1, 16.6, 2, P.coral],
    [5.1, 16.6, 2, P.purple],
    [-15.2, -19.7, 1, P.mint],
    [15.2, -19.7, 3, P.orange],
  ];
  for (const [x, z, turn, color] of benches) place(root, buildBench(color), x, z, turn);
  const planters: [number, number, string][] = [
    [-7.8, -3.1, P.coral],
    [7.8, -3.1, P.purple],
    [-2.7, -3.1, P.mint],
    [2.7, -3.1, P.blue],
    [-15.3, -5.0, P.yellow],
    [15.3, -5.0, P.coral],
    [-2.3, 17.5, P.mint],
    [2.3, 17.5, P.purple],
  ];
  planters.forEach(([x, z, color], i) => place(root, buildPlanter(color, i % 2 ? P.pink : P.coral), x, z));
  place(root, buildKiosk(P.coral), -15, 6.3, 1);
  place(root, buildKiosk(P.blue), 15, 13.3, 3);
  for (const [i, x, z] of [
    [0, -8, 9.9],
    [1, 8, 9.9],
    [2, -7.8, -20.2],
    [3, 7.8, -20.2],
  ]) {
    place(root, buildBin(i % 2 ? P.mint : P.blue), x, z);
  }
  for (const s of [-1, 1]) {
    for (const z of [-19.7, -8, 3.2, 17.2]) place(root, buildLamp(), s * 8.8, z);
  }
  place(root, southBackdrop(), 0, 22.5);

  // Живая изгородь по краю — видимая граница площади.
  for (const s of [-1, 1]) {
    box(root, s * 17.65, 0.9, -6, 0.7, 1.8, 60, P.leaf, true, 0.2, true);
    box(root, 0, 0.9, s > 0 ? 23.65 : -35.65, 34.6, 1.8, 0.7, P.leaf, true, 0.2, true);
  }
  root.passages.push(...ROUTES);
  return root;
}

const plan = buildPlan();
const shift = <T extends { z: number }>(v: T): T => ({ ...v, z: v.z + SHIFT_Z });
const plaza = (x: number, z: number) => shift(vec3(x, PLAZA_Y, z));

const PLAN: MapDef = {
  id: 'ala-too',
  name: 'Площадь Ала-Тоо',
  width: WIDTH,
  depth: DEPTH,
  floorColor: P.grass,
  skyColor: '#a7dcff',
  boxes: [
    ...plan.boxes.map(shift),
    // Невидимая стена 30 м (×3): с крыши колоннады (12.6 м) разбег и прыжок перенесли бы через изгородь.
    ...perimeterWalls(WIDTH, DEPTH, 10, '#000000').map((b) => ({ ...b, hidden: true })),
  ],
  spawns: [
    plaza(-8, -17),
    plaza(8, -17),
    plaza(-8, -6.5),
    plaza(8, -6.5),
    plaza(-8, 8.9),
    plaza(8, 8.9),
    plaza(-6, 17.4),
    plaza(6, 17.4),
  ],
  // Ищущие ждут в центре северной площади — между клумбами, лицом к музею.
  seekerSpawns: [plaza(-1.5, -13.5), plaza(1.5, -13.5)],
  // Площадь в 4 раза больше квартиры: 4 минуты поиска вместо 2.5.
  seekSeconds: 240,
};

export const ALA_TOO: MapDef = scaleMap(PLAN, ALA_TOO_SCALE);

/** Проходы, которые обязаны оставаться открытыми, — в мировых координатах карты. */
export const ALA_TOO_PASSAGES: Passage[] = plan.passages.map((p) => {
  const k = ALA_TOO_SCALE;
  const point = (v: Passage['from']) => vec3(v.x * k, v.y * k, (v.z + SHIFT_Z) * k);
  return { id: p.id, from: point(p.from), to: point(p.to) };
});
