import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bevelBoxGeometry } from '../../src/world/bevel-box';

const triangles = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;

describe('bevelBoxGeometry', () => {
  it('is far cheaper than RoundedBoxGeometry: 44 triangles with one arc step, 92 with two', () => {
    expect(triangles(bevelBoxGeometry(2, 1, 3, 0.1, 1))).toBe(44);
    expect(triangles(bevelBoxGeometry(2, 1, 3, 0.4, 2))).toBe(92);
  });

  it('fills exactly its w × h × d box', () => {
    const g = bevelBoxGeometry(2, 1, 3, 0.2, 2);
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2);
    expect(size.y).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(3);
  });

  it('every triangle faces outwards, and normals are unit and point away from the centre', () => {
    const g = bevelBoxGeometry(1.5, 0.6, 0.9, 0.25, 2);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      face.subVectors(b, a).cross(c.clone().sub(a));
      // Выпуклое тело с центром в нуле: наружная грань смотрит от центра.
      expect(face.dot(a.clone().add(b).add(c))).toBeGreaterThan(0);
    }
    for (let i = 0; i < n.count; i++) {
      const normal = new THREE.Vector3().fromBufferAttribute(n, i);
      expect(normal.length()).toBeCloseTo(1);
      expect(normal.dot(new THREE.Vector3().fromBufferAttribute(p, i))).toBeGreaterThan(0);
    }
  });

  it('a radius larger than the box is clamped — a thin slab stays a slab', () => {
    const g = bevelBoxGeometry(1, 0.1, 1, 0.5, 1);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(0.05);
  });
});
