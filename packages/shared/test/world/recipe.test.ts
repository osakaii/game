import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../../src/math.js';
import { PHYSICS_DT, PLAYER, penetratesColliders, stepPlayer, supportHeight, type PlayerPhysicsState } from '../../src/physics.js';
import { CASTLE, CASTLE_PASSAGES } from '../../src/world/castle.js';
import { COURTYARD, COURTYARD_PASSAGES } from '../../src/world/courtyard.js';
import { buildColliders, mapBoxes, type MapDef } from '../../src/world/map.js';
import { PALETTE as P } from '../../src/world/procedural.js';
import { compileRecipe, RECIPE_SCALE } from '../../src/world/recipe.js';
import { RESTAURANT, RESTAURANT_PASSAGES } from '../../src/world/restaurant.js';
import type { Passage } from '../../src/world/procedural.js';

const MAPS: [string, MapDef, Passage[], number, number][] = [
  ['restaurant', RESTAURANT, RESTAURANT_PASSAGES, 78, 66],
  ['courtyard', COURTYARD, COURTYARD_PASSAGES, 84, 78],
  ['castle', CASTLE, CASTLE_PASSAGES, 84, 84],
];

describe('compileRecipe', () => {
  it('refuses a prop it does not know: a typo in a recipe fails loudly, not as a missing table', () => {
    const recipe = {
      id: 'test',
      name: 'Тест',
      width: 10,
      depth: 10,
      floor: P.ivory,
      boundary: 'hedge' as const,
      props: [{ kind: 'tabel', x: 0, z: 0 }],
      blocks: [],
      spawns: [vec3(0, 0, 0)],
      seekerSpawns: [vec3(0, 0, 0)],
      seekSeconds: 120,
      routes: [],
    };
    expect(() => compileRecipe(recipe)).toThrow('tabel');
  });
});

describe.each(MAPS)('recipe map %s', (_id, map, passages, width, depth) => {
  const colliders = buildColliders(map);
  const groundFrom = (x: number, z: number, from: number) => supportHeight(vec3(x, from + PLAYER.stepHeight, z), colliders);

  it(`is ${width} × ${depth} m after ×${RECIPE_SCALE}, and every visible block is inside`, () => {
    expect(map.width).toBe(width);
    expect(map.depth).toBe(depth);
    for (const b of mapBoxes(map).filter((box) => !box.hidden)) {
      expect(Math.abs(b.x) + b.w / 2, JSON.stringify(b)).toBeLessThanOrEqual(width / 2 + 0.01);
      expect(Math.abs(b.z) + b.d / 2, JSON.stringify(b)).toBeLessThanOrEqual(depth / 2 + 0.01);
    }
  });

  it('cannot be left: a ceiling indoors, a wall higher than any roof outdoors', () => {
    const top = Math.max(...colliders.filter((c) => !c.noClimb).map((c) => c.maxY));
    if (map.ceiling) {
      expect(colliders.some((c) => c.minY <= map.ceiling!.height && c.maxX - c.minX > width)).toBe(true);
    } else {
      const fence = colliders.filter((c) => c.noClimb && c.maxY > top + PLAYER.height * 2);
      expect(fence).toHaveLength(4);
    }
  });

  it('spawns stand on the floor, free', () => {
    for (const s of [...map.spawns, ...map.seekerSpawns]) {
      expect(groundFrom(s.x, s.z, 0)).toBe(0);
      expect(penetratesColliders(s, colliders, 0)).toBe(false);
    }
  });

  /** Маршруты рецепта и проходы под столами, сквозь дома и зал — НАШЕЙ физикой, шагом стоя. */
  function walk(from: Vec3, to: Vec3): PlayerPhysicsState {
    const state: PlayerPhysicsState = {
      position: vec3(from.x, groundFrom(from.x, from.z, from.y), from.z),
      velocity: vec3(),
      grounded: true,
      crouching: false,
      pose: 'none',
    };
    const seconds = Math.hypot(to.x - from.x, to.z - from.z) / PLAYER.walkSpeed + 2;
    for (let t = 0; t < seconds; t += PHYSICS_DT) {
      const dx = to.x - state.position.x;
      const dz = to.z - state.position.z;
      const left = Math.hypot(dx, dz);
      if (left < 0.1) break;
      stepPlayer(state, { dirX: dx / left, dirZ: dz / left, jump: false, crouch: false }, colliders, PHYSICS_DT);
    }
    return state;
  }

  it.each(passages.map((p, i) => [`${p.id} #${i}`, p] as const))('%s is walkable standing', (_name, p) => {
    const end = walk(p.from, p.to);
    expect(Math.hypot(end.position.x - p.to.x, end.position.z - p.to.z)).toBeLessThan(0.3);
    // И на нужной высоте: наверху горки, а не под ней.
    expect(Math.abs(end.position.y - p.to.y)).toBeLessThan(0.5);
  });

  it('from where seekers wait, every spawn and passage can be reached on foot', () => {
    const step = 0.5;
    const cols = Math.floor(width / step);
    const rows = Math.floor(depth / step);
    const cellOf = (p: Vec3) => [Math.floor((p.x + width / 2) / step), Math.floor((p.z + depth / 2) / step)] as const;
    const ground = new Float32Array(cols * rows).fill(NaN);
    const [si, sj] = cellOf(map.seekerSpawns[0]!);
    ground[sj * cols + si] = 0;
    const queue = [sj * cols + si];
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head]!;
      const i = k % cols;
      const j = (k - i) / cols;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = i + di;
        const nj = j + dj;
        const nk = nj * cols + ni;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || !Number.isNaN(ground[nk])) continue;
        const x = -width / 2 + (ni + 0.5) * step;
        const z = -depth / 2 + (nj + 0.5) * step;
        const y = groundFrom(x, z, ground[k]!);
        if (penetratesColliders(vec3(x, y, z), colliders, 0.02)) continue;
        ground[nk] = y;
        queue.push(nk);
      }
    }
    const reached = (p: Vec3) => {
      const [ci, cj] = cellOf(p);
      for (let di = -2; di <= 2; di++) {
        for (let dj = -2; dj <= 2; dj++) if (!Number.isNaN(ground[(cj + dj) * cols + ci + di])) return true;
      }
      return false;
    };
    for (const p of [...map.spawns, ...map.seekerSpawns, ...passages.flatMap((q) => [q.from, q.to])]) {
      expect(reached(p), JSON.stringify(p)).toBe(true);
    }
    // Большая часть пола проходима: карта — не лабиринт тупиков.
    expect(queue.length * step * step).toBeGreaterThan(width * depth * 0.4);
  });
});
