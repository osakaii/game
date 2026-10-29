import { describe, expect, it } from 'vitest';
import { canPaint } from '../src/game.js';

describe('painting rules', () => {
  it('allows painting in lobby and for unfound hiders during the round', () => {
    expect(canPaint('lobby', null)).toBe(true);
    expect(canPaint('hiding', 'hider')).toBe(true);
    expect(canPaint('hiding', 'seeker')).toBe(false);
    expect(canPaint('seeking', 'hider')).toBe(true);
    expect(canPaint('seeking', 'hider', true)).toBe(false);
    expect(canPaint('seeking', 'seeker')).toBe(false);
    expect(canPaint('results', 'hider')).toBe(false);
  });
});
