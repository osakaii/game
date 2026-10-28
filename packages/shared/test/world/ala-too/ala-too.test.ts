import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../../../src/math.js';
import { PHYSICS_DT, PLAYER, penetratesColliders, stepPlayer, supportHeight, type PlayerPhysicsState } from '../../../src/physics.js';
import { ALA_TOO, ALA_TOO_PASSAGES } from '../../../src/world/ala-too/ala-too.js';
import { buildColliders, mapBoxes } from '../../../src/world/map.js';

const colliders = buildColliders(ALA_TOO);
/** Земля под точкой, на которую можно встать шагом с высоты from. */
const groundFrom = (x: number, z: number, from: number) => supportHeight(vec3(x, from + PLAYER.stepHeight, z), colliders);

describe('Ala-Too map data', () => {
  it('keeps every visible block inside the 108 × 180 m square', () => {
    expect(ALA_TOO.width).toBe(108);
    expect(ALA_TOO.depth).toBe(180);
    for (const b of mapBoxes(ALA_TOO).filter((box) => !box.hidden)) {
      expect(Math.abs(b.x) + b.w / 2, JSON.stringify(b)).toBeLessThanOrEqual(54.5);
      expect(Math.abs(b.z) + b.d / 2, JSON.stringify(b)).toBeLessThanOrEqual(90.5);
      expect(b.y ?? 0).toBeGreaterThanOrEqual(-0.01);
    }
  });

  it('is closed by invisible no-climb walls well above any reachable roof', () => {
    const walls = ALA_TOO.boxes.filter((b) => b.hidden && b.noClimb && b.h >= 30 && Math.max(b.w, b.d) > 100);
    expect(walls).toHaveLength(4);
  });

  it('spawns stand on the plaza tiles, not on the lawn under them', () => {
    for (const s of [...ALA_TOO.spawns, ...ALA_TOO.seekerSpawns]) {
      expect(s.y).toBeCloseTo(0.21);
      expect(groundFrom(s.x, s.z, 0)).toBeCloseTo(s.y);
    }
  });
});

/**
 * Проходы плана проверяем НАШЕЙ физикой: идём шагом от начала к концу (ввод — к цели) и должны дойти.
 * Скамейка, под которой упираешься головой, или ступенька выше шага — и тест это поймает.
 */
describe('Ala-Too passages', () => {
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

  it('has all 14 passages of the plan and both routes', () => {
    expect(ALA_TOO_PASSAGES.filter((p) => p.id === 'under-seat')).toHaveLength(10);
    expect(ALA_TOO_PASSAGES.filter((p) => p.id === 'side-passage')).toHaveLength(2);
    expect(ALA_TOO_PASSAGES.filter((p) => p.id === 'corridor')).toHaveLength(2);
    expect(ALA_TOO_PASSAGES.map((p) => p.id)).toEqual(expect.arrayContaining(['fountain-bridges', 'museum-steps']));
  });

  it.each(ALA_TOO_PASSAGES.map((p, i) => [`${p.id} #${i}`, p] as const))('%s is walkable standing', (_name, p) => {
    const end = walk(p.from, p.to);
    expect(Math.hypot(end.position.x - p.to.x, end.position.z - p.to.z)).toBeLessThan(0.3);
    expect(end.position.y).toBeCloseTo(groundFrom(p.to.x, p.to.z, p.to.y), 1);
  });
});

/**
 * Связность: «заливка» по сетке 0.5 м с учётом высоты — в соседнюю клетку можно шагнуть, если земля там
 * не выше шага и цилиндр стоя ни во что не упирается. До всех спавнов, концов проходов и цоколя музея
 * должно быть можно дойти от первой точки появления.
 */
describe('Ala-Too connectivity', () => {
  const step = 0.5;
  const cols = Math.floor(ALA_TOO.width / step);
  const rows = Math.floor(ALA_TOO.depth / step);
  const cellOf = (p: Vec3) => [Math.floor((p.x + ALA_TOO.width / 2) / step), Math.floor((p.z + ALA_TOO.depth / 2) / step)] as const;
  const center = (i: number, j: number) => [-ALA_TOO.width / 2 + (i + 0.5) * step, -ALA_TOO.depth / 2 + (j + 0.5) * step] as const;
  const ground = new Float32Array(cols * rows).fill(NaN);

  const [si, sj] = cellOf(ALA_TOO.spawns[0]);
  ground[sj * cols + si] = ALA_TOO.spawns[0].y;
  const queue = [sj * cols + si];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    const i = k % cols;
    const j = (k - i) / cols;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      const nk = nj * cols + ni;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || !Number.isNaN(ground[nk])) continue;
      const [x, z] = center(ni, nj);
      const y = groundFrom(x, z, ground[k]);
      if (penetratesColliders(vec3(x, y, z), colliders, 0.02)) continue;
      ground[nk] = y;
      queue.push(nk);
    }
  }
  const reached = (p: Vec3) => {
    // Точка может быть у самого края препятствия — достаточно достижимой клетки в радиусе 1 м.
    const [ci, cj] = cellOf(p);
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) if (!Number.isNaN(ground[(cj + dj) * cols + ci + di])) return true;
    }
    return false;
  };

  it('a large part of the square is walkable', () => {
    expect(queue.length * step * step).toBeGreaterThan(9000);
  });

  it('reaches every spawn and passage end', () => {
    for (const p of [...ALA_TOO.spawns, ...ALA_TOO.seekerSpawns, ...ALA_TOO_PASSAGES.flatMap((q) => [q.from, q.to])]) {
      expect(reached(p), JSON.stringify(p)).toBe(true);
    }
  });

  it('reaches the museum terrace by its stairs', () => {
    const [i, j] = cellOf(vec3(0, 0, (-25 + 6 + 4.9) * 3));
    expect(ground[j * cols + i]).toBeCloseTo(2.16, 1);
  });
});
