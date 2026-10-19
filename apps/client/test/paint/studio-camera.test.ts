import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { StudioCamera } from '../../src/paint/studio-camera';

/** Стена-коробка: центр (x, z), размеры w×d, высота 3 м. */
function wall(x: number, z: number, w: number, d: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d));
  mesh.position.set(x, 1.5, z);
  mesh.updateMatrixWorld();
  return mesh;
}

function setup(obstacles: THREE.Object3D[] = []) {
  const camera = new THREE.PerspectiveCamera(60, 740 / 340, 0.1, 100);
  const studio = new StudioCamera(camera, { obstacles } as never);
  const target = new THREE.Vector3(3, 0, -2);
  /** Где на экране центр корпуса: x в NDC (−1 — левый край, +1 — правый). */
  const screenX = () => {
    camera.updateMatrixWorld();
    return new THREE.Vector3(target.x, target.y + 0.85, target.z).project(camera).x;
  };
  return { studio, target, screenX, camera };
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

  it('opens in front of the character when there is room', () => {
    const { studio, target } = setup();
    studio.frameOpen(0.7, target);
    expect(studio.yaw).toBeCloseTo(0.7);
  });

  it('facing a wall, opens on the free side instead of squeezing between the face and the wall', () => {
    // Персонаж в (3, −2) смотрит на +Z (yaw 0), стена в 0.8 м перед лицом.
    const { studio, target, camera } = setup([wall(3, -1.1, 6, 0.2)]);
    studio.frameOpen(0, target);
    studio.update(target);
    const distance = camera.position.distanceTo(new THREE.Vector3(target.x, target.y + 0.85, target.z));
    expect(distance).toBeGreaterThan(2);
    // Первое свободное направление, ближайшее к переду, — сбоку, а не прямо за спиной.
    expect(Math.abs(studio.yaw)).toBeGreaterThan(0.3);
    expect(Math.abs(studio.yaw)).toBeLessThan(Math.PI);
  });

  it('boxed in on every side, picks the roomiest direction', () => {
    // Узкий коридор вдоль X: стены в 0.5 м спереди и сзади, по бокам — подальше (1.2 м).
    const { studio, target } = setup([wall(3, -1.5, 8, 0.2), wall(3, -2.5, 8, 0.2), wall(4.2, -2, 0.2, 4), wall(1.8, -2, 0.2, 4)]);
    studio.frameOpen(0, target);
    // Вдоль коридора (±90°) места больше всего.
    expect(Math.abs(Math.sin(studio.yaw))).toBeGreaterThan(0.9);
  });
});
