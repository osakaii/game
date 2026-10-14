import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHARACTER_PARTS, PART_ORDER } from './character-parts';
import { FACES, applyAtlasUVs, buildAtlas, findRect } from './atlas';
import { buildPositionMap, samplePositionMap } from './position-map';

const atlas = buildAtlas(512, 4);

describe('skin atlas', () => {
  it('contains every face of every part exactly once', () => {
    expect(atlas.rects).toHaveLength(PART_ORDER.length * FACES.length);
  });

  it('keeps every face (with padding) inside the texture, without overlaps', () => {
    const p = atlas.padding;
    for (const a of atlas.rects) {
      expect(a.x - p).toBeGreaterThanOrEqual(0);
      expect(a.y - p).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w + p).toBeLessThanOrEqual(atlas.size);
      expect(a.y + a.h + p).toBeLessThanOrEqual(atlas.size);
      for (const b of atlas.rects) {
        if (a === b) continue;
        const apart =
          a.x + a.w + p <= b.x - p || b.x + b.w + p <= a.x - p || a.y + a.h + p <= b.y - p || b.y + b.h + p <= a.y - p;
        expect(apart, `${a.part}.${a.face} overlaps ${b.part}.${b.face}`).toBe(true);
      }
    }
  });

  it('uses the same texel density on all faces (no stretching)', () => {
    const torsoFront = findRect(atlas, 'torso', 'pz');
    expect(torsoFront.w / CHARACTER_PARTS.torso.w).toBeCloseTo(atlas.density, -1);
    const legSide = findRect(atlas, 'legLeft', 'px');
    expect(legSide.h / CHARACTER_PARTS.legLeft.h).toBeCloseTo(atlas.density, -1);
    // ~2 текселя на сантиметр: достаточно для мазков кисти на 512².
    expect(atlas.density).toBeGreaterThan(150);
  });

  it('is deterministic — every player builds the same atlas', () => {
    expect(buildAtlas(512, 4)).toEqual(atlas);
  });
});

describe('position map', () => {
  const map = buildPositionMap(atlas);

  /**
   * Главная проверка: карта позиций совпадает с настоящей геометрией three.js.
   * Берём каждую вершину коробки с UV атласа, сдвигаемся на пару текселей внутрь грани
   * и читаем карту — должна получиться почти та же точка на теле.
   */
  it.each(PART_ORDER)('matches BoxGeometry vertices for %s', (part) => {
    const size = CHARACTER_PARTS[part];
    const geometry = new THREE.BoxGeometry(size.w, size.h, size.d);
    applyAtlasUVs(geometry, part, atlas);
    const pos = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const normal = geometry.getAttribute('normal');
    const texel = 1 / atlas.size;

    for (let face = 0; face < 6; face++) {
      // Центр грани в UV — среднее четырёх её вершин.
      let cu = 0;
      let cv = 0;
      for (let k = 0; k < 4; k++) {
        cu += uv.getX(face * 4 + k) / 4;
        cv += uv.getY(face * 4 + k) / 4;
      }
      for (let k = 0; k < 4; k++) {
        const i = face * 4 + k;
        const u = uv.getX(i) + Math.sign(cu - uv.getX(i)) * 2 * texel;
        const v = uv.getY(i) + Math.sign(cv - uv.getY(i)) * 2 * texel;
        const sample = samplePositionMap(map, u, v);
        expect(sample.part).toBe(PART_ORDER.indexOf(part) + 1);
        const distance = Math.hypot(sample.x - pos.getX(i), sample.y - pos.getY(i), sample.z - pos.getZ(i));
        expect(distance, `${part} face ${FACES[face]} vertex ${k}`).toBeLessThan(0.03);
        // Нормаль из карты совпадает с нормалью вершины в геометрии three.js.
        expect(sample.normal).toEqual({
          x: normal.getX(i) + 0,
          y: normal.getY(i) + 0,
          z: normal.getZ(i) + 0,
        });
      }
    }
  });

  it('side faces have "up on the texture" = "up in the world" (needed for paint drips)', () => {
    const r = findRect(atlas, 'torso', 'pz');
    const top = samplePositionMap(map, (r.x + r.w / 2) / atlas.size, 1 - (r.y + 2) / atlas.size);
    const bottom = samplePositionMap(map, (r.x + r.w / 2) / atlas.size, 1 - (r.y + r.h - 2) / atlas.size);
    expect(top.y).toBeGreaterThan(bottom.y);
  });

  it('leaves texels between faces empty', () => {
    expect(samplePositionMap(map, 0.999, 0.001).part).toBe(0);
  });
});
