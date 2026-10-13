import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from './math.js';
import { PHYSICS_DT, PLAYER, penetratesColliders, stepPlayer, type PlayerPhysicsState } from './physics.js';
import { buildColliders } from './world/map.js';
import { PLAYROOM } from './world/playroom.js';

const colliders = buildColliders(PLAYROOM);

/** Прогоняет физику `seconds` секунд с постоянным вводом. jumpAtTick — номер шага, на котором нажат прыжок. */
function simulate(start: Vec3, dirX: number, dirZ: number, seconds: number, jumpAtTick = -1): PlayerPhysicsState {
  const state: PlayerPhysicsState = { position: { ...start }, velocity: vec3(), grounded: true };
  const ticks = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < ticks; i++) {
    stepPlayer(state, { dirX, dirZ, jump: i === jumpAtTick }, colliders, PHYSICS_DT);
  }
  return state;
}

describe('stepPlayer on Playroom', () => {
  it('stops at the outer wall', () => {
    const s = simulate(vec3(10, 0, 12), 1, 0, 3);
    expect(s.position.x).toBeCloseTo(PLAYROOM.width / 2 - PLAYER.radius, 2);
  });

  it('walks up the stairs without jumping', () => {
    const s = simulate(vec3(6, 0, 2), 1, 0, 1.4);
    expect(s.position.y).toBeCloseTo(0.9, 2);
    expect(s.grounded).toBe(true);
  });

  it('is blocked by a 1 m crate without jumping', () => {
    const s = simulate(vec3(-6, 0, -6), 0, 1, 1.5);
    expect(s.position.y).toBe(0);
    expect(s.position.z).toBeCloseTo(-3.5 - PLAYER.radius, 2);
  });

  it('jumps onto a 1 m crate', () => {
    const s = simulate(vec3(-8.5, 0, -9.5), 0, -1, 0.65, 5);
    expect(s.position.y).toBeCloseTo(1, 2);
    expect(s.grounded).toBe(true);
  });

  it('cannot walk under a table lower than the player', () => {
    const s = simulate(vec3(3, 0, -11), 0, 1, 1.2);
    expect(s.position.z).toBeLessThan(-9);
  });

  it('stays grounded when idle', () => {
    const s = simulate(vec3(0, 0, 6), 0, 0, 1);
    expect(s.position).toEqual(vec3(0, 0, 6));
    expect(s.grounded).toBe(true);
  });
});

describe('penetratesColliders', () => {
  it('detects a player standing inside the pillar', () => {
    expect(penetratesColliders(vec3(0, 0, 0), colliders, 0.1)).toBe(true);
  });

  it('allows touching a wall and standing on top of a crate', () => {
    expect(penetratesColliders(vec3(-0.5 - PLAYER.radius, 0, 0), colliders, 0.1)).toBe(false);
    expect(penetratesColliders(vec3(-8.5, 1, -12), colliders, 0.1)).toBe(false);
  });
});
