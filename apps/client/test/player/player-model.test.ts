import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER, POSES, POSE_RULES } from '@mecha/shared';
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

  // Высота позы в shared — это и потолок для физики, и хитбокс для выстрела. Модель обязана в неё влезать,
  // иначе ищущий видит руку, торчащую из-под кровати, а попасть по ней не может.
  it.each(POSES)('pose "%s" fits its height and rests on the floor', (pose) => {
    const model = new PlayerModel();
    model.setPose(pose);
    settle(model, false);
    const box = boundsOf(model);
    expect(box.max.y).toBeLessThanOrEqual(POSE_RULES[pose].height + 0.05);
    expect(box.min.y).toBeGreaterThan(-0.04);
    expect(box.min.y).toBeLessThan(0.04);
  });

  it('crawling moves the limbs, a still pose keeps them (almost) still', () => {
    const limbs = (model: PlayerModel) => model.bones.upperArmLeft.rotation.toArray().slice(0, 3) as number[];
    const crawling = new PlayerModel();
    crawling.setPose('crawl');
    settle(crawling, false);
    const before = limbs(crawling);
    for (let i = 0; i < 20; i++) crawling.animate(1 / 60, 0.3, true);
    const after = limbs(crawling);
    expect(Math.abs(after[0] - before[0])).toBeGreaterThan(0.05);
  });

  it('is one draw call: a single skinned mesh with a bone per body part', () => {
    const model = new PlayerModel();
    expect(model.mesh.skeleton.bones).toHaveLength(14);
  });
});
