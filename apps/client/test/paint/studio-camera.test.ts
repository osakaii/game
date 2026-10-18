import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { StudioCamera } from '../../src/paint/studio-camera';

function setup() {
  const camera = new THREE.PerspectiveCamera(60, 740 / 340, 0.1, 100);
  const studio = new StudioCamera(camera, { obstacles: [] } as never);
  const target = new THREE.Vector3(3, 0, -2);
  /** Где на экране центр корпуса: x в NDC (−1 — левый край, +1 — правый). */
  const screenX = () => {
    camera.updateMatrixWorld();
    return new THREE.Vector3(target.x, target.y + 0.85, target.z).project(camera).x;
  };
  return { studio, target, screenX };
}

describe('StudioCamera', () => {
  it('keeps the character centered by default', () => {
    const { studio, target, screenX } = setup();
    studio.frameFront(0.7);
    studio.update(target);
    expect(screenX()).toBeCloseTo(0, 5);
  });

  it('screenShift moves the character by that share of the screen width, from any angle', () => {
    const { studio, target, screenX } = setup();
    for (const yaw of [0, 1.2, -2.5]) {
      studio.frameFront(yaw);
      studio.orbit(0, 0.4);
      studio.screenShift = -0.08;
      studio.update(target);
      // NDC от −1 до 1 — вдвое шире доли экрана.
      expect(screenX()).toBeCloseTo(-0.16, 4);
    }
  });
});
