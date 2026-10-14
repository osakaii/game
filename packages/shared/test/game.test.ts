import { describe, expect, it } from 'vitest';
import { canMove, resolveSeekerCount, seekerCount } from '../src/game.js';

describe('game rules', () => {
  it('scales seekers with player count', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(seekerCount)).toEqual([1, 1, 1, 1, 2, 2, 2]);
  });

  it('freezes only seekers during hiding', () => {
    expect(canMove('hiding', 'seeker')).toBe(false);
    expect(canMove('hiding', 'hider')).toBe(true);
    expect(canMove('seeking', 'seeker')).toBe(true);
    expect(canMove('lobby', null)).toBe(true);
  });
});

describe('resolveSeekerCount', () => {
  it('uses auto rule or the host setting, always leaving a hider', () => {
    expect(resolveSeekerCount(6, 'auto')).toBe(2);
    expect(resolveSeekerCount(6, 3)).toBe(3);
    expect(resolveSeekerCount(2, 3)).toBe(1);
    expect(resolveSeekerCount(3, 2)).toBe(2);
  });
});
