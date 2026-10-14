import { describe, expect, it } from 'vitest';
import { PLAYROOM, buildColliders, type PlayerState } from '@mecha/shared';
import { checkAirborne, type AirState } from '../../src/movement/air-check';

const colliders = buildColliders(PLAYROOM);
const at = (x: number, y: number, z: number): PlayerState => ({ x, y, z, yaw: 0, grounded: y === 0, crouching: false });
const fresh = (): AirState => ({ since: null, takeoffY: 0 });

describe('checkAirborne', () => {
  it('accepts an honest jump arc', () => {
    const air = fresh();
    const arc = [0, 0.5, 1.0, 1.25, 1.0, 0.5, 0];
    arc.forEach((y, i) => expect(checkAirborne(air, at(0, y, 6), colliders, i * 100).ok).toBe(true));
    expect(air.since).toBeNull();
  });

  it('rejects hovering in the air', () => {
    const air = fresh();
    expect(checkAirborne(air, at(0, 1, 6), colliders, 0).ok).toBe(true);
    expect(checkAirborne(air, at(0, 1, 6), colliders, 1500).ok).toBe(true);
    expect(checkAirborne(air, at(0, 1, 6), colliders, 2100).ok).toBe(false);
  });

  it('rejects flying above jump height', () => {
    const air = fresh();
    expect(checkAirborne(air, at(0, 2.2, 6), colliders, 100).ok).toBe(false);
  });

  it('measures the jump from the crate, not from the floor', () => {
    const air = fresh();
    checkAirborne(air, at(-8.5, 1, -12), colliders, 0); // стоит на ящике высотой 1 м
    expect(checkAirborne(air, at(-8.5, 2.2, -12), colliders, 300).ok).toBe(true);
  });
});
