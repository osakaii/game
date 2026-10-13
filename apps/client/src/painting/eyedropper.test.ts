import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Eyedropper } from './eyedropper';

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
});
