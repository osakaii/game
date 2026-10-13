import { describe, expect, it } from 'vitest';
import { canMove, seekerCount } from './game.js';

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
