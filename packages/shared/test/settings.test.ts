import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, defaultSeekSeconds, patchSettings } from '../src/settings.js';

describe('per-map seek time', () => {
  it('the big square gets 4 minutes, other maps the common 2.5', () => {
    expect(DEFAULT_SETTINGS.mapId).toBe('ala-too');
    expect(DEFAULT_SETTINGS.seekSeconds).toBe(240);
    expect(defaultSeekSeconds('apartment')).toBe(150);
  });

  it('switching the map brings its seek time, unless the host set one in the same patch', () => {
    expect(patchSettings(DEFAULT_SETTINGS, { mapId: 'apartment' }).seekSeconds).toBe(150);
    expect(patchSettings(DEFAULT_SETTINGS, { mapId: 'apartment', seekSeconds: 90 }).seekSeconds).toBe(90);
  });

  it('other changes keep the time the host picked', () => {
    const custom = patchSettings(DEFAULT_SETTINGS, { seekSeconds: 90 });
    expect(patchSettings(custom, { hideSeconds: 40 }).seekSeconds).toBe(90);
    expect(patchSettings(custom, { mapId: 'ala-too' }).seekSeconds).toBe(90); // та же карта — не сброс
  });
});
