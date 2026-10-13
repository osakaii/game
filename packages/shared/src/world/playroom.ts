import { vec3 } from '../math.js';
import { perimeterWalls, type MapBox, type MapDef } from './map.js';

/** Стол: столешница + 4 ножки, каждая — отдельный коллайдер. Залезть можно прыжком. */
function table(x: number, z: number, w: number, d: number, h: number, color: string): MapBox[] {
  const top = 0.15;
  const leg = 0.15;
  const lx = w / 2 - leg / 2;
  const lz = d / 2 - leg / 2;
  return [
    { x, z, y: h - top, w, h: top, d, color },
    { x: x - lx, z: z - lz, w: leg, h: h - top, d: leg, color },
    { x: x + lx, z: z - lz, w: leg, h: h - top, d: leg, color },
    { x: x - lx, z: z + lz, w: leg, h: h - top, d: leg, color },
    { x: x + lx, z: z + lz, w: leg, h: h - top, d: leg, color },
  ];
}

/** Лестница из ступеней высотой 0.3 — по ним можно зайти без прыжка (step-up). */
function stairs(x: number, z: number, steps: number, color: string): MapBox[] {
  const result: MapBox[] = [];
  for (let i = 0; i < steps; i++) {
    result.push({ x: x + i, z, w: 1, h: 0.3 * (i + 1), d: 2, color });
  }
  return result;
}

const WIDTH = 30;
const DEPTH = 30;

/** Первая карта: детская комната. Много разных цветов — будет из чего красить себя. */
export const PLAYROOM: MapDef = {
  name: 'Playroom',
  width: WIDTH,
  depth: DEPTH,
  floorColor: '#d9c3a0',
  boxes: [
    ...perimeterWalls(WIDTH, DEPTH, 4, '#b8c4cc'),

    // Ковры (тонкие, на них заходишь автоматически)
    { x: -4, z: 6, w: 7, h: 0.03, d: 5, color: '#2a9d8f' },
    { x: 6, z: -4, w: 5, h: 0.03, d: 5, color: '#c75b7a' },

    // Стопка ящиков в углу
    { x: -11, z: -11, w: 3, h: 2, d: 3, color: '#e63946' },
    { x: -11, z: -11, y: 2, w: 1.6, h: 1.2, d: 1.6, color: '#f4a261' },
    { x: -8.5, z: -12, w: 1.5, h: 1, d: 1.5, color: '#e9c46a' },

    // Стеллаж вдоль левой стены
    { x: -14, z: 1, w: 1.6, h: 3, d: 7, color: '#457b9d' },

    // Стол
    ...table(3, -8, 3.4, 2, 1.1, '#8d6e63'),

    // Диван
    { x: 8, z: 9, w: 4.5, h: 0.6, d: 1.8, color: '#6a4c93' },
    { x: 8, z: 9.75, y: 0.6, w: 4.5, h: 0.8, d: 0.3, color: '#6a4c93' },
    { x: 5.95, z: 9, y: 0.6, w: 0.4, h: 0.4, d: 1.8, color: '#6a4c93' },
    { x: 10.05, z: 9, y: 0.6, w: 0.4, h: 0.4, d: 1.8, color: '#6a4c93' },

    // Холодильник
    { x: 13, z: -13, w: 2, h: 3.5, d: 2, color: '#f1faee' },

    // Колонна
    { x: 0, z: 0, w: 1, h: 4, d: 1, color: '#adb5bd' },

    // Лестница на платформу
    ...stairs(8, 2, 3, '#ffb703'),
    { x: 12.5, z: 2, w: 3, h: 0.9, d: 3, color: '#fb8500' },

    // Кубики-игрушки
    { x: -6, z: -3, w: 1, h: 1, d: 1, color: '#ffd166' },
    { x: -5, z: -2.4, w: 1, h: 1, d: 1, color: '#06d6a0' },
    { x: -5.5, z: -2.7, y: 1, w: 1, h: 1, d: 1, color: '#118ab2' },
    { x: 2, z: 11, w: 1, h: 1, d: 1, color: '#ef476f' },
    { x: -12, z: 11, w: 2, h: 1.4, d: 2, color: '#8ecae6' },
  ],
  spawns: [vec3(0, 0, 6), vec3(-3, 0, 2), vec3(3, 0, 2), vec3(0, 0, -4)],
  seekerSpawns: [vec3(12.5, 0, 12.5), vec3(11, 0, 12.5)],
};
