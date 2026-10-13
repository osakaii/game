import { describe, expect, it } from 'vitest';
import { PaintSchema, defaultBodyColors } from './body.js';
import { canPaint } from './game.js';

describe('painting rules', () => {
  it('normalizes color to lower case', () => {
    expect(PaintSchema.parse({ zones: ['head'], color: '#AABBCC' }).color).toBe('#aabbcc');
  });

  it('rejects unknown zones and bad colors', () => {
    expect(PaintSchema.safeParse({ zones: ['tail'], color: '#aabbcc' }).success).toBe(false);
    expect(PaintSchema.safeParse({ zones: ['head'], color: 'red' }).success).toBe(false);
    expect(PaintSchema.safeParse({ zones: [], color: '#aabbcc' }).success).toBe(false);
  });

  it('allows painting in lobby and for hiders while hiding only', () => {
    expect(canPaint('lobby', null)).toBe(true);
    expect(canPaint('hiding', 'hider')).toBe(true);
    expect(canPaint('hiding', 'seeker')).toBe(false);
    expect(canPaint('seeking', 'hider')).toBe(false);
  });

  it('default colors cover every zone', () => {
    expect(Object.keys(defaultBodyColors())).toHaveLength(6);
  });
});
