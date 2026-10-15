import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Eyedropper } from '../../src/painting/eyedropper';
import { buildMapGroup } from '../../src/world/map-builder';
import { surfaceColor, surfaceTexture } from '../../src/world/surfaces';

/** Raycaster — чистая математика, WebGL не нужен. Вместо canvas — объект с размерами. */
const fakeCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }) } as HTMLCanvasElement;

function setup() {
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#e63946' }));
  box.updateMatrixWorld();
  return new Eyedropper(camera, fakeCanvas, { obstacles: [box] });
}

describe('Eyedropper', () => {
  it('returns the sRGB hex of the material under the screen point', () => {
    expect(setup().pick(100, 50)).toBe('#e63946');
  });

  it('returns null when nothing is hit', () => {
    expect(setup().pick(2, 2)).toBeNull();
  });

  it('on a patterned surface returns the pattern color exactly where the ray hit', () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const surface = surfaceTexture('stripes')!;
    const material = new THREE.MeshLambertMaterial({ color: '#4f9d69', map: surface.texture });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), material);
    wall.updateMatrixWorld();
    const eyedropper = new Eyedropper(camera, fakeCanvas, { obstacles: [wall] });
    // Центр экрана — центр плоскости, UV (0.5, 0.5).
    const expected = `#${surfaceColor(surface, 0.5, 0.5, material.color).getHexString()}`;
    expect(eyedropper.pick(100, 50)).toBe(expected);
  });

  it('on a merged map picks the color of the block under the ray, not of the shared material', () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
    camera.position.set(0, 1, 5);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    // Два блока разного цвета на одной поверхности склеятся в одну сетку с белым материалом.
    const { obstacles } = buildMapGroup({
      id: 't',
      name: 't',
      width: 10,
      depth: 10,
      floorColor: '#ffffff',
      boxes: [
        { x: 0, z: 0, w: 1, h: 2, d: 1, color: '#e63946' },
        { x: 3, z: 0, w: 1, h: 2, d: 1, color: '#2a9d8f' },
      ],
      spawns: [],
      seekerSpawns: [],
    });
    const eyedropper = new Eyedropper(camera, fakeCanvas, { obstacles });
    expect(eyedropper.pick(100, 50)).toBe('#e63946');
  });
});
