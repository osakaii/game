import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../../../src/math.js';
import { PHYSICS_DT, PLAYER, penetratesColliders, stepPlayer, supportHeight, type PlayerPhysicsState } from '../../../src/physics.js';
import { SUPERMARKET, SUPERMARKET_PASSAGES } from '../../../src/world/supermarket/supermarket.js';
import { buildColliders, mapBoxes } from '../../../src/world/map.js';

const colliders = buildColliders(SUPERMARKET);
const groundFrom = (x: number, z: number, from: number) => supportHeight(vec3(x, from + PLAYER.stepHeight, z), colliders);

describe('Supermarket map data', () => {
  it('is 84 × 72 m under a 12.4 m ceiling, and every visible block is inside', () => {
    expect(SUPERMARKET.width).toBe(84);
    expect(SUPERMARKET.depth).toBe(72);
    expect(SUPERMARKET.ceiling?.height).toBeCloseTo(12.42);
    for (const b of mapBoxes(SUPERMARKET).filter((box) => !box.hidden)) {
      expect(Math.abs(b.x) + b.w / 2, JSON.stringify(b)).toBeLessThanOrEqual(42.01);
      expect(Math.abs(b.z) + b.d / 2, JSON.stringify(b)).toBeLessThanOrEqual(36.01);
      expect((b.y ?? 0) + b.h).toBeLessThanOrEqual(12.7);
    }
  });

  it('has a physical ceiling: a jump from the top of a gondola hits it, not the sky', () => {
    const ceiling = colliders.find((c) => c.minY >= 12 && c.maxX - c.minX > 80);
    expect(ceiling?.minY).toBeCloseTo(12.42);
  });

  it('stays within the block budget of the package (≈1900 blocks)', () => {
    // Пакет: 1899 видимых + 479 коллайдеров. У нас видимый блок сам себе коллайдер — блоков меньше.
    expect(mapBoxes(SUPERMARKET).length).toBeLessThan(2000);
  });

  it('spawns stand on the floor', () => {
    for (const s of [...SUPERMARKET.spawns, ...SUPERMARKET.seekerSpawns]) {
      expect(groundFrom(s.x, s.z, 0)).toBe(0);
      expect(penetratesColliders(s, colliders, 0)).toBe(false);
    }
  });
});

/**
 * Проходы под стеллажами, овощным столом, кассами и тележками, маршруты зала и двери склада —
 * НАШЕЙ физикой: идём шагом к цели стоя и должны дойти.
 */
describe('Supermarket passages', () => {
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

  it('has the 12 under-furniture passages of the package and 6 routes', () => {
    const under = SUPERMARKET_PASSAGES.filter((p) => p.id.startsWith('under-'));
    expect(under).toHaveLength(12);
    expect(SUPERMARKET_PASSAGES).toHaveLength(18);
  });

  it.each(SUPERMARKET_PASSAGES.map((p, i) => [`${p.id} #${i}`, p] as const))('%s is walkable standing', (_name, p) => {
    const end = walk(p.from, p.to);
    expect(Math.hypot(end.position.x - p.to.x, end.position.z - p.to.z)).toBeLessThan(0.3);
  });
});

/** Связность: из торгового зала шагом можно дойти до каждой точки появления и до склада. */
describe('Supermarket connectivity', () => {
  const step = 0.5;
  const cols = Math.floor(SUPERMARKET.width / step);
  const rows = Math.floor(SUPERMARKET.depth / step);
  const cellOf = (p: Vec3) => [Math.floor((p.x + SUPERMARKET.width / 2) / step), Math.floor((p.z + SUPERMARKET.depth / 2) / step)] as const;
  const center = (i: number, j: number) => [-SUPERMARKET.width / 2 + (i + 0.5) * step, -SUPERMARKET.depth / 2 + (j + 0.5) * step] as const;
  const ground = new Float32Array(cols * rows).fill(NaN);
  const [si, sj] = cellOf(SUPERMARKET.seekerSpawns[0]!);
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
      const [x, z] = center(ni, nj);
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

  it('reaches every spawn, both stock doors and the whole warehouse', () => {
    for (const p of [...SUPERMARKET.spawns, ...SUPERMARKET.seekerSpawns, ...SUPERMARKET_PASSAGES.flatMap((q) => [q.from, q.to])]) {
      expect(reached(p), JSON.stringify(p)).toBe(true);
    }
  });

  it('most of the floor is walkable: the store is not a maze of dead ends', () => {
    expect(queue.length * step * step).toBeGreaterThan(84 * 72 * 0.5);
  });
});
