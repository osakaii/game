import { vec3 } from '../math.js';
import { tree } from './builders.js';
import { perimeterWalls, type MapDef } from './map.js';

const WIDTH = 32;
const DEPTH = 32;

/** Сад: просторно, много зелёного разных оттенков — маскировка в кустах. */
export const GARDEN: MapDef = {
  id: 'garden',
  name: 'Сад',
  width: WIDTH,
  depth: DEPTH,
  floorColor: '#7cb342',
  skyColor: '#a7dcff',
  boxes: [
    // Забор: 2 м — не перепрыгнуть
    ...perimeterWalls(WIDTH, DEPTH, 2, '#a1887f'),

    // Дорожка и пруд
    { x: 0, z: 0, w: 2, h: 0.03, d: 28, color: '#bcaaa4' },
    { x: -8, z: 4, w: 5, h: 0.04, d: 3.5, color: '#4fc3f7' },

    // Сарай
    { x: 10, z: -10, w: 6, h: 3, d: 5, color: '#8d6e63' },
    { x: 10, z: -10, y: 3, w: 6.6, h: 0.4, d: 5.6, color: '#5d4037' },

    // Кусты разных оттенков
    { x: -8, z: -6, w: 2, h: 1.4, d: 2, color: '#558b2f' },
    { x: -5.8, z: -6.5, w: 1.5, h: 1.2, d: 1.5, color: '#33691e' },
    { x: 4, z: 6, w: 2.5, h: 1.5, d: 2, color: '#689f38' },
    { x: -12, z: 10, w: 3, h: 1.8, d: 2, color: '#2e7d32' },
    { x: 12, z: 8, w: 2, h: 1.3, d: 2, color: '#558b2f' },

    // Клумбы
    { x: 6, z: -2, w: 4, h: 0.3, d: 1.2, color: '#ef5350' },
    { x: 6, z: -4, w: 4, h: 0.3, d: 1.2, color: '#ffee58' },

    // Деревья
    ...tree(-10, -12, '#6d4c41', '#43a047'),
    ...tree(12, 12, '#6d4c41', '#2e7d32'),

    // Скамейка, ящики, будка
    { x: -3, z: -8, w: 2.4, h: 0.5, d: 0.6, color: '#8d6e63' },
    { x: 13, z: -2, w: 1, h: 1, d: 1, color: '#d7a86e' },
    { x: 13, z: -2, y: 1, w: 0.8, h: 0.8, d: 0.8, color: '#c49a6c' },
    { x: -13, z: -2, w: 1.6, h: 1.4, d: 1.6, color: '#e57373' },
  ],
  spawns: [vec3(2, 0, 10), vec3(-3, 0, 12), vec3(3, 0, 12), vec3(-3, 0, 2)],
  seekerSpawns: [vec3(13, 0, -14), vec3(11, 0, -14)],
};
