import { describe, expect, it } from 'vitest';
import { DAYTIMES, pickDaytime } from '../src/daytime.js';

describe('pickDaytime', () => {
  it('не повторяет прошлое время суток', () => {
    for (const previous of DAYTIMES) {
      for (let i = 0; i < 20; i++) expect(pickDaytime(previous, () => i / 20)).not.toBe(previous);
    }
  });

  it('выбирает из всех остальных', () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => pickDaytime('day', () => i / 30)));
    expect([...seen].sort()).toEqual(DAYTIMES.filter((d) => d !== 'day').sort());
  });

  it('random() = 1 не выходит за список', () => {
    expect(DAYTIMES).toContain(pickDaytime(null, () => 1));
  });
});
