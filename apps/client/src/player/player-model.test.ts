import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER } from '@mecha/shared';
import { PlayerModel } from './player-model';

/** Габариты модели в мировых координатах — сравниваем с хитбоксом физики. */
function heightOf(model: PlayerModel): number {
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const zone of Object.values(model.zones)) box.expandByObject(zone);
  return box.max.y;
}

describe('PlayerModel', () => {
  it('stands as tall as the physics capsule', () => {
    expect(heightOf(new PlayerModel())).toBeCloseTo(PLAYER.height, 1);
  });

  it('crouched pose fits the crouch hitbox: visual matches what can be hit', () => {
    const model = new PlayerModel();
    for (let i = 0; i < 120; i++) {
      model.setCrouch(true, 1 / 60);
      model.animate(1 / 60, 0, true);
    }
    expect(heightOf(model)).toBeLessThanOrEqual(PLAYER.crouchHeight + 0.05);
    expect(heightOf(model)).toBeGreaterThan(PLAYER.crouchHeight - 0.15);
  });
});
