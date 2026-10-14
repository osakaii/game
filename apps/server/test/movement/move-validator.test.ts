import { describe, expect, it } from 'vitest';
import { PLAYER, PLAYROOM, buildColliders, type PlayerState } from '@mecha/shared';
import { validateMove } from '../../src/movement/move-validator';

const colliders = buildColliders(PLAYROOM);
const at = (x: number, y: number, z: number, crouching = false): PlayerState => ({
  x,
  y,
  z,
  yaw: 0,
  grounded: true,
  crouching,
});
const check = (prev: PlayerState, next: PlayerState, ms: number) =>
  validateMove(prev, next, ms, PLAYROOM, colliders).ok;

describe('validateMove', () => {
  it('accepts normal walking', () => {
    expect(check(at(0, 0, 6), at(PLAYER.walkSpeed * 0.05, 0, 6), 50)).toBe(true);
  });

  it('accepts a burst of packets that arrived together (network jitter)', () => {
    expect(check(at(0, 0, 6), at(0.25, 0, 6), 2)).toBe(true);
  });

  it('rejects speed hacks', () => {
    expect(check(at(0, 0, 6), at(3, 0, 6), 100)).toBe(false);
  });

  it('rejects teleport after a long pause', () => {
    expect(check(at(0, 0, 6), at(0, 0, -10), 10_000)).toBe(false);
  });

  it('rejects walking into a wall or out of the map', () => {
    expect(check(at(-0.9, 0, 0), at(0, 0, 0), 1000)).toBe(false);
    expect(check(at(14.6, 0, 0), at(15.5, 0, 0), 1000)).toBe(false);
  });

  it('accepts jumping onto a crate', () => {
    expect(check(at(-8.5, 0.9, -10.5), at(-8.5, 1, -11), 100)).toBe(true);
  });

  it('rejects flying straight up', () => {
    expect(check(at(0, 0, 6), at(0, 5, 6), 100)).toBe(false);
  });

  it('allows crouching under the table but not standing inside it', () => {
    expect(check(at(3, 0, -9.4, true), at(3, 0, -9, true), 200)).toBe(true);
    expect(check(at(3, 0, -9.4, true), at(3, 0, -9, false), 200)).toBe(false);
  });
});
