import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER } from '@mecha/shared';
import { PlayerModel } from '../../src/player/player-model';

/** Габариты тела по настоящим (позированным) вершинам — сравниваем с хитбоксом физики. */
function boundsOf(model: PlayerModel): THREE.Box3 {
  model.root.updateMatrixWorld(true);
  return new THREE.Box3().expandByObject(model.mesh, true);
}

function settle(model: PlayerModel, crouching: boolean, grounded = true) {
  for (let i = 0; i < 180; i++) {
    model.setCrouch(crouching);
    model.animate(1 / 60, 0, grounded);
  }
}

describe('PlayerModel', () => {
  it('stands as tall as the physics capsule, feet on the ground', () => {
    const model = new PlayerModel();
    settle(model, false);
    const box = boundsOf(model);
    expect(box.max.y).toBeCloseTo(PLAYER.height, 1);
    expect(box.min.y).toBeCloseTo(0, 1);
  });

  it('crouched pose fits the crouch hitbox: visual matches what can be hit', () => {
    const model = new PlayerModel();
    settle(model, true);
    const box = boundsOf(model);
    expect(box.max.y).toBeLessThanOrEqual(PLAYER.crouchHeight + 0.05);
    expect(box.max.y).toBeGreaterThan(PLAYER.crouchHeight - 0.15);
    // Стопы на полу, а не в воздухе и не под полом.
    expect(box.min.y).toBeGreaterThan(-0.03);
    expect(box.min.y).toBeLessThan(0.03);
    // И не вылезает далеко за цилиндр физики.
    expect(Math.max(box.max.z, -box.min.z)).toBeLessThan(PLAYER.radius + 0.25);
  });

  it('is one draw call: a single skinned mesh with a bone per body part', () => {
    const model = new PlayerModel();
    expect(model.mesh.skeleton.bones).toHaveLength(14);
  });
});
