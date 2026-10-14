import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../src/math.js';
import { PHYSICS_DT, PLAYER, penetratesColliders, stepPlayer, supportHeight, type PlayerPhysicsState } from '../src/physics.js';
import { buildColliders } from '../src/world/map.js';
import { PLAYROOM } from '../src/world/playroom.js';

const colliders = buildColliders(PLAYROOM);

/** Прогоняет физику `seconds` секунд с постоянным вводом. jumpAtTick — номер шага, на котором нажат прыжок. */
function simulate(
  start: Vec3,
  dirX: number,
  dirZ: number,
  seconds: number,
  jumpAtTick = -1,
  crouch = false,
  state: PlayerPhysicsState = { position: { ...start }, velocity: vec3(), grounded: true, crouching: false },
): PlayerPhysicsState {
  const ticks = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < ticks; i++) {
    stepPlayer(state, { dirX, dirZ, jump: i === jumpAtTick, crouch }, colliders, PHYSICS_DT);
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

describe('crouching', () => {
  it('lets the player crawl under the table, slowly', () => {
    // Стол в Детской: центр (3, -8), 3.4 x 2, столешница на 0.95..1.1 м.
    const s = simulate(vec3(3, 0, -11), 0, 1, 1.2, -1, true);
    expect(s.crouching).toBe(true);
    expect(s.position.z).toBeGreaterThan(-9);
    expect(s.position.z).toBeLessThan(-11 + PLAYER.crouchSpeed * 1.2 + 0.01);
  });

  it('cannot stand up under the table, stands up once out', () => {
    const under = simulate(vec3(3, 0, -11), 0, 1, 1.4, -1, true);
    const stillUnder = simulate(under.position, 0, 0, 0.5, -1, false, under);
    expect(stillUnder.crouching).toBe(true);

    const out = simulate(stillUnder.position, 0, -1, 2, -1, false, stillUnder);
    expect(out.crouching).toBe(false);
  });

  it('cannot jump while crouching', () => {
    const s = simulate(vec3(0, 0, 6), 0, 0, 0.3, 2, true);
    expect(s.position.y).toBe(0);
  });
});

describe('supportHeight', () => {
  it('finds the crate under a player standing on its edge', () => {
    // Ящик 1.5x1.5 с центром (-8.5, -12), верх на 1 м. Центр игрока чуть за краем.
    expect(supportHeight(vec3(-7.6, 1, -12), colliders)).toBeCloseTo(1);
  });

  it('is the floor for a player in mid-air over open space', () => {
    expect(supportHeight(vec3(0, 1.2, 6), colliders)).toBe(0);
  });
});
