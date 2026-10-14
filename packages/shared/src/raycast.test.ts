import { describe, expect, it } from 'vitest';
import { vec3 } from './math.js';
import { rayAabb, surfaceNormalAt } from './raycast.js';

const box = { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1 };

describe('rayAabb', () => {
  it('hits a box in front', () => {
    expect(rayAabb(vec3(0, 1, 5), vec3(0, 0, -1), box, 100)).toBeCloseTo(4);
  });

  it('misses a box to the side and a box behind', () => {
    expect(rayAabb(vec3(3, 1, 5), vec3(0, 0, -1), box, 100)).toBeNull();
    expect(rayAabb(vec3(0, 1, 5), vec3(0, 0, 1), box, 100)).toBeNull();
  });

  it('respects max distance', () => {
    expect(rayAabb(vec3(0, 1, 5), vec3(0, 0, -1), box, 3)).toBeNull();
  });

  it('hits diagonally from above', () => {
    const d = Math.SQRT1_2;
    expect(rayAabb(vec3(0, 5, 3), vec3(0, -d, -d), box, 100)).not.toBeNull();
  });

  it('returns 0 when the origin is inside', () => {
    expect(rayAabb(vec3(0, 1, 0), vec3(1, 0, 0), box, 100)).toBe(0);
  });
});

describe('surfaceNormalAt', () => {
  it('detects the face of a box the point lies on', () => {
    expect(surfaceNormalAt(vec3(1, 1, 0), [box])).toEqual({ x: 1, y: 0, z: 0 });
    expect(surfaceNormalAt(vec3(0, 2, 0.5), [box])).toEqual({ x: 0, y: 1, z: 0 });
    expect(surfaceNormalAt(vec3(0.2, 0.5, -1), [box])).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('falls back to the floor', () => {
    expect(surfaceNormalAt(vec3(5, 0, 5), [box])).toEqual({ x: 0, y: 1, z: 0 });
  });
});
