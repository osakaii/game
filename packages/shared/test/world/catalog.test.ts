import { describe, expect, it } from 'vitest';
import { MAP_CHOICES, MAP_IDS, MAP_INFO, loadMap } from '../../src/world/catalog.js';
import { MAPS } from '../../src/world/maps.js';

describe('map catalog', () => {
  it.each(MAP_IDS)('describes %s exactly like the map itself (name, seek time)', (id) => {
    expect(MAP_INFO[id]).toEqual({ name: MAPS[id].name, ...(MAPS[id].seekSeconds ? { seekSeconds: MAPS[id].seekSeconds } : {}) });
  });

  it('loads a map on demand, once, as the same object the server uses', async () => {
    const first = loadMap('restaurant');
    expect(loadMap('restaurant')).toBe(first);
    expect(await first).toBe(MAPS.restaurant);
  });

  it('offers every playable map, the default first', () => {
    expect(MAP_CHOICES[0]).toBe('ala-too');
    expect(MAP_CHOICES).toEqual(['ala-too', 'apartment', 'supermarket', 'restaurant', 'courtyard', 'castle']);
  });
});
