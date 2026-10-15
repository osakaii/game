import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BODY_HITBOXES, POSES, type LocalBox, type StanceKey } from '@mecha/shared';
import { PlayerModel } from '../../src/player/player-model';
import { PART_ORDER } from '../../src/skin/character-parts';

const STANCES: StanceKey[] = ['stand', 'crouch', ...POSES];

/**
 * Коробки частей тела по настоящим вершинам модели в каждой позе.
 * Ось каждой коробки — оси игрока, поэтому повёрнутая часть (рука вверх наискосок) даёт коробку
 * чуть больше себя; это нормально — палец на телефоне тоже не точен.
 */
function measure(stance: StanceKey): LocalBox[] {
  const model = new PlayerModel();
  model.holdStance(stance);
  model.root.updateMatrixWorld(true);
  const mesh = model.mesh;
  const position = mesh.geometry.getAttribute('position');
  const bone = mesh.geometry.getAttribute('skinIndex');
  const boxes = PART_ORDER.map(() => new THREE.Box3());
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    mesh.getVertexPosition(i, v);
    boxes[bone.getX(i)].expandByPoint(v);
  }
  // До сантиметра наружу: коробка не должна стать меньше тела из-за округления.
  const down = (x: number) => Math.floor(x * 100) / 100 + 0;
  const up = (x: number) => Math.ceil(x * 100) / 100 + 0;
  return boxes.map((b) => [down(b.min.x), down(b.min.y), down(b.min.z), up(b.max.x), up(b.max.y), up(b.max.z)] as const);
}

function source(): string {
  const body = STANCES.map((stance) => {
    const rows = measure(stance).map((b) => `    [${b.join(', ')}],`);
    return `  ${stance}: [\n${rows.join('\n')}\n  ],`;
  }).join('\n');
  return `// Сгенерировано тестом apps/client/test/player/pose-hitboxes.test.ts по модели персонажа — не править руками.
// Поменял позу или форму тела → \`pnpm hitboxes\`.
import type { StanceKey } from './poses.js';

/** Коробка части тела в системе игрока: [minX, minY, minZ, maxX, maxY, maxZ], м. */
export type LocalBox = readonly [number, number, number, number, number, number];

/**
 * Коробки частей тела для каждого положения, в системе игрока: x — вправо, y — вверх, z — вперёд
 * (куда смотрит персонаж), начало координат — точка под ногами.
 */
export const BODY_HITBOXES: Record<StanceKey, readonly LocalBox[]> = {
${body}
};
`;
}

describe('pose hitboxes', () => {
  // Сервер считает попадания по BODY_HITBOXES, а игроки видят модель. Если они разошлись —
  // ищущий попадает «в воздух» или промахивается по видимой руке. Этот тест не даёт им разойтись:
  // `pnpm hitboxes` (vitest -u) перезаписывает файл по модели.
  it('shared hitbox data matches the character model', async () => {
    await expect(source()).toMatchFileSnapshot('../../../../packages/shared/src/pose-hitboxes.ts');
  });

  it('has a box for every body part in every stance', () => {
    for (const stance of STANCES) expect(BODY_HITBOXES[stance]).toHaveLength(PART_ORDER.length);
  });
});
