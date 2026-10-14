import { CHARACTER_PARTS, PART_ORDER } from './character-parts';
import { facePoint, type SkinAtlas } from './atlas';

/**
 * Карта позиций: для каждого текселя атласа — точка на теле, которой он соответствует.
 *   rgb = координаты точки в системе своей части тела (центр коробки = 0, метры),
 *   a   = номер части + 1 (0 — пустой тексель между гранями).
 *
 * Зачем: кисть будет красить «в 3D» — все тексели, чьи точки на теле ближе радиуса кисти
 * к точке касания. Мазок через ребро коробки (с груди на бок) не оборвётся, хотя на выкройке
 * грудь и бок лежат в разных местах.
 *
 * Порядок строк — как у текстуры в WebGL: строка 0 — низ атласа (v ≈ 0).
 * Тогда массив можно сразу отдать в DataTexture.
 */
export interface PositionMap {
  size: number;
  data: Float32Array;
}

export function buildPositionMap(atlas: SkinAtlas): PositionMap {
  const { size, padding } = atlas;
  const data = new Float32Array(size * size * 4);

  for (const r of atlas.rects) {
    const partIndex = PART_ORDER.indexOf(r.part) + 1;
    const partSize = CHARACTER_PARTS[r.part];
    // Проходим и по отступу: там «размазан» край грани (u, v зажаты в [0, 1]),
    // поэтому кисть у самого ребра закрасит и отступ — шва при фильтрации не будет.
    for (let ty = r.y - padding; ty < r.y + r.h + padding; ty++) {
      for (let tx = r.x - padding; tx < r.x + r.w + padding; tx++) {
        if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
        const u = clamp01((tx + 0.5 - r.x) / r.w);
        const v = 1 - clamp01((ty + 0.5 - r.y) / r.h); // на атласе y вниз, в UV v вверх
        const p = facePoint(partSize, r.face, u, v);
        const row = size - 1 - ty; // строка WebGL-текстуры: 0 — низ
        const i = (row * size + tx) * 4;
        data[i] = p.x;
        data[i + 1] = p.y;
        data[i + 2] = p.z;
        data[i + 3] = partIndex;
      }
    }
  }
  return { size, data };
}

/** Значение карты в точке UV (ближайший тексель). Для тестов и отладки. */
export function samplePositionMap(map: PositionMap, u: number, v: number) {
  const col = Math.min(map.size - 1, Math.max(0, Math.floor(u * map.size)));
  const row = Math.min(map.size - 1, Math.max(0, Math.floor(v * map.size)));
  const i = (row * map.size + col) * 4;
  return { x: map.data[i], y: map.data[i + 1], z: map.data[i + 2], part: map.data[i + 3] };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
