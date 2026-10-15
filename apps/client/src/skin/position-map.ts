import { CHARACTER_PARTS, partIndex, restCenter } from './character-parts';
import { facePoint, type SkinAtlas } from './atlas';
import { roundBoxPoint } from './rounded-box';

/**
 * Карта позиций: для каждого текселя атласа — точка на теле, которой он соответствует.
 *   rgb = координаты точки в ПОЗЕ ПОКОЯ, в системе модели (метры, y = 0 — земля),
 *   a   = номер части + 1 (0 — пустой тексель между гранями).
 *
 * Зачем: кисть красит «в 3D» — все тексели, чьи точки на теле ближе радиуса кисти
 * к точке касания. Мазок через ребро (с груди на бок) или через сустав (с бедра на голень)
 * не оборвётся, хотя на выкройке эти места лежат далеко друг от друга.
 * Поза покоя одна на всех — поэтому как бы персонаж ни стоял, точка кожи всегда одна и та же.
 *
 * Порядок строк — как у текстуры в WebGL: строка 0 — низ атласа (v ≈ 0).
 * Тогда массив можно сразу отдать в DataTexture.
 */
export interface PositionMap {
  size: number;
  data: Float32Array;
  /**
   * Нормаль поверхности (со скруглением) под текселем, упакованная в байты: n * 127.5 + 127.5 (−1..1 → 0..255).
   * Кисть красит только грани, смотрящие примерно туда же, куда грань под пальцем, —
   * иначе мазок по тонкой руке прокрасил бы её насквозь, вместе с обратной стороной.
   */
  normals: Uint8Array;
}

export function buildPositionMap(atlas: SkinAtlas): PositionMap {
  const { size: mapSize, padding } = atlas;
  const data = new Float32Array(mapSize * mapSize * 4);
  const normals = new Uint8Array(mapSize * mapSize * 4);

  for (const r of atlas.rects) {
    const number = partIndex(r.part) + 1;
    const { size, radius, caps } = CHARACTER_PARTS[r.part];
    const origin = restCenter(r.part);
    // Проходим и по отступу: там «размазан» край грани (u, v зажаты в [0, 1]),
    // поэтому кисть у самого ребра закрасит и отступ — шва при фильтрации не будет.
    for (let ty = r.y - padding; ty < r.y + r.h + padding; ty++) {
      for (let tx = r.x - padding; tx < r.x + r.w + padding; tx++) {
        if (tx < 0 || ty < 0 || tx >= mapSize || ty >= mapSize) continue;
        const u = clamp01((tx + 0.5 - r.x) / r.w);
        const v = 1 - clamp01((ty + 0.5 - r.y) / r.h); // на атласе y вниз, в UV v вверх
        const { point: p, normal: n } = roundBoxPoint(facePoint(size, r.face, u, v), size, radius, caps, r.face === 'py' || r.face === 'ny');
        const row = mapSize - 1 - ty; // строка WebGL-текстуры: 0 — низ
        const i = (row * mapSize + tx) * 4;
        data[i] = origin.x + p.x;
        data[i + 1] = origin.y + p.y;
        data[i + 2] = origin.z + p.z;
        data[i + 3] = number;
        normals[i] = n.x * 127.5 + 127.5;
        normals[i + 1] = n.y * 127.5 + 127.5;
        normals[i + 2] = n.z * 127.5 + 127.5;
        normals[i + 3] = 255;
      }
    }
  }
  return { size: mapSize, data, normals };
}

/** Значение карты в точке UV (ближайший тексель). Для тестов и отладки. */
export function samplePositionMap(map: PositionMap, u: number, v: number) {
  const col = Math.min(map.size - 1, Math.max(0, Math.floor(u * map.size)));
  const row = Math.min(map.size - 1, Math.max(0, Math.floor(v * map.size)));
  const i = (row * map.size + col) * 4;
  // + 0 превращает -0 в 0: ноль упакован в байт 127, при обратном пересчёте выходит −0.004.
  const n = (k: number) => Math.round(((map.normals[i + k] - 127.5) / 127.5) * 100) / 100 + 0;
  return {
    x: map.data[i],
    y: map.data[i + 1],
    z: map.data[i + 2],
    part: map.data[i + 3],
    normal: { x: n(0), y: n(1), z: n(2) },
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
