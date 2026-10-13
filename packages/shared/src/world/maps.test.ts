import { describe, expect, it } from 'vitest';
import { penetratesColliders } from '../physics.js';
import { buildColliders } from './map.js';
import { MAPS, MAP_IDS } from './maps.js';

/**
 * Проверки карт, которые легко сломать руками: точка появления внутри шкафа
 * означает, что игрок застрянет с первой секунды, а сервер будет откатывать каждое движение.
 */
describe.each(MAP_IDS)('map %s', (id) => {
  const map = MAPS[id];
  const colliders = buildColliders(map);

  it('has an id matching its registry key', () => {
    expect(map.id).toBe(id);
  });

  it('spawns are inside the map and not inside furniture', () => {
    for (const spawn of [...map.spawns, ...map.seekerSpawns]) {
      expect(Math.abs(spawn.x)).toBeLessThan(map.width / 2);
      expect(Math.abs(spawn.z)).toBeLessThan(map.depth / 2);
      expect(penetratesColliders(spawn, colliders, 0), `spawn ${JSON.stringify(spawn)}`).toBe(false);
    }
  });

  it('has enough spawns for a full room', () => {
    expect(map.spawns.length).toBeGreaterThanOrEqual(4);
    expect(map.seekerSpawns.length).toBeGreaterThanOrEqual(2);
  });
});
