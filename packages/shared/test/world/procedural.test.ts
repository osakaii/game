import { describe, expect, it } from 'vitest';
import type { MapBox } from '../../src/world/map.js';
import { PALETTE as P, dressSurfaces } from '../../src/world/procedural.js';
import { CASTLE } from '../../src/world/castle.js';
import { COURTYARD } from '../../src/world/courtyard.js';

const at = (color: string, extra: Partial<MapBox> = {}): MapBox => ({ x: 0, z: 0, w: 1, h: 1, d: 1, color, ...extra });

describe('dressSurfaces', () => {
  it('рисунок по цвету палитры: листва, трава, асфальт, дерево', () => {
    const boxes = dressSurfaces([at(P.leaf), at(P.grass), at(P.road), at(P.woodDark), at(P.coral)]);
    expect(boxes.map((b) => b.surface)).toEqual(['leaves', 'grass', 'asphalt', 'wood', undefined]);
  });

  it('свою поверхность, скрытые, светящиеся блоки и картины не трогает', () => {
    const boxes = dressSurfaces([
      at(P.leaf, { surface: 'fabric' }),
      at(P.leaf, { hidden: true }),
      at(P.leaf, { glow: true }),
      at(P.leaf, { art: 3 }),
    ]);
    expect(boxes.map((b) => b.surface)).toEqual(['fabric', undefined, undefined, undefined]);
  });
});

describe('текстуры карт', () => {
  it('замок: стены — камень, пол — с рисунком', () => {
    expect(CASTLE.boxes.filter((b) => b.surface === 'stone').length).toBeGreaterThan(4);
    expect(CASTLE.floorSurface).toBeDefined();
  });

  it('двор: кирпичные домики, черепица, газон', () => {
    const surfaces = new Set(COURTYARD.boxes.map((b) => b.surface));
    for (const s of ['brick', 'roof', 'leaves'] as const) expect(surfaces).toContain(s);
    expect(COURTYARD.floorSurface).toBe('grass');
  });
});
