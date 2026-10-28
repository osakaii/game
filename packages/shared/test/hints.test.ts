import { describe, expect, it } from 'vitest';
import { hintSchedule } from '../src/hints.js';
import { DEFAULT_SETTINGS, SEEK_SECONDS_OPTIONS } from '../src/settings.js';

describe('hintSchedule', () => {
  it('starts at half time, every 30 s, every 15 s in the last minute', () => {
    expect(hintSchedule(240)).toEqual([120, 150, 180, 195, 210, 225]);
    expect(hintSchedule(150)).toEqual([75, 105, 120, 135]);
    expect(hintSchedule(90)).toEqual([45, 60, 75]);
  });

  it('never whistles before half time or after the round is over', () => {
    for (const seconds of SEEK_SECONDS_OPTIONS) {
      for (const t of hintSchedule(seconds)) {
        expect(t).toBeGreaterThanOrEqual(seconds / 2);
        expect(t).toBeLessThan(seconds);
      }
    }
  });

  it('is on by default', () => {
    expect(DEFAULT_SETTINGS.hints).toBe(true);
  });
});
