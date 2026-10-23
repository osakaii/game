import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../src/math.js';
import {
  PHYSICS_DT,
  PLAYER,
  STAMINA,
  bodyHeight,
  keepBodyOutOfWalls,
  penetratesColliders,
  stepPlayer,
  supportHeight,
  type PlayerPhysicsState,
} from '../src/physics.js';
import { BODY_HITBOXES } from '../src/pose-hitboxes.js';
import { POSE_RULES, type Pose } from '../src/poses.js';
import { buildColliders, type Aabb } from '../src/world/map.js';
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
  state: PlayerPhysicsState = { position: { ...start }, velocity: vec3(), grounded: true, crouching: false, pose: 'none' },
  pose: Pose = 'none',
): PlayerPhysicsState {
  const ticks = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < ticks; i++) {
    stepPlayer(state, { dirX, dirZ, jump: i === jumpAtTick, crouch, pose }, colliders, PHYSICS_DT);
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

  it('brushing past a crate at an angle does not start a climb', () => {
    // Идём под углом 45° к грани ящика: «в стену» только 0.7 — меньше порога, лезть не начинаем.
    const s = simulate(vec3(-6.6, 0, -5.4), 0.7071, 0.7071, 0.6);
    expect(s.position.y).toBe(0);
    expect(s.climbing).toBeFalsy();
  });

  it('climbs onto a 1 m crate when pushing straight into it', () => {
    // Жёлтый ящик 1.5×1×1.5 в (−8.5, −12): крышка свободна (на соседнем красном стоит ещё один — туда не залезть).
    const s: PlayerPhysicsState = { position: vec3(-8.5, 0, -9.5), velocity: vec3(), grounded: true, crouching: false, pose: 'none' };
    // Шагаем, пока не окажемся на крышке (дальше игрок пошёл бы по ящику и спрыгнул).
    for (let i = 0; i < 180 && !(s.grounded && s.position.y > 0.9); i++) {
      stepPlayer(s, { dirX: 0, dirZ: -1, jump: false, crouch: false }, colliders, PHYSICS_DT);
    }
    expect(s.position.y).toBeCloseTo(1, 2);
    expect(s.grounded).toBe(true);
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

describe('sprinting', () => {
  /** Чистое поле без стен: бег не упирается в стену и не превращается в лазание. */
  const fresh = (): PlayerPhysicsState => ({ position: vec3(0, 0, 0), velocity: vec3(), grounded: true, crouching: false, pose: 'none' });
  const run = (state: PlayerPhysicsState, seconds: number, sprint: boolean, extra: { crouch?: boolean; pose?: Pose; dirX?: number } = {}) => {
    const ticks = Math.round(seconds / PHYSICS_DT);
    for (let i = 0; i < ticks; i++) {
      stepPlayer(state, { dirX: extra.dirX ?? 1, dirZ: 0, jump: false, crouch: !!extra.crouch, pose: extra.pose ?? 'none', sprint }, [], PHYSICS_DT);
    }
    return state;
  };
  const speed = (s: PlayerPhysicsState) => Math.hypot(s.velocity.x, s.velocity.z);

  it('runs at sprint speed while stamina lasts, then walks', () => {
    const s = run(fresh(), 1, true);
    expect(speed(s)).toBeCloseTo(PLAYER.sprintSpeed, 1);
    expect(s.sprinting).toBe(true);
    run(s, STAMINA.sprintSeconds, true);
    expect(s.stamina).toBe(0);
    expect(s.sprinting).toBe(false);
    expect(speed(s)).toBeCloseTo(PLAYER.walkSpeed, 1);
  });

  it('rests before refilling, then can sprint again once a little is back', () => {
    // Ровно до момента, когда силы кончились (дальше и с зажатым бегом идёт шагом — это уже отдых).
    const s = run(fresh(), STAMINA.sprintSeconds + PHYSICS_DT, true);
    expect(s.stamina).toBe(0);
    run(s, STAMINA.restDelay * 0.8, false);
    expect(s.stamina).toBe(0); // ещё отдышивается
    run(s, STAMINA.restDelay * 0.2 + STAMINA.refillSeconds * STAMINA.minToStart + 0.05, false);
    run(s, PHYSICS_DT, true);
    expect(s.sprinting).toBe(true);
    run(s, STAMINA.refillSeconds * 2, false);
    expect(s.stamina).toBe(1);
  });

  it('no sprint while crouching, in a pose or barely touching the stick', () => {
    expect(run(fresh(), 0.5, true, { crouch: true }).sprinting).toBe(false);
    expect(run(fresh(), 0.5, true, { pose: 'flat' }).sprinting).toBe(false);
    expect(run(fresh(), 0.5, true, { dirX: 0.3 }).sprinting).toBe(false);
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

describe('poses', () => {
  const fresh = (x: number, z: number): PlayerPhysicsState => ({
    position: vec3(x, 0, z),
    velocity: vec3(),
    grounded: true,
    crouching: false,
    pose: 'none',
  });

  it('crawls flat under the table, at crawling speed', () => {
    const s = simulate(vec3(3, 0, -11), 0, 1, 2, -1, false, fresh(3, -11), 'flat');
    expect(s.pose).toBe('flat');
    expect(bodyHeight(s)).toBe(POSE_RULES.flat.height);
    expect(s.position.z).toBeGreaterThan(-9.5); // уже под столешницей
    expect(s.position.z).toBeLessThan(-11 + POSE_RULES.flat.speed * 2 + 0.01);
  });

  it('cannot get up under the table, gets up once out', () => {
    const under = simulate(vec3(3, 0, -11), 0, 1, 2.5, -1, false, fresh(3, -11), 'flat');
    const stuck = simulate(under.position, 0, 0, 0.3, -1, false, under, 'none');
    expect(stuck.pose).toBe('flat');
    const out = simulate(stuck.position, 0, -1, 4, -1, false, stuck, 'none');
    expect(out.pose).toBe('none');
  });

  it('a standing-still pose freezes in place and walking ends it', () => {
    const s = simulate(vec3(0, 0, 6), 1, 0, 0.3); // разбежался
    simulate(s.position, 0, 0, 0.1, -1, false, s, 'statue');
    expect(s.pose).toBe('statue');
    expect(Math.hypot(s.velocity.x, s.velocity.z)).toBe(0); // замер сразу, без скольжения
    simulate(s.position, 1, 0, 0.1, -1, false, s, 'statue');
    expect(s.pose).toBe('none');
  });

  it('jumping ends any pose and works on the same press', () => {
    const s = simulate(vec3(0, 0, 6), 0, 0, 0.1, -1, false, fresh(0, 6), 'crawl');
    expect(s.pose).toBe('crawl');
    simulate(s.position, 0, 0, 0.1, 0, false, s, 'crawl');
    expect(s.pose).toBe('none');
    expect(s.position.y).toBeGreaterThan(0);
  });

  it('cannot strike a pose in mid-air', () => {
    const s = simulate(vec3(0, 0, 6), 0, 0, 0.1, 0);
    simulate(s.position, 0, 0, 0.05, -1, false, s, 'sit');
    expect(s.grounded).toBe(false);
    expect(s.pose).toBe('none');
  });
});

describe('climbing', () => {
  // Стена 1×4×6 м посреди пустоты, потолка нет.
  const wall: Aabb[] = [{ minX: -0.5, maxX: 0.5, minY: 0, maxY: 4, minZ: -3, maxZ: 3 }];
  const at = (x: number): PlayerPhysicsState => ({
    position: vec3(x, 0, 0),
    velocity: vec3(),
    grounded: true,
    crouching: false,
    pose: 'none',
  });
  const run = (s: PlayerPhysicsState, dirX: number, seconds: number, jumpAtTick = -1, colliders = wall) => {
    for (let i = 0; i < Math.round(seconds / PHYSICS_DT); i++) {
      stepPlayer(s, { dirX, dirZ: 0, jump: i === jumpAtTick, crouch: false }, colliders, PHYSICS_DT);
    }
    return s;
  };

  it('climbs up while pushing into the wall, at climbing speed', () => {
    const s = run(at(2), -1, 1.2); // подбежали и лезем
    expect(s.climbing).toBe(true);
    expect(s.position.y).toBeGreaterThan(0.5);
    expect(s.position.y).toBeLessThan(PLAYER.climbSpeed * 1.2);
    expect(s.wallNormal?.x).toBeCloseTo(1, 6); // стена слева — нормаль смотрит на игрока, в +X
  });

  it('hangs in place when the stick is released — a hiding spot high on the wall', () => {
    const s = run(at(2), -1, 1.2);
    const y = s.position.y;
    run(s, 0, 2);
    expect(s.climbing).toBe(true);
    expect(s.position.y).toBeCloseTo(y, 6);
  });

  it('lets go when pulling away, and jumps off the wall', () => {
    const s = run(at(2), -1, 1.2);
    run(s, 1, 0.3);
    expect(s.climbing).toBe(false);

    const t = run(at(2), -1, 1.2);
    run(t, 0, 0.05, 0);
    expect(t.climbing).toBe(false);
    expect(t.velocity.x).toBeGreaterThan(0); // оттолкнулся от стены
  });

  it('mantles onto the top of what it climbed', () => {
    const s = at(2);
    for (let i = 0; i < 300 && !(s.grounded && s.position.y > 3.9); i++) run(s, -1, PHYSICS_DT);
    expect(s.position.y).toBeCloseTo(4, 2);
    expect(s.grounded).toBe(true);
    expect(s.position.x).toBeLessThan(0.5); // стоит на стене сверху
  });

  it('the ceiling stops the climb — hanging under it instead of going through', () => {
    const ceiling = { minX: -10, maxX: 10, minY: 3, maxY: 4, minZ: -10, maxZ: 10 };
    const s = run(at(2), -1, 4, -1, [{ ...wall[0], maxY: 3 }, ceiling]);
    expect(s.position.y + PLAYER.height).toBeLessThanOrEqual(3 + 1e-6);
    expect(s.climbing).toBe(true);
  });

  it('cannot climb walls marked noClimb (outer walls of open maps)', () => {
    const s = run(at(2), -1, 2, -1, [{ ...wall[0], noClimb: true }]);
    expect(s.position.y).toBe(0);
  });
});

describe('keepBodyOutOfWalls', () => {
  const lying = (z: number): PlayerPhysicsState => ({
    position: vec3(0, 0, z),
    velocity: vec3(),
    grounded: true,
    crouching: false,
    pose: 'flat',
  });
  const head = Math.max(...BODY_HITBOXES.flat.map((b) => b[5]));
  const wall = PLAYROOM.depth / 2; // стена по периметру начинается здесь

  it('pulls a lying player back when the head went into the wall', () => {
    const s = lying(wall - PLAYER.radius); // цилиндр у стены, голова — внутри неё
    keepBodyOutOfWalls(s, 0, colliders); // смотрит на +Z, в стену
    expect(s.position.z + head).toBeLessThanOrEqual(wall + 0.07);
  });

  it('lying sideways along the wall is fine — nothing moves', () => {
    const s = lying(wall - PLAYER.radius);
    keepBodyOutOfWalls(s, Math.PI / 2, colliders);
    expect(s.position.z).toBeCloseTo(wall - PLAYER.radius, 6);
  });

  it('does nothing when standing', () => {
    const s = { ...lying(wall - PLAYER.radius), pose: 'none' as const };
    keepBodyOutOfWalls(s, 0, colliders);
    expect(s.position.z).toBeCloseTo(wall - PLAYER.radius, 6);
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
