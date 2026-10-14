import { describe, expect, it } from 'vitest';
import { canPaint } from '../src/game.js';

describe('painting rules', () => {
  it('allows painting in lobby and for hiders while hiding only', () => {
    expect(canPaint('lobby', null)).toBe(true);
    expect(canPaint('hiding', 'hider')).toBe(true);
    expect(canPaint('hiding', 'seeker')).toBe(false);
    expect(canPaint('seeking', 'hider')).toBe(false);
  });
});
