import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAP_CHOICES, type MapBox, type MapDef } from '@mecha/shared';
import { MAPS } from '@mecha/shared/maps';
import { buildMapGroup } from '../../src/world/map-builder';

/** Карта из одного блока: сколько треугольников у блока (без пола — у него 2). */
function blockTriangles(box: MapBox): number {
  const map = { id: 't', name: 't', width: 10, depth: 10, floorColor: '#ffffff', boxes: [box], spawns: [], seekerSpawns: [] } as unknown as MapDef;
  let triangles = 0;
  buildMapGroup(map).group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.name !== 'floor') triangles += mesh.geometry.getAttribute('position').count / 3;
  });
  return triangles;
}

describe('buildMapGroup', () => {
  it('draws a thin decal (sign letter, floor stripe) as its two large faces only', () => {
    expect(blockTriangles({ x: 0, z: 0, w: 1, h: 0.5, d: 0.012, color: '#ff0000', shape: 'box' })).toBe(4);
    expect(blockTriangles({ x: 0, z: 0, w: 2, h: 0.03, d: 1, color: '#ff0000', shape: 'box' })).toBe(4);
  });

  it('keeps all six faces of an ordinary box', () => {
    expect(blockTriangles({ x: 0, z: 0, w: 1, h: 1, d: 1, color: '#ff0000', shape: 'box' })).toBe(12);
  });

  it('the decal faces point both ways along its thin axis, so it is seen from either side', () => {
    const map = { id: 't', name: 't', width: 10, depth: 10, floorColor: '#ffffff', boxes: [{ x: 0, z: 0, w: 1, h: 0.5, d: 0.012, color: '#ff0000', shape: 'box' }], spawns: [], seekerSpawns: [] } as unknown as MapDef;
    const normals: number[] = [];
    buildMapGroup(map).group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.name === 'floor') return;
      const n = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < n.count; i++) normals.push(Math.round(n.getZ(i)));
    });
    expect(new Set(normals)).toEqual(new Set([1, -1]));
  });
});

/**
 * Бюджет треугольников карты для телефона (без персонажей и эффектов). Самые тяжёлые — площадь
 * и школа, ~80 тыс. Новая карта тяжелее — сначала упростить её (наклейки, мелкие сферы), потом в список.
 */
const TRIANGLE_BUDGET = 85_000;

describe.each(MAP_CHOICES)('map %s', (id) => {
  it(`fits the phone budget of ${TRIANGLE_BUDGET} triangles in a handful of draw calls`, () => {
    let triangles = 0;
    let meshes = 0;
    buildMapGroup(MAPS[id]).group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      triangles += mesh.geometry.getAttribute('position').count / 3;
    });
    expect(triangles).toBeLessThan(TRIANGLE_BUDGET);
    // По сетке на поверхность (паркет, плитка, краска…) плюс свечение и картины — не по блоку.
    expect(meshes).toBeLessThanOrEqual(16);
  });
});
