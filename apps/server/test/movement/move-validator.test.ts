import { describe, expect, it } from 'vitest';
import { PLAYER, POSE_RULES, buildColliders, type PlayerState, type Pose } from '@mecha/shared';
import { PLAYROOM } from '@mecha/shared/maps';
import { freshBudget, validateMove } from '../../src/movement/move-validator';

const colliders = buildColliders(PLAYROOM);
const at = (x: number, y: number, z: number, crouching = false, pose: Pose = 'none', sprinting = false): PlayerState => ({
  x,
  y,
  z,
  yaw: 0,
  grounded: true,
  crouching,
  pose,
  climbing: false,
  sprinting,
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

  it('accepts sprint speed only while sprinting', () => {
    // За полсекунды: на коротком интервале бег влез бы в постоянный запас на джиттер.
    const run = PLAYER.sprintSpeed * 0.5;
    expect(check(at(-2, 0, 6), at(-2 + run, 0, 6, false, 'none', true), 500)).toBe(true);
    expect(check(at(-2, 0, 6), at(-2 + run, 0, 6), 500)).toBe(false);
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

  it('allows lying flat under the table but not sitting up there', () => {
    expect(check(at(3, 0, -9, false, 'flat'), at(3, 0, -8.8, false, 'flat'), 300)).toBe(true);
    expect(check(at(3, 0, -9, false, 'flat'), at(3, 0, -8.8, false, 'sit'), 300)).toBe(false);
  });

  it('holds crawling to crawling speed', () => {
    const crawl = POSE_RULES.crawl.speed;
    expect(check(at(0, 0, 6, false, 'crawl'), at(crawl * 0.5, 0, 6, false, 'crawl'), 500)).toBe(true);
    expect(check(at(0, 0, 6, false, 'crawl'), at(PLAYER.walkSpeed * 0.5, 0, 6, false, 'crawl'), 500)).toBe(false);
  });

  it('a standing-still pose may not slide around', () => {
    expect(check(at(0, 0, 6, false, 'statue'), at(1.5, 0, 6, false, 'statue'), 500)).toBe(false);
    // Но переход «шёл → замер» между пакетами — честный.
    expect(check(at(0, 0, 6), at(PLAYER.walkSpeed * 0.05, 0, 6, false, 'statue'), 50)).toBe(true);
  });

  describe('distance budget across packets', () => {
    /** Серия пакетов «туда-сюда» по отрезку step м каждые intervalMs; номер первого отклонённого или -1. */
    const firstRejected = (step: number, intervalMs: number, packets: number, sprinting = false) => {
      const budget = freshBudget();
      let prev = at(0, 0, 6, false, 'none', sprinting);
      for (let i = 0; i < packets; i++) {
        const next = at(i % 2 === 0 ? step : 0, 0, 6, false, 'none', sprinting);
        if (!validateMove(prev, next, intervalMs, PLAYROOM, colliders, budget).ok) return i;
        prev = next;
      }
      return -1;
    };

    it('closes the old hole: the jitter allowance no longer stacks per packet', () => {
      // 0.4 м за 50 мс = 8 м/с «шагом». Раньше каждый пакет получал +0.35 м — проходило всегда.
      const rejectedAt = firstRejected(0.4, 50, 200);
      expect(rejectedAt).toBeGreaterThan(0);
      expect(rejectedAt * 0.05).toBeLessThan(5); // не дольше нескольких секунд накопленного запаса
    });

    it('an honest walker at 20 Hz is never refused, even with packets bunching up', () => {
      const budget = freshBudget();
      let prev = at(0, 0, 6);
      let x = 0;
      let dir = 1;
      for (let i = 0; i < 400; i++) {
        // Каждый пятый пакет «застрял», и следом за ним два пришли почти разом.
        const interval = i % 5 === 3 ? 120 : i % 5 === 4 ? 5 : 50;
        const step = PLAYER.walkSpeed * 0.05;
        x += dir * step;
        if (Math.abs(x) > 3) dir = -dir;
        const next = at(x, 0, 6);
        expect(validateMove(prev, next, interval, PLAYROOM, colliders, budget).ok).toBe(true);
        prev = next;
      }
    });

    it('sprinting packets get the sprint budget, walking ones do not', () => {
      expect(firstRejected(0.4, 50, 200, true)).toBe(-1);
    });
  });
});
