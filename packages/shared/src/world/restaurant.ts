import { vec3 } from '../math.js';
import type { MapDef } from './map.js';
import { PALETTE as P, type Passage } from './procedural.js';
import { compileRecipe, type MapRecipe, type RecipeBlock, type RecipeProp } from './recipe.js';

/**
 * Ресторан Mecha Bistro (78 × 66 м после ×3): зал с шестью столами (две со скатертями до пола),
 * кухня за стеной с двумя служебными проходами, диваны, подносы, пятна соуса, картины на стенах.
 */
function recipe(): MapRecipe {
  const props: RecipeProp[] = [];
  const blocks: RecipeBlock[] = [];
  const b = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, solid = false, round = 0.04): RecipeBlock => ({
    x,
    y,
    z,
    w,
    h,
    d,
    color,
    solid,
    round,
  });

  for (const [row, z] of [-0.7, 5.4].entries()) {
    for (const [col, x] of [-7, 0, 7].entries()) {
      const color = [P.coral, P.mint, P.purple][col]!;
      // Во втором ряду крайние столы — со скатертями: за тканью прячутся стоя.
      props.push({ kind: row === 1 && col !== 1 ? 'cloth-table' : 'table', x, z, color });
      for (const side of [-1, 1]) {
        for (const dx of [-0.95, 0.95]) props.push({ kind: 'chair', x: x + dx, z: z + side * 1.55, color, turn: side < 0 ? 0 : 2 });
      }
    }
  }
  props.push(
    { kind: 'island', x: -4, z: -6.4, color: P.coral },
    { kind: 'island', x: 4, z: -6.4, color: P.teal },
    { kind: 'range', x: -6.9, z: -9.4, color: P.blue },
    { kind: 'fridge', x: 3.2, z: -9.6, color: P.teal },
    { kind: 'fridge', x: 6.1, z: -9.6, color: P.purple },
    { kind: 'pallet', x: -10.6, z: -7.0, color: P.orange },
    { kind: 'pallet', x: 10.6, z: -7.0, color: P.mint },
    { kind: 'sofa', x: -11.3, z: 3.0, color: P.purple, turn: 1 },
    { kind: 'sofa', x: 11.3, z: 3.0, color: P.coral, turn: 3 },
    { kind: 'sign', x: 0, z: -10.6, color: P.teal, variant: 0 },
    { kind: 'spill', x: 3.4, z: 2.35, color: P.mint },
    { kind: 'spill', x: -1.6, z: -8.8, color: P.coral, variant: 1 },
    { kind: 'tray-stack', x: 10.5, z: 0.5, color: P.teal },
    { kind: 'wall-art', x: -12.68, z: 6, color: P.teal, turn: 1, variant: 0 },
    { kind: 'wall-art', x: 12.68, z: -0.4, color: P.coral, turn: 3, variant: 1 },
  );
  // Мятные плитки у входа — ложишься и пропадаешь.
  for (const x of [-11, -9.7, -8.4, -7.1]) for (const z of [9, 10.1]) blocks.push(b(x, 0.019, z, 1.05, 0.012, 1.05, P.mint, false, 0));
  for (const [i, x] of [-10.9, 10.9].entries()) {
    for (const z of [-1.3, 7.7]) props.push({ kind: 'planter', x, z, color: i ? P.purple : P.mint });
  }
  // Стена кухни с двумя служебными проходами (x ≈ ±8) и перемычкой над ними.
  for (const [x, w] of [
    [-10.85, 3.7],
    [0, 14],
    [10.85, 3.7],
  ] as const) {
    blocks.push(b(x, 0.35, -4.2, w, 0.7, 0.2, P.peach, true), b(x, 2.1, -4.2, w, 2.8, 0.2, P.peach, true));
  }
  blocks.push(b(0, 3.75, -4.2, 25.4, 0.5, 0.2, P.ivory, true));
  for (const x of [-9, -7, 7, 9]) blocks.push(b(x, 1.7, -4.08, 0.08, 3.4, 0.06, P.teal));
  // Швы плитки пола и жёлтые коврики у служебных дверей.
  for (let x = -12; x < 13; x += 1.3) blocks.push(b(x, 0.006, 0, 0.02, 0.012, 21.4, P.cream, false, 0));
  for (let z = -10; z < 11; z += 1.3) blocks.push(b(0, 0.006, z, 25.4, 0.012, 0.02, P.cream, false, 0));
  for (const x of [-8, 8]) blocks.push(b(x, 0.008, -4.2, 1.8, 0.016, 1.6, P.yellow, false, 0));
  for (const x of [-7, 0, 7]) {
    for (const z of [-7.7, 2.4, 8.9]) blocks.push(b(x, 4.0, z, 2.2, 0.1, 0.35, P.dark), { ...b(x, 3.94, z, 2.0, 0.025, 0.24, P.paint), glow: true });
  }

  return {
    id: 'restaurant',
    name: 'Ресторан',
    width: 26,
    depth: 22,
    floor: P.ivory,
    boundary: 'indoor',
    props,
    blocks,
    spawns: [vec3(-8, 0, -5), vec3(8, 0, -5), vec3(-3.5, 0, -0.7), vec3(3.5, 0, -0.7), vec3(-9.5, 0, 6.5), vec3(9.5, 0, 6.5), vec3(-3.5, 0, 8.8), vec3(3.5, 0, 8.8)],
    // Ищущие ждут в проходе между рядами столов: одинаково близко до зала и до кухни.
    seekerSpawns: [vec3(-1.5, 0, 2.35), vec3(1.5, 0, 2.35)],
    seekSeconds: 300,
    routes: [
      { id: 'dining-cross', from: vec3(-9.5, 0, 2.35), to: vec3(9.5, 0, 2.35) },
      { id: 'kitchen-cross', from: vec3(-8, 0, -8), to: vec3(8, 0, -8) },
      { id: 'west-service-door', from: vec3(-8, 0, -8), to: vec3(-8, 0, -3) },
      { id: 'east-service-door', from: vec3(8, 0, -8), to: vec3(8, 0, -3) },
    ],
  };
}

const compiled = compileRecipe(recipe());

export const RESTAURANT: MapDef = compiled.map;
/** Проверочные маршруты и проходы под столами — в мировых координатах. */
export const RESTAURANT_PASSAGES: Passage[] = compiled.passages;
