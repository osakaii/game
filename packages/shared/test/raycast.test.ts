import { describe, expect, it } from 'vitest';
import { vec3 } from '../src/math.js';
import { rayAabb, rayHitsBody, surfaceNormalAt } from '../src/raycast.js';
import { BODY_HITBOXES } from '../src/pose-hitboxes.js';

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

describe('rayHitsBody', () => {
  const at = vec3(0, 0, 0);
  const down = vec3(0, -1, 0);
  const center = (box: readonly number[]) => ({ x: (box[0] + box[3]) / 2, y: (box[1] + box[4]) / 2, z: (box[2] + box[5]) / 2 });

  it('hits a standing player in the chest, misses beside the head', () => {
    const stand = { crouching: false };
    expect(rayHitsBody(vec3(0, 1, 5), vec3(0, 0, -1), at, 0, stand, 100)).not.toBeNull();
    expect(rayHitsBody(vec3(0.45, 1.5, 5), vec3(0, 0, -1), at, 0, stand, 100)).toBeNull();
  });

  it('a lying body is long and low: feet are hit, the air above the back is not', () => {
    const flat = { crouching: false, pose: 'flat' as const };
    const feet = center(BODY_HITBOXES.flat[10]); // footLeft
    expect(rayHitsBody(vec3(feet.x, 3, feet.z), down, at, 0, flat, 100)).not.toBeNull();
    // Над спиной на высоте 0.7 м — мимо (стоящего задело бы).
    expect(rayHitsBody(vec3(0, 0.7, 5), vec3(0, 0, -1), at, 0, flat, 100)).toBeNull();
    expect(rayHitsBody(vec3(0, 0.7, 5), vec3(0, 0, -1), at, 0, { crouching: false }, 100)).not.toBeNull();
  });

  it('turns the body with yaw: lying along X instead of Z', () => {
    const flat = { crouching: false, pose: 'flat' as const };
    const feet = center(BODY_HITBOXES.flat[10]);
    // Повернулся на 90°: то, что было «сзади» по Z, теперь «слева» по X (Ry: x' = z·sin).
    const yaw = Math.PI / 2;
    const worldX = feet.x * Math.cos(yaw) + feet.z * Math.sin(yaw);
    const worldZ = -feet.x * Math.sin(yaw) + feet.z * Math.cos(yaw);
    expect(rayHitsBody(vec3(worldX, 3, worldZ), down, at, yaw, flat, 100)).not.toBeNull();
    expect(rayHitsBody(vec3(feet.x, 3, feet.z), down, at, yaw, flat, 100)).toBeNull();
  });

  it('raised hands are part of the body', () => {
    const hand = center(BODY_HITBOXES.handsUp[4]); // handLeft
    expect(hand.y).toBeGreaterThan(1.3);
    expect(rayHitsBody(vec3(hand.x, hand.y, 5), vec3(0, 0, -1), at, 0, { crouching: false, pose: 'handsUp' }, 100)).not.toBeNull();
  });
});
