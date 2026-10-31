import { vec3 } from '../math.js';
import type { MapDef } from './map.js';
import { PALETTE as P, type Passage } from './procedural.js';
import { compileRecipe, type MapRecipe, type RecipeBlock, type RecipeProp } from './recipe.js';

/**
 * Жилой двор Mecha Yard (84 × 78 м после ×3): четыре проходных домика, машины на дороге,
 * детская площадка, сушилка с полотенцами, классики мелом, деревья и цветники вдоль изгороди.
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

  for (const [i, x] of [-7.8, 7.8].entries()) {
    for (const [j, z] of [-7.5, 7.5].entries()) {
      props.push({ kind: 'house', x, z, color: [P.coral, P.mint, P.yellow, P.purple][i * 2 + j], turn: j ? 2 : 0, variant: i + j });
    }
  }
  props.push(
    { kind: 'car', x: -2.0, z: -7.5, color: P.blue },
    { kind: 'car', x: 2.0, z: -7.5, color: P.coral, turn: 2 },
    { kind: 'playground', x: 0, z: 0, color: P.coral },
  );
  for (const side of [-1, 1]) {
    props.push({ kind: 'bench', x: side * 6.1, z: 0, color: side < 0 ? P.purple : P.mint, turn: side < 0 ? 1 : 3 });
    for (const z of [-8, 0, 8]) props.push({ kind: 'tree', x: side * 12.1, z, variant: Math.abs(z) });
    for (const [i, z] of [-3.5, 3.5].entries()) props.push({ kind: 'planter', x: side * 11.6, z, color: i ? P.purple : P.blue });
    for (const z of [-3.6, 3.6]) props.push({ kind: 'planter', x: side * 3.9, z, color: z < 0 ? P.coral : P.mint });
    for (const z of [-4.2, 4.2]) props.push({ kind: 'lamp', x: side * 8.5, z });
  }
  props.push(
    { kind: 'planter', x: 0, z: 4.3, color: P.purple },
    { kind: 'sign', x: 0, z: 11.4, color: P.teal, turn: 2, variant: 1 },
    { kind: 'laundry', x: 0, z: 9.5, color: P.mint },
    { kind: 'toybox', x: -4, z: 8, color: P.orange },
    { kind: 'chalk-game', x: 2, z: 6.6, color: P.coral },
  );
  // Дорога с разметкой, площадка у горки, дворик у сушилки, дорожки к домам — плоские поля цвета.
  blocks.push(
    flat(0, 0.006, -7.5, 7.0, 0.012, 8.2, P.road),
    flat(0, 0.009, 0, 8, 0.018, 6.9, P.paint, 0.04),
    flat(0, 0.006, 8, 7.0, 0.012, 7.4, P.cream),
  );
  for (const side of [-1, 1]) blocks.push(flat(side * 7.8, 0.006, 0, 4.8, 0.012, 4.2, P.ivory));
  for (const x of [-2.9, -1, 1, 2.9]) blocks.push(flat(x, 0.016, -7.5, 0.025, 0.012, 7.5, P.paint));

  return {
    id: 'courtyard',
    name: 'Двор',
    width: 28,
    depth: 26,
    floor: P.grass,
    boundary: 'hedge',
    props,
    blocks,
    spawns: [vec3(-4.5, 0, -10.6), vec3(4.5, 0, -10.6), vec3(-7.8, 0, -3.8), vec3(7.8, 0, -3.8), vec3(-8.6, 0, 3.8), vec3(8.6, 0, 3.8), vec3(-3, 0, 10.4), vec3(3, 0, 10.4)],
    // Ищущие ждут на дороге между машинами: середина двора, все дома видны.
    seekerSpawns: [vec3(0, 0, -10.6), vec3(0, 0, -4.6)],
    seekSeconds: 300,
    routes: [
      { id: 'courtyard-cross', from: vec3(-9.4, 0, 0), to: vec3(9.4, 0, 0) },
      { id: 'central-path', from: vec3(0, 0, -11), to: vec3(0, 0, 2) },
      { id: 'north-west-house', from: vec3(-7.8, 0, -10.4), to: vec3(-7.8, 0, -4.6) },
      { id: 'north-east-house', from: vec3(7.8, 0, -10.4), to: vec3(7.8, 0, -4.6) },
      // По лестнице горки наверх, на настил (ступени по 10 см, ×3 — 30 см: ниже шага).
      { id: 'playground-stairs', from: vec3(-1, 0, 3.5), to: vec3(-1, 0.94, 1.1) },
    ],
  };
}

const compiled = compileRecipe(recipe());

export const COURTYARD: MapDef = compiled.map;
/** Проверочные маршруты, проходы сквозь дома и под горкой — в мировых координатах. */
export const COURTYARD_PASSAGES: Passage[] = compiled.passages;
