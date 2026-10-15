import { describe, expect, it } from 'vitest';
import { boxToAabb, buildColliders, mapBoxes, type MapDef } from '../../src/world/map.js';
import { PROP_IDS, placeProp, type PropPlacement } from '../../src/world/props.js';

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
  it.each(PROP_IDS)('%s stands on the floor and has something solid', (prop) => {
    const boxes = placeProp({ prop, x: 0, z: 0 });
    expect(boxes.length).toBeGreaterThan(0);
    expect(Math.min(...boxes.map((b) => b.y ?? 0))).toBeCloseTo(0, 6);
    expect(boxes.some((b) => b.solid !== false)).toBe(true);
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
