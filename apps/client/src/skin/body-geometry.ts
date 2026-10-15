import * as THREE from 'three';
import { FACES, atlasUV, faceDims, faceNormal, facePoint, findRect, type SkinAtlas } from './atlas';
import { CHARACTER_PARTS, JOINT_LINKS, PART_ORDER, partIndex, restCenter, type Point3 } from './character-parts';
import { gridSteps, roundBoxPoint } from './rounded-box';

/**
 * Всё тело — одна геометрия для SkinnedMesh (один вызов отрисовки на персонажа вместо четырнадцати).
 *
 * Вершины лежат в позе покоя, в системе модели. Позиция вершины в геометрии — это сразу и «точка
 * покоя», в которой работает кисть.
 *
 * Привязка к костям мягкая: вдали от суставов вершина следует только своей кости, а у сустава —
 * смеси своей и соседней (линейное смешивание, linear blend skinning). Локоть и колено сгибаются
 * плавной дугой, а не ломаются, как у куклы на шарнирах. Первый индекс кости — всегда своя часть:
 * по нему кисть и хитбоксы узнают, чья это вершина.
 */

/** Ширина полосы смешивания вдоль кости (м): сгиб «растекается» на столько вверх и вниз от сустава. */
const BLEND_BAND = 0.05;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Веса костей для вершины части `part` в точке покоя r: своя кость + соседи по суставам.
 * t — «насколько точка уже за суставом, на стороне ребёнка».
 */
export function boneWeights(part: (typeof PART_ORDER)[number], r: Point3): { index: number; weight: number }[] {
  const own = partIndex(part);
  const others = new Map<number, number>();
  for (const link of JOINT_LINKS) {
    if (link.child !== part && link.parent !== part) continue;
    const intoChild = link.childBelow ? link.at.y - r.y : r.y - link.at.y;
    const t = smoothstep(-BLEND_BAND, BLEND_BAND, intoChild);
    // Ровно на суставе t = 0.5: оба торца получают одну и ту же смесь «пополам» и сходятся — шва нет.
    const weight = link.child === part ? 1 - t : t;
    const neighbour = partIndex(link.child === part ? link.parent : link.child);
    if (weight > 0.001) others.set(neighbour, (others.get(neighbour) ?? 0) + weight);
  }
  const sum = [...others.values()].reduce((a, b) => a + b, 0);
  // Сосед не может «перетянуть» больше половины, пока вершина на своей стороне сустава.
  const scale = sum > 0.5 ? 0.5 / sum : 1;
  const result = [{ index: own, weight: 1 - sum * scale }];
  for (const [index, weight] of [...others].sort((a, b) => b[1] - a[1]).slice(0, 3)) result.push({ index, weight: weight * scale });
  return result;
}

/** Геометрия всего тела: все части, их грани по атласу, веса костей у суставов. */
export function buildBodyGeometry(atlas: SkinAtlas): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  PART_ORDER.forEach((part, bone) => {
    const { size, radius, caps } = CHARACTER_PARTS[part];
    const origin = restCenter(part);
    for (const face of FACES) {
      const rect = findRect(atlas, part, face);
      const { width, height } = faceDims(size, face);
      const us = gridSteps(width, radius);
      const vs = gridSteps(height, radius);
      const first = positions.length / 3;

      for (const v of vs) {
        for (const u of us) {
          const { point, normal } = roundBoxPoint(facePoint(size, face, u, v), size, radius, caps, face === 'py' || face === 'ny');
          const rest = { x: origin.x + point.x, y: origin.y + point.y, z: origin.z + point.z };
          positions.push(rest.x, rest.y, rest.z);
          normals.push(normal.x, normal.y, normal.z);
          const uv = atlasUV(atlas, rect, u, v);
          uvs.push(uv.u, uv.v);
          const weights = boneWeights(part, rest);
          for (let k = 0; k < 4; k++) {
            skinIndices.push(weights[k]?.index ?? bone);
            skinWeights.push(weights[k]?.weight ?? 0);
          }
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
