import { describe, expect, it } from 'vitest';
import { GAZE_RULES, gazePoints, isWatching, lookDirection, type GazeSeeker, type GazeTarget } from '../src/gaze.js';

/** Ищущий в (0, 0, 10) смотрит камерой на −Z (yaw 0), чуть вниз — как с камеры из-за спины. */
const seeker = (look: GazeSeeker['look'] = { yaw: 0, pitch: 0.1 }, extra: Partial<GazeSeeker> = {}): GazeSeeker => ({
  x: 0,
  y: 0,
  z: 10,
  crouching: false,
  pose: 'none',
  look,
  ...extra,
});
const hider = (x: number, z: number, extra: Partial<GazeTarget> = {}): GazeTarget => ({ x, y: 0, z, crouching: false, pose: 'none', ...extra });

describe('lookDirection', () => {
  it('matches the third-person camera: yaw 0 looks along −Z, positive pitch looks down', () => {
    const d = lookDirection({ yaw: 0, pitch: 0 });
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
    expect(lookDirection({ yaw: 0, pitch: 0.5 }).y).toBeLessThan(0);
    expect(lookDirection({ yaw: Math.PI / 2, pitch: 0 }).x).toBeCloseTo(-1);
  });
});

describe('isWatching', () => {
  it('a hider near the centre of the screen is watched', () => {
    expect(isWatching(seeker(), hider(0, 4), [])).toBe(true);
    // 6 м вперёд и 1 м вбок — около 9.5°, в конусе 15°.
    expect(isWatching(seeker(), hider(1, 4), [])).toBe(true);
  });

  it('off to the side, behind the seeker or too far away — not watched', () => {
    expect(isWatching(seeker(), hider(3, 4), [])).toBe(false); // ~27°
    expect(isWatching(seeker(), hider(0, 16), [])).toBe(false); // за спиной
    expect(isWatching(seeker(), hider(0, 10 - GAZE_RULES.range - 1), [])).toBe(false);
  });

  it('a wall between them blocks the gaze', () => {
    const wall = { minX: -3, maxX: 3, minY: 0, maxY: 3, minZ: 6.8, maxZ: 7.2 };
    expect(isWatching(seeker(), hider(0, 4), [wall])).toBe(false);
  });

  it('standing behind a waist-high table the hider is watched: shoulders and head are in view', () => {
    const table = { minX: -1, maxX: 1, minY: 0, maxY: 0.9, minZ: 4.4, maxZ: 5.6 };
    expect(isWatching(seeker(), hider(0, 4), [table])).toBe(true);
  });

  it('pressed against the far side of a wall the hider is not watched', () => {
    // Ближняя к ищущему грань стены — в 0.8 м от тела: это уже не «край, к которому прижался».
    const wall = { minX: -2, maxX: 2, minY: 0, maxY: 3, minZ: 4.36, maxZ: 4.8 };
    expect(isWatching(seeker(), hider(0, 4), [wall])).toBe(false);
  });

  it('without a look (old client, or not a seeker) nobody is watched', () => {
    expect(isWatching({ ...seeker(), look: undefined }, hider(0, 4), [])).toBe(false);
  });

  it('a hider lying flat is watched by a crouching seeker looking low', () => {
    const lying = hider(0, 4, { pose: 'flat' });
    expect(isWatching(seeker({ yaw: 0, pitch: 0.08 }, { crouching: true }), lying, [])).toBe(true);
    // Стоя и глядя вдаль поверх — лежащий ниже конуса.
    expect(isWatching(seeker({ yaw: 0, pitch: -0.3 }), lying, [])).toBe(false);
  });
});

describe('gazePoints', () => {
  it('one point per two seconds watched, capped per round', () => {
    expect(gazePoints(1999)).toBe(0);
    expect(gazePoints(2000)).toBe(1);
    expect(gazePoints(7900)).toBe(3);
    expect(gazePoints(10 * 60_000)).toBe(GAZE_RULES.maxPoints);
  });
});
