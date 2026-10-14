import * as THREE from 'three';
import { FACES, atlasUV, faceDims, faceNormal, facePoint, findRect, type SkinAtlas } from './atlas';
import { CHARACTER_PARTS, PART_ORDER, restCenter } from './character-parts';
import { gridSteps, roundBoxPoint } from './rounded-box';

/**
 * Всё тело — одна геометрия для SkinnedMesh (один вызов отрисовки на персонажа вместо четырнадцати).
 *
 * Вершины лежат в позе покоя, в системе модели. Каждая вершина жёстко привязана к кости своей части
 * (skinIndex = номер части, вес 1): кость повернулась — часть повернулась целиком, как у куклы на шарнирах.
 * Поэтому позиция вершины в геометрии — это сразу и «точка покоя», в которой работает кисть.
 */
export function buildBodyGeometry(atlas: SkinAtlas): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  PART_ORDER.forEach((part, bone) => {
    const { size, radius } = CHARACTER_PARTS[part];
    const origin = restCenter(part);
    for (const face of FACES) {
      const rect = findRect(atlas, part, face);
      const { width, height } = faceDims(size, face);
      const us = gridSteps(width, radius);
      const vs = gridSteps(height, radius);
      const first = positions.length / 3;

      for (const v of vs) {
        for (const u of us) {
          const { point, normal } = roundBoxPoint(facePoint(size, face, u, v), size, radius);
          positions.push(origin.x + point.x, origin.y + point.y, origin.z + point.z);
          normals.push(normal.x, normal.y, normal.z);
          const uv = atlasUV(atlas, rect, u, v);
          uvs.push(uv.u, uv.v);
          skinIndices.push(bone, 0, 0, 0);
          skinWeights.push(1, 0, 0, 0);
        }
      }

      // Обход треугольников: против часовой стрелки, если смотреть снаружи. Проверяем по плоской грани,
      // в какую сторону смотрит «u × v», и при необходимости меняем порядок.
      const n = faceNormal(face);
      const p00 = facePoint(size, face, 0, 0);
      const p10 = facePoint(size, face, 1, 0);
      const p01 = facePoint(size, face, 0, 1);
      const cross = new THREE.Vector3()
        .subVectors(new THREE.Vector3(p10.x, p10.y, p10.z), new THREE.Vector3(p00.x, p00.y, p00.z))
        .cross(new THREE.Vector3(p01.x - p00.x, p01.y - p00.y, p01.z - p00.z));
      const ccw = cross.x * n.x + cross.y * n.y + cross.z * n.z > 0;

      const row = us.length;
      for (let j = 0; j < vs.length - 1; j++) {
        for (let i = 0; i < row - 1; i++) {
          const a = first + j * row + i;
          const b = a + 1;
          const c = a + row + 1;
          const d = a + row;
          if (ccw) indices.push(a, b, c, a, c, d);
          else indices.push(a, c, b, a, d, c);
        }
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  return geometry;
}
