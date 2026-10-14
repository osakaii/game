import { describe, expect, it } from 'vitest';
import { CHARACTER_PARTS, PART_ORDER } from '../../src/skin/character-parts';
import { FACES, buildAtlas, findRect } from '../../src/skin/atlas';
import { buildBodyGeometry } from '../../src/skin/body-geometry';
import { buildPositionMap, samplePositionMap } from '../../src/skin/position-map';

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
    expect(torsoFront.w / CHARACTER_PARTS.torso.size.w).toBeCloseTo(atlas.density, -1);
    const legSide = findRect(atlas, 'thighLeft', 'px');
    expect(legSide.h / CHARACTER_PARTS.thighLeft.size.h).toBeCloseTo(atlas.density, -1);
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
   * Главная проверка: карта позиций совпадает с настоящей геометрией тела.
   * Берём каждую вершину (поза покоя, со скруглением), сдвигаемся по UV на тексель к центру грани
   * и читаем карту — должна получиться почти та же точка и та же нормаль.
   */
  it('matches every vertex of the body geometry (rest pose, rounded)', () => {
    const geometry = buildBodyGeometry(atlas);
    const pos = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const normal = geometry.getAttribute('normal');
    const bone = geometry.getAttribute('skinIndex');
    const texel = 1 / atlas.size;
    const centers = new Map(atlas.rects.map((r) => [r, { u: (r.x + r.w / 2) / atlas.size, v: 1 - (r.y + r.h / 2) / atlas.size }]));

    for (let i = 0; i < pos.count; i++) {
      const part = PART_ORDER[bone.getX(i)];
      // Грань вершины — та, в чей прямоугольник на атласе попадает её UV.
      const rect = atlas.rects.find(
        (r) =>
          r.part === part &&
          uv.getX(i) * atlas.size >= r.x - 0.01 &&
          uv.getX(i) * atlas.size <= r.x + r.w + 0.01 &&
          (1 - uv.getY(i)) * atlas.size >= r.y - 0.01 &&
          (1 - uv.getY(i)) * atlas.size <= r.y + r.h + 0.01,
      )!;
      const c = centers.get(rect)!;
      const u = uv.getX(i) + Math.sign(c.u - uv.getX(i)) * texel;
      const v = uv.getY(i) + Math.sign(c.v - uv.getY(i)) * texel;
      const sample = samplePositionMap(map, u, v);
      expect(sample.part).toBe(bone.getX(i) + 1);
      const distance = Math.hypot(sample.x - pos.getX(i), sample.y - pos.getY(i), sample.z - pos.getZ(i));
      expect(distance, `${part}.${rect.face} vertex ${i}`).toBeLessThan(0.02);
      const dot = sample.normal.x * normal.getX(i) + sample.normal.y * normal.getY(i) + sample.normal.z * normal.getZ(i);
      expect(dot).toBeGreaterThan(0.9);
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
