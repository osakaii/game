import { vec3 } from '../math.js';
import type { MapDef } from './map.js';
import { PALETTE as P, type Passage } from './procedural.js';
import { compileRecipe, type MapRecipe, type RecipeBlock, type RecipeProp } from './recipe.js';

/**
 * Игрушечный замок Mecha Castle (84 × 84 м после ×3): четыре башни, зал на помосте со ступенями
 * и тронами, ящики, бочки, пиршественные столы, ковёр с гербами, сундук, доспехи, жаровни, рыцари.
 */
function recipe(): MapRecipe {
  const props: RecipeProp[] = [];
  const blocks: RecipeBlock[] = [];
  const flat = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, round = 0): RecipeBlock => ({
    x,
    y,
    z,
    w,
    h,
    d,
    color,
    round,
  });

  for (const x of [-10.9, 10.9]) for (const z of [-10.9, 10.9]) props.push({ kind: 'tower', x, z, color: x < 0 ? P.purple : P.coral });
  props.push({ kind: 'hall', x: 0, z: -3.2, color: P.purple }, { kind: 'sign', x: 0, z: 12.1, color: P.deep, variant: 2 });
  for (const side of [-1, 1]) {
    for (const [i, z] of [2.6, 5.7, 8.4].entries()) props.push({ kind: 'crate', x: side * 5.3, z, color: [P.coral, P.blue, P.mint][i] });
    for (const z of [-3, 1]) props.push({ kind: 'crate', x: side * 9.7, z, color: z < 0 ? P.orange : P.purple });
    for (const z of [-6.0, -3.3]) props.push({ kind: 'barrel', x: side * 6.0, z, color: P.woodLight });
    props.push(
      { kind: 'table', x: side * 5.5, z: -9.5, color: P.woodLight, turn: 1 },
      { kind: 'bench', x: side * 8.3, z: 5.0, color: side < 0 ? P.blue : P.coral, turn: side < 0 ? 1 : 3 },
    );
    for (const z of [-7.4, 5.5]) props.push({ kind: 'planter', x: side * (z < 0 ? 9.3 : 11.5), z, color: side < 0 ? P.mint : P.purple });
  }
  // Швы каменных плит двора.
  for (let x = -12; x <= 12; x += 1.5) blocks.push(flat(x, 0.005, 0, 0.025, 0.01, 26.4, P.cream));
  for (let z = -12; z <= 12; z += 1.5) blocks.push(flat(0, 0.006, z, 26.4, 0.012, 0.025, P.cream));
  // Флаги у ворот — твёрдые полотна: за ними прячешься, в них — нет.
  for (const side of [-1, 1]) blocks.push({ ...flat(side * 2.8, 1.3, 13.6, 1.55, 2.4, 0.07, side < 0 ? P.blue : P.coral, 0.04), solid: true });
  props.push(
    { kind: 'carpet', x: 0, z: 4.7, color: P.red },
    { kind: 'treasure', x: -9.5, z: -5.5, color: P.woodLight },
    { kind: 'armor-stand', x: 9.5, z: -5.3, color: P.blue },
  );
  for (const side of [-1, 1]) {
    props.push({ kind: 'brazier', x: side * 3, z: 1.5, color: P.bronze }, { kind: 'moss', x: side * 11.7, z: 8, color: P.leaf });
    // Копоть на стене зала над жаровнями.
    blocks.push(flat(side * 2.65, 1.05, -0.26, 0.63, 0.62, 0.018, P.dark), flat(side * 2.65, 1.38, -0.255, 0.35, 0.4, 0.018, P.bronze));
  }
  for (const [i, x] of [-2.4, -0.8, 0.8, 2.4].entries()) {
    props.push({ kind: 'knight', x, z: 10.6, color: i === 0 ? P.stone : P.gold, variant: [0, 1, 3, 2][i] });
  }

  return {
    id: 'castle',
    name: 'Замок',
    width: 28,
    depth: 28,
    floor: P.ivory,
    boundary: 'castle',
    props,
    blocks,
    spawns: [vec3(-7.5, 0, -7.5), vec3(7.5, 0, -7.5), vec3(-7.5, 0, 0), vec3(7.5, 0, 0), vec3(-7.5, 0, 7), vec3(7.5, 0, 7), vec3(-3, 0, 10.5), vec3(3, 0, 10.5)],
    // Ищущие ждут на ковре перед залом: середина двора.
    seekerSpawns: [vec3(-1.2, 0, 6), vec3(1.2, 0, 6)],
    seekSeconds: 300,
    routes: [
      { id: 'hall-stairs', from: vec3(0, 0, 1.0), to: vec3(0, 0, -7.4) },
      { id: 'front-cross', from: vec3(-7.5, 0, 10.3), to: vec3(7.5, 0, 10.3) },
      { id: 'west-loop', from: vec3(-7.5, 0, -8), to: vec3(-7.5, 0, 7) },
      { id: 'east-loop', from: vec3(7.5, 0, -8), to: vec3(7.5, 0, 7) },
    ],
  };
}

const compiled = compileRecipe(recipe());

export const CASTLE: MapDef = compiled.map;
/** Проверочные маршруты, проход сквозь зал и под доспехами — в мировых координатах. */
export const CASTLE_PASSAGES: Passage[] = compiled.passages;
