import { describe, expect, it } from 'vitest';
import { boxToAabb, buildColliders, mapBoxes, type MapDef } from '../../src/world/map.js';
import { PROP_IDS, placeProp, type PropPlacement } from '../../src/world/props/index.js';
import { PLAYER } from '../../src/physics.js';
import { POSE_RULES } from '../../src/poses.js';

/** Габариты набора блоков (вид сверху). */
function footprint(placement: PropPlacement) {
  const boxes = placeProp(placement).map(boxToAabb);
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minZ: Math.min(...boxes.map((b) => b.minZ)),
    maxZ: Math.max(...boxes.map((b) => b.maxZ)),
  };
}

describe('props', () => {
  /** Украшения на стену: только вид, столкновений у них нет намеренно (у окна твёрдые только шторы). */
  const WALL_DECOR = new Set(['mirror', 'painting', 'ceilingLamp']);

  it.each(PROP_IDS)('%s is built from the floor up and is solid where it should be', (prop) => {
    const boxes = placeProp({ prop, x: 0, z: 0 });
    expect(boxes.length).toBeGreaterThan(0);
    expect(Math.min(...boxes.map((b) => b.y ?? 0))).toBeCloseTo(0, 6);
    expect(boxes.some((b) => b.solid !== false)).toBe(!WALL_DECOR.has(prop));
  });

  it.each(PROP_IDS)('%s has sane sizes (no negative or giant parts)', (prop) => {
    for (const b of placeProp({ prop, x: 0, z: 0 })) {
      expect(Math.min(b.w, b.h, b.d), prop).toBeGreaterThan(0);
      expect(Math.max(b.w, b.h, b.d), prop).toBeLessThanOrEqual(3);
    }
  });

  it('a bed leaves room underneath to hide lying flat', () => {
    const solids = placeProp({ prop: 'bed', x: 0, z: 0 }).filter((b) => b.solid !== false && b.w > 0.3 && b.d > 0.3);
    const underside = Math.min(...solids.map((b) => b.y ?? 0));
    expect(underside).toBeGreaterThan(POSE_RULES.flat.height);
  });

  it('a bathtub is hollow and wider inside than a player', () => {
    const parts = placeProp({ prop: 'bathtub', x: 0, z: 0 }).filter((b) => b.solid !== false);
    const walls = parts.filter((b) => b.h > 0.3);
    const front = Math.min(...walls.filter((b) => b.w > 1).map((b) => b.z));
    const back = Math.max(...walls.filter((b) => b.w > 1).map((b) => b.z));
    const rim = walls[0].d;
    expect(back - front - rim).toBeGreaterThan(2 * PLAYER.radius);
  });

  it('rotating by 90° swaps the footprint: a sofa along X becomes a sofa along Z', () => {
    const along = footprint({ prop: 'sofa', x: 0, z: 0, length: 3 });
    const turned = footprint({ prop: 'sofa', x: 0, z: 0, length: 3, rot: 90 });
    expect(along.maxX - along.minX).toBeCloseTo(3, 6);
    expect(turned.maxZ - turned.minZ).toBeCloseTo(3, 6);
    expect(turned.maxX - turned.minX).toBeCloseTo(along.maxZ - along.minZ, 6);
  });

  it('rot 180 puts the back of the sofa on the other side', () => {
    // Спинка — второй блок; без поворота она сзади (−Z), после 180° — спереди (+Z).
    expect(placeProp({ prop: 'sofa', x: 0, z: 0 })[1].z).toBeLessThan(0);
    expect(placeProp({ prop: 'sofa', x: 0, z: 0, rot: 180 })[1].z).toBeGreaterThan(0);
  });

  it('book colors are "random" but the same for every player', () => {
    const a = placeProp({ prop: 'bookshelf', x: 2, z: 3 }).map((b) => b.color);
    const b = placeProp({ prop: 'bookshelf', x: 2, z: 3 }).map((b) => b.color);
    const elsewhere = placeProp({ prop: 'bookshelf', x: -5, z: 3 }).map((b) => b.color);
    expect(a).toEqual(b);
    expect(a).not.toEqual(elsewhere);
  });

  it('only solid parts become colliders; visual-only and hidden parts behave as declared', () => {
    const map: MapDef = {
      id: 't',
      name: 't',
      width: 10,
      depth: 10,
      floorColor: '#fff',
      boxes: [],
      props: [{ prop: 'bookshelf', x: 0, z: 0 }],
      spawns: [],
      seekerSpawns: [],
    };
    const all = mapBoxes(map);
    const books = all.filter((b) => b.solid === false);
    expect(books.length).toBeGreaterThan(20); // книги и полки — только для вида
    // Для физики шкаф — одна скрытая коробка, а не сотня книг-ступенек.
    expect(buildColliders(map)).toHaveLength(1);
    expect(all.find((b) => b.hidden)?.solid).not.toBe(false);
  });
});
