import { describe, expect, it } from 'vitest';
import { PLAYROOM, buildColliders, vec3 } from '@mecha/shared';
import { resolveShot } from '../../src/game/shot';

const colliders = buildColliders(PLAYROOM);

describe('resolveShot', () => {
  it('hits a hider in the open', () => {
    const hit = resolveShot(vec3(0, 1, 10), vec3(0, 0, -1), colliders, [{ id: 'h', position: vec3(0, 0, 6) }], 40);
    expect(hit?.playerId).toBe('h');
    expect(hit?.t).toBeCloseTo(10 - 6 - 0.43, 1);
  });

  it('does not hit a hider behind the pillar', () => {
    // Колонна 1x1 в (0,0). Прячущийся за ней по оси луча.
    const hit = resolveShot(vec3(0, 1, 6), vec3(0, 0, -1), colliders, [{ id: 'h', position: vec3(0, 0, -2) }], 40);
    expect(hit?.playerId).toBeNull();
    expect(hit?.t).toBeCloseTo(5.5, 2);
  });

  it('hits the floor when aiming down', () => {
    const d = Math.SQRT1_2;
    const hit = resolveShot(vec3(0, 2, 8), vec3(0, -d, -d), colliders, [], 40);
    expect(hit?.playerId).toBeNull();
    expect(hit?.t).toBeCloseTo(2 / d, 2);
  });
});
