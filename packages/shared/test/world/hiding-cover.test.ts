import { describe, expect, it } from 'vitest';
import { scaleMap, type MapBox, type MapDef } from '../../src/world/map.js';
import { MAP_IDS } from '../../src/world/catalog.js';
import { MAPS } from '../../src/world/maps.js';
import { MAX_COVER, coverSpots, describeSpot } from './hiding-cover.js';

/**
 * Прятаться «в текстуре» нельзя ни на одной карте: в любой декорации (solid: false), в любой позе и
 * на любой опоре тело закрыто ею не больше чем на MAX_COVER. Новая карта или предмет попадают сюда
 * сами — через MAP_IDS: сквозную штору, воду или газон толще нормы тест не пропустит.
 */
describe.each(MAP_IDS)('map %s', (id) => {
  it(`no decoration hides more than ${MAX_COVER * 100}% of a body`, () => {
    expect(coverSpots(MAPS[id]).map(describeSpot)).toEqual([]);
  });
});

/** Сама проверка: ловит то, что должна, и не ругается на честное. */
describe('coverSpots', () => {
  const room = (decor: MapBox): MapDef => ({
    id: 'playroom',
    name: 'Проверка',
    width: 8,
    depth: 8,
    floorColor: '#ffffff',
    boxes: [decor],
    spawns: [],
    seekerSpawns: [],
  });
  const curtain = (d: number, solid: boolean): MapBox => ({ x: 0, z: 0, w: 1.5, h: 2.4, d, color: '#e07a5f', solid });

  it('catches a see-through curtain thick enough to stand in', () => {
    // Тело глубже шторы (0.46 м против 0.36) — из ткани торчат нос и пятки, остальное не видно.
    const [spot] = coverSpots(room(curtain(0.36, false)));
    expect(spot!.cover).toBeGreaterThan(0.6);
  });

  it('catches a pond a lying body sinks into', () => {
    const pond: MapBox = { x: 0, z: 0, w: 3, h: 0.24, d: 3, color: '#52c4de', solid: false };
    expect(coverSpots(room(pond))[0]!.stance).toBe('flat');
  });

  it('lets a thin decoration or a solid one be', () => {
    expect(coverSpots(room(curtain(0.05, false)))).toEqual([]);
    expect(coverSpots(room(curtain(0.36, true)))).toEqual([]);
    expect(coverSpots(room({ x: 0, z: 0, w: 6, h: 0.04, d: 6, color: '#52677a', solid: false }))).toEqual([]);
  });

  it('works on scaled maps too', () => {
    expect(coverSpots(scaleMap(room(curtain(0.12, false)), 3)).length).toBeGreaterThan(0);
  });
});
