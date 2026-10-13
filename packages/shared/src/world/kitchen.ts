import { vec3 } from '../math.js';
import { chair, table } from './builders.js';
import { perimeterWalls, type MapDef } from './map.js';

const WIDTH = 24;
const DEPTH = 20;

/** Кухня: тесная, много мебели у стен и мелких предметов — прятаться приходится вплотную к ним. */
export const KITCHEN: MapDef = {
  id: 'kitchen',
  name: 'Кухня',
  width: WIDTH,
  depth: DEPTH,
  floorColor: '#e9e4d8',
  skyColor: '#ffe8c2',
  boxes: [
    ...perimeterWalls(WIDTH, DEPTH, 3.5, '#c9d6df'),

    // Кухонный гарнитур вдоль задней стены
    { x: -4, z: -9.2, w: 14, h: 0.95, d: 1.6, color: '#adb5bd' },
    { x: -9, z: -9.3, y: 0.95, w: 0.5, h: 0.7, d: 0.35, color: '#ffb703' },
    { x: -8.3, z: -9.3, y: 0.95, w: 0.4, h: 0.5, d: 0.35, color: '#fb8500' },
    { x: 1, z: -9.4, y: 0.95, w: 1.2, h: 0.35, d: 0.6, color: '#8ecae6' },
    // Навесные шкафы — выше роста, под ними проходим
    { x: -4, z: -9.6, y: 1.9, w: 14, h: 0.8, d: 0.8, color: '#f1faee' },
    { x: 6, z: -9.2, w: 2, h: 0.95, d: 1.6, color: '#343a40' },
    { x: 9.6, z: -9, w: 2, h: 3, d: 1.8, color: '#f8f9fa' },

    // Обеденная зона
    { x: 0, z: 2, w: 6, h: 0.03, d: 4, color: '#e9c46a' },
    ...table(0, 2, 3, 1.6, 1, '#a0522d'),
    ...chair(-0.8, 3.4, 1, '#e76f51'),
    ...chair(0.8, 3.4, 1, '#e76f51'),
    ...chair(-0.8, 0.6, -1, '#2a9d8f'),
    ...chair(0.8, 0.6, -1, '#2a9d8f'),

    // Остров и полка
    { x: -6, z: 3, w: 3, h: 1, d: 1.5, color: '#2a9d8f' },
    { x: -11.2, z: 3, w: 1.2, h: 2.4, d: 4, color: '#bc6c25' },
    { x: -11.2, z: 3, y: 2.4, w: 1.2, h: 0.3, d: 1, color: '#ffd166' },

    // Мелочи
    { x: 11, z: 8, w: 0.8, h: 1, d: 0.8, color: '#6c757d' },
    { x: 7, z: 6, w: 1.2, h: 0.6, d: 1.2, color: '#e63946' },
    { x: -8, z: 8.5, w: 2.5, h: 0.9, d: 1.2, color: '#6a4c93' },
  ],
  spawns: [vec3(0, 0, 7), vec3(-3, 0, 7), vec3(3, 0, 7), vec3(5, 0, 2)],
  seekerSpawns: [vec3(9.5, 0, 8.2), vec3(8.5, 0, 8.2)],
};
