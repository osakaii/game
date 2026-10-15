import { vec3 } from '../math.js';
import { stairs, table } from './builders.js';
import { perimeterWalls, type MapDef } from './map.js';

const WIDTH = 30;
const DEPTH = 30;

/** Первая карта: детская комната. Много разных цветов и рисунков — будет из чего красить себя. */
export const PLAYROOM: MapDef = {
  id: 'playroom',
  name: 'Детская',
  width: WIDTH,
  depth: DEPTH,
  floorColor: '#d9b98c',
  floorSurface: 'parquet',
  boxes: [
    ...perimeterWalls(WIDTH, DEPTH, 4, '#cfe0ea', 'stripes'),

    // Стопка ящиков-игрушек в углу
    { x: -11, z: -11, w: 3, h: 2, d: 3, color: '#e63946', shape: 'rounded', round: 0.12 },
    { x: -11, z: -11, y: 2, w: 1.6, h: 1.2, d: 1.6, color: '#f4a261', shape: 'rounded', round: 0.1 },
    { x: -8.5, z: -12, w: 1.5, h: 1, d: 1.5, color: '#e9c46a', shape: 'rounded', round: 0.08 },

    // Стол
    ...table(3, -8, 3.4, 2, 1.1, '#a47148'),

    // Холодильник
    { x: 13, z: -13, w: 2, h: 3.5, d: 2, color: '#f1faee', shape: 'rounded', round: 0.1 },

    // Колонна
    { x: 0, z: 0, w: 1, h: 4, d: 1, color: '#adb5bd' },

    // Лестница на платформу
    ...stairs(8, 2, 3, '#ffb703'),
    { x: 12.5, z: 2, w: 3, h: 0.9, d: 3, color: '#fb8500' },

    // Кубики-игрушки
    { x: -6, z: -3, w: 1, h: 1, d: 1, color: '#ffd166', shape: 'rounded', round: 0.08 },
    { x: -5, z: -2.4, w: 1, h: 1, d: 1, color: '#06d6a0', shape: 'rounded', round: 0.08 },
    { x: -5.5, z: -2.7, y: 1, w: 1, h: 1, d: 1, color: '#118ab2', shape: 'rounded', round: 0.08 },
    { x: 2, z: 11, w: 1, h: 1, d: 1, color: '#ef476f', shape: 'rounded', round: 0.08 },
    { x: -12, z: 11, w: 2, h: 1.4, d: 2, color: '#8ecae6', shape: 'rounded', round: 0.1 },
  ],
  props: [
    // Ковры (тонкие, на них заходишь автоматически)
    { prop: 'rug', x: -4, z: 6, length: 7, color: '#2a9d8f' },
    { prop: 'rug', x: 6, z: -4, length: 5, color: '#c75b7a' },
    // Книжные шкафы вдоль левой стены — «лицом» в комнату (+X)
    ...[-2, -0.6, 0.8, 2.2, 3.6].map((z) => ({ prop: 'bookshelf' as const, x: -14.8, z, rot: 90 as const, length: 1.4 })),
    // Диван спинкой к стене
    { prop: 'sofa', x: 8, z: 9.5, rot: 180, length: 4.5 },
    // Растения по углам
    { prop: 'plant', x: -13.6, z: 13.6 },
    { prop: 'plant', x: 13.6, z: -9.5, length: 0.7 },
  ],
  spawns: [vec3(0, 0, 6), vec3(-3, 0, 2), vec3(3, 0, 2), vec3(0, 0, -4)],
  seekerSpawns: [vec3(12.5, 0, 12.5), vec3(11, 0, 12.5)],
};
